import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { zValidator } from '@hono/zod-validator'

type Bindings = { DB: D1Database; ENVIRONMENT?: string }
type Variables = { user: User }
type User = { id: string; organization_id: string; name: string; email: string; role: string; scope_node_id: string | null }

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
const encoder = new TextEncoder()
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(v => v.toString(16).padStart(2, '0')).join('')
const sha256 = async (value: string) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 120000 }, key, 256))
}

app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') || crypto.randomUUID()
  c.header('x-request-id', requestId)
  c.header('x-content-type-options', 'nosniff')
  c.header('referrer-policy', 'strict-origin-when-cross-origin')
  c.header('cache-control', 'no-store')
  await next()
})

const adminRoles=new Set(['Super Administrator','Ministry Administrator','Zone Administrator'])
const adminOnly=async(c:any,next:any)=>{const user=c.get('user') as User;if(!adminRoles.has(user.role))return c.json({error:'Administrator permission required'},403);await next()}
const auth = async (c: any, next: any) => {
  const token = getCookie(c, 'nexus_session')
  if (!token) return c.json({ error: 'Authentication required' }, 401)
  const tokenHash = await sha256(token)
  const user = await c.env.DB.prepare(`SELECT u.id,u.organization_id,u.name,u.email,u.role,u.scope_node_id
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now') AND u.active=1`)
    .bind(tokenHash).first() as User | null
  if (!user) return c.json({ error: 'Session expired' }, 401)
  c.set('user', user)
  await next()
}

app.get('/api/health', c => c.json({ status: 'ok', service: 'cell-ministry-api' }))
app.post('/api/auth/login', zValidator('json', z.object({ email: z.email(), password: z.string().min(8).max(128) })), async c => {
  const { email, password } = c.req.valid('json')
  const record = await c.env.DB.prepare('SELECT * FROM users WHERE email=? AND active=1').bind(email.toLowerCase()).first<any>()
  if (!record || (await passwordHash(password, record.password_salt)) !== record.password_hash) {
    return c.json({ error: 'Email or password is incorrect' }, 401)
  }
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')"),
    c.env.DB.prepare("INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,datetime('now','+7 days'))")
      .bind(id('ses'), record.id, await sha256(token)),
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id) VALUES(?,?,?,?,?,?)')
      .bind(id('audit'), record.organization_id, record.id, 'SIGNED_IN', 'session', record.id),
  ])
  const isHttps=c.req.header('x-forwarded-proto')==='https'||new URL(c.req.url).protocol==='https:'||c.env.ENVIRONMENT==='production'
  setCookie(c, 'nexus_session', token, { httpOnly: true, sameSite: isHttps ? 'None' : 'Lax', secure: isHttps, path: '/', maxAge: 604800 })
  return c.json({ user: { id: record.id, name: record.name, email: record.email, role: record.role } })
})
app.post('/api/auth/logout', auth, async c => {
  const token = getCookie(c, 'nexus_session')
  if (token) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run()
  deleteCookie(c, 'nexus_session', { path: '/' })
  return c.json({ ok: true })
})
app.get('/api/auth/me', auth, c => c.json({ user: c.get('user') }))

