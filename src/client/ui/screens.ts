/** Pre-game screens: title, login/register, character select, character creation. */
import { APPEARANCE, type Appearance } from '../../shared/config/appearance.ts';
import { WEAPONS, WEAPON_DISPLAY, WEAPON_TYPES, type WeaponType } from '../../shared/config/weapons.ts';
import { getZone } from '../../shared/config/zones.ts';
import type { CharacterSummary } from '../../shared/protocol.ts';
import { characterSprite, paletteFor, weaponSprite } from '../render/sprites.ts';
import { makeCanvas } from '../render/pixel.ts';
import { clear, confirmBox, h } from './dom.ts';

export function previewCanvas(app: Appearance, weapon: WeaponType | null, scale = 6): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(24 * scale, 24 * scale);
  ctx.imageSmoothingEnabled = false;
  const spr = characterSprite(paletteFor(app), 0, false, false);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(12 * scale, 21.5 * scale, 6 * scale, 2 * scale, 0, 0, Math.PI * 2); ctx.fill();
  if (weapon) ctx.drawImage(weaponSprite(weapon), 13 * scale, 6 * scale, 16 * scale * 0.8, 16 * scale * 0.8);
  ctx.drawImage(spr, (12 - spr.width / 2) * scale, (22 - spr.height) * scale, spr.width * scale, spr.height * scale);
  return c;
}

export function titleScreen(root: HTMLElement, opts: { mode: string; onStart: (latency: number) => void; onReset?: () => void }) {
  clear(root);
  let latency = 0;
  const local = opts.mode !== 'online';
  root.append(h('div', { class: 'screen title' },
    h('div', { class: 'logo' }, h('div', { class: 'logo-top' }, 'THE POWER'), h('div', { class: 'logo-sub' }, 'ETERNAL WAR')),
    h('div', { class: 'panel narrow' },
      h('p', {}, local
        ? 'โหมดเซิร์ฟเวอร์ในเบราว์เซอร์: เซิร์ฟเวอร์จริงของเกม (server-authoritative) รันใน Web Worker บนเครื่องคุณ เล่นได้คนเดียว'
        : 'โหมดออนไลน์: เชื่อมต่อเซิร์ฟเวอร์ผ่าน WebSocket ผู้เล่นทุกคนอยู่ในโลกเดียวกัน'),
      local ? h('label', {}, 'จำลอง latency (ทดสอบ netcode): ',
        h('select', { id: 'lat', onchange: (e: Event) => { latency = Number((e.target as HTMLSelectElement).value); } },
          h('option', { value: '0' }, '0 ms'), h('option', { value: '40' }, '40 ms'), h('option', { value: '80' }, '80 ms'), h('option', { value: '150' }, '150 ms'))) : null,
      h('button', { class: 'btn primary big', id: 'start', onclick: () => opts.onStart(latency) }, 'เริ่มเกม'),
      local && opts.onReset ? h('button', { class: 'btn small ghost', onclick: () => { void confirmBox('ลบข้อมูลเซฟของเซิร์ฟเวอร์ในเบราว์เซอร์ทั้งหมด? บัญชีและตัวละครจะหายถาวร', 'ลบเซฟ').then((ok) => ok && opts.onReset!()); } }, 'ล้างเซฟในเครื่อง') : null,
    ),
    h('div', { class: 'foot' }, 'Vertical Slice v0.1 · Milestone 1 · ไม่มีระบบคลาส — บทบาทมาจากอาวุธและ The Power'),
  ));
}

export function loginScreen(root: HTMLElement, opts: { onLogin: (u: string, p: string) => void; onRegister: (u: string, p: string) => void }) {
  clear(root);
  const user = h('input', { id: 'user', maxlength: 20, placeholder: 'username (a-z 0-9 _)', autocomplete: 'username' });
  const pass = h('input', { id: 'pass', type: 'password', maxlength: 72, placeholder: 'password (6+ ตัว)', autocomplete: 'current-password' });
  const go = (fn: (u: string, p: string) => void) => () => fn(user.value.trim().toLowerCase(), pass.value);
  pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(opts.onLogin)(); });
  root.append(h('div', { class: 'screen' },
    h('div', { class: 'logo small' }, h('div', { class: 'logo-top' }, 'THE POWER'), h('div', { class: 'logo-sub' }, 'ETERNAL WAR')),
    h('div', { class: 'panel narrow' },
      h('h2', {}, 'เข้าสู่ระบบ'),
      user, pass,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', id: 'login', onclick: go(opts.onLogin) }, 'Login'),
        h('button', { class: 'btn', id: 'register', onclick: go(opts.onRegister) }, 'สมัครบัญชีใหม่')),
      h('div', { class: 'error', id: 'err' }),
    )));
  user.focus();
}

export function showError(text: string) {
  const el = document.getElementById('err');
  if (el) el.textContent = text;
}

