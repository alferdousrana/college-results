/**
 * DEMO BACKEND — for evaluating the app before Firebase is connected, and for automated
 * workflow tests. Everything is stored in this browser (localStorage). It does NOT enforce
 * security rules; the interface shows a permanent "Demo mode" banner whenever it is active.
 */
import { OP, isOp } from '../field-ops.js';

const STORAGE_KEY = 'crms.demo.db.v1';
let instance = null;

export function getDemoBackend({ storage = globalThis.localStorage, seed = null } = {}) {
  if (!instance) instance = createDemoBackend({ storage, seed });
  return instance;
}

export function createDemoBackend({ storage = null, seed = null } = {}) {
  let docs = load();
  const listeners = new Set();
  let counter = 0;

  function load() {
    if (seed) return structuredClone(seed);
    try { return JSON.parse(storage?.getItem(STORAGE_KEY) || 'null') ?? {}; } catch { return {}; }
  }
  // Writing the whole demo database on every change is O(n²) during seeding, so storage writes are
  // coalesced (250 ms) and flushed when the page is hidden. Listeners are notified immediately.
  let saveTimer = null;
  const writeNow = () => { clearTimeout(saveTimer); saveTimer = null; try { storage?.setItem(STORAGE_KEY, JSON.stringify(docs)); } catch (e) { console.warn('[demo] storage full', e); } };
  if (storage && typeof window !== 'undefined') window.addEventListener('pagehide', writeNow);
  if (storage && typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') writeNow(); });
  function persist() {
    if (storage && !saveTimer) saveTimer = setTimeout(writeNow, 250);
    queueMicrotask(() => listeners.forEach((l) => l()));
  }
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const idOf = (path) => path.split('/').pop();
  const parentOf = (path) => path.split('/').slice(0, -1).join('/');
  const asDoc = (path) => (docs[path] ? { id: idOf(path), ...clone(docs[path]) } : null);

  function apply(existing, data, merge) {
    const base = merge ? clone(existing ?? {}) : {};
    // set+merge deep-merges nested maps (Firestore semantics); plain set replaces the document.
    for (const [k, v] of Object.entries(data)) setField(base, [k], v, merge);
    return base;
  }
  function setField(target, parts, value, deep) {
    let obj = target;
    for (const p of parts.slice(0, -1)) { if (typeof obj[p] !== 'object' || obj[p] === null) obj[p] = {}; obj = obj[p]; }
    const last = parts[parts.length - 1];
    if (isOp(value)) {
      const cur = obj[last];
      switch (value[OP]) {
        case 'serverTime': obj[last] = Date.now(); break;
        case 'arrayUnion': obj[last] = [...new Set([...(Array.isArray(cur) ? cur : []), ...value.values])]; break;
        case 'arrayRemove': obj[last] = (Array.isArray(cur) ? cur : []).filter((x) => !value.values.includes(x)); break;
        case 'delete': delete obj[last]; break;
        case 'increment': obj[last] = (typeof cur === 'number' ? cur : 0) + value.by; break;
        default: throw new Error('unknown op');
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!deep || typeof obj[last] !== 'object' || obj[last] === null || Array.isArray(obj[last])) obj[last] = {};
      for (const [k, v] of Object.entries(value)) setField(obj[last], [k], v, deep);
    } else if (value !== undefined) obj[last] = clone(value);
  }

  function writeSet(path, data, opts = {}) { docs[path] = apply(docs[path], data, opts.merge); }
  function writeUpdate(path, data) {
    if (!docs[path]) throw Object.assign(new Error(`No document to update: ${path}`), { code: 'not-found' });
    const next = clone(docs[path]);
    // update(): dotted keys address nested fields; a map value replaces that field (Firestore semantics).
    for (const [k, v] of Object.entries(data)) setField(next, k.split('.'), v, false);
    docs[path] = next;
  }

  const read = (obj, field) => field.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const test = (d, [f, op, v]) => {
    const x = f === '__name__' ? d.id : read(d, f);
    switch (op) {
      case '==': return x === v;
      case '!=': return x !== v && x !== undefined;
      case 'in': return v.includes(x);
      case 'not-in': return !v.includes(x);
      case 'array-contains': return Array.isArray(x) && x.includes(v);
      case 'array-contains-any': return Array.isArray(x) && x.some((y) => v.includes(y));
      case '<': return x < v; case '<=': return x <= v; case '>': return x > v; case '>=': return x >= v;
      default: throw new Error(`Unsupported operator ${op}`);
    }
  };
  function runQuery(collectionPath, { where = [], orderBy = [], limit, after } = {}) {
    const depth = collectionPath.split('/').length + 1;
    let rows = Object.keys(docs)
      .filter((p) => parentOf(p) === collectionPath && p.split('/').length === depth)
      .map(asDoc)
      .filter((d) => where.every((w) => test(d, w)));
    rows.sort((a, b) => {
      for (const [f, dir] of orderBy) {
        const x = read(a, f), y = read(b, f);
        if (x === y) continue;
        if (x === undefined) return 1; if (y === undefined) return -1;
        return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1);
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    const start = after ? after.offset : 0;
    const page = limit ? rows.slice(start, start + limit) : rows.slice(start);
    const cursor = limit && start + limit < rows.length ? { offset: start + limit } : null;
    return { items: page, cursor };
  }

  const api = {
    kind: 'demo',
    newId: () => `demo${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    async get(path) { return asDoc(path); },
    async list(collectionPath, q) { return runQuery(collectionPath, q); },
    async count(collectionPath, q = {}) { return runQuery(collectionPath, { where: q.where ?? [] }).items.length; },
    async set(path, data, opts) { writeSet(path, data, opts); persist(); },
    async update(path, data) { writeUpdate(path, data); persist(); },
    async remove(path) { delete docs[path]; persist(); },
    batch() {
      const ops = [];
      return {
        set: (p, d, o) => ops.push(() => writeSet(p, d, o)),
        update: (p, d) => ops.push(() => writeUpdate(p, d)),
        delete: (p) => ops.push(() => { delete docs[p]; }),
        get size() { return ops.length; },
        async commit(onProgress) { ops.forEach((f) => f()); persist(); onProgress?.(ops.length, ops.length); },
      };
    },
    async transaction(fn) {
      const snapshot = clone(docs);
      const queued = [];
      try {
        const result = await fn({
          get: async (p) => asDoc(p),
          set: (p, d, o) => queued.push(() => writeSet(p, d, o)),
          update: (p, d) => queued.push(() => writeUpdate(p, d)),
          delete: (p) => queued.push(() => { delete docs[p]; }),
        });
        queued.forEach((f) => f());
        persist();
        return result;
      } catch (e) { docs = snapshot; throw e; }
    },
    listenDoc(path, cb) {
      const l = () => cb(asDoc(path));
      listeners.add(l); queueMicrotask(l);
      return () => listeners.delete(l);
    },
    listenList(collectionPath, q, cb) {
      const l = () => cb(runQuery(collectionPath, { ...q, after: null }).items);
      listeners.add(l); queueMicrotask(l);
      return () => listeners.delete(l);
    },
    // demo-only helpers
    _dump: () => clone(docs),
    _reset(next = {}) { docs = clone(next); writeNow(); },
    _flush: () => writeNow(),
    _isEmpty: () => Object.keys(docs).length === 0,
  };
  return api;
}
