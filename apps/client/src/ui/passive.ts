import { CLASSES, PASSIVE_MAP, PASSIVE_NODES, SKILL_MAP, canAllocate, combatPower, computeStats, encodeBuild, passivePointsFor, respecCost, refundCost, statLabel, type CharacterData, type PassiveNode } from '@astra/shared';
import { getLang } from '../i18n.js';
import { skillIcon, uiIcon } from './icons.js';
import { statText } from '../l10n.js';
import { t } from '../i18n.js';
import { confirmDialog, h, promptDialog, toast } from './dom.js';
import { hideTip, showTip } from './tooltip.js';

export function passiveTreePanel(ch: CharacterData, send: (m: any) => void, inTown: boolean, focus?: string): HTMLElement {
  const canvas = h('canvas', { class: 'tree-canvas', tabIndex: 0, 'aria-label': 'Passive tree. Click a node to allocate; right click to refund.' });
  const search = h('input', { type: 'search', placeholder: t('search'), 'aria-label': t('search') });
  const pts = passivePointsFor(ch.level, ch.bonusPoints) - ch.passives.length;
  const own = new Set([...ch.passives, `${ch.cls}_start`]);
  const view = { x: 0, y: 0, z: 0.32 };
  // centre on class start
  const start = focus === 'central' ? { x: 0, y: 0 } : PASSIVE_MAP[`${focus ?? ch.cls}_start`] ?? PASSIVE_MAP[`${ch.cls}_start`]!;
  view.x = start.x * 0.6; view.y = start.y * 0.6;
  let hover: PassiveNode | null = null;
  let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
  const colorFor = (n: PassiveNode) => n.tree === 'central' ? '#b9a6ff' : CLASSES[n.tree].colors.accent;
  const draw = () => {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = canvas.clientWidth, H = canvas.clientHeight;
    if (!W) return;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const x = canvas.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = x.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, Math.max(W, H) * 0.7);
    bg.addColorStop(0, '#2a1a5a'); bg.addColorStop(0.45, '#140c34'); bg.addColorStop(1, '#06040f');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) { const sx = (Math.sin(i * 91.7) * 0.5 + 0.5) * W, sy = (Math.sin(i * 47.3 + 1) * 0.5 + 0.5) * H, a = 0.25 + (Math.sin(i * 13.1) * 0.5 + 0.5) * 0.6; x.fillStyle = `rgba(220,210,255,${a})`; x.fillRect(sx, sy, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1); }
    x.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * (W / 2 - view.x * view.z), dpr * (H / 2 - view.y * view.z));
    const q = search.value.trim().toLowerCase();
    // links
    for (const n of PASSIVE_NODES) for (const l of n.links) {
      if (l < n.id) continue;
      const o = PASSIVE_MAP[l]!;
      const both = own.has(n.id) && own.has(o.id);
      if (both) { x.shadowColor = '#ffcf5a'; x.shadowBlur = 18; }
      x.strokeStyle = both ? '#ffd76a' : 'rgba(170,150,235,0.32)';
      x.lineWidth = both ? 7 : 3;
      x.beginPath(); x.moveTo(n.x, n.y); x.lineTo(o.x, o.y); x.stroke();
      x.shadowBlur = 0;
    }
    for (const n of PASSIVE_NODES) {
      const r = n.kind === 'keystone' ? 30 : n.kind === 'notable' ? 22 : n.kind === 'start' ? 26 : 13;
      const allocated = own.has(n.id);
      const avail = !allocated && canAllocate(ch.cls, ch.passives, n.id);
      const foreign = n.tree !== 'central' && n.tree !== ch.cls;
      const match = q && (n.name.toLowerCase().includes(q) || (n.desc ?? '').toLowerCase().includes(q) || n.mods.some((m) => statText(m.stat, m.value).toLowerCase().includes(q)));
      x.globalAlpha = foreign ? 0.3 : 1;
      const base = n.kind === 'keystone' ? '#ffb02e' : n.kind === 'notable' ? '#9b6cff' : colorFor(n);
      const g2 = x.createRadialGradient(n.x - r * 0.3, n.y - r * 0.3, 1, n.x, n.y, r);
      g2.addColorStop(0, allocated ? '#ffffff' : '#4a3a7a'); g2.addColorStop(0.45, allocated ? base : '#2a2048'); g2.addColorStop(1, allocated ? '#1a0e30' : '#100a20');
      x.fillStyle = g2;
      if (allocated || match) { x.shadowColor = match ? '#5fffd0' : base; x.shadowBlur = n.kind === 'minor' ? 14 : 30; }
      x.strokeStyle = match ? '#5fffd0' : avail ? '#ffffff' : allocated ? '#ffd76a' : 'rgba(200,180,255,0.55)';
      x.lineWidth = match ? 8 : avail ? 5 : allocated ? 4 : 3;
      x.beginPath();
      if (n.kind === 'keystone') { for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, rr = i % 2 ? r * 0.72 : r * 1.15; x.lineTo(n.x + Math.cos(a) * rr, n.y + Math.sin(a) * rr); } x.closePath(); }
      else if (n.kind === 'notable') { x.moveTo(n.x, n.y - r); x.lineTo(n.x + r, n.y); x.lineTo(n.x, n.y + r); x.lineTo(n.x - r, n.y); x.closePath(); }
      else x.arc(n.x, n.y, r, 0, Math.PI * 2);
      x.fill(); x.stroke(); x.shadowBlur = 0;
      if (n.kind !== 'minor') { x.strokeStyle = allocated ? '#fff4c0' : 'rgba(200,180,255,0.35)'; x.lineWidth = 2; x.beginPath(); x.arc(n.x, n.y, r * 0.55, 0, Math.PI * 2); x.stroke(); }
      if (n.kind !== 'minor' && view.z > 0.25) { x.fillStyle = '#efe8ff'; x.font = "600 22px Cinzel, Georgia, serif"; x.textAlign = 'center'; x.fillText(n.name, n.x, n.y + r + 24); }
      x.globalAlpha = 1;
    }
    // tree labels
    x.font = "700 48px Cinzel, Georgia, serif"; x.textAlign = 'center';
    for (const n of PASSIVE_NODES) if (n.kind === 'start') { x.fillStyle = n.tree === ch.cls ? colorFor(n) : 'rgba(200,190,230,0.3)'; x.fillText(CLASSES[n.tree as keyof typeof CLASSES].name, n.x * 1.08, n.y * 1.08 - 40); }
    x.fillStyle = 'rgba(200,190,255,0.5)'; x.fillText('ASTRAL CORE', 0, 10);
  };
  const toWorld = (ev: MouseEvent): [number, number] => { const r = canvas.getBoundingClientRect(); return [(ev.clientX - r.left - r.width / 2) / view.z + view.x, (ev.clientY - r.top - r.height / 2) / view.z + view.y]; };
  const nodeAt = (ev: MouseEvent) => { const [wx, wy] = toWorld(ev); return PASSIVE_NODES.find((n) => Math.hypot(n.x - wx, n.y - wy) < (n.kind === 'minor' ? 20 : 34)) ?? null; };
  canvas.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false }; });
  addEventListener('mouseup', () => { drag = null; });
  canvas.addEventListener('mousemove', (e) => {
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; view.x = drag.vx - dx / view.z; view.y = drag.vy - dy / view.z; draw(); return; }
    const n = nodeAt(e);
    if (n !== hover) { hover = n; if (n) showTip(nodeTip(n, ch), e.clientX, e.clientY); else hideTip(); }
  });
  canvas.addEventListener('mouseleave', hideTip);
  canvas.addEventListener('click', (e) => { if (drag?.moved) return; const n = nodeAt(e); if (!n) return; if (own.has(n.id)) return; if (pts <= 0) return toast('No passive points available', 'error'); send({ t: 'passive_alloc', node: n.id }); });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); const n = nodeAt(e); if (n && ch.passives.includes(n.id)) send({ t: 'passive_refund', node: n.id }); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); view.z = Math.max(0.12, Math.min(1.2, view.z * (e.deltaY > 0 ? 0.9 : 1.1))); draw(); }, { passive: false });
  // touch pan
  let tp: { x: number; y: number } | null = null;
  canvas.addEventListener('touchstart', (e) => { const t0 = e.touches[0]!; tp = { x: t0.clientX, y: t0.clientY }; }, { passive: true });
  canvas.addEventListener('touchmove', (e) => { const t0 = e.touches[0]!; if (tp) { view.x -= (t0.clientX - tp.x) / view.z; view.y -= (t0.clientY - tp.y) / view.z; tp = { x: t0.clientX, y: t0.clientY }; draw(); } }, { passive: true });
  search.oninput = draw;
  new ResizeObserver(draw).observe(canvas);
  const keystones = ch.passives.map((p) => PASSIVE_MAP[p]).filter((n) => n?.kind === 'keystone');
  const presetName = h('input', { type: 'text', maxLength: 20, placeholder: 'Preset name', 'aria-label': 'Preset name' });
  const code = encodeBuild(ch.cls, ch.passives, ch.loadout.active, ch.loadout.ultimate);
  const th = getLang() === 'th';
  const st = computeStats(ch), d = CLASSES[ch.cls];
  const statRow = (ic: string, k: string, v: string) => h('div', { class: 'srow' }, uiIcon(ic, 18), h('span', null, k), h('b', null, v));
  const left = h('div', { class: 'pt-left' },
    h('div', { class: 'pt-class' }, uiIcon('emblem', 44, d.colors.accent), h('div', null, h('b', null, d.name), h('small', { class: 'muted' }, d.role))),
    h('div', { class: 'sec-title' }, th ? 'ค่าสถานะปัจจุบัน (รวมบิลด์)' : 'Current Stats (Build Applied)'),
    statRow('crossed', th ? 'พลัง' : 'Power', st.power.toFixed(1)), statRow('heal', 'HP', String(st.maxHp)), statRow('orb', d.resource.name, String(st.maxRes)),
    statRow('star', th ? 'โอกาสคริ' : 'Crit Rate', `${st.critChance.toFixed(1)}%`), statRow('awaken', th ? 'ดาเมจคริ' : 'Crit DMG', `${st.critMult}%`),
    statRow('dodge', th ? 'ความเร็วร่าย' : 'Cast SPD', `${Math.round(st.castSpeed * 100)}%`), statRow('dash', th ? 'ความเร็วโจมตี' : 'Attack SPD', `${Math.round(st.atkSpeed * 100)}%`),
    statRow('blink', 'CDR', `${Math.round(st.cdr * 100)}%`), statRow('shield', th ? 'เกราะ' : 'Armor', String(st.armor)), statRow('moon', th ? 'หลบ / บล็อก' : 'Dodge / Block', `${st.dodge.toFixed(1)}% / ${st.block}%`),
    statRow('drain', th ? 'ดูดเลือด' : 'Leech', `${(st.leech * 100).toFixed(1)}%`));
  const legend = h('div', { class: 'pt-legend' }, ...([['#ffb02e', th ? 'โหนดคีย์สโตน' : 'Keystone Node', 'ks'], ['#9b6cff', th ? 'โหนดเด่น' : 'Notable Node', 'nt'], ['#8fb8ff', th ? 'โหนดย่อย' : 'Minor Node', 'mn']] as const).map(([c, l, k]) => h('div', { class: 'lg' }, h('i', { class: 'lg-' + k, style: `--c:${c}` }), l)), h('div', { class: 'lg' }, h('i', { class: 'lg-path on' }), th ? 'เส้นทาง (ปลดล็อก)' : 'Path (Unlocked)'), h('div', { class: 'lg' }, h('i', { class: 'lg-path' }), th ? 'เส้นทาง (ล็อก)' : 'Path (Locked)'));
  const right = h('div', { class: 'pt-right' },
    h('div', { class: 'sec-title' }, th ? 'กลไกอาชีพ' : 'Class Mechanic'), h('p', { class: 'muted' }, d.mechanic),
    h('div', { class: 'sec-title' }, th ? 'คีย์สโตนที่ใช้อยู่' : 'Active Keystones'),
    keystones.length ? h('div', { class: 'col' }, ...keystones.map((k) => h('div', { class: 'ks' }, h('b', null, '✸ ' + k!.name), h('small', { class: 'muted' }, k!.desc ?? '')))) : h('p', { class: 'muted' }, th ? 'ยังไม่มี' : 'None yet'),
    h('div', { class: 'sec-title' }, th ? 'สรุปบิลด์' : 'Build Summary'),
    h('div', { class: 'bsum' }, h('span', null, th ? 'อาชีพ' : 'Class'), h('b', null, d.name), h('span', null, th ? 'แต้มพาสซีฟ' : 'Passive Points'), h('b', null, `${ch.passives.length} / ${passivePointsFor(ch.level, ch.bonusPoints)}`), h('span', null, 'CP'), h('b', null, combatPower(st).toLocaleString())));
  const loadoutRow = (kind: 'active' | 'ultimate') => h('div', { class: 'lo-group' }, h('div', { class: 'hb-title' }, kind === 'active' ? (th ? 'สกิลแอคทีฟ (1-8)' : 'Active Skills (1-8)') : (th ? 'สกิลอัลติเมต (9-12)' : 'Ultimate Skills (9-12)')),
    h('div', { class: 'lo-slots' }, ...ch.loadout[kind].map((id, i) => { const sk = id ? SKILL_MAP[id] : null; return h('div', { class: 'lo' }, sk ? skillIcon(sk, 46) : h('div', { class: 'lo-empty' }), h('em', null, String(kind === 'active' ? i + 1 : i + 9)), h('small', null, sk?.name ?? '—')); })));
  return h('div', { class: 'passive-panel' },
    h('div', { class: 'pt-top' },
      h('div', null, h('b', { class: 'gold' }, `${t('points')}: ${pts}`), h('span', { class: 'muted' }, ` · ${th ? 'ใช้ไป' : 'used'} ${ch.passives.length} / ${passivePointsFor(ch.level, ch.bonusPoints)} · ${th ? 'รีเซ็ต' : 'respec'} ${respecCost(ch) ? respecCost(ch) + 'g' : (th ? 'ฟรีถึงเลเวล 15' : 'free until lv 15')} · ${th ? 'คืน 1 โหนด' : 'refund 1 node'} ${refundCost(ch) ? refundCost(ch) + 'g' : (th ? 'ฟรี' : 'free')}`)),
      search,
      h('button', { class: 'btn gold', disabled: !inTown, title: inTown ? '' : 'Town only', onclick: async () => { if (await confirmDialog(t('respec'), `Cost: ${respecCost(ch)} gold${ch.respecTokens && respecCost(ch) ? ` — a respec token will be used instead (${ch.respecTokens} left)` : ''}. All allocated nodes are refunded.`, t('confirm'), t('cancel'))) send({ t: 'respec', token: ch.respecTokens > 0 && respecCost(ch) > 0 }); } }, '⟲ ' + t('respec'))),
    h('div', { class: 'pt-cols' }, left, h('div', { class: 'pt-tree' }, canvas, legend), right),
    h('div', { class: 'pt-bottom' }, h('div', { class: 'loadout-bar' }, loadoutRow('active'), loadoutRow('ultimate')),
      h('div', { class: 'pt-builds' },
        presetName, h('button', { class: 'btn gold', onclick: () => send({ t: 'preset_save', name: presetName.value || 'Preset' }) }, th ? 'บันทึกบิลด์' : 'Save Build'),
        ...ch.presets.map((p, i) => h('button', { class: 'btn', disabled: !inTown, onclick: () => send({ t: 'preset_load', idx: i }) }, `${t('load')}: ${p.name}`)),
        h('button', { class: 'btn ghost', onclick: () => { navigator.clipboard?.writeText(code).then(() => toast('Build code copied', 'good'), () => void promptDialog(t('exportBuild'), 'Copy this code:', code)); } }, '⇪ ' + t('exportBuild')),
        h('button', { class: 'btn ghost', disabled: !inTown, onclick: async () => { const c = await promptDialog(t('importBuild'), 'Paste a build code (ASTRA1.…). Applying it counts as a respec.'); if (c) send({ t: 'import_build', code: c.trim() }); } }, '⇩ ' + t('importBuild')))),
    h('p', { class: 'hint' }, th ? 'คลิกโหนดที่เรืองแสงเพื่อลงแต้ม · คลิกขวาเพื่อคืน · ลากเพื่อเลื่อน · ล้อเมาส์เพื่อซูม' : 'Click a glowing node to allocate · right-click to refund · drag to pan · wheel to zoom.'),
  );
}

function nodeTip(n: PassiveNode, ch: CharacterData) {
  const allocated = ch.passives.includes(n.id) || n.kind === 'start';
  return h('div', { class: 'tip' },
    h('div', { class: 'tip-title', style: `color:${n.kind === 'keystone' ? '#ff9a2e' : n.kind === 'notable' ? '#b9a6ff' : '#eee'}` }, n.name),
    h('div', { class: 'tip-sub' }, `${n.kind.toUpperCase()} · ${n.tree === 'central' ? 'Astral Core' : CLASSES[n.tree].name}${allocated ? ' · allocated' : ''}`),
    n.desc ? h('p', { class: n.kind === 'keystone' ? 'tip-legend' : '' }, n.desc) : null,
    h('ul', { class: 'tip-fx' }, n.mods.map((m) => statText(m.stat, m.value)).filter(Boolean).map((l) => h('li', null, l))),
    !allocated && !canAllocate(ch.cls, ch.passives, n.id) ? h('div', { class: 'tip-meta' }, n.tree !== 'central' && n.tree !== ch.cls ? 'Belongs to another class tree' : 'Not connected yet') : null,
  );
}
