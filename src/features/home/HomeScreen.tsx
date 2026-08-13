import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { checkInEngine } from '../checkin/checkInEngine.ts'
import { localDateFor } from '../../domain/checkin/CheckInEngine.ts'
import { TodayEvents } from '../events/EventScreens.tsx'

type TodayState = 'not_started' | 'draft' | 'completed'

const stateCopy: Record<TodayState, string> = {
  not_started: 'Not started',
  draft: 'In Progress · Resume',
  completed: 'Completed · Edit',
}

export function HomeScreen() {
  const [state, setState] = useState<TodayState>('not_started')
  const [configured, setConfigured] = useState<boolean | null>(null)
  useEffect(() => { void Promise.all([checkInEngine.getTodayState(), checkInEngine.getConfiguration()]).then(([todayState, configuration]) => { setState(todayState); setConfigured(Boolean(configuration.routine && configuration.questions.length)) }) }, [])
  return <section className="screen home-screen"><header className="screen__heading"><p className="eyebrow">Your day, at a glance</p><h1>Welcome to Trace</h1><p className="screen__description">A calm home for the patterns that matter to you.</p></header><div className="home-foundation">
    <div className="planned-actions">
      {configured ? <Link className="planned-action home-action" to="/check-in"><span aria-hidden="true">✓</span><div><strong>Daily Check-In</strong><small>{stateCopy[state]}</small></div><b aria-hidden="true">→</b></Link> : <Link className="planned-action home-action" to="/settings/nightly-check-in"><span aria-hidden="true">✓</span><div><strong>Set up Daily Check-In</strong><small>Choose your nightly questions</small></div><b aria-hidden="true">→</b></Link>}
      <Link className="planned-action home-action" to="/quick-log"><span aria-hidden="true">＋</span><div><strong>Quick Log</strong><small>Log it when it happens</small></div><b aria-hidden="true">→</b></Link>
    </div>
    <section className="today-card"><p className="eyebrow">Today</p><Link className="today-checkin-link" to={configured ? '/check-in' : '/settings/nightly-check-in'}><span className={`status-dot status-dot--${state}`} aria-hidden="true" /><strong>Daily Check-In</strong><span>{configured ? stateCopy[state] : 'Needs Setup'}</span></Link><TodayEvents localDate={localDateFor(new Date())} /></section>
  </div></section>
}
