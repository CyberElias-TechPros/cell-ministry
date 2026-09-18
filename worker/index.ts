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

const adminRoles = new Set(['Super Administrator', 'Ministry Administrator', 'Zone Administrator'])
const adminOnly = async (c: any, next: any) => {
  const user = c.get('user') as User
  if (!adminRoles.has(user.role)) return c.json({ error: 'Administrator permission required' }, 403)
  await next()
}
const operatorRoles = new Set([...adminRoles, 'Church Administrator', 'Cell Coordinator', 'Cell Leader', 'Cell Secretary', 'Bible Study Class Teacher'])
const operatorOnly = async (c: any, next: any) => {
  const user = c.get('user') as User
  if (!operatorRoles.has(user.role)) return c.json({ error: 'Ministry operator permission required' }, 403)
  await next()
}
const reviewerRoles = new Set([...adminRoles, 'Church Administrator', 'Cell Coordinator'])
const reviewerOnly = async (c: any, next: any) => {
  const user = c.get('user') as User
  if (!reviewerRoles.has(user.role)) return c.json({ error: 'Review permission required' }, 403)
  await next()
}

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

// -------------------------------------------------------------
// Health & Auth
// -------------------------------------------------------------
app.get('/api/health', c => c.json({ status: 'ok', service: 'cell-ministry-api' }))

app.post('/api/auth/login', zValidator('json', z.object({ email: z.string().email(), password: z.string().min(6).max(128) })), async c => {
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
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), record.organization_id, record.id, 'SIGNED_IN', 'session', record.id, 'Successful login'),
  ])
  const isHttps = c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:' || c.env.ENVIRONMENT === 'production'
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

// -------------------------------------------------------------
// Dashboard & Trends
// -------------------------------------------------------------
app.get('/api/dashboard', auth, async c => {
  const user = c.get('user')
  const [cells, people, leaders, meetings, recent, activity, trends] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT COUNT(*) total FROM org_nodes WHERE organization_id=? AND node_type='cell' AND status='active'").bind(user.organization_id),
    c.env.DB.prepare('SELECT COUNT(*) total FROM people WHERE organization_id=?').bind(user.organization_id),
    c.env.DB.prepare("SELECT COUNT(*) total FROM people WHERE organization_id=? AND leadership_stage IN ('Cell Leader','Assistant Leader','Class Teacher','Potential Leader')").bind(user.organization_id),
    c.env.DB.prepare("SELECT COUNT(*) meetings, COALESCE(SUM(attendance),0) attendance, COALESCE(SUM(first_timers),0) first_timers, COALESCE(SUM(new_converts),0) new_converts FROM meetings WHERE organization_id=? AND held_at >= date('now','-30 days')").bind(user.organization_id),
    c.env.DB.prepare(`SELECT m.id,m.meeting_type,m.held_at,m.attendance,m.first_timers,m.new_converts,m.status,n.name cell_name
      FROM meetings m JOIN org_nodes n ON n.id=m.cell_id WHERE m.organization_id=? ORDER BY m.held_at DESC LIMIT 6`).bind(user.organization_id),
    c.env.DB.prepare('SELECT action,entity_type,detail,created_at FROM audit_logs WHERE organization_id=? ORDER BY created_at DESC LIMIT 6').bind(user.organization_id),
    c.env.DB.prepare(`SELECT strftime('%Y-%W', held_at) as week, SUM(attendance) as attendance, SUM(first_timers) as first_timers, COUNT(*) count
      FROM meetings WHERE organization_id=? GROUP BY week ORDER BY week DESC LIMIT 8`).bind(user.organization_id),
  ])
  const cellMetric = cells.results[0] as { total: number } | undefined
  const peopleMetric = people.results[0] as { total: number } | undefined
  const leaderMetric = leaders.results[0] as { total: number } | undefined
  const meetingMetric = meetings.results[0] as Record<string, number> | undefined

  return c.json({
    metrics: {
      cells: cellMetric?.total || 0,
      people: peopleMetric?.total || 0,
      leaders: leaderMetric?.total || 0,
      ...(meetingMetric || {}),
    },
    recent: recent.results,
    activity: activity.results,
    trends: trends.results.reverse(),
  })
})

// -------------------------------------------------------------
// Cells & Multiplication
// -------------------------------------------------------------
app.get('/api/cells', auth, async c => {
  const user = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT n.*,p.name parent_name,
    (SELECT COUNT(*) FROM people pe WHERE pe.cell_id=n.id) members,
    (SELECT full_name FROM people pe WHERE pe.cell_id=n.id AND pe.leadership_stage='Cell Leader' LIMIT 1) leader,
    (SELECT full_name FROM people pe WHERE pe.cell_id=n.id AND pe.leadership_stage='Assistant Leader' LIMIT 1) assistant_leader,
    (SELECT COUNT(*) FROM bible_classes bc WHERE bc.cell_id=n.id) class_count,
    (SELECT COUNT(*) FROM org_nodes ch WHERE ch.parent_id=n.id AND ch.node_type='cell') daughter_cells
    FROM org_nodes n LEFT JOIN org_nodes p ON p.id=n.parent_id WHERE n.organization_id=? AND n.node_type='cell' ORDER BY n.created_at,n.name`).bind(user.organization_id).all()
  return c.json({ cells: rows.results })
})

const cellSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(16).regex(/^[A-Za-z0-9-]+$/),
  parent_id: z.string().min(1),
  location: z.string().trim().max(120).optional(),
  meeting_day: z.string().max(12).optional(),
  meeting_time: z.string().max(8).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
})

app.post('/api/cells', auth, operatorOnly, zValidator('json', cellSchema), async c => {
  const user = c.get('user'), input = c.req.valid('json'), cellId = id('cell')
  const parent = await c.env.DB.prepare('SELECT id FROM org_nodes WHERE id=? AND organization_id=?').bind(input.parent_id, user.organization_id).first()
  if (!parent) return c.json({ error: 'Parent cell is outside your organization' }, 400)
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO org_nodes(id,organization_id,parent_id,node_type,name,code,location,meeting_day,meeting_time,latitude,longitude) VALUES(?,?,?,'cell',?,?,?,?,?,?,?)`)
        .bind(cellId, user.organization_id, input.parent_id, input.name, input.code.toUpperCase(), input.location || null, input.meeting_day || null, input.meeting_time || null, input.latitude || 4.8156, input.longitude || 7.0498),
      c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
        .bind(id('audit'), user.organization_id, user.id, 'CREATED', 'cell', cellId, input.name),
      c.env.DB.prepare('INSERT INTO notifications(id,organization_id,title,message,type,href) VALUES(?,?,?,?,?,?)')
        .bind(id('not'), user.organization_id, 'New cell pioneered', `${input.name} (${input.code.toUpperCase()}) was established.`, 'growth', '/cells'),
    ])
    return c.json({ id: cellId }, 201)
  } catch {
    return c.json({ error: 'That cell code is already in use' }, 409)
  }
})

