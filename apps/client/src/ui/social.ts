import { AH, CLASSES, DIFFICULTIES, DIFFICULTY_ORDER, GUILD, RARITIES, RARITY_DEFS, VAULT_LIMITS, type CharacterData, type Item } from '@astra/shared';
import { ct, t } from '../i18n.js';
import { clear, confirmDialog, h, promptDialog, toast } from './dom.js';
import { bindTip, hideTip, itemTooltip } from './tooltip.js';
import { itemIcon, uiIcon } from './icons.js';
import { statText } from '../l10n.js';

type Send = (m: any) => void;

function itemRow(it: Item, extra: Array<Node | string | null>, onclick?: () => void) {
  const rd = RARITY_DEFS[it.rarity];
  const preview = [...it.implicit, ...it.affixes.map((a) => ({ stat: a.stat, value: a.value }))].slice(0, 2).map((m) => statText(m.stat, m.value)).filter(Boolean).join(' · ');
  const row = h('div', { class: 'list-row irow' + (onclick ? ' click' : '') }, itemIcon(it, 38), h('div', { class: 'grow' }, h('b', { style: `color:${rd.color}` }, it.name), h('small', { class: 'muted' }, ` ${it.slot}`)), h('small', { class: 'ir-lv' }, `Lv.${it.reqLevel}`), h('small', { class: 'ir-st' }, '★'.repeat(RARITIES.indexOf(it.rarity) + 1)), h('small', { class: 'ir-prev muted' }, preview), ...extra);
  bindTip(row, () => itemTooltip(it));
  if (onclick) row.onclick = () => { hideTip(); onclick(); };
  return row;
}

