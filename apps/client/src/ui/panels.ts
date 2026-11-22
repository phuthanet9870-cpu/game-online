import {
  ACHIEVEMENTS, BLESSING_MAP, CLASSES, DIFFICULTIES, DIFFICULTY_ORDER, DUNGEON_MODIFIERS, ENEMIES, EQUIP_SLOTS, LORE, POTION, QUESTS, RARITY_DEFS, SKILL_MAP, classSkills, computeStats, enchantCost,
  masteryToNext, sellValue, salvageValue, statLabel, xpToNext, AFFIX_MAP, type CharacterData, type EquipSlot, type Item, type AccountProgress,
} from '@astra/shared';
import { statText } from '../l10n.js';
import { ct, t, getLang, setLang } from '../i18n.js';
import { ACTIVITIES, ACTIVITY_ORDER, ELIXIRS, MATERIALS, PETS, PROFESSIONS, type Activity } from '@astra/shared';
import { BIND_LABELS, DEFAULT_BINDS, keyLabel, saveBinds, type Input } from '../input.js';
import { clear, h, promptDialog, toast } from './dom.js';
import { bindTip, hideTip, icon, itemTooltip, skillColor, skillTooltip } from './tooltip.js';
import { passiveTreePanel } from './passive.js';
import { sound } from '../audio.js';

export interface PanelCtx {
  ch: CharacterData;
  account: AccountProgress;
  send: (m: any) => void;
  room: { kind: string; difficulty: string; modifiers: string[] } | null;
  input: Input;
  settings: { quality: string; style: 'action' | 'tab'; numbers: boolean; uiScale: number };
  applySettings: () => void;
  logout: () => void;
  extra?: any;
  party: { id: string | null; leader: string | null; members: Array<{ name: string; cls: string; level: number; room: string }> };
}

const SLOT_ICON: Record<string, string> = { weapon: 'sword', helmet: 'helm', chest: 'chest', gloves: 'gloves', boots: 'boots', ring1: 'ring', ring2: 'ring', necklace: 'amulet', relic: 'relic', rune: 'rune' };
const ITEM_ICON = (it: Item) => ({ weapon: 'sword', helmet: 'helm', chest: 'chest', gloves: 'gloves', boots: 'boots', ring: 'ring', necklace: 'amulet', relic: 'relic', rune: 'rune' })[it.slot] ?? 'star';

function itemCell(it: Item | null | undefined, opts: { onclick?: () => void; oncontext?: () => void; compare?: Item | null; placeholder?: string; label?: string }) {
  const rd = it ? RARITY_DEFS[it.rarity] : null;
  const cell = h('button', { class: 'cell' + (it ? ' has' : ''), style: rd ? `border-color:${rd.color};box-shadow: inset 0 0 12px ${rd.color}44` : '', 'aria-label': it ? `${rd!.name} ${it.name}` : opts.label ?? 'empty' },
    it ? icon(it.baseId.startsWith('w_') ? (it.baseId.includes('bow') ? 'bow' : it.baseId.includes('staff') ? 'staff' : it.baseId.includes('wand') ? 'wand' : it.baseId.includes('dagger') || it.baseId.includes('claw') ? 'dagger' : it.baseId.includes('mace') ? 'hammer' : it.baseId.includes('shield') ? 'shield' : it.baseId.includes('scythe') ? 'scythe' : it.baseId.includes('tome') ? 'tome' : it.baseId.includes('axe') ? 'axe' : 'sword') : ITEM_ICON(it), rd!.color, 26) : opts.placeholder ? icon(opts.placeholder, '#4a4366', 22) : null,
    it ? h('span', { class: 'rar-glyph', style: `color:${rd!.color}` }, rd!.glyph) : null);
  if (it) bindTip(cell, () => itemTooltip(it, opts.compare));
  if (opts.onclick) cell.onclick = () => { hideTip(); opts.onclick!(); };
  if (opts.oncontext) cell.oncontextmenu = (e) => { e.preventDefault(); hideTip(); opts.oncontext!(); };
  return cell;
}

function equippedFor(ch: CharacterData, it: Item): Item | null {
  if (it.slot === 'ring') return ch.equipment.ring1 ?? null;
  return (ch.equipment[it.slot as EquipSlot] as Item | undefined) ?? null;
}

