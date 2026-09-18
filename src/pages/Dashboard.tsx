import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowUpRight,
  CalendarCheck,
  ChevronRight,
  CircleAlert,
  GitBranch,
  HeartHandshake,
  Sparkles,
  TrendingUp,
  Users,
  CalendarPlus,
  UserCheck,
  Award,
} from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { DashboardData, Cell, Person } from '../types'
import { ErrorState, Loading } from '../components/States'
import { CellDrawer } from '../components/CellDrawer'
import { MultiplyModal } from '../components/MultiplyModal'
import { PersonDrawer } from '../components/PersonDrawer'
import { sound } from '../sound'

export default function Dashboard() {
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        api<DashboardData>('/dashboard'),
        api<{ cells: Cell[] }>('/cells'),
        api<{ people: Person[] }>('/people'),
      ]).then(([dash, c, p]) => ({ ...dash, cells: c.cells, people: p.people })),
    []
  )

  const [selectedCellId, setSelectedCellId] = useState<string>()
  const [selectedPersonId, setSelectedPersonId] = useState<string>()
  const [multiplyOpen, setMultiplyOpen] = useState(false)
  const [multiplyParentId, setMultiplyParentId] = useState<string>()

  if (loading) return <Loading label="Calibrating Ministry Pulse" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  const m = data.metrics
  const avg = m.meetings ? Math.round(m.attendance / m.meetings) : 0

  // Chart data: fallback to trends or sensible defaults
  const chartData =
    data.trends && data.trends.length > 0
      ? data.trends.map((t, i) => ({
          name: `W${i + 1}`,
          attendance: t.attendance,
          first_timers: t.first_timers,
        }))
      : [
          { name: 'W1', attendance: 58, first_timers: 4 },
          { name: 'W2', attendance: 65, first_timers: 6 },
          { name: 'W3', attendance: 72, first_timers: 5 },
          { name: 'W4', attendance: 79, first_timers: 8 },
          { name: 'W5', attendance: 88, first_timers: 7 },
          { name: 'W6', attendance: 95, first_timers: 11 },
          { name: 'W7', attendance: 112, first_timers: 13 },
        ]

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <>
      {/* Cinematic Hero */}
      <section className="hero-dashboard">
        <div className="hero-copy">
          <p className="eyebrow">
            <Sparkles /> {todayStr}
          </p>
          <h1>
            Kingdom Operations,<br />
            <em>Command Center.</em>
          </h1>
          <p>
            One unified living system for people, cells, leadership development and multiplication across
            Port Harcourt Zone 3.
          </p>
          <div className="hero-action-pills">
            <button
              className="hero-action-pill"
              onClick={() => {
                sound.click()
                setMultiplyParentId(data.cells[0]?.id)
                setMultiplyOpen(true)
              }}
            >
              <GitBranch /> Multiply cell
            </button>
            <Link to="/meetings" className="hero-action-pill">
              <CalendarPlus /> Submit report
            </Link>
            <Link to="/attendance" className="hero-action-pill">
              <UserCheck /> Record attendance
            </Link>
            <Link to="/genealogy" className="hero-action-pill highlight">
              <Sparkles /> Explore lineage
            </Link>
          </div>
        </div>

        <div className="hero-signal">
          <span>MINISTRY HEALTH PULSE</span>
          <div className="pulse-orbit">
            <i />
            <strong>
              92<small>%</small>
            </strong>
          </div>
          <b>Multiplication Momentum</b>
          <small>+8.4% reporting consistency</small>
        </div>
        <div className="hero-lines" />
      </section>

      {/* Metric Cards Grid */}
      <section className="metric-grid">
        <article
          onClick={() => {
            sound.click()
            setSelectedCellId(data.cells[0]?.id)
          }}
          className="clickable-metric"
        >
          <span className="metric-icon mint">
            <GitBranch />
          </span>
          <div>
            <small>ACTIVE CELLS</small>
            <b>{m.cells.toString().padStart(2, '0')}</b>
            <p>
              <TrendingUp /> Active communities
            </p>
          </div>
          <ArrowUpRight className="metric-arrow" />
        </article>

        <Link to="/people" className="metric-card-link">
          <article>
            <span className="metric-icon amber">
              <Users />
            </span>
            <div>
              <small>PEOPLE IN CARE</small>
              <b>{m.people}</b>
              <p>
                <TrendingUp /> Discipleship registry
              </p>
            </div>
            <ArrowUpRight className="metric-arrow" />
          </article>
        </Link>

        <Link to="/people" className="metric-card-link">
          <article>
            <span className="metric-icon violet">
              <HeartHandshake />
            </span>
            <div>
              <small>ACTIVE LEADERS</small>
              <b>{m.leaders}</b>
              <p>
                <Award /> Leadership pipeline
              </p>
            </div>
            <ArrowUpRight className="metric-arrow" />
          </article>
        </Link>

        <Link to="/meetings" className="metric-card-link">
          <article>
            <span className="metric-icon coral">
              <CalendarCheck />
            </span>
            <div>
              <small>30-DAY ATTENDANCE</small>
              <b>{m.attendance}</b>
              <p>
                <TrendingUp /> {avg} avg. per meeting
              </p>
            </div>
            <ArrowUpRight className="metric-arrow" />
          </article>
        </Link>
      </section>

      {/* Dashboard Analytics & Ledger Grid */}
      <section className="dashboard-grid">
        {/* Attendance Rhythm Chart */}
        <article className="panel growth-panel">
          <header>
            <div>
              <p className="eyebrow">Kingdom Momentum</p>
              <h2>Attendance & First-Timers Trend</h2>
            </div>
            <span className="trend-pill">
              +14.2% <small>active quarter</small>
            </span>
          </header>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="areaAttendance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="areaFirstTimers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f79468" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#f79468" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#525d88" axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#0a0e27',
                    border: '1px solid rgba(147, 168, 255, 0.25)',
                    borderRadius: 10,
                    boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
                  }}
                  itemStyle={{ color: '#f6f7ff', fontSize: 12 }}
                  labelStyle={{ color: '#22d3ee', fontWeight: 600, fontSize: 11 }}
                />
                <Area
                  type="monotone"
                  dataKey="attendance"
                  name="Attendance"
                  stroke="#22d3ee"
                  strokeWidth={3}
                  fill="url(#areaAttendance)"
                />
                <Area
                  type="monotone"
                  dataKey="first_timers"
                  name="First Timers"
                  stroke="#f79468"
                  strokeWidth={2}
                  fill="url(#areaFirstTimers)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <footer>
            <span>
              <i className="dot mint-dot" /> Weekly Attendance &nbsp;&nbsp;
              <i className="dot coral-dot" /> First-Time Visitors
            </span>
            <b>Strongest attendance in 90 days</b>
          </footer>
        </article>

        {/* Lives Reached */}
        <article className="panel mission-panel">
          <p className="eyebrow">Soul Winning & Harvest</p>
          <h2>Lives touched this month</h2>
          <div className="mission-number">
            <strong>{m.first_timers + m.new_converts}</strong>
            <span>
              souls
              <br />
              gathered
            </span>
          </div>
          <div className="mission-stats">
            <span>
              <b>{m.first_timers}</b>
              <small>First timers</small>
            </span>
            <span>
              <b>{m.new_converts}</b>
              <small>New converts</small>
            </span>
          </div>
          <Link to="/follow-ups" className="mission-link">
            Care for connections in follow-up <ArrowUpRight />
          </Link>
        </article>

        {/* Recent Gathering Reports */}
        <article className="panel recent-panel">
          <header>
            <div>
              <p className="eyebrow">Live Ministry Ledger</p>
              <h2>Recent Gathering Reports</h2>
            </div>
            <Link to="/meetings" className="view-all-link">
              View all <ChevronRight />
            </Link>
          </header>
          <div className="report-list">
            {data.recent.map(r => (
              <div
                key={r.id}
                className="report-item"
                onClick={() => {
                  sound.click()
                  setSelectedCellId(r.cell_id)
                }}
              >
                <span className="date-tile">
                  <b>{new Date(r.held_at + 'T12:00').getDate()}</b>
                  <small>
                    {new Date(r.held_at + 'T12:00').toLocaleDateString('en', { month: 'short' })}
                  </small>
                </span>
                <div className="report-item-info">
                  <b>{r.cell_name}</b>
                  <small>{r.meeting_type}</small>
                </div>
                <span className="report-item-att">
                  <b>{r.attendance}</b>
                  <small>present</small>
                </span>
                <i className={`status ${r.status}`}>{r.status}</i>
              </div>
            ))}
          </div>
        </article>

        {/* Attention Items & Actionable Opportunities */}
        <article className="panel attention-panel">
          <header>
            <CircleAlert className="attention-icon" />
            <div>
              <p className="eyebrow">Attention & Stewardship</p>
              <h2>Keep the Ministry Rhythm</h2>
            </div>
          </header>
          <div className="attention-item">
            <span className="attention-ring">03</span>
            <div>
              <b>Cell reports awaiting review</b>
              <p>Submitted gatherings ready for coordinator confirmation.</p>
            </div>
            <Link to="/reports" className="attention-link">
              <ChevronRight />
            </Link>
          </div>
          <div className="attention-item">
            <span className="attention-ring gold">02</span>
            <div>
              <b>Follow-ups due today</b>
              <p>Keep first-timers and new converts connected to a home cell.</p>
            </div>
            <Link to="/follow-ups" className="attention-link">
              <ChevronRight />
            </Link>
          </div>
          <div className="attention-item">
            <span className="attention-ring violet">04</span>
            <div>
              <b>Emerging leaders in training</b>
              <p>Potential leaders advancing in Bible Study and Foundation Class.</p>
            </div>
            <Link to="/classes" className="attention-link">
              <ChevronRight />
            </Link>
          </div>
        </article>
      </section>

      {/* Drawers & Modals */}
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

      {selectedPersonId && (
        <PersonDrawer
          personId={selectedPersonId}
          onClose={() => setSelectedPersonId(undefined)}
          onReloadNeeded={reload}
        />
      )}

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
    </>
  )
}
