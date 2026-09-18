import { useState, type FormEvent } from 'react'
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Plus,
  Repeat2,
  Trash2,
  Sparkles,
} from 'lucide-react'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { CalendarEvent, Cell } from '../types'
import { ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { sound } from '../sound'

const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

export default function Calendar() {
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        api<{ events: CalendarEvent[] }>('/calendar'),
        api<{ cells: Cell[] }>('/cells'),
      ]).then(([a, b]) => ({ ...a, ...b })),
    []
  )

  const [open, setOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>()
  const [categoryFilter, setCategoryFilter] = useState<string>('All')
  const [viewDate, setViewDate] = useState(new Date(2026, 8, 1)) // Default Sept 2026
  const [deletingId, setDeletingId] = useState<string>()

  if (loading) return <Loading label="Opening ministry calendar & fellowship rhythms" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const firstDayIndex = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const slots = [
    ...Array(firstDayIndex).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const monthName = viewDate.toLocaleDateString('en-US', { month: 'long' })

  function nextMonth() {
    sound.click()
    setViewDate(new Date(year, month + 1, 1))
  }

  function prevMonth() {
    sound.click()
    setViewDate(new Date(year, month - 1, 1))
  }

  async function deleteEvent(id: string) {
    sound.click()
    setDeletingId(id)
    try {
      await api(`/calendar/${id}`, { method: 'DELETE' })
      sound.success()
      await reload()
    } finally {
      setDeletingId(undefined)
    }
  }

  const filteredEvents = data.events.filter(e =>
    categoryFilter === 'All' ? true : e.event_type === categoryFilter
  )

  return (
    <>
      <PageHeader
        eyebrow="Shared Ministry Rhythm"
        title="Make room for what matters."
        copy="Synchronize cell meetings, soul-winning outreaches, leadership sessions, and zone-wide gatherings in one harmonious calendar."
        action={
          <button
            className="button primary"
            onClick={() => {
              sound.click()
              setSelectedDate(undefined)
              setOpen(true)
            }}
          >
            <CalendarPlus /> Schedule event
          </button>
        }
      />

      <div className="toolbar">
        <div className="filter-pills">
          {(['All', 'Cell Meeting', 'Bible Study', 'Outreach', 'Leadership', 'Training', 'Special Event'] as const).map(
            cat => (
              <button
                key={cat}
                className={categoryFilter === cat ? 'active' : ''}
                onClick={() => {
                  sound.click()
                  setCategoryFilter(cat)
                }}
              >
                {cat}
              </button>
            )
          )}
        </div>
      </div>

      <section className="calendar-shell">
        <div className="calendar-main">
          <header className="calendar-nav-header">
            <button className="icon-button" onClick={prevMonth} title="Previous month">
              <ChevronLeft />
            </button>
            <h2>
              {monthName} <em>{year}</em>
            </h2>
            <button className="icon-button" onClick={nextMonth} title="Next month">
              <ChevronRight />
            </button>
          </header>

          <div className="calendar-days">
            {days.map(d => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {slots.map((day, i) => {
              if (!day) return <div key={i} className="calendar-cell blank" />

              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const dayEvents = filteredEvents.filter(event => event.starts_at.startsWith(dateStr))
              const isToday =
                new Date().getDate() === day &&
                new Date().getMonth() === month &&
                new Date().getFullYear() === year

              return (
                <div
                  key={i}
                  className={`calendar-cell ${isToday ? 'today' : ''}`}
                  onClick={() => {
                    sound.click()
                    setSelectedDate(dateStr)
                    setOpen(true)
                  }}
                  title={`Click to schedule event on ${dateStr}`}
                >
                  <b className="day-number">{day}</b>
                  <div className="cell-events-list">
                    {dayEvents.map(event => (
                      <span
                        key={event.id}
                        className={`event-tag event-${event.event_type.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <i />
                        {event.title}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Upcoming Agenda Sidebar */}
        <aside className="calendar-agenda">
          <p className="eyebrow">
            <Sparkles /> Agenda & Scheduled Rhythms
          </p>
          <h2>Ministry Agenda</h2>

          <div className="agenda-events-list">
            {filteredEvents.map(event => (
              <article key={event.id} className="agenda-item">
                <time>
                  <b>{new Date(event.starts_at).getDate()}</b>
                  <small>
                    {new Date(event.starts_at).toLocaleDateString('en', { month: 'short' })}
                  </small>
                </time>
                <div className="agenda-details">
                  <span className="agenda-type-pill">{event.event_type}</span>
                  <h3>{event.title}</h3>
                  <p>
                    <Clock3 />
                    {new Date(event.starts_at).toLocaleTimeString('en', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {event.location && (
                      <>
                        {' '}
                        · <MapPin />
                        {event.location}
                      </>
                    )}
                  </p>
                  {event.recurrence !== 'none' && (
                    <small>
                      <Repeat2 /> Repeats {event.recurrence}
                    </small>
                  )}
                  {event.scope_name && <small className="agenda-scope">Scope: {event.scope_name}</small>}
                </div>
                <button
                  className="icon-button delete-event-btn"
                  title="Remove event"
                  disabled={deletingId === event.id}
                  onClick={() => deleteEvent(event.id)}
                >
                  <Trash2 />
                </button>
              </article>
            ))}
          </div>
        </aside>
      </section>

      {open && (
        <NewEvent
          cells={data.cells}
          defaultDate={selectedDate}
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

function NewEvent({
  cells,
  defaultDate,
  close,
  done,
}: {
  cells: Cell[]
  defaultDate?: string
  close: () => void
  done: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const startDefault = defaultDate ? `${defaultDate}T18:00` : '2026-09-18T18:00'

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/calendar', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      })
      sound.success()
      done()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule event')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal eyebrow="Ministry Calendar" title="Schedule an Event" onClose={close}>
      <form className="form-grid" onSubmit={submit}>
        <label className="full">
          Event title
          <input name="title" required placeholder="e.g. Zone Leaders Training / Midweek Outreach" />
        </label>
        <label>
          Event type
          <select name="event_type">
            <option>Cell Meeting</option>
            <option>Bible Study</option>
            <option>Outreach</option>
            <option>Leadership</option>
            <option>Training</option>
            <option>Special Event</option>
          </select>
        </label>
        <label>
          Cell / Ministry scope
          <select name="org_node_id" defaultValue="">
            <option value="">Zone-wide (All cells)</option>
            {cells.map(c => (
              <option value={c.id} key={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </label>
        <label>
          Starts at
          <input name="starts_at" type="datetime-local" required defaultValue={startDefault} />
        </label>
        <label>
          Ends at (optional)
          <input name="ends_at" type="datetime-local" />
        </label>
        <label>
          Location / Venue
          <input name="location" placeholder="e.g. Central Church Hall B" />
        </label>
        <label>
          Recurrence pattern
          <select name="recurrence">
            <option value="none">Does not repeat</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>

        {error && <p className="form-error full">{error}</p>}
        <div className="form-actions full">
          <button type="button" className="button ghost" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            <Plus /> {busy ? 'Scheduling…' : 'Schedule event'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
