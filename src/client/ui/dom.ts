type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | ((ev: Event) => void) | undefined | null>;

/** Tiny DOM builder. Text is always inserted as text nodes (never HTML) to prevent XSS. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: Element) { while (el.firstChild) el.removeChild(el.firstChild); }

const urlCache = new Map<HTMLCanvasElement, string>();
/** Scaled pixel-art <img> from a sprite canvas. */
export function spriteImg(c: HTMLCanvasElement, scale = 2, cls = 'px'): HTMLImageElement {
  let url = urlCache.get(c);
  if (!url) { url = c.toDataURL(); urlCache.set(c, url); }
  return h('img', { src: url, class: cls, width: c.width * scale, height: c.height * scale, draggable: 'false' });
}

/** In-page confirmation (native confirm() is blocked inside the artifact viewer). */
export function confirmBox(text: string, okLabel = 'ยืนยัน'): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (v: boolean) => { ov.remove(); resolve(v); };
    const ov = h('div', { class: 'overlay modal' }, h('div', { class: 'panel narrow' }, h('p', {}, text),
      h('div', { class: 'row' }, h('button', { class: 'btn', id: 'cb-no', onclick: () => done(false) }, 'ยกเลิก'), h('button', { class: 'btn primary', id: 'cb-yes', onclick: () => done(true) }, okLabel))));
    document.body.append(ov);
  });
}

/** In-page message box (native alert() is blocked inside the artifact viewer). */
export function messageBox(text: string) {
  const ov = h('div', { class: 'overlay modal' }, h('div', { class: 'panel narrow' }, h('p', {}, text), h('button', { class: 'btn primary', onclick: () => ov.remove() }, 'ตกลง')));
  document.body.append(ov);
}
