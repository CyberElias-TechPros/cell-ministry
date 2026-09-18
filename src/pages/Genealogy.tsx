import { useMemo, useState } from 'react'
import {
  Focus,
  GitBranch,
  History,
  Maximize2,
  Minus,
  Plus,
  Search,
  Sparkles,
  Users,
  ArrowUpRight,
} from 'lucide-react'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { Cell, MultiplicationEvent, Person } from '../types'
import { ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { CellDrawer } from '../components/CellDrawer'
import { PersonDrawer } from '../components/PersonDrawer'
import { MultiplyModal } from '../components/MultiplyModal'
import { sound } from '../sound'

type Pos = Cell & { x: number; y: number; depth: number }

export default function Genealogy() {
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        api<{ nodes: Cell[] }>('/genealogy'),
        api<{ nodes: Cell[] }>('/leadership-genealogy'),
        api<{ multiplications: MultiplicationEvent[] }>('/multiplications'),
        api<{ cells: Cell[] }>('/cells'),
        api<{ people: Person[] }>('/people'),
      ]).then(([cells, leaders, mults, c, p]) => ({
        cells: cells.nodes,
        leaders: leaders.nodes,
        multiplications: mults.multiplications,
        allCells: c.cells,
        people: p.people,
      })),
    []
  )

  const [zoom, setZoom] = useState(1)
  const [selected, setSelected] = useState<string>()
  const [mode, setMode] = useState<'cells' | 'leaders' | 'timeline'>('cells')
  const [filterQuery, setFilterQuery] = useState('')
  const [cellDrawerId, setCellDrawerId] = useState<string>()
  const [personDrawerId, setPersonDrawerId] = useState<string>()
  const [multiplyOpen, setMultiplyOpen] = useState(false)
  const [multiplyParentId, setMultiplyParentId] = useState<string>()

  const activeNodes = useMemo(() => {
    if (mode === 'timeline') return []
    return data ? data[mode] : []
  }, [data, mode])

  const layout = useMemo(() => {
    if (!activeNodes.length) return []
    const nodes = activeNodes
    const ids = new Set(nodes.map(n => n.id))
    const depths = new Map<string, number>()

    function depth(n: Cell): number {
      if (depths.has(n.id)) return depths.get(n.id)!
      const p = nodes.find(x => x.id === n.parent_id)
      const d = !p || !ids.has(n.parent_id || '') ? 0 : depth(p) + 1
      depths.set(n.id, d)
      return d
    }

    const groups = new Map<number, Cell[]>()
    nodes.forEach(n => {
      const d = depth(n)
      groups.set(d, [...(groups.get(d) || []), n])
    })

    const positions: Pos[] = []
    groups.forEach((groupNodes, d) =>
      groupNodes.forEach((n, i) =>
        positions.push({
          ...n,
          depth: d,
          x: (i + 1) * (100 / (groupNodes.length + 1)),
          y: 90 + d * 220,
        })
      )
    )
    return positions
  }, [activeNodes])

  if (loading) return <Loading label="Tracing the living lineage & generations" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  const selectedNode = layout.find(n => n.id === selected)
  const maxGen = layout.length ? Math.max(...layout.map(n => n.depth)) + 1 : 1

  return (
    <>
      <PageHeader
        eyebrow="Signature Living Experience"
        title="The Living Ministry Genealogy."
        copy="Trace where every cell came from, witness what faithful discipleship has produced, and celebrate generational fruitfulness."
        action={
          <div className="header-actions">
            <button
              className="button primary"
              onClick={() => {
                sound.click()
                setMultiplyParentId(selected || data.allCells[0]?.id)
                setMultiplyOpen(true)
              }}
            >
              <GitBranch /> Pioneer daughter cell
            </button>
            <div className="view-switch">
              <button
                className={mode === 'cells' ? 'active' : ''}
                onClick={() => {
                  sound.click()
                  setMode('cells')
                  setSelected(undefined)
                }}
              >
                <GitBranch /> Cell lineage
              </button>
              <button
                className={mode === 'leaders' ? 'active' : ''}
                onClick={() => {
                  sound.click()
                  setMode('leaders')
                  setSelected(undefined)
                }}
              >
                <Users /> Leadership
              </button>
              <button
                className={mode === 'timeline' ? 'active' : ''}
                onClick={() => {
                  sound.click()
                  setMode('timeline')
                  setSelected(undefined)
                }}
              >
                <History /> Multiplications
              </button>
            </div>
          </div>
        }
      />

      {mode === 'timeline' ? (
        <section className="timeline-shell">
          <header className="timeline-header">
            <div>
              <p className="eyebrow">
                <Sparkles /> Expansion Chronicles
              </p>
              <h2>Cell Multiplication Milestones</h2>
            </div>
            <span className="mult-count-pill">
              <b>{data.multiplications.length}</b> historical multiplications
            </span>
          </header>

          <div className="multiplication-timeline-grid">
            {data.multiplications.map((m, idx) => (
              <article key={m.id} className="mult-card">
                <div className="mult-card-badge">
                  <span>{idx + 1}</span>
                </div>
                <div className="mult-card-body">
                  <header>
                    <time>{m.event_date}</time>
                    <span className="mult-lineage-path">
                      <b>{m.parent_name}</b> → <em>{m.child_name}</em>
                    </span>
                  </header>
                  <p className="mult-notes">“{m.notes || 'Pioneered to expand presence.'}”</p>
                  <footer>
                    <div className="mult-pioneer">
                      <small>PIONEER LEADER</small>
                      <b>{m.pioneer_name || 'Leader'}</b>
                    </div>
                    <button
                      className="button ghost tiny"
                      onClick={() => {
                        sound.click()
                        setCellDrawerId(m.child_cell_id)
                      }}
                    >
                      Inspect daughter cell <ArrowUpRight />
                    </button>
                  </footer>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="genealogy-shell">
          <header className="genealogy-toolbar">
            <div className="genealogy-status">
              <span className="live-dot" /> LIVE GENERATION MAP
            </div>
            <div className="genealogy-search-box">
              <Search />
              <input
                value={filterQuery}
                onChange={e => setFilterQuery(e.target.value)}
                placeholder="Find cell or leader in tree…"
              />
            </div>
            <p className="genealogy-meta">
              <Sparkles /> {layout.length} mapped nodes · {maxGen} active generations
            </p>
            <div className="zoom-controls">
              <button
                onClick={() => {
                  sound.click()
                  setZoom(z => Math.max(0.55, z - 0.1))
                }}
                title="Zoom out"
              >
                <Minus />
              </button>
              <button
                onClick={() => {
                  sound.click()
                  setZoom(1)
                }}
                title="Reset zoom"
              >
                <Focus />
              </button>
              <button
                onClick={() => {
                  sound.click()
                  setZoom(z => Math.min(1.4, z + 0.1))
                }}
                title="Zoom in"
              >
                <Plus />
              </button>
              <button
                onClick={() => {
                  sound.click()
                  setZoom(1)
                }}
                title="Fit to view"
              >
                <Maximize2 />
              </button>
            </div>
          </header>

          <div className="genealogy-viewport">
            <div className="genealogy-grid" />
            <div
              className="tree-stage"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: '50% 20%',
                transition: 'transform 0.25s ease-out',
              }}
            >
              {/* SVG Connecting Branch Lines */}
              {layout.map(child => {
                const parent = layout.find(p => p.id === child.parent_id)
                if (!parent) return null
                const x1 = parent.x
                const x2 = child.x
                const y1 = parent.y + 86
                const y2 = child.y
                const isHighlighted = selected === child.id || selected === parent.id
                return (
                  <svg
                    className={`tree-link ${isHighlighted ? 'highlighted' : ''}`}
                    key={`line-${child.id}`}
                  >
                    <path
                      d={`M ${x1}% ${y1} C ${x1}% ${(y1 + y2) / 2}, ${x2}% ${(y1 + y2) / 2}, ${x2}% ${y2}`}
                    />
                  </svg>
                )
              })}

              {/* Node Cards */}
              {layout.map((n, i) => {
                const matchesSearch =
                  filterQuery &&
                  (n.name + n.code + (n.leader || '')).toLowerCase().includes(filterQuery.toLowerCase())
                const isSelected = selected === n.id

                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      sound.click()
                      setSelected(n.id)
                    }}
                    className={`tree-node ${isSelected ? 'selected' : ''} ${
                      matchesSearch ? 'search-match' : ''
                    }`}
                    style={{
                      left: `${n.x}%`,
                      top: n.y,
                      animationDelay: `${i * 80}ms`,
                    }}
                  >
                    <span className="node-generation">GEN {n.depth + 1}</span>
                    <i className="node-emblem">
                      {n.name
                        .split(' ')
                        .map(x => x[0])
                        .join('')
                        .slice(0, 2)}
                    </i>
                    <b>{n.name}</b>
                    <small>
                      {n.code} · {n.status}
                    </small>
                    <div className="node-meta">
                      <span>
                        <Users />
                        {n.members}
                      </span>
                      <span>
                        {mode === 'cells'
                          ? n.leader || 'Leader to assign'
                          : n.location || 'Cell active'}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="map-legend">
              <span>
                <i className="mint-dot" /> High Momentum
              </span>
              <span>
                <i className="gold-dot" /> Established
              </span>
              <span>Click node to inspect ancestry & descendants</span>
            </div>
          </div>
        </section>
      )}

      {/* Selected Node Sidebar Inspector */}
      {selectedNode && (
        <aside className="genealogy-detail">
          <button className="close-detail-btn" onClick={() => setSelected(undefined)}>
            ×
          </button>
          <p className="eyebrow">
            <Sparkles /> {mode === 'cells' ? 'Cell Pedigree' : 'Discipleship Journey'} · Gen{' '}
            {selectedNode.depth + 1}
          </p>
          <h2>{selectedNode.name}</h2>
          <p className="detail-loc">
            {selectedNode.location || 'Port Harcourt'} · {selectedNode.code}
          </p>

          <div className="detail-stats-grid">
            <div className="detail-stat">
              <b>{selectedNode.members}</b>
              <small>{mode === 'cells' ? 'People in care' : 'People mentored'}</small>
            </div>
            <div className="detail-stat">
              <b>{layout.filter(n => n.parent_id === selectedNode.id).length}</b>
              <small>Direct descendants</small>
            </div>
          </div>

          <div className="detail-footer">
            <small>{mode === 'cells' ? 'CELL LEADER' : 'LEADERSHIP STAGE'}</small>
            <b>{mode === 'cells' ? selectedNode.leader || 'Open appointment' : selectedNode.code}</b>
          </div>

          <div className="detail-actions">
            <button
              className="button primary small"
              onClick={() => {
                sound.click()
                if (mode === 'cells') setCellDrawerId(selectedNode.id)
                else setPersonDrawerId(selectedNode.id)
              }}
            >
              Open complete ledger <ArrowUpRight />
            </button>
            {mode === 'cells' && (
              <button
                className="button secondary small"
                onClick={() => {
                  sound.click()
                  setMultiplyParentId(selectedNode.id)
                  setMultiplyOpen(true)
                }}
              >
                <GitBranch /> Multiply this cell
              </button>
            )}
          </div>
        </aside>
      )}

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
          cells={data.allCells}
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
