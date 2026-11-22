// Windows for the meta systems (meta.ts): daily login calendar, shop, benefits, Astral Wish, Awakening, Emblems and
// the wardrobe (costumes, frames, mounts). Every button sends a server message; nothing is decided on the client.
import { AWAKEN_MAX, BENEFITS, COSMETICS, EMBLEMS, EMBLEM_SLOTS, LOGIN_CYCLE, MOUNTS, RENOWN_STEPS, SHOP, WISH_ODDS, WISH_PITY, WISH_POOL, awakenCost, awakenMods, awakenReqLevel, benefitReady, dayIndex, emblemUnlocked, loginReward, normalizeMeta, renownLevel, renownPoints, rewardText, shopBought, type AccountProgress, type CharacterData, type Reward, type ShopItem } from '@astra/shared';
import { getLang } from '../i18n.js';
import { statText } from '../l10n.js';
import { h } from './dom.js';
import { bindTip } from './tooltip.js';
import { currencyIcon, matIcon, tileIcon, uiIcon } from './icons.js';

type Send = (m: any) => void;
const RAR_FRAME: Record<string, string> = { N: 'common', R: 'rare', SR: 'epic', SSR: 'legendary' };
/** Best icon for a reward. */
export function rewardIcon(r: Reward, size = 48): HTMLElement {
  if (r.mount) return tileIcon('mount', MOUNTS[r.mount]?.color ?? '#fff', RAR_FRAME[MOUNTS[r.mount]?.rarity ?? 'R'], size);
  if (r.cosmetic) { const c = COSMETICS[r.cosmetic]; return tileIcon(c?.kind === 'frame' ? 'emblem' : 'costume', c?.color ?? '#9b6cff', RAR_FRAME[c?.rarity ?? 'R'], size); }
  if (r.tokens) return tileIcon('gacha', '#9b6cff', 'epic', size);
  if (r.dust) return tileIcon('dust', '#6aa8ff', 'rare', size);
  if (r.mats) return matIcon(Object.keys(r.mats)[0]!, size);
  if (r.potions) return tileIcon('potion', '#ff4a5a', 'uncommon', size);
  if (r.respec) return tileIcon('tree', '#9b6cff', 'rare', size);
  return tileIcon('coin', '#ffd36a', 'uncommon', size);
}
const tip = (el: HTMLElement, text: string) => { bindTip(el, () => h('div', { class: 'tip' }, text)); return el; };

export function renownBadge(acc: AccountProgress): HTMLElement {
  const l = renownLevel(acc), p = renownPoints(acc), th = getLang() === 'th';
  return tip(h('span', { class: 'renown' }, `${th ? 'ชื่อเสียง' : 'RENOWN'} ${l}`), th ? `แต้มชื่อเสียง ${p} (เลเวลถัดไป ${RENOWN_STEPS[Math.min(10, l + 1)]}) — ได้จากความสำเร็จ ซีซัน การล็อกอิน และโคเด็กซ์ · โบนัสทองล็อกอิน +${l * 5}% · ซื้อของในร้านต่อวันเพิ่ม +${Math.floor(l / 5)}` : `Renown points ${p} (next level at ${RENOWN_STEPS[Math.min(10, l + 1)]}) — earned from achievements, seasons, logins and the codex. Perks: +${l * 5}% login gold, +${Math.floor(l / 5)} daily shop purchases. Never combat power.`);
}

export function loginWindow(ch: CharacterData, acc: AccountProgress, send: Send): HTMLElement {
  const th = getLang() === 'th', m = normalizeMeta(acc.meta), today = dayIndex(Date.now());
  const claimed = m.login.last === today, next = m.login.count % LOGIN_CYCLE;
  return h('div', { class: 'metawin' },
    h('p', { class: 'muted center' }, th ? 'ปฏิทิน 28 วัน แบบสะสม: พลาดวันไหนก็ไม่รีเซ็ต · รับได้วันละครั้ง (เวลา UTC)' : '28-day cumulative calendar: missing a day never resets your progress · one claim per day (UTC).'),
    h('div', { class: 'cal' }, ...Array.from({ length: LOGIN_CYCLE }, (_, i) => {
      const r = loginReward(i), cur = i === next && !claimed, got = i < next || (claimed && next === 0 && m.login.count > 0);
      return tip(h('div', { class: 'cday' + (got ? ' done' : '') + (cur ? ' cur' : '') + ((i + 1) % 7 === 0 ? ' big' : '') }, h('small', null, `${th ? 'วัน' : 'Day'} ${i + 1}`), rewardIcon(r, 52), h('em', null, rewardText(r).split(',')[0]), got ? h('i', { class: 'tick' }, '✓') : null), rewardText(r));
    })),
    h('div', { class: 'center' }, h('button', { class: 'btn gold big', disabled: claimed, onclick: () => send({ t: 'login_claim' }) }, claimed ? (th ? 'รับแล้ววันนี้ — กลับมาพรุ่งนี้' : 'Claimed today — come back tomorrow') : `${th ? 'รับรางวัลวันที่' : 'Claim Day'} ${next + 1}`)),
    h('p', { class: 'muted center' }, `${th ? 'ล็อกอินรวม' : 'Total logins'}: ${m.login.total} · `, renownBadge(acc)),
    void ch);
}

