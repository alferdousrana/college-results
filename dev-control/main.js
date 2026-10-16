/**
 * Developer feature control (GitHub Pages: …/dev-control/).
 * Three locks, all checked by Firestore rules, not by this page:
 *   1. Firebase email + password (session ends when the tab closes),
 *   2. the account must be listed in developers/{uid} — created only in the Firebase console,
 *   3. the secret answer: its SHA-256 (with the uid as salt) must equal developers/{uid}.answerHash,
 *      which unlocks a 30-minute session. The hash is never readable by any browser.
 * No tokens or secrets are in this file.
 */
import './style.css';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserSessionPersistence, sendPasswordResetEmail } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache, doc, getDoc, setDoc, deleteDoc, writeBatch, collection, query, orderBy, limit, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import { firebaseConfig, isFirebaseConfigured } from '../src/core/config.js';
import defaults from '../config/feature-flags.json';

const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#devctl');
const SESSION_MIN = 29;
const MAX_TRIES = 5;

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
}
function toast(msg, kind = '') {
  const t = el('div', { class: kind }, msg);
  $('#dc-toast').append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 9000 : 4000);
}
function passwordInput(id) {
  const input = el('input', { type: 'password', id, autocomplete: 'current-password', required: true });
  const btn = el('button', { type: 'button', class: 'small', 'aria-controls': id, onclick: () => {
    const show = input.type === 'password'; input.type = show ? 'text' : 'password'; btn.textContent = show ? 'Hide' : 'Show'; input.focus();
  } }, 'Show');
  return { input, box: el('div', { class: 'pw' }, input, btn) };
}
export async function answerHash(uid, answer) {
  const norm = `${uid}|${String(answer).normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ')}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

if (!isFirebaseConfigured()) {
  main.replaceChildren(el('div', { class: 'card narrow' }, el('h1', {}, 'Feature control'), el('p', { class: 'error' }, 'This build has no Firebase configuration.')));
} else {
  const app = initializeApp(firebaseConfig, 'devctl');
  const auth = getAuth(app);
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  setPersistence(auth, browserSessionPersistence).catch(() => {}); // sign-in ends when the tab closes
  let tries = 0;
  let expiryTimer = null;

  onAuthStateChanged(auth, (user) => { if (!user) showSignIn(); else checkDeveloper(user); });

  function showSignIn() {
    clearInterval(expiryTimer);
    const email = el('input', { type: 'email', id: 'dc-email', autocomplete: 'username', required: true });
    const pw = passwordInput('dc-pw');
    const err = el('p', { class: 'error', hidden: true });
    const submit = el('button', { class: 'primary', type: 'submit' }, 'Sign in');
    const form = el('form', { class: 'card narrow', onsubmit: async (e) => {
      e.preventDefault(); err.hidden = true; submit.disabled = true;
      try { await signInWithEmailAndPassword(auth, email.value.trim(), pw.input.value); }
      catch (ex) { err.textContent = ex.code === 'auth/too-many-requests' ? 'Too many attempts. Wait a few minutes.' : 'Sign-in failed.'; err.hidden = false; }
      finally { submit.disabled = false; }
    } },
      el('h1', {}, 'Feature control'), el('p', {}, 'Developer access only.'),
      el('label', { for: 'dc-email' }, 'Email'), email, el('label', { for: 'dc-pw' }, 'Password'), pw.box, err,
      el('div', { class: 'row between', style: 'margin-top:16px' }, submit,
        el('button', { type: 'button', class: 'small', onclick: async () => { if (email.value) { await sendPasswordResetEmail(auth, email.value.trim()).catch(() => {}); toast('If the account exists, a reset email was sent.'); } else toast('Enter the email first.'); } }, 'Forgot password?')));
    main.replaceChildren(form);
    email.focus();
  }

  async function checkDeveloper(user) {
    main.replaceChildren(el('p', {}, 'Checking…'));
    let question = null;
    try { const q = await getDoc(doc(db, 'developerProfiles', user.uid)); question = q.exists() ? q.data().question : null; }
    catch { question = null; }
    if (!question) { showNotDeveloper(user); return; }
    const s = await getDoc(doc(db, 'developerSessions', user.uid)).catch(() => null);
    if (s?.exists() && s.data().expiresAt?.toMillis() > Date.now() + 60_000) { showPanel(user, s.data().expiresAt.toMillis()); return; }
    showUnlock(user, question);
  }

  function showNotDeveloper(user) {
    const q = el('input', { type: 'text', id: 'dc-q', placeholder: 'e.g. Name of my first school' });
    const a = passwordInput('dc-a'); a.input.autocomplete = 'off';
    const out = el('div');
    main.replaceChildren(el('div', { class: 'card' },
      el('h1', {}, 'Not registered as a developer'),
      el('p', {}, 'This account cannot change features. If you are the developer, register it once in the Firebase console. The values below are computed in this browser and never sent anywhere.'),
      el('p', {}, 'Your account ID (uid): ', el('code', {}, user.uid)),
      el('label', { for: 'dc-q' }, 'Secret question'), q, el('label', { for: 'dc-a' }, 'Secret answer'), a.box,
      el('p', { class: 'small muted' }, 'The answer is not case-sensitive and extra spaces are ignored.'),
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', { class: 'primary', type: 'button', onclick: async () => {
          if (!q.value.trim() || !a.input.value.trim()) { toast('Enter both the question and the answer.', 'bad'); return; }
          const hash = await answerHash(user.uid, a.input.value);
          out.replaceChildren(el('h2', {}, 'Create these two documents in Firebase Console → Firestore Database → Data'),
            el('p', {}, '1. Collection ', el('code', {}, 'developers'), ', Document ID ', el('code', {}, user.uid), ', field ', el('code', {}, 'answerHash'), ' (string):'), el('pre', {}, hash),
            el('p', {}, '2. Collection ', el('code', {}, 'developerProfiles'), ', Document ID ', el('code', {}, user.uid), ', field ', el('code', {}, 'question'), ' (string):'), el('pre', {}, q.value.trim()),
            el('p', {}, 'Then reload this page.'));
        } }, 'Generate setup values'),
        el('button', { type: 'button', onclick: () => signOut(auth) }, 'Sign out')),
      out));
  }

  function showUnlock(user, question) {
    const a = passwordInput('dc-ans'); a.input.autocomplete = 'off';
    const err = el('p', { class: 'error', hidden: true });
    const submit = el('button', { class: 'primary', type: 'submit' }, 'Unlock for 30 minutes');
    main.replaceChildren(el('form', { class: 'card narrow', onsubmit: async (e) => {
      e.preventDefault();
      if (tries >= MAX_TRIES) { err.textContent = 'Too many wrong answers. Sign out and try again later.'; err.hidden = false; return; }
      submit.disabled = true; err.hidden = true;
      try {
        const proof = await answerHash(user.uid, a.input.value);
        const expiresAt = Timestamp.fromMillis(Date.now() + SESSION_MIN * 60_000);
        await setDoc(doc(db, 'developerSessions', user.uid), { proof, createdAt: serverTimestamp(), expiresAt });
        tries = 0;
        showPanel(user, expiresAt.toMillis());
      } catch (ex) {
        tries++;
        err.textContent = ex.code === 'permission-denied' ? `Wrong answer (${MAX_TRIES - tries} tries left).` : `Could not verify: ${ex.message}`;
        err.hidden = false; a.input.select();
      } finally { submit.disabled = false; }
    } },
      el('h1', {}, 'Verify it is you'), el('p', {}, `Signed in as ${user.email}.`),
      el('label', { for: 'dc-ans' }, question), a.box, err,
      el('div', { class: 'row between', style: 'margin-top:16px' }, submit, el('button', { type: 'button', class: 'small', onclick: () => signOut(auth) }, 'Sign out'))));
    a.input.focus();
  }

  async function showPanel(user, expiresAtMs) {
    main.replaceChildren(el('p', {}, 'Loading features…'));
    const snap = await getDoc(doc(db, 'featureFlags', 'global')).catch(() => null);
    const live = snap?.exists() ? snap.data() : null;
    const version = live?.version ?? 0;
    const current = {};
    for (const [id, def] of Object.entries(defaults.features)) {
      const f = live?.features?.[id] ?? {};
      current[id] = { enabled: typeof f.enabled === 'boolean' ? f.enabled : def.enabled, message: { en: f.message?.en ?? '', bn: f.message?.bn ?? '' } };
    }
    const draft = structuredClone(current);
    let upgradeUrl = live?.upgradeUrl ?? defaults.upgradeUrl ?? '';
    const timer = el('span', { class: 'muted small' });
    const saveBtn = el('button', { class: 'primary', type: 'button', disabled: true }, 'Save changes');
    const changedCount = el('span', { class: 'muted small' });
    const isChanged = (id) => JSON.stringify(draft[id]) !== JSON.stringify(current[id]);
    const refreshDirty = () => {
      const n = Object.keys(draft).filter(isChanged).length + ((upgradeUrl || '') !== (live?.upgradeUrl ?? defaults.upgradeUrl ?? '') ? 1 : 0);
      saveBtn.disabled = n === 0; changedCount.textContent = n ? `${n} unsaved change(s)` : 'No changes';
      main.querySelectorAll('tr[data-id]').forEach((tr) => tr.classList.toggle('changed', isChanged(tr.dataset.id)));
    };
    const rows = Object.entries(defaults.features).map(([id, def]) => {
      const st = el('span', { class: draft[id].enabled ? 'state-on' : 'state-off' }, draft[id].enabled ? 'Enabled' : 'Disabled');
      const cb = el('input', { type: 'checkbox', checked: draft[id].enabled, 'aria-label': `${def.label} enabled`, onchange: () => {
        draft[id].enabled = cb.checked; st.textContent = cb.checked ? 'Enabled' : 'Disabled'; st.className = cb.checked ? 'state-on' : 'state-off'; refreshDirty();
      } });
      const en = el('textarea', { rows: 2, maxlength: 300, 'aria-label': 'Upgrade message (English)', oninput: () => { draft[id].message.en = en.value; refreshDirty(); } }, draft[id].message.en);
      const bn = el('textarea', { rows: 2, maxlength: 300, 'aria-label': 'Upgrade message (Bangla)', oninput: () => { draft[id].message.bn = bn.value; refreshDirty(); } }, draft[id].message.bn);
      return el('tr', { 'data-id': id },
        el('td', {}, el('strong', {}, def.label), el('div', { class: 'muted small' }, `${id} · ${def.category}`),
          el('details', {}, el('summary', {}, 'Upgrade message when disabled'), el('div', { class: 'msg-grid' }, el('span', { class: 'small' }, 'English'), en, el('span', { class: 'small' }, 'বাংলা'), bn,
            el('span', { class: 'muted small' }, 'Leave empty to use the default message.')))),
        el('td', {}, st),
        el('td', {}, el('label', { class: 'switch' }, cb, el('span', { class: 'slider' }))));
    });
    const urlInput = el('input', { type: 'url', id: 'dc-url', placeholder: 'https://… (optional)', value: upgradeUrl, oninput: () => { upgradeUrl = urlInput.value.trim(); refreshDirty(); } });
    const historyBox = el('div', {}, el('p', { class: 'muted small' }, 'Loading…'));

    saveBtn.addEventListener('click', async () => {
      if (upgradeUrl && !/^https:\/\/\S{1,300}$/.test(upgradeUrl)) { toast('The upgrade link must start with https://', 'bad'); return; }
      const changes = Object.keys(draft).filter(isChanged).map((id) => `${id}: ${current[id].enabled ? 'on' : 'off'} → ${draft[id].enabled ? 'on' : 'off'}`);
      if (!confirm(`Save ${changes.length || 'these'} change(s)? The college app updates within seconds.\n\n${changes.join('\n')}`)) return;
      saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
      const features = Object.fromEntries(Object.entries(draft).map(([id, f]) => [id, {
        enabled: f.enabled, ...(f.message.en.trim() || f.message.bn.trim() ? { message: { en: f.message.en.trim().slice(0, 300), bn: f.message.bn.trim().slice(0, 300) } } : {}) }]));
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'featureFlags', 'global'), { version: version + 1, updatedAt: serverTimestamp(), updatedBy: user.uid, upgradeUrl: upgradeUrl || null, features });
        batch.set(doc(collection(db, 'featureFlagHistory')), { by: user.uid, byEmail: user.email, at: serverTimestamp(), version: version + 1, changes, upgradeUrl: upgradeUrl || null });
        await batch.commit();
        toast(`Saved. Configuration version ${version + 1} is live.`, 'good');
        showPanel(user, expiresAtMs);
      } catch (ex) {
        toast(ex.code === 'permission-denied' ? 'Not saved: your verification expired or this account is not allowed. Unlock again.' : `Not saved: ${ex.message}`, 'bad');
        saveBtn.disabled = false; saveBtn.textContent = 'Save changes';
      }
    });

    main.replaceChildren(
      el('div', { class: 'row between' }, el('h1', {}, 'Feature control'),
        el('div', { class: 'row' }, timer,
          el('button', { type: 'button', class: 'small', onclick: async () => { await deleteDoc(doc(db, 'developerSessions', user.uid)).catch(() => {}); checkDeveloper(user); } }, 'Lock'),
          el('button', { type: 'button', class: 'small', onclick: async () => { await deleteDoc(doc(db, 'developerSessions', user.uid)).catch(() => {}); signOut(auth); } }, 'Sign out'))),
      el('p', {}, `Signed in as ${user.email}. Live configuration version ${version || '— (not saved yet; showing defaults)'}${live?.updatedAt ? `, last updated ${live.updatedAt.toDate().toLocaleString()}` : ''}.`),
      el('p', { class: 'small' }, 'Turning a feature off hides it in the college app and shows the upgrade message. It never deletes data and never changes who may do what — permissions are enforced by the database rules.'),
      el('div', { class: 'card' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Feature'), el('th', {}, 'Status'), el('th', {}, 'On / off'))), el('tbody', {}, rows)),
        el('label', { for: 'dc-url' }, 'Upgrade link shown with every locked feature (optional)'), urlInput,
        el('div', { class: 'save-bar row between' }, changedCount, saveBtn)),
      el('h2', {}, 'Recent changes'), el('div', { class: 'card' }, historyBox));
    refreshDirty();

    clearInterval(expiryTimer);
    const tick = () => {
      const left = expiresAtMs - Date.now();
      if (left <= 0) { clearInterval(expiryTimer); toast('Verification expired. Unlock again.', 'bad'); checkDeveloper(user); return; }
      timer.textContent = `Unlocked · ${Math.ceil(left / 60000)} min left`;
    };
    tick(); expiryTimer = setInterval(tick, 15_000);

    try {
      const hs = await getDocs(query(collection(db, 'featureFlagHistory'), orderBy('at', 'desc'), limit(10)));
      historyBox.replaceChildren(hs.empty ? el('p', { class: 'muted small' }, 'No changes yet.') : el('ul', {}, hs.docs.map((d) => {
        const x = d.data();
        return el('li', {}, `${x.at?.toDate().toLocaleString() ?? ''} — v${x.version} by ${x.byEmail ?? x.by}: ${(x.changes ?? []).join('; ') || 'messages/link updated'}`);
      })));
    } catch { historyBox.replaceChildren(el('p', { class: 'muted small' }, 'History could not be loaded.')); }
  }
}
