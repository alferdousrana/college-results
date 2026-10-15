/**
 * Global search (Ctrl/⌘+K or the header search button): jumps to pages, recent result sheets
 * and — for administrators — students by student ID.
 */
import { h } from '../../core/dom.js';
import { t, tt, L } from '../../i18n/index.js';
import { getState } from '../../core/store.js';
import { ROUTES } from '../../app/routes.js';
import { openModal } from './modal.js';

export function openSearch() {
  const input = h('input', { class: 'input', type: 'search', placeholder: tt('Type a page, exam or student ID…', 'পৃষ্ঠা, পরীক্ষা বা শিক্ষার্থী আইডি লিখুন…'), 'aria-label': tt('Search', 'খুঁজুন') });
  const list = h('ul', { class: 'search-results', role: 'listbox' });
  const { profile } = getState();
  const role = profile?.status === 'active' ? profile.role : 'public';
  const pages = ROUTES.filter((r) => r.nav && r.navFor?.includes(role)).map((r) => ({ label: t(r.nav), href: `#${r.path}` }));
  let sessions = [];
  (async () => {
    try {
      const repo = await import('../../data/repositories/sessions-repository.js');
      sessions = role === 'super_admin' ? await repo.listSessions({ limit: 30 }) : role === 'teacher' ? await repo.listTeacherSessions(profile.id, 30) : [];
      render();
    } catch { /* offline or not configured */ }
  })();
  const render = async () => {
    const q = input.value.trim().toLowerCase();
    const results = [
      ...pages.filter((p) => !q || p.label.toLowerCase().includes(q)),
      ...sessions.filter((s) => q && L(s.title).toLowerCase().includes(q)).map((s) => ({ label: `${L(s.title)} — ${t(`exam.state.${s.state}`)}`,
        href: role === 'super_admin' ? `#/admin/sheet?sid=${encodeURIComponent(s.id)}` : `#/teacher/exam?sid=${encodeURIComponent(s.id)}` })),
    ];
    list.replaceChildren(...results.slice(0, 12).map((r) => h('li', {}, h('a', { href: r.href, onclick: () => m.close() }, r.label))));
    if (role === 'super_admin' && /^s\w{4,}$/i.test(q)) {
      const { findStudentByCode } = await import('../../data/repositories/students-repository.js');
      const st = await findStudentByCode(q.toUpperCase()).catch(() => null);
      if (st) list.prepend(h('li', {}, h('a', { href: `#/admin/students?student=${encodeURIComponent(st.id)}`, onclick: () => m.close() }, `${st.nameEn} (${st.studentCode})`)));
    }
    if (!list.children.length) list.append(h('li', { class: 'muted' }, tt('No matches.', 'কিছু পাওয়া যায়নি।')));
  };
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') list.querySelector('a')?.click(); });
  const m = openModal({ title: tt('Search', 'খুঁজুন'), content: h('div', {}, input, list), size: 's' });
  render();
}

export function initSearchShortcut() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && getState().authUser) { e.preventDefault(); openSearch(); }
  });
}
