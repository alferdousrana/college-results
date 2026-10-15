import { describe, it, expect, beforeEach } from 'vitest';
import { enqueueMark, flushQueue, listQueue, queueSummary, resolveConflict, QueueStatus } from '../../src/offline/offline-queue.js';
import { idb, STORES } from '../../src/offline/idb.js';

const path = { sessionId: 's1', subjectId: 'phy', studentId: 'st1' };
const owner = 'teacher-1';

describe('offline outbox', () => {
  beforeEach(async () => { await idb.clear(STORES.QUEUE); });

  it('persists edits and keeps the original base version when re-edited', async () => {
    await enqueueMark({ ownerUid: owner, path, payload: { components: { cq: 40 } }, baseVersion: 3 });
    await enqueueMark({ ownerUid: owner, path, payload: { components: { cq: 45 } }, baseVersion: 4 });
    const [e] = await listQueue(owner);
    expect(e.payload.components.cq).toBe(45);
    expect(e.baseVersion).toBe(3);
    expect((await queueSummary(owner)).pending).toBe(1);
  });

  it('removes entries the server accepted', async () => {
    await enqueueMark({ ownerUid: owner, path, payload: { components: { cq: 40 } }, baseVersion: 0 });
    const r = await flushQueue(owner, async () => ({ status: 'ok' }));
    expect(r.sent).toBe(1);
    expect(await listQueue(owner)).toEqual([]);
  });

  it('never overwrites newer server data: marks a conflict instead', async () => {
    await enqueueMark({ ownerUid: owner, path, payload: { components: { cq: 40 } }, baseVersion: 1 });
    await flushQueue(owner, async () => ({ status: 'conflict', server: { version: 2, components: { cq: 38 } } }));
    const [e] = await listQueue(owner);
    expect(e.status).toBe(QueueStatus.CONFLICT);
    expect(e.server.components.cq).toBe(38);
  });

  it('keeps entries pending on network failure', async () => {
    await enqueueMark({ ownerUid: owner, path, payload: { components: { cq: 40 } }, baseVersion: 0 });
    await flushQueue(owner, async () => { throw new Error('unavailable'); });
    const [e] = await listQueue(owner);
    expect(e.status).toBe(QueueStatus.PENDING);
    expect(e.attempts).toBe(1);
  });

  it('"keep mine" rebases on the server version; "use server" discards', async () => {
    await enqueueMark({ ownerUid: owner, path, payload: { components: { cq: 40 } }, baseVersion: 1 });
    await flushQueue(owner, async () => ({ status: 'conflict', server: { version: 5 } }));
    const [e] = await listQueue(owner);
    const rebased = await resolveConflict(e.key, 'mine');
    expect(rebased.baseVersion).toBe(5);
    expect(rebased.status).toBe(QueueStatus.PENDING);
    await flushQueue(owner, async () => ({ status: 'conflict', server: { version: 6 } }));
    await resolveConflict(e.key, 'server');
    expect(await listQueue(owner)).toEqual([]);
  });
});
