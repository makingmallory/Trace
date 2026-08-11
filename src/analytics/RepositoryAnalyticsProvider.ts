import type { DataRepository } from '../data/repository/DataRepository.ts'
import type { AnalyticsProvider, TrendsData } from './AnalyticsProvider.ts'

export class RepositoryAnalyticsProvider implements AnalyticsProvider {
  readonly providerId = 'local-repository'
  private readonly repository: DataRepository

  constructor(repository: DataRepository) {
    this.repository = repository
  }

  async loadTrendsData(): Promise<TrendsData> {
    const [logRecords, observations, observationSelections, trackables, trackableOptions, trackableVersions] = await Promise.all([
      this.repository.getAll('logRecords'),
      this.repository.getAll('observations'),
      this.repository.getAll('observationSelections'),
      this.repository.getAll('trackables'),
      this.repository.getAll('trackableOptions'),
      this.repository.getAll('trackableVersions'),
    ])
    return { logRecords, observations, observationSelections, trackables, trackableOptions, trackableVersions }
  }
}