// Detailed profile of a single cell
app.get('/api/cells/:id', auth, async c => {
  const user = c.get('user'), cellId = c.req.param('id')
  const cell = await c.env.DB.prepare(`SELECT n.*, p.name parent_name,
    (SELECT COUNT(*) FROM people pe WHERE pe.cell_id=n.id) members,
    (SELECT full_name FROM people pe WHERE pe.cell_id=n.id AND pe.leadership_stage='Cell Leader' LIMIT 1) leader,
    (SELECT id FROM people pe WHERE pe.cell_id=n.id AND pe.leadership_stage='Cell Leader' LIMIT 1) leader_id,
    (SELECT full_name FROM people pe WHERE pe.cell_id=n.id AND pe.leadership_stage='Assistant Leader' LIMIT 1) assistant_leader
    FROM org_nodes n LEFT JOIN org_nodes p ON p.id=n.parent_id WHERE n.id=? AND n.organization_id=?`).bind(cellId, user.organization_id).first<any>()
  if (!cell) return c.json({ error: 'Cell not found' }, 404)

  const [members, classes, meetings, children, multiplications] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, full_name, email, phone, leadership_stage, joined_at FROM people WHERE cell_id=? ORDER BY leadership_stage DESC, full_name').bind(cellId),
    c.env.DB.prepare(`SELECT b.*, p.full_name teacher, (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id=b.id) enrolled
      FROM bible_classes b LEFT JOIN people p ON p.id=b.teacher_id WHERE b.cell_id=? ORDER BY b.created_at DESC`).bind(cellId),
    c.env.DB.prepare('SELECT id, meeting_type, held_at, attendance, first_timers, new_converts, status, notes FROM meetings WHERE cell_id=? ORDER BY held_at DESC LIMIT 5').bind(cellId),
    c.env.DB.prepare("SELECT id, name, code, location, (SELECT count(*) FROM people pe WHERE pe.cell_id=org_nodes.id) members FROM org_nodes WHERE parent_id=? AND node_type='cell'").bind(cellId),
    c.env.DB.prepare(`SELECT m.*, c.name child_name, c.code child_code, pioneer.full_name pioneer_name
      FROM multiplication_events m JOIN org_nodes c ON c.id=m.child_cell_id LEFT JOIN people pioneer ON pioneer.id=m.pioneer_id
      WHERE m.parent_cell_id=? ORDER BY m.event_date DESC`).bind(cellId),
  ])

  return c.json({
    cell,
    members: members.results,
    classes: classes.results,
    meetings: meetings.results,
    children: children.results,
    multiplications: multiplications.results,
  })
})

const updateCellSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  location: z.string().trim().max(120).optional(),
  meeting_day: z.string().max(12).optional(),
  meeting_time: z.string().max(8).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  status: z.string().optional(),
})

app.patch('/api/cells/:id', auth, operatorOnly, zValidator('json', updateCellSchema), async c => {
  const user = c.get('user'), cellId = c.req.param('id'), data = c.req.valid('json')
  const cell = await c.env.DB.prepare('SELECT id FROM org_nodes WHERE id=? AND organization_id=?').bind(cellId, user.organization_id).first()
  if (!cell) return c.json({ error: 'Cell not found' }, 404)

  const sets: string[] = []
  const values: any[] = []
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      sets.push(`${key}=?`)
      values.push(val)
    }
  }
  if (!sets.length) return c.json({ ok: true })
  values.push(cellId, user.organization_id)
  await c.env.DB.prepare(`UPDATE org_nodes SET ${sets.join(', ')} WHERE id=? AND organization_id=?`).bind(...values).run()
  await c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
    .bind(id('audit'), user.organization_id, user.id, 'UPDATED', 'cell', cellId, 'Cell details updated').run()
  return c.json({ ok: true })
})

// Cell Multiplication Workflow (Signature Feature)
const multiplySchema = z.object({
  parent_cell_id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(16).regex(/^[A-Za-z0-9-]+$/),
  pioneer_person_id: z.string().min(1),
  location: z.string().trim().max(120).optional(),
  meeting_day: z.string().max(12).optional(),
  meeting_time: z.string().max(8).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  notes: z.string().max(500).optional(),
})

app.post('/api/cells/multiply', auth, operatorOnly, zValidator('json', multiplySchema), async c => {
  const user = c.get('user'), input = c.req.valid('json')
  const parent = await c.env.DB.prepare('SELECT id, name FROM org_nodes WHERE id=? AND organization_id=?').bind(input.parent_cell_id, user.organization_id).first<{ id: string; name: string }>()
  if (!parent) return c.json({ error: 'Parent cell not found' }, 404)

  const pioneer = await c.env.DB.prepare('SELECT id, full_name FROM people WHERE id=? AND organization_id=?').bind(input.pioneer_person_id, user.organization_id).first<{ id: string; full_name: string }>()
  if (!pioneer) return c.json({ error: 'Pioneer leader not found' }, 404)

  const childCellId = id('cell')
  const multEventId = id('me')
  const appointmentId = id('ra')

  try {
    await c.env.DB.batch([
      // 1. Create daughter cell
      c.env.DB.prepare(`INSERT INTO org_nodes(id,organization_id,parent_id,node_type,name,code,location,meeting_day,meeting_time,latitude,longitude,status) VALUES(?,?,?,'cell',?,?,?,?,?,?,?,'active')`)
        .bind(childCellId, user.organization_id, parent.id, input.name, input.code.toUpperCase(), input.location || null, input.meeting_day || null, input.meeting_time || null, input.latitude || 4.825, input.longitude || 7.035),
      // 2. Record multiplication event
      c.env.DB.prepare(`INSERT INTO multiplication_events(id,organization_id,parent_cell_id,child_cell_id,pioneer_id,event_date,notes,approved_by) VALUES(?,?,?,?,?,date('now'),?,?)`)
        .bind(multEventId, user.organization_id, parent.id, childCellId, pioneer.id, input.notes || `Pioneered from ${parent.name}`, user.id),
      // 3. Move pioneer to new cell and elevate stage to Cell Leader
      c.env.DB.prepare("UPDATE people SET cell_id=?, leadership_stage='Cell Leader', status='leader' WHERE id=? AND organization_id=?")
        .bind(childCellId, pioneer.id, user.organization_id),
      // 4. Appoint pioneer as Cell Leader
      c.env.DB.prepare("INSERT INTO role_assignments(id,organization_id,person_id,org_node_id,role,start_date,appointed_by) VALUES(?,?,?,?,'Cell Leader',date('now'),?)")
        .bind(appointmentId, user.organization_id, pioneer.id, childCellId, user.id),
      // 5. Audit log
      c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
        .bind(id('audit'), user.organization_id, user.id, 'CELL_MULTIPLIED', 'cell', childCellId, `${parent.name} produced ${input.name} under ${pioneer.full_name}`),
      // 6. Broadcast notification
      c.env.DB.prepare('INSERT INTO notifications(id,organization_id,title,message,type,href) VALUES(?,?,?,?,?,?)')
        .bind(id('not'), user.organization_id, 'Cell multiplied!', `${parent.name} has birthed ${input.name} led by ${pioneer.full_name}.`, 'growth', '/genealogy'),
    ])
    return c.json({ id: childCellId, multiplication_id: multEventId }, 201)
  } catch (err: any) {
    return c.json({ error: err.message || 'Multiplication failed' }, 409)
  }
})

app.get('/api/multiplications', auth, async c => {
  const user = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT m.*, p.name parent_name, p.code parent_code, c.name child_name, c.code child_code, pioneer.full_name pioneer_name, u.name approved_by_name
    FROM multiplication_events m
    JOIN org_nodes p ON p.id=m.parent_cell_id
    JOIN org_nodes c ON c.id=m.child_cell_id
    LEFT JOIN people pioneer ON pioneer.id=m.pioneer_id
    LEFT JOIN users u ON u.id=m.approved_by
    WHERE m.organization_id=? ORDER BY m.event_date DESC, m.created_at DESC`).bind(user.organization_id).all()
  return c.json({ multiplications: rows.results })
})

// Genealogy endpoints
app.get('/api/genealogy', auth, async c => {
  const user = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT n.id,n.parent_id,n.name,n.code,n.status,n.location,n.created_at,
    (SELECT COUNT(*) FROM people p WHERE p.cell_id=n.id) members,
    (SELECT full_name FROM people p WHERE p.cell_id=n.id AND p.leadership_stage='Cell Leader' LIMIT 1) leader,
    (SELECT COUNT(*) FROM org_nodes ch WHERE ch.parent_id=n.id AND ch.node_type='cell') descendants
    FROM org_nodes n WHERE n.organization_id=? AND n.node_type='cell' ORDER BY n.created_at`).bind(user.organization_id).all()
  return c.json({ nodes: rows.results })
})

