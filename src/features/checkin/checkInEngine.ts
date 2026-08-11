import { IndexedDbDataRepository } from '../../data/local/IndexedDbDataRepository.ts'
import { CheckInEngine } from '../../domain/checkin/CheckInEngine.ts'

export const checkInEngine = new CheckInEngine(new IndexedDbDataRepository())
