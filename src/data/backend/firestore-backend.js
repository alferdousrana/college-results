import { getFirebase } from '../../core/firebase.js';
import {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit, startAfter,
  runTransaction, writeBatch, onSnapshot, serverTimestamp, arrayUnion, arrayRemove, deleteField, increment,
} from 'firebase/firestore';
import { OP, isOp } from '../field-ops.js';

const CHUNK = 450;

function encode(value) {
  if (isOp(value)) {
    switch (value[OP]) {
      case 'serverTime': return serverTimestamp();
      case 'arrayUnion': return arrayUnion(...value.values);
      case 'arrayRemove': return arrayRemove(...value.values);
      case 'delete': return deleteField();
      case 'increment': return increment(value.by);
      default: throw new Error(`Unknown op ${value[OP]}`);
    }
  }
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encode(v)]));
  }
  return value;
}

function decode(value) {
  if (value && typeof value === 'object') {
    if (typeof value.toMillis === 'function' && 'seconds' in value) return value.toMillis();
    if (Array.isArray(value)) return value.map(decode);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]));
  }
  return value;
}

const snapToDoc = (s) => (s.exists() ? { id: s.id, ...decode(s.data()) } : null);

export function createFirestoreBackend() {
  const { db } = getFirebase();
  const ref = (path) => doc(db, path);

  function buildQuery(collectionPath, { where: w = [], orderBy: o = [], limit: l, after } = {}) {
    const parts = [
      ...w.map(([f, op, v]) => where(f, op, v)),
      ...o.map(([f, dir]) => orderBy(f, dir ?? 'asc')),
    ];
    if (after) parts.push(startAfter(after));
    if (l) parts.push(limit(l));
    return query(collection(db, collectionPath), ...parts);
  }

  return {
    kind: 'firestore',
    newId: (collectionPath) => doc(collection(db, collectionPath)).id,
    async get(path) { return snapToDoc(await getDoc(ref(path))); },
    async list(collectionPath, q = {}) {
      const qs = await getDocs(buildQuery(collectionPath, q));
      return { items: qs.docs.map(snapToDoc), cursor: q.limit && qs.docs.length === q.limit ? qs.docs[qs.docs.length - 1] : null };
    },
    set: (path, data, opts = {}) => setDoc(ref(path), encode(data), opts.merge ? { merge: true } : {}),
    update: (path, data) => updateDoc(ref(path), encode(data)),
    remove: (path) => deleteDoc(ref(path)),
    batch() {
      const ops = [];
      return {
        set: (path, data, opts = {}) => ops.push(['set', path, data, opts]),
        update: (path, data) => ops.push(['update', path, data]),
        delete: (path) => ops.push(['delete', path]),
        get size() { return ops.length; },
        async commit(onProgress) {
          for (let i = 0; i < ops.length; i += CHUNK) {
            const b = writeBatch(db);
            for (const [op, path, data, opts] of ops.slice(i, i + CHUNK)) {
              if (op === 'set') b.set(ref(path), encode(data), opts?.merge ? { merge: true } : {});
              else if (op === 'update') b.update(ref(path), encode(data));
              else b.delete(ref(path));
            }
            await b.commit();
            onProgress?.(Math.min(i + CHUNK, ops.length), ops.length);
          }
        },
      };
    },
    transaction(fn) {
      return runTransaction(db, (t) => fn({
        get: async (path) => snapToDoc(await t.get(ref(path))),
        set: (path, data, opts = {}) => t.set(ref(path), encode(data), opts.merge ? { merge: true } : {}),
        update: (path, data) => t.update(ref(path), encode(data)),
        delete: (path) => t.delete(ref(path)),
      }));
    },
    listenDoc: (path, cb, onError) => onSnapshot(ref(path), (s) => cb(snapToDoc(s)), onError),
    listenList: (collectionPath, q, cb, onError) =>
      onSnapshot(buildQuery(collectionPath, q), (qs) => cb(qs.docs.map(snapToDoc)), onError),
  };
}
