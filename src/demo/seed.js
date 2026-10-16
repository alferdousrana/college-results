/**
 * Demo data (DEMO MODE ONLY). Invented names; a fictional institution. Created through the real
 * repositories so the demo exercises the same code paths as production.
 */
import { C, paths, SETTINGS_DOCS } from '../data/paths.js';
import { serverTime } from '../data/field-ops.js';

export const DEMO_ADMIN = { id: 'demo-admin', role: 'super_admin', displayName: 'Demo Administrator' };
export const DEMO_PERSONAS = [
  { id: 'demo-admin', label: 'Demo Administrator (Super Admin)' },
  { id: 'demo-t-bangla', label: 'Rahima Begum — Bangla, English' },
  { id: 'demo-t-science', label: 'Kamal Hossain — Physics, Chemistry, Higher Math' },
  { id: 'demo-t-bio', label: 'Nasrin Akter — Biology, ICT, Agriculture' },
  { id: 'demo-t-hum', label: 'Abdur Rahman — Humanities & Business subjects' },
  { id: 'demo-t-pending', label: 'Sumon Das — pending approval' },
];

const comp = (id, type, label, maxMarks, passMarks, paper = null) => ({ id, type, label, maxMarks, passMarks, scale: 1, required: true, enabled: true, paper });
const cqMcq = () => [comp('cq', 'CQ', 'CQ', 70, 23), comp('mcq', 'MCQ', 'MCQ', 30, 10)];
const cqMcqPr = () => [comp('cq', 'CQ', 'CQ', 50, 17), comp('mcq', 'MCQ', 'MCQ', 25, 8), comp('prac', 'PRACTICAL', 'Practical', 25, 8)];
const papers = () => [comp('p1_cq', 'CQ', 'CQ', 70, 23, '1st'), comp('p1_mcq', 'MCQ', 'MCQ', 30, 10, '1st'), comp('p2_cq', 'CQ', 'CQ', 70, 23, '2nd'), comp('p2_mcq', 'MCQ', 'MCQ', 30, 10, '2nd')];
const written = () => [comp('p1', 'CQ', '1st paper', 100, 33, '1st'), comp('p2', 'CQ', '2nd paper', 100, 33, '2nd')];

const SUBJECTS = [
  ['bangla', 'Bangla', 'বাংলা', '101', papers, ['science', 'humanities', 'business']],
  ['english', 'English', 'ইংরেজি', '107', written, ['science', 'humanities', 'business']],
  ['ict', 'ICT', 'তথ্য ও যোগাযোগ প্রযুক্তি', '275', cqMcqPr, ['science', 'humanities', 'business']],
  ['physics', 'Physics', 'পদার্থবিজ্ঞান', '174', cqMcqPr, ['science']],
  ['chemistry', 'Chemistry', 'রসায়ন', '176', cqMcqPr, ['science']],
  ['biology', 'Biology', 'জীববিজ্ঞান', '178', cqMcqPr, ['science']],
  ['higher-math', 'Higher Mathematics', 'উচ্চতর গণিত', '265', cqMcqPr, ['science']],
  ['economics', 'Economics', 'অর্থনীতি', '109', cqMcq, ['humanities']],
  ['civics', 'Civics', 'পৌরনীতি', '269', cqMcq, ['humanities']],
  ['sociology', 'Sociology', 'সমাজবিজ্ঞান', '117', cqMcq, ['humanities']],
  ['islamic-history', 'Islamic History', 'ইসলামের ইতিহাস', '267', cqMcq, ['humanities']],
  ['accounting', 'Accounting', 'হিসাববিজ্ঞান', '253', cqMcq, ['business']],
  ['business-org', 'Business Organisation', 'ব্যবসায় সংগঠন', '277', cqMcq, ['business']],
  ['finance', 'Finance & Banking', 'ফিন্যান্স ও ব্যাংকিং', '292', cqMcq, ['business']],
  ['agriculture', 'Agriculture', 'কৃষিশিক্ষা', '239', cqMcqPr, ['science', 'humanities', 'business']],
];
const TEACH = { 'demo-t-bangla': ['bangla', 'english'], 'demo-t-science': ['physics', 'chemistry', 'higher-math'], 'demo-t-bio': ['biology', 'ict', 'agriculture'],
  'demo-t-hum': ['economics', 'civics', 'sociology', 'islamic-history', 'accounting', 'business-org', 'finance'] };
