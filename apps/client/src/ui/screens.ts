import { CLASSES, CLASS_IDS, LORE, type ClassId, HAIR_COLORS, OUTFIT_TINTS, lookColors } from '@astra/shared';
import type { Backend, CharSummary } from '../net.js';
import { ct, t, getLang, setLang } from '../i18n.js';
import { drawChibi, setAnimTime } from '../sprites.js';
import { uiIcon, tileIcon } from './icons.js';
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
    root.append(h('div', { class: 'screen auth' }, modeBanner(b), langToggle(draw), form, h('p', { class: 'lore' }, ct('lore.intro', LORE.intro))));
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
    const th = getLang() === 'th';
    let sel: ClassId = 'mage';
    const look = { hair: -1, outfit: -1 };
    let hard = false;
    const stage = h('div', { class: 'cc-stage', role: 'radiogroup', 'aria-label': 'Class' });
    const info = h('div', { class: 'cc-info' });
    const idle = h('canvas', { class: 'cc-idle', width: 200, height: 200 });
    const swatches = (label: string, list: string[], key: 'hair' | 'outfit') => {
      const row = h('div', { class: 'sw-row' });
      const paint = () => { clear(row).append(h('button', { class: 'sw def' + (look[key] < 0 ? ' on' : ''), title: th ? 'ค่าเริ่มต้นของอาชีพ' : 'Class default', onclick: () => { look[key] = -1; paint(); refresh(); } }, '✦'), ...list.map((c, i) => h('button', { class: 'sw' + (look[key] === i ? ' on' : ''), style: `--c:${c}`, 'aria-label': c, onclick: () => { look[key] = i; paint(); refresh(); } }))); };
      paint();
      return h('div', { class: 'cc-field' }, h('label', null, label), row);
    };
    const pedestal = (c: ClassId) => h('button', { class: 'ped', role: 'radio', 'data-cls': c, onclick: () => { sel = c; refresh(); } }, h('div', { class: 'ped-fig' }), h('div', { class: 'ped-base' }), h('span', { class: 'ped-name' }, ct(`class.${c}.name`, CLASSES[c].name)));
    for (const c of CLASS_IDS) stage.append(pedestal(c));
    const refresh = () => {
      for (const el of Array.from(stage.children) as HTMLElement[]) {
        const c = el.dataset.cls as ClassId; el.classList.toggle('on', c === sel); el.setAttribute('aria-checked', String(c === sel));
        const lc = lookColors(c, c === sel ? look : null);
        const cv = h('canvas', { width: 120, height: 150 }); const x = cv.getContext('2d')!; x.imageSmoothingEnabled = false;
        drawChibi(x, 60, 136, c === sel ? 2.9 : 2.5, Math.PI / 2 - 0.3, lc.body, lc.hair, lc.accent, 0, 0, c);
        clear(el.querySelector('.ped-fig') as HTMLElement).append(cv);
      }
      const d = CLASSES[sel];
      clear(info).append(
        h('div', { class: 'cc-head' }, uiIcon('emblem', 52, d.colors.accent), h('div', null, h('h2', null, ct(`class.${d.id}.name`, d.name)), h('small', null, ct(`class.${d.id}.role`, d.role)))),
        h('div', { class: 'sec-title' }, uiIcon('star', 18, '#ffd36a'), th ? 'สรุปบทบาท' : 'Role Summary'), h('p', null, ct(`class.${d.id}.fantasy`, d.fantasy)),
        h('div', { class: 'cc-kv' }, h('span', null, uiIcon('crossed', 18), th ? ' อาวุธ' : ' Weapon Type'), h('b', null, d.weaponAffinity.join(' / '))),
        h('div', { class: 'cc-kv' }, h('span', null, uiIcon('awaken', 18, '#9b6cff'), th ? ' ความยาก' : ' Difficulty'), h('b', { class: 'diamonds' }, '◆'.repeat(d.difficulty) + '◇'.repeat(3 - d.difficulty))),
        h('div', { class: 'sec-title' }, uiIcon('sigil', 18, '#9b6cff'), th ? 'กลไกหลัก' : 'Key Mechanics'),
        h('div', { class: 'mech' }, tileIcon('orb', d.resource.color, 'epic', 44), h('div', null, h('b', null, d.resource.name + (d.secondary ? ` + ${d.secondary.name}` : '')), h('small', null, ct(`class.${d.id}.mechanic`, d.mechanic)))),
        ...d.archetypes.slice(0, 2).map((a) => h('div', { class: 'mech' }, tileIcon('star', d.colors.accent, 'rare', 44), h('div', null, h('b', null, a.split(':')[0] ?? a), h('small', null, a.split(':').slice(1).join(':') || (th ? 'แนวทางบิลด์' : 'Build archetype'))))));
    };
    let ang = 0, alive = true;
    const loop = () => { if (!alive || !idle.isConnected) return; ang += 0.012; setAnimTime(performance.now() / 1000); const x = idle.getContext('2d')!; x.clearRect(0, 0, 200, 200); x.imageSmoothingEnabled = false; const lc = lookColors(sel, look); const dir = [Math.PI / 2, 0, -Math.PI / 2, Math.PI][Math.floor(ang) % 4]!; drawChibi(x, 100, 180, 3.4, dir, lc.body, lc.hair, lc.accent, 0, 0, sel); requestAnimationFrame(loop); };
    requestAnimationFrame(() => requestAnimationFrame(loop));
    refresh();
    const name = h('input', { type: 'text', maxLength: 16, placeholder: th ? 'ตั้งชื่อตัวละคร (3–16 ตัวอักษร)' : 'Enter character name (3–16 characters)', 'aria-label': t('name') });
    const SYL = ['Ae', 'Lu', 'Sel', 'Ka', 'Ri', 'No', 'Mi', 'Zu', 'Ra', 'Vel', 'Ast', 'Ori', 'Ny', 'El', 'Sha'], END = ['ne', 'ra', 'ion', 'ka', 'ris', 'via', 'lyn', 'mir', 'xor', 'th', 'dra'];
    const dice = h('button', { class: 'dice', title: th ? 'สุ่มชื่อ' : 'Random name', onclick: () => { name.value = SYL[Math.floor(Math.random() * SYL.length)]! + END[Math.floor(Math.random() * END.length)]! + (Math.random() < 0.4 ? SYL[Math.floor(Math.random() * SYL.length)]!.toLowerCase() : ''); } }, '🎲');
    const modeCard = (hc: boolean) => h('button', { class: 'mode-card' + (hard === hc ? ' on' : ''), onclick: async () => { if (hc && !(await confirmDialog(t('hardcore'), t('hardcoreWarn'), t('confirm'), t('cancel')))) return; hard = hc; for (const el of Array.from(modes.children).slice(1)) el.classList.toggle('on', (el as HTMLElement).dataset.hc === String(hard)); }, 'data-hc': String(hc) },
      uiIcon(hc ? 'skull' : 'shield', 26, hc ? '#ff4f5a' : '#5aa8ff'), h('div', null, h('b', null, hc ? t('hardcore') : (th ? 'ปกติ' : 'Normal')), h('small', null, hc ? (th ? 'ตายถาวร · รางวัลมากขึ้น' : 'Permanent death · separate ladder') : (th ? 'ผจญภัยสมดุลสำหรับทุกคน' : 'Balanced adventure for all players.'))));
    const modes = h('div', { class: 'cc-modes' }, h('span', { class: 'cc-lbl' }, uiIcon('gear', 20), th ? ' โหมดเกม' : ' Game Mode'), modeCard(false), modeCard(true));
    const go = h('button', { class: 'btn primary cc-go' }, th ? '✦ สร้างตัวละคร ✦' : '✦ Create Character ✦');
    go.onclick = async () => {
      go.disabled = true;
      try { await b.createChar(name.value.trim(), sel, hard, { ...look }); alive = false; me = await b.me(); draw(); toast('Character created', 'good'); }
      catch (e) { toast((e as Error).message, 'error'); }
      finally { go.disabled = false; }
    };
    return h('section', { class: 'creator stage-mode' },
      h('div', { class: 'cc-title' }, h('h2', null, th ? 'สร้างตัวละคร' : 'Create Character'), h('small', null, th ? 'สร้างตัวละครและเลือกอาชีพ' : 'Character Creation & Class Selection')),
      h('div', { class: 'cc-cols' },
        h('div', { class: 'cc-left' }, h('div', { class: 'sec-title' }, th ? '+ ปรับแต่งรูปลักษณ์ +' : '+ Customize Appearance +'), swatches(th ? 'สีผม' : 'Hair Color', HAIR_COLORS, 'hair'), swatches(th ? 'สีชุด' : 'Outfit Tint', OUTFIT_TINTS, 'outfit'),
          h('div', { class: 'sec-title' }, th ? '+ ตัวอย่างท่ายืน' : '+ Idle Preview'), h('div', { class: 'cc-idle-wrap' }, idle)),
        stage, info),
      modes, h('div', { class: 'cc-name' }, h('span', { class: 'cc-lbl' }, uiIcon('person', 20), th ? ' ชื่อตัวละคร' : ' Character Name'), name, dice), go);
  };
  draw();
}