app.get('/api/leadership-genealogy', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT p.id,p.discipled_by_person_id parent_id,p.full_name name,p.leadership_stage code,p.status,n.name location,
    (SELECT COUNT(*) FROM people ch WHERE ch.discipled_by_person_id=p.id) members,
    p.joined_at
    FROM people p LEFT JOIN org_nodes n ON n.id=p.cell_id WHERE p.organization_id=? ORDER BY p.joined_at`).bind(u.organization_id).all()
  return c.json({ nodes: rows.results })
})

// -------------------------------------------------------------
// People & Discipleship Journeys
// -------------------------------------------------------------
app.get('/api/people', auth, async c => {
  const user = c.get('user'), query = (c.req.query('q') || '').trim()
  const like = `%${query}%`
  const rows = await c.env.DB.prepare(`SELECT p.*,n.name cell_name,d.full_name discipled_by_name,
    (SELECT COUNT(*) FROM people ch WHERE ch.discipled_by_person_id=p.id) disciples_count
    FROM people p
    LEFT JOIN org_nodes n ON n.id=p.cell_id
    LEFT JOIN people d ON d.id=p.discipled_by_person_id
    WHERE p.organization_id=? AND (?='' OR p.full_name LIKE ? OR p.email LIKE ? OR p.phone LIKE ? OR n.name LIKE ?)
    ORDER BY p.full_name LIMIT 150`).bind(user.organization_id, query, like, like, like, like).all()
  return c.json({ people: rows.results })
})

const personSchema = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  phone: z.string().trim().max(30).optional(),
  cell_id: z.string().min(1),
  leadership_stage: z.enum(['Member', 'Potential Leader', 'Class Teacher', 'Assistant Leader', 'Cell Leader']),
  discipled_by_person_id: z.string().optional(),
})

app.post('/api/people', auth, operatorOnly, zValidator('json', personSchema), async c => {
  const user = c.get('user'), input = c.req.valid('json'), personId = id('person')
  const cell = await c.env.DB.prepare("SELECT id FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(input.cell_id, user.organization_id).first()
  if (!cell) return c.json({ error: 'Select a valid cell' }, 400)

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO people(id,organization_id,cell_id,full_name,email,phone,leadership_stage,status,discipled_by_person_id) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(personId, user.organization_id, input.cell_id, input.full_name, input.email || null, input.phone || null, input.leadership_stage, input.leadership_stage.includes('Leader') ? 'leader' : 'member', input.discipled_by_person_id || null),
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), user.organization_id, user.id, 'CREATED', 'person', personId, input.full_name),
  ])
  return c.json({ id: personId }, 201)
})

// Detailed profile of a single person with journey milestones
app.get('/api/people/:id', auth, async c => {
  const user = c.get('user'), personId = c.req.param('id')
  const person = await c.env.DB.prepare(`SELECT p.*, n.name cell_name, n.code cell_code, d.full_name discipled_by_name
    FROM people p LEFT JOIN org_nodes n ON n.id=p.cell_id LEFT JOIN people d ON d.id=p.discipled_by_person_id
    WHERE p.id=? AND p.organization_id=?`).bind(personId, user.organization_id).first<any>()
  if (!person) return c.json({ error: 'Person not found' }, 404)

  const [disciples, enrollments, roles, attendance] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, full_name, leadership_stage, email, phone FROM people WHERE discipled_by_person_id=?').bind(personId),
    c.env.DB.prepare(`SELECT e.*, b.name class_name, b.stage class_stage
      FROM class_enrollments e JOIN bible_classes b ON b.id=e.class_id WHERE e.person_id=? ORDER BY e.enrolled_at DESC`).bind(personId),
    c.env.DB.prepare(`SELECT a.*, n.name scope_name FROM role_assignments a JOIN org_nodes n ON n.id=a.org_node_id WHERE a.person_id=? ORDER BY a.start_date DESC`).bind(personId),
    c.env.DB.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN attendance_status='present' THEN 1 ELSE 0 END) present
      FROM meeting_attendance WHERE person_id=?`).bind(personId),
  ])

  const attRow = attendance.results[0] as { total: number; present: number } | undefined
  const rate = attRow && attRow.total > 0 ? Math.round((attRow.present / attRow.total) * 100) : 100

  return c.json({
    person,
    disciples: disciples.results,
    enrollments: enrollments.results,
    roles: roles.results,
    attendanceRate: rate,
    totalMeetings: attRow?.total || 0,
  })
})

const updatePersonSchema = z.object({
  full_name: z.string().trim().min(2).max(100).optional(),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  phone: z.string().trim().max(30).optional(),
  cell_id: z.string().optional(),
  leadership_stage: z.enum(['Member', 'Potential Leader', 'Class Teacher', 'Assistant Leader', 'Cell Leader']).optional(),
  discipled_by_person_id: z.string().nullable().optional(),
})

app.patch('/api/people/:id', auth, operatorOnly, zValidator('json', updatePersonSchema), async c => {
  const user = c.get('user'), personId = c.req.param('id'), data = c.req.valid('json')
  const person = await c.env.DB.prepare('SELECT id, full_name, leadership_stage FROM people WHERE id=? AND organization_id=?').bind(personId, user.organization_id).first<any>()
  if (!person) return c.json({ error: 'Person not found' }, 404)

  const sets: string[] = []
  const values: any[] = []
  for (const [key, val] of Object.entries(data)) {
    if (val !== undefined) {
      sets.push(`${key}=?`)
      values.push(val)
    }
  }
  if (data.leadership_stage) {
    sets.push('status=?')
    values.push(data.leadership_stage.includes('Leader') ? 'leader' : 'member')
  }
  if (!sets.length) return c.json({ ok: true })

  values.push(personId, user.organization_id)
  await c.env.DB.prepare(`UPDATE people SET ${sets.join(', ')} WHERE id=? AND organization_id=?`).bind(...values).run()

  if (data.leadership_stage && data.leadership_stage !== person.leadership_stage) {
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
        .bind(id('audit'), user.organization_id, user.id, 'LEADERSHIP_PROMOTED', 'person', personId, `Promoted to ${data.leadership_stage}`),
      c.env.DB.prepare('INSERT INTO notifications(id,organization_id,title,message,type,href) VALUES(?,?,?,?,?,?)')
        .bind(id('not'), user.organization_id, 'Leadership milestone', `${person.full_name} advanced to ${data.leadership_stage}.`, 'growth', '/people'),
    ])
  }
  return c.json({ ok: true })
})

const importPeopleSchema = z.object({
  records: z.array(z.object({
    full_name: z.string().trim().min(2).max(100),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    phone: z.string().max(30).optional(),
    cell_code: z.string().min(1).max(16),
    leadership_stage: z.enum(['Member', 'Potential Leader', 'Class Teacher', 'Assistant Leader', 'Cell Leader']).default('Member'),
  })).min(1).max(500),
})

app.post('/api/people/import', auth, operatorOnly, zValidator('json', importPeopleSchema), async c => {
  const u = c.get('user'), records = c.req.valid('json').records
  const cells = await c.env.DB.prepare("SELECT id,code FROM org_nodes WHERE organization_id=? AND node_type='cell'").bind(u.organization_id).all()
  const byCode = new Map(cells.results.map(row => [String(row.code).toUpperCase(), String(row.id)]))
  const invalid = [...new Set(records.filter(row => !byCode.has(row.cell_code.toUpperCase())).map(row => row.cell_code))]
  if (invalid.length) return c.json({ error: `Unknown cell codes: ${invalid.join(', ')}` }, 400)

  await c.env.DB.batch(records.map(row =>
    c.env.DB.prepare('INSERT INTO people(id,organization_id,cell_id,full_name,email,phone,leadership_stage,status) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id('person'), u.organization_id, byCode.get(row.cell_code.toUpperCase()), row.full_name, row.email || null, row.phone || null, row.leadership_stage, row.leadership_stage.includes('Leader') ? 'leader' : 'member')
  ))
  await c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
    .bind(id('audit'), u.organization_id, u.id, 'BULK_IMPORT', 'people', u.id, `Imported ${records.length} people`).run()
  return c.json({ ok: true, imported: records.length }, 201)
})

app.get('/api/people/export.csv', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT p.full_name,p.email,p.phone,n.code cell_code,n.name cell_name,p.leadership_stage,p.status,p.joined_at
    FROM people p LEFT JOIN org_nodes n ON n.id=p.cell_id WHERE p.organization_id=? ORDER BY p.full_name`).bind(u.organization_id).all()
  const columns = ['full_name', 'email', 'phone', 'cell_code', 'cell_name', 'leadership_stage', 'status', 'joined_at']
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [columns.join(','), ...rows.results.map(row => columns.map(key => escape((row as Record<string, unknown>)[key])).join(','))].join('\n')
  c.header('content-type', 'text/csv; charset=utf-8')
  c.header('content-disposition', 'attachment; filename="people.csv"')
  return c.body(csv)
})

// -------------------------------------------------------------
// Bible Study Classes & Enrollments
// -------------------------------------------------------------
app.get('/api/classes', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT b.*,n.name cell_name,p.full_name teacher,
    (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id=b.id) enrolled,
    (SELECT COUNT(*) FROM class_enrollments e WHERE e.class_id=b.id AND e.status='completed') graduated
    FROM bible_classes b
    JOIN org_nodes n ON n.id=b.cell_id
    LEFT JOIN people p ON p.id=b.teacher_id
    WHERE b.organization_id=? ORDER BY b.created_at DESC`).bind(u.organization_id).all()
  return c.json({ classes: rows.results })
})

