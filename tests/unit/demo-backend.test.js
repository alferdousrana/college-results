import { describe, it, expect } from 'vitest';
import { createDemoBackend } from '../../src/data/backend/demo-backend.js';
import { serverTime, arrayUnion, deleteField } from '../../src/data/field-ops.js';

describe('demo backend semantics (mirror Firestore)', () => {
  const b = createDemoBackend({ storage: null });
  it('set+merge deep-merges maps; update replaces a map field', async () => {
    await b.set('c/a', { m: { x: 1, y: 2 }, n: 1 });
    await b.set('c/a', { m: { y: 3 } }, { merge: true });
    expect((await b.get('c/a')).m).toEqual({ x: 1, y: 3 });
    await b.update('c/a', { m: { z: 1 }, 'p.q': 2 });
    expect(await b.get('c/a')).toMatchObject({ m: { z: 1 }, p: { q: 2 }, n: 1 });
  });
  it('field operations', async () => {
    await b.set('c/b', { t: serverTime(), arr: ['a'], gone: 1 });
    await b.update('c/b', { arr: arrayUnion('a', 'b'), gone: deleteField() });
    const d = await b.get('c/b');
    expect(typeof d.t).toBe('number'); expect(d.arr).toEqual(['a', 'b']); expect('gone' in d).toBe(false);
  });
  it('queries with filters, ordering and cursors; subcollections are separate', async () => {
    for (let i = 0; i < 5; i++) await b.set(`q/${i}`, { n: i, tag: i % 2 ? 'odd' : 'even' });
    await b.set('q/0/sub/x', { n: 99 });
    const p1 = await b.list('q', { where: [['tag', '==', 'even']], orderBy: [['n', 'desc']], limit: 2 });
    expect(p1.items.map((x) => x.n)).toEqual([4, 2]);
    const p2 = await b.list('q', { where: [['tag', '==', 'even']], orderBy: [['n', 'desc']], limit: 2, after: p1.cursor });
    expect(p2.items.map((x) => x.n)).toEqual([0]);
  });
  it('transactions roll back on error', async () => {
    await b.set('t/a', { v: 1 });
    await expect(b.transaction(async (tx) => { tx.set('t/a', { v: 2 }); throw new Error('stop'); })).rejects.toThrow();
    expect((await b.get('t/a')).v).toBe(1);
  });
});
