import { describe, it, expect } from 'vitest';
import { dictionaries, formatNumber } from '../../src/i18n/index.js';

describe('localisation', () => {
  it('Bangla has every English key', () => {
    const missing = Object.keys(dictionaries.en).filter((k) => !(k in dictionaries.bn));
    expect(missing).toEqual([]);
  });
  it('Bangla strings are Unicode Bengali, not legacy ANSI (Bijoy) encoding', () => {
    const bengali = /[\u0980-\u09FF]/;
    const sample = ['app.name', 'nav.settings', 'lookup.title'].map((k) => dictionaries.bn[k]);
    sample.forEach((s) => expect(bengali.test(s)).toBe(true));
  });
  it('formats Bangla digits for display', () => expect(formatNumber(2026, 'bn')).toBe('২০২৬'));
});