const classSchema = z.object({
  name: z.string().trim().min(2).max(100),
  cell_id: z.string(),
  teacher_id: z.string().optional(),
  schedule: z.string().max(80).optional(),
  stage: z.enum(['Foundation', 'New Believers', 'Leadership', 'Bible Study']),
})

app.post('/api/classes', auth, operatorOnly, zValidator('json', classSchema), async c => {
  const u = c.get('user'), v = c.req.valid('json'), classId = id('class')
  const cell = await c.env.DB.prepare("SELECT id FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(v.cell_id, u.organization_id).first()
  if (!cell) return c.json({ error: 'Select a valid cell' }, 400)
  if (v.teacher_id && !await c.env.DB.prepare('SELECT id FROM people WHERE id=? AND organization_id=?').bind(v.teacher_id, u.organization_id).first()) {
    return c.json({ error: 'Select a teacher in your organization' }, 400)
  }
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO bible_classes(id,organization_id,cell_id,name,teacher_id,schedule,stage) VALUES(?,?,?,?,?,?,?)')
      .bind(classId, u.organization_id, v.cell_id, v.name, v.teacher_id || null, v.schedule || null, v.stage),
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), u.organization_id, u.id, 'CREATED', 'bible_class', classId, v.name),
  ])
  return c.json({ id: classId }, 201)
})

// Detailed class view with students roster
app.get('/api/classes/:id', auth, async c => {
  const u = c.get('user'), classId = c.req.param('id')
  const cl = await c.env.DB.prepare(`SELECT b.*, n.name cell_name, p.full_name teacher
    FROM bible_classes b JOIN org_nodes n ON n.id=b.cell_id LEFT JOIN people p ON p.id=b.teacher_id
    WHERE b.id=? AND b.organization_id=?`).bind(classId, u.organization_id).first<any>()
  if (!cl) return c.json({ error: 'Class not found' }, 404)

  const students = await c.env.DB.prepare(`SELECT e.id enrollment_id, e.status, e.enrolled_at, e.completed_at,
    p.id person_id, p.full_name, p.email, p.phone, p.leadership_stage, n.name cell_name
    FROM class_enrollments e
    JOIN people p ON p.id=e.person_id
    LEFT JOIN org_nodes n ON n.id=p.cell_id
    WHERE e.class_id=? ORDER BY e.enrolled_at DESC`).bind(classId).all()

  return c.json({ class: cl, students: students.results })
})

// Enroll a person in a Bible class
app.post('/api/classes/:id/enroll', auth, operatorOnly, zValidator('json', z.object({ person_id: z.string().min(1) })), async c => {
  const u = c.get('user'), classId = c.req.param('id'), { person_id } = c.req.valid('json')
  const cl = await c.env.DB.prepare('SELECT id, name FROM bible_classes WHERE id=? AND organization_id=?').bind(classId, u.organization_id).first<any>()
  if (!cl) return c.json({ error: 'Class not found' }, 404)

  const person = await c.env.DB.prepare('SELECT id, full_name FROM people WHERE id=? AND organization_id=?').bind(person_id, u.organization_id).first<any>()
  if (!person) return c.json({ error: 'Person not found' }, 404)

  const enrollmentId = id('ce')
  try {
    await c.env.DB.prepare('INSERT INTO class_enrollments(id,class_id,person_id,status,enrolled_at) VALUES(?,?,?,\'in_progress\',date(\'now\'))')
      .bind(enrollmentId, classId, person_id).run()
    await c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), u.organization_id, u.id, 'ENROLLED', 'bible_class', classId, `${person.full_name} enrolled in ${cl.name}`).run()
    return c.json({ id: enrollmentId }, 201)
  } catch {
    return c.json({ error: 'This person is already enrolled in this class' }, 409)
  }
})

// Update student enrollment (e.g. mark completed / graduate)
app.patch('/api/classes/:id/enrollments/:personId', auth, operatorOnly, zValidator('json', z.object({ status: z.enum(['in_progress', 'completed', 'paused']) })), async c => {
  const u = c.get('user'), classId = c.req.param('id'), personId = c.req.param('personId'), { status } = c.req.valid('json')
  const completedAt = status === 'completed' ? new Date().toISOString().slice(0, 10) : null
  const res = await c.env.DB.prepare("UPDATE class_enrollments SET status=?, completed_at=? WHERE class_id=? AND person_id=?")
    .bind(status, completedAt, classId, personId).run()
  if (!res.meta.changes) return c.json({ error: 'Enrollment record not found' }, 404)

  if (status === 'completed') {
    await c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), u.organization_id, u.id, 'CLASS_GRADUATED', 'bible_class', classId, `Student graduated from class`).run()
  }
  return c.json({ ok: true })
})

