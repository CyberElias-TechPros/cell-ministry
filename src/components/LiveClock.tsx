import { useEffect, useState } from 'react'

export function LiveClock() {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const timeStr = time.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const dateStr = time.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="live-clock" title="Port Harcourt Command Time (UTC+1)">
      <span className="live-clock-dot" />
      <span className="live-clock-time">{timeStr}</span>
      <span className="live-clock-date">{dateStr}</span>
    </div>
  )
}
