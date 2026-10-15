/** Reproduces the uploaded reference progress report (Class VIII, CA 30% + main exam 70%). */
const comp = () => [
  { id: 'ca', label: 'CA', maxMarks: 30, scale: 1 },
  { id: 'cq', label: 'CQ', maxMarks: 100, scale: 0.7 },
];
export const SUBJECTS = [
  'bangla', 'english', 'math', 'religion', 'hss', 'science', 'ict', 'wellbeing', 'life', 'art',
].map((id) => ({ id, name: id, components: comp() }));

const raw = {
  bangla: [28, 91], english: [27, 76], math: [30, 69], religion: [28, 86], hss: [28, 88],
  science: [28, 72], ict: [28, 81], wellbeing: [30, 96], life: [30, 80], art: [28, 69],
};
export const MARKS = Object.fromEntries(
  Object.entries(raw).map(([id, [ca, cq]]) => [id, { components: { ca, cq } }]),
);
export const EXPECTED = {
  totals: { bangla: 91.7, english: 80.2, math: 78.3, religion: 88.2, hss: 89.6, science: 78.4, ict: 84.7, wellbeing: 97.2, life: 86, art: 76.3 },
  grandTotal: 850.6,
  gpa: 4.7,
  grade: 'A',
};