/** Inventory + equipment. `mode` adds vendor actions (smith/quartermaster/stash). */
export function inventoryPanel(ctx: PanelCtx, mode: 'normal' | 'smith' | 'quartermaster' | 'stash' = 'normal'): HTMLElement {
  const { ch, send } = ctx;
  let selected: number | null = null;
  const actions = h('div', { class: 'item-actions' });
  const renderActions = () => {
    clear(actions);
    if (selected === null || !ch.inventory[selected]) { actions.append(h('p', { class: 'hint' }, 'Click an item to select it · right-click to equip quickly.')); return; }
    const it = ch.inventory[selected]!;
    const i = selected;
    actions.append(h('div', { class: 'row wrap' },
      h('b', { style: `color:${RARITY_DEFS[it.rarity].color}` }, it.name),
      h('button', { class: 'btn', onclick: () => send({ t: 'equip', inv: i }) }, t('equip')),
      it.slot === 'ring' ? h('button', { class: 'btn ghost', onclick: () => send({ t: 'equip', inv: i, slot: 'ring2' }) }, t('equip') + ' (ring 2)') : null,
      mode === 'smith' ? h('button', { class: 'btn', onclick: () => send({ t: 'salvage', inv: i }) }, `${t('salvage')} (+${salvageValue(it)} ${t('dust')})`) : null,
      mode === 'quartermaster' ? h('button', { class: 'btn', onclick: () => send({ t: 'sell', inv: i }) }, `${t('sell')} (+${sellValue(it)}g)`) : null,
      mode === 'stash' ? h('button', { class: 'btn', disabled: it.bound, onclick: () => send({ t: 'stash_put', inv: i }) }, t('store')) : null,
      mode === 'smith' && it.affixes.length ? h('span', { class: 'muted' }, `${t('enchant')} (${enchantCost(it).dust} dust, ${enchantCost(it).gold}g):`) : null,
      mode === 'smith' ? it.affixes.map((a, ai) => h('button', { class: 'btn ghost tiny', title: 'Reroll this affix', onclick: () => send({ t: 'enchant', inv: i, affix: ai }) }, `↻ ${AFFIX_MAP[a.id]?.label.replace('{v}', String(a.value)) ?? a.stat}`)) : null,
    ));
  };
  const inv = h('div', { class: 'inv-grid' }, ch.inventory.map((it, i) => {
    const c = itemCell(it, { compare: it ? equippedFor(ch, it) : null, onclick: () => { selected = i; renderActions(); for (const el of Array.from(inv.children)) el.classList.remove('sel'); c.classList.add('sel'); }, oncontext: it ? () => send({ t: 'equip', inv: i }) : undefined });
    return c;
  }));
  const eq = h('div', { class: 'equip-grid' }, EQUIP_SLOTS.map((s) => h('div', { class: 'eq-slot' }, h('small', null, s), itemCell(ch.equipment[s], { placeholder: SLOT_ICON[s], label: s, oncontext: () => send({ t: 'unequip', slot: s }), onclick: ch.equipment[s] ? async () => { if (mode === 'smith' && ch.equipment[s]!.affixes.length) { const v = await promptDialog(t('enchant'), `Reroll which affix of ${ch.equipment[s]!.name}? (1-${ch.equipment[s]!.affixes.length})`, '1'); const ai = Number(v) - 1; if (v !== null && ai >= 0) send({ t: 'enchant', slot: s, affix: ai }); } else send({ t: 'unequip', slot: s }); } : undefined }))));
  renderActions();
  const petBox = mode === 'quartermaster' ? h('div', null, h('h3', null, 'Companions'), h('p', { class: 'hint' }, 'Companions are cosmetic and pick up gold from further away (and let you grab items from further). They never add combat power.'),
    h('div', { class: 'list' }, Object.entries(PETS).map(([id, p]) => {
      const owned = ctx.account.pets?.includes(id), active = ctx.account.pet === id;
      const cost = `${p.cost.gold}g${Object.entries(p.cost.mats ?? {}).map(([m, n]) => ` + ${n} ${MATERIALS[m]?.name ?? m}`).join('')}`;
      return h('div', { class: 'list-row' }, h('span', { class: 'grow', style: `color:${p.color}` }, `${p.name} — ${p.desc}`),
        owned ? h('button', { class: 'btn tiny' + (active ? ' on' : ''), onclick: () => send({ t: 'pet_set', id: active ? null : id }) }, active ? 'Dismiss' : 'Summon') : h('button', { class: 'btn tiny', onclick: () => send({ t: 'pet_buy', id }) }, `Adopt (${cost})`));
    }))) : null;
  const stash = mode === 'stash' ? h('div', null, h('h3', null, `${t('stash')} (${ch.hardcore ? 'Hardcore' : 'Normal'}, shared by your account)`), h('div', { class: 'inv-grid' }, (ch.hardcore ? ctx.account.stash.hardcore : ctx.account.stash.normal).map((it, i) => itemCell(it, { onclick: it ? () => send({ t: 'stash_take', idx: i }) : undefined })))) : null;
  return h('div', { class: 'inv-panel' },
    h('div', { class: 'row between' }, h('span', null, `💰 ${ch.gold} ${t('gold')} · ✦ ${ch.dust} ${t('dust')} · 🧪 ${ch.potions}/${POTION.maxCharges}`), mode === 'quartermaster' ? h('button', { class: 'btn', onclick: () => send({ t: 'buy_potion' }) }, `Buy potion (${POTION.buyPrice}g)`) : null),
    h('h3', null, t('equipment'), h('span', { class: 'muted' }, ' — click to unequip')), eq,
    h('h3', null, t('inventory'), h('span', { class: 'muted' }, ` ${ch.inventory.filter(Boolean).length}/${ch.inventory.length}`)), inv, actions, stash, petBox);
}

