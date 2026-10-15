/**
 * Prints the documents inside `container`. Orientation and margins come from the first document;
 * a temporary @page rule is injected so marksheets (portrait) and sheets (landscape) print correctly.
 * Page numbers use CSS @page margin boxes (supported in current Chrome/Edge; other browsers omit them).
 */
import { waitForFonts } from './fonts.js';

export async function printContainer(container, { families = [], pageNumbers = true, pageLabel = 'Page' } = {}) {
  const first = container.querySelector('.print-doc');
  const orientation = first?.dataset.orientation === 'landscape' ? 'landscape' : 'portrait';
  const margin = Number(first?.dataset.margin ?? 10);
  await waitForFonts(families);
  const style = document.createElement('style');
  style.id = 'print-page-rule';
  style.textContent = `@page { size: A4 ${orientation}; margin: ${margin}mm; ${pageNumbers ? `@bottom-right { content: "${pageLabel} " counter(page) " / " counter(pages); font-size: 8pt; }` : ''} }`;
  document.getElementById('print-page-rule')?.remove();
  document.head.append(style);
  document.body.classList.add('is-printing');
  container.classList.add('print-target');
  const cleanup = () => { style.remove(); document.body.classList.remove('is-printing'); container.classList.remove('print-target'); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
  setTimeout(cleanup, 60_000);
}
