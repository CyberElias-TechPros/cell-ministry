import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  Bell,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ClipboardCheck,
  Command,
  GitBranch,
  GraduationCap,
  Grid2X2,
  HeartHandshake,
  Landmark,
  LogOut,
  Map,
  Menu,
  Search,
  Settings,
  Sparkles,
  UserCheck,
  UserCog,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { Logo } from './Logo'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import type { Notification, SearchResult } from '../types'
import { LiveClock } from './LiveClock'
import { sound } from '../sound'

const nav = [
  ['Overview', '/', Grid2X2],
  ['Cells', '/cells', Command],
  ['People', '/people', Users],
  ['Classes', '/classes', GraduationCap],
  ['Follow-ups', '/follow-ups', HeartHandshake],
  ['Meetings', '/meetings', CalendarDays],
  ['Attendance', '/attendance', UserCheck],
  ['Reports', '/reports', ClipboardCheck],
  ['Intelligence', '/insights', BrainCircuit],
  ['Calendar', '/calendar', CalendarCheck],
  ['Genealogy', '/genealogy', GitBranch],
  ['Territory', '/map', Map],
  ['Governance', '/governance', Landmark],
  ['Administration', '/administration', UserCog],
  ['Resources', '/resources', BookOpen],
] as const

export default function Layout() {
  const { user, logout } = useAuth()
  const loc = useLocation()
  const [mobile, setMobile] = useState(false)
  const [search, setSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [soundEnabled, setSoundEnabled] = useState(sound.isEnabled())

  useEffect(() => {
    api<{ notifications: Notification[] }>('/notifications')
      .then(r => setNotifications(r.notifications))
      .catch(() => undefined)
  }, [])

  // Keyboard shortcut for Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearch(prev => !prev)
        sound.pop()
      }
      if (e.key === 'Escape') {
        setSearch(false)
        setNoticeOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(
      () =>
        api<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(searchQuery)}`)
          .then(r => setSearchResults(r.results))
          .catch(() => setSearchResults([])),
      180
    )
    return () => clearTimeout(timer)
  }, [searchQuery])

  const unread = notifications.filter(n => !n.read_at).length

  async function openNotification(item: Notification) {
    if (!item.read_at) {
      await api(`/notifications/${item.id}/read`, { method: 'PATCH' })
      setNotifications(list =>
        list.map(n => (n.id === item.id ? { ...n, read_at: new Date().toISOString() } : n))
      )
    }
    setNoticeOpen(false)
  }

  async function markAllNotificationsRead() {
    await api('/notifications/read-all', { method: 'POST' })
    sound.click()
    setNotifications(list => list.map(n => ({ ...n, read_at: new Date().toISOString() })))
  }

  function toggleSound() {
    const next = !soundEnabled
    sound.setEnabled(next)
    setSoundEnabled(next)
    if (next) sound.click()
  }

  const matches = nav.filter(([label]) => label.toLowerCase().includes(searchQuery.toLowerCase()))

  return (
    <div className="app-shell">
      {/* Background ambient lighting */}
      <div className="ambient-background">
        <div className="ambient-glow glow-top" />
        <div className="ambient-glow glow-bottom" />
      </div>

      <aside className={mobile ? 'sidebar mobile-open' : 'sidebar'}>
        <div className="side-top">
          <Logo />
          <button className="mobile-close" onClick={() => setMobile(false)}>
            <X />
          </button>
        </div>

        <div className="scope">
          <small>MINISTRY COMMAND SCOPE</small>
          <b>Port Harcourt Zone 3</b>
          <span>
            Southern Region <Sparkles />
          </span>
        </div>

        <nav>
          {nav.map(([label, to, Icon]) => (
            <NavLink
              to={to}
              end={to === '/'}
              key={to}
              onClick={() => {
                sound.click()
                setMobile(false)
              }}
            >
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-foot">
          <NavLink
            to="/settings"
            onClick={() => {
              sound.click()
              setMobile(false)
            }}
          >
            <Settings /> Settings
          </NavLink>
          <button
            onClick={() => {
              sound.click()
              logout()
            }}
          >
            <LogOut /> Sign out
          </button>
          <div className="user-chip">
            <div>
              {user?.name
                .split(' ')
                .map(x => x[0])
                .join('')
                .slice(0, 2)}
            </div>
            <span>
              <b>{user?.name}</b>
              <small>{user?.role}</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-menu" onClick={() => setMobile(true)}>
              <Menu />
            </button>
            <div className="breadcrumb">
              <small>NEXUS /</small>
              <b>{nav.find(n => n[1] === loc.pathname)?.[0] || 'Workspace'}</b>
            </div>
          </div>

          <LiveClock />

          <div className="top-actions">
            <button
              className="search-button"
              onClick={() => {
                sound.pop()
                setSearch(true)
              }}
            >
              <Search />
              <span>Search command</span>
              <kbd>⌘ K</kbd>
            </button>

            <button
              className={`icon-button sound-toggle ${soundEnabled ? 'active' : ''}`}
              onClick={toggleSound}
              title={soundEnabled ? 'Audio cues enabled' : 'Audio cues muted'}
            >
              {soundEnabled ? <Volume2 /> : <VolumeX />}
            </button>

            <button
              className="icon-button notification"
              onClick={() => {
                sound.pop()
                setNoticeOpen(!noticeOpen)
              }}
              aria-label={`${unread} unread notifications`}
            >
              <Bell />
              {unread > 0 && <i>{unread}</i>}
            </button>
          </div>
        </header>

        {noticeOpen && (
          <aside className="notification-panel">
            <header>
              <div>
                <p className="eyebrow">
                  <Sparkles /> Ministry Signals & Alerts
                </p>
                <h2>Stay in rhythm.</h2>
              </div>
              <div className="notification-panel-actions">
                {unread > 0 && (
                  <button
                    className="button ghost tiny"
                    onClick={markAllNotificationsRead}
                    title="Mark all as read"
                  >
                    <CheckCheck /> Mark all read
                  </button>
                )}
                <button className="icon-button close-btn" onClick={() => setNoticeOpen(false)}>
                  <X />
                </button>
              </div>
            </header>

            <div className="notification-list">
              {notifications.map(item => (
                <NavLink
                  key={item.id}
                  to={item.href || '/'}
                  onClick={() => openNotification(item)}
                  className={`notification-item ${item.read_at ? 'read' : 'unread'}`}
                >
                  <i className="notif-dot" />
                  <div className="notif-text">
                    <b>{item.title}</b>
                    <small>{item.message}</small>
                    <time>
                      {new Date(item.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('en', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </div>
                  <ChevronLeft className="notif-arrow" />
                </NavLink>
              ))}
            </div>
          </aside>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={loc.pathname}
            className="page"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Global Command Palette */}
      {search && (
        <div
          className="modal-backdrop command-backdrop"
          onMouseDown={e => e.target === e.currentTarget && setSearch(false)}
        >
          <div className="command-palette">
            <div className="command-input-row">
              <Search />
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search cells, leaders, people, resources, actions…"
              />
              <kbd onClick={() => setSearch(false)}>ESC</kbd>
            </div>
            <div className="command-results">
              {matches.length > 0 && (
                <div className="command-group">
                  <small>WORKSPACES & SECTIONS</small>
                  {matches.map(([label, to, Icon]) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => {
                        sound.click()
                        setSearch(false)
                        setSearchQuery('')
                      }}
                    >
                      <Icon />
                      <span>
                        <b>{label}</b>
                        <small>Open {label.toLowerCase()} command</small>
                      </span>
                      <ChevronLeft />
                    </NavLink>
                  ))}
                </div>
              )}
              {searchResults.length > 0 && (
                <div className="command-group">
                  <small>DATABASE RECORDS</small>
                  {searchResults.map(result => (
                    <NavLink
                      key={`${result.type}-${result.id}`}
                      to={result.href}
                      onClick={() => {
                        sound.click()
                        setSearch(false)
                        setSearchQuery('')
                      }}
                    >
                      <Search />
                      <span>
                        <b>{result.title}</b>
                        <small>
                          {result.type.toUpperCase()} · {result.subtitle}
                        </small>
                      </span>
                      <ChevronLeft />
                    </NavLink>
                  ))}
                </div>
              )}
              {!matches.length && !searchResults.length && searchQuery.length >= 2 && (
                <p className="command-empty">No matching cells, people, resources or sections.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