export function skillsPanel(ctx: PanelCtx): HTMLElement {
  const { ch, send } = ctx;
  const loadout = { active: ch.loadout.active.slice(), ultimate: ch.loadout.ultimate.slice() };
  let picked: string | null = null;
  const slotsEl = h('div', { class: 'loadout' });
  const status = h('p', { class: 'hint' }, 'Select a skill, then click a slot (or drag a skill onto a slot). Right-click a slot to clear it.');
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8'], ukeys = ['R', 'F', 'T', 'G'];
  const renderSlots = () => {
    clear(slotsEl);
    const mk = (kind: 'active' | 'ultimate', i: number) => {
      const id = loadout[kind][i];
      const sk = id ? SKILL_MAP[id] : null;
      const el = h('button', { class: 'skill-slot' + (kind === 'ultimate' ? ' ult' : ''), 'aria-label': `${kind} slot ${i + 1}: ${sk?.name ?? 'empty'}` }, sk ? icon(sk.icon, skillColor(sk), 30) : h('span', { class: 'muted' }, '+'), h('kbd', null, kind === 'active' ? keys[i] : ukeys[i]));
      if (sk) bindTip(el, () => skillTooltip(sk, ch));
      el.onclick = () => {
        if (!picked) return;
        const s = SKILL_MAP[picked]!;
        if (s.kind !== kind) { toast(`${s.name} is ${s.kind === 'ultimate' ? 'an Ultimate' : 'an Active'} skill`, 'error'); return; }
        const other = loadout[kind].indexOf(picked);
        if (other >= 0) loadout[kind][other] = loadout[kind][i] ?? null;
        loadout[kind][i] = picked; picked = null; commit();
      };
      el.ondragover = (e) => e.preventDefault();
      el.ondrop = (e) => { e.preventDefault(); picked = e.dataTransfer?.getData('text/skill') || picked; el.click(); };
      el.oncontextmenu = (e) => { e.preventDefault(); loadout[kind][i] = null; commit(); };
      return el;
    };
    slotsEl.append(h('div', { class: 'slot-row' }, h('small', null, 'ACTIVE ×8'), ...loadout.active.map((_, i) => mk('active', i))), h('div', { class: 'slot-row' }, h('small', null, 'ULTIMATE ×4'), ...loadout.ultimate.map((_, i) => mk('ultimate', i))));
  };
  const commit = () => { send({ t: 'loadout', active: loadout.active, ultimate: loadout.ultimate }); renderSlots(); };
  const lib = (kind: 'active' | 'ultimate') => h('div', { class: 'skill-lib' }, classSkills(ch.cls, kind).map((s) => {
    const locked = s.unlockLevel > ch.level;
    const equipped = loadout[kind].includes(s.id);
    const el = h('button', { class: 'skill-card' + (locked ? ' locked' : '') + (equipped ? ' eq' : ''), draggable: !locked, disabled: locked },
      icon(s.icon, locked ? '#555' : skillColor(s), 28), h('div', { class: 'grow' }, h('b', null, ct(`skill.${s.id}.name`, s.name)), h('div', { class: 'muted' }, locked ? `Unlocks at level ${s.unlockLevel}` : `${s.cost ? s.cost + ' ' + CLASSES[ch.cls].resource.name + ' · ' : ''}${s.cooldown}s`)));
    bindTip(el, () => skillTooltip(s, ch));
    el.onclick = () => { picked = s.id; status.textContent = `Selected ${ct(`skill.${s.id}.name`, s.name)} — now click a ${kind} slot.`; };
    el.ondragstart = (e) => e.dataTransfer?.setData('text/skill', s.id);
    return el;
  }));
  renderSlots();
  const d = CLASSES[ch.cls];
  return h('div', null, h('p', { class: 'muted' }, `${ct(`class.${d.id}.name`, d.name)} — ${ct(`class.${d.id}.mechanic`, d.mechanic)}`), slotsEl, status, h('h3', null, 'Active skills'), lib('active'), h('h3', null, 'Ultimate skills'), lib('ultimate'),
    h('p', { class: 'hint' }, 'Basic attack: hold left mouse (or the ⚔ button on touch). Dodge: Space. Passives and items can transform your basic attack (extra hits, chains, element conversion).'));
}

