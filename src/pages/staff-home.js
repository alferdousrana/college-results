/** Home page for staff accounts (office assistants and others who do not enter marks). */
import { h } from '../core/dom.js';
import { tt } from '../i18n/index.js';
import { getState } from '../core/store.js';
import { pageHeader } from '../ui/components/page.js';
import { hasGrant, Grant } from '../auth/roles.js';
import { greeting } from '../domain/deadline.js';
import { L } from '../i18n/index.js';

export function render() {
  const { profile } = getState();
  const tiles = [];
  if (hasGrant(profile, Grant.STUDENTS)) tiles.push(h('a', { class: 'subject-tile', style: '--tile:#0E6B57', href: '#/admin/students' },
    h('span', { class: 'subject-tile__name' }, tt('Students', 'শিক্ষার্থী')), h('span', { class: 'subject-tile__meta' }, tt('Add students, edit their details or import a list.', 'শিক্ষার্থী যোগ, তথ্য সম্পাদনা বা তালিকা ইমপোর্ট।'))));
  return h('section', { class: 'page' },
    pageHeader({ title: `${L(greeting())}, ${profile?.displayName ?? ''}`, subtitle: tt('What you can do here', 'এখানে আপনি যা করতে পারবেন') }),
    tiles.length ? h('ul', { class: 'subject-tiles' }, tiles.map((x) => h('li', {}, x)))
      : h('p', { class: 'notice' }, tt('The administrator has not given you any tasks yet.', 'প্রশাসক এখনো আপনাকে কোনো কাজের অনুমতি দেননি।')));
}