// ───────────────────────── Auction house ─────────────────────────
export interface AhState { results: { total: number; page: number; rows: any[] } | null; mine: any[]; q: Record<string, unknown>; tab: 'browse' | 'sell' | 'mine' }
export function auctionPanel(ch: CharacterData, st: AhState, send: Send, rerender: () => void): HTMLElement {
  const tabs = h('div', { class: 'row' }, (['browse', 'sell', 'mine'] as const).map((k) => h('button', { class: 'btn' + (st.tab === k ? ' on' : ''), onclick: () => { st.tab = k; if (k === 'mine') send({ t: 'ah_mine' }); rerender(); } }, k === 'browse' ? 'Browse' : k === 'sell' ? 'Sell an item' : `My listings (${st.mine.length})`)));
  const head = h('p', { class: 'muted' }, `Fee ${AH.feePct}% on sale · ${AH.deposit}g listing deposit · listings last 48h · max ${AH.maxListings} active · ${ch.hardcore ? 'Hardcore' : 'Normal'} market · your gold: ${ch.gold}`);
  let body: HTMLElement;
  if (st.tab === 'browse') {
    const text = h('input', { type: 'search', placeholder: t('search'), value: String(st.q.text ?? ''), 'aria-label': 'Search items', id: 'ah-text' });
    const slot = h('select', { 'aria-label': 'Slot', id: 'ah-slot' }, h('option', { value: '' }, 'Any slot'), ['weapon', 'helmet', 'chest', 'gloves', 'boots', 'ring', 'necklace', 'relic', 'rune'].map((x) => h('option', { value: x, selected: st.q.slot === x }, x)));
    const rar = h('select', { 'aria-label': 'Minimum rarity', id: 'ah-rar' }, h('option', { value: '' }, 'Any rarity'), RARITIES.map((x) => h('option', { value: x, selected: st.q.rarity === x }, `${RARITY_DEFS[x].name}+`)));
    const usable = h('input', { type: 'checkbox', checked: !!st.q.maxLevel, id: 'ah-usable' });
    const search = (page = 0) => { st.q = { text: text.value, slot: slot.value || undefined, rarity: rar.value || undefined, maxLevel: usable.checked ? ch.level : undefined, sort: st.q.sort ?? 'price', page }; send({ t: 'ah_search', q: st.q }); };
    text.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') search(); };
    const r = st.results;
    body = h('div', null,
      h('div', { class: 'row wrap' }, text, slot, rar, h('label', { class: 'check' }, usable, ' usable by me'), h('button', { class: 'btn', onclick: () => search() }, 'Search')),
      r ? h('p', { class: 'muted' }, `${r.total} listings`) : null,
      h('div', { class: 'list' }, (r?.rows ?? []).map((l) => itemRow(l.item, [h('b', { class: 'price' }, uiIcon('coin', 16), ` ${l.price.toLocaleString()}`), h('small', { class: 'muted ir-seller' }, l.sellerName),
        h('button', { class: 'btn tiny', disabled: l.price > ch.gold, onclick: async (e: Event) => { e.stopPropagation(); if (await confirmDialog('Buy item', `Buy ${l.item.name} for ${l.price} gold?`, 'Buy', t('cancel'))) send({ t: 'ah_buy', id: l.id, q: st.q }); } }, 'Buy')]))),
      r && r.total > 30 ? h('div', { class: 'row' }, h('button', { class: 'btn ghost tiny', disabled: r.page === 0, onclick: () => search(r.page - 1) }, '‹ Prev'), h('span', { class: 'muted' }, `page ${r.page + 1}`), h('button', { class: 'btn ghost tiny', disabled: (r.page + 1) * 30 >= r.total, onclick: () => search(r.page + 1) }, 'Next ›')) : null);
  } else if (st.tab === 'sell') {
    body = h('div', { class: 'list' }, ch.inventory.map((it, i) => it ? itemRow(it, [it.bound ? h('small', { class: 'muted' }, 'bound') : h('button', { class: 'btn tiny', onclick: async (e: Event) => {
      e.stopPropagation();
      const v = await promptDialog('List for sale', `Price in gold for ${it.name} (you receive ${100 - AH.feePct}% when it sells):`, '100', 'List', t('cancel'));
      const price = Math.floor(Number(v));
      if (v !== null && price > 0) send({ t: 'ah_list', inv: i, price });
    } }, 'List…')]) : null), ch.inventory.every((x) => !x) ? h('p', { class: 'muted' }, 'Your bags are empty.') : null);
  } else {
    body = h('div', { class: 'list' }, st.mine.length ? st.mine.map((l) => itemRow(l.item, [h('b', { class: 'price' }, `${l.price}g`), h('small', { class: 'tag ' + (l.status === 'sold' ? 'good' : l.status === 'expired' ? 'warnt' : '') }, l.status === 'sold' ? `sold to ${l.buyerName}` : l.status),
      l.status === 'active' ? h('button', { class: 'btn ghost tiny', onclick: (e: Event) => { e.stopPropagation(); send({ t: 'ah_cancel', id: l.id }); } }, 'Cancel') : null,
      l.status === 'sold' ? h('button', { class: 'btn primary tiny', onclick: (e: Event) => { e.stopPropagation(); send({ t: 'ah_claim', id: l.id }); } }, `Collect ${l.proceeds}g`) : null,
      l.status === 'expired' ? h('button', { class: 'btn tiny', onclick: (e: Event) => { e.stopPropagation(); send({ t: 'ah_claim', id: l.id }); } }, 'Take back') : null])) : h('p', { class: 'muted' }, 'No listings.'));
  }
  return h('div', { class: 'ah' }, h('div', { class: 'ah-side' }, ...(['browse', 'sell', 'mine'] as const).map((k) => h('button', { class: 'ah-nav' + (st.tab === k ? ' on' : ''), onclick: () => { st.tab = k; if (k === 'mine') send({ t: 'ah_mine' }); rerender(); } }, uiIcon(k === 'browse' ? 'gavel' : k === 'sell' ? 'trade' : 'scroll', 22), k === 'browse' ? 'Browse (Buy)' : k === 'sell' ? 'Sell (List Item)' : `My Listings (${st.mine.length})`)), h('div', { class: 'ah-art' }, uiIcon('gavel', 90), uiIcon('chestbox', 70))), h('div', { class: 'ah-main' }, h('div', { class: 'sec-title' }, uiIcon('gavel', 20), st.tab === 'browse' ? 'Auction House — Browse Items' : st.tab === 'sell' ? 'Auction House — Sell' : 'Auction House — My Listings'), head, body));
  void tabs;
}

