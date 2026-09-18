import { useState, type FormEvent } from 'react'
import {
  Download,
  HeartHandshake,
  Mail,
  Phone,
  Plus,
  Search,
  Sparkles,
  Upload,
  UserRoundPlus,
} from 'lucide-react'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { Cell, Person } from '../types'
import { Empty, ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { PersonDrawer } from '../components/PersonDrawer'
import { sound } from '../sound'

export default function People() {
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        api<{ people: Person[] }>('/people'),
        api<{ cells: Cell[] }>('/cells'),
      ]).then(([p, c]) => ({ ...p, ...c })),
    []
  )

  const [open, setOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [selectedPersonId, setSelectedPersonId] = useState<string>()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'Everyone' | 'Leaders' | 'Potential' | 'Members'>('Everyone')

  if (loading) return <Loading label="Gathering the discipleship registry" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  const people = data.people
    .filter(p =>
      (p.full_name + p.cell_name + p.leadership_stage + (p.phone || '') + (p.email || ''))
        .toLowerCase()
        .includes(q.toLowerCase())
    )
    .filter(p => {
      if (filter === 'Leaders') return p.leadership_stage.includes('Leader')
      if (filter === 'Potential') return p.leadership_stage === 'Potential Leader' || p.leadership_stage === 'Class Teacher'
      if (filter === 'Members') return p.leadership_stage === 'Member'
      return true
    })

  return (
    <>
      <PageHeader
        eyebrow="People & Discipleship"
        title="Every soul has a story."
        copy="Care for the people behind the numbers, guide each person along the spiritual pathway and nurture tomorrow’s leaders."
        action={
          <div className="header-actions">
            <a className="button ghost" href="/api/people/export.csv" download>
              <Download /> Export CSV
            </a>
            <button
              className="button ghost"
              onClick={() => {
                sound.click()
                setImportOpen(true)
              }}
            >
              <Upload /> Import
            </button>
            <button
              className="button primary"
              onClick={() => {
                sound.click()
                setOpen(true)
              }}
            >
              <UserRoundPlus /> Add a person
            </button>
          </div>
        }
      />

      <div className="toolbar">
        <label className="table-search">
          <Search />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search by name, cell, stage or contact…"
          />
        </label>
        <div className="filter-pills">
          {(['Everyone', 'Leaders', 'Potential', 'Members'] as const).map(name => (
            <button
              key={name}
              className={filter === name ? 'active' : ''}
              onClick={() => {
                sound.click()
                setFilter(name)
              }}
            >
              {name}
            </button>
          ))}
        </div>
        <span className="toolbar-counter">
          <b>{people.length}</b> people shown
        </span>
      </div>

      {people.length ? (
        <div className="people-table">
          <div className="table-head">
            <span>PERSON</span>
            <span>CELL</span>
            <span>JOURNEY STAGE</span>
            <span>DISCIPLESHIP</span>
            <span>CONTACT</span>
          </div>
          {people.map((p, i) => (
            <article
              key={p.id}
              className="people-row"
              onClick={() => {
                sound.click()
                setSelectedPersonId(p.id)
              }}
            >
              <div className={`avatar av-${i % 5}`}>
                {p.full_name
                  .split(' ')
                  .map(x => x[0])
                  .join('')
                  .slice(0, 2)}
              </div>
              <span className="person-name">
                <b>{p.full_name}</b>
                <small>
                  Joined{' '}
                  {new Date(p.joined_at + 'T12:00').toLocaleDateString('en', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </small>
              </span>
              <span>
                <b>{p.cell_name}</b>
                <small>Home cell</small>
              </span>
              <span>
                <i className={`stage-dot stage-${p.leadership_stage.toLowerCase().replace(/\s+/g, '-')}`} />
                <b>{p.leadership_stage}</b>
              </span>
              <span className="discipleship-chip">
                {p.disciples_count && p.disciples_count > 0 ? (
                  <span className="disciples-badge">
                    <HeartHandshake /> {p.disciples_count} mentored
                  </span>
                ) : p.discipled_by_name ? (
                  <small className="mentor-name">Under {p.discipled_by_name}</small>
                ) : (
                  <small className="mentor-name muted">—</small>
                )}
              </span>
              <span className="contact-icons" onClick={e => e.stopPropagation()}>
                {p.email && (
                  <a href={`mailto:${p.email}`} aria-label={`Email ${p.full_name}`}>
                    <Mail />
                  </a>
                )}
                {p.phone && (
                  <a href={`tel:${p.phone}`} aria-label={`Call ${p.full_name}`}>
                    <Phone />
                  </a>
                )}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No people match your search"
          copy="Try a broader name, change the filter or welcome someone new to the registry."
        />
      )}

      {/* New Person Modal */}
      {open && (
        <NewPerson
          cells={data.cells}
          people={data.people}
          close={() => setOpen(false)}
          done={() => {
            setOpen(false)
            reload()
          }}
        />
      )}

      {/* Import CSV Modal */}
      {importOpen && (
        <ImportPeople
          close={() => setImportOpen(false)}
          done={() => {
            setImportOpen(false)
            reload()
          }}
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

function NewPerson({
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
      await api('/people', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      })
      sound.success()
      done()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add person')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal eyebrow="People in care" title="Welcome someone new" onClose={close}>
      <p className="modal-copy">
        <Sparkles /> Create a respectful, intentional ministry record. Track their cell belonging and
        discipleship mentor.
      </p>
      <form className="form-grid" onSubmit={submit}>
        <label className="full">
          Full name
          <input name="full_name" required minLength={2} autoFocus placeholder="First and last name" />
        </label>
        <label>
          Email
          <input name="email" type="email" placeholder="name@example.org" />
        </label>
        <label>
          Phone
          <input name="phone" type="tel" placeholder="+234…" />
        </label>
        <label>
          Cell assignment
          <select name="cell_id" required defaultValue="">
            <option disabled value="">
              Select a cell
            </option>
            {cells.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </label>
        <label>
          Leadership journey stage
          <select name="leadership_stage" defaultValue="Member">
            <option>Member</option>
            <option>Potential Leader</option>
            <option>Class Teacher</option>
            <option>Assistant Leader</option>
            <option>Cell Leader</option>
          </select>
        </label>
        <label className="full">
          Discipled / Mentored by
          <select name="discipled_by_person_id" defaultValue="">
            <option value="">Assign mentor later</option>
            {people.map(p => (
              <option key={p.id} value={p.id}>
                {p.full_name} ({p.leadership_stage}) · {p.cell_name}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="form-error full">{error}</p>}
        <div className="form-actions full">
          <button type="button" className="button ghost" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Welcoming…' : <><Plus /> Add to cell</>}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function parseCsv(text: string) {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) throw new Error('The CSV must contain a header and at least one person.')
  const parse = (line: string) => {
    const out: string[] = []
    let value = '',
      quoted = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' && line[i + 1] === '"') {
        value += '"'
        i++
      } else if (char === '"') quoted = !quoted
      else if (char === ',' && !quoted) {
        out.push(value.trim())
        value = ''
      } else value += char
    }
    out.push(value.trim())
    return out
  }
  const headers = parse(lines[0]).map(h => h.toLowerCase())
  const required = ['full_name', 'cell_code']
  required.forEach(key => {
    if (!headers.includes(key)) throw new Error(`Missing required column: ${key}`)
  })
  return lines
    .slice(1)
    .filter(Boolean)
    .map(line => {
      const values = parse(line),
        row = Object.fromEntries(headers.map((h, i) => [h, values[i] || '']))
      return {
        full_name: row.full_name,
        email: row.email || '',
        phone: row.phone || '',
        cell_code: row.cell_code,
        leadership_stage: (row.leadership_stage || 'Member') as any,
      }
    })
}

function ImportPeople({ close, done }: { close: () => void; done: () => void }) {
  const [records, setRecords] = useState<ReturnType<typeof parseCsv>>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function choose(file?: File) {
    if (!file) return
    try {
      setRecords(parseCsv(await file.text()))
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read CSV')
    }
  }

  async function upload() {
    setBusy(true)
    setError('')
    try {
      await api('/people/import', { method: 'POST', body: JSON.stringify({ records }) })
      sound.success()
      done()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal eyebrow="Bulk migration" title="Import people from CSV" onClose={close}>
      <p className="modal-copy">
        Required columns: <code>full_name, cell_code</code>. Optional:{' '}
        <code>email, phone, leadership_stage</code>. Up to 500 rows validated before saving.
      </p>
      <label className="upload-drop">
        <Upload />
        <b>Choose a CSV file</b>
        <small>Records are validated against your active cell codes.</small>
        <input type="file" accept=".csv,text/csv" onChange={e => choose(e.target.files?.[0])} />
      </label>
      {records.length > 0 && (
        <div className="import-preview">
          <b>{records.length} people ready for import</b>
          <span>
            {records.slice(0, 3).map(r => r.full_name).join(' · ')}
            {records.length > 3 ? '…' : ''}
          </span>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="button ghost" onClick={close}>
          Cancel
        </button>
        <button className="button primary" disabled={!records.length || busy} onClick={upload}>
          {busy ? 'Importing…' : `Import ${records.length || ''} people`}
        </button>
      </div>
    </Modal>
  )
}