export function characterPanel(ctx: PanelCtx): HTMLElement {
  const { ch, account } = ctx;
  const st = computeStats(ch);
  const d = CLASSES[ch.cls];
  const row = (k: string, v: string | number) => h('tr', null, h('th', null, k), h('td', null, String(v)));
  const res = Object.entries(st.res).filter(([k]) => k !== 'physical').map(([k, v]) => `${k} ${v}%`).join(' · ');
  const extra = Object.entries(st.m).filter(([k, v]) => v && /^(dmgPct\.|basic\.|minion|dot|aoe|proj|finisher|status|heal|barrier)/.test(k)).map(([k, v]) => statText(k, v)).filter(Boolean);
  return h('div', { class: 'char-sheet' },
    h('h3', null, `${ch.name} — ${d.name} ${t('level')} ${ch.level}${ch.hardcore ? ' · HARDCORE' : ''}`),
    h('p', { class: 'muted' }, `XP ${ch.xp}/${xpToNext(ch.level)} · ${t('mastery')} ${ch.mastery.level} (${ch.mastery.xp}/${masteryToNext(ch.mastery.level)}) · every 5 mastery levels grants +1 passive point`),
    h('table', { class: 'stats' },
      row('Strength / Dexterity / Intelligence / Vitality', `${Math.round(st.str)} / ${Math.round(st.dex)} / ${Math.round(st.int)} / ${Math.round(st.vit)}`),
      row('Life', st.maxHp), row(d.resource.name, `${st.maxRes} (+${st.resRegen.toFixed(1)}/s)`), row('Power (skill & basic scaling)', st.power.toFixed(1)), row('Weapon power', st.weaponPower),
      row('Critical chance / damage', `${st.critChance.toFixed(1)}% / ${st.critMult}%`), row('Attack / cast speed', `${Math.round(st.atkSpeed * 100)}% / ${Math.round(st.castSpeed * 100)}%`),
      row('Cooldown reduction', `${Math.round(st.cdr * 100)}%`), row('Armor', st.armor), row('Resistances', res), row('Dodge / Block', `${st.dodge.toFixed(1)}% / ${st.block}%`),
      row('Life regen / leech', `${st.hpRegen.toFixed(1)}/s / ${(st.leech * 100).toFixed(1)}%`), row('Movement speed', Math.round(st.moveSpeed)),
      row('Keystones', [...st.flags].join(', ') || '—')),
    extra.length ? h('div', null, h('h4', null, 'Build modifiers'), h('ul', { class: 'tip-fx' }, extra.map((e) => h('li', null, e)))) : null,
    h('h4', null, 'Professions'), h('p', null, Object.entries(PROFESSIONS).map(([k, p]) => `${p.name} ${ch.prof?.[k]?.lv ?? 1}`).join(' · ')),
    h('p', { class: 'muted' }, 'Materials: ' + Object.entries(MATERIALS).map(([k, m]) => `${m.name} ${ch.mats?.[k] ?? 0}`).join(' · ')),
    ch.elixir && ch.elixir.until > Date.now() ? h('p', null, `Active consumable: ${ELIXIRS[ch.elixir.id]?.name}`) : h('span'),
    h('h4', null, 'Record'), h('p', null, `Kills ${ch.stats.kills} · Bosses ${ch.stats.bossKills} · Rifts cleared ${ch.stats.runsCleared} · Highest tier ${DIFFICULTY_ORDER[ch.stats.highestTier] ?? 'story'} · Deaths ${ch.stats.deaths}`),
    h('h4', null, `${t('achievements')} (account)`), h('ul', { class: 'ach' }, Object.entries(ACHIEVEMENTS).map(([id, a]) => h('li', { class: account.achievements.includes(id) ? 'got' : '' }, `${account.achievements.includes(id) ? '★' : '☆'} ${ct(`ach.${id}.name`, a.name)} — ${a.desc}`))),
    h('h4', null, t('titles')), h('p', null, account.titles.join(', ') || '—'),
  );
}

