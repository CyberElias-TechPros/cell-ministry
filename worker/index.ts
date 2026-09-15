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
const operatorRoles=new Set([...adminRoles,'Church Administrator','Cell Coordinator','Cell Leader','Cell Secretary','Bible Study Class Teacher'])
const operatorOnly=async(c:any,next:any)=>{const user=c.get('user') as User;if(!operatorRoles.has(user.role))return c.json({error:'Ministry operator permission required'},403);await next()}
const reviewerRoles=new Set([...adminRoles,'Church Administrator','Cell Coordinator'])
const reviewerOnly=async(c:any,next:any)=>{const user=c.get('user') as User;if(!reviewerRoles.has(user.role))return c.json({error:'Review permission required'},403);await next()}
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
app.post('/api/cells', auth, operatorOnly, zValidator('json', cellSchema), async c => {
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
app.post('/api/people',auth,operatorOnly,zValidator('json',personSchema),async c=>{
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
app.post('/api/meetings',auth,operatorOnly,zValidator('json',meetingSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),meetingId=id('meeting');const cell=await c.env.DB.prepare("SELECT id FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(v.cell_id,u.organization_id).first();if(!cell)return c.json({error:'Select a valid cell'},400);await c.env.DB.batch([c.env.DB.prepare('INSERT INTO meetings(id,organization_id,cell_id,meeting_type,held_at,attendance,first_timers,new_converts,notes,submitted_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(meetingId,u.organization_id,v.cell_id,v.meeting_type,v.held_at,v.attendance,v.first_timers,v.new_converts,v.notes||null,u.id),c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),u.organization_id,u.id,'SUBMITTED','meeting',meetingId,v.meeting_type)]);return c.json({id:meetingId},201)})

app.get('/api/classes',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare(`SELECT b.*,n.name cell_name,p.full_name teacher,(SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id=b.id) enrolled FROM bible_classes b JOIN org_nodes n ON n.id=b.cell_id LEFT JOIN people p ON p.id=b.teacher_id WHERE b.organization_id=? ORDER BY b.created_at DESC`).bind(u.organization_id).all();return c.json({classes:rows.results})})
const classSchema=z.object({name:z.string().trim().min(2).max(100),cell_id:z.string(),teacher_id:z.string().optional(),schedule:z.string().max(80).optional(),stage:z.enum(['Foundation','New Believers','Leadership','Bible Study'])})
app.post('/api/classes',auth,operatorOnly,zValidator('json',classSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),classId=id('class');const cell=await c.env.DB.prepare("SELECT id FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(v.cell_id,u.organization_id).first();if(!cell)return c.json({error:'Select a valid cell'},400);if(v.teacher_id&&!await c.env.DB.prepare('SELECT id FROM people WHERE id=? AND organization_id=?').bind(v.teacher_id,u.organization_id).first())return c.json({error:'Select a teacher in your organization'},400);await c.env.DB.batch([c.env.DB.prepare('INSERT INTO bible_classes(id,organization_id,cell_id,name,teacher_id,schedule,stage) VALUES(?,?,?,?,?,?,?)').bind(classId,u.organization_id,v.cell_id,v.name,v.teacher_id||null,v.schedule||null,v.stage),c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),u.organization_id,u.id,'CREATED','bible_class',classId,v.name)]);return c.json({id:classId},201)})

app.get('/api/follow-ups',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare(`SELECT f.*,n.name cell_name,p.full_name assignee FROM follow_ups f JOIN org_nodes n ON n.id=f.cell_id LEFT JOIN people p ON p.id=f.assigned_to WHERE f.organization_id=? ORDER BY CASE f.status WHEN 'new' THEN 0 WHEN 'contacted' THEN 1 WHEN 'returned' THEN 2 ELSE 3 END,f.due_at`).bind(u.organization_id).all();return c.json({followUps:rows.results})})
const followUpSchema=z.object({person_name:z.string().trim().min(2).max(100),phone:z.string().max(30).optional(),cell_id:z.string(),assigned_to:z.string().optional(),source:z.enum(['First timer','New convert','Outreach','Referral']),due_at:z.string().date(),notes:z.string().max(500).optional()})
app.post('/api/follow-ups',auth,operatorOnly,zValidator('json',followUpSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),followId=id('followup');const cell=await c.env.DB.prepare("SELECT id FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(v.cell_id,u.organization_id).first();if(!cell)return c.json({error:'Select a valid cell'},400);if(v.assigned_to&&!await c.env.DB.prepare('SELECT id FROM people WHERE id=? AND organization_id=?').bind(v.assigned_to,u.organization_id).first())return c.json({error:'Select an assignee in your organization'},400);await c.env.DB.batch([c.env.DB.prepare('INSERT INTO follow_ups(id,organization_id,person_name,phone,cell_id,assigned_to,source,due_at,notes) VALUES(?,?,?,?,?,?,?,?,?)').bind(followId,u.organization_id,v.person_name,v.phone||null,v.cell_id,v.assigned_to||null,v.source,v.due_at,v.notes||null),c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),u.organization_id,u.id,'CREATED','follow_up',followId,v.person_name)]);return c.json({id:followId},201)})
app.patch('/api/follow-ups/:id/status',auth,operatorOnly,zValidator('json',z.object({status:z.enum(['new','contacted','returned','joined'])})),async c=>{const u=c.get('user'),v=c.req.valid('json');const result=await c.env.DB.prepare("UPDATE follow_ups SET status=?,updated_at=datetime('now') WHERE id=? AND organization_id=?").bind(v.status,c.req.param('id'),u.organization_id).run();if(!result.meta.changes)return c.json({error:'Follow-up not found'},404);await c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),u.organization_id,u.id,'STATUS_CHANGED','follow_up',c.req.param('id'),v.status).run();return c.json({ok:true})})

app.get('/api/reports',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT m.*,n.name cell_name,us.name submitted_by_name FROM meetings m JOIN org_nodes n ON n.id=m.cell_id JOIN users us ON us.id=m.submitted_by WHERE m.organization_id=? ORDER BY held_at DESC').bind(u.organization_id).all();return c.json({reports:rows.results})})
app.patch('/api/reports/:id/review',auth,reviewerOnly,zValidator('json',z.object({decision:z.enum(['approved','returned'])})),async c=>{const u=c.get('user'),v=c.req.valid('json');const result=await c.env.DB.prepare('UPDATE meetings SET status=? WHERE id=? AND organization_id=?').bind(v.decision,c.req.param('id'),u.organization_id).run();if(!result.meta.changes)return c.json({error:'Report not found'},404);await c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),u.organization_id,u.id,v.decision.toUpperCase(),'meeting',c.req.param('id'),v.decision).run();return c.json({ok:true})})
app.get('/api/reports/export.csv',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT m.held_at,n.name cell,m.meeting_type,m.attendance,m.first_timers,m.new_converts,m.status FROM meetings m JOIN org_nodes n ON n.id=m.cell_id WHERE m.organization_id=? ORDER BY m.held_at DESC').bind(u.organization_id).all();const columns=['held_at','cell','meeting_type','attendance','first_timers','new_converts','status'];const escape=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;const csv=[columns.join(','),...rows.results.map(row=>columns.map(key=>escape((row as Record<string,unknown>)[key])).join(','))].join('\n');c.header('content-type','text/csv; charset=utf-8');c.header('content-disposition','attachment; filename="ministry-reports.csv"');return c.body(csv)})

app.get('/api/resources',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT * FROM resources WHERE organization_id=? AND status!=\'archived\' ORDER BY published_at DESC').bind(u.organization_id).all();return c.json({resources:rows.results})})
const resourceSchema=z.object({title:z.string().trim().min(2).max(120),category:z.string().trim().min(2).max(60),description:z.string().max(500).optional(),url:z.url(),version:z.string().max(30).optional()})
app.post('/api/resources',auth,adminOnly,zValidator('json',resourceSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),resourceId=id('resource');await c.env.DB.prepare('INSERT INTO resources(id,organization_id,title,category,description,url,version,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(resourceId,u.organization_id,v.title,v.category,v.description||null,v.url,v.version||null,u.id).run();return c.json({id:resourceId},201)})

app.get('/api/standards',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT * FROM standard_sets WHERE organization_id=? ORDER BY effective_at DESC').bind(u.organization_id).all();return c.json({standards:rows.results})})
const standardSchema=z.object({name:z.string().trim().min(2).max(100),version:z.string().trim().min(1).max(20),source:z.string().trim().min(2).max(120),effective_at:z.string().date(),weeklyReportDue:z.string().max(60),approvalRequired:z.boolean()})
app.post('/api/standards',auth,adminOnly,zValidator('json',standardSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),standardId=id('standard');try{await c.env.DB.prepare("INSERT INTO standard_sets(id,organization_id,name,version,source,effective_at,status,rules_json,created_by) VALUES(?,?,?,?,?,?,'draft',?,?)").bind(standardId,u.organization_id,v.name,v.version,v.source,v.effective_at,JSON.stringify({weeklyReportDue:v.weeklyReportDue,approvalRequired:v.approvalRequired}),u.id).run();return c.json({id:standardId},201)}catch{return c.json({error:'That standard version already exists'},409)}})

app.get('/api/notifications',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT * FROM notifications WHERE organization_id=? AND (user_id=? OR user_id IS NULL) ORDER BY created_at DESC LIMIT 30').bind(u.organization_id,u.id).all();return c.json({notifications:rows.results})})
app.patch('/api/notifications/:id/read',auth,async c=>{const u=c.get('user');await c.env.DB.prepare("UPDATE notifications SET read_at=datetime('now') WHERE id=? AND organization_id=? AND (user_id=? OR user_id IS NULL)").bind(c.req.param('id'),u.organization_id,u.id).run();return c.json({ok:true})})

app.get('/api/search',auth,async c=>{const u=c.get('user'),q=(c.req.query('q')||'').trim();if(q.length<2)return c.json({results:[]});const like=`%${q}%`;const [people,cells,resources]=await c.env.DB.batch([c.env.DB.prepare("SELECT id,full_name title,leadership_stage subtitle,'person' type,'/people' href FROM people WHERE organization_id=? AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?) LIMIT 6").bind(u.organization_id,like,like,like),c.env.DB.prepare("SELECT id,name title,code||' · '||COALESCE(location,'') subtitle,'cell' type,'/cells' href FROM org_nodes WHERE organization_id=? AND node_type='cell' AND (name LIKE ? OR code LIKE ? OR location LIKE ?) LIMIT 6").bind(u.organization_id,like,like,like),c.env.DB.prepare("SELECT id,title,category subtitle,'resource' type,'/resources' href FROM resources WHERE organization_id=? AND status='published' AND (title LIKE ? OR category LIKE ?) LIMIT 6").bind(u.organization_id,like,like)]);return c.json({results:[...people.results,...cells.results,...resources.results]})})

app.get('/api/map',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare(`SELECT n.id,n.name,n.code,n.location,n.latitude,n.longitude,n.status,(SELECT COUNT(*) FROM people p WHERE p.cell_id=n.id) members,(SELECT full_name FROM people p WHERE p.cell_id=n.id AND p.leadership_stage='Cell Leader' LIMIT 1) leader FROM org_nodes n WHERE n.organization_id=? AND n.node_type='cell' AND n.latitude IS NOT NULL`).bind(u.organization_id).all();return c.json({cells:rows.results})})

app.get('/api/calendar',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT e.*,n.name scope_name FROM calendar_events e LEFT JOIN org_nodes n ON n.id=e.org_node_id WHERE e.organization_id=? ORDER BY e.starts_at').bind(u.organization_id).all();return c.json({events:rows.results})})
const eventSchema=z.object({title:z.string().trim().min(2).max(120),event_type:z.enum(['Cell Meeting','Bible Study','Outreach','Leadership','Training','Special Event']),starts_at:z.string().min(16),ends_at:z.string().optional(),org_node_id:z.string().optional(),location:z.string().max(120).optional(),recurrence:z.enum(['none','weekly','monthly'])})
app.post('/api/calendar',auth,operatorOnly,zValidator('json',eventSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),eventId=id('event');if(v.org_node_id&&!await c.env.DB.prepare('SELECT id FROM org_nodes WHERE id=? AND organization_id=?').bind(v.org_node_id,u.organization_id).first())return c.json({error:'Select a valid ministry scope'},400);await c.env.DB.prepare('INSERT INTO calendar_events(id,organization_id,org_node_id,title,event_type,starts_at,ends_at,location,recurrence,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(eventId,u.organization_id,v.org_node_id||null,v.title,v.event_type,v.starts_at,v.ends_at||null,v.location||null,v.recurrence,u.id).run();return c.json({id:eventId},201)})

app.get('/api/transfers',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare(`SELECT t.*,p.full_name person_name,f.name from_cell,toc.name to_cell,requester.name requested_by_name FROM member_transfers t JOIN people p ON p.id=t.person_id JOIN org_nodes f ON f.id=t.from_cell_id JOIN org_nodes toc ON toc.id=t.to_cell_id JOIN users requester ON requester.id=t.requested_by WHERE t.organization_id=? ORDER BY t.created_at DESC`).bind(u.organization_id).all();return c.json({transfers:rows.results})})
const transferSchema=z.object({person_id:z.string(),to_cell_id:z.string(),category:z.enum(['Relocation','Pastoral assignment','Catchment change','Other']),notes:z.string().max(500).optional()})
app.post('/api/transfers',auth,operatorOnly,zValidator('json',transferSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),transferId=id('transfer');const person=await c.env.DB.prepare('SELECT cell_id FROM people WHERE id=? AND organization_id=?').bind(v.person_id,u.organization_id).first<{cell_id:string}>();if(!person)return c.json({error:'Person not found'},404);if(person.cell_id===v.to_cell_id)return c.json({error:'Choose a different receiving cell'},400);const target=await c.env.DB.prepare("SELECT id FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(v.to_cell_id,u.organization_id).first();if(!target)return c.json({error:'Receiving cell not found'},404);await c.env.DB.prepare('INSERT INTO member_transfers(id,organization_id,person_id,from_cell_id,to_cell_id,category,notes,requested_by) VALUES(?,?,?,?,?,?,?,?)').bind(transferId,u.organization_id,v.person_id,person.cell_id,v.to_cell_id,v.category,v.notes||null,u.id).run();return c.json({id:transferId},201)})
app.patch('/api/transfers/:id/review',auth,reviewerOnly,zValidator('json',z.object({decision:z.enum(['approved','returned'])})),async c=>{const u=c.get('user'),v=c.req.valid('json');const transfer=await c.env.DB.prepare("SELECT * FROM member_transfers WHERE id=? AND organization_id=? AND status='pending'").bind(c.req.param('id'),u.organization_id).first<any>();if(!transfer)return c.json({error:'Pending transfer not found'},404);const statements=[c.env.DB.prepare("UPDATE member_transfers SET status=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=?").bind(v.decision,u.id,transfer.id),c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)').bind(id('audit'),u.organization_id,u.id,`TRANSFER_${v.decision.toUpperCase()}`,'person',transfer.person_id,transfer.id)];if(v.decision==='approved')statements.push(c.env.DB.prepare('UPDATE people SET cell_id=? WHERE id=? AND organization_id=?').bind(transfer.to_cell_id,transfer.person_id,u.organization_id));await c.env.DB.batch(statements);return c.json({ok:true})})

app.get('/api/leadership-assignments',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare(`SELECT a.*,p.full_name person_name,n.name scope_name FROM role_assignments a JOIN people p ON p.id=a.person_id JOIN org_nodes n ON n.id=a.org_node_id WHERE a.organization_id=? ORDER BY a.start_date DESC`).bind(u.organization_id).all();return c.json({assignments:rows.results})})
const assignmentSchema=z.object({person_id:z.string(),org_node_id:z.string(),role:z.string().trim().min(2).max(80),start_date:z.string().date()})
app.post('/api/leadership-assignments',auth,adminOnly,zValidator('json',assignmentSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),assignmentId=id('assignment');const [person,scope]=await c.env.DB.batch([c.env.DB.prepare('SELECT id FROM people WHERE id=? AND organization_id=?').bind(v.person_id,u.organization_id),c.env.DB.prepare('SELECT id FROM org_nodes WHERE id=? AND organization_id=?').bind(v.org_node_id,u.organization_id)]);if(!person.results.length||!scope.results.length)return c.json({error:'Person or scope is outside your organization'},400);await c.env.DB.prepare('INSERT INTO role_assignments(id,organization_id,person_id,org_node_id,role,start_date,appointed_by) VALUES(?,?,?,?,?,?,?)').bind(assignmentId,u.organization_id,v.person_id,v.org_node_id,v.role,v.start_date,u.id).run();return c.json({id:assignmentId},201)})
app.patch('/api/leadership-assignments/:id/end',auth,adminOnly,async c=>{const u=c.get('user');const result=await c.env.DB.prepare("UPDATE role_assignments SET status='ended',end_date=date('now') WHERE id=? AND organization_id=? AND status='active'").bind(c.req.param('id'),u.organization_id).run();if(!result.meta.changes)return c.json({error:'Active appointment not found'},404);return c.json({ok:true})})

app.get('/api/meetings/:id/attendance',auth,async c=>{const u=c.get('user');const meeting=await c.env.DB.prepare('SELECT cell_id FROM meetings WHERE id=? AND organization_id=?').bind(c.req.param('id'),u.organization_id).first<{cell_id:string}>();if(!meeting)return c.json({error:'Meeting not found'},404);const rows=await c.env.DB.prepare(`SELECT p.id person_id,p.full_name,p.leadership_stage,COALESCE(a.attendance_status,'absent') attendance_status FROM people p LEFT JOIN meeting_attendance a ON a.person_id=p.id AND a.meeting_id=? WHERE p.organization_id=? AND p.cell_id=? ORDER BY p.full_name`).bind(c.req.param('id'),u.organization_id,meeting.cell_id).all();return c.json({attendance:rows.results})})
app.put('/api/meetings/:id/attendance',auth,operatorOnly,zValidator('json',z.object({records:z.array(z.object({person_id:z.string(),attendance_status:z.enum(['present','absent','excused'])})).max(500)})),async c=>{const u=c.get('user'),records=c.req.valid('json').records;const meeting=await c.env.DB.prepare('SELECT cell_id FROM meetings WHERE id=? AND organization_id=?').bind(c.req.param('id'),u.organization_id).first<{cell_id:string}>();if(!meeting)return c.json({error:'Meeting not found'},404);const valid=await c.env.DB.prepare('SELECT id FROM people WHERE organization_id=? AND cell_id=?').bind(u.organization_id,meeting.cell_id).all();const validIds=new Set(valid.results.map(row=>String(row.id)));if(records.some(row=>!validIds.has(row.person_id)))return c.json({error:'Attendance includes a person outside this cell'},400);const statements=records.map(row=>c.env.DB.prepare(`INSERT INTO meeting_attendance(id,meeting_id,person_id,attendance_status) VALUES(?,?,?,?) ON CONFLICT(meeting_id,person_id) DO UPDATE SET attendance_status=excluded.attendance_status`).bind(id('attendance'),c.req.param('id'),row.person_id,row.attendance_status));if(statements.length)await c.env.DB.batch(statements);return c.json({ok:true,count:records.length})})

app.get('/api/audit-logs',auth,adminOnly,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare(`SELECT a.*,us.name user_name FROM audit_logs a LEFT JOIN users us ON us.id=a.user_id WHERE a.organization_id=? ORDER BY a.created_at DESC LIMIT 200`).bind(u.organization_id).all();return c.json({logs:rows.results})})
app.get('/api/insights',auth,async c=>{const u=c.get('user');const [missing,declining,pipeline,overdue]=await c.env.DB.batch([c.env.DB.prepare(`SELECT n.id,n.name,'Missing report' signal FROM org_nodes n WHERE n.organization_id=? AND n.node_type='cell' AND NOT EXISTS(SELECT 1 FROM meetings m WHERE m.cell_id=n.id AND m.held_at>=date('now','-14 day')) LIMIT 5`).bind(u.organization_id),c.env.DB.prepare(`SELECT n.id,n.name,'Attendance attention' signal FROM org_nodes n JOIN meetings m ON m.cell_id=n.id WHERE n.organization_id=? GROUP BY n.id HAVING AVG(m.attendance)<25 LIMIT 5`).bind(u.organization_id),c.env.DB.prepare("SELECT id,full_name name,'Leadership opportunity' signal FROM people WHERE organization_id=? AND leadership_stage='Potential Leader' LIMIT 5").bind(u.organization_id),c.env.DB.prepare("SELECT id,person_name name,'Follow-up overdue' signal FROM follow_ups WHERE organization_id=? AND status!='joined' AND due_at<date('now') LIMIT 5").bind(u.organization_id)]);return c.json({insights:[...missing.results,...declining.results,...pipeline.results,...overdue.results]})})

app.get('/api/users',auth,adminOnly,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT id,name,email,role,scope_node_id,active,created_at FROM users WHERE organization_id=? ORDER BY active DESC,name').bind(u.organization_id).all();return c.json({users:rows.results})})
const userSchema=z.object({name:z.string().trim().min(2).max(100),email:z.email(),role:z.enum(['Ministry Administrator','Zone Administrator','Church Administrator','Cell Coordinator','Cell Leader','Cell Secretary','Bible Study Class Teacher','Read-only Leadership']),scope_node_id:z.string().optional()})
app.post('/api/users',auth,adminOnly,zValidator('json',userSchema),async c=>{const u=c.get('user'),v=c.req.valid('json'),userId=id('user'),temporaryPassword=`Nexus!${crypto.randomUUID().replaceAll('-','').slice(0,12)}`,salt=hex(crypto.getRandomValues(new Uint8Array(16)).buffer);if(v.scope_node_id&&!await c.env.DB.prepare('SELECT id FROM org_nodes WHERE id=? AND organization_id=?').bind(v.scope_node_id,u.organization_id).first())return c.json({error:'Scope is outside your organization'},400);try{await c.env.DB.prepare('INSERT INTO users(id,organization_id,name,email,password_salt,password_hash,role,scope_node_id) VALUES(?,?,?,?,?,?,?,?)').bind(userId,u.organization_id,v.name,v.email.toLowerCase(),salt,await passwordHash(temporaryPassword,salt),v.role,v.scope_node_id||u.scope_node_id).run();return c.json({id:userId,temporaryPassword},201)}catch{return c.json({error:'That email address already has an account'},409)}})
app.patch('/api/users/:id/active',auth,adminOnly,zValidator('json',z.object({active:z.boolean()})),async c=>{const u=c.get('user'),v=c.req.valid('json');if(c.req.param('id')===u.id&&!v.active)return c.json({error:'You cannot deactivate your own account'},400);const result=await c.env.DB.prepare('UPDATE users SET active=? WHERE id=? AND organization_id=?').bind(v.active?1:0,c.req.param('id'),u.organization_id).run();if(!result.meta.changes)return c.json({error:'Account not found'},404);if(!v.active)await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(c.req.param('id')).run();return c.json({ok:true})})
app.post('/api/account/change-password',auth,zValidator('json',z.object({currentPassword:z.string().min(8).max(128),newPassword:z.string().min(12).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/).regex(/[^A-Za-z0-9]/)})),async c=>{const u=c.get('user'),v=c.req.valid('json');const record=await c.env.DB.prepare('SELECT password_salt,password_hash FROM users WHERE id=?').bind(u.id).first<any>();if(!record||await passwordHash(v.currentPassword,record.password_salt)!==record.password_hash)return c.json({error:'Current password is incorrect'},400);const salt=hex(crypto.getRandomValues(new Uint8Array(16)).buffer);await c.env.DB.batch([c.env.DB.prepare('UPDATE users SET password_salt=?,password_hash=? WHERE id=?').bind(salt,await passwordHash(v.newPassword,salt),u.id),c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id)]);deleteCookie(c,'nexus_session',{path:'/'});return c.json({ok:true})})

const importPeopleSchema=z.object({records:z.array(z.object({full_name:z.string().trim().min(2).max(100),email:z.union([z.email(),z.literal('')]).optional(),phone:z.string().max(30).optional(),cell_code:z.string().min(1).max(16),leadership_stage:z.enum(['Member','Potential Leader','Class Teacher','Assistant Leader','Cell Leader']).default('Member')})).min(1).max(500)})
app.post('/api/people/import',auth,operatorOnly,zValidator('json',importPeopleSchema),async c=>{const u=c.get('user'),records=c.req.valid('json').records;const cells=await c.env.DB.prepare("SELECT id,code FROM org_nodes WHERE organization_id=? AND node_type='cell'").bind(u.organization_id).all();const byCode=new Map(cells.results.map(row=>[String(row.code).toUpperCase(),String(row.id)]));const invalid=[...new Set(records.filter(row=>!byCode.has(row.cell_code.toUpperCase())).map(row=>row.cell_code))];if(invalid.length)return c.json({error:`Unknown cell codes: ${invalid.join(', ')}`},400);await c.env.DB.batch(records.map(row=>c.env.DB.prepare('INSERT INTO people(id,organization_id,cell_id,full_name,email,phone,leadership_stage,status) VALUES(?,?,?,?,?,?,?,?)').bind(id('person'),u.organization_id,byCode.get(row.cell_code.toUpperCase()),row.full_name,row.email||null,row.phone||null,row.leadership_stage,row.leadership_stage.includes('Leader')?'leader':'member')));return c.json({ok:true,imported:records.length},201)})
app.get('/api/people/export.csv',auth,async c=>{const u=c.get('user');const rows=await c.env.DB.prepare('SELECT p.full_name,p.email,p.phone,n.code cell_code,p.leadership_stage,p.status,p.joined_at FROM people p LEFT JOIN org_nodes n ON n.id=p.cell_id WHERE p.organization_id=? ORDER BY p.full_name').bind(u.organization_id).all();const columns=['full_name','email','phone','cell_code','leadership_stage','status','joined_at'],escape=(value:unknown)=>`"${String(value??'').replaceAll('"','""')}"`;const csv=[columns.join(','),...rows.results.map(row=>columns.map(key=>escape((row as Record<string,unknown>)[key])).join(','))].join('\n');c.header('content-type','text/csv; charset=utf-8');c.header('content-disposition','attachment; filename="people.csv"');return c.body(csv)})
app.get('/api/admin/export',auth,adminOnly,async c=>{const u=c.get('user');const tables=['org_nodes','people','role_assignments','bible_classes','meetings','follow_ups','member_transfers','multiplication_events','calendar_events','standard_sets','resources','audit_logs'];const output:Record<string,unknown[]>={};for(const table of tables){const result=await c.env.DB.prepare(`SELECT * FROM ${table} WHERE organization_id=?`).bind(u.organization_id).all().catch(()=>({results:[]}));output[table]=result.results}return c.json({exportedAt:new Date().toISOString(),organizationId:u.organization_id,data:output})})

app.notFound(c => c.json({ error: 'Not found' }, 404))
app.onError((error, c) => { console.error(error); return c.json({ error: 'An unexpected error occurred', requestId: c.res.headers.get('x-request-id') }, 500) })
export default app
