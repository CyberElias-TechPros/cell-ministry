import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowUpRight,
  BrainCircuit,
  GitBranch,
  HeartHandshake,
  Lightbulb,
  Radio,
  Sparkles,
} from 'lucide-react'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { Cell, Person } from '../types'
import { ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { CellDrawer } from '../components/CellDrawer'
import { PersonDrawer } from '../components/PersonDrawer'
import { MultiplyModal } from '../components/MultiplyModal'
import { sound } from '../sound'

type Insight = { id: string; name: string; signal: string; detail?: string }

export default function Insights() {
  const navigate = useNavigate()
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        api<{ insights: Insight[] }>('/insights'),
        api<{ cells: Cell[] }>('/cells'),
        api<{ people: Person[] }>('/people'),
      ]).then(([ins, c, p]) => ({ insights: ins.insights, cells: c.cells, people: p.people })),
    []
  )

  const [cellDrawerId, setCellDrawerId] = useState<string>()
  const [personDrawerId, setPersonDrawerId] = useState<string>()
  const [multiplyOpen, setMultiplyOpen] = useState(false)
  const [multiplyParentId, setMultiplyParentId] = useState<string>()

  if (loading) return <Loading label="Calculating live ministry intelligence signals" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  function handleAction(item: Insight) {
    sound.click()
    if (item.signal === 'Missing report') {
      navigate('/meetings')
    } else if (item.signal === 'Attendance attention') {
      setCellDrawerId(item.id)
    } else if (item.signal === 'Leadership opportunity') {
      setPersonDrawerId(item.id)
    } else if (item.signal === 'Follow-up overdue') {
      navigate('/follow-ups')
    } else if (item.signal === 'Ready for multiplication') {
      setMultiplyParentId(item.id)
      setMultiplyOpen(true)
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Explainable Ministry Intelligence"
        title="Signals, not judgments."
        copy="Nexus continuously synthesizes attendance momentum, reporting rhythms, follow-up deadlines, and leadership development into explainable opportunities for pastoral care."
      />

      <section className="insight-hero">
        <BrainCircuit className="insight-hero-logo" />
        <div>
          <p className="eyebrow">
            <Sparkles /> Real-Time Signal Engine
          </p>
          <h2>{data.insights.length} strategic opportunities for thoughtful action</h2>
          <p>
            Dynamically synthesized from reporting cadence, attendance headcounts, follow-up deadlines,
            and leadership readiness across Port Harcourt Zone 3.
          </p>
        </div>
        <Radio className="insight-hero-pulse" />
      </section>

      <div className="insight-grid">
        {data.insights.map((item, i) => {
          const isFollow = item.signal.includes('Follow')
          const isLeader = item.signal.includes('Leadership')
          const isMult = item.signal.includes('multiplication')
          const Icon = isFollow
            ? HeartHandshake
            : isLeader
            ? Lightbulb
            : isMult
            ? GitBranch
            : AlertTriangle

          const badgeClass = isFollow
            ? 'coral'
            : isLeader
            ? 'gold'
            : isMult
            ? 'mint'
            : 'violet'

          return (
            <article
              key={`${item.id}-${item.signal}-${i}`}
              className={`insight-card ${badgeClass}`}
              onClick={() => handleAction(item)}
            >
              <span className="insight-counter">0{i + 1}</span>
              <Icon className="insight-card-icon" />
              <p className="eyebrow">{item.signal}</p>
              <h2>{item.name}</h2>
              <p className="insight-detail-copy">
                {item.detail ||
                  (item.signal === 'Missing report'
                    ? 'No meeting report has been recorded in the last fourteen days.'
                    : item.signal === 'Attendance attention'
                    ? 'Recent attendance is below the configured attention baseline.'
                    : item.signal === 'Leadership opportunity'
                    ? 'This person is exhibiting faithfulness and is ready for next-stage discipleship.'
                    : 'The care contact deadline has elapsed without a completed connection.')}
              </p>
              <footer>
                <span>
                  {item.signal === 'Ready for multiplication'
                    ? 'Pioneer daughter cell'
                    : item.signal === 'Leadership opportunity'
                    ? 'Inspect discipleship path'
                    : item.signal === 'Follow-up overdue'
                    ? 'Open follow-up journey'
                    : 'Take pastoral action'}
                </span>
                <ArrowUpRight />
              </footer>
            </article>
          )
        })}
      </div>

      {/* Cell Drawer */}
      {cellDrawerId && (
        <CellDrawer
          cellId={cellDrawerId}
          onClose={() => setCellDrawerId(undefined)}
          onMultiply={cid => {
            setCellDrawerId(undefined)
            setMultiplyParentId(cid)
            setMultiplyOpen(true)
          }}
          onPersonClick={pid => {
            setCellDrawerId(undefined)
            setPersonDrawerId(pid)
          }}
          onReloadNeeded={reload}
        />
      )}

      {/* Person Drawer */}
      {personDrawerId && (
        <PersonDrawer
          personId={personDrawerId}
          onClose={() => setPersonDrawerId(undefined)}
          onReloadNeeded={reload}
        />
      )}

      {/* Multiply Modal */}
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
