import { CLASSES, CLASS_IDS, LORE, type ClassId } from '@astra/shared';
import type { Backend, CharSummary } from '../net.js';
import { t, getLang, setLang } from '../i18n.js';
import { drawChibi } from '../render.js';
import { clear, confirmDialog, h, promptDialog, toast } from './dom.js';

export function modeBanner(b: Backend, compact = false): HTMLElement {
  return b.mode === 'offline' ? h('div', { class: 'banner offline', role: 'note', title: t('offlineBanner') }, compact ? 'OFFLINE MODE · local simulation' : t('offlineBanner')) : h('div', { class: 'banner online' }, '● ' + t('onlineBanner'));
}

function langToggle(rerender: () => void) {
  return h('div', { class: 'lang' }, ['en', 'th'].map((l) => h('button', { class: 'btn tiny' + (getLang() === l ? ' on' : ''), onclick: () => { setLang(l); rerender(); } }, l === 'en' ? 'EN' : 'ไทย')));
}

export function renderAuth(root: HTMLElement, b: Backend, done: () => void) {
  const draw = () => {
    clear(root);
    let mode: 'login' | 'register' = 'login';
    const user = h('input', { type: 'text', autocomplete: 'username', maxLength: 20, required: true, 'aria-label': t('username') });
    const pass = h('input', { type: 'password', autocomplete: 'current-password', maxLength: 128, required: true, 'aria-label': t('password') });
    const errEl = h('div', { class: 'form-err', role: 'alert' });
    const submit = h('button', { class: 'btn primary wide', type: 'submit' }, t('login'));
    const swap = h('button', { class: 'btn ghost wide', type: 'button' }, t('register'));
    swap.onclick = () => { mode = mode === 'login' ? 'register' : 'login'; submit.textContent = t(mode); swap.textContent = t(mode === 'login' ? 'register' : 'login'); pass.autocomplete = mode === 'login' ? 'current-password' : 'new-password'; };
    const form = h('form', { class: 'auth-card' },
      h('h1', { class: 'logo' }, 'ASTRA', h('span', null, 'ECLIPSE CHRONICLES')), h('p', { class: 'tagline' }, t('tagline')),
      h('label', null, t('username'), user), h('label', null, t('password'), pass), errEl, submit, swap,
      b.mode === 'offline' ? h('p', { class: 'hint' }, 'Offline accounts exist only in this browser. Use any username/password (8+ chars).') : null,
    );
    form.onsubmit = async (e) => {
      e.preventDefault();
      errEl.textContent = '';
      submit.disabled = true;
      try { if (mode === 'login') await b.login(user.value.trim(), pass.value); else await b.register(user.value.trim(), pass.value); done(); }
      catch (err) { errEl.textContent = (err as Error).message; }
      finally { submit.disabled = false; }
    };
    root.append(h('div', { class: 'screen auth' }, modeBanner(b), langToggle(draw), form, h('p', { class: 'lore' }, LORE.intro)));
    user.focus();
  };
  draw();
}

function preview(cls: ClassId, size = 96): HTMLCanvasElement {
  const c = h('canvas', { width: size * 2, height: size * 2, class: 'chibi', style: `width:${size}px;height:${size}px` });
  const ctx = c.getContext('2d')!;
  const d = CLASSES[cls];
  ctx.scale(2, 2);
  drawChibi(ctx, size / 2, size * 0.82, size / 50, Math.PI / 2 - 0.4, d.colors.body, d.colors.hair, d.colors.accent, 0, 0, cls);
  return c;
}

