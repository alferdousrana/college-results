import { h } from '../core/dom.js';
import { tt } from '../i18n/index.js';
import { backendKind, enableDemoMode, disableDemoMode } from '../data/backend/index.js';
import { isFirebaseConfigured } from '../core/config.js';
import { confirmDialog } from '../ui/components/dialog.js';
import { pageHeader, button } from '../ui/components/page.js';

export const title = 'setup.title';

export function render() {
  const page = h('section', { class: 'page page--narrow' }, pageHeader({ title: tt('Demo mode', 'ডেমো মোড') }));
  if (isFirebaseConfigured()) {
    page.append(h('p', { class: 'notice' }, tt('This copy is connected to the college database, so demo mode is switched off.', 'এই কপিটি কলেজের ডেটাবেসের সাথে যুক্ত, তাই ডেমো মোড বন্ধ।')));
    return page;
  }
  const on = backendKind() === 'demo';
  page.append(
    h('p', {}, tt('Demo mode lets you try every screen with invented sample data before the real database is connected. The data lives only in this browser and is never sent anywhere. Security rules are not applied in demo mode.',
      'ডেমো মোডে আসল ডেটাবেস যুক্ত হওয়ার আগে কাল্পনিক নমুনা ডেটা দিয়ে সব পর্দা ব্যবহার করে দেখতে পারবেন। ডেটা শুধু এই ব্রাউজারে থাকে, কোথাও পাঠানো হয় না। ডেমো মোডে নিরাপত্তা নিয়ম প্রযোজ্য নয়।')),
    h('div', { class: 'row-actions' },
      on ? button(tt('Reset sample data', 'নমুনা ডেটা নতুন করুন'), { onClick: async () => {
        if (!(await confirmDialog({ title: tt('Reset sample data?', 'নমুনা ডেটা নতুন করবেন?'), body: tt('All changes you made in demo mode are deleted.', 'ডেমো মোডে করা সব পরিবর্তন মুছে যাবে।'), danger: true, confirmText: tt('Reset', 'নতুন করুন') }))) return;
        const { resetDemo } = await import('../demo/seed.js'); await resetDemo(); localStorage.removeItem('crms.demo.db.v1'); location.hash = '#/login'; location.reload();
      } }) : null,
      on ? button(tt('Leave demo mode', 'ডেমো মোড বন্ধ করুন'), { onClick: () => { disableDemoMode(); location.hash = '#/'; location.reload(); } })
        : button(tt('Open demo mode', 'ডেমো মোড চালু করুন'), { kind: 'primary', onClick: () => { enableDemoMode(); location.hash = '#/login'; location.reload(); } })));
  return page;
}
