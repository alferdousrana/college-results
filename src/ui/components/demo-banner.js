import { h } from '../../core/dom.js';
import { tt } from '../../i18n/index.js';

/** Permanent label shown on every screen while the demo backend is active. */
export function demoBanner() {
  return h('div', { class: 'demo-banner', role: 'note' },
    h('strong', {}, tt('Demo mode', 'ডেমো মোড')), ' — ',
    tt('sample data stored only in this browser. Nothing here is real or saved to the college database.', 'নমুনা ডেটা শুধু এই ব্রাউজারে রাখা। এখানে কিছুই আসল নয় এবং কলেজের ডেটাবেসে সংরক্ষিত হয় না।'),
    ' ', h('a', { href: '#/demo' }, tt('Demo options', 'ডেমো অপশন')));
}