export async function renderCharSelect(root: HTMLElement, b: Backend, play: (id: string) => void, logout: () => void) {
  clear(root);
  root.append(h('div', { class: 'screen center' }, h('p', null, t('loading'))));
  let me: Awaited<ReturnType<Backend['me']>>;
  try { me = await b.me(); } catch (e) { toast((e as Error).message, 'error'); logout(); return; }
  const draw = () => {
    clear(root);
    const list = h('div', { class: 'char-list' }, me.characters.length ? me.characters.map((c) => charCard(c)) : h('p', { class: 'hint' }, 'No characters yet — create one below.'));
    root.append(h('div', { class: 'screen select' }, modeBanner(b),
      h('header', { class: 'row between' }, h('h1', { class: 'logo small' }, 'ASTRA', h('span', null, 'ECLIPSE CHRONICLES')), h('div', { class: 'row' }, langToggle(draw), h('span', { class: 'muted' }, me.username), h('button', { class: 'btn ghost', onclick: async () => { await b.logout(); logout(); } }, t('logout')))),
      h('h2', null, t('chooseChar')), list, creator()));
  };
  const charCard = (c: CharSummary) => {
    const card = h('div', { class: 'char-card' + (c.dead ? ' dead' : '') + (c.hardcore ? ' hc' : '') },
      preview(c.cls, 72),
      h('div', { class: 'grow' }, h('div', { class: 'char-name' }, c.name), h('div', { class: 'muted' }, `${CLASSES[c.cls].name} · ${t('level')} ${c.level} · ${t('mastery')} ${c.mastery}`), c.hardcore ? h('span', { class: 'tag hc' }, c.dead ? `☠ ${t('fallen')}` : t('hardcore')) : null),
      h('div', { class: 'col' },
        h('button', { class: 'btn primary', disabled: c.dead, onclick: () => play(c.id) }, t('play')),
        h('button', { class: 'btn ghost tiny', onclick: async () => {
          const name = await promptDialog(t('deleteChar') + ' ' + c.name, t('deleteConfirm'), '', t('deleteChar'), t('cancel'));
          if (name === null) return;
          try { await b.deleteChar(c.id, name); me = await b.me(); draw(); } catch (e) { toast((e as Error).message, 'error'); }
        } }, t('deleteChar'))));
    return card;
  };
  const creator = () => {
    let sel: ClassId = 'warrior';
    const detail = h('div', { class: 'class-detail' });
    const grid = h('div', { class: 'class-grid', role: 'radiogroup' });
    const showDetail = () => {
      const d = CLASSES[sel];
      clear(detail).append(
        preview(sel, 120),
        h('div', null, h('h3', null, d.name, h('span', { class: 'muted' }, ` — ${d.role}`)), h('p', null, d.fantasy),
          h('p', null, h('b', null, 'Mechanic: '), d.mechanic),
          h('p', null, h('b', null, 'Resource: '), d.resource.name, d.secondary ? ` + ${d.secondary.name}` : ''),
          h('p', null, h('b', null, 'Difficulty: '), '★'.repeat(d.difficulty) + '☆'.repeat(3 - d.difficulty)),
          h('p', null, h('b', null, 'Build archetypes: ')), h('ul', null, d.archetypes.map((a) => h('li', null, a))),
          h('p', { class: 'muted' }, `Weapon affinity: ${d.weaponAffinity.join(', ')} (+10% damage)`)));
      for (const el of Array.from(grid.children)) el.classList.toggle('on', (el as HTMLElement).dataset.cls === sel);
    };
    for (const c of CLASS_IDS) {
      const btn = h('button', { class: 'class-pick', role: 'radio', 'data-cls': c, onclick: () => { sel = c; showDetail(); } }, preview(c, 56), h('span', null, CLASSES[c].name));
      grid.append(btn);
    }
    showDetail();
    const name = h('input', { type: 'text', maxLength: 16, placeholder: t('name'), 'aria-label': t('name') });
    const hc = h('input', { type: 'checkbox' });
    const warn = h('p', { class: 'warn', hidden: true }, t('hardcoreWarn'));
    hc.onchange = () => { warn.hidden = !hc.checked; };
    const go = h('button', { class: 'btn primary' }, t('create'));
    go.onclick = async () => {
      if (hc.checked && !(await confirmDialog(t('hardcore'), t('hardcoreWarn'), t('create'), t('cancel')))) return;
      go.disabled = true;
      try { await b.createChar(name.value.trim(), sel, hc.checked); me = await b.me(); draw(); toast('Character created', 'good'); }
      catch (e) { toast((e as Error).message, 'error'); }
      finally { go.disabled = false; }
    };
    return h('section', { class: 'creator' }, h('h2', null, t('newChar')), grid, detail, h('div', { class: 'row wrap' }, name, h('label', { class: 'check' }, hc, ' ', t('hardcore')), go), warn);
  };
  draw();
}