app.get('/api/dashboard', auth, async c => {
  const user = c.get('user')
  const [cells, people, leaders, meetings, recent, activity] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) total FROM org_nodes WHERE organization_id=? AND node_type='cell' AND status='active'").bind(user.organization_id),
    c.env.DB.prepare('SELECT COUNT(*) total FROM people WHERE organization_id=?').bind(user.organization_id),
    c.env.DB.prepare("SELECT COUNT(*) total FROM people WHERE organization_id=? AND leadership_stage IN ('Cell Leader','Assistant Leader','Class Teacher')").bind(user.organization_id),
    c.env.DB.prepare("SELECT COUNT(*) meetings, COALESCE(SUM(attendance),0) attendance, COALESCE(SUM(first_timers),0) first_timers, COALESCE(SUM(new_converts),0) new_converts FROM meetings WHERE organization_id=? AND held_at >= date('now','-30 days')").bind(user.organization_id),
    c.env.DB.prepare(`SELECT m.id,m.meeting_type,m.held_at,m.attendance,m.first_timers,m.new_converts,m.status,n.name cell_name
      FROM meetings m JOIN org_nodes n ON n.id=m.cell_id WHERE m.organization_id=? ORDER BY m.held_at DESC LIMIT 6`).bind(user.organization_id),
    c.env.DB.prepare('SELECT action,entity_type,detail,created_at FROM audit_logs WHERE organization_id=? ORDER BY created_at DESC LIMIT 5').bind(user.organization_id),
  ])
  const cellMetric = cells.results[0] as { total: number } | undefined
  const peopleMetric = people.results[0] as { total: number } | undefined
  const leaderMetric = leaders.results[0] as { total: number } | undefined
  const meetingMetric = meetings.results[0] as Record<string, number> | undefined
  return c.json({ metrics: { cells: cellMetric?.total || 0, people: peopleMetric?.total || 0, leaders: leaderMetric?.total || 0, ...(meetingMetric || {}) }, recent: recent.results, activity: activity.results })
})
app.get('/api/cells', auth, async c => {
  const user = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT n.*,p.name parent_name,
    (SELECT COUNT(*) FROM people pe WHERE pe.cell_id=n.id) members,
    (SELECT full_name FROM people pe WHERE pe.cell_id=n.id AND pe.leadership_stage='Cell Leader' LIMIT 1) leader
    FROM org_nodes n LEFT JOIN org_nodes p ON p.id=n.parent_id WHERE n.organization_id=? AND n.node_type='cell' ORDER BY n.created_at,n.name`).bind(user.organization_id).all()
  return c.json({ cells: rows.results })
})
app.get('/api/leadership-genealogy',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare(`SELECT p.id,p.discipled_by_person_id parent_id,p.full_name name,p.leadership_stage code,p.status,n.name location,(SELECT COUNT(*) FROM people ch WHERE ch.discipled_by_person_id=p.id) members FROM people p LEFT JOIN org_nodes n ON n.id=p.cell_id WHERE p.organization_id=? AND (p.discipled_by_person_id IS NOT NULL OR EXISTS(SELECT 1 FROM people ch WHERE ch.discipled_by_person_id=p.id)) ORDER BY p.joined_at`).bind(u.organization_id).all();return c.json({nodes:rows.results})})
app.get('/api/genealogy', auth, async c => {
  const user = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT n.id,n.parent_id,n.name,n.code,n.status,
    (SELECT COUNT(*) FROM people p WHERE p.cell_id=n.id) members,
    (SELECT full_name FROM people p WHERE p.cell_id=n.id AND p.leadership_stage='Cell Leader' LIMIT 1) leader
    FROM org_nodes n WHERE n.organization_id=? AND n.node_type='cell' ORDER BY n.created_at`).bind(user.organization_id).all()
  return c.json({ nodes: rows.results })
})
const cellSchema = z.object({ name: z.string().trim().min(2).max(80), code: z.string().trim().min(2).max(16).regex(/^[A-Za-z0-9-]+$/), parent_id: z.string().min(1), location: z.string().trim().max(120).optional(), meeting_day: z.string().max(12).optional(), meeting_time: z.string().max(8).optional() })
app.post('/api/cells', auth, zValidator('json', cellSchema), async c => {
  const user = c.get('user'), input = c.req.valid('json'), cellId = id('cell')
  const parent = await c.env.DB.prepare('SELECT id FROM org_nodes WHERE id=? AND organization_id=?').bind(input.parent_id,user.organization_id).first()
  if (!parent) return c.json({ error: 'Parent cell is outside your organization' }, 400)
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO org_nodes(id,organization_id,parent_id,node_type,name,code,location,meeting_day,meeting_time) VALUES(?,?,?,'cell',?,?,?,?,?)`).bind(cellId,user.organization_id,input.parent_id,input.name,input.code.toUpperCase(),input.location||null,input.meeting_day||null,input.meeting_time||null),
      c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),user.organization_id,user.id,'CREATED','cell',cellId,input.name),
    ])
    return c.json({ id: cellId }, 201)
  } catch { return c.json({ error: 'That cell code is already in use' }, 409) }
})
app.get('/api/people', auth, async c => {
  const user=c.get('user'), query=(c.req.query('q')||'').trim()
  const like=`%${query}%`
  const rows=await c.env.DB.prepare(`SELECT p.*,n.name cell_name FROM people p LEFT JOIN org_nodes n ON n.id=p.cell_id WHERE p.organization_id=? AND (?='' OR p.full_name LIKE ? OR p.email LIKE ?) ORDER BY p.full_name LIMIT 100`).bind(user.organization_id,query,like,like).all()
  return c.json({ people: rows.results })
})
const personSchema=z.object({ full_name:z.string().trim().min(2).max(100),email:z.union([z.email(),z.literal('')]).optional(),phone:z.string().trim().max(30).optional(),cell_id:z.string().min(1),leadership_stage:z.enum(['Member','Potential Leader','Class Teacher','Assistant Leader','Cell Leader']) })
app.post('/api/people',auth,zValidator('json',personSchema),async c=>{
  const user=c.get('user'),input=c.req.valid('json'),personId=id('person')
  const cell=await c.env.DB.prepare("SELECT id FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(input.cell_id,user.organization_id).first()
  if(!cell)return c.json({error:'Select a valid cell'},400)
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO people(id,organization_id,cell_id,full_name,email,phone,leadership_stage,status) VALUES(?,?,?,?,?,?,?,?)').bind(personId,user.organization_id,input.cell_id,input.full_name,input.email||null,input.phone||null,input.leadership_stage,input.leadership_stage.includes('Leader')?'leader':'member'),
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),user.organization_id,user.id,'CREATED','person',personId,input.full_name),
  ])
  return c.json({id:personId},201)
})
app.get('/api/meetings',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT m.*,n.name cell_name FROM meetings m JOIN org_nodes n ON n.id=m.cell_id WHERE m.organization_id=? ORDER BY held_at DESC LIMIT 100').bind(u.organization_id).all();return c.json({meetings:rows.results})})
const meetingSchema=z.object({cell_id:z.string(),meeting_type:z.enum(['Cell Meeting','Bible Study','Outreach','Leadership Meeting']),held_at:z.string().date(),attendance:z.coerce.number().int().min(0).max(100000),first_timers:z.coerce.number().int().min(0).max(100000),new_converts:z.coerce.number().int().min(0).max(100000),notes:z.string().max(1000).optional()}).refine(v=>v.first_timers<=v.attendance,{message:'First timers cannot exceed attendance',path:['first_timers']})
app.post('/api/meetings',auth,zValidator('json',meetingSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),meetingId=id('meeting');const cell=await c.env.DB.prepare("SELECT id FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(v.cell_id,u.organization_id).first();if(!cell)return c.json({error:'Select a valid cell'},400);await c.env.DB.batch([c.env.DB.prepare('INSERT INTO meetings(id,organization_id,cell_id,meeting_type,held_at,attendance,first_timers,new_converts,notes,submitted_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(meetingId,u.organization_id,v.cell_id,v.meeting_type,v.held_at,v.attendance,v.first_timers,v.new_converts,v.notes||null,u.id),c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),u.organization_id,u.id,'SUBMITTED','meeting',meetingId,v.meeting_type)]);return c.json({id:meetingId},201)})

app.get('/api/classes',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare(`SELECT b.*,n.name cell_name,p.full_name teacher,(SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id=b.id) enrolled FROM bible_classes b JOIN org_nodes n ON n.id=b.cell_id LEFT JOIN people p ON p.id=b.teacher_id WHERE b.organization_id=? ORDER BY b.created_at DESC`).bind(u.organization_id).all();return c.json({classes:rows.results})})
const classSchema=z.object({name:z.string().trim().min(2).max(100),cell_id:z.string(),teacher_id:z.string().optional(),schedule:z.string().max(80).optional(),stage:z.enum(['Foundation','New Believers','Leadership','Bible Study'])})
app.post('/api/classes',auth,zValidator('json',classSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),classId=id('class');const cell=await c.env.DB.prepare("SELECT id FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(v.cell_id,u.organization_id).first();if(!cell)return c.json({error:'Select a valid cell'},400);await c.env.DB.batch([c.env.DB.prepare('INSERT INTO bible_classes(id,organization_id,cell_id,name,teacher_id,schedule,stage) VALUES(?,?,?,?,?,?,?)').bind(classId,u.organization_id,v.cell_id,v.name,v.teacher_id||null,v.schedule||null,v.stage),c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),u.organization_id,u.id,'CREATED','bible_class',classId,v.name)]);return c.json({id:classId},201)})

app.get('/api/follow-ups',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare(`SELECT f.*,n.name cell_name,p.full_name assignee FROM follow_ups f JOIN org_nodes n ON n.id=f.cell_id LEFT JOIN people p ON p.id=f.assigned_to WHERE f.organization_id=? ORDER BY CASE f.status WHEN 'new' THEN 0 WHEN 'contacted' THEN 1 WHEN 'returned' THEN 2 ELSE 3 END,f.due_at`).bind(u.organization_id).all();return c.json({followUps:rows.results})})
const followUpSchema=z.object({person_name:z.string().trim().min(2).max(100),phone:z.string().max(30).optional(),cell_id:z.string(),assigned_to:z.string().optional(),source:z.enum(['First timer','New convert','Outreach','Referral']),due_at:z.string().date(),notes:z.string().max(500).optional()})
app.post('/api/follow-ups',auth,zValidator('json',followUpSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),followId=id('followup');const cell=await c.env.DB.prepare("SELECT id FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(v.cell_id,u.organization_id).first();if(!cell)return c.json({error:'Select a valid cell'},400);await c.env.DB.batch([c.env.DB.prepare('INSERT INTO follow_ups(id,organization_id,person_name,phone,cell_id,assigned_to,source,due_at,notes) VALUES(?,?,?,?,?,?,?,?,?)').bind(followId,u.organization_id,v.person_name,v.phone||null,v.cell_id,v.assigned_to||null,v.source,v.due_at,v.notes||null),c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),u.organization_id,u.id,'CREATED','follow_up',followId,v.person_name)]);return c.json({id:followId},201)})
app.patch('/api/follow-ups/:id/status',auth,zValidator('json',z.object({status:z.enum(['new','contacted','returned','joined'])})),async c=>{const u=c.get('user'),v=c.req.valid('json');const result=await c.env.DB.prepare("UPDATE follow_ups SET status=?,updated_at=datetime('now') WHERE id=? AND organization_id=?").bind(v.status,c.req.param('id'),u.organization_id).run();if(!result.meta.changes)return c.json({error:'Follow-up not found'},404);await c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),u.organization_id,u.id,'STATUS_CHANGED','follow_up',c.req.param('id'),v.status).run();return c.json({ok:true})})

app.get('/api/reports',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT m.*,n.name cell_name,us.name submitted_by_name FROM meetings m JOIN org_nodes n ON n.id=m.cell_id JOIN users us ON us.id=m.submitted_by WHERE m.organization_id=? ORDER BY held_at DESC').bind(u.organization_id).all();return c.json({reports:rows.results})})
app.patch('/api/reports/:id/review',auth,zValidator('json',z.object({decision:z.enum(['approved','returned'])})),async c=>{const u=c.get('user'),v=c.req.valid('json');const result=await c.env.DB.prepare('UPDATE meetings SET status=? WHERE id=? AND organization_id=?').bind(v.decision,c.req.param('id'),u.organization_id).run();if(!result.meta.changes)return c.json({error:'Report not found'},404);await c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),u.organization_id,u.id,v.decision.toUpperCase(),'meeting',c.req.param('id'),v.decision).run();return c.json({ok:true})})
app.get('/api/reports/export.csv',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT m.held_at,n.name cell,m.meeting_type,m.attendance,m.first_timers,m.new_converts,m.status FROM meetings m JOIN org_nodes n ON n.id=m.cell_id WHERE m.organization_id=? ORDER BY m.held_at DESC').bind(u.organization_id).all();const columns=['held_at','cell','meeting_type','attendance','first_timers','new_converts','status'];const escape=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;const csv=[columns.join(','),...rows.results.map(row=>columns.map(key=>escape((row as Record<string,unknown>)[key])).join(','))].join('\n');c.header('content-type','text/csv; charset=utf-8');c.header('content-disposition','attachment; filename="ministry-reports.csv"');return c.body(csv)})

app.get('/api/resources',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT * FROM resources WHERE organization_id=? AND status!=\'archived\' ORDER BY published_at DESC').bind(u.organization_id).all();return c.json({resources:rows.results})})
const resourceSchema=z.object({title:z.string().trim().min(2).max(120),category:z.string().trim().min(2).max(60),description:z.string().max(500).optional(),url:z.url(),version:z.string().max(30).optional()})
app.post('/api/resources',auth,adminOnly,zValidator('json',resourceSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),resourceId=id('resource');await c.env.DB.prepare('INSERT INTO resources(id,organization_id,title,category,description,url,version,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(resourceId,u.organization_id,v.title,v.category,v.description||null,v.url,v.version||null,u.id).run();return c.json({id:resourceId},201)})

app.get('/api/standards',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT * FROM standard_sets WHERE organization_id=? ORDER BY effective_at DESC').bind(u.organization_id).all();return c.json({standards:rows.results})})
const standardSchema=z.object({name:z.string().trim().min(2).max(100),version:z.string().trim().min(1).max(20),source:z.string().trim().min(2).max(120),effective_at:z.string().date(),weeklyReportDue:z.string().max(60),approvalRequired:z.boolean()})
app.post('/api/standards',auth,adminOnly,zValidator('json',standardSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),standardId=id('standard');try{await c.env.DB.prepare("INSERT INTO standard_sets(id,organization_id,name,version,source,effective_at,status,rules_json,created_by) VALUES(?,?,?,?,?,?,'draft',?,?)").bind(standardId,u.organization_id,v.name,v.version,v.source,v.effective_at,JSON.stringify({weeklyReportDue:v.weeklyReportDue,approvalRequired:v.approvalRequired}),u.id).run();return c.json({id:standardId},201)}catch{return c.json({error:'That standard version already exists'},409)}})

app.get('/api/notifications',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT * FROM notifications WHERE organization_id=? AND (user_id=? OR user_id IS NULL) ORDER BY created_at DESC LIMIT 30').bind(u.organization_id,u.id).all();return c.json({notifications:rows.results})})
app.patch('/api/notifications/:id/read',auth,async c=>{const u=c.get('user');await c.env.DB.prepare("UPDATE notifications SET read_at=datetime('now') WHERE id=? AND organization_id=? AND (user_id=? OR user_id IS NULL)").bind(c.req.param('id'),u.organization_id,u.id).run();return c.json({ok:true})})

app.notFound(c => c.json({ error: 'Not found' }, 404))
app.onError((error, c) => { console.error(error); return c.json({ error: 'An unexpected error occurred', requestId: c.res.headers.get('x-request-id') }, 500) })
export default app
