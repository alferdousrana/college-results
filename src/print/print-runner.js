/**
 * Prints the documents inside `container`. Orientation, paper and margins come from the first document;
 * a temporary @page rule is injected. Full result sheets are scaled so the whole width fits the page —
 * columns never continue on another page. Page numbers use @page margin boxes (Chrome/Edge).
 */
import { waitForFonts } from './fonts.js';
import { PAPER_MM } from './print-settings.js';

const MM_TO_PX = 96 / 25.4;

/** Scale factor needed for a sheet table to fit the printable width. */
export function fitScale(tableWidthPx, { paper = 'A4', orientation = 'landscape', marginMm = 8 } = {}) {
  const [w, hgt] = PAPER_MM[paper] ?? PAPER_MM.A4;
  const pageWidthMm = (orientation === 'landscape' ? hgt : w) - 2 * marginMm - 4; // small safety gap
  const available = pageWidthMm * MM_TO_PX;
  return tableWidthPx > available ? Math.max(0.3, available / tableWidthPx) : 1;
}

export function applySheetFit(container) {
  let min = 1;
  for (const doc of container.querySelectorAll('.print-doc--sheet')) {
    const table = doc.querySelector('.rs-table');
    if (!table) continue;
    table.style.zoom = '';
    const z = fitScale(table.scrollWidth, { paper: doc.dataset.paper, orientation: doc.dataset.orientation, marginMm: Number(doc.dataset.margin ?? 8) });
    doc.style.setProperty('--sheet-zoom', String(z));
    min = Math.min(min, z);
  }
  return min;
}

export async function printContainer(container, { families = [], pageNumbers = true, pageLabel = 'Page' } = {}) {
  const first = container.querySelector('.print-doc');
  const orientation = first?.dataset.orientation === 'landscape' ? 'landscape' : 'portrait';
  const margin = Number(first?.dataset.margin ?? 10);
  const paper = first?.dataset.paper === 'Legal' ? 'legal' : 'A4';
  await waitForFonts(families);
  applySheetFit(container);
  const style = document.createElement('style');
  style.id = 'print-page-rule';
  style.textContent = `@page { size: ${paper} ${orientation}; margin: ${margin}mm; ${pageNumbers ? `@bottom-right { content: "${pageLabel} " counter(page) " / " counter(pages); font-size: 8pt; }` : ''} }`;
  document.getElementById('print-page-rule')?.remove();
  document.head.append(style);
  document.body.classList.add('is-printing');
  container.classList.add('print-target');
  const cleanup = () => { style.remove(); document.body.classList.remove('is-printing'); container.classList.remove('print-target'); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 60_000);
}
