type Attrs = Record<string, unknown> & { class?: string; style?: string; onclick?: (e: MouseEvent) => void };
type Child = Node | string | number | null | undefined | false | Child[];

/** Tiny DOM builder. Text is always inserted as text nodes (never innerHTML) to avoid XSS. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k in el && typeof v !== 'string') (el as any)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}
function append(el: HTMLElement, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export const clear = (el: HTMLElement) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

export function svg(path: string, color: string, size = 28): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', String(size)); s.setAttribute('height', String(size));
  s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path); p.setAttribute('fill', 'none'); p.setAttribute('stroke', color); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  s.append(p);
  return s;
}

let toastHost: HTMLElement | null = null;
export function toast(msg: string, kind: 'info' | 'error' | 'good' = 'info') {
  if (!toastHost) { toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastHost); }
  const el = h('div', { class: `toast toast-${kind}` }, msg);
  toastHost.append(el);
  while (toastHost.children.length > 5) toastHost.firstChild?.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, kind === 'error' ? 3200 : 2600);
}

export function confirmDialog(title: string, body: string, ok: string, cancel: string): Promise<boolean> {
  return new Promise((res) => {
    const close = (v: boolean) => { wrap.remove(); res(v); };
    const wrap = h('div', { class: 'modal-wrap' }, h('div', { class: 'modal small', role: 'dialog', 'aria-modal': 'true' },
      h('h2', null, title), h('p', null, body),
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => close(false) }, cancel), h('button', { class: 'btn danger', onclick: () => close(true) }, ok))));
    document.body.append(wrap);
  });
}

/** In-page text prompt (native prompt() is unavailable in sandboxed frames). Resolves null on cancel. */
export function promptDialog(title: string, body: string, initial = '', ok = 'OK', cancel = 'Cancel'): Promise<string | null> {
  return new Promise((res) => {
    const input = h('input', { type: 'text', value: initial, 'aria-label': title, id: 'astra-prompt' });
    const close = (v: string | null) => { wrap.remove(); res(v); };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') close(input.value); if (e.key === 'Escape') close(null); });
    const wrap = h('div', { class: 'modal-wrap' }, h('div', { class: 'modal small', role: 'dialog', 'aria-modal': 'true' },
      h('h2', null, title), body ? h('p', null, body) : null, input,
      h('div', { class: 'row end' }, h('button', { class: 'btn ghost', onclick: () => close(null) }, cancel), h('button', { class: 'btn primary', onclick: () => close(input.value) }, ok))));
    document.body.append(wrap);
    input.focus(); input.select();
  });
}
