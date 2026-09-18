import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  CalendarDays,
  ChevronRight,
  GitBranch,
  GraduationCap,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  FileCheck2,
  Edit3,
} from 'lucide-react'
import { api } from '../api'
import type { CellDetail } from '../types'
import { sound } from '../sound'

type Props = {
  cellId: string
  onClose: () => void
  onMultiply: (cellId: string) => void
  onPersonClick?: (personId: string) => void
  onReportClick?: (cellId: string) => void
  onReloadNeeded?: () => void
}

export function CellDrawer({
  cellId,
  onClose,
  onMultiply,
  onPersonClick,
  onReportClick,
  onReloadNeeded,
}: Props) {
  const [data, setData] = useState<CellDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'members' | 'classes' | 'lineage'>('overview')
  const [editing, setEditing] = useState(false)
  const [editLoc, setEditLoc] = useState('')
  const [editDay, setEditDay] = useState('')
  const [editTime, setEditTime] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)

  useEffect(() => {
    sound.pop()
    setLoading(true)
    api<CellDetail>(`/cells/${cellId}`)
      .then(res => {
        setData(res)
        setEditLoc(res.cell.location || '')
        setEditDay(res.cell.meeting_day || 'Friday')
        setEditTime(res.cell.meeting_time || '18:00')
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [cellId])

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault()
    setSaveBusy(true)
    try {
      await api(`/cells/${cellId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          location: editLoc,
          meeting_day: editDay,
          meeting_time: editTime,
        }),
      })
      sound.success()
      setEditing(false)
      const updated = await api<CellDetail>(`/cells/${cellId}`)
      setData(updated)
      if (onReloadNeeded) onReloadNeeded()
    } catch {
      // ignore
    } finally {
      setSaveBusy(false)
    }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <motion.aside
        className="drawer-panel cell-drawer"
        initial={{ x: '100%', opacity: 0.5 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      >
        <header className="drawer-header">
          <div className="drawer-title-group">
            <span className="eyebrow">
              <Sparkles /> Cell Ledger Profile
            </span>
            {loading ? (
              <h2>Loading cell…</h2>
            ) : (
              <h2>{data?.cell.name}</h2>
            )}
            <span className="drawer-sub">
              {data?.cell.code} · <MapPin /> {data?.cell.location || 'Port Harcourt'}
            </span>
          </div>
          <button className="icon-button close-btn" onClick={onClose} aria-label="Close drawer">
            <X />
          </button>
        </header>

        {loading ? (
          <div className="drawer-loading">
            <span className="spin" />
            <p>Gathering cell records & lineage…</p>
          </div>
        ) : !data ? (
          <div className="drawer-error">
            <p>Could not load cell records.</p>
          </div>
        ) : (
          <div className="drawer-body">
            <div className="drawer-quick-actions">
              <button
                className="button primary small"
                onClick={() => {
                  sound.click()
                  onMultiply(cellId)
                }}
              >
                <GitBranch /> Pioneer daughter cell
              </button>
              {onReportClick && (
                <button
                  className="button secondary small"
                  onClick={() => {
                    sound.click()
                    onReportClick(cellId)
                  }}
                >
                  <Plus /> Submit report
                </button>
              )}
              <button
                className="button ghost small"
                onClick={() => {
                  sound.click()
                  setEditing(!editing)
                }}
              >
                <Edit3 /> {editing ? 'Cancel edit' : 'Edit details'}
              </button>
            </div>

            {editing && (
              <form className="drawer-edit-card" onSubmit={handleSaveEdit}>
                <h4>Update Meeting Schedule</h4>
                <label>
                  Location
                  <input
                    value={editLoc}
                    onChange={e => setEditLoc(e.target.value)}
                    placeholder="Neighbourhood / Venue"
                  />
                </label>
                <div className="form-row">
                  <label>
                    Day
                    <select value={editDay} onChange={e => setEditDay(e.target.value)}>
                      <option>Friday</option>
                      <option>Saturday</option>
                      <option>Sunday</option>
                      <option>Wednesday</option>
                      <option>Thursday</option>
                    </select>
                  </label>
                  <label>
                    Time
                    <input
                      type="time"
                      value={editTime}
                      onChange={e => setEditTime(e.target.value)}
                    />
                  </label>
                </div>
                <button className="button primary small" disabled={saveBusy}>
                  {saveBusy ? 'Saving…' : 'Save changes'}
                </button>
              </form>
            )}

            <div className="drawer-tabs">
              {(['overview', 'members', 'classes', 'lineage'] as const).map(t => (
                <button
                  key={t}
                  className={tab === t ? 'active' : ''}
                  onClick={() => {
                    sound.click()
                    setTab(t)
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="drawer-tab-content">
                <div className="stats-strip">
                  <div className="stat-pill">
                    <Users />
                    <div>
                      <b>{data.members.length}</b>
                      <small>Members</small>
                    </div>
                  </div>
                  <div className="stat-pill">
                    <GraduationCap />
                    <div>
                      <b>{data.classes.length}</b>
                      <small>Classes</small>
                    </div>
                  </div>
                  <div className="stat-pill">
                    <GitBranch />
                    <div>
                      <b>{data.children.length}</b>
                      <small>Daughter cells</small>
                    </div>
                  </div>
                </div>

                <div className="leadership-section">
                  <p className="eyebrow">
                    <ShieldCheck /> Leadership Team
                  </p>
                  <div className="leader-card">
                    <div className="leader-avatar">
                      {data.cell.leader
                        ? data.cell.leader.split(' ').map(x => x[0]).join('').slice(0, 2)
                        : 'CL'}
                    </div>
                    <div>
                      <small>CELL LEADER</small>
                      <b>{data.cell.leader || 'Appointment pending'}</b>
                    </div>
                  </div>
                  {data.cell.assistant_leader && (
                    <div className="leader-card secondary">
                      <div className="leader-avatar sub">
                        {data.cell.assistant_leader.split(' ').map(x => x[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <small>ASSISTANT LEADER</small>
                        <b>{data.cell.assistant_leader}</b>
                      </div>
                    </div>
                  )}
                </div>

                <div className="drawer-section">
                  <p className="eyebrow">
                    <CalendarDays /> Gathering Schedule
                  </p>
                  <div className="info-panel">
                    <p>
                      Meets every <strong>{data.cell.meeting_day || 'Friday'}</strong> at{' '}
                      <strong>{data.cell.meeting_time || '18:00'}</strong>
                    </p>
                    <small>Venue: {data.cell.location || 'Central venue'}</small>
                  </div>
                </div>

                <div className="drawer-section">
                  <p className="eyebrow">
                    <FileCheck2 /> Recent Meeting Reports
                  </p>
                  {data.meetings.length ? (
                    <div className="meeting-mini-list">
                      {data.meetings.map(m => (
                        <div key={m.id} className="meeting-mini-row">
                          <span className="meeting-date">
                            {new Date(m.held_at + 'T12:00').toLocaleDateString('en', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span className="meeting-type">{m.meeting_type}</span>
                          <span className="meeting-att">
                            <b>{m.attendance}</b> present
                          </span>
                          <i className={`status ${m.status}`}>{m.status}</i>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted">No meetings recorded yet for this cell.</p>
                  )}
                </div>
              </div>
            )}

            {tab === 'members' && (
              <div className="drawer-tab-content">
                <div className="members-header">
                  <span>{data.members.length} members in care</span>
                </div>
                <div className="drawer-members-list">
                  {data.members.map((p, idx) => (
                    <article
                      key={p.id}
                      className="member-row"
                      onClick={() => {
                        sound.click()
                        if (onPersonClick) onPersonClick(p.id)
                      }}
                    >
                      <span className={`av-dot av-${idx % 5}`}>
                        {p.full_name.split(' ').map(x => x[0]).join('').slice(0, 2)}
                      </span>
                      <div className="member-info">
                        <b>{p.full_name}</b>
                        <small>
                          <span className="stage-pill">{p.leadership_stage}</span>
                          {p.phone && <> · {p.phone}</>}
                        </small>
                      </div>
                      <ChevronRight />
                    </article>
                  ))}
                </div>
              </div>
            )}

            {tab === 'classes' && (
              <div className="drawer-tab-content">
                <div className="classes-header">
                  <span>{data.classes.length} Bible Study Circles</span>
                </div>
                {data.classes.length ? (
                  <div className="drawer-classes-list">
                    {data.classes.map(bc => (
                      <div key={bc.id} className="class-mini-card">
                        <div className="class-mini-badge">{bc.stage}</div>
                        <h4>{bc.name}</h4>
                        <p>Teacher: {bc.teacher || 'Unassigned'}</p>
                        <small>Schedule: {bc.schedule || 'Flexible'}</small>
                        <span className="class-enrolled-count">
                          <b>{bc.enrolled}</b> enrolled
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted">No Bible Study classes yet in this cell.</p>
                )}
              </div>
            )}

            {tab === 'lineage' && (
              <div className="drawer-tab-content">
                <div className="lineage-tree-box">
                  <div className="lineage-parent">
                    <small>PARENT LINEAGE</small>
                    <b>{data.cell.parent_name || 'Central Church'}</b>
                  </div>
                  <div className="lineage-arrow">↓</div>
                  <div className="lineage-current">
                    <small>CURRENT CELL</small>
                    <b>
                      {data.cell.name} ({data.cell.code})
                    </b>
                  </div>
                  {data.children.length > 0 && (
                    <>
                      <div className="lineage-arrow">↓ multiplied into</div>
                      <div className="lineage-children">
                        {data.children.map(ch => (
                          <div key={ch.id} className="lineage-child-pill">
                            <GitBranch />
                            <div>
                              <b>{ch.name}</b>
                              <small>
                                {ch.code} · {ch.members} members
                              </small>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {data.multiplications.length > 0 && (
                  <div className="drawer-section">
                    <p className="eyebrow">
                      <Sparkles /> Multiplication History
                    </p>
                    <div className="mult-events-list">
                      {data.multiplications.map(m => (
                        <div key={m.id} className="mult-event-item">
                          <time>{m.event_date}</time>
                          <div>
                            <b>Produced {m.child_name}</b>
                            <p>Pioneered by {m.pioneer_name || 'Leader'}</p>
                            <small>{m.notes}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </motion.aside>
    </div>
  )
}
