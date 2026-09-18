import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  Download,
  FileCheck2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { Meeting } from '../types'
import { Empty, ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { sound } from '../sound'

type Report = Meeting & { submitted_by_name: string }

export default function Reports() {
  const { data, error, loading, reload } = useLoad(
    () => api<{ reports: Report[] }>('/reports'),
    []
  )

  const [busy, setBusy] = useState('')
  const [returnModalReport, setReturnModalReport] = useState<Report | null>(null)
  const [returnNotes, setReturnNotes] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'approved' | 'returned'>('all')

  if (loading) return <Loading label="Preparing report review & stewardship queue" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  async function review(id: string, decision: 'approved' | 'returned', notes?: string) {
    setBusy(id + decision)
    try {
      await api(`/reports/${id}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ decision, notes }),
      })
      if (decision === 'approved') sound.success()
      else sound.click()
      await reload()
    } finally {
      setBusy('')
    }
  }

  const pending = data.reports.filter(r => r.status === 'submitted').length
  const filteredReports = data.reports.filter(r =>
    statusFilter === 'all' ? true : r.status === statusFilter
  )

  return (
    <>
      <PageHeader
        eyebrow="Oversight & Stewardship"
        title="Review with clarity and honor."
        copy="Protect reporting integrity while keeping feedback fast, constructive, and permanently logged in the audit trail."
        action={
          <a className="button primary" href="/api/reports/export.csv" download>
            <Download /> Export CSV
          </a>
        }
      />

      {/* Review Queue Status Banner */}
      <section className="review-banner">
        <div className="review-seal">
          <ShieldCheck />
        </div>
        <div>
          <p className="eyebrow">
            <Sparkles /> Stewardship Verification
          </p>
          <h2>
            {pending
              ? `${pending} report${pending === 1 ? '' : 's'} awaiting your review`
              : 'The review queue is clear & verified'}
          </h2>
          <p>Every decision is immutably recorded in the ministry audit ledger.</p>
        </div>
        <strong>{String(pending).padStart(2, '0')}</strong>
      </section>

      <div className="toolbar">
        <div className="filter-pills">
          {(['all', 'submitted', 'approved', 'returned'] as const).map(s => (
            <button
              key={s}
              className={statusFilter === s ? 'active' : ''}
              onClick={() => {
                sound.click()
                setStatusFilter(s)
              }}
            >
              {s === 'all' ? 'All reports' : s === 'submitted' ? 'Pending Review' : s}
            </button>
          ))}
        </div>
        <span className="toolbar-counter">
          <b>{filteredReports.length}</b> reports shown
        </span>
      </div>

      {filteredReports.length ? (
        <div className="review-list">
          {filteredReports.map(report => (
            <article key={report.id} className="review-card">
              <div className="review-date">
                <b>{new Date(report.held_at + 'T12:00').getDate()}</b>
                <span>
                  {new Date(report.held_at + 'T12:00').toLocaleDateString('en', { month: 'short' })}
                </span>
              </div>

              <div className="review-title">
                <small>{report.meeting_type}</small>
                <h3>{report.cell_name}</h3>
                <p>Submitted by {report.submitted_by_name || 'Leader'}</p>
                {report.notes && <small className="report-notes-preview">“{report.notes}”</small>}
              </div>

              <div className="review-metrics">
                <span>
                  <b>{report.attendance}</b>
                  <small>Attendance</small>
                </span>
                <span>
                  <b>{report.first_timers}</b>
                  <small>First timers</small>
                </span>
                <span>
                  <b>{report.new_converts}</b>
                  <small>New converts</small>
                </span>
              </div>

              <div className="review-status-col">
                <i className={`status ${report.status}`}>{report.status}</i>
                <Link to={`/attendance?meetingId=${report.id}`} className="button ghost tiny">
                  <UserCheck /> View roster
                </Link>
              </div>

              <div className="review-actions">
                {report.status === 'submitted' ? (
                  <>
                    <button
                      className="button ghost small"
                      disabled={!!busy}
                      onClick={() => {
                        sound.click()
                        setReturnModalReport(report)
                        setReturnNotes('')
                      }}
                    >
                      <RotateCcw /> Return
                    </button>
                    <button
                      className="button primary small"
                      disabled={!!busy}
                      onClick={() => review(report.id, 'approved')}
                    >
                      <Check /> Approve
                    </button>
                  </>
                ) : (
                  <span className="decision-recorded">
                    <FileCheck2 /> Decision verified
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No reports match this filter"
          copy="All reports in this category have been processed."
        />
      )}

      {/* Return Report Modal with Feedback */}
      {returnModalReport && (
        <Modal
          eyebrow="Constructive Stewardship"
          title={`Return Report for ${returnModalReport.cell_name}`}
          onClose={() => setReturnModalReport(null)}
        >
          <p className="modal-copy">
            Provide clear guidance on why this report is being returned (e.g. attendance recount
            needed, missing first-timer details).
          </p>
          <form
            onSubmit={async e => {
              e.preventDefault()
              const repId = returnModalReport.id
              setReturnModalReport(null)
              await review(repId, 'returned', returnNotes)
            }}
          >
            <label className="full">
              Reason / Feedback for Cell Leader
              <textarea
                required
                value={returnNotes}
                onChange={e => setReturnNotes(e.target.value)}
                placeholder="e.g. Please reconcile first-timer count with cell secretary…"
                rows={4}
              />
            </label>
            <div className="form-actions full">
              <button
                type="button"
                className="button ghost"
                onClick={() => setReturnModalReport(null)}
              >
                Cancel
              </button>
              <button className="button primary">
                <RotateCcw /> Confirm return
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
