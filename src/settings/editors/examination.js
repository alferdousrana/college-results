import { h } from '../../core/dom.js';
import { t, tt } from '../../i18n/index.js';
export function render(el) {
  el.append(h('ul', { class: 'link-list' },
    h('li', {}, h('a', { href: '#/admin/classes' }, t('nav.classes')), ' — ', tt('academic years, classes, groups and examination names', 'শিক্ষাবর্ষ, শ্রেণি, বিভাগ ও পরীক্ষার নাম')),
    h('li', {}, h('a', { href: '#/admin/subjects' }, t('nav.subjects')), ' — ', tt('subjects and their CQ / MCQ / practical components', 'বিষয় ও তাদের সৃজনশীল / বহুনির্বাচনি / ব্যবহারিক অংশ')),
    h('li', {}, h('a', { href: '#/admin/assignments' }, t('nav.assignments')), ' — ', tt('which teacher teaches which subject', 'কোন শিক্ষক কোন বিষয় পড়ান'))));
}
