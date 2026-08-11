import { IndexedDbDataRepository } from '../../data/local/IndexedDbDataRepository.ts'
import { EventEngine } from '../../domain/events/EventEngine.ts'

export const eventEngine = new EventEngine(new IndexedDbDataRepository())
