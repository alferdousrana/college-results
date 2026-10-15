/** Sample marksheet data for the print-design preview (clearly labelled as sample). */
import { computeResultSheet, DEFAULT_POLICY, REFERENCE_SCALE_5 } from '../domain/calculation/index.js';
import { buildStudentViewModel } from './view-models.js';

const c = (id, type, label, maxMarks, passMarks, paper = null) => ({ id, type, label, maxMarks, passMarks, scale: 1, paper });
const SUBJECTS = [
  { id: 'bangla', name: { en: 'Bangla', bn: 'বাংলা' }, components: [c('p1_cq', 'CQ', 'CQ', 70, 23, '1st'), c('p1_mcq', 'MCQ', 'MCQ', 30, 10, '1st'), c('p2_cq', 'CQ', 'CQ', 70, 23, '2nd'), c('p2_mcq', 'MCQ', 'MCQ', 30, 10, '2nd')] },
  { id: 'english', name: { en: 'English', bn: 'ইংরেজি' }, components: [c('p1', 'CQ', '1st paper', 100, 33, '1st'), c('p2', 'CQ', '2nd paper', 100, 33, '2nd')] },
  { id: 'physics', name: { en: 'Physics', bn: 'পদার্থবিজ্ঞান' }, components: [c('cq', 'CQ', 'CQ', 50, 17), c('mcq', 'MCQ', 'MCQ', 25, 8), c('prac', 'PRACTICAL', 'Practical', 25, 8)] },
  { id: 'ict', name: { en: 'ICT', bn: 'আইসিটি' }, components: [c('cq', 'CQ', 'CQ', 50, 17), c('mcq', 'MCQ', 'MCQ', 25, 8), c('prac', 'PRACTICAL', 'Practical', 25, 8)] },
  { id: 'biology', name: { en: 'Biology', bn: 'জীববিজ্ঞান' }, components: [c('cq', 'CQ', 'CQ', 50, 17), c('mcq', 'MCQ', 'MCQ', 25, 8), c('prac', 'PRACTICAL', 'Practical', 25, 8)] },
];
const MARKS = {
  a: { bangla: [60, 26, 55, 24], english: [78, 71], physics: [41, 20, 23], ict: [44, 21, 24], biology: [39, 19, 22] },
  b: { bangla: [52, 22, 48, 20], english: [65, 60], physics: [30, 7, 20], ict: [35, 18, 22], biology: [31, 15, 20] },
  c: { bangla: [66, 28, 60, 27], english: [85, 80], physics: [46, 23, 24], ict: [47, 23, 25], biology: [44, 22, 24] },
};

export function sampleData({ scale = REFERENCE_SCALE_5, policy = DEFAULT_POLICY } = {}) {
  const students = [['a', '101', 'Sample Student One', 'নমুনা শিক্ষার্থী এক'], ['b', '102', 'Sample Student Two', 'নমুনা শিক্ষার্থী দুই'], ['c', '103', 'Sample Student Three', 'নমুনা শিক্ষার্থী তিন']];
  const marks = Object.fromEntries(students.map(([id]) => [id, Object.fromEntries(SUBJECTS.map((s) => [s.id, { components: Object.fromEntries(s.components.map((k, i) => [k.id, MARKS[id][s.id][i]])) }]))]));
  const sheet = computeResultSheet({ students: students.map(([id, roll]) => ({ studentId: id, roll, groupId: 'science', optionalSubjectId: 'biology' })), subjectsByGroup: { science: SUBJECTS }, marks, policy, scale });
  const defs = Object.fromEntries(SUBJECTS.map((s) => [s.id, s]));
  const exam = { title: { en: 'Annual Examination 2026 (sample)', bn: 'বার্ষিক পরীক্ষা ২০২৬ (নমুনা)' }, yearLabel: '2026', examName: { en: 'Annual Examination', bn: 'বার্ষিক পরীক্ষা' }, classLabel: { en: 'Class Eleven', bn: 'একাদশ শ্রেণি' }, groupLabel: { en: 'Science', bn: 'বিজ্ঞান' }, heldOn: 'Dec-2026' };
  const vms = sheet.rows.map((row) => {
    const st = students.find((x) => x[0] === row.studentId);
    return buildStudentViewModel({ exam, enrollment: { roll: st[1], name: { en: st[2], bn: st[3] }, groupId: 'science', section: 'A', shift: 'Day' },
      student: { fatherName: 'Sample Father', motherName: 'Sample Mother', studentCode: 'S26SAMPLE' }, defs, row, highest: sheet.highestByGroup.science });
  });
  return { vms, subjects: SUBJECTS, exam };
}
