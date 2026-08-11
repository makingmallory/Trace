import { RepositoryAnalyticsProvider } from '../../analytics/RepositoryAnalyticsProvider.ts'
import { IndexedDbDataRepository } from '../../data/local/IndexedDbDataRepository.ts'

export const analyticsProvider = new RepositoryAnalyticsProvider(new IndexedDbDataRepository())
