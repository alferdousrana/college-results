/** Round 5: starter data matched to existing items with other ids; repair; assignment sections. */
import { describe, it, expect, beforeAll } from 'vitest';
import { freshDb, ADMIN } from './helpers.js';
import starter from '../../config/starter-data.json';
import { planStarterData, applyStarterData, repairReferences } from '../../src/data/repositories/starter-repository.js';
import { sectionSubjects } from '../../src/pages/admin/assignments.js';

let b;
describe('starter data with existing items', () => {
  beforeAll(async () => {
    b = await freshDb({ seed: false });
    // The college created these before loading the starter data, with their own ids.
    await b.set('groups/sci-old', { name: { en: 'Science', bn: 'বিজ্ঞান' }, order: 1 });
    await b.set('classes/eleven-old', { name: { en: 'Eleven' }, order: 11, groupIds: ['sci-old'] });
    // A subject saved earlier pointing at group/class ids that do not exist.
    await b.set('subjects/broken', { name: { en: 'Broken' }, order: 99, groupIds: ['science', 'nope'], classIds: ['class-11'], groupRoles: { science: 'choice' }, components: [] });
  });
  it('points new subjects at the existing group and class ids', async () => {
    const plan = await planStarterData(starter);
    expect(plan.find((p) => p.item.id === 'science').match.id).toBe('sci-old');
    expect(plan.find((p) => p.item.id === 'class-11').match.id).toBe('eleven-old');
    const r = await applyStarterData(ADMIN, starter, plan);
    const physics = await b.get('subjects/physics');
    expect(physics.groupIds).toEqual(['sci-old']);
    expect(physics.classIds).toEqual(['eleven-old', 'class-12']);
    expect(physics.groupRoles).toEqual({ 'sci-old': 'compulsory' });
    expect((await b.get('classes/eleven-old')).groupIds.sort()).toEqual(['business', 'humanities', 'sci-old']);
    expect(r.repaired).toBeGreaterThan(0);
    const broken = await b.get('subjects/broken');
    expect(broken.groupIds).toEqual(['sci-old']); expect(broken.classIds).toEqual(['eleven-old']); expect(broken.groupRoles).toEqual({ 'sci-old': 'choice' });
    expect(await repairReferences(ADMIN)).toBe(0); // nothing left to fix
  });
  it('groups subjects into common, per group and other', async () => {
    const groups = [{ id: 'sci', name: 'Science' }, { id: 'hum', name: 'Humanities' }];
    const subjects = [{ id: 'bn', groupIds: ['sci', 'hum'] }, { id: 'phy', groupIds: ['sci'] }, { id: 'psy', groupIds: ['sci', 'hum'].slice(0, 1).concat('hum') }, { id: 'x', groupIds: ['gone'] }, { id: 'any' }];
    const s = sectionSubjects(subjects, groups);
    expect(s.map((x) => [x.id, x.items.map((i) => i.id)])).toEqual([['_common', ['bn', 'psy', 'any']], ['sci', ['phy']], ['_other', ['x']]]);
  });
});
