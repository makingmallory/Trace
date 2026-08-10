import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder.tsx'
import { createSyncSpikeService } from '../../data/sync/createSyncSpikeService.ts'
import {
  createSyncSpikeRecord,
  type SyncSpikeResult,
} from '../../data/sync/SyncSpikeService.ts'

type RunState = 'idle' | 'running' | 'success' | 'error'

export function SyncSpikeScreen() {
  const [endpointUrl, setEndpointUrl] = useState('')
  const [runState, setRunState] = useState<RunState>('idle')
  const [result, setResult] = useState<SyncSpikeResult | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setRunState('running')
    setResult(null)
    setErrorMessage('')

    try {
      const service = createSyncSpikeService(endpointUrl)
      const spikeResult = await service.run(createSyncSpikeRecord())
      setResult(spikeResult)

      if (spikeResult.roundTripSucceeded) {
        setRunState('success')
      } else {
        setRunState('error')
        setErrorMessage(
          'The endpoint wrote a record, but the read-back did not match exactly.',
        )
      }
    } catch (error) {
      setRunState('error')
      setErrorMessage(
        error instanceof Error ? error.message : 'The round-trip test failed.',
      )
    }
  }

  return (
    <ScreenPlaceholder
      eyebrow="Milestone 0.5"
      title="Google sync spike"
      description="Use a disposable Sheet and Apps Script deployment to write one generated test record, read it back, and compare it exactly."
    >
      <div className="sync-spike-layout">
        <div className="spike-warning" role="note">
          <strong>Test data only.</strong>
          <span>
            This endpoint has no production authentication. Never use it for
            personal or health information.
          </span>
        </div>

        <form className="sync-spike-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="sync-endpoint">Test endpoint URL</label>
            <input
              id="sync-endpoint"
              type="url"
              value={endpointUrl}
              onChange={(event) => setEndpointUrl(event.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              autoComplete="off"
              spellCheck={false}
              required
              disabled={runState === 'running'}
            />
            <small>Use the deployed web app URL ending in /exec.</small>
          </div>

          <button
            className="primary-button"
            type="submit"
            disabled={runState === 'running'}
          >
            {runState === 'running' ? 'Running test…' : 'Run round-trip test'}
          </button>
        </form>

        <div
          className={`sync-spike-status sync-spike-status--${runState}`}
          aria-live="polite"
          aria-busy={runState === 'running'}
        >
          <h2>Round-trip status</h2>
          {runState === 'idle' && (
            <p>Complete the manual setup, then enter the endpoint above.</p>
          )}
          {runState === 'running' && <p>Checking, writing, and reading back…</p>}
          {runState === 'error' && <p>{errorMessage}</p>}
          {result && (
            <ol className="sync-checks">
              <li data-complete={result.health.available}>
                Endpoint responded
              </li>
              <li data-complete={result.writeSucceeded}>Test record written</li>
              <li data-complete={result.readBackSucceeded}>
                Test record read back
              </li>
              <li data-complete={result.roundTripSucceeded}>
                ID, value, and timestamp matched exactly
              </li>
            </ol>
          )}
          {result?.roundTripSucceeded && (
            <div className="sync-record-summary">
              <strong>Verified record</strong>
              <code>{result.sent.id}</code>
              <span>{result.sent.value}</span>
            </div>
          )}
        </div>

        <div className="sync-spike-footer">
          <Link to="/settings">← Back to Settings</Link>
          <span>Setup instructions: docs/google-sync-spike.md</span>
        </div>
      </div>
    </ScreenPlaceholder>
  )
}
