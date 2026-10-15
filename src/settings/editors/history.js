import { h } from '../../core/dom.js';
import { t, tt } from '../../i18n/index.js';
export function render(el) {
  el.append(h('ul', { class: 'link-list' },
    h('li', {}, h('a', { href: '#/admin/audit' }, t('nav.audit')), ' — ', tt('every approval, mark change, publication, correction and settings change', 'প্রতিটি অনুমোদন, নম্বর পরিবর্তন, প্রকাশ, সংশোধন ও সেটিংস পরিবর্তন')),
    h('li', {}, h('a', { href: '#/admin/archive' }, t('nav.archive')), ' — ', tt('published results from earlier years', 'আগের বছরের প্রকাশিত ফলাফল'))),
    h('p', { class: 'muted small' }, tt('History is written by the app at the same moment as each change and cannot be edited or deleted. It records who did what; it cannot protect against someone with full administrator access to the database itself.', 'ইতিহাস প্রতিটি পরিবর্তনের সাথে সাথেই লেখা হয় এবং সম্পাদনা বা মোছা যায় না। এটি কে কী করেছেন তা রাখে; তবে ডেটাবেসে পূর্ণ প্রশাসনিক প্রবেশাধিকার থাকা কারো বিরুদ্ধে সুরক্ষা দিতে পারে না।')));
}
