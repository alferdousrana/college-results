/**
 * Searchable, filterable, sortable, paginated table (client-side over the rows it is given).
 * For collections that can be large (students, audit log) the page supplies rows from a
 * server-paginated query and uses `onLoadMore`.
 *
 * columns: [{ key, label, render?(row) → Node|string, sort?(row) → value, className?, hideOnMobile? }]
 */
import { h } from '../../core/dom.js';
import { tt, formatNumber } from '../../i18n/index.js';
import { emptyState } from './states.js';

export function dataTable({ columns, rows = [], searchKeys = [], filters = [], pageSize = 25, empty, rowKey = (r) => r.id,
  rowClass = null, toolbar = [], onLoadMore = null, caption = null }) {
  let all = rows, query = '', page = 0, sortKey = null, sortDir = 1, hasMore = Boolean(onLoadMore);
  const active = Object.fromEntries(filters.map((f) => [f.key, f.value ?? '']));

  const search = searchKeys.length ? h('input', { class: 'input input--search', type: 'search', placeholder: tt('Search…', 'খুঁজুন…'), 'aria-label': tt('Search', 'খুঁজুন'),
    oninput: (e) => { query = e.target.value.trim().toLowerCase(); page = 0; render(); } }) : null;
  const filterEls = filters.map((f) => h('select', { class: 'input input--filter', 'aria-label': f.label,
    onchange: (e) => { active[f.key] = e.target.value; page = 0; render(); } },
    h('option', { value: '' }, f.allLabel ?? `${f.label}: ${tt('All', 'সব')}`), f.options.map((o) => h('option', { value: o.value, selected: o.value === active[f.key] }, o.label))));
  const thead = h('thead');
  const tbody = h('tbody');
  const info = h('p', { class: 'table-info muted', 'aria-live': 'polite' });
  const pager = h('div', { class: 'pager' });
  const table = h('table', { class: 'data-table' }, caption ? h('caption', { class: 'sr-only' }, caption) : null, thead, tbody);
  const wrap = h('div', { class: 'table-card' },
    (search || filterEls.length || toolbar.length) ? h('div', { class: 'table-toolbar' }, search, filterEls, h('div', { class: 'table-toolbar__end' }, toolbar)) : null,
    h('div', { class: 'table-scroll' }, table), h('div', { class: 'table-foot' }, info, pager));

  function visible() {
    let r = all;
    for (const f of filters) if (active[f.key]) r = r.filter((row) => String(f.get ? f.get(row) : row[f.key]) === active[f.key]);
    if (query) r = r.filter((row) => searchKeys.some((k) => String(typeof k === 'function' ? k(row) : row[k] ?? '').toLowerCase().includes(query)));
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      const val = col.sort ?? ((x) => x[col.key]);
      r = [...r].sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * sortDir; });
    }
    return r;
  }

  function renderHead() {
    thead.replaceChildren(h('tr', {}, columns.map((c) => {
      if (!c.sort && !c.sortable) return h('th', { scope: 'col', class: c.className }, c.label);
      const dir = sortKey === c.key ? (sortDir === 1 ? 'ascending' : 'descending') : 'none';
      return h('th', { scope: 'col', class: c.className, 'aria-sort': dir },
        h('button', { type: 'button', class: 'th-sort', onclick: () => { sortDir = sortKey === c.key ? -sortDir : 1; sortKey = c.key; renderHead(); render(); } }, c.label, dir === 'none' ? '' : dir === 'ascending' ? ' ▲' : ' ▼'));
    })));
  }

  function render() {
    const r = visible();
    const pages = Math.max(1, Math.ceil(r.length / pageSize));
    page = Math.min(page, pages - 1);
    const slice = r.slice(page * pageSize, page * pageSize + pageSize);
    if (!slice.length) {
      tbody.replaceChildren(h('tr', {}, h('td', { colspan: columns.length }, emptyState({ message: all.length ? tt('Nothing matches your search or filters.', 'অনুসন্ধান বা ফিল্টারের সাথে কিছু মেলেনি।') : empty ?? tt('Nothing here yet.', 'এখানে এখনো কিছু নেই।') }))));
    } else {
      tbody.replaceChildren(...slice.map((row) => h('tr', { class: rowClass?.(row) ?? '', dataset: { key: rowKey(row) } },
        columns.map((c) => h('td', { class: c.className, 'data-label': typeof c.label === 'string' ? c.label : '' }, c.render ? c.render(row) : row[c.key] ?? '')))));
    }
    info.textContent = r.length ? tt('Showing {a}–{b} of {n}', '{n}টির মধ্যে {a}–{b}', { a: page * pageSize + 1, b: page * pageSize + slice.length, n: r.length }) : '';
    pager.replaceChildren(
      pages > 1 ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', disabled: page === 0, onclick: () => { page--; render(); } }, tt('Previous', 'আগের')) : null,
      pages > 1 ? h('span', { class: 'pager__pos' }, `${formatNumber(page + 1)} / ${formatNumber(pages)}`) : null,
      pages > 1 ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', disabled: page >= pages - 1, onclick: () => { page++; render(); } }, tt('Next', 'পরের')) : null,
      hasMore ? h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async (e) => { e.target.disabled = true; const more = await onLoadMore(); hasMore = more?.hasMore ?? false; e.target.disabled = false; } }, tt('Load more', 'আরও দেখুন')) : null);
  }

  renderHead(); render();
  return {
    el: wrap,
    setRows(next, { more = hasMore } = {}) { all = next; hasMore = more; render(); },
    appendRows(more, { hasMore: hm }) { all = [...all, ...more]; hasMore = hm; render(); },
  };
}
