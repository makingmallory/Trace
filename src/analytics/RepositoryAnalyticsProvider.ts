import type { DataRepository } from '../data/repository/DataRepository.ts'
import type { AnalysisValueMapping } from '../domain/models/index.ts'
import { analysisMappingId } from './analysisMappings.ts'
import { validateAnalysisMappingDefinition } from './analysisModel.ts'
import type { AnalysisMappingDraft, AnalyticsProvider, TrendsData } from './AnalyticsProvider.ts'

export class RepositoryAnalyticsProvider implements AnalyticsProvider {
  readonly providerId = 'local-repository'
  private readonly repository: DataRepository

  constructor(repository: DataRepository) {
    this.repository = repository
  }

  async loadTrendsData(): Promise<TrendsData> {
    const [analysisMappings, categories, logRecords, observations, observationSelections, trackables, trackableOptions, trackableVersions, trackableFields, trackableDailyAssertions, routineItems] = await Promise.all([
      this.repository.getAll('analysisMappings'),
      this.repository.getAll('categories'),
      this.repository.getAll('logRecords'),
      this.repository.getAll('observations'),
      this.repository.getAll('observationSelections'),
      this.repository.getAll('trackables'),
      this.repository.getAll('trackableOptions'),
      this.repository.getAll('trackableVersions'),
      this.repository.getAll('trackableFields'),
      this.repository.getAll('trackableDailyAssertions'),
      this.repository.getAll('routineItems'),
    ])
    return { analysisMappings, categories, logRecords, observations, observationSelections, trackables, trackableOptions, trackableVersions, trackableFields, trackableDailyAssertions, routineItems }
  }

  async saveAnalysisMapping(draft: AnalysisMappingDraft): Promise<AnalysisValueMapping> {
    const data = await this.loadTrendsData()
    const error = validateAnalysisMappingDefinition(data, draft)
    if (error) throw new Error(error)
    const id = analysisMappingId(draft.trackableId, draft.sourceTrackableVersion, draft.targetTrackableVersion)
    const existing = await this.repository.getById('analysisMappings', id)
    const now = new Date().toISOString()
    const mapping: AnalysisValueMapping = {
      ...draft,
      id,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
      revision: (existing?.revision ?? 0) + 1,
    }
    await this.repository.save('analysisMappings', mapping)
    return mapping
  }

  async removeAnalysisMapping(id: string): Promise<void> {
    const existing = await this.repository.getById('analysisMappings', id)
    if (!existing || existing.deletedAt) return
    const now = new Date().toISOString()
    await this.repository.save('analysisMappings', { ...existing, deletedAt: now, updatedAt: now, revision: existing.revision + 1 })
  }
}
