/** Minimal promise wrapper over IndexedDB for the app's own offline stores. */
const DB_NAME = 'crms-local';
const DB_VERSION = 1;
export const STORES = Object.freeze({ QUEUE: 'outbox', DRAFTS: 'drafts', META: 'meta' });

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('INDEXEDDB_UNAVAILABLE')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.QUEUE)) {
        const s = db.createObjectStore(STORES.QUEUE, { keyPath: 'key' });
        s.createIndex('status', 'status');
        s.createIndex('ownerUid', 'ownerUid');
      }
      if (!db.objectStoreNames.contains(STORES.DRAFTS)) db.createObjectStore(STORES.DRAFTS, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORES.META)) db.createObjectStore(STORES.META, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const idb = {
  get: (store, key) => tx(store, 'readonly', (s) => wrap(s.get(key))),
  put: (store, value) => tx(store, 'readwrite', (s) => wrap(s.put(value))),
  delete: (store, key) => tx(store, 'readwrite', (s) => wrap(s.delete(key))),
  all: (store) => tx(store, 'readonly', (s) => wrap(s.getAll())),
  clear: (store) => tx(store, 'readwrite', (s) => wrap(s.clear())),
};

/** Test helper: forget the cached connection (used with fake-indexeddb). */
export function _resetDbForTests() { dbPromise = null; }