const NAMES = [
  ['Ayesha Siddika', 'আয়েশা সিদ্দিকা'], ['Farhana Islam', 'ফারহানা ইসলাম'], ['Mitu Rani', 'মিতু রানী'], ['Sadia Afrin', 'সাদিয়া আফরিন'],
  ['Tania Sultana', 'তানিয়া সুলতানা'], ['Rumana Haque', 'রুমানা হক'], ['Nusrat Jahan', 'নুসরাত জাহান'], ['Puja Mistry', 'পূজা মিস্ত্রি'],
  ['Shirin Akter', 'শিরিন আক্তার'], ['Lamia Rahman', 'লামিয়া রহমান'], ['Sharmin Nahar', 'শারমিন নাহার'], ['Tonni Biswas', 'তন্বী বিশ্বাস'],
  ['Mim Chowdhury', 'মিম চৌধুরী'], ['Riya Halder', 'রিয়া হালদার'], ['Sumaiya Khan', 'সুমাইয়া খান'], ['Jannatul Ferdous', 'জান্নাতুল ফেরদৌস'],
  ['Ishrat Jahan', 'ইশরাত জাহান'], ['Brishti Das', 'বৃষ্টি দাস'], ['Nadia Kabir', 'নাদিয়া কবির'], ['Rupa Sarkar', 'রূপা সরকার'],
  ['Shila Mondal', 'শিলা মণ্ডল'], ['Afia Anjum', 'আফিয়া আঞ্জুম'], ['Kakoli Roy', 'কাকলী রায়'], ['Moumita Paul', 'মৌমিতা পাল'],
];

function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