// -------------------------------------------------------------
// Follow-ups & Care Journeys
// -------------------------------------------------------------
app.get('/api/follow-ups', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT f.*,n.name cell_name,p.full_name assignee
    FROM follow_ups f JOIN org_nodes n ON n.id=f.cell_id LEFT JOIN people p ON p.id=f.assigned_to
    WHERE f.organization_id=?
    ORDER BY CASE f.status WHEN 'new' THEN 0 WHEN 'contacted' THEN 1 WHEN 'returned' THEN 2 ELSE 3 END,f.due_at`).bind(u.organization_id).all()
  return c.json({ followUps: rows.results })
})

const followUpSchema = z.object({
  person_name: z.string().trim().min(2).max(100),
  phone: z.string().max(30).optional(),
  cell_id: z.string(),
  assigned_to: z.string().optional(),
  source: z.enum(['First timer', 'New convert', 'Outreach', 'Referral']),
  due_at: z.string().date(),
  notes: z.string().max(500).optional(),
})

app.post('/api/follow-ups', auth, operatorOnly, zValidator('json', followUpSchema), async c => {
  const u = c.get('user'), v = c.req.valid('json'), followId = id('followup')
  const cell = await c.env.DB.prepare("SELECT id FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(v.cell_id, u.organization_id).first()
  if (!cell) return c.json({ error: 'Select a valid cell' }, 400)
  if (v.assigned_to && !await c.env.DB.prepare('SELECT id FROM people WHERE id=? AND organization_id=?').bind(v.assigned_to, u.organization_id).first()) {
    return c.json({ error: 'Select an assignee in your organization' }, 400)
  }
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO follow_ups(id,organization_id,person_name,phone,cell_id,assigned_to,source,due_at,notes) VALUES(?,?,?,?,?,?,?,?,?)')
      .bind(followId, u.organization_id, v.person_name, v.phone || null, v.cell_id, v.assigned_to || null, v.source, v.due_at, v.notes || null),
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), u.organization_id, u.id, 'CREATED', 'follow_up', followId, v.person_name),
  ])
  return c.json({ id: followId }, 201)
})

app.patch('/api/follow-ups/:id/status', auth, operatorOnly, zValidator('json', z.object({ status: z.enum(['new', 'contacted', 'returned', 'joined']) })), async c => {
  const u = c.get('user'), v = c.req.valid('json')
  const result = await c.env.DB.prepare("UPDATE follow_ups SET status=?,updated_at=datetime('now') WHERE id=? AND organization_id=?")
    .bind(v.status, c.req.param('id'), u.organization_id).run()
  if (!result.meta.changes) return c.json({ error: 'Follow-up not found' }, 404)
  await c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
    .bind(id('audit'), u.organization_id, u.id, 'STATUS_CHANGED', 'follow_up', c.req.param('id'), v.status).run()
  return c.json({ ok: true })
})

// Convert follow-up contact into full registered member
app.post('/api/follow-ups/:id/convert-to-member', auth, operatorOnly, async c => {
  const u = c.get('user'), followId = c.req.param('id')
  const fu = await c.env.DB.prepare('SELECT * FROM follow_ups WHERE id=? AND organization_id=?').bind(followId, u.organization_id).first<any>()
  if (!fu) return c.json({ error: 'Follow-up not found' }, 404)

  const personId = id('person')
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO people(id,organization_id,cell_id,full_name,phone,status,leadership_stage,discipled_by_person_id) VALUES(?,?,?,?,?,\'member\',\'Member\',?)')
      .bind(personId, u.organization_id, fu.cell_id, fu.person_name, fu.phone || null, fu.assigned_to || null),
    c.env.DB.prepare("UPDATE follow_ups SET status='joined',updated_at=datetime('now') WHERE id=?").bind(followId),
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), u.organization_id, u.id, 'CONVERTED_TO_MEMBER', 'person', personId, `${fu.person_name} joined cell registry`),
    c.env.DB.prepare('INSERT INTO notifications(id,organization_id,title,message,type,href) VALUES(?,?,?,?,?,?)')
      .bind(id('not'), u.organization_id, 'New member registered', `${fu.person_name} completed care journey and joined the cell.`, 'growth', '/people'),
  ])
  return c.json({ id: personId, message: 'Person successfully enrolled in cell' }, 201)
})

// -------------------------------------------------------------
// Meetings & Individual Attendance
// -------------------------------------------------------------
app.get('/api/meetings', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT m.*,n.name cell_name,us.name submitted_by_name
    FROM meetings m JOIN org_nodes n ON n.id=m.cell_id LEFT JOIN users us ON us.id=m.submitted_by
    WHERE m.organization_id=? ORDER BY held_at DESC LIMIT 100`).bind(u.organization_id).all()
  return c.json({ meetings: rows.results })
})

const meetingSchema = z.object({
  cell_id: z.string(),
  meeting_type: z.enum(['Cell Meeting', 'Bible Study', 'Outreach', 'Leadership Meeting']),
  held_at: z.string().date(),
  attendance: z.coerce.number().int().min(0).max(100000),
  first_timers: z.coerce.number().int().min(0).max(100000),
  new_converts: z.coerce.number().int().min(0).max(100000),
  notes: z.string().max(1000).optional(),
}).refine(v => v.first_timers <= v.attendance, { message: 'First timers cannot exceed attendance', path: ['first_timers'] })

app.post('/api/meetings', auth, operatorOnly, zValidator('json', meetingSchema), async c => {
  const u = c.get('user'), v = c.req.valid('json'), meetingId = id('meeting')
  const cell = await c.env.DB.prepare("SELECT id, name FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(v.cell_id, u.organization_id).first<{ id: string; name: string }>()
  if (!cell) return c.json({ error: 'Select a valid cell' }, 400)

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO meetings(id,organization_id,cell_id,meeting_type,held_at,attendance,first_timers,new_converts,notes,submitted_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind(meetingId, u.organization_id, v.cell_id, v.meeting_type, v.held_at, v.attendance, v.first_timers, v.new_converts, v.notes || null, u.id),
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), u.organization_id, u.id, 'SUBMITTED', 'meeting', meetingId, `${cell.name} · ${v.meeting_type}`),
    c.env.DB.prepare('INSERT INTO notifications(id,organization_id,title,message,type,href) VALUES(?,?,?,?,?,?)')
      .bind(id('not'), u.organization_id, 'New report submitted', `${cell.name} submitted a ${v.meeting_type} report (${v.attendance} present).`, 'review', '/reports'),
  ])
  return c.json({ id: meetingId }, 201)
})

app.get('/api/meetings/:id/attendance', auth, async c => {
  const u = c.get('user'), meetingId = c.req.param('id')
  const meeting = await c.env.DB.prepare('SELECT cell_id, held_at, meeting_type FROM meetings WHERE id=? AND organization_id=?').bind(meetingId, u.organization_id).first<{ cell_id: string; held_at: string; meeting_type: string }>()
  if (!meeting) return c.json({ error: 'Meeting not found' }, 404)

  const rows = await c.env.DB.prepare(`SELECT p.id person_id,p.full_name,p.leadership_stage,COALESCE(a.attendance_status,'absent') attendance_status
    FROM people p LEFT JOIN meeting_attendance a ON a.person_id=p.id AND a.meeting_id=?
    WHERE p.organization_id=? AND p.cell_id=? ORDER BY p.leadership_stage DESC, p.full_name`).bind(meetingId, u.organization_id, meeting.cell_id).all()
  return c.json({ attendance: rows.results, meeting })
})

app.put('/api/meetings/:id/attendance', auth, operatorOnly, zValidator('json', z.object({ records: z.array(z.object({ person_id: z.string(), attendance_status: z.enum(['present', 'absent', 'excused']) })).max(500) })), async c => {
  const u = c.get('user'), records = c.req.valid('json').records, meetingId = c.req.param('id')
  const meeting = await c.env.DB.prepare('SELECT cell_id FROM meetings WHERE id=? AND organization_id=?').bind(meetingId, u.organization_id).first<{ cell_id: string }>()
  if (!meeting) return c.json({ error: 'Meeting not found' }, 404)

  const valid = await c.env.DB.prepare('SELECT id FROM people WHERE organization_id=? AND cell_id=?').bind(u.organization_id, meeting.cell_id).all()
  const validIds = new Set(valid.results.map(row => String(row.id)))
  if (records.some(row => !validIds.has(row.person_id))) return c.json({ error: 'Attendance includes a person outside this cell' }, 400)

  const statements = records.map(row =>
    c.env.DB.prepare(`INSERT INTO meeting_attendance(id,meeting_id,person_id,attendance_status) VALUES(?,?,?,?) ON CONFLICT(meeting_id,person_id) DO UPDATE SET attendance_status=excluded.attendance_status`)
      .bind(id('attendance'), meetingId, row.person_id, row.attendance_status)
  )
  if (statements.length) await c.env.DB.batch(statements)

  const presentCount = records.filter(r => r.attendance_status === 'present').length
  await c.env.DB.prepare('UPDATE meetings SET attendance=? WHERE id=? AND organization_id=?').bind(presentCount, meetingId, u.organization_id).run()

  return c.json({ ok: true, count: records.length, presentCount })
})

