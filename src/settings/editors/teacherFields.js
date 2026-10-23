import { renderFieldsEditor } from './studentFields.js';
/** Extra fields kept on teacher accounts (settings/teacherFields). */
export const render = (el) => renderFieldsEditor(el, { docName: 'teacherFields', forTeachers: true });
