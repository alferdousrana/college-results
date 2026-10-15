/**
 * Print font catalogue. Every font listed here is BUNDLED with the app (npm @fontsource packages,
 * SIL Open Font License / Apache 2.0) and served from the app's own origin, so it works offline
 * once cached. Nothing is fetched from Google Fonts at runtime.
 */
export const ENGLISH_FONTS = Object.freeze([
  { id: 'tinos', family: 'Tinos', css: "'Tinos', 'Times New Roman', serif", licence: 'Apache-2.0', note: 'Times New Roman metrics' },
  { id: 'eb-garamond', family: 'EB Garamond', css: "'EB Garamond', Georgia, serif", licence: 'OFL-1.1' },
  { id: 'libre-baskerville', family: 'Libre Baskerville', css: "'Libre Baskerville', Georgia, serif", licence: 'OFL-1.1' },
  { id: 'merriweather', family: 'Merriweather', css: "'Merriweather', Georgia, serif", licence: 'OFL-1.1' },
  { id: 'noto-serif', family: 'Noto Serif', css: "'Noto Serif', Georgia, serif", licence: 'OFL-1.1' },
  { id: 'pt-serif', family: 'PT Serif', css: "'PT Serif', Georgia, serif", licence: 'OFL-1.1' },
  { id: 'arimo', family: 'Arimo', css: "'Arimo', Arial, sans-serif", licence: 'Apache-2.0', note: 'Arial metrics' },
  { id: 'roboto', family: 'Roboto', css: "'Roboto', Arial, sans-serif", licence: 'OFL-1.1' },
  { id: 'open-sans', family: 'Open Sans', css: "'Open Sans', Arial, sans-serif", licence: 'OFL-1.1' },
  { id: 'lato', family: 'Lato', css: "'Lato', Arial, sans-serif", licence: 'OFL-1.1' },
  { id: 'source-sans-3', family: 'Source Sans 3', css: "'Source Sans 3', Arial, sans-serif", licence: 'OFL-1.1' },
]);

export const BANGLA_FONTS = Object.freeze([
  { id: 'noto-serif-bengali', family: 'Noto Serif Bengali', css: "'Noto Serif Bengali', serif", licence: 'OFL-1.1' },
  { id: 'noto-sans-bengali', family: 'Noto Sans Bengali', css: "'Noto Sans Bengali', sans-serif", licence: 'OFL-1.1' },
  { id: 'hind-siliguri', family: 'Hind Siliguri', css: "'Hind Siliguri', sans-serif", licence: 'OFL-1.1' },
  { id: 'tiro-bangla', family: 'Tiro Bangla', css: "'Tiro Bangla', serif", licence: 'OFL-1.1', note: 'Regular weight only' },
  { id: 'anek-bangla', family: 'Anek Bangla', css: "'Anek Bangla', sans-serif", licence: 'OFL-1.1' },
  { id: 'baloo-da-2', family: 'Baloo Da 2', css: "'Baloo Da 2', sans-serif", licence: 'OFL-1.1' },
  { id: 'galada', family: 'Galada', css: "'Galada', cursive", licence: 'OFL-1.1', note: 'Decorative; headings only, regular weight' },
  { id: 'atma', family: 'Atma', css: "'Atma', sans-serif", licence: 'OFL-1.1' },
  { id: 'mina', family: 'Mina', css: "'Mina', sans-serif", licence: 'OFL-1.1' },
  { id: 'google-sans', family: 'Google Sans', css: "'Google Sans', sans-serif", licence: 'OFL-1.1' },
]);

let loaded = null;
/** Loads @font-face declarations for every bundled print font (font files download on first use). */
export function ensurePrintFonts() {
  loaded ??= import('./fonts-bundle.js');
  return loaded;
}

/** Waits until the given families are ready, so the first print is not rendered with fallback fonts. */
export async function waitForFonts(families) {
  await ensurePrintFonts();
  if (!document.fonts?.load) return;
  await Promise.all(families.flatMap((f) => [document.fonts.load(`400 12px '${f}'`, 'অআ Aa'), document.fonts.load(`700 12px '${f}'`, 'অআ Aa')]).map((p) => p.catch(() => null)));
}
