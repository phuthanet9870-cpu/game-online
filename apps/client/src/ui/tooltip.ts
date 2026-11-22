import { AFFIX_MAP, CLASSES, ITEM_BASE_MAP, LEGENDARY_POWERS, RARITY_DEFS, computeStats, itemMods, statLabel, type CharacterData, type Item, type SkillDef, type SkillEffect, type Derived } from '@astra/shared';
import { h, svg } from './dom.js';

const ICONS: Record<string, string> = {
  arc: 'M4 18c4-10 12-12 16-12M6 20c3-6 8-9 14-9', leap: 'M4 20l6-12 4 6 6-10M14 4h6v6', shout: 'M4 10h4l6-5v14l-6-5H4zM18 8c1.5 1.5 1.5 6.5 0 8',
  spin: 'M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M21 3l-4 4', slash: 'M5 19L19 5M9 19l10-10M5 15L15 5', dash: 'M3 12h12M11 6l6 6-6 6M19 6v12',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', slam: 'M12 3v10M7 8l5 5 5-5M3 21h18M6 17l-2 4M18 17l2 4', crown: 'M3 18h18L19 7l-4 5-3-7-3 7-4-5z',
  axe: 'M6 20L18 4M14 4c4 0 6 3 6 6-3 0-6-2-6-6z', banner: 'M6 21V3M6 4h12l-3 4 3 4H6', fire: 'M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-6 2 1 3 3 3 3s-1-5 1-8z',
  ice: 'M12 2v20M4 6l16 12M20 6L4 18M9 3l3 3 3-3M9 21l3-3 3 3', bolt: 'M13 2L5 14h6l-1 8 8-12h-6z', blink: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 12h3M18 12h3M12 3v3M12 18v3',
  spear: 'M3 21L17 7M14 4l6 0 0 6M17 7l3-3', orb: 'M12 12m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0M8 12l2-3 2 4 2-3', meteor: 'M15 9a4 4 0 1 0 0 .1M3 3l8 8M3 9l5 5M9 3l5 5',
  star: 'M12 3l2.6 5.6 6 .7-4.5 4 1.3 6L12 16.6 6.6 19.3l1.3-6-4.5-4 6-.7z', knives: 'M4 20L14 4M10 20L18 6M16 20l4-8', poison: 'M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11zM9 14h.01M14 12h.01',
  smoke: 'M5 16a4 4 0 0 1 2-7 5 5 0 0 1 9-1 4 4 0 0 1 3 7z', mark: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0M12 2v4M12 18v4M2 12h4M18 12h4',
  moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z', clone: 'M8 8h12v12H8zM4 4h12v2M4 4v12h2', dagger: 'M14 4l6-1-1 6-9 9-4-4zM6 14l-3 3 4 4 3-3', arrows: 'M4 20L20 4M20 4h-6M20 4v6M4 14l6-6M4 8l2-2',
  trap: 'M4 16l4-8 4 8 4-8 4 8M3 18h18', rain: 'M6 4v6M12 3v8M18 4v6M8 14l-2 6M14 13l-2 7M20 14l-2 6', bird: 'M3 12c4-4 7-4 9 0 2-4 5-4 9 0M12 12v6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0', hammer: 'M14 4l6 6-3 3-6-6zM11 7L3 15l4 4 8-8', heal: 'M12 5v14M5 12h14',
  sun: 'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2', pillar: 'M8 21V5M16 21V5M5 5h14M5 21h14M12 2v3',
  skull: 'M12 3a7 7 0 0 0-7 7c0 3 2 4 2 6h10c0-2 2-3 2-6a7 7 0 0 0-7-7zM9 11h.01M15 11h.01M9 19v2M12 19v2M15 19v2', curse: 'M12 3v18M5 8l14 8M19 8L5 16',
  soul: 'M12 3c-4 4-6 7-6 10a6 6 0 0 0 12 0c0-3-2-6-6-10zM12 12v5', drain: 'M4 12h6M14 12h6M8 8l-4 4 4 4M16 8l4 4-4 4', ghost: 'M6 21V10a6 6 0 0 1 12 0v11l-3-2-3 2-3-2zM10 10h.01M14 10h.01',
  sword: 'M4 20l4-4M7 17L19 5V3h-2L5 15M14 10l2 2', staff: 'M6 21L18 5M18 5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0', wand: 'M4 20L16 8M17 3v3M20 6h-3M19 9l-1-1', bow: 'M6 3c8 3 8 15 0 18M6 3v18M3 12h15',
  scythe: 'M6 21L14 7M14 7c2-3 6-4 8-2-3 0-6 1-8 2z', tome: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11', helm: 'M5 15a7 7 0 0 1 14 0v3H5zM12 8v10',
  chest: 'M6 4l6 2 6-2 2 6-2 10H6L4 10z', gloves: 'M7 21v-8l-2-4 2-1 2 3V4h2v7V3h2v8V4h2v9l2-2 1 2-3 8z', boots: 'M7 3h6v10l6 3v5H7z', ring: 'M12 14m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0M9 4h6l-3 4z',
  amulet: 'M6 3c0 6 12 6 12 0M12 9v3M12 16m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0', relic: 'M12 2l7 7-7 13-7-13zM5 9h14', rune: 'M6 3h12v18H6zM9 7l6 5-6 5',
};
export function icon(id: string, color: string, size = 28) { return svg(ICONS[id] ?? ICONS.star!, color, size); }

