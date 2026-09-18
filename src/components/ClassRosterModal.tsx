import { useCallback, useEffect, useState } from 'react'
import { Award, Check, GraduationCap, Plus, Sparkles, UserCheck, Users, X } from 'lucide-react'
import { api } from '../api'
import type { ClassDetail, Person } from '../types'
import { sound } from '../sound'

type Props = {
  classId: string
  people: Person[]
  close: () => void
  onReloadNeeded?: () => void
}

export function ClassRosterModal({ classId, people, close, onReloadNeeded }: Props) {
  const [data, setData] = useState<ClassDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [enrollingId, setEnrollingId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api<ClassDetail>(`/classes/${classId}`)
      setData(res)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [classId])

  useEffect(() => {
    sound.pop()
    load()
  }, [load])

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault()
    if (!enrollingId) return
    setBusy(true)
    setError('')
    try {
      await api(`/classes/${classId}/enroll`, {
        method: 'POST',
        body: JSON.stringify({ person_id: enrollingId }),
      })
      sound.success()
      setEnrollingId('')
      await load()
      if (onReloadNeeded) onReloadNeeded()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enroll student')
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdateStatus(personId: string, status: 'in_progress' | 'completed' | 'paused') {
    setBusy(true)
    try {
      await api(`/classes/${classId}/enrollments/${personId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      if (status === 'completed') sound.success()
      else sound.click()
      await load()
      if (onReloadNeeded) onReloadNeeded()
    } catch {
      // ignore
    } finally {
      setBusy(false)
    }
  }

  const enrolledPersonIds = new Set(data?.students.map(s => s.person_id) || [])
  const availablePeople = people.filter(p => !enrolledPersonIds.has(p.id))

  return (
    <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && close()}>
      <div className="class-roster-modal">
        <header className="modal-header">
          <div>
            <span className="eyebrow">
              <Sparkles /> Formation & Discipleship Circle
            </span>
            <h2>{loading ? 'Loading class…' : data?.class.name}</h2>
            <p className="modal-sub">
              {data?.class.stage} Stage · {data?.class.cell_name} · Teacher: {data?.class.teacher || 'To assign'}
            </p>
          </div>
          <button className="icon-button" onClick={close}>
            <X />
          </button>
        </header>

        {loading ? (
          <div className="drawer-loading">
            <span className="spin" />
            <p>Loading student roster…</p>
          </div>
        ) : (
          <div className="class-roster-content">
            <div className="class-roster-summary">
              <div className="stat-pill">
                <Users />
                <div>
                  <b>{data?.students.length || 0}</b>
                  <small>Total enrolled</small>
                </div>
              </div>
              <div className="stat-pill">
                <GraduationCap />
                <div>
                  <b>{data?.students.filter(s => s.status === 'completed').length || 0}</b>
                  <small>Graduated</small>
                </div>
              </div>
              <div className="stat-pill">
                <UserCheck />
                <div>
                  <b>{data?.students.filter(s => s.status === 'in_progress').length || 0}</b>
                  <small>Active learners</small>
                </div>
              </div>
            </div>

            <form className="enroll-student-form" onSubmit={handleEnroll}>
              <h4>Enroll a New Student</h4>
              <div className="enroll-form-row">
                <select
                  value={enrollingId}
                  onChange={e => setEnrollingId(e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select member to enroll
                  </option>
                  {availablePeople.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.full_name} ({p.leadership_stage}) · {p.cell_name}
                    </option>
                  ))}
                </select>
                <button className="button primary small" disabled={busy || !enrollingId}>
                  <Plus /> Enroll student
                </button>
              </div>
              {error && <p className="form-error">{error}</p>}
            </form>

            <div className="students-list-section">
              <h4>Class Roster ({data?.students.length || 0})</h4>
              {data?.students.length ? (
                <div className="students-table">
                  <header>
                    <span>STUDENT</span>
                    <span>CELL</span>
                    <span>ENROLLED</span>
                    <span>STATUS</span>
                    <span>ACTION</span>
                  </header>
                  {data.students.map(s => (
                    <article key={s.enrollment_id}>
                      <div>
                        <b>{s.full_name}</b>
                        <small>{s.leadership_stage}</small>
                      </div>
                      <span>{s.cell_name}</span>
                      <span>{s.enrolled_at}</span>
                      <i className={`status ${s.status}`}>{s.status}</i>
                      <div className="student-actions">
                        {s.status === 'in_progress' ? (
                          <button
                            className="button primary tiny"
                            disabled={busy}
                            onClick={() => handleUpdateStatus(s.person_id, 'completed')}
                            title="Graduate student"
                          >
                            <Award /> Graduate
                          </button>
                        ) : (
                          <span className="graduated-badge">
                            <Check /> Graduated
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-muted">No students enrolled in this class yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