export function questsPanel(ctx: PanelCtx, atGiver: boolean): HTMLElement {
  const { ch, send } = ctx;
  return h('div', { class: 'quests' },
    h('p', { class: 'lore' }, ct('lore.intro', LORE.intro)),
    !atGiver ? h('p', { class: 'hint' }, 'Visit Commander Aveline in Lumenhold to accept quests and claim rewards.') : null,
    QUESTS.map((q) => {
      const st = ch.quests[q.id];
      const locked = q.requires && !ch.quests[q.requires]?.claimed;
      const rw = Object.entries(q.reward).map(([k, v]) => `${v} ${k}`).join(', ');
      return h('div', { class: 'quest' + (st?.claimed ? ' done' : '') },
        h('div', { class: 'row between' }, h('b', null, `Ch.${q.chapter} · ${ct(`quest.${q.id}.name`, q.name)}`), h('span', { class: 'muted' }, st?.claimed ? t('done') : st?.done ? t('complete') : st ? `${st.progress}/${q.objective.count}` : locked ? 'Locked' : '')),
        h('p', null, ct(`quest.${q.id}.text`, q.text)), h('small', { class: 'muted' }, `Reward: ${rw}`),
        atGiver && !st && !locked ? h('button', { class: 'btn', onclick: () => send({ t: 'quest_accept', id: q.id }) }, t('accept')) : null,
        atGiver && st?.done && !st.claimed ? h('button', { class: 'btn primary', onclick: () => send({ t: 'quest_claim', id: q.id }) }, t('claim')) : null);
    }));
}

