import { RepositoryAnalyticsProvider } from '../../analytics/RepositoryAnalyticsProvider.ts'
import type { AnalyticsProvider } from '../../analytics/AnalyticsProvider.ts'
import { IndexedDbDataRepository } from '../../data/local/IndexedDbDataRepository.ts'

let localProvider: RepositoryAnalyticsProvider | null = null

function provider(): RepositoryAnalyticsProvider {
  localProvider ??= new RepositoryAnalyticsProvider(new IndexedDbDataRepository())
  return localProvider
}

/** Keeps browser-only IndexedDB access lazy so shared UI can render in non-browser tests. */
export const analyticsProvider: AnalyticsProvider = {
  providerId: 'local-repository',
  loadTrendsData: () => provider().loadTrendsData(),
  saveAnalysisMapping: (draft) => provider().saveAnalysisMapping(draft),
  removeAnalysisMapping: (id) => provider().removeAnalysisMapping(id),
}
