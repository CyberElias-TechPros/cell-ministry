import { useState, type FormEvent } from 'react'
import {
  Check,
  CheckCircle2,
  FileClock,
  KeyRound,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  User,
  Volume2,
} from 'lucide-react'
import { api } from '../api'
import { useAuth } from '../AuthContext'
import { useLoad } from '../hooks'
import type { Standard } from '../types'
import { ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { sound } from '../sound'

export default function Settings() {
  const { user } = useAuth()
  const { data, error, loading, reload } = useLoad(
    () => api<{ standards: Standard[] }>('/standards'),
    []
  )

  const [open, setOpen] = useState(false)
  const [activatingId, setActivatingId] = useState<string>()
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [profileSaved, setProfileSaved] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState('')

  const [soundActive, setSoundActive] = useState(sound.isEnabled())

  if (loading) return <Loading label="Loading ministry configuration & operating standards" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  async function activateStandard(id: string) {
    setActivatingId(id)
    try {
      await api(`/standards/${id}/activate`, { method: 'PATCH' })
      sound.success()
      await reload()
    } finally {
      setActivatingId(undefined)
    }
  }

  async function handleUpdateProfile(e: FormEvent) {
    e.preventDefault()
    setProfileBusy(true)
    setProfileError('')
    setProfileSaved(false)
    try {
      await api('/account/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name, email }),
      })
      sound.success()
      setProfileSaved(true)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not update profile')
    } finally {
      setProfileBusy(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setPwBusy(true)
    setPwError('')
    setPwSaved(false)
    try {
      await api('/account/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      sound.success()
      setPwSaved(true)
      setCurrentPw('')
      setNewPw('')
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change password')
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Ministry Operations Engine"
        title="Standards that evolve. History that remains."
        copy="Configure local operating rules, reporting deadlines, and approval policies without hardcoding rules into historical records."
        action={
          <button
            className="button primary"
            onClick={() => {
              sound.click()
              setOpen(true)
            }}
          >
            <Plus /> New standard version
          </button>
        }
      />

      {/* Standards Section */}
      <section className="standards-layout">
        <aside className="standards-aside">
          <Settings2 className="standards-icon" />
          <h2>Configuration Engine</h2>
          <p>
            Operating rules evolve over time. Nexus keeps every version, effective date, and
            governing source distinct so structural updates never invalidate past records.
          </p>
          <ul>
            <li>
              <CheckCircle2 /> Configurable report cutoff times
            </li>
            <li>
              <ShieldCheck /> Named governing authority
            </li>
            <li>
              <FileClock /> Immutable effective-date history
            </li>
          </ul>
        </aside>

        <div className="standards-list">
          <header>
            <span>STANDARD SET</span>
            <span>GOVERNING SOURCE</span>
            <span>EFFECTIVE DATE</span>
            <span>STATE & ACTION</span>
          </header>
          {data.standards.map(standard => (
            <article key={standard.id} className="standard-row">
              <div>
                <b>{standard.name}</b>
                <small>Version {standard.version}</small>
              </div>
              <span>{standard.source}</span>
              <span>
                {new Date(standard.effective_at + 'T12:00').toLocaleDateString('en', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              <div className="standard-action-cell">
                <i className={`status ${standard.status}`}>{standard.status}</i>
                {standard.status === 'draft' && (
                  <button
                    className="button primary tiny"
                    disabled={activatingId === standard.id}
                    onClick={() => activateStandard(standard.id)}
                  >
                    Activate
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Profile & Security Settings Grid */}
      <section className="settings-cards-grid">
        {/* Profile Card */}
        <article className="settings-card">
          <header>
            <User />
            <div>
              <h3>Operator Profile</h3>
              <p>Your display name and notification email</p>
            </div>
          </header>
          <form onSubmit={handleUpdateProfile}>
            <label>
              Full name
              <input value={name} onChange={e => setName(e.target.value)} required />
            </label>
            <label>
              Email address
              <input value={email} type="email" onChange={e => setEmail(e.target.value)} required />
            </label>
            {profileError && <p className="form-error">{profileError}</p>}
            {profileSaved && (
              <p className="form-success">
                <Check /> Profile saved successfully
              </p>
            )}
            <button className="button primary small" disabled={profileBusy}>
              {profileBusy ? 'Saving…' : 'Update profile'}
            </button>
          </form>
        </article>

        {/* Password Security Card */}
        <article className="settings-card">
          <header>
            <KeyRound />
            <div>
              <h3>Security & Password</h3>
              <p>PBKDF2 encrypted with 120,000 hashing rounds</p>
            </div>
          </header>
          <form onSubmit={handleChangePassword}>
            <label>
              Current password
              <input
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                required
              />
            </label>
            <label>
              New password (min. 8 characters)
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                required
                minLength={8}
              />
            </label>
            {pwError && <p className="form-error">{pwError}</p>}
            {pwSaved && (
              <p className="form-success">
                <Check /> Password changed successfully
              </p>
            )}
            <button className="button secondary small" disabled={pwBusy || !currentPw || !newPw}>
              {pwBusy ? 'Updating…' : 'Change password'}
            </button>
          </form>
        </article>

        {/* Experience Preferences */}
        <article className="settings-card">
          <header>
            <Volume2 />
            <div>
              <h3>Audio-Visual Experience</h3>
              <p>Subtle tactile feedback cues for command actions</p>
            </div>
          </header>
          <div className="pref-row">
            <div>
              <b>Auditory micro-feedback</b>
              <p>Plays delicate synthesized chimes on key actions.</p>
            </div>
            <button
              className={`button ghost small ${soundActive ? 'active' : ''}`}
              onClick={() => {
                const next = !soundActive
                sound.setEnabled(next)
                setSoundActive(next)
                if (next) sound.success()
              }}
            >
              {soundActive ? 'Enabled' : 'Muted'}
            </button>
          </div>
          <div className="security-badges">
            <span className="sec-badge">
              <ShieldCheck /> Cloudflare D1
            </span>
            <span className="sec-badge">
              <Sparkles /> PBKDF2 120K
            </span>
            <span className="sec-badge">
              <Radio /> HttpOnly Sessions
            </span>
          </div>
        </article>
      </section>

      {open && (
        <NewStandard
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

function NewStandard({ close, done }: { close: () => void; done: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const raw = Object.fromEntries(new FormData(e.currentTarget))
    try {
      await api('/standards', {
        method: 'POST',
        body: JSON.stringify({
          ...raw,
          approvalRequired: raw.approvalRequired === 'on',
        }),
      })
      sound.success()
      done()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save standard')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal eyebrow="Versioned Governance" title="Create Standards Version" onClose={close}>
      <p className="modal-copy">
        <Sparkles /> New ministry standards begin as drafts and require intentional activation before
        taking effect for the zone.
      </p>
      <form className="form-grid" onSubmit={submit}>
        <label className="full">
          Standard set name
          <input name="name" required defaultValue="PH Zone 3 Cell Operating Standard" />
        </label>
        <label>
          Version code
          <input name="version" required placeholder="1.2" defaultValue="1.1" />
        </label>
        <label>
          Effective date
          <input name="effective_at" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        </label>
        <label className="full">
          Authorized governing source
          <input name="source" required defaultValue="Zonal Ministry Administration" />
        </label>
        <label className="full">
          Weekly report due deadline
          <input name="weeklyReportDue" required defaultValue="Sunday · 6:00 PM" />
        </label>
        <label className="check-label full">
          <input name="approvalRequired" type="checkbox" defaultChecked /> Reports require coordinator review & approval
        </label>

        {error && <p className="form-error full">{error}</p>}
        <div className="form-actions full">
          <button type="button" className="button ghost" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save draft standard'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
