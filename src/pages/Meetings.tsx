import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CalendarPlus,
  CheckCircle2,
  FileCheck2,
  Plus,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { Cell, Meeting } from '../types'
import { Empty, ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { sound } from '../sound'

export default function Meetings() {
  const navigate = useNavigate()
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        api<{ meetings: Meeting[] }>('/meetings'),
        api<{ cells: Cell[] }>('/cells'),
      ]).then(([m, c]) => ({ ...m, ...c })),
    []
  )

  const [open, setOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>('All')

  if (loading) return <Loading label="Opening the weekly fellowship ledger" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  const filtered = data.meetings.filter(m => (typeFilter === 'All' ? true : m.meeting_type === typeFilter))

  const totalAtt = data.meetings.reduce((a, m) => a + m.attendance, 0)
  const totalFirstTimers = data.meetings.reduce((a, m) => a + m.first_timers, 0)
  const totalConverts = data.meetings.reduce((a, m) => a + m.new_converts, 0)
  const totalApproved = data.meetings.filter(m => m.status === 'approved').length

  return (
    <>
      <PageHeader
        eyebrow="Gatherings & Reports"
        title="Faithful stewardship of every gathering."
        copy="Record attendance, honor new visitors, capture ministry notes, and keep cell health visible to leadership."
        action={
          <div className="header-actions">
            <Link to="/attendance" className="button secondary">
              <UserCheck /> Record attendance roster
            </Link>
            <button
              className="button primary"
              onClick={() => {
                sound.click()
                setOpen(true)
              }}
            >
              <CalendarPlus /> Submit report
            </button>
          </div>
        }
      />

      <section className="meeting-summary">
        <article>
          <FileCheck2 />
          <span>
            <b>{data.meetings.length}</b>
            <small>Reports on record</small>
          </span>
        </article>
        <article>
          <Users />
          <span>
            <b>{totalAtt}</b>
            <small>Cumulative attendance</small>
          </span>
        </article>
        <article>
          <Sparkles />
          <span>
            <b>{totalFirstTimers + totalConverts}</b>
            <small>New visitors & converts</small>
          </span>
        </article>
        <article>
          <CheckCircle2 />
          <span>
            <b>{totalApproved}</b>
            <small>Approved reports</small>
          </span>
        </article>
      </section>

      <div className="toolbar">
        <div className="filter-pills">
          {(['All', 'Cell Meeting', 'Bible Study', 'Outreach', 'Leadership Meeting'] as const).map(t => (
            <button
              key={t}
              className={typeFilter === t ? 'active' : ''}
              onClick={() => {
                sound.click()
                setTypeFilter(t)
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="toolbar-counter">
          <b>{filtered.length}</b> reports
        </span>
      </div>

      {filtered.length ? (
        <div className="meeting-ledger">
          <div className="ledger-head">
            <span>DATE & GATHERING</span>
            <span>CELL</span>
            <span>ATTENDANCE</span>
            <span>NEW CONNECTIONS</span>
            <span>STATUS & ROSTER</span>
          </div>
          {filtered.map(m => (
            <article
              key={m.id}
              className="ledger-row"
              onClick={() => {
                sound.click()
                navigate(`/attendance?meetingId=${m.id}`)
              }}
            >
              <span className="meeting-primary">
                <i>{new Date(m.held_at + 'T12:00').getDate()}</i>
                <b>{m.meeting_type}</b>
                <small>
                  {new Date(m.held_at + 'T12:00').toLocaleDateString('en', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </small>
              </span>
              <span>
                <b>{m.cell_name}</b>
                <small>{m.notes ? `“${m.notes.slice(0, 45)}…”` : 'Cell report'}</small>
              </span>
              <span className="number-cell">
                <b>{m.attendance}</b>
                <small>present</small>
              </span>
              <span className="connections">
                <b>+{m.first_timers}</b> first timers
                <small>+{m.new_converts} new converts</small>
              </span>
              <span className="ledger-action-cell" onClick={e => e.stopPropagation()}>
                <i className={`status ${m.status}`}>{m.status}</i>
                <Link to={`/attendance?meetingId=${m.id}`} className="button ghost tiny">
                  <UserCheck /> Roster
                </Link>
              </span>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="Your ledger is ready"
          copy="Submit the first meeting report to begin seeing the ministry rhythm."
        />
      )}

      {open && (
        <NewMeeting
          cells={data.cells}
          close={() => setOpen(false)}
          done={() => {
            setOpen(false)
            reload()
          }}
        />
      )}
    </>
  )
}

function NewMeeting({
  cells,
  close,
  done,
}: {
  cells: Cell[]
  close: () => void
  done: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const raw = Object.fromEntries(new FormData(e.currentTarget))
    try {
      await api('/meetings', {
        method: 'POST',
        body: JSON.stringify({
          ...raw,
          attendance: Number(raw.attendance),
          first_timers: Number(raw.first_timers),
          new_converts: Number(raw.new_converts),
        }),
      })
      sound.success()
      done()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit report')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal eyebrow="Five-minute reporting" title="Record a Fellowship Gathering" onClose={close}>
      <p className="modal-copy">
        <Sparkles /> Capture what happened with clarity. The command center will update attendance
        trends, follow-ups, and genealogy intelligence.
      </p>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Cell community
          <select name="cell_id" required defaultValue="">
            <option disabled value="">
              Select cell
            </option>
            {cells.map(c => (
              <option value={c.id} key={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </label>
        <label>
          Gathering type
          <select name="meeting_type">
            <option>Cell Meeting</option>
            <option>Bible Study</option>
            <option>Outreach</option>
            <option>Leadership Meeting</option>
          </select>
        </label>
        <label>
          Date held
          <input name="held_at" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label>
          Attendance headcount
          <input name="attendance" type="number" min="0" required defaultValue="0" />
        </label>
        <label>
          First-time visitors
          <input name="first_timers" type="number" min="0" required defaultValue="0" />
        </label>
        <label>
          New converts
          <input name="new_converts" type="number" min="0" required defaultValue="0" />
        </label>
        <label className="full">
          Meeting testimony / Pastoral notes
          <textarea
            name="notes"
            maxLength={1000}
            placeholder="Key moments, decisions made, prayer focus, or follow-up needs…"
          />
        </label>

        {error && <p className="form-error full">{error}</p>}
        <div className="form-actions full">
          <button type="button" className="button ghost" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Submitting…' : <><Plus /> Submit report</>}
          </button>
        </div>
      </form>
    </Modal>
  )
}