// ───────────────────────── Guild ─────────────────────────
export function guildPanel(ch: CharacterData, data: any, send: Send, inTown: boolean): HTMLElement {
  const g = data?.guild;
  if (!g) {
    const name = h('input', { type: 'text', maxLength: 24, placeholder: 'Guild name', 'aria-label': 'Guild name', id: 'g-name' });
    const tag = h('input', { type: 'text', maxLength: 5, placeholder: 'TAG', 'aria-label': 'Guild tag', id: 'g-tag', style: 'width:80px;text-transform:uppercase' });
    for (const el of [name, tag]) el.onkeydown = (e) => e.stopPropagation();
    return h('div', null,
      h('p', null, 'You are not in a guild.'),
      (data?.invites ?? []).map((inv: any) => h('div', { class: 'row' }, `Invitation: ‹${inv.tag}› ${inv.name}`, h('button', { class: 'btn primary tiny', onclick: () => send({ t: 'guild_accept', id: inv.id }) }, t('accept')))),
      h('h3', null, 'Found a guild'),
      h('p', { class: 'muted' }, `Costs ${GUILD.createCost} gold. Must be done in Lumenhold. ${ch.hardcore ? 'Hardcore' : 'Normal'} guild (modes are separate).`),
      h('div', { class: 'row wrap' }, name, tag, h('button', { class: 'btn', disabled: !inTown || ch.gold < GUILD.createCost, onclick: () => send({ t: 'guild_create', name: name.value, tag: tag.value }) }, 'Found guild')));
  }
  const me = g.members.find((m: any) => m.charId === ch.id);
  const isLead = me?.rank === 'leader', isOfficer = me?.rank === 'officer' || isLead;
  const inviteName = h('input', { type: 'text', maxLength: 16, placeholder: 'Character name', 'aria-label': 'Invite character', id: 'g-inv' });
  inviteName.onkeydown = (e) => e.stopPropagation();
  const order: Record<string, number> = { leader: 0, officer: 1, member: 2 };
  const members = [...g.members].sort((a: any, b: any) => order[a.rank]! - order[b.rank]! || Number(b.online) - Number(a.online));
  return h('div', { class: 'guild' },
    h('h3', null, `‹${g.tag}› ${g.name}`, h('small', { class: 'muted' }, `  Level ${g.level} · ${g.xp}/${g.xpToNext} XP · ${g.members.length}/${GUILD.maxMembers} members`)),
    h('div', { class: 'bar small' }, h('i', { style: `width:${(g.xp / g.xpToNext) * 100}%;background:var(--umbra)` }), h('span', null, 'Guild progress: Rift clears and world boss kills by members')),
    h('div', { class: 'motd' }, h('b', null, 'Message of the day: '), g.motd, isOfficer ? h('button', { class: 'btn ghost tiny', onclick: async () => { const v = await promptDialog('Message of the day', '', g.motd, t('save'), t('cancel')); if (v !== null) send({ t: 'guild_motd', text: v }); } }, 'Edit') : null),
    isOfficer ? h('div', { class: 'row' }, inviteName, h('button', { class: 'btn', onclick: () => send({ t: 'guild_invite', name: inviteName.value }) }, t('invite'))) : null,
    h('div', { class: 'list' }, members.map((m: any) => h('div', { class: 'list-row' },
      h('span', { class: 'grow' }, `${m.online ? '●' : '○'} ${m.name}`), h('small', { class: 'muted' }, `${CLASSES[m.cls as keyof typeof CLASSES]?.name ?? m.cls} ${m.level}`), h('span', { class: 'tag' }, m.rank),
      isLead && m.rank !== 'leader' ? h('button', { class: 'btn ghost tiny', onclick: () => send({ t: 'guild_rank', name: m.name, rank: m.rank === 'officer' ? 'member' : 'officer' }) }, m.rank === 'officer' ? 'Demote' : 'Promote') : null,
      isLead && m.rank !== 'leader' ? h('button', { class: 'btn ghost tiny', onclick: async () => { const v = await promptDialog('Transfer leadership', `Make ${m.name} the guild leader? You become an officer. Type the guild name "${g.name}" to confirm.`, '', 'Transfer', t('cancel')); if (v) send({ t: 'guild_transfer', name: m.name, confirm: v }); } }, 'Make leader') : null,
      isOfficer && m.rank !== 'leader' && m.charId !== ch.id && (isLead || m.rank === 'member') ? h('button', { class: 'btn ghost tiny', onclick: async () => { if (await confirmDialog('Remove member', `Remove ${m.name} from the guild?`, t('kick'), t('cancel'))) send({ t: 'guild_kick', name: m.name }); } }, t('kick')) : null))),
    h('h3', null, 'Guild vault', h('small', { class: 'muted' }, `  daily withdrawals: leader unlimited · officer ${VAULT_LIMITS.officer} · member ${VAULT_LIMITS.member}`)),
    h('p', { class: 'hint' }, 'Stand at the Astral Vault in Lumenhold. Click a vault item to withdraw; use the list below to deposit. Every move is logged.'),
    h('div', { class: 'inv-grid small' }, (g.vault ?? []).map((it: Item | null, i: number) => { const c = h('button', { class: 'cell' + (it ? ' has' : ''), 'aria-label': it ? it.name : 'empty' }, it ? itemIcon(it, 40) : null); if (it) { bindTip(c, () => itemTooltip(it)); c.onclick = () => { hideTip(); send({ t: 'guild_vault_take', idx: i }); }; } return c; })),
    h('div', { class: 'list' }, ch.inventory.map((it, i) => it && !it.bound ? itemRow(it, [h('button', { class: 'btn tiny', onclick: (e: Event) => { e.stopPropagation(); send({ t: 'guild_vault_put', inv: i }); } }, 'Deposit')]) : null)),
    h('h3', null, 'Recent activity'), h('ul', { class: 'glog' }, [...g.log].reverse().slice(0, 12).map((l: any) => h('li', null, h('small', { class: 'muted' }, new Date(l.t).toLocaleString() + ' · '), l.text))),
    h('p', { class: 'hint' }, 'Guild chat: /g message. A shared guild vault is planned; it needs per-rank withdrawal limits and an audit view first.'),
    h('button', { class: 'btn danger', onclick: async () => { if (await confirmDialog('Leave guild', isLead && g.members.length > 1 ? 'Leaders must transfer leadership before leaving.' : g.members.length === 1 ? 'You are the last member — the guild will be disbanded.' : `Leave ${g.name}?`, 'Leave', t('cancel'))) send({ t: 'guild_leave' }); } }, 'Leave guild'));
}

