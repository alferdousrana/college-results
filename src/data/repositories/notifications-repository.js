/**
 * In-app notifications: notifications/{id}
 *   { recipientUid | audience: 'admins', type, params, link, createdAt, readBy: [] }
 * Messages are rendered from i18n keys + small params (exam title, subject name) — never marks,
 * guardian details or other private student information.
 */
import { getBackend } from '../backend/index.js';
import { C } from '../paths.js';
import { serverTime, arrayUnion } from '../field-ops.js';
import { getState } from '../../core/store.js';

export async function notify({ recipientUid = null, audience = null, type, params = {}, link = null }, writer = null) {
  const b = await getBackend();
  const id = b.newId(C.NOTIFICATIONS);
  const data = { recipientUid, audience, type, params, link, createdAt: serverTime(), readBy: [], senderUid: getState().authUser?.uid ?? null };
  if (writer) writer.set(`${C.NOTIFICATIONS}/${id}`, data);
  else await b.set(`${C.NOTIFICATIONS}/${id}`, data);
}

/** Two bounded listeners (personal + role broadcast). Returns an unsubscribe function. */
export async function listenNotifications(profile, cb) {
  const b = await getBackend();
  let personal = [], broadcast = [];
  const emitAll = () => cb([...personal, ...broadcast].sort((a, c) => (c.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 20));
  const unsubs = [b.listenList(C.NOTIFICATIONS, { where: [['recipientUid', '==', profile.id]], orderBy: [['createdAt', 'desc']], limit: 20 },
    (items) => { personal = items; emitAll(); }, () => {})];
  if (profile.role === 'super_admin') {
    unsubs.push(b.listenList(C.NOTIFICATIONS, { where: [['audience', '==', 'admins']], orderBy: [['createdAt', 'desc']], limit: 20 },
      (items) => { broadcast = items; emitAll(); }, () => {}));
  }
  return () => unsubs.forEach((u) => u());
}

export async function markRead(id, uid) {
  const b = await getBackend();
  await b.update(`${C.NOTIFICATIONS}/${id}`, { readBy: arrayUnion(uid) });
}
