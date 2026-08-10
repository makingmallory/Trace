import { Link } from 'react-router-dom'
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder.tsx'

export function SettingsScreen() {
  return (
    <ScreenPlaceholder
      eyebrow="Preferences"
      title="Settings"
      description="Configuration, data controls, and appearance options will be added as their supporting features arrive."
    >
      <div className="developer-card">
        <div>
          <p className="developer-card__label">Milestone 0.5 developer tool</p>
          <h2>Google sync spike</h2>
          <p>
            Test one non-sensitive record against a manually deployed Apps Script
            endpoint. This is not production sync.
          </p>
        </div>
        <Link className="button-link" to="/sync-spike">
          Open sync spike tool
        </Link>
      </div>
    </ScreenPlaceholder>
  )
}