// ───────────────────────── Party finder + nearby players ─────────────────────────
export function finderSection(ch: CharacterData, entries: any[], nearby: string[], send: Send): HTMLElement {
  const note = h('input', { type: 'text', maxLength: 80, placeholder: 'Note (e.g. "Hard Rift, need healer")', 'aria-label': 'Listing note', id: 'pf-note' });
  note.onkeydown = (e) => e.stopPropagation();
  const diff = h('select', { 'aria-label': 'Difficulty', id: 'pf-diff' }, DIFFICULTY_ORDER.map((d) => h('option', { value: d, selected: d === 'normal' }, DIFFICULTIES[d].name)));
  const mine = entries.find((e) => e.mine);
  return h('div', null,
    h('h3', null, 'Party finder'),
    h('div', { class: 'row wrap' }, diff, note, mine ? h('button', { class: 'btn ghost', onclick: () => send({ t: 'pf_remove' }) }, 'Remove my listing') : h('button', { class: 'btn', onclick: () => send({ t: 'pf_post', diff: diff.value, note: note.value }) }, 'Post listing'), h('button', { class: 'btn ghost', onclick: () => send({ t: 'pf_list' }) }, 'Refresh')),
    h('div', { class: 'list' }, entries.length ? entries.map((e) => h('div', { class: 'list-row' },
      h('span', { class: 'grow' }, `${e.name} (${CLASSES[e.cls as keyof typeof CLASSES]?.name} ${e.level}) — ${DIFFICULTIES[e.diff as keyof typeof DIFFICULTIES]?.name ?? e.diff}`), h('small', { class: 'muted' }, `${e.size}/4 · ${e.note}`),
      e.mine ? null : h('button', { class: 'btn tiny', onclick: () => send({ t: 'pf_join', sid: e.sid }) }, 'Ask to join'))) : h('p', { class: 'muted' }, 'No groups listed right now.')),
    h('h3', null, 'Players nearby'),
    h('div', { class: 'list' }, nearby.length ? nearby.map((n) => h('div', { class: 'list-row' }, h('span', { class: 'grow' }, n),
      h('button', { class: 'btn tiny', onclick: () => send({ t: 'party_invite', name: n }) }, t('invite')),
      h('button', { class: 'btn tiny', onclick: () => send({ t: 'trade_request', name: n }) }, 'Trade'),
      h('button', { class: 'btn ghost tiny', onclick: () => send({ t: 'guild_invite', name: n }) }, 'Guild invite'),
      h('button', { class: 'btn ghost tiny', onclick: () => send({ t: 'house_visit', name: n }) }, 'Visit Hearth'))) : h('p', { class: 'muted' }, 'Nobody else is in this zone.')),
    void ch);
}