// -------------------------------------------------------------
// Reports & Review
// -------------------------------------------------------------
app.get('/api/reports', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT m.*,n.name cell_name,us.name submitted_by_name
    FROM meetings m JOIN org_nodes n ON n.id=m.cell_id JOIN users us ON us.id=m.submitted_by
    WHERE m.organization_id=? ORDER BY held_at DESC`).bind(u.organization_id).all()
  return c.json({ reports: rows.results })
})

app.patch('/api/reports/:id/review', auth, reviewerOnly, zValidator('json', z.object({ decision: z.enum(['approved', 'returned']), notes: z.string().optional() })), async c => {
  const u = c.get('user'), { decision, notes } = c.req.valid('json'), meetingId = c.req.param('id')
  const result = await c.env.DB.prepare('UPDATE meetings SET status=? WHERE id=? AND organization_id=?').bind(decision, meetingId, u.organization_id).run()
  if (!result.meta.changes) return c.json({ error: 'Report not found' }, 404)

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), u.organization_id, u.id, decision.toUpperCase(), 'meeting', meetingId, notes ? `${decision}: ${notes}` : decision),
    c.env.DB.prepare('INSERT INTO notifications(id,organization_id,title,message,type,href) VALUES(?,?,?,?,?,?)')
      .bind(id('not'), u.organization_id, `Report ${decision}`, `Meeting report was marked as ${decision}.`, decision === 'approved' ? 'growth' : 'review', '/reports'),
  ])
  return c.json({ ok: true })
})

app.get('/api/reports/export.csv', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT m.held_at,n.name cell,n.code cell_code,m.meeting_type,m.attendance,m.first_timers,m.new_converts,m.status,u.name submitted_by
    FROM meetings m JOIN org_nodes n ON n.id=m.cell_id JOIN users u ON u.id=m.submitted_by WHERE m.organization_id=? ORDER BY m.held_at DESC`).bind(u.organization_id).all()
  const columns = ['held_at', 'cell', 'cell_code', 'meeting_type', 'attendance', 'first_timers', 'new_converts', 'status', 'submitted_by']
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [columns.join(','), ...rows.results.map(row => columns.map(key => escape((row as Record<string, unknown>)[key])).join(','))].join('\n')
  c.header('content-type', 'text/csv; charset=utf-8')
  c.header('content-disposition', 'attachment; filename="ministry-reports.csv"')
  return c.body(csv)
})

app.get('/api/reports/trends', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT held_at, meeting_type, SUM(attendance) attendance, SUM(first_timers) first_timers, SUM(new_converts) new_converts
    FROM meetings WHERE organization_id=? GROUP BY held_at, meeting_type ORDER BY held_at ASC LIMIT 20`).bind(u.organization_id).all()
  return c.json({ trends: rows.results })
})

// -------------------------------------------------------------
// Territory / Map Intelligence
// -------------------------------------------------------------
app.get('/api/map', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT n.id,n.name,n.code,n.location,n.latitude,n.longitude,n.status,n.meeting_day,n.meeting_time,
    (SELECT COUNT(*) FROM people p WHERE p.cell_id=n.id) members,
    (SELECT full_name FROM people p WHERE p.cell_id=n.id AND p.leadership_stage='Cell Leader' LIMIT 1) leader
    FROM org_nodes n WHERE n.organization_id=? AND n.node_type='cell' AND n.latitude IS NOT NULL`).bind(u.organization_id).all()
  return c.json({ cells: rows.results })
})

app.get('/api/map/analysis', auth, async c => {
  const u = c.get('user')
  const cells = await c.env.DB.prepare(`SELECT n.id,n.name,n.code,n.location,n.latitude,n.longitude,
    (SELECT COUNT(*) FROM people p WHERE p.cell_id=n.id) members
    FROM org_nodes n WHERE n.organization_id=? AND n.node_type='cell' AND n.latitude IS NOT NULL`).bind(u.organization_id).all<any>()

  const list = cells.results
  const overlaps: { cellA: string; cellB: string; distanceKm: number }[] = []
  function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const d = haversine(list[i].latitude, list[i].longitude, list[j].latitude, list[j].longitude)
      if (d < 3.0) {
        overlaps.push({ cellA: list[i].name, cellB: list[j].name, distanceKm: Math.round(d * 10) / 10 })
      }
    }
  }

  const expansionCandidates = [
    { area: 'Woji Estate', recommendedPioneer: 'From Harbour of Hope', lat: 4.825, lng: 7.065, rationale: 'Fast-growing residential zone with no immediate coverage.' },
    { area: 'Choba Campus Boundary', recommendedPioneer: 'From Victory House', lat: 4.898, lng: 6.918, rationale: 'High student population with great leadership potential.' },
    { area: 'Peter Odili Corridor', recommendedPioneer: 'From Radiant Life', lat: 4.802, lng: 7.039, rationale: 'New business district ripe for professional lunch-hour cells.' },
  ]

  return c.json({ overlaps, expansionCandidates, totalMapped: list.length })
})

// -------------------------------------------------------------
// Calendar
// -------------------------------------------------------------
app.get('/api/calendar', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare('SELECT e.*,n.name scope_name FROM calendar_events e LEFT JOIN org_nodes n ON n.id=e.org_node_id WHERE e.organization_id=? ORDER BY e.starts_at').bind(u.organization_id).all()
  return c.json({ events: rows.results })
})

const eventSchema = z.object({
  title: z.string().trim().min(2).max(120),
  event_type: z.enum(['Cell Meeting', 'Bible Study', 'Outreach', 'Leadership', 'Training', 'Special Event']),
  starts_at: z.string().min(16),
  ends_at: z.string().optional(),
  org_node_id: z.string().optional(),
  location: z.string().max(120).optional(),
  recurrence: z.enum(['none', 'weekly', 'monthly']),
})

app.post('/api/calendar', auth, operatorOnly, zValidator('json', eventSchema), async c => {
  const u = c.get('user'), v = c.req.valid('json'), eventId = id('event')
  if (v.org_node_id && !await c.env.DB.prepare('SELECT id FROM org_nodes WHERE id=? AND organization_id=?').bind(v.org_node_id, u.organization_id).first()) {
    return c.json({ error: 'Select a valid ministry scope' }, 400)
  }
  await c.env.DB.prepare('INSERT INTO calendar_events(id,organization_id,org_node_id,title,event_type,starts_at,ends_at,location,recurrence,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(eventId, u.organization_id, v.org_node_id || null, v.title, v.event_type, v.starts_at, v.ends_at || null, v.location || null, v.recurrence, u.id).run()
  return c.json({ id: eventId }, 201)
})

app.delete('/api/calendar/:id', auth, operatorOnly, async c => {
  const u = c.get('user'), eventId = c.req.param('id')
  const res = await c.env.DB.prepare('DELETE FROM calendar_events WHERE id=? AND organization_id=?').bind(eventId, u.organization_id).run()
  if (!res.meta.changes) return c.json({ error: 'Event not found' }, 404)
  return c.json({ ok: true })
})

// -------------------------------------------------------------
// Governance: Member Transfers & Appointments
// -------------------------------------------------------------
app.get('/api/transfers', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT t.*,p.full_name person_name,f.name from_cell,toc.name to_cell,requester.name requested_by_name
    FROM member_transfers t JOIN people p ON p.id=t.person_id JOIN org_nodes f ON f.id=t.from_cell_id JOIN org_nodes toc ON toc.id=t.to_cell_id JOIN users requester ON requester.id=t.requested_by
    WHERE t.organization_id=? ORDER BY t.created_at DESC`).bind(u.organization_id).all()
  return c.json({ transfers: rows.results })
})

const transferSchema = z.object({
  person_id: z.string(),
  to_cell_id: z.string(),
  category: z.enum(['Relocation', 'Pastoral assignment', 'Catchment change', 'Other']),
  notes: z.string().max(500).optional(),
})

app.post('/api/transfers', auth, operatorOnly, zValidator('json', transferSchema), async c => {
  const u = c.get('user'), v = c.req.valid('json'), transferId = id('transfer')
  const person = await c.env.DB.prepare('SELECT cell_id, full_name FROM people WHERE id=? AND organization_id=?').bind(v.person_id, u.organization_id).first<{ cell_id: string; full_name: string }>()
  if (!person) return c.json({ error: 'Person not found' }, 404)
  if (person.cell_id === v.to_cell_id) return c.json({ error: 'Choose a different receiving cell' }, 400)
  const target = await c.env.DB.prepare("SELECT id, name FROM org_nodes WHERE id=? AND organization_id=? AND node_type='cell'").bind(v.to_cell_id, u.organization_id).first<{ id: string; name: string }>()
  if (!target) return c.json({ error: 'Receiving cell not found' }, 404)

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO member_transfers(id,organization_id,person_id,from_cell_id,to_cell_id,category,notes,requested_by) VALUES(?,?,?,?,?,?,?,?)')
      .bind(transferId, u.organization_id, v.person_id, person.cell_id, v.to_cell_id, v.category, v.notes || null, u.id),
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), u.organization_id, u.id, 'TRANSFER_REQUESTED', 'person', v.person_id, `Transfer to ${target.name} requested`),
  ])
  return c.json({ id: transferId }, 201)
})

app.patch('/api/transfers/:id/review', auth, reviewerOnly, zValidator('json', z.object({ decision: z.enum(['approved', 'returned']) })), async c => {
  const u = c.get('user'), v = c.req.valid('json')
  const transfer = await c.env.DB.prepare("SELECT * FROM member_transfers WHERE id=? AND organization_id=? AND status='pending'").bind(c.req.param('id'), u.organization_id).first<any>()
  if (!transfer) return c.json({ error: 'Pending transfer not found' }, 404)

  const statements = [
    c.env.DB.prepare("UPDATE member_transfers SET status=?,reviewed_by=?,reviewed_at=datetime('now') WHERE id=?").bind(v.decision, u.id, transfer.id),
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), u.organization_id, u.id, `TRANSFER_${v.decision.toUpperCase()}`, 'person', transfer.person_id, transfer.id),
  ]
  if (v.decision === 'approved') {
    statements.push(c.env.DB.prepare('UPDATE people SET cell_id=? WHERE id=? AND organization_id=?').bind(transfer.to_cell_id, transfer.person_id, u.organization_id))
  }
  await c.env.DB.batch(statements)
  return c.json({ ok: true })
})

app.get('/api/leadership-assignments', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT a.*,p.full_name person_name,n.name scope_name
    FROM role_assignments a JOIN people p ON p.id=a.person_id JOIN org_nodes n ON n.id=a.org_node_id
    WHERE a.organization_id=? ORDER BY a.start_date DESC`).bind(u.organization_id).all()
  return c.json({ assignments: rows.results })
})

