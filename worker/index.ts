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
  setCookie(c, 'nexus_session', token, { httpOnly: true, sameSite: 'Strict', secure: c.env.ENVIRONMENT === 'production', path: '/', maxAge: 604800 })
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

app.notFound(c => c.json({ error: 'Not found' }, 404))
app.onError((error, c) => { console.error(error); return c.json({ error: 'An unexpected error occurred', requestId: c.res.headers.get('x-request-id') }, 500) })
export default app
