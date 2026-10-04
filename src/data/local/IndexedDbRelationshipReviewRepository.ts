import type { RelationshipReview } from '../../analytics/insights/insightReview.ts'

function isReview(value: unknown): value is RelationshipReview {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return ['id', 'relationshipIdentity', 'targetDescriptorId', 'targetTrackableId', 'evidenceSignature', 'titleAtReview', 'createdAt', 'updatedAt'].every((key) => typeof item[key] === 'string')
    && (item.kind === 'relationship' || item.kind === 'change-point')
    && ['yes', 'probably', 'unknown', 'probably-not', 'no'].includes(String(item.judgment))
    && ['low', 'medium', 'high'].includes(String(item.confidence))
}

/** Local-only user metadata. Kept outside sync collections and derived analytics stores. */
export class IndexedDbRelationshipReviewRepository {
  private database?: Promise<IDBDatabase>
  private readonly name: string
  private readonly factory?: IDBFactory
  constructor(name = 'trace-insight-reviews', factory?: IDBFactory) { this.name = name; this.factory = factory }

  private open(): Promise<IDBDatabase> {
    if (!this.database) this.database = new Promise((resolve, reject) => {
      const request = (this.factory ?? indexedDB).open(this.name, 1)
      request.onupgradeneeded = () => { request.result.createObjectStore('reviews', { keyPath: 'id' }) }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return this.database
  }

  async all(): Promise<RelationshipReview[]> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const request = db.transaction('reviews', 'readonly').objectStore('reviews').getAll()
      request.onsuccess = () => { const values: unknown[] = request.result; if (values.every(isReview)) resolve(values); else reject(new Error('Invalid saved relationship review.')) }
      request.onerror = () => reject(request.error)
    })
  }

  async save(review: RelationshipReview): Promise<void> {
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('reviews', 'readwrite')
      tx.objectStore('reviews').put(review)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async remove(id: string): Promise<void> {
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('reviews', 'readwrite')
      tx.objectStore('reviews').delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  close(): void { void this.database?.then((db) => db.close()); this.database = undefined }
}