export function dungeonPanel(ctx: PanelCtx, unlocked: string[], locks: Record<string, string | null> = {}): HTMLElement {
  let mode: Activity = 'rift';
  let diff = unlocked.includes('normal') ? 'normal' : unlocked[0] ?? 'story';
  const info = h('div', { class: 'diff-info' });
  const modeRow = h('div', { class: 'row wrap' });
  const diffRow = h('div', { class: 'row wrap' });
  const go = h('button', { class: 'btn primary wide' }, t('enterRift'));
  const render = () => {
    const a = ACTIVITIES[mode];
    const lock = locks[mode];
    for (const b of Array.from(modeRow.children)) (b as HTMLElement).classList.toggle('on', (b as HTMLElement).dataset.m === mode);
    diffRow.hidden = !a.chooseDifficulty;
    for (const b of Array.from(diffRow.children)) (b as HTMLElement).classList.toggle('on', (b as HTMLElement).dataset.d === diff);
    const d = DIFFICULTIES[diff as keyof typeof DIFFICULTIES];
    clear(info).append(h('h3', null, ct(`activity.${a.id}.name`, a.name)), h('p', null, ct(`activity.${a.id}.desc`, a.desc)), h('p', { class: 'muted' }, a.rules),
      h('p', { class: 'muted' }, `Party up to ${a.maxParty} · requires level ${a.minLevel}${a.needTier !== undefined ? ' and a cleared Hard Rift' : ''}`),
      h('p', { hidden: !a.chooseDifficulty }, `${d.name}: enemy life ×${d.hp} · damage ×${d.dmg} · rarity +${Math.round(d.loot * 100)}% · XP ×${d.xp}${d.extraMechanics.length ? ' · ' + d.extraMechanics.join(', ') : ''}`),
      h('p', { class: 'warn', hidden: !lock }, '🔒 ' + (lock ?? '')));
    go.disabled = !!lock;
    go.textContent = lock ? 'Locked' : `${t('enter')} ${ct(`activity.${a.id}.name`, a.name)}`;
  };
  for (const m of ACTIVITY_ORDER) modeRow.append(h('button', { class: 'btn', 'data-m': m, onclick: () => { mode = m; render(); } }, (locks[m] ? '🔒 ' : '') + ct(`activity.${m}.name`, ACTIVITIES[m].name)));
  for (const d of DIFFICULTY_ORDER) diffRow.append(h('button', { class: 'btn tiny', 'data-d': d, disabled: !unlocked.includes(d), onclick: () => { diff = d; render(); } }, DIFFICULTIES[d].name));
  go.onclick = () => ctx.send({ t: 'enter_dungeon', diff, mode });
  render();
  const party = ctx.party.members.length > 1 ? `Party of ${ctx.party.members.length}: members in town enter together (enemy life ×${(1 + 0.6 * (ctx.party.members.length - 1)).toFixed(1)}).` : 'Solo. Invite friends from the Party panel (L) to enter together.';
  return h('div', null, h('p', { class: 'muted' }, 'Choose an activity. Every instance is generated from a fresh seed. Items, gold and XP are kept; blessings last for one run.'),
    modeRow, diffRow, info, h('p', { class: 'muted' }, party), go);
}

export function ladderPanel(data: any, ch: CharacterData, send: (m: any) => void): HTMLElement {
  const boards: Array<[string, string, string]> = [['tower', 'Endless Tower', 'best floor'], ['arena', 'Challenge Arena', 'best wave'], ['level', 'Level', 'level']];
  const mode = ch.hardcore ? 'hardcore' : 'normal';
  return h('div', null,
    h('div', { class: 'row between' }, h('p', { class: 'muted' }, `${ch.hardcore ? 'Hardcore' : 'Normal'} leaderboards · top 20`), h('button', { class: 'btn ghost tiny', onclick: () => send({ t: 'ladder' }) }, 'Refresh')),
    boards.map(([k, title, unit]) => {
      const rows: any[] = data?.[k]?.[mode] ?? [];
      return h('div', null, h('h3', null, title),
        rows.length ? h('table', { class: 'stats' }, rows.map((r, i) => h('tr', { class: r.charId === ch.id ? 'me' : '' }, h('th', null, `#${i + 1} ${r.name}`), h('td', null, CLASSES[r.cls as keyof typeof CLASSES]?.name ?? r.cls), h('td', null, `${r.value} ${unit}`)))) : h('p', { class: 'muted' }, 'No entries yet.'));
    }));
}

export function trainerPanel(ctx: PanelCtx): HTMLElement {
  return h('div', null, h('p', null, 'Master Ilrin: "Your path is never fixed. Rebuild yourself as often as you need — but every rebuild after your fifteenth season has a price."'),
    h('p', { class: 'muted' }, 'Full passive reset is free below level 15, then costs 50 gold per level (or a respec token from quests). Single nodes can be refunded from the passive tree when they do not disconnect other nodes.'),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => ctx.extra?.open('passives') }, t('passives')), h('button', { class: 'btn', onclick: () => ctx.extra?.open('skills') }, t('skills'))));
}

