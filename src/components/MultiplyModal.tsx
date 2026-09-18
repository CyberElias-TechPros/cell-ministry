import { useState, type FormEvent } from 'react'
import { ArrowUpRight, GitBranch, Sparkles } from 'lucide-react'
import { api } from '../api'
import type { Cell, Person } from '../types'
import { Modal } from './Modal'
import { sound } from '../sound'

type Props = {
  cells: Cell[]
  people: Person[]
  defaultParentId?: string
  close: () => void
  done: () => void
}

export function MultiplyModal({ cells, people, defaultParentId, close, done }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [parentId, setParentId] = useState(defaultParentId || cells[0]?.id || '')

  const eligibleLeaders = people.filter(
    p =>
      p.cell_id === parentId ||
      ['Potential Leader', 'Class Teacher', 'Assistant Leader', 'Cell Leader'].includes(p.leadership_stage)
  )

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const formData = new FormData(e.currentTarget)
    const raw = Object.fromEntries(formData)

    try {
      await api('/cells/multiply', {
        method: 'POST',
        body: JSON.stringify({
          parent_cell_id: raw.parent_cell_id,
          name: raw.name,
          code: String(raw.code).toUpperCase(),
          pioneer_person_id: raw.pioneer_person_id,
          location: raw.location || undefined,
          meeting_day: raw.meeting_day || 'Friday',
          meeting_time: raw.meeting_time || '18:00',
          notes: raw.notes || undefined,
        }),
      })
      sound.success()
      done()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete multiplication')
    } finally {
      setBusy(false)
    }
  }

  const parentCell = cells.find(c => c.id === parentId)

  return (
    <Modal eyebrow="Signature expansion milestone" title="Pioneer a Daughter Cell" onClose={close}>
      <p className="modal-copy">
        <Sparkles /> Cell multiplication preserves where each community came from while raising a new
        leader and birthing a new generation.
      </p>

      <form className="form-grid" onSubmit={submit}>
        <label className="full">
          Parent Cell (Multiplying Community)
          <select
            name="parent_cell_id"
            value={parentId}
            onChange={e => setParentId(e.target.value)}
            required
          >
            {cells.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code}) · {c.members} members
              </option>
            ))}
          </select>
        </label>

        <label>
          New Cell Name
          <input
            name="name"
            required
            minLength={2}
            placeholder={parentCell ? `${parentCell.name} II / Grace Chapel` : 'e.g. Dominion Cell'}
          />
        </label>

        <label>
          New Cell Code
          <input
            name="code"
            required
            pattern="[A-Za-z0-9-]+"
            placeholder="e.g. DM-07"
          />
        </label>

        <label className="full">
          Pioneer Leader (Raised for this assignment)
          <select name="pioneer_person_id" required defaultValue="">
            <option value="" disabled>
              Select pioneer leader
            </option>
            {eligibleLeaders.map(p => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.leadership_stage}) · from {p.cell_name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Neighbourhood / Location
          <input name="location" placeholder="e.g. Peter Odili Road, Trans Amadi" />
        </label>

        <div className="form-row full">
          <label style={{ flex: 1 }}>
            Meeting Day
            <select name="meeting_day" defaultValue="Friday">
              <option>Friday</option>
              <option>Saturday</option>
              <option>Sunday</option>
              <option>Wednesday</option>
              <option>Thursday</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Meeting Time
            <input name="meeting_time" type="time" defaultValue="18:00" />
          </label>
        </div>

        <label className="full">
          Multiplication Vision / Context
          <textarea
            name="notes"
            maxLength={500}
            placeholder="Vision for this expansion, catchment territory, initial seed members…"
          />
        </label>

        {error && <p className="form-error full">{error}</p>}

        <div className="form-actions full">
          <button type="button" className="button ghost" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            <GitBranch /> {busy ? 'Birthed in lineage…' : 'Multiply and establish cell'} <ArrowUpRight />
          </button>
        </div>
      </form>
    </Modal>
  )
}