// ───────────────────────── Trade window ─────────────────────────
export function tradeModal(ch: CharacterData, tr: any, send: Send): HTMLElement {
  const selected = new Set<string>(tr.me.uids ?? []);
  const gold = h('input', { type: 'number', min: 0, max: ch.gold, value: String(tr.me.gold ?? 0), 'aria-label': 'Gold to offer', id: 'tr-gold', style: 'width:110px' });
  gold.onkeydown = (e) => e.stopPropagation();
  const update = () => send({ t: 'trade_offer', inv: ch.inventory.map((it, i) => (it && selected.has(it.uid) ? i : -1)).filter((i) => i >= 0), gold: Math.max(0, Math.floor(Number(gold.value) || 0)) });
  const side = (title: string, v: any) => h('div', { class: 'trade-side' + (v.confirmed ? ' confirmed' : v.locked ? ' locked' : '') },
    h('b', null, title, v.confirmed ? ' ✔ confirmed' : v.locked ? ' 🔒 locked' : ''),
    h('div', { class: 'list' }, v.items.length ? v.items.map((it: Item) => itemRow(it, [])) : h('p', { class: 'muted' }, 'No items')),
    h('p', null, `${v.gold} gold`));
  const bag = h('div', { class: 'inv-grid small' }, ch.inventory.map((it) => {
    if (!it) return h('div', { class: 'cell' });
    const rd = RARITY_DEFS[it.rarity];
    const c = h('button', { class: 'cell has' + (selected.has(it.uid) ? ' sel' : ''), disabled: it.bound, style: `border-color:${rd.color}`, 'aria-label': it.name }, itemIcon(it, 40));
    bindTip(c, () => itemTooltip(it));
    c.onclick = () => { hideTip(); if (selected.has(it.uid)) selected.delete(it.uid); else selected.add(it.uid); update(); };
    return c;
  }));
  const bothLocked = tr.me.locked && tr.them.locked;
  return h('div', { class: 'modal-wrap' }, h('div', { class: 'modal trade', role: 'dialog', 'aria-modal': 'true' },
    h('h2', null, `Trade with ${tr.them.name}`),
    h('div', { class: 'trade-grid' }, side('Your offer', tr.me), side(`${tr.them.name}'s offer`, tr.them)),
    h('p', { class: 'hint' }, 'Click items in your bag to add or remove them. Any change unlocks both sides. The swap happens only after both players lock and then both confirm.'),
    bag,
    h('div', { class: 'row wrap' }, h('label', null, 'Gold ', gold), h('button', { class: 'btn ghost', onclick: update }, 'Update gold'),
      h('button', { class: 'btn', disabled: tr.me.locked, onclick: () => send({ t: 'trade_lock' }) }, 'Lock offer'),
      h('button', { class: 'btn primary', disabled: !bothLocked || tr.me.confirmed, onclick: () => send({ t: 'trade_confirm' }) }, 'Confirm trade'),
      h('button', { class: 'btn danger', onclick: () => send({ t: 'trade_cancel' }) }, t('cancel')))));
}

