/**
 * Settings sections: where their data lives and who may change them.
 * Editors live in src/settings/editors/{id}.js and export render(container, ctx).
 */
import { tt } from '../i18n/index.js';

export const SETTINGS_SECTIONS = () => [
  { id: 'appearance', label: tt('Appearance and language', 'চেহারা ও ভাষা'), desc: tt('Language, theme, table density and text size on this device.', 'এই ডিভাইসের ভাষা, থিম, টেবিলের ঘনত্ব ও লেখার আকার।'), admin: false, store: 'device + users/{uid}.prefs' },
  { id: 'institution', label: tt('Institution', 'প্রতিষ্ঠান'), desc: tt('Name, address, logo, signatures, seal, header and footer.', 'নাম, ঠিকানা, লোগো, স্বাক্ষর, সিল, শিরোনাম ও পাদটীকা।'), admin: true, store: 'institution/public' },
  { id: 'studentFields', label: tt('Student fields', 'শিক্ষার্থীর তথ্যঘর'), desc: tt('Extra information you keep about students.', 'শিক্ষার্থীদের বিষয়ে অতিরিক্ত তথ্য।'), admin: true, store: 'settings/studentFields', feature: 'custom_student_fields' },
  { id: 'examination', label: tt('Examinations', 'পরীক্ষা'), desc: tt('Years, classes, groups, examination names and subjects.', 'বছর, শ্রেণি, বিভাগ, পরীক্ষার নাম ও বিষয়।'), admin: true, store: 'academicYears, classes, groups, examDefinitions, subjects' },
  { id: 'grading', label: tt('Grades and pass rules', 'গ্রেড ও পাসের নিয়ম'), desc: tt('Grade ranges, grade points, GPA, rounding, optional subject and merit positions.', 'গ্রেড সীমা, গ্রেড পয়েন্ট, জিপিএ, রাউন্ডিং, ঐচ্ছিক বিষয় ও মেধাস্থান।'), admin: true, store: 'settings/grading' },
  { id: 'print', label: tt('Print design', 'মুদ্রণ নকশা'), desc: tt('Fonts, sizes, borders, logo and signature placement, margins and visible fields.', 'ফন্ট, আকার, বর্ডার, লোগো ও স্বাক্ষরের অবস্থান, মার্জিন ও দৃশ্যমান তথ্য।'), admin: true, store: 'settings/print' },
  { id: 'publication', label: tt('Result publication', 'ফলাফল প্রকাশ'), desc: tt('What students can see online and how they verify themselves.', 'শিক্ষার্থীরা অনলাইনে কী দেখবে এবং কীভাবে যাচাই করবে।'), admin: true, store: 'settings/publication' },
  { id: 'retention', label: tt('Record keeping', 'সংরক্ষণকাল'), desc: tt('How long results stay available.', 'ফলাফল কতদিন পাওয়া যাবে।'), admin: true, store: 'settings/retention', feature: 'historical_archive' },
  { id: 'features', label: tt('Feature availability', 'সুবিধার প্রাপ্যতা'), desc: tt('Which optional features are switched on for your college.', 'আপনার কলেজের জন্য কোন ঐচ্ছিক সুবিধা চালু।'), admin: true, store: 'featureFlags/global (read-only)' },
  { id: 'history', label: tt('Audit and history', 'অডিট ও ইতিহাস'), desc: tt('Who changed what, and published result history.', 'কে কী বদলেছেন এবং প্রকাশিত ফলাফলের ইতিহাস।'), admin: true, store: 'auditLogs (read-only)' },
];
