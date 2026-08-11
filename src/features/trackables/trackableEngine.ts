import { IndexedDbDataRepository } from '../../data/local/IndexedDbDataRepository.ts'
import { TrackableEngine } from '../../domain/trackables/TrackableEngine.ts'

export const trackableEngine = new TrackableEngine(new IndexedDbDataRepository())
