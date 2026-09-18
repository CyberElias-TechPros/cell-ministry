import { useState, type FormEvent } from 'react'
import {
  ArrowRight,
  HeartHandshake,
  Phone,
  Plus,
  Sparkles,
  UserPlus,
} from 'lucide-react'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { Cell, FollowUp, Person } from '../types'
import { ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { sound } from '../sound'

const steps = ['new', 'contacted', 'returned', 'joined'] as const

export default function FollowUps() {
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        api<{ followUps: FollowUp[] }>('/follow-ups'),
        api<{ cells: Cell[] }>('/cells'),
        api<{ people: Person[] }>('/people'),
      ]).then(([a, b, c]) => ({ ...a, ...b, ...c })),
    []
  )

  const [open, setOpen] = useState(false)
  const [updating, setUpdating] = useState('')
  const [activeStepFilter, setActiveStepFilter] = useState<string>('all')

  if (loading) return <Loading label="Gathering follow-up & care journeys" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  async function advance(item: FollowUp) {
    const currentIndex = steps.indexOf(item.status)
    const next = steps[Math.min(currentIndex + 1, steps.length - 1)]
    setUpdating(item.id)
    try {
      await api(`/follow-ups/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      })
      if (next === 'joined') sound.success()
      else sound.click()
      await reload()
    } finally {
      setUpdating('')
    }
  }

  async function convertToMember(item: FollowUp) {
    setUpdating(item.id)
    try {
      await api(`/follow-ups/${item.id}/convert-to-member`, {
        method: 'POST',
      })
      sound.success()
      await reload()
    } catch {
      // ignore
    } finally {
      setUpdating('')
    }
  }

  const filteredList = data.followUps.filter(f =>
    activeStepFilter === 'all' ? true : f.status === activeStepFilter
  )

  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <PageHeader
        eyebrow="Care That Continues"
        title="Never lose a soul."
        copy="Turn first encounters into true belonging through designated ownership, empathetic contact, and a structured follow-up rhythm."
        action={
          <button
            className="button primary"
            onClick={() => {
              sound.click()
              setOpen(true)
            }}
          >
            <Plus /> Add follow-up
          </button>
        }
      />

      {/* 4-Step Journey Rail */}
      <section className="journey-rail">
        <div
          className={`journey-step ${activeStepFilter === 'all' ? 'active' : ''}`}
          onClick={() => {
            sound.click()
            setActiveStepFilter('all')
          }}
        >
          <span>ALL</span>
          <b>Overview</b>
          <small>{data.followUps.length} total</small>
        </div>
        {steps.map((step, i) => (
          <div
            key={step}
            className={`journey-step ${activeStepFilter === step ? 'active' : ''}`}
            onClick={() => {
              sound.click()
              setActiveStepFilter(step)
            }}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            <b>{step}</b>
            <small>{data.followUps.filter(f => f.status === step).length} people</small>
            {i < 3 && <ArrowRight className="step-arrow" />}
          </div>
        ))}
      </section>

      <div className="follow-grid">
        {filteredList.map(item => {
          const isOverdue = item.status !== 'joined' && item.due_at < today
          return (
            <article key={item.id} className={`follow-card ${isOverdue ? 'overdue' : ''}`}>
              <header>
                <span className={`follow-source ${item.source.replace(' ', '-').toLowerCase()}`}>
                  {item.source}
                </span>
                <i className={isOverdue ? 'due-overdue' : ''}>
                  {isOverdue ? 'Overdue · ' : 'Due '}
                  {new Date(item.due_at + 'T12:00').toLocaleDateString('en', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </i>
              </header>

              <div className="follow-person">
                <span className="follow-avatar">
                  {item.person_name
                    .split(' ')
                    .map(x => x[0])
                    .join('')
                    .slice(0, 2)}
                </span>
                <div>
                  <h2>{item.person_name}</h2>
                  <p>{item.cell_name}</p>
                </div>
              </div>

              <p className="follow-note">“{item.notes || 'Ready for a warm, pastoral contact.'}”</p>

              <div className="follow-owner">
                <small>ASSIGNED TO</small>
                <b>{item.assignee || 'Unassigned (Needs Leader)'}</b>
              </div>

              <footer>
                {item.phone ? (
                  <a className="button ghost small" href={`tel:${item.phone}`}>
                    <Phone /> Call
                  </a>
                ) : (
                  <span />
                )}

                <div className="follow-actions">
                  {item.status !== 'joined' ? (
                    <button
                      className="button primary small"
                      onClick={() => advance(item)}
                      disabled={updating === item.id}
                    >
                      Advance to {steps[steps.indexOf(item.status) + 1]} <ArrowRight />
                    </button>
                  ) : (
                    <button
                      className="button primary small"
                      onClick={() => convertToMember(item)}
                      disabled={updating === item.id}
                    >
                      <UserPlus /> Enroll in Cell
                    </button>
                  )}
                </div>
              </footer>
            </article>
          )
        })}
      </div>

      {open && (
        <NewFollowUp
          cells={data.cells}
          people={data.people}
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

function NewFollowUp({
  cells,
  people,
  close,
  done,
}: {
  cells: Cell[]
  people: Person[]
  close: () => void
  done: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/follow-ups', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      })
      sound.success()
      done()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create follow-up')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal eyebrow="A soul, not a number" title="Begin a Care Journey" onClose={close}>
      <p className="modal-copy">
        <Sparkles /> Capture essential details for intentional pastoral follow-up. Assign a leader who
        will reach out within 24 hours.
      </p>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Person’s name
          <input name="person_name" required autoFocus placeholder="e.g. Brother Kenneth" />
        </label>
        <label>
          Phone number
          <input name="phone" type="tel" placeholder="+234 80…" />
        </label>
        <label>
          Connected through
          <select name="source">
            <option>First timer</option>
            <option>New convert</option>
            <option>Outreach</option>
            <option>Referral</option>
          </select>
        </label>
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
          Assigned to (Care Leader)
          <select name="assigned_to" defaultValue="">
            <option value="">Assign later</option>
            {people.map(p => (
              <option value={p.id} key={p.id}>
                {p.full_name} ({p.leadership_stage}) · {p.cell_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Follow-up deadline
          <input name="due_at" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label className="full">
          Care context & prayer notes
          <textarea
            name="notes"
            maxLength={500}
            placeholder="Prayer points, salvation decision, preferred time to contact…"
          />
        </label>

        {error && <p className="form-error full">{error}</p>}
        <div className="form-actions full">
          <button type="button" className="button ghost" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            <HeartHandshake /> {busy ? 'Starting journey…' : 'Start care journey'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
