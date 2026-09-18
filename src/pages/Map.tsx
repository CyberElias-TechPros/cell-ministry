import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Compass,
  GitBranch,
  MapPin,
  Navigation,
  Radio,
  Sparkles,
  Users,
} from 'lucide-react'
import { api } from '../api'
import { useLoad } from '../hooks'
import type { Cell, Person, TerritoryAnalysis } from '../types'
import { ErrorState, Loading } from '../components/States'
import { PageHeader } from '../components/PageHeader'
import { CellDrawer } from '../components/CellDrawer'
import { MultiplyModal } from '../components/MultiplyModal'
import { sound } from '../sound'

type GeoCell = Cell & { latitude: number; longitude: number }

export default function MapPage() {
  const { data, error, loading, reload } = useLoad(
    () =>
      Promise.all([
        api<{ cells: GeoCell[] }>('/map'),
        api<TerritoryAnalysis>('/map/analysis'),
        api<{ people: Person[] }>('/people'),
      ]).then(([geo, analysis, p]) => ({
        cells: geo.cells,
        analysis,
        people: p.people,
      })),
    []
  )

  const [selected, setSelected] = useState<string>()
  const [cellDrawerId, setCellDrawerId] = useState<string>()
  const [multiplyOpen, setMultiplyOpen] = useState(false)
  const [multiplyParentId, setMultiplyParentId] = useState<string>()
  const [showOverlaps, setShowOverlaps] = useState(true)

  const points = useMemo(() => {
    if (!data?.cells.length) return []
    const lats = data.cells.map(c => c.latitude)
    const lngs = data.cells.map(c => c.longitude)
    const minLat = Math.min(...lats)
    const maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs)
    const maxLng = Math.max(...lngs)

    return data.cells.map(c => ({
      ...c,
      x: 14 + ((c.longitude - minLng) / (maxLng - minLng || 1)) * 72,
      y: 16 + (1 - (c.latitude - minLat) / (maxLat - minLat || 1)) * 68,
    }))
  }, [data])

  if (loading) return <Loading label="Calibrating satellite territory grid" />
  if (error || !data) return <ErrorState message={error} retry={reload} />

  const active = points.find(p => p.id === selected) || points[0]

  return (
    <>
      <PageHeader
        eyebrow="Territory Intelligence & Reach"
        title="See where the light is."
        copy="Analyze geographic cell distribution, detect overlapping catchment territories, and strategically target unreached communities for expansion."
        action={
          <button
            className="button primary"
            onClick={() => {
              sound.click()
              setMultiplyParentId(active?.id || data.cells[0]?.id)
              setMultiplyOpen(true)
            }}
          >
            <GitBranch /> Target expansion cell
          </button>
        }
      />

      <section className="geo-shell">
        <div className="geo-map">
          {/* Tactical radar sweep and background grid */}
          <div className="radar-sweep" />
          <div className="geo-streets" />
          <div className="geo-grid-overlay" />

          <header className="geo-top-hud">
            <span className="geo-hud-badge">
              <Radio className="spin-slow" /> LIVE TERRITORY RADAR
            </span>
            <div className="geo-hud-controls">
              <button
                className={`button ghost tiny ${showOverlaps ? 'active' : ''}`}
                onClick={() => {
                  sound.click()
                  setShowOverlaps(!showOverlaps)
                }}
              >
                <AlertTriangle /> Overlaps ({data.analysis.overlaps.length})
              </button>
              <button className="button ghost tiny">
                <Compass /> Port Harcourt Zone 3
              </button>
            </div>
          </header>

          {/* Catchment Radius Circles */}
          {points.map(point => (
            <div
              key={`radius-${point.id}`}
              className={`catchment-circle ${active?.id === point.id ? 'active' : ''}`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
            />
          ))}

          {/* Interactive Cell Markers */}
          {points.map((point, i) => {
            const isActive = active?.id === point.id
            return (
              <button
                key={point.id}
                className={`map-marker marker-${i % 5} ${isActive ? 'active' : ''}`}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                onClick={() => {
                  sound.click()
                  setSelected(point.id)
                }}
                aria-label={`View ${point.name}`}
              >
                <i>
                  <MapPin />
                </i>
                <span>{point.name}</span>
                <small className="marker-members-badge">{point.members}</small>
              </button>
            )
          })}

          <div className="map-coordinates">
            04.8156° N · 007.0498° E<br />
            <small>PH Zone 3 Territory Radar Active</small>
          </div>
        </div>

        {/* Territory Focus Detail Sidebar */}
        {active && (
          <aside className="geo-detail">
            <p className="eyebrow">
              <Sparkles /> Cell in Focus
            </p>
            <div className="geo-emblem">
              <Navigation />
            </div>
            <h2>{active.name}</h2>
            <p className="geo-detail-loc">
              {active.location || 'Central Area'} · {active.code}
            </p>

            <div className="geo-stats-grid">
              <div className="stat-pill">
                <Users />
                <div>
                  <b>{active.members}</b>
                  <small>People in care</small>
                </div>
              </div>
              <div className="stat-pill">
                <Radio />
                <div>
                  <b>
                    {points.filter(
                      p => Math.abs(p.x - active.x) < 25 && Math.abs(p.y - active.y) < 25
                    ).length - 1}
                  </b>
                  <small>Nearby cells</small>
                </div>
              </div>
            </div>

            <div className="geo-detail-leader">
              <small>CURRENT LEADER</small>
              <b>{active.leader || 'Assignment pending'}</b>
              <small>Meeting: {active.meeting_day || 'Friday'} · {active.meeting_time || '18:00'}</small>
            </div>

            {/* Catchment Overlap Warnings */}
            {showOverlaps && data.analysis.overlaps.length > 0 && (
              <div className="geo-overlaps-alert">
                <div className="overlap-alert-header">
                  <AlertTriangle />
                  <b>Catchment Overlap Alert</b>
                </div>
                {data.analysis.overlaps.map((ov, idx) => (
                  <p key={idx} className="overlap-row">
                    <strong>{ov.cellA}</strong> & <strong>{ov.cellB}</strong> are only{' '}
                    <span>{ov.distanceKm} km apart</span>. Consider expanding into adjacent wards.
                  </p>
                ))}
              </div>
            )}

            {/* Expansion Candidates */}
            <div className="expansion-opportunities">
              <small>STRATEGIC EXPANSION TARGETS</small>
              {data.analysis.expansionCandidates.map((cand, idx) => (
                <div key={idx} className="expansion-pill">
                  <b>{cand.area}</b>
                  <p>{cand.rationale}</p>
                  <small>{cand.recommendedPioneer}</small>
                </div>
              ))}
            </div>

            <footer>
              <button
                className="button primary small"
                onClick={() => {
                  sound.click()
                  setCellDrawerId(active.id)
                }}
              >
                Inspect cell ledger
              </button>
              <a
                className="button ghost small"
                href={`https://www.openstreetmap.org/?mlat=${active.latitude}&mlon=${active.longitude}#map=15/${active.latitude}/${active.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                External GPS <Navigation />
              </a>
            </footer>
          </aside>
        )}
      </section>

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