export function shopWindow(ch: CharacterData, acc: AccountProgress, send: Send, state: { tab: ShopItem['tab'] }, rerender: () => void): HTMLElement {
  const th = getLang() === 'th', now = Date.now(), m = normalizeMeta(acc.meta);
  const tabs: Array<[ShopItem['tab'], string]> = [['supplies', th ? 'ของใช้' : 'Supplies'], ['materials', th ? 'วัตถุดิบ' : 'Materials'], ['cosmetics', th ? 'คอสเมติก' : 'Cosmetics'], ['mounts', th ? 'พาหนะ' : 'Mounts']];
  const extra = Math.floor(renownLevel(acc) / 5);
  const shards = acc.season?.shards ?? 0;
  return h('div', { class: 'metawin' },
    h('div', { class: 'win-tabs' }, ...tabs.map(([id, l]) => h('button', { class: 'wt' + (state.tab === id ? ' on' : ''), onclick: () => { state.tab = id; rerender(); } }, l))),
    h('div', { class: 'wallet' }, h('span', null, currencyIcon('gold'), ` ${ch.gold.toLocaleString()}`), h('span', null, currencyIcon('dust'), ` ${ch.dust.toLocaleString()}`), h('span', null, currencyIcon('shard'), ` ${shards.toLocaleString()}`), h('span', null, uiIcon('gacha', 22, '#9b6cff'), ` ${m.wish.tokens} ${th ? 'โทเค็นขอพร' : 'Wish Tokens'}`)),
    h('div', { class: 'shop-grid' }, ...SHOP.filter((s) => s.tab === state.tab).map((s) => {
      const left = s.daily + extra - shopBought(acc, s.id, now);
      const owned = (s.reward.cosmetic && m.cosmetics.owned.includes(s.reward.cosmetic)) || (s.reward.mount && m.mounts.includes(s.reward.mount));
      const afford = s.cur === 'gold' ? ch.gold >= s.price : s.cur === 'dust' ? ch.dust >= s.price : shards >= s.price;
      return h('div', { class: 'shop-item' }, rewardIcon(s.reward, 72), h('b', null, s.name), h('small', { class: 'muted' }, rewardText(s.reward)),
        h('small', null, owned ? (th ? 'มีแล้ว' : 'Owned') : `${th ? 'เหลือวันนี้' : 'Left today'}: ${Math.max(0, left)}`),
        h('button', { class: 'btn gold', disabled: !!owned || left <= 0 || !afford, onclick: () => send({ t: 'shop_buy', id: s.id }) }, currencyIcon(s.cur === 'shards' ? 'shard' : s.cur, 18), ` ${s.price.toLocaleString()}`));
    })),
    h('p', { class: 'hint center' }, th ? 'ร้านค้าใช้เฉพาะสกุลเงินในเกม (ทอง ผงดวงดาว เศษอัมเบอร์จากซีซัน) ไม่มีการใช้เงินจริง' : 'The shop only takes in-game currency (gold, Astral Dust, season Ember Shards). There is no real-money purchase anywhere.'));
}

export function benefitsWindow(ch: CharacterData, acc: AccountProgress, send: Send): HTMLElement {
  const th = getLang() === 'th';
  return h('div', { class: 'metawin' }, h('div', { class: 'ben-list' }, ...BENEFITS.map((b) => {
    const done = ch.benefits?.includes(b.id), ready = benefitReady(acc, ch, b);
    return h('div', { class: 'ben' + (done ? ' done' : ready ? ' ready' : '') }, rewardIcon(b.reward, 56), h('div', { class: 'grow' }, h('b', null, b.name), h('small', { class: 'muted' }, rewardText(b.reward))),
      h('button', { class: 'btn ' + (ready && !done ? 'gold' : ''), disabled: done || !ready, onclick: () => send({ t: 'benefit_claim', id: b.id }) }, done ? (th ? 'รับแล้ว' : 'Claimed') : ready ? (th ? 'รับรางวัล' : 'Claim') : b.level ? `Lv.${b.level}` : (th ? 'ยังไม่สำเร็จ' : 'Locked')));
  })));
}

