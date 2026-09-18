import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarDays,
  GitBranch,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Users,
} from 'lucide-react'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { Cell, Person } from '../types'
import { Empty, ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { CellDrawer } from '../components/CellDrawer'
import { MultiplyModal } from '../components/MultiplyModal'
import { PersonDrawer } from '../components/PersonDrawer'
import { sound } from '../sound'

export default function Cells() {
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        api<{ cells: Cell[] }>('/cells'),
        api<{ people: Person[] }>('/people'),
      ]).then(([c, p]) => ({ ...c, ...p })),
    []
  )

  const [open, setOpen] = useState(false)
  const [multiplyOpen, setMultiplyOpen] = useState(false)
  const [multiplyParentId, setMultiplyParentId] = useState<string>()
  const [selectedCellId, setSelectedCellId] = useState<string>()
  const [selectedPersonId, setSelectedPersonId] = useState<string>()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'All' | 'Active' | 'Ready to Multiply'>('All')

  if (loading) return <Loading label="Mapping your cell communities" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  const filtered = data.cells
    .filter(c => (c.name + c.code + (c.location || '') + (c.leader || '')).toLowerCase().includes(query.toLowerCase()))
    .filter(c => {
      if (filter === 'Active') return c.status === 'active'
      if (filter === 'Ready to Multiply') return c.members >= 5
      return true
    })

  return (
    <>
      <PageHeader
        eyebrow="Living Kingdom Infrastructure"
        title="Cells, alive & multiplying."
        copy="Every cell has a heritage, a leader, a rhythm and a divine mandate to produce new leaders and daughter cells."
        action={
          <div className="header-actions">
            <button
              className="button secondary"
              onClick={() => {
                sound.click()
                setMultiplyParentId(data.cells[0]?.id)
                setMultiplyOpen(true)
              }}
            >
              <GitBranch /> Multiply cell
            </button>
            <button
              className="button primary"
              onClick={() => {
                sound.click()
                setOpen(true)
              }}
            >
              <Plus /> Pioneer new cell
            </button>
          </div>
        }
      />

      <div className="toolbar">
        <label className="table-search">
          <Search />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by cell name, code, neighbourhood or leader…"
          />
        </label>
        <div className="filter-pills">
          {(['All', 'Active', 'Ready to Multiply'] as const).map(f => (
            <button
              key={f}
              className={filter === f ? 'active' : ''}
              onClick={() => {
                sound.click()
                setFilter(f)
              }}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="toolbar-counter">
          <b>{filtered.length}</b> {filtered.length === 1 ? 'cell' : 'cells'} displayed
        </span>
      </div>

      {filtered.length ? (
        <div className="cell-grid">
          {filtered.map((cell, i) => (
            <article
              className="cell-card"
              key={cell.id}
              style={{ '--delay': `${i * 45}ms` } as React.CSSProperties}
              onClick={() => {
                sound.click()
                setSelectedCellId(cell.id)
              }}
            >
              <header>
                <span className="cell-code-badge">{cell.code}</span>
                <i className={`status ${cell.status}`}>{cell.status}</i>
              </header>

              <div className="cell-orbit">
                <span>
                  {cell.name
                    .split(' ')
                    .map(x => x[0])
                    .join('')
                    .slice(0, 2)}
                </span>
              </div>

              <h2>{cell.name}</h2>
              <p className="cell-loc">
                <MapPin /> {cell.location || 'Location to be confirmed'}
              </p>

              <div className="cell-details">
                <span>
                  <Users />
                  <b>{cell.members}</b>
                  <small>People</small>
                </span>
                <span>
                  <CalendarDays />
                  <b>{cell.meeting_day || 'Friday'}</b>
                  <small>{cell.meeting_time || '18:00'}</small>
                </span>
              </div>

              <footer>
                <div className="cell-leader-meta">
                  <small>LED BY</small>
                  <b>{cell.leader || 'Leader to be appointed'}</b>
                </div>
                <div className="card-actions" onClick={e => e.stopPropagation()}>
                  <button
                    className="icon-button"
                    title="Pioneer daughter cell"
                    onClick={() => {
                      sound.click()
                      setMultiplyParentId(cell.id)
                      setMultiplyOpen(true)
                    }}
                  >
                    <GitBranch />
                  </button>
                  <Link
                    className="icon-button"
                    to="/genealogy"
                    title="View in Genealogy"
                  >
                    <ArrowUpRight />
                  </Link>
                </div>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No cells match your search"
          copy="Try a broader name, code or location, or pioneer a new cell in this territory."
        />
      )}

      {/* New Cell Pioneer Modal */}
      {open && (
        <NewCell
          cells={data.cells}
          close={() => setOpen(false)}
          done={() => {
            setOpen(false)
            reload()
          }}
        />
      )}

      {/* Multiply Cell Modal */}
      {multiplyOpen && (
        <MultiplyModal
          cells={data.cells}
          people={data.people}
          defaultParentId={multiplyParentId}
          close={() => setMultiplyOpen(false)}
          done={() => {
            setMultiplyOpen(false)
            reload()
          }}
        />
      )}

      {/* Cell Detail Drawer */}
      {selectedCellId && (
        <CellDrawer
          cellId={selectedCellId}
          onClose={() => setSelectedCellId(undefined)}
          onMultiply={cellId => {
            setSelectedCellId(undefined)
            setMultiplyParentId(cellId)
            setMultiplyOpen(true)
          }}
          onPersonClick={personId => {
            setSelectedCellId(undefined)
            setSelectedPersonId(personId)
          }}
          onReloadNeeded={reload}
        />
      )}

      {/* Person Detail Drawer */}
      {selectedPersonId && (
        <PersonDrawer
          personId={selectedPersonId}
          onClose={() => setSelectedPersonId(undefined)}
          onReloadNeeded={reload}
        />
      )}
    </>
  )
}

function NewCell({
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
    const form = new FormData(e.currentTarget)
    try {
      await api('/cells', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) })
      sound.success()
      done()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create cell')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal eyebrow="Multiplication pathway" title="Pioneer a new cell" onClose={close}>
      <p className="modal-copy">
        <Sparkles /> Begin a new branch in your ministry’s living genealogy.
      </p>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Cell name
          <input name="name" required minLength={2} placeholder="e.g. House of Mercy" />
        </label>
        <label>
          Cell code
          <input name="code" required pattern="[A-Za-z0-9-]+" placeholder="e.g. HM-06" />
        </label>
        <label className="full">
          Parent cell
          <select name="parent_id" required defaultValue="">
            <option value="" disabled>
              Select parent cell
            </option>
            {cells.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </label>
        <label>
          Location
          <input name="location" placeholder="Neighbourhood or area venue" />
        </label>
        <div className="form-row full">
          <label style={{ flex: 1 }}>
            Meeting day
            <select name="meeting_day" defaultValue="Friday">
              <option>Friday</option>
              <option>Saturday</option>
              <option>Sunday</option>
              <option>Wednesday</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Meeting time
            <input name="meeting_time" type="time" defaultValue="18:00" />
          </label>
        </div>
        {error && <p className="form-error full">{error}</p>}
        <div className="form-actions full">
          <button type="button" className="button ghost" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Creating lineage…' : 'Create cell'} <ArrowUpRight />
          </button>
        </div>
      </form>
    </Modal>
  )
}
