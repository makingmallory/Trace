import { IndexedDbDataRepository } from '../../data/local/IndexedDbDataRepository.ts'
import { HistoryEngine } from '../../domain/history/HistoryEngine.ts'

export const historyEngine = new HistoryEngine(new IndexedDbDataRepository())