export function wishWindow(ch: CharacterData, acc: AccountProgress, send: Send, last: any[] | null): HTMLElement {
  const th = getLang() === 'th', m = normalizeMeta(acc.meta);
  const odds = (Object.keys(WISH_ODDS) as Array<keyof typeof WISH_ODDS>).map((r) => h('div', { class: 'odd ' + r }, h('b', null, r), h('span', null, `${(WISH_ODDS[r] * 100).toFixed(1)}%`), h('small', null, WISH_POOL.filter((p) => p.r === r).map((p) => p.name).join(' · '))));
  return h('div', { class: 'metawin wish' },
    h('div', { class: 'wish-hero' }, tileIcon('gacha', '#9b6cff', 'legendary', 120), h('div', null, h('h3', null, th ? 'การขอพรแห่งดวงดาว' : 'Astral Wish'), h('p', { class: 'muted' }, th ? 'ใช้โทเค็นขอพรแลกคอสเมติก พาหนะ และวัตถุดิบ ไม่มีค่าสถานะต่อสู้ ของที่มีแล้วจะกลายเป็นผงดวงดาว' : 'Spend Wish Tokens for cosmetics, mounts and materials — never combat stats. Duplicates turn into Astral Dust.'),
      h('div', { class: 'row wrap' }, h('span', { class: 'tag' }, `${th ? 'โทเค็น' : 'Tokens'}: ${m.wish.tokens}`), h('span', { class: 'tag' }, `${th ? 'การันตี SSR ใน' : 'SSR guaranteed in'} ${WISH_PITY - m.wish.pity}`), h('span', { class: 'tag' }, `${th ? 'ขอพรไปแล้ว' : 'Total wishes'}: ${m.wish.pulls}`)),
      h('div', { class: 'row' }, h('button', { class: 'btn primary big', disabled: m.wish.tokens < 1, onclick: () => send({ t: 'wish', n: 1 }) }, th ? 'ขอพร ×1' : 'Wish ×1'), h('button', { class: 'btn gold big', disabled: m.wish.tokens < 10, onclick: () => send({ t: 'wish', n: 10 }) }, th ? 'ขอพร ×10' : 'Wish ×10')))),
    last ? h('div', { class: 'wish-res' }, ...last.map((p) => h('div', { class: 'wr ' + p.r }, rewardIcon(p.got, 64), h('b', null, p.r), h('small', null, p.name)))) : null,
    h('div', { class: 'sec-title' }, th ? 'อัตราการออก (เปิดเผย)' : 'Published odds'), h('div', { class: 'odds' }, ...odds),
    h('p', { class: 'hint' }, th ? `การันตี SSR ทุก ${WISH_PITY} ครั้ง · โทเค็นได้จากล็อกอิน สิทธิประโยชน์ และร้านค้า (ทอง/เศษอัมเบอร์)` : `Pity: an SSR at the latest every ${WISH_PITY} wishes · tokens come from logins, benefits and the shop (gold / shards).`), void ch);
}

