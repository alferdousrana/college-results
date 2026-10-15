/** Header bell: bounded live list of the signed-in user's notifications. */
import { h } from '../../core/dom.js';
import { tt, L } from '../../i18n/index.js';
import { fmtDate } from '../format.js';

const MESSAGES = {
  teacher_approved: (p) => tt('Your teacher account was approved.', 'আপনার শিক্ষক অ্যাকাউন্ট অনুমোদিত হয়েছে।'),
  exam_shared: (p) => tt('"{x}" is open for mark entry.', '"{x}" নম্বর প্রদানের জন্য খোলা হয়েছে।', { x: L(p.title) }),
  subject_submitted: (p) => tt('A subject was submitted in "{x}".', '"{x}"-এ একটি বিষয় জমা দেওয়া হয়েছে।', { x: L(p.title) }),
  result_published: (p) => tt('Results of "{x}" were published.', '"{x}"-এর ফলাফল প্রকাশিত হয়েছে।', { x: L(p.title) }),
  result_corrected: (p) => tt('A corrected result of "{x}" was published.', '"{x}"-এর সংশোধিত ফলাফল প্রকাশিত হয়েছে।', { x: L(p.title) }),
  result_correction: () => tt('A published result was reopened for correction.', 'একটি প্রকাশিত ফলাফল সংশোধনের জন্য খোলা হয়েছে।'),
  missing_marks: (p) => tt('Marks are still missing in "{x}".', '"{x}"-এ এখনো নম্বর বাকি আছে।', { x: L(p.title) }),
  feature_changed: () => tt('Feature availability changed.', 'সুবিধার প্রাপ্যতা পরিবর্তিত হয়েছে।'),
};

export function notificationBell(profile) {
  let items = [];
  const count = h('span', { class: 'bell__count', hidden: true });
  const panel = h('div', { class: 'bell__panel', hidden: true, role: 'region', 'aria-label': tt('Notifications', 'বিজ্ঞপ্তি') });
  const btn = h('button', { class: 'btn btn--ghost btn--sm bell', type: 'button', 'aria-expanded': 'false', 'aria-label': tt('Notifications', 'বিজ্ঞপ্তি') }, '🔔', count);
  const unread = () => items.filter((n) => !(n.readBy ?? []).includes(profile.id));
  const paint = () => {
    const u = unread().length;
    count.hidden = !u; count.textContent = String(u);
    panel.replaceChildren(items.length
      ? h('ul', { class: 'bell__list' }, items.map((n) => h('li', { class: (n.readBy ?? []).includes(profile.id) ? '' : 'is-unread' },
          h('a', { href: n.link ? `#${n.link}` : '#/', onclick: async () => { close(); const { markRead } = await import('../../data/repositories/notifications-repository.js'); markRead(n.id, profile.id).catch(() => {}); } },
            h('span', {}, (MESSAGES[n.type] ?? (() => n.type))(n.params ?? {})), h('small', { class: 'muted' }, fmtDate(n.createdAt, { time: true }))))))
      : h('p', { class: 'muted bell__empty' }, tt('No notifications.', 'কোনো বিজ্ঞপ্তি নেই।')));
  };
  const close = () => { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => { panel.hidden = !panel.hidden; btn.setAttribute('aria-expanded', String(!panel.hidden)); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  let unsub = null;
  import('../../data/repositories/notifications-repository.js')
    .then((m) => m.listenNotifications(profile, (list) => { items = list; paint(); }))
    .then((u) => { unsub = u; }).catch(() => {});
  paint();
  const el = h('div', { class: 'bell-wrap' }, btn, panel);
  return { el, dispose: () => unsub?.() };
}