export function worldEventBanner(ev: any): HTMLElement | null {
  if (!ev) return null;
  if (ev.active) return h('div', null, h('b', null, `⚔ ${ev.name}`), h('small', null, ` · ${ev.hp}% life · ${Math.floor(ev.endsIn / 60)}:${String(ev.endsIn % 60).padStart(2, '0')} left · marked on your minimap`));
  return h('div', null, h('small', null, `World boss returns in ~${Math.max(0, Math.ceil(ev.nextIn / 60))} min`));
}

export { toast, clear };

// ───────────────────────── Crafting (Smith: smithing · Alchemist: alchemy + cooking) ─────────────────────────
import { CRAFT_SLOTS, ELIXIRS, MATERIALS, PROFESSIONS, PROF_MAX, RECIPES, profXpToNext, type ProfId } from '@astra/shared';
export function craftingSection(ch: CharacterData, profs: ProfId[], send: Send): HTMLElement {
  const slot = h('select', { 'aria-label': 'Equipment slot to forge', id: 'craft-slot' }, CRAFT_SLOTS.map((x) => h('option', { value: x }, x)));
  const lv = (p: ProfId) => ch.prof[p]?.lv ?? 1;
  return h('div', { class: 'craft' },
    h('p', { class: 'muted' }, 'Materials: ' + Object.entries(MATERIALS).map(([k, m]) => `${ct(`mat.${k}`, m.name)} ${ch.mats[k] ?? 0}`).join(' · ') + ` · Astral Dust ${ch.dust} · Gold ${ch.gold}`),
    ch.elixir && ch.elixir.until > Date.now() ? h('p', { class: 'good' }, `Active: ${ELIXIRS[ch.elixir.id]?.name} (${Math.ceil((ch.elixir.until - Date.now()) / 60000)} min left). A new elixir or meal replaces it.`) : null,
    profs.map((p) => p === 'fishing' ? null : h('div', null,
      h('h3', null, `${ct(`prof.${p}`, PROFESSIONS[p].name)} — level ${lv(p)}/${PROF_MAX}`, h('small', { class: 'muted' }, lv(p) < PROF_MAX ? `  ${ch.prof[p]?.xp ?? 0}/${profXpToNext(lv(p))} XP` : '  max')),
      p === 'smithing' ? h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Forge slot:'), slot) : null,
      h('div', { class: 'list' }, RECIPES.filter((r) => r.prof === p).map((r) => {
        const missing = Object.entries(r.mats).filter(([m, n]) => (ch.mats[m] ?? 0) < n);
        const canLv = lv(p) >= r.level;
        const cost = [...Object.entries(r.mats).map(([m, n]) => `${n} ${MATERIALS[m]?.name ?? m}`), r.dust ? `${r.dust} dust` : '', r.gold ? `${r.gold}g` : ''].filter(Boolean).join(', ');
        return h('div', { class: 'list-row' }, h('span', { class: 'grow' }, ct(`recipe.${r.id}`, r.name)), h('small', { class: missing.length ? 'muted' : '' }, cost),
          h('button', { class: 'btn tiny', disabled: !canLv || missing.length > 0 || (r.dust ?? 0) > ch.dust || (r.gold ?? 0) > ch.gold, title: !canLv ? `Requires level ${r.level}` : '', onclick: () => send({ t: 'craft', recipe: r.id, slot: slot.value }) }, canLv ? 'Craft' : `Lv ${r.level}`));
      })))),
    h('p', { class: 'hint' }, 'Gather Moonpetal in Duskmeadow; Iron, Starsteel and Emberbloom in the Ashen Highlands (east of Duskmeadow). Beasts drop meat; Cinderkin drop Cinder Cores.'));
}