export function awakenWindow(ch: CharacterData, acc: AccountProgress, send: Send): HTMLElement {
  const th = getLang() === 'th', l = ch.awaken ?? 0, cost = awakenCost(l), req = awakenReqLevel(l);
  const m = normalizeMeta(acc.meta);
  const unlocked = Object.values(EMBLEMS).filter((e) => emblemUnlocked(acc, e.id));
  const eq = new Set(ch.emblems ?? []);
  return h('div', { class: 'metawin' },
    h('div', { class: 'aw' }, h('div', { class: 'aw-orb' }, tileIcon('awaken', '#ffd36a', l >= 5 ? 'legendary' : 'epic', 120), h('b', null, `${th ? 'ตื่นรู้' : 'Awakening'} ${l} / ${AWAKEN_MAX}`)),
      h('div', { class: 'grow' }, h('div', { class: 'aw-steps' }, ...Array.from({ length: AWAKEN_MAX }, (_, i) => h('i', { class: i < l ? 'on' : '' }))),
        h('div', { class: 'sec-title' }, th ? 'ผลปัจจุบัน' : 'Current bonus'), h('ul', { class: 'icard-list' }, ...(awakenMods(l).filter((x) => x.value).map((x) => h('li', null, '• ' + statText(x.stat, x.value))))),
        l < AWAKEN_MAX ? h('div', null, h('div', { class: 'sec-title' }, th ? 'ระดับถัดไป' : 'Next level'), h('ul', { class: 'icard-list' }, ...awakenMods(l + 1).filter((x) => x.value).map((x) => h('li', { class: 'up' }, '• ' + statText(x.stat, x.value)))),
          h('div', { class: 'row wrap' }, h('span', { class: ch.level >= req ? 'good' : 'warn' }, `${th ? 'ต้องการเลเวล' : 'Requires level'} ${req}`), h('span', null, currencyIcon('gold'), ` ${cost.gold.toLocaleString()}`), h('span', null, currencyIcon('dust'), ` ${cost.dust}`)),
          h('button', { class: 'btn gold big', disabled: ch.level < req || ch.gold < cost.gold || ch.dust < cost.dust, onclick: () => send({ t: 'awaken' }) }, th ? 'ตื่นรู้' : 'Awaken')) : h('p', { class: 'good' }, th ? 'ตื่นรู้เต็มขั้นแล้ว' : 'Fully awakened'))),
    h('div', { class: 'sec-title' }, uiIcon('emblem', 22), `${th ? 'ตราสัญลักษณ์' : 'Emblems'} (${eq.size}/${EMBLEM_SLOTS})`),
    h('div', { class: 'emb-grid' }, ...Object.values(EMBLEMS).map((e) => {
      const ok = emblemUnlocked(acc, e.id), on = eq.has(e.id);
      const b = h('button', { class: 'emb' + (on ? ' on' : '') + (ok ? '' : ' locked'), disabled: !ok, onclick: () => { const next = on ? [...eq].filter((x) => x !== e.id) : [...eq, e.id]; if (next.length <= EMBLEM_SLOTS) send({ t: 'emblem_set', ids: next }); } }, tileIcon('emblem', ok ? e.color : '#444', on ? 'legendary' : ok ? 'rare' : 'common', 60), h('b', null, e.name), h('small', null, e.mods.map((x) => statText(x.stat, x.value)).join(', ')), h('small', { class: 'muted' }, ok ? (on ? (th ? 'ใส่อยู่' : 'Equipped') : (th ? 'คลิกเพื่อใส่' : 'Click to equip')) : e.hint));
      return b;
    })), void m, void unlocked);
}

export function wardrobeWindow(acc: AccountProgress, send: Send): HTMLElement {
  const th = getLang() === 'th', m = normalizeMeta(acc.meta);
  const card = (kind: 'costume' | 'frame' | 'mount', id: string, name: string, color: string, rarity: string, owned: boolean, on: boolean) =>
    h('button', { class: 'emb' + (on ? ' on' : '') + (owned ? '' : ' locked'), disabled: !owned, onclick: () => send({ t: 'cosmetic_set', kind, id: on ? null : id }) }, tileIcon(kind === 'mount' ? 'mount' : kind === 'frame' ? 'emblem' : 'costume', owned ? color : '#444', owned ? RAR_FRAME[rarity] ?? 'rare' : 'common', 60), h('b', null, name), h('small', { class: 'muted' }, owned ? (on ? (th ? 'ใช้อยู่' : 'In use') : (th ? 'คลิกเพื่อใช้' : 'Click to use')) : `${rarity} · ${th ? 'ร้านค้า / ขอพร / สิทธิประโยชน์' : 'Shop / Wish / Benefits'}`));
  return h('div', { class: 'metawin' },
    h('div', { class: 'sec-title' }, uiIcon('costume', 22), th ? 'ชุด' : 'Costumes'), h('div', { class: 'emb-grid' }, ...Object.values(COSMETICS).filter((c) => c.kind === 'costume').map((c) => card('costume', c.id, c.name, c.color, c.rarity, m.cosmetics.owned.includes(c.id), m.cosmetics.costume === c.id))),
    h('div', { class: 'sec-title' }, uiIcon('emblem', 22), th ? 'กรอบรูปโปรไฟล์' : 'Portrait frames'), h('div', { class: 'emb-grid' }, ...Object.values(COSMETICS).filter((c) => c.kind === 'frame').map((c) => card('frame', c.id, c.name, c.color, c.rarity, m.cosmetics.owned.includes(c.id), m.cosmetics.frame === c.id))),
    h('div', { class: 'sec-title' }, uiIcon('mount', 22), th ? 'พาหนะ (เร็วขึ้นนอกการต่อสู้ ปุ่ม 16)' : 'Mounts (faster out of combat · slot 16)'), h('div', { class: 'emb-grid' }, ...Object.values(MOUNTS).map((x) => card('mount', x.id, `${x.name} +${Math.round(x.speed * 100)}%`, x.color, x.rarity, m.mounts.includes(x.id), m.mount === x.id))));
}
