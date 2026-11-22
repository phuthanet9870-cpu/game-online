// Guild window: my guild, a categorised guild browser with join requests, officer request queue and rankings.
import { CLASSES, GUILD, GUILD_CATEGORIES, type CharacterData } from '@astra/shared';
import { getLang } from '../i18n.js';
import { h, promptDialog } from './dom.js';
import { uiIcon } from './icons.js';
import { guildPanel } from './social.js';

type Send = (m: any) => void;
export const guildUI = { tab: 'mine' as 'mine' | 'browse' | 'requests' | 'ranking' | 'profile', cat: 'all', q: '', openOnly: false, board: 'level' as 'level' | 'power' | 'members', browse: [] as any[], ranking: null as any };

const crest = (tag: string, size = 40) => {
  let hsh = 0; for (const c of tag) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
  const hue = hsh % 360;
  return h('span', { class: 'g-crest', style: `width:${size}px;height:${size}px;background:linear-gradient(145deg,hsl(${hue} 60% 45%),hsl(${(hue + 40) % 360} 55% 22%));font-size:${size / 3.3}px` }, tag);
};

export function guildWindow(ch: CharacterData, data: any, send: Send, inTown: boolean, rerender: () => void): HTMLElement {
  const th = getLang() === 'th', S = guildUI, g = data?.guild;
  const isOfficer = g && g.members.some((m: any) => m.charId === ch.id && m.rank !== 'member');
  const go = (tab: typeof S.tab) => { S.tab = tab; if (tab === 'browse') send({ t: 'guild_browse', cat: S.cat, q: S.q, openOnly: S.openOnly }); if (tab === 'ranking') send({ t: 'guild_ranking', board: S.board }); rerender(); };
  const tabs: Array<[typeof S.tab, string, string, boolean]> = [
    ['mine', 'crest', th ? 'กิลด์ของฉัน' : 'My Guild', true], ['browse', 'search', th ? 'ค้นหากิลด์' : 'Find a Guild', true],
    ['requests', 'mail', `${th ? 'คำขอเข้าร่วม' : 'Join Requests'}${g?.requests?.length ? ` (${g.requests.length})` : ''}`, !!isOfficer], ['profile', 'scroll', th ? 'โปรไฟล์กิลด์' : 'Guild Profile', !!isOfficer],
    ['ranking', 'trophy', th ? 'ตารางอันดับ' : 'Rankings', true]];
  if ((S.tab === 'requests' || S.tab === 'profile') && !isOfficer) S.tab = 'mine';
  let body: HTMLElement;
  if (S.tab === 'browse') {
    const q = h('input', { type: 'text', placeholder: th ? 'ค้นหาชื่อหรือแท็ก…' : 'Search name or tag…', value: S.q, maxLength: 24 }) as HTMLInputElement;
    q.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { S.q = q.value; go('browse'); } };
    const pending = new Set<string>((data?.pending ?? []).map((p: any) => p.id));
    body = h('div', { class: 'gw-browse' },
      h('div', { class: 'gw-cats' }, ...[['all', 'grid', th ? 'ทั้งหมด' : 'All'] as const, ...Object.entries(GUILD_CATEGORIES).map(([k, c]) => [k, c.icon, th ? c.th : c.name] as const)].map(([k, ic, l]) =>
        h('button', { class: 'tr-path' + (S.cat === k ? ' on' : ''), onclick: () => { S.cat = k; go('browse'); } }, uiIcon(ic, 22), l))),
      h('div', { class: 'gw-list' },
        h('div', { class: 'row' }, q, h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.openOnly, onchange: (e: Event) => { S.openOnly = (e.target as HTMLInputElement).checked; go('browse'); } }), th ? ' เฉพาะกิลด์ที่เปิดรับทันที' : ' Open guilds only'), h('button', { class: 'btn', onclick: () => { S.q = q.value; go('browse'); } }, th ? 'ค้นหา' : 'Search')),
        S.browse.length ? null : h('p', { class: 'muted' }, th ? 'ยังไม่มีกิลด์ในหมวดนี้ — ลองสร้างกิลด์ของคุณเองที่แท็บ "กิลด์ของฉัน"' : 'No guilds in this category yet — found your own under "My Guild".'),
        ...S.browse.map((r) => h('div', { class: 'gw-row' }, crest(r.tag),
          h('div', { class: 'grow' }, h('b', null, `‹${r.tag}› ${r.name}`), h('small', { class: 'muted' }, `${th ? GUILD_CATEGORIES[r.category as keyof typeof GUILD_CATEGORIES]?.th : GUILD_CATEGORIES[r.category as keyof typeof GUILD_CATEGORIES]?.name} · ${th ? 'หัวหน้า' : 'Leader'} ${r.leader}`), r.desc ? h('small', null, r.desc) : null),
          h('div', { class: 'gw-stats' }, h('span', null, `Lv ${r.level}`), h('span', null, uiIcon('people', 16), ` ${r.members}/${r.max}`), h('span', null, `${th ? 'เลเวลขั้นต่ำ' : 'Min Lv'} ${r.minLevel}`)),
          g ? h('span', { class: 'tag' }, g.id === r.id ? (th ? 'กิลด์ของคุณ' : 'Your guild') : '') :
            r.applied || pending.has(r.id) ? h('button', { class: 'btn ghost tiny', onclick: () => { send({ t: 'guild_withdraw_req', id: r.id }); r.applied = false; pending.delete(r.id); setTimeout(() => go('browse'), 150); } }, th ? 'ยกเลิกคำขอ' : 'Withdraw') :
            h('button', { class: 'btn gold tiny', disabled: ch.level < r.minLevel || r.members >= r.max, onclick: async () => { const m = r.open ? '' : await promptDialog(th ? 'ขอเข้าร่วมกิลด์' : 'Ask to join', th ? 'ข้อความถึงหัวหน้ากิลด์ (ไม่บังคับ)' : 'Message to the officers (optional)', '', th ? 'ส่งคำขอ' : 'Send', th ? 'ยกเลิก' : 'Cancel'); if (m === null) return; send({ t: 'guild_apply', id: r.id, msg: m }); setTimeout(() => go('browse'), 150); } }, r.open ? (th ? 'เข้าร่วมทันที' : 'Join now') : (th ? 'ขอเข้าร่วม' : 'Ask to join'))))));
  } else if (S.tab === 'requests') {
    const reqs = g?.requests ?? [];
    body = h('div', { class: 'gw-list' }, reqs.length ? null : h('p', { class: 'muted' }, th ? 'ไม่มีคำขอค้างอยู่' : 'No pending requests.'),
      ...reqs.map((r: any) => h('div', { class: 'gw-row' }, uiIcon('person', 36),
        h('div', { class: 'grow' }, h('b', null, r.name), h('small', { class: 'muted' }, `${CLASSES[r.cls as keyof typeof CLASSES]?.name ?? r.cls} Lv ${r.level} · ${new Date(r.at).toLocaleString()}`), r.msg ? h('small', null, `“${r.msg}”`) : null),
        h('button', { class: 'btn gold tiny', disabled: g.members.length >= GUILD.maxMembers, onclick: () => send({ t: 'guild_req', charId: r.charId, accept: true }) }, th ? 'รับเข้า' : 'Accept'),
        h('button', { class: 'btn ghost tiny', onclick: () => send({ t: 'guild_req', charId: r.charId, accept: false }) }, th ? 'ปฏิเสธ' : 'Decline'))));
  } else if (S.tab === 'profile') {
    const cat = h('select', null, ...Object.entries(GUILD_CATEGORIES).map(([k, c]) => h('option', { value: k, selected: g.category === k }, th ? c.th : c.name))) as HTMLSelectElement;
    const desc = h('textarea', { maxLength: 160, rows: 3, placeholder: th ? 'แนะนำกิลด์สั้นๆ' : 'Short guild description' }) as HTMLTextAreaElement; desc.value = g.desc ?? '';
    const lvl = h('input', { type: 'number', min: 1, max: 100, value: g.minLevel ?? 1, style: 'width:80px' }) as HTMLInputElement;
    const open = h('input', { type: 'checkbox', checked: !!g.open }) as HTMLInputElement;
    for (const el of [desc, lvl]) el.onkeydown = (e) => e.stopPropagation();
    body = h('div', { class: 'gw-profile' },
      h('label', null, th ? 'หมวดกิลด์' : 'Category', cat), h('label', null, th ? 'คำอธิบาย' : 'Description', desc), h('label', null, th ? 'เลเวลขั้นต่ำ' : 'Minimum level', lvl),
      h('label', { class: 'chk' }, open, th ? ' เปิดรับสมาชิกทันที (ไม่ต้องอนุมัติ)' : ' Open recruitment (join without approval)'),
      h('button', { class: 'btn gold', onclick: () => send({ t: 'guild_settings', category: cat.value, desc: desc.value, minLevel: Number(lvl.value), open: open.checked }) }, th ? 'บันทึก' : 'Save'));
  } else if (S.tab === 'ranking') {
    const R = S.ranking;
    const boards: Array<[typeof S.board, string]> = [['level', th ? 'เลเวลกิลด์' : 'Guild level'], ['power', th ? 'พลังรวม (เลเวลสมาชิก)' : 'Total power'], ['members', th ? 'จำนวนสมาชิก' : 'Members']];
    body = h('div', null, h('div', { class: 'row' }, ...boards.map(([b, l]) => h('button', { class: 'btn' + (S.board === b ? ' gold' : ' ghost'), onclick: () => { S.board = b; go('ranking'); } }, l))),
      h('table', { class: 'gw-rank' }, h('thead', null, h('tr', null, ...['#', th ? 'กิลด์' : 'Guild', th ? 'หมวด' : 'Category', 'Lv', th ? 'สมาชิก' : 'Members', th ? 'พลัง' : 'Power', th ? 'หัวหน้า' : 'Leader'].map((x) => h('th', null, x)))),
        h('tbody', null, ...(R?.rows ?? []).map((r: any) => h('tr', { class: (r.id === R.mine ? 'me ' : '') + (r.rank <= 3 ? `top${r.rank}` : '') },
          h('td', null, r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : String(r.rank)), h('td', null, crest(r.tag, 26), ` ‹${r.tag}› ${r.name}`), h('td', null, th ? GUILD_CATEGORIES[r.category as keyof typeof GUILD_CATEGORIES]?.th : GUILD_CATEGORIES[r.category as keyof typeof GUILD_CATEGORIES]?.name),
          h('td', null, String(r.level)), h('td', null, `${r.members}/${r.max}`), h('td', null, String(r.power)), h('td', null, r.leader))))),
      R?.rows?.length ? null : h('p', { class: 'muted' }, th ? 'ยังไม่มีกิลด์' : 'No guilds yet.'));
  } else {
    body = h('div', null, !g && data?.pending?.length ? h('p', { class: 'hint' }, `${th ? 'คำขอที่รออนุมัติ' : 'Pending requests'}: ${data.pending.map((p: any) => `‹${p.tag}› ${p.name}`).join(', ')}`) : null,
      !g ? h('button', { class: 'btn gold', onclick: () => go('browse') }, uiIcon('search', 18), th ? ' ค้นหากิลด์เพื่อขอเข้าร่วม' : ' Browse guilds to join') : null,
      guildPanel(ch, data, send, inTown));
  }
  return h('div', { class: 'guildwin' }, h('div', { class: 'win-tabs sub' }, ...tabs.filter((x) => x[3]).map(([id, ic, l]) => h('button', { class: 'wt icon' + (S.tab === id ? ' on' : ''), onclick: () => go(id) }, uiIcon(ic, 20), l))), body);
}