// ───────────────────────── Season & weekly ─────────────────────────
export function seasonPanel(data: any, ch: CharacterData, account: any, send: Send): HTMLElement {
  if (!data) return h('p', { class: 'muted' }, t('loading'));
  const ev = data.event;
  const objectives = h('div', { class: 'list' }, (data.objectives ?? []).map((o: any) => {
    const p = data.progress?.weekly?.[o.id] ?? 0, done = data.progress?.weeklyDone?.includes(o.id);
    return h('div', { class: 'list-row' }, h('span', { class: 'grow' }, `${done ? '✔ ' : ''}${o.name}`), h('small', { class: 'muted' }, `${Math.min(p, o.count)}/${o.count}`), h('small', null, `+${o.xp} XP · ${o.shards} shards`));
  }));
  const d = Math.floor(data.weekEndsIn / 86400), hh = Math.floor((data.weekEndsIn % 86400) / 3600);
  const s = data.season;
  const auraPicker = h('div', { class: 'row wrap' }, h('span', { class: 'muted' }, 'Aura (cosmetic):'),
    h('button', { class: 'btn tiny' + (!account?.aura ? ' on' : ''), onclick: () => send({ t: 'set_aura', id: null }) }, 'None'),
    (account?.auras ?? []).map((id: string) => h('button', { class: 'btn tiny' + (account.aura === id ? ' on' : ''), style: `border-color:${data.auras?.[id]?.color ?? '#fff'}`, onclick: () => send({ t: 'set_aura', id }) }, data.auras?.[id]?.name ?? id)));
  if (!s) return h('div', null, h('p', null, 'No season is running right now.'), h('h3', null, `Weekly event: ${ev.name}`), h('p', null, ev.desc), objectives, auraPicker);
  const pr = data.progress;
  const tier = Math.floor(pr.xp / data.tierXp);
  const left = Math.max(0, Math.round((Date.parse(s.end) - Date.now()) / 86400000));
  return h('div', { class: 'season' },
    h('h3', null, s.name), h('p', null, s.theme), h('p', { class: 'muted' }, s.mechanic),
    h('p', null, `Tier ${tier} · ${pr.xp % data.tierXp}/${data.tierXp} XP to next · Ember Shards ${pr.shards} · ends in ${left} days (${s.end})`),
    h('div', { class: 'bar small' }, h('i', { style: `width:${((pr.xp % data.tierXp) / data.tierXp) * 100}%;background:var(--corona)` }), h('span', null, `Season tier ${tier}`)),
    h('h3', null, `This week: ${ev.name}`), h('p', null, ev.desc),
    h('h3', null, 'Weekly objectives', h('small', { class: 'muted' }, `  reset in ${d}d ${hh}h`)), objectives,
    h('h3', null, 'Reward track'), h('p', { class: 'hint' }, 'Rewards are cosmetic or convenience only — no season reward adds combat power.'),
    h('div', { class: 'list' }, s.rewards.map((r: any) => {
      const claimed = pr.claimed.includes(r.tier), reached = tier >= r.tier;
      return h('div', { class: 'list-row' + (claimed ? ' dim' : '') }, h('b', { class: 'price' }, `T${r.tier}`), h('span', { class: 'grow' }, r.label),
        claimed ? h('small', { class: 'muted' }, 'claimed') : h('button', { class: 'btn tiny' + (reached ? ' primary' : ''), disabled: !reached, onclick: () => send({ t: 'season_claim', tier: r.tier }) }, reached ? 'Claim' : 'Locked'));
    })),
    auraPicker,
    h('h3', null, 'What stays and what resets'),
    h('div', { class: 'trade-grid' }, h('div', null, h('b', null, 'Permanent'), h('ul', null, s.permanent.map((x: string) => h('li', null, x)))), h('div', null, h('b', null, 'Resets at season end'), h('ul', null, s.resets.map((x: string) => h('li', null, x))))),
    pr.archive?.length ? h('p', { class: 'muted' }, 'Past seasons: ' + pr.archive.map((a: any) => `${a.id} tier ${a.tier}`).join(', ')) : null,
    void ch);
}

