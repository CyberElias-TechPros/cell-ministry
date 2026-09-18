import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Check,
  CheckCheck,
  ClipboardCheck,
  Save,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { Meeting } from '../types'
import { ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { sound } from '../sound'

type RecordItem = {
  person_id: string
  full_name: string
  leadership_stage: string
  attendance_status: 'present' | 'absent' | 'excused'
}

export default function Attendance() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialMeetingId = searchParams.get('meetingId') || ''

  const { data, error, loading } = useLoad(() => api<{ meetings: Meeting[] }>('/meetings'), [])
  const [meetingId, setMeetingId] = useState(initialMeetingId)
  const [records, setRecords] = useState<RecordItem[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [filter, setFilter] = useState<'all' | 'present' | 'absent'>('all')

  // Sync state if url query param changes or data loads
  useEffect(() => {
    if (initialMeetingId && !meetingId) {
      setMeetingId(initialMeetingId)
    } else if (!meetingId && data?.meetings.length) {
      setMeetingId(data.meetings[0].id)
    }
  }, [initialMeetingId, data, meetingId])

  useEffect(() => {
    if (!meetingId) {
      setRecords([])
      return
    }
    setRosterLoading(true)
    api<{ attendance: RecordItem[] }>(`/meetings/${meetingId}/attendance`)
      .then(r => setRecords(r.attendance))
      .catch(() => setRecords([]))
      .finally(() => setRosterLoading(false))
  }, [meetingId])

  if (loading) return <Loading label="Opening attendance roster ledger" />
  if (error || !data) return <ErrorState message={error} />

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      await api(`/meetings/${meetingId}/attendance`, {
        method: 'PUT',
        body: JSON.stringify({
          records: records.map(({ person_id, attendance_status }) => ({
            person_id,
            attendance_status,
          })),
        }),
      })
      sound.success()
      setSaved(true)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  function markAll(status: 'present' | 'absent') {
    sound.click()
    setSaved(false)
    setRecords(list => list.map(item => ({ ...item, attendance_status: status })))
  }

  const presentCount = records.filter(r => r.attendance_status === 'present').length
  const attendanceRate = records.length ? Math.round((presentCount / records.length) * 100) : 0

  const displayedRecords = records.filter(r => {
    if (filter === 'present') return r.attendance_status === 'present'
    if (filter === 'absent') return r.attendance_status === 'absent' || r.attendance_status === 'excused'
    return true
  })

  const currentMeeting = data.meetings.find(m => m.id === meetingId)

  return (
    <>
      <PageHeader
        eyebrow="Individual Pastoral Care"
        title="Presence, remembered."
        copy="Record each member respectfully, track individual faithfulness, and turn presence into meaningful pastoral care."
        action={
          <div className="header-actions">
            <button
              className="button secondary"
              disabled={!meetingId || !records.length || saving}
              onClick={() => markAll('present')}
            >
              <CheckCheck /> Mark all present
            </button>
            <button
              className="button ghost"
              disabled={!meetingId || !records.length || saving}
              onClick={() => markAll('absent')}
            >
              <XCircle /> Mark all absent
            </button>
            <button
              className="button primary"
              disabled={!meetingId || saving}
              onClick={save}
            >
              {saved ? (
                <>
                  <Check /> Roster saved
                </>
              ) : (
                <>
                  <Save /> {saving ? 'Saving…' : 'Save roster'}
                </>
              )}
            </button>
          </div>
        }
      />

      <section className="attendance-layout">
        <aside className="attendance-sidebar">
          <ClipboardCheck className="attendance-hero-icon" />
          <h2>Select a Gathering</h2>
          <p>Choose a submitted meeting to open the individual cell roster.</p>

          <select
            value={meetingId}
            onChange={e => {
              sound.click()
              const id = e.target.value
              setMeetingId(id)
              setSearchParams({ meetingId: id })
              setSaved(false)
            }}
          >
            <option value="" disabled>
              Select meeting
            </option>
            {data.meetings.map(m => (
              <option value={m.id} key={m.id}>
                {m.held_at} · {m.cell_name} ({m.meeting_type})
              </option>
            ))}
          </select>

          {meetingId && (
            <div className="attendance-stats-card">
              <div className="attendance-count">
                <Users />
                <span>
                  <b>
                    {presentCount} / {records.length}
                  </b>
                  <small>Present / Total Members</small>
                </span>
              </div>
              <div className="attendance-rate-bar">
                <div className="attendance-rate-fill" style={{ width: `${attendanceRate}%` }} />
              </div>
              <span className="attendance-rate-text">
                <Sparkles /> {attendanceRate}% Attendance Rate
              </span>
            </div>
          )}

          {currentMeeting && (
            <div className="meeting-context-card">
              <small>GATHERING CONTEXT</small>
              <b>{currentMeeting.cell_name}</b>
              <p>Type: {currentMeeting.meeting_type}</p>
              <p>Date: {currentMeeting.held_at}</p>
              {currentMeeting.notes && <p className="notes-italic">“{currentMeeting.notes}”</p>}
            </div>
          )}
        </aside>

        <div className="roster">
          {rosterLoading ? (
            <Loading label="Loading cell roster ledger" />
          ) : records.length ? (
            <>
              <div className="roster-toolbar">
                <span>{records.length} registered members</span>
                <div className="filter-pills small">
                  {(['all', 'present', 'absent'] as const).map(f => (
                    <button
                      key={f}
                      className={filter === f ? 'active' : ''}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <header>
                <span>MEMBER</span>
                <span>JOURNEY STAGE</span>
                <span>ATTENDANCE STATUS</span>
              </header>

              {displayedRecords.map(record => (
                <article key={record.person_id} className="roster-row">
                  <div className="roster-person-meta">
                    <span className="roster-avatar">
                      {record.full_name
                        .split(' ')
                        .map(x => x[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                    <b>{record.full_name}</b>
                  </div>
                  <span className="roster-stage">
                    <i
                      className={`stage-dot stage-${record.leadership_stage
                        .toLowerCase()
                        .replace(/\s+/g, '-')}`}
                    />
                    {record.leadership_stage}
                  </span>
                  <div className="status-buttons">
                    {(['present', 'absent', 'excused'] as const).map(status => (
                      <button
                        key={status}
                        className={`status-btn ${status} ${
                          record.attendance_status === status ? 'active' : ''
                        }`}
                        onClick={() => {
                          sound.click()
                          setSaved(false)
                          setRecords(list =>
                            list.map(item =>
                              item.person_id === record.person_id
                                ? { ...item, attendance_status: status }
                                : item
                            )
                          )
                        }}
                      >
                        {status === 'present' ? <Check /> : null}
                        {status}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </>
          ) : (
            <div className="roster-empty">
              <Users />
              <h2>{meetingId ? 'This cell has no registered members yet.' : 'Choose a meeting to begin.'}</h2>
              <p>Select a meeting from the menu on the left to mark individual presence.</p>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