const assignmentSchema = z.object({
  person_id: z.string(),
  org_node_id: z.string(),
  role: z.string().trim().min(2).max(80),
  start_date: z.string().date(),
})

app.post('/api/leadership-assignments', auth, adminOnly, zValidator('json', assignmentSchema), async c => {
  const u = c.get('user'), v = c.req.valid('json'), assignmentId = id('assignment')
  const [person, scope] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT id, full_name FROM people WHERE id=? AND organization_id=?').bind(v.person_id, u.organization_id),
    c.env.DB.prepare('SELECT id, name FROM org_nodes WHERE id=? AND organization_id=?').bind(v.org_node_id, u.organization_id),
  ])
  if (!person.results.length || !scope.results.length) return c.json({ error: 'Person or scope is outside your organization' }, 400)

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO role_assignments(id,organization_id,person_id,org_node_id,role,start_date,appointed_by) VALUES(?,?,?,?,?,?,?)')
      .bind(assignmentId, u.organization_id, v.person_id, v.org_node_id, v.role, v.start_date, u.id),
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), u.organization_id, u.id, 'APPOINTED', 'role_assignment', assignmentId, `${(person.results[0] as any).full_name} appointed ${v.role}`),
  ])
  return c.json({ id: assignmentId }, 201)
})

app.patch('/api/leadership-assignments/:id/end', auth, adminOnly, async c => {
  const u = c.get('user')
  const result = await c.env.DB.prepare("UPDATE role_assignments SET status='ended',end_date=date('now') WHERE id=? AND organization_id=? AND status='active'").bind(c.req.param('id'), u.organization_id).run()
  if (!result.meta.changes) return c.json({ error: 'Active appointment not found' }, 404)
  return c.json({ ok: true })
})

app.get('/api/audit-logs', auth, adminOnly, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare(`SELECT a.*,us.name user_name FROM audit_logs a LEFT JOIN users us ON us.id=a.user_id WHERE a.organization_id=? ORDER BY a.created_at DESC LIMIT 200`).bind(u.organization_id).all()
  return c.json({ logs: rows.results })
})