// ───────────────────────── Hearth (housing) ─────────────────────────
import { FURNITURE, HOUSE } from '@astra/shared';
export function carpenterPanel(ch: CharacterData, account: any, send: Send): HTMLElement {
  const owned = account?.house?.owned ?? {};
  return h('div', null, h('p', { class: 'muted' }, `Furniture for your Hearth (Hearthstone Lane, east road). Functional pieces: chest = vault access, alchemy table = brewing & cooking, anvil = forging, dummy = damage testing. Gold: ${ch.gold}`),
    h('div', { class: 'list' }, Object.values(FURNITURE).map((f) => {
      const locked = f.req && !account?.achievements?.includes(f.req);
      const cost = `${f.cost.gold}g${Object.entries(f.cost.mats ?? {}).map(([m, n]) => ` + ${n} ${MATERIALS[m]?.name ?? m}`).join('')}`;
      return h('div', { class: 'list-row' }, h('span', { class: 'grow' }, `${f.name}${f.utility ? ' ★' : ''}`), h('small', { class: 'muted' }, `${f.w}×${f.h} · ${cost}${owned[f.id] ? ` · owned ${owned[f.id]}` : ''}`),
        h('button', { class: 'btn tiny', disabled: !!locked, title: locked ? 'Locked by an achievement' : '', onclick: () => send({ t: 'house_buy', id: f.id }) }, locked ? 'Locked' : 'Buy'));
    })));
}
export function hearthPanel(data: any, send: Send, startPlacing: (id: string) => void): HTMLElement {
  if (!data?.mine) return h('div', null, h('p', null, data ? `You are visiting ${data.owner}'s Hearth.` : 'Enter your Hearth at Hearthstone Lane in Lumenhold.'), h('p', { class: 'hint' }, 'To visit a friend: stand in Lumenhold and use /visit name, or the Visit button in the Party panel. Their Hearth must allow you in.'));
  const house = data.house;
  const placedCount: Record<string, number> = {};
  for (const p of house.placed) placedCount[p.id] = (placedCount[p.id] ?? 0) + 1;
  const perm = h('select', { id: 'house-perm', 'aria-label': 'Who can visit' }, ['private', 'party', 'guild', 'public'].map((p) => h('option', { value: p, selected: house.perm === p }, p)));
  perm.onchange = () => send({ t: 'house_perm', perm: perm.value });
  return h('div', null,
    h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Visitors:'), perm, h('small', { class: 'muted' }, `${house.placed.length}/${HOUSE.maxPlaced} placed`)),
    h('h3', null, 'Place furniture'), h('p', { class: 'hint' }, 'Pick a piece, then click a spot in the room (green = valid). Right-click or Esc cancels. The server keeps the doorway clear and every functional piece reachable.'),
    h('div', { class: 'list' }, Object.entries(house.owned).map(([id, n]) => { const left = (n as number) - (placedCount[id] ?? 0); const f = FURNITURE[id]!; return h('div', { class: 'list-row' }, h('span', { class: 'grow' }, f.name), h('small', { class: 'muted' }, `${left} to place`), h('button', { class: 'btn tiny', disabled: left <= 0, onclick: () => startPlacing(id) }, 'Place')); })),
    Object.keys(house.owned).length ? null : h('p', { class: 'muted' }, 'You own no furniture yet — visit Carpenter Odo in Lumenhold.'),
    h('h3', null, 'Placed'),
    h('div', { class: 'list' }, house.placed.map((p: any, i: number) => h('div', { class: 'list-row' }, h('span', { class: 'grow' }, FURNITURE[p.id]?.name ?? p.id), h('small', { class: 'muted' }, `(${p.x}, ${p.y})`), h('button', { class: 'btn ghost tiny', onclick: () => send({ t: 'house_remove', index: i }) }, 'Remove')))));
}