const TYPE_COL: Record<string, string> = { physical: '#e8e2d0', fire: '#ff8a3d', ice: '#8fe3ff', lightning: '#c8b5ff', holy: '#ffe58a', shadow: '#c58cff', poison: '#8ff06a' };

export function skillColor(s: SkillDef): string {
  const t = ['fire', 'ice', 'lightning', 'holy', 'shadow', 'poison'].find((x) => s.tags.includes(x));
  return t ? TYPE_COL[t]! : CLASSES[s.cls].colors.accent;
}

function effectLine(fx: SkillEffect, st: Derived | null): string | null {
  const dmg = (d: { coef: number; type: string }) => `${Math.round(d.coef * 100)}% power${st ? ` (~${Math.round(d.coef * st.power)})` : ''} ${d.type}`;
  switch (fx.t) {
    case 'melee': return `Melee: ${dmg(fx.dmg)} in a ${fx.arc}° arc, ${fx.range}px reach${fx.dmg.status ? `; ${Math.round(fx.dmg.status.chance * 100)}% ${fx.dmg.status.id}` : ''}`;
    case 'projectile': return `Projectile${(fx.count ?? 1) > 1 ? ` ×${fx.count}` : ''}: ${dmg(fx.dmg)}${fx.pierce ? ', pierces' : ''}${fx.chain ? `, chains ${fx.chain}×` : ''}${fx.explode ? `, explodes (${fx.explode.radius}px)` : ''}${fx.dmg.status ? `; ${Math.round(fx.dmg.status.chance * 100)}% ${fx.dmg.status.id}` : ''}`;
    case 'area': return `Area${(fx.count ?? 1) > 1 ? ` ×${fx.count}` : ''} (${fx.radius}px${fx.delay ? `, ${fx.delay}s delay` : ''}${fx.duration ? `, ${fx.duration}s` : ''})${fx.dmg ? `: ${dmg(fx.dmg)}${fx.duration ? ` every ${fx.tick ?? 0.5}s` : ''}` : ''}${fx.healPct ? `, heals ${(fx.healPct * 100).toFixed(1)}% life per tick` : ''}${fx.dmg?.status ? `; ${Math.round(fx.dmg.status.chance * 100)}% ${fx.dmg.status.id}` : ''}`;
    case 'dash': return `Dash ${fx.dist}px${fx.invuln ? ' (invulnerable)' : ''}${fx.dmg ? `, ${dmg(fx.dmg)} to enemies in path` : ''}`;
    case 'buff': return `${fx.name} (${fx.duration}s): ${fx.mods.map((m) => statLabel(m.stat, m.value)).filter(Boolean).join(', ')}${fx.party ? ' — party' : ''}`;
    case 'heal': return `Heal ${Math.round(fx.pct * 100)}% life${fx.radius ? ' (allies nearby)' : ''}`;
    case 'barrier': return `Barrier ${Math.round(fx.pct * 100)}% life for ${fx.duration}s${fx.radius ? ' (allies nearby)' : ''}`;
    case 'summon': return `Summon ${fx.count}× ${fx.minion} for ${fx.duration}s`;
    case 'gain': return `Gain${fx.resource ? ` ${fx.resource} resource` : ''}${fx.secondary ? ` ${fx.secondary} secondary` : ''}`;
    case 'taunt': return `Taunt enemies within ${fx.radius}px for ${fx.duration}s`;
    default: return null;
  }
}

export function skillTooltip(s: SkillDef, ch: CharacterData | null): HTMLElement {
  const st = ch ? computeStats(ch) : null;
  const res = CLASSES[s.cls].resource.name;
  return h('div', { class: 'tip' },
    h('div', { class: 'tip-title', style: `color:${skillColor(s)}` }, s.name, h('span', { class: 'tip-kind' }, s.kind === 'ultimate' ? ' · ULTIMATE' : ' · Active')),
    h('div', { class: 'tip-sub' }, `${s.targeting} · ${s.tags.join(', ')}`),
    h('p', null, s.desc),
    h('ul', { class: 'tip-fx' }, s.effects.map((fx) => effectLine(fx, st)).filter(Boolean).map((l) => h('li', null, l))),
    s.consumeSecondary ? h('p', { class: 'tip-note' }, `Finisher: +${Math.round(s.consumeSecondary.bonusPerPoint * 100)}% damage per ${CLASSES[s.cls].secondary?.name ?? 'point'} consumed.`) : null,
    h('div', { class: 'tip-meta' }, `Cost ${s.cost} ${res} · Cooldown ${s.cooldown}s · Cast ${s.cast}s${s.range ? ` · Range ${s.range}` : ''} · Unlocks at level ${s.unlockLevel}`),
  );
}

