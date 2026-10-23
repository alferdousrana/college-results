/**
 * Single source of truth for Firestore collection names and deterministic document ids.
 * Deterministic ids are how duplicates are prevented without a server:
 *   examSessions/{yearId}__{classId}__{examDefId}          one session per class/year/exam
 *   classEnrollments/{yearId}__{classId}__{roll}           one roll per class/year
 *   examSessions/{sid}/enrollments/{studentId}             one enrollment per student per session
 *   examSessions/{sid}/sessionSubjects/{subjectId}/marks/{studentId}   one mark doc per student+subject
 */
export const C = Object.freeze({
  USERS: 'users',
  INSTITUTION: 'institution',
  SETTINGS: 'settings',
  YEARS: 'academicYears',
  CLASSES: 'classes',
  GROUPS: 'groups',
  SUBJECTS: 'subjects',
  EXAM_DEFS: 'examDefinitions',
  TEACHER_ASSIGNMENTS: 'teacherAssignments',
  STUDENTS: 'students',
  CLASS_ENROLLMENTS: 'classEnrollments',
  SESSIONS: 'examSessions',
  SHEETS: 'sheets',
  SESSION_SUBJECTS: 'sessionSubjects',
  MARKS: 'marks',
  ENROLLMENTS: 'enrollments',
  RESULTS: 'results',
  PUBLICATIONS: 'publications',
  PUBLIC_RESULTS: 'publicResults',
  PUBLIC_INDEX: 'publicExamIndex',
  AUDIT: 'auditLogs',
  FLAGS: 'featureFlags',
  NOTIFICATIONS: 'notifications',
  STAFF: 'staff',
  STUDENT_HISTORY: 'publishedResults', // students/{id}/publishedResults/{sessionId}
});

export const SETTINGS_DOCS = Object.freeze({
  GRADING: 'grading',           // scale + calculation policy (current, editable)
  PUBLICATION: 'publication',   // lookup verifier, visible fields
  PRINT: 'print',               // fonts, sizes, borders, signature placement
  STUDENT_FIELDS: 'studentFields',
  RETENTION: 'retention',
  INTERFACE: 'interface',
  TEACHER_FIELDS: 'teacherFields',
});

const SAFE = /^[A-Za-z0-9_-]{1,64}$/;
function part(v, name) {
  const s = String(v ?? '');
  if (!SAFE.test(s)) throw new Error(`Invalid ${name}: "${s}"`);
  return s;
}

export const ids = {
  session: (yearId, classId, examDefId) => `${part(yearId, 'yearId')}__${part(classId, 'classId')}__${part(examDefId, 'examDefId')}`,
  classEnrollment: (yearId, classId, roll) => `${part(yearId, 'yearId')}__${part(classId, 'classId')}__${part(roll, 'roll')}`,
  teacherAssignment: (teacherId, subjectId, classId) => `${part(teacherId, 'teacherId')}__${part(subjectId, 'subjectId')}__${part(classId, 'classId')}`,
  slug: (text) => String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'item',
};

/** String paths used with the backend interface (data/backend/index.js). */
export const paths = {
  user: (uid) => `${C.USERS}/${uid}`,
  setting: (name) => `${C.SETTINGS}/${name}`,
  student: (id) => `${C.STUDENTS}/${id}`,
  studentHistory: (id) => `${C.STUDENTS}/${id}/${C.STUDENT_HISTORY}`,
  classEnrollment: (yearId, classId, roll) => `${C.CLASS_ENROLLMENTS}/${ids.classEnrollment(yearId, classId, roll)}`,
  session: (sid) => `${C.SESSIONS}/${sid}`,
  sheets: (sid) => `${C.SESSIONS}/${sid}/${C.SHEETS}`,
  sessionSubjects: (sid) => `${C.SESSIONS}/${sid}/${C.SESSION_SUBJECTS}`,
  sessionSubject: (sid, subjectId) => `${C.SESSIONS}/${sid}/${C.SESSION_SUBJECTS}/${subjectId}`,
  enrollments: (sid) => `${C.SESSIONS}/${sid}/${C.ENROLLMENTS}`,
  results: (sid) => `${C.SESSIONS}/${sid}/${C.RESULTS}`,
  publications: (sid) => `${C.SESSIONS}/${sid}/${C.PUBLICATIONS}`,
  marks: (sid, subjectId) => `${C.SESSIONS}/${sid}/${C.SESSION_SUBJECTS}/${subjectId}/${C.MARKS}`,
  mark: (sid, subjectId, studentId) => `${C.SESSIONS}/${sid}/${C.SESSION_SUBJECTS}/${subjectId}/${C.MARKS}/${studentId}`,
};
