import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import {
  ArrowRight,
  Award,
  Check,
  ChevronRight,
  GraduationCap,
  HeartHandshake,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  X,
} from 'lucide-react'
import { api } from '../api'
import type { PersonDetail } from '../types'
import { sound } from '../sound'

const stages = ['Member', 'Potential Leader', 'Class Teacher', 'Assistant Leader', 'Cell Leader'] as const

type Props = {
  personId: string
  onClose: () => void
  onTransferRequest?: (personId: string) => void
  onPersonClick?: (personId: string) => void
  onReloadNeeded?: () => void
}

export function PersonDrawer({
  personId,
  onClose,
  onTransferRequest,
  onPersonClick,
  onReloadNeeded,
}: Props) {
  const [data, setData] = useState<PersonDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [promoting, setPromoting] = useState(false)
  const [tab, setTab] = useState<'journey' | 'discipleship' | 'classes' | 'roles'>('journey')

  useEffect(() => {
    sound.pop()
    setLoading(true)
    api<PersonDetail>(`/people/${personId}`)
      .then(setData)
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [personId])

  async function handlePromote(nextStage: typeof stages[number]) {
    setPromoting(true)
    try {
      await api(`/people/${personId}`, {
        method: 'PATCH',
        body: JSON.stringify({ leadership_stage: nextStage }),
      })
      sound.success()
      const updated = await api<PersonDetail>(`/people/${personId}`)
      setData(updated)
      if (onReloadNeeded) onReloadNeeded()
    } catch {
      // ignore
    } finally {
      setPromoting(false)
    }
  }

  const currentStageIndex = data ? stages.indexOf(data.person.leadership_stage as any) : 0
  const nextStage = currentStageIndex < stages.length - 1 ? stages[currentStageIndex + 1] : null

  return (
    <div className="drawer-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <motion.aside
        className="drawer-panel person-drawer"
        initial={{ x: '100%', opacity: 0.5 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      >
        <header className="drawer-header">
          <div className="drawer-title-group">
            <span className="eyebrow">
              <Sparkles /> Ministry Journey Profile
            </span>
            {loading ? <h2>Loading person…</h2> : <h2>{data?.person.full_name}</h2>}
            <span className="drawer-sub">
              {data?.person.cell_name} · Joined {data?.person.joined_at}
            </span>
          </div>
          <button className="icon-button close-btn" onClick={onClose} aria-label="Close drawer">
            <X />
          </button>
        </header>

        {loading ? (
          <div className="drawer-loading">
            <span className="spin" />
            <p>Tracing discipleship and ministry path…</p>
          </div>
        ) : !data ? (
          <div className="drawer-error">
            <p>Could not load person records.</p>
          </div>
        ) : (
          <div className="drawer-body">
            <div className="person-hero-card">
              <div className="person-hero-avatar">
                {data.person.full_name
                  .split(' ')
                  .map(x => x[0])
                  .join('')
                  .slice(0, 2)}
              </div>
              <div className="person-hero-info">
                <h3>{data.person.full_name}</h3>
                <span className="stage-badge-glow">{data.person.leadership_stage}</span>
                <p>
                  <MapPin /> {data.person.cell_name} ({data.person.cell_code || 'Cell'})
                </p>
              </div>
              <div className="person-hero-contacts">
                {data.person.phone && (
                  <a href={`tel:${data.person.phone}`} className="icon-button" title="Call">
                    <Phone />
                  </a>
                )}
                {data.person.email && (
                  <a href={`mailto:${data.person.email}`} className="icon-button" title="Email">
                    <Mail />
                  </a>
                )}
              </div>
            </div>

            <div className="drawer-quick-actions">
              {nextStage && (
                <button
                  className="button primary small"
                  disabled={promoting}
                  onClick={() => {
                    sound.click()
                    handlePromote(nextStage)
                  }}
                >
                  <Award /> {promoting ? 'Promoting…' : `Promote to ${nextStage}`}
                </button>
              )}
              {onTransferRequest && (
                <button
                  className="button secondary small"
                  onClick={() => {
                    sound.click()
                    onTransferRequest(personId)
                  }}
                >
                  <TrendingUp /> Request cell transfer
                </button>
              )}
            </div>

            <div className="drawer-tabs">
              {(['journey', 'discipleship', 'classes', 'roles'] as const).map(t => (
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

            {tab === 'journey' && (
              <div className="drawer-tab-content">
                <div className="stats-strip">
                  <div className="stat-pill">
                    <UserCheck />
                    <div>
                      <b>{data.attendanceRate}%</b>
                      <small>Attendance</small>
                    </div>
                  </div>
                  <div className="stat-pill">
                    <HeartHandshake />
                    <div>
                      <b>{data.disciples.length}</b>
                      <small>Disciples</small>
                    </div>
                  </div>
                  <div className="stat-pill">
                    <GraduationCap />
                    <div>
                      <b>{data.enrollments.length}</b>
                      <small>Classes</small>
                    </div>
                  </div>
                </div>

                <div className="journey-stepper">
                  <p className="eyebrow">
                    <Sparkles /> Spiritual & Leadership Pathway
                  </p>
                  <div className="stepper-list">
                    {stages.map((stg, i) => {
                      const isPast = i < currentStageIndex
                      const isCurrent = i === currentStageIndex
                      return (
                        <div
                          key={stg}
                          className={`stepper-item ${isPast ? 'completed' : ''} ${
                            isCurrent ? 'current' : 'future'
                          }`}
                        >
                          <div className="stepper-dot">
                            {isPast ? <Check /> : isCurrent ? <Sparkles /> : i + 1}
                          </div>
                          <div className="stepper-info">
                            <b>{stg}</b>
                            <small>
                              {isCurrent
                                ? 'Active leadership stage'
                                : isPast
                                ? 'Completed milestone'
                                : 'Upcoming growth milestone'}
                            </small>
                          </div>
                          {isCurrent && nextStage && (
                            <button
                              className="advance-pill-btn"
                              disabled={promoting}
                              onClick={() => handlePromote(nextStage)}
                            >
                              Advance <ArrowRight />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {tab === 'discipleship' && (
              <div className="drawer-tab-content">
                <div className="mentor-card">
                  <small>DISCIPLED & MENTORED BY</small>
                  <b>{data.person.discipled_by_name || 'Ministry Leader / Pastor'}</b>
                </div>

                <div className="drawer-section">
                  <p className="eyebrow">
                    <HeartHandshake /> Spiritual Children & Disciples ({data.disciples.length})
                  </p>
                  {data.disciples.length ? (
                    <div className="drawer-members-list">
                      {data.disciples.map(d => (
                        <article
                          key={d.id}
                          className="member-row"
                          onClick={() => {
                            sound.click()
                            if (onPersonClick) onPersonClick(d.id)
                          }}
                        >
                          <div className="member-info">
                            <b>{d.full_name}</b>
                            <small>{d.leadership_stage}</small>
                          </div>
                          <ChevronRight />
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted">
                      No disciples assigned yet. Encourage them to mentor new converts!
                    </p>
                  )}
                </div>
              </div>
            )}

            {tab === 'classes' && (
              <div className="drawer-tab-content">
                <p className="eyebrow">
                  <GraduationCap /> Foundation & Leadership Training
                </p>
                {data.enrollments.length ? (
                  <div className="drawer-classes-list">
                    {data.enrollments.map(en => (
                      <div key={en.id} className="class-mini-card">
                        <div className="class-mini-badge">{en.class_stage}</div>
                        <h4>{en.class_name}</h4>
                        <p>Status: <span className={`status ${en.status}`}>{en.status}</span></p>
                        <small>Enrolled: {en.enrolled_at}</small>
                        {en.completed_at && <small>Graduated: {en.completed_at}</small>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted">Not currently enrolled in any Bible Study class.</p>
                )}
              </div>
            )}

            {tab === 'roles' && (
              <div className="drawer-tab-content">
                <p className="eyebrow">
                  <ShieldCheck /> Historical Role Appointments
                </p>
                {data.roles.length ? (
                  <div className="roles-timeline">
                    {data.roles.map(r => (
                      <div key={r.id} className="role-record-item">
                        <b>{r.role}</b>
                        <small>{r.scope_name}</small>
                        <span>
                          {r.start_date} → {r.end_date || 'Present'}
                        </span>
                        <i className={`status ${r.status}`}>{r.status}</i>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted">No historical executive appointments on record.</p>
                )}
              </div>
            )}
          </div>
        )}
      </motion.aside>
    </div>
  )
}
