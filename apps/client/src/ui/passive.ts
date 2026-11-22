import { CLASSES, PASSIVE_MAP, PASSIVE_NODES, canAllocate, encodeBuild, passivePointsFor, respecCost, refundCost, statLabel, type CharacterData, type PassiveNode } from '@astra/shared';
import { statText } from '../l10n.js';
import { t } from '../i18n.js';
import { confirmDialog, h, promptDialog, toast } from './dom.js';
import { hideTip, showTip } from './tooltip.js';

export function passiveTreePanel(ch: CharacterData, send: (m: any) => void, inTown: boolean): HTMLElement {
  const canvas = h('canvas', { class: 'tree-canvas', tabIndex: 0, 'aria-label': 'Passive tree. Click a node to allocate; right click to refund.' });
  const search = h('input', { type: 'search', placeholder: t('search'), 'aria-label': t('search') });
  const pts = passivePointsFor(ch.level, ch.bonusPoints) - ch.passives.length;
  const own = new Set([...ch.passives, `${ch.cls}_start`]);
  const view = { x: 0, y: 0, z: 0.32 };
  // centre on class start
  const start = PASSIVE_MAP[`${ch.cls}_start`]!;
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
    x.fillStyle = '#0d0a16'; x.fillRect(0, 0, W, H);
    x.setTransform(dpr * view.z, 0, 0, dpr * view.z, dpr * (W / 2 - view.x * view.z), dpr * (H / 2 - view.y * view.z));
    const q = search.value.trim().toLowerCase();
    // links
    for (const n of PASSIVE_NODES) for (const l of n.links) {
      if (l < n.id) continue;
      const o = PASSIVE_MAP[l]!;
      const both = own.has(n.id) && own.has(o.id);
      x.strokeStyle = both ? '#ffd76a' : 'rgba(150,140,190,0.35)';
      x.lineWidth = both ? 6 : 3;
      x.beginPath(); x.moveTo(n.x, n.y); x.lineTo(o.x, o.y); x.stroke();
    }
    for (const n of PASSIVE_NODES) {
      const r = n.kind === 'keystone' ? 30 : n.kind === 'notable' ? 22 : n.kind === 'start' ? 26 : 13;
      const allocated = own.has(n.id);
      const avail = !allocated && canAllocate(ch.cls, ch.passives, n.id);
      const foreign = n.tree !== 'central' && n.tree !== ch.cls;
      const match = q && (n.name.toLowerCase().includes(q) || (n.desc ?? '').toLowerCase().includes(q) || n.mods.some((m) => statText(m.stat, m.value).toLowerCase().includes(q)));
      x.globalAlpha = foreign ? 0.3 : 1;
      x.fillStyle = allocated ? colorFor(n) : '#221c33';
      x.strokeStyle = match ? '#5fffd0' : avail ? '#ffffff' : allocated ? '#ffd76a' : 'rgba(180,170,220,0.6)';
      x.lineWidth = match ? 8 : avail ? 5 : 3;
      x.beginPath();
      if (n.kind === 'keystone') { for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; x.lineTo(n.x + Math.cos(a) * r, n.y + Math.sin(a) * r); } x.closePath(); }
      else if (n.kind === 'notable') { x.moveTo(n.x, n.y - r); x.lineTo(n.x + r, n.y); x.lineTo(n.x, n.y + r); x.lineTo(n.x - r, n.y); x.closePath(); }
      else x.arc(n.x, n.y, r, 0, Math.PI * 2);
      x.fill(); x.stroke();
      if (n.kind !== 'minor' && view.z > 0.25) { x.fillStyle = '#efe8ff'; x.font = '600 22px system-ui'; x.textAlign = 'center'; x.fillText(n.name, n.x, n.y + r + 24); }
      x.globalAlpha = 1;
    }
    // tree labels
    x.font = '800 48px system-ui'; x.textAlign = 'center';
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
  return h('div', { class: 'passive-panel' },
    h('div', { class: 'row between wrap' },
      h('div', null, h('b', null, `${t('points')}: ${pts}`), h('span', { class: 'muted' }, ` · allocated ${ch.passives.length} · respec ${respecCost(ch) ? respecCost(ch) + 'g' : 'free until lv 15'} · refund 1 node ${refundCost(ch) ? refundCost(ch) + 'g' : 'free'}`)),
      search),
    keystones.length ? h('div', { class: 'keystones' }, keystones.map((k) => h('span', { class: 'tag key' }, '⬢ ' + k!.name))) : null,
    canvas,
    h('p', { class: 'hint' }, 'Click a glowing node to allocate · right-click to refund · drag to pan · wheel to zoom. Nodes must connect to your class start; the Astral Core links all six trees.'),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', disabled: !inTown, title: inTown ? '' : 'Town only', onclick: async () => { if (await confirmDialog(t('respec'), `Cost: ${respecCost(ch)} gold${ch.respecTokens && respecCost(ch) ? ` — a respec token will be used instead (${ch.respecTokens} left)` : ''}. All allocated nodes are refunded.`, t('confirm'), t('cancel'))) send({ t: 'respec', token: ch.respecTokens > 0 && respecCost(ch) > 0 }); } }, t('respec')),
      presetName, h('button', { class: 'btn', onclick: () => send({ t: 'preset_save', name: presetName.value || 'Preset' }) }, t('save')),
      ch.presets.map((p, i) => h('button', { class: 'btn ghost', disabled: !inTown, onclick: () => send({ t: 'preset_load', idx: i }) }, `${t('load')}: ${p.name}`)),
      h('button', { class: 'btn ghost', onclick: () => { navigator.clipboard?.writeText(code).then(() => toast('Build code copied', 'good'), () => void promptDialog(t('exportBuild'), 'Copy this code:', code)); } }, t('exportBuild')),
      h('button', { class: 'btn ghost', disabled: !inTown, onclick: async () => { const c = await promptDialog(t('importBuild'), 'Paste a build code (ASTRA1.…). Applying it counts as a respec.'); if (c) send({ t: 'import_build', code: c.trim() }); } }, t('importBuild'))),
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
