/**
 * Minimal persistence layer over IndexedDB.
 *
 * Deliberately an interface with two implementations rather than direct
 * IndexedDB calls scattered through the stores:
 *
 *   - `IndexedDbStore` is the real thing, exercised end-to-end in Playwright.
 *   - `MemoryStore` lets the progression *logic* be unit-tested in Node,
 *     where IndexedDB does not exist, without adding a shim dependency.
 *
 * Pure logic in Vitest, real storage in Playwright — the same split the
 * Definition of Done asks for everywhere else.
 */

export const DB_NAME = 'inthepocket'
export const DB_VERSION = 1

export const STORE_PROGRESSION = 'progression'
export const STORE_TELEMETRY = 'telemetry'
export const STORE_PROFILES = 'profiles'

export const ALL_STORES = [STORE_PROGRESSION, STORE_TELEMETRY, STORE_PROFILES] as const
export type StoreName = (typeof ALL_STORES)[number]

export interface KeyValueStore {
  get<T>(store: StoreName, key: string): Promise<T | undefined>
  put<T>(store: StoreName, key: string, value: T): Promise<void>
  getAll<T>(store: StoreName): Promise<T[]>
  delete(store: StoreName, key: string): Promise<void>
  clear(store: StoreName): Promise<void>
}

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

export class IndexedDbStore implements KeyValueStore {
  private _dbPromise: Promise<IDBDatabase> | null = null

  private _open(): Promise<IDBDatabase> {
    if (this._dbPromise) return this._dbPromise

    this._dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onupgradeneeded = () => {
        const db = request.result
        for (const name of ALL_STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
        }
      }

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab.'))
    }).catch((err) => {
      // Allow a later call to retry rather than caching the failure forever.
      this._dbPromise = null
      throw err
    })

    return this._dbPromise
  }

  private async _tx<T>(
    store: StoreName,
    mode: IDBTransactionMode,
    run: (objectStore: IDBObjectStore) => IDBRequest
  ): Promise<T> {
    const db = await this._open()
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const request = run(tx.objectStore(store))
      request.onsuccess = () => resolve(request.result as T)
      request.onerror = () => reject(request.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this._tx<T | undefined>(store, 'readonly', (s) => s.get(key))
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    await this._tx(store, 'readwrite', (s) => s.put(value, key))
  }

  getAll<T>(store: StoreName): Promise<T[]> {
    return this._tx<T[]>(store, 'readonly', (s) => s.getAll())
  }

  async delete(store: StoreName, key: string): Promise<void> {
    await this._tx(store, 'readwrite', (s) => s.delete(key))
  }

  async clear(store: StoreName): Promise<void> {
    await this._tx(store, 'readwrite', (s) => s.clear())
  }
}

// ---------------------------------------------------------------------------
// In-memory (tests, and a graceful fallback)
// ---------------------------------------------------------------------------

export class MemoryStore implements KeyValueStore {
  private _data = new Map<string, Map<string, unknown>>()

  private _bucket(store: StoreName): Map<string, unknown> {
    let bucket = this._data.get(store)
    if (!bucket) {
      bucket = new Map()
      this._data.set(store, bucket)
    }
    return bucket
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this._bucket(store).get(key) as T | undefined
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    this._bucket(store).set(key, value)
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return [...this._bucket(store).values()] as T[]
  }

  async delete(store: StoreName, key: string): Promise<void> {
    this._bucket(store).delete(key)
  }

  async clear(store: StoreName): Promise<void> {
    this._bucket(store).clear()
  }
}

/**
 * The app's store. Falls back to memory where IndexedDB is unavailable
 * (private browsing, some embedded webviews) so a drummer gets a working
 * session rather than a crash — they simply lose progress on reload.
 */
export function createDefaultStore(): KeyValueStore {
  const hasIdb = typeof indexedDB !== 'undefined'
  return hasIdb ? new IndexedDbStore() : new MemoryStore()
}
