import { ScreenPlaceholder } from '../../components/ScreenPlaceholder.tsx'

export function HomeScreen() {
  return (
    <ScreenPlaceholder
      eyebrow="Your day, at a glance"
      title="Welcome to Trace"
      description="A calm home for the patterns that matter to you. Daily check-ins and event logging will arrive in their own milestones."
    >
      <div className="home-foundation" aria-label="Planned home actions">
        <div className="hero-card">
          <span className="hero-card__motif" aria-hidden="true">☾ ✦</span>
          <p>Little moments become meaningful patterns over time.</p>
        </div>
        <div className="planned-actions">
          <div className="planned-action">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Daily Check-In</strong>
              <small>Planned for Milestone 2</small>
            </div>
          </div>
          <div className="planned-action">
            <span aria-hidden="true">＋</span>
            <div>
              <strong>Log Event</strong>
              <small>Planned for Milestone 3</small>
            </div>
          </div>
        </div>
      </div>
    </ScreenPlaceholder>
  )
}