export function charSelectScreen(root: HTMLElement, chars: CharacterSummary[], max: number, opts: { onPlay: (id: string) => void; onCreate: () => void }) {
  clear(root);
  let selected = chars[0]?.id ?? null;
  const list = h('div', { class: 'char-list' });
  const draw = () => {
    clear(list);
    for (const c of chars) {
      list.append(h('div', { class: `char-card${c.id === selected ? ' sel' : ''}`, onclick: () => { selected = c.id; draw(); }, ondblclick: () => opts.onPlay(c.id) },
        previewCanvas(c.app, c.weapon, 4),
        h('div', { class: 'cc-name' }, c.name),
        h('div', { class: 'cc-sub' }, `Lv.${c.level} · ${c.weapon ? WEAPON_DISPLAY[c.weapon].nameTh : '-'}`),
        h('div', { class: 'cc-sub' }, getZone(c.zoneId)?.name ?? c.zoneId)));
    }
    if (chars.length < max) list.append(h('div', { class: 'char-card new', onclick: opts.onCreate }, h('div', { class: 'plus' }, '+'), h('div', {}, 'สร้างตัวละคร')));
  };
  draw();
  root.append(h('div', { class: 'screen' },
    h('h2', {}, 'เลือกตัวละคร'), list,
    h('div', { class: 'row' }, h('button', { class: 'btn primary big', id: 'play', onclick: () => selected && opts.onPlay(selected) }, 'เข้าสู่โลก')),
    h('div', { class: 'error', id: 'err' })));
}

export function charCreateScreen(root: HTMLElement, opts: { onCreate: (name: string, app: Appearance, weapon: WeaponType) => void; onBack?: () => void }) {
  clear(root);
  const app: Appearance = { gender: 'male', skin: 1, hairStyle: 0, hairColor: 1, face: 0, outfit: 0 };
  let weapon: WeaponType = 'sword';
  const preview = h('div', { class: 'preview' });
  const redraw = () => { clear(preview); preview.append(previewCanvas(app, weapon, 7)); };
  const cycle = (label: string, n: number, get: () => number, set: (v: number) => void, names?: string[]) => {
    const val = h('span', { class: 'cyc-val' });
    const upd = () => { val.textContent = names ? names[get()] : `${get() + 1}/${n}`; redraw(); };
    upd();
    return h('div', { class: 'cyc' }, h('span', { class: 'cyc-l' }, label),
      h('button', { class: 'btn small', onclick: () => { set((get() + n - 1) % n); upd(); } }, '◀'), val,
      h('button', { class: 'btn small', onclick: () => { set((get() + 1) % n); upd(); } }, '▶'));
  };
  const swatches = (label: string, colors: string[], get: () => number, set: (v: number) => void) => {
    const row = h('div', { class: 'swatches' });
    const draw = () => {
      clear(row);
      colors.forEach((c, i) => row.append(h('button', { class: `sw${get() === i ? ' sel' : ''}`, style: `background:${c}`, title: c, onclick: () => { set(i); draw(); redraw(); } })));
    };
    draw();
    return h('div', { class: 'cyc' }, h('span', { class: 'cyc-l' }, label), row);
  };
  const weapons = h('div', { class: 'weapons' });
  const drawWeapons = () => {
    clear(weapons);
    for (const t of WEAPON_TYPES) {
      const def = WEAPONS[t];
      const enabled = !!def?.enabled;
      weapons.append(h('button', {
        class: `wpn${weapon === t ? ' sel' : ''}${enabled ? '' : ' locked'}`, disabled: !enabled,
        title: enabled ? def!.role : 'ออกแบบแล้ว — เปิดใช้ใน Milestone 2',
        onclick: () => { weapon = t; drawWeapons(); redraw(); },
      }, h('b', {}, WEAPON_DISPLAY[t].nameTh), h('small', {}, enabled ? def!.role : 'Milestone 2')));
    }
  };
  drawWeapons();
  const name = h('input', { id: 'cname', maxlength: 16, placeholder: 'ชื่อตัวละคร 3-16 ตัว' });
  root.append(h('div', { class: 'screen' },
    h('h2', {}, 'สร้างตัวละคร'),
    h('div', { class: 'create' },
      preview,
      h('div', { class: 'panel form' },
        name,
        cycle('เพศ', 2, () => (app.gender === 'male' ? 0 : 1), (v) => { app.gender = v ? 'female' : 'male'; }, ['ชาย', 'หญิง']),
        cycle('ใบหน้า', APPEARANCE.faces.length, () => app.face, (v) => { app.face = v; }, APPEARANCE.faces),
        cycle('ทรงผม', APPEARANCE.hairStyles.length, () => app.hairStyle, (v) => { app.hairStyle = v; }, APPEARANCE.hairStyles),
        swatches('สีผม', APPEARANCE.hairColor, () => app.hairColor, (v) => { app.hairColor = v; }),
        swatches('สีผิว', APPEARANCE.skin, () => app.skin, (v) => { app.skin = v; }),
        cycle('ชุดเริ่มต้น', APPEARANCE.outfits.length, () => app.outfit, (v) => { app.outfit = v; }, APPEARANCE.outfits.map((o) => o.name)),
        h('div', { class: 'cyc-l' }, 'อาวุธเริ่มต้น (เปลี่ยนภายหลังได้ในเมือง)'), weapons,
        h('div', { class: 'row' },
          opts.onBack ? h('button', { class: 'btn', onclick: opts.onBack }, 'กลับ') : null,
          h('button', { class: 'btn primary', id: 'create', onclick: () => opts.onCreate(name.value.trim(), { ...app }, weapon) }, 'สร้าง')),
        h('div', { class: 'error', id: 'err' }))),
  ));
  redraw();
  name.focus();
}
