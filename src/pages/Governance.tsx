import { useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowRight,
  Check,
  History,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserCog,
  UsersRound,
} from 'lucide-react'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { Assignment, AuditLog, Cell, Person, Transfer } from '../types'
import { ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { sound } from '../sound'

type Tab = 'transfers' | 'leadership' | 'audit'

export default function Governance() {
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        api<{ transfers: Transfer[] }>('/transfers'),
        api<{ assignments: Assignment[] }>('/leadership-assignments'),
        api<{ logs: AuditLog[] }>('/audit-logs'),
        api<{ people: Person[] }>('/people'),
        api<{ cells: Cell[] }>('/cells'),
      ]).then(([a, b, c, d, e]) => ({ ...a, ...b, ...c, ...d, ...e })),
    []
  )

  const [tab, setTab] = useState<Tab>('transfers')
  const [modal, setModal] = useState<'transfer' | 'assignment'>()
  const [busy, setBusy] = useState('')

  if (loading) return <Loading label="Opening ministry governance & audit records" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  async function reviewTransfer(id: string, decision: 'approved' | 'returned') {
    setBusy(id)
    try {
      await api(`/transfers/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ decision }),
      })
      if (decision === 'approved') sound.success()
      else sound.click()
      await reload()
    } finally {
      setBusy('')
    }
  }

  async function endAssignment(id: string) {
    setBusy(id)
    try {
      await api(`/leadership-assignments/${id}/end`, {
        method: 'PATCH',
      })
      sound.click()
      await reload()
    } finally {
      setBusy('')
    }
  }

  const pendingTransfers = data.transfers.filter(t => t.status === 'pending').length

  return (
    <>
      <PageHeader
        eyebrow="Stewardship & Governance"
        title="Lead with history intact."
        copy="Govern member transfers with atomic integrity, preserve appointments without rewriting yesterday’s truth, and make every decision visible in the audit trail."
        action={
          <button
            className="button primary"
            onClick={() => {
              sound.click()
              setModal(tab === 'leadership' ? 'assignment' : 'transfer')
            }}
            disabled={tab === 'audit'}
          >
            <Plus /> {tab === 'leadership' ? 'Record appointment' : 'Request transfer'}
          </button>
        }
      />

      <div className="governance-tabs">
        {(['transfers', 'leadership', 'audit'] as const).map(name => (
          <button
            key={name}
            className={tab === name ? 'active' : ''}
            onClick={() => {
              sound.click()
              setTab(name)
            }}
          >
            {name === 'transfers' ? (
              <>
                <UsersRound /> Member Transfers {pendingTransfers > 0 && <i>{pendingTransfers}</i>}
              </>
            ) : name === 'leadership' ? (
              <>
                <UserCog /> Leadership Appointments
              </>
            ) : (
              <>
                <History /> Immutable Audit Trail
              </>
            )}
          </button>
        ))}
      </div>

      {tab === 'transfers' && (
        <div className="transfer-list">
          {data.transfers.length ? (
            data.transfers.map(t => (
              <article key={t.id} className="transfer-row">
                <div className="transfer-person">
                  <span>
                    {t.person_name
                      .split(' ')
                      .map(x => x[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                  <div>
                    <b>{t.person_name}</b>
                    <small>{t.category}</small>
                  </div>
                </div>

                <div className="transfer-path">
                  <span>{t.from_cell}</span>
                  <ArrowRight />
                  <span>{t.to_cell}</span>
                </div>

                <i className={`status ${t.status}`}>{t.status}</i>

                <div className="transfer-actions">
                  {t.status === 'pending' ? (
                    <>
                      <button
                        disabled={busy === t.id}
                        onClick={() => reviewTransfer(t.id, 'returned')}
                        className="button ghost tiny"
                      >
                        <RotateCcw /> Return
                      </button>
                      <button
                        disabled={busy === t.id}
                        onClick={() => reviewTransfer(t.id, 'approved')}
                        className="button primary tiny"
                      >
                        <Check /> Approve
                      </button>
                    </>
                  ) : (
                    <small className="reviewed-badge">Reviewed</small>
                  )}
                </div>
              </article>
            ))
          ) : (
            <div className="governance-empty">
              <ShieldCheck />
              <h2>No transfers awaiting stewardship.</h2>
              <p>New transfer requests will appear here with full lineage tracking.</p>
            </div>
          )}
        </div>
      )}

      {tab === 'leadership' && (
        <div className="assignment-list">
          <header>
            <span>LEADER</span>
            <span>ROLE</span>
            <span>ASSIGNED SCOPE</span>
            <span>SERVICE TENURE</span>
            <span>STATE & ACTION</span>
          </header>
          {data.assignments.map(a => (
            <article key={a.id} className="assignment-row">
              <b>{a.person_name}</b>
              <span>{a.role}</span>
              <span>{a.scope_name}</span>
              <span>
                {new Date(a.start_date + 'T12:00').toLocaleDateString('en', {
                  month: 'short',
                  year: 'numeric',
                })}{' '}
                →{' '}
                {a.end_date
                  ? new Date(a.end_date + 'T12:00').toLocaleDateString('en', {
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'Present'}
              </span>
              <div className="assignment-action-cell">
                <i className={`status ${a.status}`}>{a.status}</i>
                {a.status === 'active' && (
                  <button
                    className="button ghost tiny"
                    onClick={() => endAssignment(a.id)}
                    disabled={busy === a.id}
                  >
                    Conclude
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'audit' && (
        <div className="audit-timeline">
          {data.logs.map(log => (
            <article key={log.id} className="audit-row">
              <i className="audit-marker" />
              <time>
                {new Date(log.created_at.replace(' ', 'T') + 'Z').toLocaleString('en', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              <div className="audit-info">
                <b>{log.action.replaceAll('_', ' ')}</b>
                <p>
                  By {log.user_name || 'Authorized Operator'} · {log.entity_type}{' '}
                  {log.detail && `· ${log.detail}`}
                </p>
              </div>
              <code className="audit-id">{log.entity_id?.slice(0, 12) || 'SYSTEM'}</code>
            </article>
          ))}
        </div>
      )}

      {modal === 'transfer' && (
        <NewTransfer
          people={data.people}
          cells={data.cells}
          close={() => setModal(undefined)}
          done={() => {
            setModal(undefined)
            reload()
          }}
        />
      )}

      {modal === 'assignment' && (
        <NewAssignment
          people={data.people}
          cells={data.cells}
          close={() => setModal(undefined)}
          done={() => {
            setModal(undefined)
            reload()
          }}
        />
      )}
    </>
  )
}

function NewTransfer({
  people,
  cells,
  close,
  done,
}: {
  people: Person[]
  cells: Cell[]
  close: () => void
  done: () => void
}) {
  return (
    <ActionModal title="Request Member Transfer" endpoint="/transfers" close={close} done={done}>
      <label className="full">
        Member to transfer
        <select name="person_id" required defaultValue="">
          <option disabled value="">
            Select person
          </option>
          {people.map(p => (
            <option value={p.id} key={p.id}>
              {p.full_name} · from {p.cell_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Receiving cell
        <select name="to_cell_id" required defaultValue="">
          <option disabled value="">
            Select receiving cell
          </option>
          {cells.map(c => (
            <option value={c.id} key={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </label>
      <label>
        Transfer Category
        <select name="category">
          <option>Relocation</option>
          <option>Pastoral assignment</option>
          <option>Catchment change</option>
          <option>Other</option>
        </select>
      </label>
      <label className="full">
        Stewardship notes
        <textarea name="notes" maxLength={500} placeholder="Context for the receiving cell leader…" />
      </label>
    </ActionModal>
  )
}

function NewAssignment({
  people,
  cells,
  close,
  done,
}: {
  people: Person[]
  cells: Cell[]
  close: () => void
  done: () => void
}) {
  return (
    <ActionModal
      title="Record Leadership Appointment"
      endpoint="/leadership-assignments"
      close={close}
      done={done}
    >
      <label>
        Leader appointed
        <select name="person_id" required defaultValue="">
          <option disabled value="">
            Select leader
          </option>
          {people.map(p => (
            <option value={p.id} key={p.id}>
              {p.full_name} ({p.leadership_stage})
            </option>
          ))}
        </select>
      </label>
      <label>
        Ministry scope / Cell
        <select name="org_node_id" required defaultValue="">
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
        Role designation
        <input name="role" required placeholder="e.g. Cell Leader, Assistant Leader, Secretary" />
      </label>
      <label>
        Effective start date
        <input name="start_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
      </label>
    </ActionModal>
  )
}

function ActionModal({
  title,
  endpoint,
  close,
  done,
  children,
}: {
  title: string
  endpoint: string
  close: () => void
  done: () => void
  children: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api(endpoint, {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))),
      })
      sound.success()
      done()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete request')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal eyebrow="Governed workflow" title={title} onClose={close}>
      <form className="form-grid" onSubmit={submit}>
        {children}
        {error && <p className="form-error full">{error}</p>}
        <div className="form-actions full">
          <button type="button" className="button ghost" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save record'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
