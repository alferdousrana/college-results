/** Sample marksheet data for the print-design preview (clearly labelled as sample). */
import { computeResultSheet, DEFAULT_POLICY, REFERENCE_SCALE_5 } from '../domain/calculation/index.js';
import { buildStudentViewModel } from './view-models.js';

const c = (id, type, label, maxMarks, passMarks, paper = null) => ({ id, type, label, maxMarks, passMarks, scale: 1, paper });
const comb = (key, en, bn, paper) => ({ key, name: { en, bn }, paper });
const SUBJECTS = [
  { id: 'bangla1', name: { en: 'Bangla 1st Paper', bn: 'বাংলা ১ম পত্র' }, combine: comb('bangla', 'Bangla', 'বাংলা', '1st'), components: [c('cq', 'CQ', 'CQ', 70, 23), c('mcq', 'MCQ', 'MCQ', 30, 10)] },
  { id: 'bangla2', name: { en: 'Bangla 2nd Paper', bn: 'বাংলা ২য় পত্র' }, combine: comb('bangla', 'Bangla', 'বাংলা', '2nd'), components: [c('cq', 'CQ', 'CQ', 70, 23), c('mcq', 'MCQ', 'MCQ', 30, 10)] },
  { id: 'english1', name: { en: 'English 1st Paper', bn: 'ইংরেজি ১ম পত্র' }, combine: comb('english', 'English', 'ইংরেজি', '1st'), components: [c('w', 'CQ', 'Written', 100, 33)] },
  { id: 'english2', name: { en: 'English 2nd Paper', bn: 'ইংরেজি ২য় পত্র' }, combine: comb('english', 'English', 'ইংরেজি', '2nd'), components: [c('w', 'CQ', 'Written', 100, 33)] },
  { id: 'ict', name: { en: 'ICT', bn: 'তথ্য ও যোগাযোগ প্রযুক্তি' }, components: [c('cq', 'CQ', 'CQ', 50, 17), c('mcq', 'MCQ', 'MCQ', 25, 8), c('prac', 'PRACTICAL', 'Practical', 25, 8)] },
  { id: 'physics', name: { en: 'Physics', bn: 'পদার্থবিজ্ঞান' }, components: [c('cq', 'CQ', 'CQ', 50, 17), c('mcq', 'MCQ', 'MCQ', 25, 8), c('prac', 'PRACTICAL', 'Practical', 25, 8)] },
  { id: 'biology', name: { en: 'Biology', bn: 'জীববিজ্ঞান' }, components: [c('cq', 'CQ', 'CQ', 50, 17), c('mcq', 'MCQ', 'MCQ', 25, 8), c('prac', 'PRACTICAL', 'Practical', 25, 8)] },
];
const MARKS = {
  a: { bangla1: [60, 26], bangla2: [55, 24], english1: [78], english2: [71], ict: [44, 21, 24], physics: [41, 20, 23], biology: [39, 19, 22] },
  b: { bangla1: [52, 22], bangla2: [48, 20], english1: [65], english2: [60], ict: [35, 18, 22], physics: [30, 7, 20], biology: [31, 15, 20] },
  c: { bangla1: [66, 28], bangla2: [60, 27], english1: [85], english2: [80], ict: [47, 23, 25], physics: [46, 23, 24], biology: [44, 22, 24] },
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
