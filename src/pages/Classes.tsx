import { useState, type FormEvent } from 'react'
import {
  Award,
  BookMarked,
  Clock3,
  GraduationCap,
  Plus,
  Search,
  Sparkles,
  Users,
} from 'lucide-react'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { BibleClass, Cell, Person } from '../types'
import { Empty, ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { ClassRosterModal } from '../components/ClassRosterModal'
import { sound } from '../sound'

export default function Classes() {
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        api<{ classes: BibleClass[] }>('/classes'),
        api<{ cells: Cell[] }>('/cells'),
        api<{ people: Person[] }>('/people'),
      ]).then(([a, b, c]) => ({ ...a, ...b, ...c })),
    []
  )

  const [open, setOpen] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState<string>()
  const [q, setQ] = useState('')
  const [stageFilter, setStageFilter] = useState<'All' | 'Foundation' | 'New Believers' | 'Leadership' | 'Bible Study'>('All')

  if (loading) return <Loading label="Opening discipleship & learning circles" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  const filtered = data.classes
    .filter(c => (c.name + c.cell_name + (c.teacher || '')).toLowerCase().includes(q.toLowerCase()))
    .filter(c => (stageFilter === 'All' ? true : c.stage === stageFilter))

  const totalEnrolled = data.classes.reduce((n, c) => n + c.enrolled, 0)
  const totalGraduated = data.classes.reduce((n, c) => n + (c.graduated || 0), 0)

  return (
    <>
      <PageHeader
        eyebrow="Formation & Discipleship"
        title="Learning that produces leaders."
        copy="Nurture deep scriptural roots, equip new converts through Foundation School, and raise the faithful leaders every cell needs next."
        action={
          <button
            className="button primary"
            onClick={() => {
              sound.click()
              setOpen(true)
            }}
          >
            <Plus /> Create a Bible class
          </button>
        }
      />

      <section className="class-intro">
        <div className="class-intro-stat">
          <GraduationCap />
          <span>
            <b>{totalEnrolled}</b>
            <small>Active learners</small>
          </span>
        </div>
        <div className="class-intro-stat">
          <Award />
          <span>
            <b>{totalGraduated}</b>
            <small>Graduates</small>
          </span>
        </div>
        <div className="class-intro-stat">
          <BookMarked />
          <span>
            <b>{data.classes.length}</b>
            <small>Active circles</small>
          </span>
        </div>
        <p>
          <Sparkles /> Formation is not a finish line. It is the rhythmic discipleship pathway
          through which members become rooted in doctrine, equipped for service, and prepared for
          leadership.
        </p>
      </section>

      <div className="toolbar">
        <label className="table-search">
          <Search />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search classes by name, cell or teacher…"
          />
        </label>
        <div className="filter-pills">
          {(['All', 'Foundation', 'New Believers', 'Leadership', 'Bible Study'] as const).map(s => (
            <button
              key={s}
              className={stageFilter === s ? 'active' : ''}
              onClick={() => {
                sound.click()
                setStageFilter(s)
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="toolbar-counter">
          <b>{filtered.length}</b> circles shown
        </span>
      </div>

      {filtered.length ? (
        <div className="class-grid">
          {filtered.map((item, index) => (
            <article
              key={item.id}
              className="class-card"
              style={{ '--class-accent': `var(--brand-${index % 4})` } as React.CSSProperties}
              onClick={() => {
                sound.click()
                setSelectedClassId(item.id)
              }}
            >
              <header>
                <span className="class-stage-pill">{item.stage}</span>
                <i className={`status ${item.status}`}>{item.status}</i>
              </header>

              <div className="class-symbol">
                <GraduationCap />
              </div>

              <h2>{item.name}</h2>
              <p className="class-cell-name">{item.cell_name}</p>

              <div className="class-meta">
                <span>
                  <Users />
                  <b>{item.enrolled}</b>
                  <small>Enrolled students</small>
                </span>
                <span>
                  <Clock3 />
                  <b>{item.schedule?.split(' · ')[0] || 'Flexible'}</b>
                  <small>{item.schedule?.split(' · ')[1] || 'Weekly rhythm'}</small>
                </span>
              </div>

              <footer>
                <div>
                  <small>FACILITATED BY</small>
                  <b>{item.teacher || 'Teacher to assign'}</b>
                </div>
                <button className="button ghost tiny" title="Open student roster">
                  Manage roster
                </button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No classes found"
          copy="Try a different stage filter or create a new class for this community."
        />
      )}

      {/* New Class Modal */}
      {open && (
        <NewClass
          cells={data.cells}
          people={data.people}
          close={() => setOpen(false)}
          done={() => {
            setOpen(false)
            reload()
          }}
        />
      )}

      {/* Class Roster & Enrollment Management Modal */}
      {selectedClassId && (
        <ClassRosterModal
          classId={selectedClassId}
          people={data.people}
          close={() => setSelectedClassId(undefined)}
          onReloadNeeded={reload}
        />
      )}
    </>
  )
}

function NewClass({
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
      await api('/classes', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      })
      sound.success()
      done()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create class')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal eyebrow="New learning circle" title="Create a Bible Study Class" onClose={close}>
      <p className="modal-copy">
        <Sparkles /> Bible Study classes are the spiritual engines of the cell where new believers are
        established in faith and equipped for leadership.
      </p>
      <form className="form-grid" onSubmit={submit}>
        <label className="full">
          Class name
          <input name="name" required placeholder="e.g. Foundation Class 02 / Emerging Leaders" />
        </label>
        <label>
          Home cell
          <select name="cell_id" required defaultValue="">
            <option value="" disabled>
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
          Curriculum stage
          <select name="stage">
            <option>Foundation</option>
            <option>New Believers</option>
            <option>Leadership</option>
            <option>Bible Study</option>
          </select>
        </label>
        <label>
          Teacher / Facilitator
          <select name="teacher_id" defaultValue="">
            <option value="">Assign later</option>
            {people.map(p => (
              <option value={p.id} key={p.id}>
                {p.full_name} ({p.leadership_stage}) · {p.cell_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Schedule
          <input name="schedule" placeholder="Saturdays · 4:00 PM" defaultValue="Saturdays · 4:00 PM" />
        </label>

        {error && <p className="form-error full">{error}</p>}
        <div className="form-actions full">
          <button type="button" className="button ghost" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Establishing…' : 'Create class'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
