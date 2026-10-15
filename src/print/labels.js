/** Printed-document vocabulary. Independent of the interface language. */
export const PRINT_LABELS = {
  en: {
    progressReport: 'Progress Report', resultSheet: 'Result Sheet', studentName: "Student's Name", fatherName: "Father's Name", motherName: "Mother's Name",
    studentId: 'Student ID', examination: 'Examination', year: 'Year', class: 'Class', group: 'Group', section: 'Section', shift: 'Shift', roll: 'Roll',
    examHeld: 'Exam Held', subject: 'Subject', fullMarks: 'Full Marks', highest: 'Highest Marks', obtained: 'Obtained Marks', total: 'Total',
    totalMarks: 'Total Marks', gradePoint: 'Grade Point', letterGrade: 'Letter Grade', grade: 'Grade', gpa: 'GPA', status: 'Result', position: 'Merit Position',
    of: 'of', range: 'Range', pass: 'PASSED', fail: 'FAILED', incomplete: 'INCOMPLETE', optional: 'Optional', absent: 'Absent', name: 'Name',
    merit: 'Merit', page: 'Page', printed: 'Printed', marks: 'Marks', gp: 'GP', papers: { '1st': '1st', '2nd': '2nd' }, seal: 'Seal',
  },
  bn: {
    progressReport: 'অগ্রগতি প্রতিবেদন', resultSheet: 'ফলাফল শিট', studentName: 'শিক্ষার্থীর নাম', fatherName: 'পিতার নাম', motherName: 'মাতার নাম',
    studentId: 'শিক্ষার্থী আইডি', examination: 'পরীক্ষা', year: 'বছর', class: 'শ্রেণি', group: 'বিভাগ', section: 'শাখা', shift: 'শিফট', roll: 'রোল',
    examHeld: 'পরীক্ষার সময়', subject: 'বিষয়', fullMarks: 'পূর্ণমান', highest: 'সর্বোচ্চ নম্বর', obtained: 'প্রাপ্ত নম্বর', total: 'মোট',
    totalMarks: 'মোট নম্বর', gradePoint: 'গ্রেড পয়েন্ট', letterGrade: 'লেটার গ্রেড', grade: 'গ্রেড', gpa: 'জিপিএ', status: 'ফলাফল', position: 'মেধাস্থান',
    of: 'এর মধ্যে', range: 'নম্বরের সীমা', pass: 'উত্তীর্ণ', fail: 'অনুত্তীর্ণ', incomplete: 'অসম্পূর্ণ', optional: 'ঐচ্ছিক', absent: 'অনুপস্থিত', name: 'নাম',
    merit: 'মেধা', page: 'পৃষ্ঠা', printed: 'মুদ্রণ', marks: 'নম্বর', gp: 'জিপি', papers: { '1st': '১ম', '2nd': '২য়' }, seal: 'সিল',
  },
};

const BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
/** Number formatting for print: Bangla marksheets use Bangla digits. */
export function pnum(v, lang, dp = null) {
  if (v == null || v === '') return '';
  if (v === 'AB') return lang === 'bn' ? 'অনু' : 'AB';
  const s = typeof v === 'number' && dp != null ? v.toFixed(dp) : String(v);
  return lang === 'bn' ? s.replace(/\d/g, (d) => BN[d]) : s;
}

export function pick(value, lang) {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  return value[lang] || value.en || value.bn || '';
}