export function codexPanel(ctx: PanelCtx): HTMLElement {
  const known = ctx.account.codex;
  return h('div', null, h('p', { class: 'lore' }, LORE.hollowborn), h('p', { class: 'lore' }, LORE.veyra),
    h('div', { class: 'codex' }, Object.values(ENEMIES).filter((e) => e.id !== 'dummy').map((e) => {
      const n = known[e.id] ?? 0;
      return h('div', { class: 'codex-entry' + (n ? '' : ' unknown') }, h('b', null, n ? ct(`enemy.${e.id}`, e.name) : '???'), h('div', { class: 'muted' }, n ? `${e.family} · ${e.role} · defeated ${n}` : 'Not yet encountered'),
        n ? h('small', null, `Resists: ${Object.entries(e.res).map(([k, v]) => `${k} ${v}%`).join(', ') || 'none'}${e.boss ? ` · ${e.boss.title}` : ''}`) : null);
    })));
}

export function socialPanel(ctx: PanelCtx): HTMLElement {
  const p = ctx.party;
  const name = h('input', { type: 'text', maxLength: 16, placeholder: 'Character name', 'aria-label': 'Character name' });
  return h('div', null,
    h('h3', null, 'Party (max 4)'),
    p.members.length ? h('ul', null, p.members.map((m) => h('li', null, `${m.name === p.leader ? '♛ ' : ''}${m.name} — ${CLASSES[m.cls as keyof typeof CLASSES]?.name} ${m.level} (${m.room})`, p.leader === ctx.ch.name && m.name !== ctx.ch.name ? h('button', { class: 'btn ghost tiny', onclick: () => ctx.send({ t: 'party_kick', name: m.name }) }, t('kick')) : null))) : h('p', { class: 'muted' }, 'You are not in a party.'),
    h('div', { class: 'row' }, name, h('button', { class: 'btn', onclick: () => ctx.send({ t: 'party_invite', name: name.value }) }, t('invite')), p.id ? h('button', { class: 'btn ghost', onclick: () => ctx.send({ t: 'party_leave' }) }, t('leaveParty')) : null),
    h('p', { class: 'hint' }, 'The party leader opens the Rift for everyone in town. If the leader leaves, leadership passes to the next member. Disconnected players can rejoin their Rift within 90 seconds.'),
    h('h3', null, 'Chat'), h('p', { class: 'muted' }, t('chatHint') + ' · /block name · /report name reason'),
    h('h3', null, 'Community rules'), h('p', { class: 'muted' }, 'Be kind. No harassment, hate speech, cheating, real-money trading or sharing personal information. Reports go to the moderation log.'));
}

