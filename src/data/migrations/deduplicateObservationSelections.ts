import type { DataRepository } from '../repository/DataRepository.ts'

/** Retains one canonical row for each observation + stable option identity. */
export async function deduplicateObservationSelections(repository: DataRepository, repairedAt = new Date().toISOString()): Promise<number> {
  const rows = [...await repository.getAll('observationSelections')]
    .filter((row) => !row.deletedAt)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  const seen = new Set<string>()
  const duplicates = rows.filter((row) => {
    const key = `${row.observationId}\u0000${row.optionId}`
    if (seen.has(key)) return true
    seen.add(key)
    return false
  })
  if (duplicates.length) await repository.saveMany('observationSelections', duplicates.map((row) => ({
    ...row, deletedAt: repairedAt, updatedAt: repairedAt, revision: row.revision + 1,
  })))
  return duplicates.length
}
