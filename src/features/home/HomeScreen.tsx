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

function actionLabel(state: TodayState, configured: boolean) {
  if (!configured) return 'Set up'
  if (state === 'draft') return 'Resume'
  if (state === 'completed') return 'Edit'
  return 'Start'
}

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

export function HomeScreen() {
  const [state, setState] = useState<TodayState>('not_started')
  const [configured, setConfigured] = useState<boolean | null>(null)
  useEffect(() => { void Promise.all([checkInEngine.getTodayState(), checkInEngine.getConfiguration()]).then(([todayState, configuration]) => { setState(todayState); setConfigured(Boolean(configuration.routine && configuration.questions.length)) }) }, [])
  const checkInPath = configured ? '/check-in' : '/settings/nightly-check-in'
  return <section className="screen home-screen"><header className="screen__heading"><h1>{greeting()}</h1><p className="screen__description">{new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())}</p></header><div className="home-foundation">
    <div className="planned-actions">
      {configured ? <Link className="planned-action home-action home-action--checkin" to="/check-in"><span aria-hidden="true">✓</span><div><strong>Check in</strong><small>Daily trackables</small></div><b aria-hidden="true">›</b></Link> : <Link className="planned-action home-action home-action--checkin" to="/settings/nightly-check-in"><span aria-hidden="true">✓</span><div><strong>Set up Check-In</strong><small>Choose daily trackables</small></div><b aria-hidden="true">›</b></Link>}
      <Link className="planned-action home-action home-action--quick-log" to="/quick-log"><span aria-hidden="true">＋</span><div><strong>Quick Log</strong><small>Anything else</small></div><b aria-hidden="true">›</b></Link>
    </div>
    <section className="today-card"><h2>Today</h2><div className="today-checkin-row"><Link className="today-checkin-link" to={checkInPath}><span className={`status-dot status-dot--${state}`} aria-hidden="true" /><span><strong>Daily Check-In</strong><small>{configured ? stateCopy[state] : 'Needs Setup'}</small></span></Link><Link className="today-checkin-action" to={checkInPath}>{actionLabel(state, Boolean(configured))}</Link></div><TodayEvents localDate={localDateFor(new Date())} /></section>
  </div></section>
}