export function settingsPanel(ctx: PanelCtx): HTMLElement {
  const s = ctx.settings;
  const sel = (label: string, value: string, opts: Array<[string, string]>, on: (v: string) => void) => h('label', { class: 'set' }, label, h('select', { onchange: (e: Event) => on((e.target as HTMLSelectElement).value) }, opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));
  const binds = h('div', { class: 'binds' });
  const renderBinds = () => {
    clear(binds);
    for (const [a, label] of Object.entries(BIND_LABELS)) {
      const b = h('button', { class: 'btn ghost tiny' }, keyLabel(ctx.input.binds[a] ?? ''));
      b.onclick = () => {
        b.textContent = t('pressKey');
        ctx.input.enabled = false;
        const onKey = (e: KeyboardEvent) => { e.preventDefault(); removeEventListener('keydown', onKey, true); ctx.input.enabled = true; if (e.code !== 'Escape') { ctx.input.binds[a] = e.code; ctx.input.rebuild(); saveBinds(ctx.input.binds); } renderBinds(); };
        addEventListener('keydown', onKey, true);
      };
      binds.append(h('div', { class: 'bind' }, h('span', null, label), b));
    }
    binds.append(h('button', { class: 'btn ghost', onclick: () => { ctx.input.binds = { ...DEFAULT_BINDS }; ctx.input.rebuild(); saveBinds(ctx.input.binds); renderBinds(); } }, 'Reset to defaults'));
  };
  renderBinds();
  return h('div', { class: 'settings' },
    sel(t('language'), getLang(), [['en', 'English'], ['th', 'ไทย']], (v) => { setLang(v); ctx.applySettings(); }),
    sel(t('graphics'), s.quality, [['low', t('low')], ['medium', t('medium')], ['high', t('high')]], (v) => { s.quality = v; ctx.applySettings(); }),
    sel(t('controlStyle'), s.style, [['action', t('actionMode')], ['tab', t('tabMode')]], (v) => { s.style = v as 'action' | 'tab'; ctx.applySettings(); }),
    sel(t('dmgNumbers'), s.numbers ? '1' : '0', [['1', t('on')], ['0', t('off')]], (v) => { s.numbers = v === '1'; ctx.applySettings(); }),
    sel(t('uiScale'), String(s.uiScale), [['0.85', '85%'], ['1', '100%'], ['1.15', '115%'], ['1.3', '130%']], (v) => { s.uiScale = Number(v); ctx.applySettings(); }),
    h('h3', null, 'Audio'),
    sel('Sound', sound.settings.on ? '1' : '0', [['1', t('on')], ['0', t('off')]], (v) => { sound.settings.on = v === '1'; sound.apply(); }),
    sel('Master volume', String(sound.settings.master), [['0.2', '20%'], ['0.4', '40%'], ['0.6', '60%'], ['0.8', '80%'], ['1', '100%']], (v) => { sound.settings.master = Number(v); sound.apply(); }),
    sel('Effects', String(sound.settings.sfx), [['0', t('off')], ['0.4', '40%'], ['0.8', '80%'], ['1', '100%']], (v) => { sound.settings.sfx = Number(v); sound.apply(); }),
    sel('Ambience', String(sound.settings.music), [['0', t('off')], ['0.2', '20%'], ['0.35', '35%'], ['0.6', '60%']], (v) => { sound.settings.music = Number(v); sound.apply(); }),
    h('h3', null, t('keybinds')), binds,
    h('p', { class: 'hint' }, 'Action mode: skills fire toward the mouse cursor. Tab Target mode: press Tab (or click an enemy) to lock a target; skills and basic attacks aim at it automatically while it is in range and line of sight. Both modes use the same server rules.'),
    h('button', { class: 'btn danger', onclick: () => ctx.logout() }, t('logout') + ' / character select'));
}

export function choiceModal(kind: 'shrine' | 'altar', options: Array<{ id: string; name: string; desc: string }>, send: (m: any) => void, close: () => void): HTMLElement {
  return h('div', { class: 'modal-wrap' }, h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
    h('h2', null, kind === 'shrine' ? t('chooseBlessing') : t('bargain')),
    h('p', { class: 'muted' }, kind === 'shrine' ? 'A blessing lasts until the end of this Rift run.' : 'Bargains trade power for greater rewards — they last until the run ends.'),
    h('div', { class: 'choices' }, options.map((o) => h('button', { class: 'choice' + (BLESSING_MAP[o.id]?.curse ? ' curse' : ''), onclick: () => { send({ t: 'choose', choice: o.id }); close(); } }, h('b', null, ct(`bless.${o.id}.name`, o.name)), h('span', null, ct(`bless.${o.id}.desc`, o.desc))))),
    h('button', { class: 'btn ghost', onclick: () => { send({ t: 'choose', choice: 'decline' }); close(); } }, t('decline'))));
}

export function runEndModal(m: any, close: () => void): HTMLElement {
  return h('div', { class: 'modal-wrap' }, h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
    h('h2', null, m.cleared ? t('runEnd') : t('runFailed')),
    h('p', { class: 'muted' }, `${DIFFICULTIES[m.difficulty as keyof typeof DIFFICULTIES]?.name} · seed ${m.seed}`),
    m.mode === 'tower' ? h('p', null, `Endless Tower: reached floor ${m.floor}`) : null,
    m.mode === 'arena' ? h('p', null, `Challenge Arena: survived ${m.wave} waves`) : null,
    h('h3', null, t('retained')), h('ul', null, h('li', null, `${m.retained.xp} XP`), h('li', null, `${m.retained.gold >= 0 ? '+' : ''}${m.retained.gold} gold`), h('li', null, `${m.retained.items} items picked up`), h('li', null, `${m.retained.kills} enemies defeated`)),
    h('h3', null, t('lost')), h('ul', null, m.lost.length ? m.lost.map((l: string) => h('li', null, l)) : h('li', { class: 'muted' }, 'No blessings or bargains taken')),
    h('button', { class: 'btn primary', onclick: close }, t('close'))));
}