// -------------------------------------------------------------
// Explainable Intelligence Signals
// -------------------------------------------------------------
app.get('/api/insights', auth, async c => {
  const u = c.get('user')
  const [missing, declining, pipeline, overdue, readyMultiplication] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT n.id,n.name,'Missing report' signal,'No meeting report has been recorded in the last fourteen days.' detail FROM org_nodes n WHERE n.organization_id=? AND n.node_type='cell' AND NOT EXISTS(SELECT 1 FROM meetings m WHERE m.cell_id=n.id AND m.held_at>=date('now','-14 day')) LIMIT 4`).bind(u.organization_id),
    c.env.DB.prepare(`SELECT n.id,n.name,'Attendance attention' signal,'Recent attendance has dropped below 20 participants.' detail FROM org_nodes n JOIN meetings m ON m.cell_id=n.id WHERE n.organization_id=? GROUP BY n.id HAVING AVG(m.attendance)<25 LIMIT 4`).bind(u.organization_id),
    c.env.DB.prepare("SELECT id,full_name name,'Leadership opportunity' signal,'Identified as a high-potential leader ready for next ministry step.' detail FROM people WHERE organization_id=? AND leadership_stage='Potential Leader' LIMIT 4").bind(u.organization_id),
    c.env.DB.prepare("SELECT id,person_name name,'Follow-up overdue' signal,'Care contact deadline has elapsed without completed connection.' detail FROM follow_ups WHERE organization_id=? AND status!='joined' AND due_at<date('now') LIMIT 4").bind(u.organization_id),
    c.env.DB.prepare(`SELECT n.id,n.name,'Ready for multiplication' signal,'Cell has reached healthy capacity with multiple potential leaders.' detail FROM org_nodes n WHERE n.organization_id=? AND n.node_type='cell' AND (SELECT COUNT(*) FROM people p WHERE p.cell_id=n.id) >= 6 LIMIT 4`).bind(u.organization_id),
  ])
  return c.json({ insights: [...missing.results, ...declining.results, ...pipeline.results, ...overdue.results, ...readyMultiplication.results] })
})

// -------------------------------------------------------------
// Standards Engine
// -------------------------------------------------------------
app.get('/api/standards', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare('SELECT * FROM standard_sets WHERE organization_id=? ORDER BY effective_at DESC').bind(u.organization_id).all()
  return c.json({ standards: rows.results })
})

const standardSchema = z.object({
  name: z.string().trim().min(2).max(100),
  version: z.string().trim().min(1).max(20),
  source: z.string().trim().min(2).max(120),
  effective_at: z.string().date(),
  weeklyReportDue: z.string().max(60),
  approvalRequired: z.boolean(),
})

app.post('/api/standards', auth, adminOnly, zValidator('json', standardSchema), async c => {
  const u = c.get('user'), v = c.req.valid('json'), standardId = id('standard')
  try {
    await c.env.DB.prepare("INSERT INTO standard_sets(id,organization_id,name,version,source,effective_at,status,rules_json,created_by) VALUES(?,?,?,?,?,?,'draft',?,?)")
      .bind(standardId, u.organization_id, v.name, v.version, v.source, v.effective_at, JSON.stringify({ weeklyReportDue: v.weeklyReportDue, approvalRequired: v.approvalRequired }), u.id).run()
    return c.json({ id: standardId }, 201)
  } catch {
    return c.json({ error: 'That standard version already exists' }, 409)
  }
})

app.patch('/api/standards/:id/activate', auth, adminOnly, async c => {
  const u = c.get('user'), standardId = c.req.param('id')
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE standard_sets SET status='archived' WHERE organization_id=? AND status='active'").bind(u.organization_id),
    c.env.DB.prepare("UPDATE standard_sets SET status='active' WHERE id=? AND organization_id=?").bind(standardId, u.organization_id),
    c.env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,detail) VALUES(?,?,?,?,?,?,?)')
      .bind(id('audit'), u.organization_id, u.id, 'ACTIVATED', 'standard_set', standardId, 'Standard set activated'),
  ])
  return c.json({ ok: true })
})

// -------------------------------------------------------------
// Resources
// -------------------------------------------------------------
app.get('/api/resources', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare("SELECT * FROM resources WHERE organization_id=? AND status!='archived' ORDER BY published_at DESC").bind(u.organization_id).all()
  return c.json({ resources: rows.results })
})

const resourceSchema = z.object({
  title: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(60),
  description: z.string().max(500).optional(),
  url: z.string().url(),
  version: z.string().max(30).optional(),
})

app.post('/api/resources', auth, adminOnly, zValidator('json', resourceSchema), async c => {
  const u = c.get('user'), v = c.req.valid('json'), resourceId = id('resource')
  await c.env.DB.prepare('INSERT INTO resources(id,organization_id,title,category,description,url,version,created_by) VALUES(?,?,?,?,?,?,?,?)')
    .bind(resourceId, u.organization_id, v.title, v.category, v.description || null, v.url, v.version || null, u.id).run()
  return c.json({ id: resourceId }, 201)
})

// -------------------------------------------------------------
// Notifications
// -------------------------------------------------------------
app.get('/api/notifications', auth, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare('SELECT * FROM notifications WHERE organization_id=? AND (user_id=? OR user_id IS NULL) ORDER BY created_at DESC LIMIT 30').bind(u.organization_id, u.id).all()
  return c.json({ notifications: rows.results })
})

app.patch('/api/notifications/:id/read', auth, async c => {
  const u = c.get('user')
  await c.env.DB.prepare("UPDATE notifications SET read_at=datetime('now') WHERE id=? AND organization_id=? AND (user_id=? OR user_id IS NULL)").bind(c.req.param('id'), u.organization_id, u.id).run()
  return c.json({ ok: true })
})

app.post('/api/notifications/read-all', auth, async c => {
  const u = c.get('user')
  await c.env.DB.prepare("UPDATE notifications SET read_at=datetime('now') WHERE organization_id=? AND (user_id=? OR user_id IS NULL) AND read_at IS NULL").bind(u.organization_id, u.id).run()
  return c.json({ ok: true })
})

// -------------------------------------------------------------
// Search
// -------------------------------------------------------------
app.get('/api/search', auth, async c => {
  const u = c.get('user'), q = (c.req.query('q') || '').trim()
  if (q.length < 2) return c.json({ results: [] })
  const like = `%${q}%`
  const [people, cells, resources, classes] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT id,full_name title,leadership_stage subtitle,'person' type,'/people' href FROM people WHERE organization_id=? AND (full_name LIKE ? OR email LIKE ? OR phone LIKE ?) LIMIT 5").bind(u.organization_id, like, like, like),
    c.env.DB.prepare("SELECT id,name title,code||' · '||COALESCE(location,'') subtitle,'cell' type,'/cells' href FROM org_nodes WHERE organization_id=? AND node_type='cell' AND (name LIKE ? OR code LIKE ? OR location LIKE ?) LIMIT 5").bind(u.organization_id, like, like, like),
    c.env.DB.prepare("SELECT id,title,category subtitle,'resource' type,'/resources' href FROM resources WHERE organization_id=? AND status='published' AND (title LIKE ? OR category LIKE ?) LIMIT 4").bind(u.organization_id, like, like),
    c.env.DB.prepare("SELECT id,name title,stage||' Class' subtitle,'class' type,'/classes' href FROM bible_classes WHERE organization_id=? AND (name LIKE ? OR stage LIKE ?) LIMIT 4").bind(u.organization_id, like, like),
  ])
  return c.json({ results: [...people.results, ...cells.results, ...classes.results, ...resources.results] })
})

// -------------------------------------------------------------
// Administration & Account Security
// -------------------------------------------------------------
app.get('/api/users', auth, adminOnly, async c => {
  const u = c.get('user')
  const rows = await c.env.DB.prepare('SELECT id,name,email,role,scope_node_id,active,created_at FROM users WHERE organization_id=? ORDER BY active DESC,name').bind(u.organization_id).all()
  return c.json({ users: rows.results })
})

const userSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email(),
  role: z.enum(['Ministry Administrator', 'Zone Administrator', 'Church Administrator', 'Cell Coordinator', 'Cell Leader', 'Cell Secretary', 'Bible Study Class Teacher', 'Read-only Leadership']),
  scope_node_id: z.string().optional(),
})

app.post('/api/users', auth, adminOnly, zValidator('json', userSchema), async c => {
  const u = c.get('user'), v = c.req.valid('json'), userId = id('user')
  const temporaryPassword = `Nexus!${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  if (v.scope_node_id && !await c.env.DB.prepare('SELECT id FROM org_nodes WHERE id=? AND organization_id=?').bind(v.scope_node_id, u.organization_id).first()) {
    return c.json({ error: 'Scope is outside your organization' }, 400)
  }
  try {
    await c.env.DB.prepare('INSERT INTO users(id,organization_id,name,email,password_salt,password_hash,role,scope_node_id) VALUES(?,?,?,?,?,?,?,?)')
      .bind(userId, u.organization_id, v.name, v.email.toLowerCase(), salt, await passwordHash(temporaryPassword, salt), v.role, v.scope_node_id || u.scope_node_id).run()
    return c.json({ id: userId, temporaryPassword }, 201)
  } catch {
    return c.json({ error: 'That email address already has an account' }, 409)
  }
})

app.patch('/api/users/:id/active', auth, adminOnly, zValidator('json', z.object({ active: z.boolean() })), async c => {
  const u = c.get('user'), v = c.req.valid('json')
  if (c.req.param('id') === u.id && !v.active) return c.json({ error: 'You cannot deactivate your own account' }, 400)
  const result = await c.env.DB.prepare('UPDATE users SET active=? WHERE id=? AND organization_id=?').bind(v.active ? 1 : 0, c.req.param('id'), u.organization_id).run()
  if (!result.meta.changes) return c.json({ error: 'Account not found' }, 404)
  if (!v.active) await c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

app.post('/api/account/change-password', auth, zValidator('json', z.object({
  currentPassword: z.string().min(6).max(128),
  newPassword: z.string().min(8).max(128),
})), async c => {
  const u = c.get('user'), v = c.req.valid('json')
  const record = await c.env.DB.prepare('SELECT password_salt,password_hash FROM users WHERE id=?').bind(u.id).first<any>()
  if (!record || (await passwordHash(v.currentPassword, record.password_salt)) !== record.password_hash) {
    return c.json({ error: 'Current password is incorrect' }, 400)
  }
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_salt=?,password_hash=? WHERE id=?').bind(salt, await passwordHash(v.newPassword, salt), u.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id),
  ])
  deleteCookie(c, 'nexus_session', { path: '/' })
  return c.json({ ok: true })
})

app.patch('/api/account/profile', auth, zValidator('json', z.object({ name: z.string().trim().min(2).max(100), email: z.string().email() })), async c => {
  const u = c.get('user'), v = c.req.valid('json')
  try {
    await c.env.DB.prepare('UPDATE users SET name=?, email=? WHERE id=? AND organization_id=?').bind(v.name, v.email.toLowerCase(), u.id, u.organization_id).run()
    return c.json({ ok: true, name: v.name, email: v.email.toLowerCase() })
  } catch {
    return c.json({ error: 'Email is already in use by another account' }, 409)
  }
})

app.get('/api/admin/export', auth, adminOnly, async c => {
  const u = c.get('user')
  const tables = ['org_nodes', 'people', 'role_assignments', 'bible_classes', 'class_enrollments', 'meetings', 'meeting_attendance', 'follow_ups', 'member_transfers', 'multiplication_events', 'calendar_events', 'standard_sets', 'resources', 'audit_logs']
  const output: Record<string, unknown[]> = {}
  for (const table of tables) {
    const result = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE organization_id=?`).bind(u.organization_id).all().catch(() => ({ results: [] }))
    output[table] = result.results
  }
  return c.json({ exportedAt: new Date().toISOString(), organizationId: u.organization_id, data: output })
})

app.notFound(c => c.json({ error: 'Not found' }, 404))
app.onError((error, c) => {
  console.error(error)
  return c.json({ error: error.message || 'An unexpected error occurred', requestId: c.res.headers.get('x-request-id') }, 500)
})

export default app
