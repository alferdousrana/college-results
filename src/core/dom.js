/** DOM helpers. `h` builds elements without innerHTML so user data is never parsed as HTML. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') throw new Error('Use children, not html, to avoid injection.');
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function svgIcon(name) {
  const paths = ICONS[name] ?? ICONS.dot;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  for (const d of paths) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

const ICONS = {
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10'],
  sheet: ['M5 3h10l4 4v14H5z', 'M8 11h8M8 15h8M8 19h5'],
  users: ['M9 11a4 4 0 100-8 4 4 0 000 8z', 'M2 21c0-4 3-6 7-6s7 2 7 6', 'M17 3a4 4 0 010 8M22 21c0-3-2-5-4-5.5'],
  book: ['M4 4h7a3 3 0 013 3v14a2 2 0 00-2-2H4z', 'M20 4h-5a3 3 0 00-3 3'],
  settings: ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z'],
  search: ['M11 18a7 7 0 100-14 7 7 0 000 14z', 'M21 21l-5-5'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M14 6l4 4'],
  logout: ['M15 4h4v16h-4', 'M10 8l-4 4 4 4', 'M6 12h10'],
  print: ['M7 8V3h10v5', 'M5 8h14a2 2 0 012 2v6h-4v4H7v-4H3v-6a2 2 0 012-2z', 'M7 14h10'],
  cloudOff: ['M3 3l18 18', 'M7 18h10a4 4 0 001.5-7.7A6 6 0 008 7.3', 'M5 10.5A4 4 0 007 18'],
  check: ['M5 12l5 5 9-10'],
  alert: ['M12 3l10 18H2z', 'M12 10v4M12 17v.5'],
  plus: ['M12 5v14M5 12h14'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  dot: ['M12 12h.01'],
  download: ['M12 4v11M7 10l5 5 5-5', 'M5 20h14'],
};

/*
 * Safety net: conditional children such as `cond ? node : null` are common in this codebase.
 * Native append/replaceChildren would render them as the text "null"/"false", so both are
 * wrapped once to skip null, undefined and false (strings and nodes behave as usual).
 */
if (typeof Element !== 'undefined' && !Element.prototype.__crmsSafeChildren) {
  for (const name of ['append', 'replaceChildren', 'prepend']) {
    for (const proto of [Element.prototype, DocumentFragment.prototype]) {
      const native = proto[name];
      proto[name] = function (...nodes) { return native.apply(this, nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false)); };
    }
  }
  Element.prototype.__crmsSafeChildren = true;
}
