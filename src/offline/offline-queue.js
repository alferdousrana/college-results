/**
 * Offline outbox for mark edits.
 *
 * Why not rely only on Firestore's offline writes? Firestore queues blind writes; our rules require
 * `version == previous + 1`, so a stale offline write would be REJECTED after reconnect and the SDK
 * would silently roll it back. This outbox keeps the teacher's edit, its base version, and a visible
 * status until a transactional sync either succeeds or reports a conflict for a human to resolve.
 *
 * Entry: { key, ownerUid, kind:'mark', path:{sessionId,subjectId,studentId}, payload, baseVersion,
 *          status:'pending'|'syncing'|'conflict'|'error', attempts, lastError, server?, createdAt, updatedAt }
 */
import { idb, STORES } from './idb.js';
import { emit } from '../core/events.js';

export const QueueStatus = Object.freeze({ PENDING: 'pending', SYNCING: 'syncing', CONFLICT: 'conflict', ERROR: 'error' });

export function markKey({ sessionId, subjectId, studentId }) { return `mark|${sessionId}|${subjectId}|${studentId}`; }

/** Adds or replaces an edit. Re-editing the same cell keeps the ORIGINAL base version. */
export async function enqueueMark({ ownerUid, path, payload, baseVersion }) {
  const key = markKey(path);
  const existing = await idb.get(STORES.QUEUE, key);
  const now = Date.now();
  const entry = {
    key, ownerUid, kind: 'mark', path, payload,
    baseVersion: existing && existing.status !== QueueStatus.CONFLICT ? existing.baseVersion : baseVersion,
    status: existing?.status === QueueStatus.CONFLICT ? QueueStatus.CONFLICT : QueueStatus.PENDING,
    attempts: existing?.attempts ?? 0,
    server: existing?.server ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await idb.put(STORES.QUEUE, entry);
  await notify();
  return entry;
}

export async function listQueue(ownerUid) {
  const all = await idb.all(STORES.QUEUE);
  return ownerUid ? all.filter((e) => e.ownerUid === ownerUid) : all;
}

export async function queueSummary(ownerUid) {
  const list = await listQueue(ownerUid);
  return {
    pending: list.filter((e) => e.status === QueueStatus.PENDING || e.status === QueueStatus.ERROR).length,
    syncing: list.filter((e) => e.status === QueueStatus.SYNCING).length,
    conflicts: list.filter((e) => e.status === QueueStatus.CONFLICT).length,
  };
}

let flushing = false;

/**
 * Sends pending entries using `transport(entry)` which must resolve to one of:
 *   { status: 'ok' } | { status: 'conflict', server } | { status: 'rejected', reason }
 * and throw on network failure (entry stays pending).
 */
export async function flushQueue(ownerUid, transport, { onEntry = null, filter = null } = {}) {
  if (flushing) return { skipped: true };
  flushing = true;
  const report = { sent: 0, conflicts: 0, errors: 0 };
  try {
    const entries = (await listQueue(ownerUid))
      .filter((e) => e.status === QueueStatus.PENDING || e.status === QueueStatus.ERROR || e.status === QueueStatus.SYNCING)
      .filter((e) => !filter || filter(e))
      .sort((a, b) => a.updatedAt - b.updatedAt);
    for (const entry of entries) {
      await idb.put(STORES.QUEUE, { ...entry, status: QueueStatus.SYNCING });
      await notify();
      try {
        const res = await transport(entry);
        onEntry?.(entry, res);
        if (res.status === 'ok') { await idb.delete(STORES.QUEUE, entry.key); report.sent++; }
        else if (res.status === 'conflict') {
          await idb.put(STORES.QUEUE, { ...entry, status: QueueStatus.CONFLICT, server: res.server ?? null, updatedAt: Date.now() });
          report.conflicts++;
        } else {
          await idb.put(STORES.QUEUE, { ...entry, status: QueueStatus.ERROR, lastError: res.reason ?? 'rejected', attempts: entry.attempts + 1 });
          report.errors++;
        }
      } catch (err) {
        // Network or unexpected failure: keep it pending, stop this pass.
        await idb.put(STORES.QUEUE, { ...entry, status: QueueStatus.PENDING, lastError: String(err?.message ?? err), attempts: entry.attempts + 1 });
        onEntry?.(entry, { status: 'offline', error: err });
        report.errors++;
        break;
      }
    }
  } finally {
    flushing = false;
    await notify();
  }
  return report;
}

/** Conflict resolution chosen by the user: keep mine (rebase on server version) or take server. */
/** Removes an entry without sending it (e.g. the user discarded the edit). */
export async function discardEntry(key) { await idb.delete(STORES.QUEUE, key); await notify(); }

export async function resolveConflict(key, choice) {
  const entry = await idb.get(STORES.QUEUE, key);
  if (!entry || entry.status !== QueueStatus.CONFLICT) return null;
  if (choice === 'server') { await idb.delete(STORES.QUEUE, key); await notify(); return null; }
  const rebased = { ...entry, status: QueueStatus.PENDING, baseVersion: entry.server?.version ?? entry.baseVersion, server: null, updatedAt: Date.now() };
  await idb.put(STORES.QUEUE, rebased);
  await notify();
  return rebased;
}

let notifyOwner = null;
/** The sync indicator shows the signed-in user's outbox only. */
export function setQueueOwner(uid) { notifyOwner = uid; notify(); }

async function notify() {
  try { emit('queue', await queueSummary(notifyOwner ?? undefined)); } catch { /* ignore */ }
}