export function itemTooltip(it: Item, compare?: Item | null): HTMLElement {
  const rd = RARITY_DEFS[it.rarity];
  const base = ITEM_BASE_MAP[it.baseId];
  const lines = (x: Item) => itemMods(x).map((m) => statLabel(m.stat, m.value)).filter(Boolean);
  const cmp = compare ? statDiff(compare, it) : null;
  return h('div', { class: 'tip', style: `border-color:${rd.color}` },
    h('div', { class: 'tip-title', style: `color:${rd.color}` }, `${rd.glyph} ${it.name}`),
    h('div', { class: 'tip-sub' }, `${rd.name} ${it.slot} · item level ${it.ilvl} · requires level ${it.reqLevel}${base?.classes ? ` · affinity: ${base.classes.join('/')}` : ''}`),
    it.weaponPower ? h('div', { class: 'tip-big' }, `${it.weaponPower} Weapon Power`) : null,
    h('ul', { class: 'tip-fx implicit' }, it.implicit.map((m) => h('li', null, statLabel(m.stat, m.value)))),
    h('ul', { class: 'tip-fx' }, it.affixes.map((a) => h('li', null, AFFIX_MAP[a.id] ? AFFIX_MAP[a.id]!.label.replace('{v}', String(a.value)) : statLabel(a.stat, a.value), h('span', { class: 'tier' }, ` T${a.tier}`)))),
    it.power ? h('p', { class: 'tip-legend' }, LEGENDARY_POWERS[it.power]?.desc ?? '') : null,
    h('div', { class: 'tip-meta' }, [it.bound ? 'Bound to character' : 'Tradeable', it.hardcore ? 'Hardcore' : null].filter(Boolean).join(' · ')),
    cmp && cmp.length ? h('div', { class: 'tip-cmp' }, h('div', { class: 'tip-sub' }, `Compared to equipped ${compare!.name}:`), h('ul', { class: 'tip-fx' }, cmp.map(([k, v]) => h('li', { class: v > 0 ? 'up' : 'down' }, statLabel(k, Math.round(v * 100) / 100))))) : null,
    void lines,
  );
}

function statDiff(a: Item, b: Item): Array<[string, number]> {
  const sum = (x: Item) => { const m: Record<string, number> = {}; for (const md of itemMods(x)) m[md.stat] = (m[md.stat] ?? 0) + md.value; if (x.weaponPower) m.weaponPower = x.weaponPower; return m; };
  const ma = sum(a), mb = sum(b);
  const keys = new Set([...Object.keys(ma), ...Object.keys(mb)]);
  const out: Array<[string, number]> = [];
  for (const k of keys) { const d = (mb[k] ?? 0) - (ma[k] ?? 0); if (Math.abs(d) > 0.001 && !k.startsWith('flag')) out.push([k === 'weaponPower' ? 'weaponPowerFlat' : k, d]); }
  return out.map(([k, v]) => [k === 'weaponPowerFlat' ? 'Weapon Power' : k, v] as [string, number]);
}

/** Floating tooltip that follows the pointer. */
let tipEl: HTMLElement | null = null;
export function showTip(content: HTMLElement, x: number, y: number) {
  hideTip();
  tipEl = h('div', { class: 'tip-float' }, content);
  document.body.append(tipEl);
  const r = tipEl.getBoundingClientRect();
  tipEl.style.left = Math.max(8, Math.min(innerWidth - r.width - 8, x + 16)) + 'px';
  tipEl.style.top = Math.max(8, Math.min(innerHeight - r.height - 8, y + 16)) + 'px';
}
export function hideTip() { tipEl?.remove(); tipEl = null; }
export function bindTip(el: HTMLElement, make: () => HTMLElement) {
  el.addEventListener('mouseenter', (e) => showTip(make(), e.clientX, e.clientY));
  el.addEventListener('mousemove', (e) => { if (tipEl) { tipEl.style.left = Math.min(innerWidth - tipEl.offsetWidth - 8, e.clientX + 16) + 'px'; tipEl.style.top = Math.min(innerHeight - tipEl.offsetHeight - 8, e.clientY + 16) + 'px'; } });
  el.addEventListener('mouseleave', hideTip);
}
