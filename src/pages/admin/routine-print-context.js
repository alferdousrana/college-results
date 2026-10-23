import { getInstitution, getSetting } from '../../data/repositories/settings-repository.js';
/** Current institution and print design (routines are not frozen like published results). */
export async function getPrintContextFromSettings() {
  const [institution, print] = await Promise.all([getInstitution(), getSetting('print')]);
  return { institution, print, lang: 'bn' };
}