export async function ensureDemoSeed(backend) {
  if (await backend.get('system/demoSeed')) return;
  const now = serverTime();
  const w = backend.batch();
  w.set('system/demoSeed', { createdAt: now });
  w.set(`${C.INSTITUTION}/public`, {
    name: { en: 'Demo Model School & College', bn: 'ডেমো মডেল স্কুল অ্যান্ড কলেজ' },
    address: { en: 'College Road, Demo Town', bn: 'কলেজ রোড, ডেমো টাউন' }, phone: '01700-000000', email: 'office@demo.invalid', website: '', eiin: '000000',
    header: { en: '', bn: '' }, footer: { en: 'This is a demonstration marksheet.', bn: 'এটি একটি নমুনা মার্কশিট।' },
    signatories: {
      principal: { name: { en: 'Demo Principal', bn: 'ডেমো অধ্যক্ষ' }, title: { en: 'Principal', bn: 'অধ্যক্ষ' } },
      committee: { name: { en: 'Demo Convener', bn: 'ডেমো আহ্বায়ক' }, title: { en: 'Convener, Examination Committee', bn: 'আহ্বায়ক, পরীক্ষা কমিটি' } },
      classTeacher: { name: { en: '', bn: '' }, title: { en: 'Class Teacher', bn: 'শ্রেণি শিক্ষক' } },
    },
    assets: {},
  });
  const users = [
    ['demo-admin', 'Demo Administrator', 'super_admin', 'active'], ['demo-t-bangla', 'Rahima Begum', 'teacher', 'active'],
    ['demo-t-science', 'Kamal Hossain', 'teacher', 'active'], ['demo-t-bio', 'Nasrin Akter', 'teacher', 'active'],
    ['demo-t-hum', 'Abdur Rahman', 'teacher', 'active'], ['demo-t-pending', 'Sumon Das', 'teacher', 'pending'],
  ];
  users.forEach(([id, name, role, status], i) => w.set(paths.user(id), { displayName: name, email: `${id}@demo.invalid`, role, status, phone: null, requestNote: status === 'pending' ? 'I teach Bangla in classes 9 and 10.' : null, createdAt: Date.now() - (10 - i) * 86400000, updatedAt: now }));
  w.set(`${C.YEARS}/2025`, { label: '2025', order: 2025, active: false });
  w.set(`${C.YEARS}/2026`, { label: '2026', order: 2026, active: true });
  [['class-9', 'Class Nine', 'নবম শ্রেণি', 9, ['science', 'humanities', 'business']], ['class-10', 'Class Ten', 'দশম শ্রেণি', 10, ['science', 'humanities', 'business']], ['class-11', 'Class Eleven', 'একাদশ শ্রেণি', 11, ['science', 'humanities', 'business']]]
    .forEach(([id, en, bn, order, groupIds]) => w.set(`${C.CLASSES}/${id}`, { name: { en, bn }, order, groupIds, active: true }));
  [['science', 'Science', 'বিজ্ঞান', 1], ['humanities', 'Humanities', 'মানবিক', 2], ['business', 'Business Studies', 'ব্যবসায় শিক্ষা', 3]]
    .forEach(([id, en, bn, order]) => w.set(`${C.GROUPS}/${id}`, { name: { en, bn }, order, active: true }));
  [['half-yearly', 'Half-Yearly Examination', 'অর্ধবার্ষিক পরীক্ষা', 1], ['annual', 'Annual Examination', 'বার্ষিক পরীক্ষা', 2], ['test', 'Test Examination', 'নির্বাচনী পরীক্ষা', 3]]
    .forEach(([id, en, bn, order]) => w.set(`${C.EXAM_DEFS}/${id}`, { name: { en, bn }, order, active: true }));
  SUBJECTS.forEach(([id, en, bn, code, mk, groupIds], i) => w.set(`${C.SUBJECTS}/${id}`, {
    name: { en, bn }, code, order: i + 1, components: mk(), passMarks: null, classIds: ['class-11'], groupIds, active: true,
    optionalEligible: ['agriculture', 'biology', 'higher-math'].includes(id), countsTowardGpa: true, countsTowardTotal: true,
  }));
  for (const [tid, subs] of Object.entries(TEACH)) for (const s of subs) w.set(`${C.TEACHER_ASSIGNMENTS}/${tid}__${s}__class-11`, { teacherId: tid, teacherName: users.find((u) => u[0] === tid)[1], subjectId: s, classId: 'class-11' });
  w.set(paths.setting(SETTINGS_DOCS.STUDENT_FIELDS), { fields: [
    { key: 'bloodGroup', label: { en: 'Blood group', bn: 'রক্তের গ্রুপ' }, type: 'select', options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'], required: false, enabled: true, order: 1, showOnRecord: true, showOnMarksheet: false, showOnSheet: false },
    { key: 'guardianPhone', label: { en: 'Guardian phone', bn: 'অভিভাবকের ফোন' }, type: 'text', required: false, enabled: true, order: 2, showOnRecord: true, showOnMarksheet: false, showOnSheet: false },
  ], revision: 1 });
  await w.commit();

  const { saveStudent } = await import('../data/repositories/students-repository.js');
  const plan = [['science', 101, 10], ['humanities', 201, 8], ['business', 401, 6]];
  let n = 0;
  const studentIds = [];
  for (const [groupId, start, count] of plan) {
    for (let i = 0; i < count; i++) {
      const [en, bn] = NAMES[n++ % NAMES.length];
      const id = await saveStudent(DEMO_ADMIN, null, {
        nameEn: en, nameBn: bn, fatherName: `Father of ${en.split(' ')[0]}`, motherName: `Mother of ${en.split(' ')[0]}`,
        dob: `2009-0${(i % 9) + 1}-1${i % 9}`, current: { yearId: '2026', classId: 'class-11', groupId, roll: String(start + i),
        },
        customFields: { bloodGroup: ['A+', 'B+', 'O+'][i % 3] },
      });
      studentIds.push({ id, groupId, roll: String(start + i), en, bn });
    }
  }
  await seedExam(backend, studentIds, 'half-yearly', { fill: 1, publish: true });
  await seedExam(backend, studentIds, 'annual', { fill: 0.7, publish: false });
  backend._flush?.();
}

async function seedExam(backend, students, examDefId, { fill, publish }) {
  const { saveDraft, shareWithTeachers, transitionSession } = await import('../data/repositories/sessions-repository.js');
  const { createMarkTransport } = await import('../data/repositories/marks-repository.js');
  const { publishResults } = await import('../data/repositories/results-repository.js');
  const subjects = (await backend.list(C.SUBJECTS, { orderBy: [['order', 'asc']] })).items;
  const teacherOf = (sid) => Object.entries(TEACH).filter(([, s]) => s.includes(sid)).map(([t]) => t);
  // Science: Higher Mathematics or Biology as the main subject, the other (or Agriculture) as 4th. Others: Agriculture as 4th.
  const roles = { science: { 'higher-math': 'choice', biology: 'choice', agriculture: 'fourth' }, humanities: { agriculture: 'fourth' }, business: { agriculture: 'fourth' } };
  const groups = ['science', 'humanities', 'business'].map((g) => ({ groupId: g, subjectIds: subjects.filter((s) => s.groupIds.includes(g)).map((s) => s.id),
    subjectRoles: roles[g], choiceCount: g === 'science' ? 1 : 0, requiresFourth: true }));
  const choicesOf = (st) => {
    if (st.groupId !== 'science') return { subjectIds: ['agriculture'], optionalSubjectId: 'agriculture' };
    const main = Number(st.roll) % 2 ? 'higher-math' : 'biology';
    const fourth = main === 'biology' ? 'higher-math' : 'biology';
    return { subjectIds: [main, fourth], optionalSubjectId: fourth };
  };
  const title = examDefId === 'annual' ? { en: 'Annual Examination 2026', bn: 'বার্ষিক পরীক্ষা ২০২৬' } : { en: 'Half-Yearly Examination 2026', bn: 'অর্ধবার্ষিক পরীক্ষা ২০২৬' };
  const sid = await saveDraft(DEMO_ADMIN, null, {
    yearId: '2026', classId: 'class-11', examDefId, title, heldOn: examDefId === 'annual' ? '2026-11-10' : '2026-06-15', groups,
    subjects: subjects.map((s) => ({ subjectId: s.id, definition: { name: s.name, code: s.code, order: s.order, components: s.components, passMarks: s.passMarks, countsTowardGpa: true, countsTowardTotal: true }, teacherIds: teacherOf(s.id) })),
    roster: students.map((s) => ({ studentId: s.id, roll: s.roll, name: { en: s.en, bn: s.bn }, groupId: s.groupId, ...choicesOf(s) })),
  });
  const teachers = Object.fromEntries(Object.keys(TEACH).map((t) => [t, { status: 'active' }]));
  await shareWithTeachers(DEMO_ADMIN, sid, teachers);
  const rand = rng(examDefId === 'annual' ? 7 : 3);
  const transport = createMarkTransport(DEMO_ADMIN);
  for (const st of students) {
    for (const g of groups.filter((x) => x.groupId === st.groupId)) {
      const c = choicesOf(st);
      for (const subId of g.subjectIds.filter((id) => !g.subjectRoles[id] || c.subjectIds.includes(id))) {
        if (rand() > fill) continue;
        const def = subjects.find((s) => s.id === subId);
        const ability = 0.45 + (Number(st.roll) % 7) * 0.075;
        const components = Object.fromEntries(def.components.map((c) => [c.id, Math.min(c.maxMarks, Math.round(c.maxMarks * Math.min(1, ability + (rand() - 0.5) * 0.3)))]));
        const absent = examDefId === 'annual' && st.roll === '104' && subId === 'chemistry';
        await transport({ path: { sessionId: sid, subjectId: subId, studentId: st.id }, payload: { components: absent ? {} : components, absent }, baseVersion: 0, updatedAt: Date.now() });
      }
    }
  }
  await transitionSession(DEMO_ADMIN, sid, 'mark_entry_in_progress').catch(() => {});
  if (publish) {
    for (const s of subjects) await backend.update(paths.sessionSubject(sid, s.id), { submission: { state: 'submitted', by: teacherOf(s.id)[0] } });
    await transitionSession(DEMO_ADMIN, sid, 'submitted');
    await transitionSession(DEMO_ADMIN, sid, 'under_review');
    await publishResults(DEMO_ADMIN, sid);
  }
}

export async function resetDemo() {
  const { getBackend } = await import('../data/backend/index.js');
  const b = await getBackend();
  b._reset({});
  localStorage.removeItem('crms.demo.session');
}
