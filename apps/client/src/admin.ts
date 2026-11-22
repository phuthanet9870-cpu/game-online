// Staff console. Talks only to /api/admin/* which enforces role + MFA server-side; this page holds no secrets.
import './style.css';
import { h, clear, toast, promptDialog } from './ui/dom.js';
import { WEEKLY_EVENTS } from '@astra/shared';

const root = document.getElementById('admin')!;
let token: string | null = null;
try { token = localStorage.getItem('astra.token'); } catch { /* storage blocked */ }

async function api(method: string, path: string, body?: unknown) {
  const r = await fetch('/api/admin' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? `HTTP ${r.status}`), { data: j, status: r.status });
  return j;
}
const page = (...kids: Array<Node | string | null>) => { clear(root).append(h('div', { class: 'admin' }, h('header', { class: 'row between' }, h('h1', { class: 'logo small' }, 'ASTRA', h('span', null, 'STAFF CONSOLE')), h('a', { href: '/', class: 'btn ghost' }, 'Back to game')), ...kids)); };

async function boot() {
  if (!token) return page(h('p', null, 'Log in to the game first (same browser), then reopen this page.'));
  let me: any;
  try { me = await api('GET', '/me'); } catch { return page(h('p', { class: 'warn' }, 'This account has no staff role.')); }
  if (!me.mfa) return mfa(me);
  dashboard(me);
}

async function mfa(me: any) {
  const code = h('input', { type: 'text', inputMode: 'numeric', maxLength: 6, placeholder: '123456', id: 'mfa-code', 'aria-label': 'Authenticator code' });
  const verify = h('button', { class: 'btn primary', onclick: async () => { try { await api('POST', '/mfa/verify', { code: code.value }); toast('Verified', 'good'); boot(); } catch (e) { toast((e as Error).message, 'error'); } } }, 'Verify');
  if (!me.totpEnabled) {
    const box = h('div', null, h('p', null, 'Staff accounts must use an authenticator app (TOTP). Generate a secret, add it to your app, then enter the 6-digit code.'),
      h('button', { class: 'btn', onclick: async () => { const r = await api('POST', '/mfa/setup'); box.append(h('p', null, 'Secret: ', h('code', null, r.secret)), h('p', { class: 'muted' }, r.uri)); } }, 'Generate secret'));
    return page(h('h2', null, `Set up MFA for ${me.username} (${me.role})`), box, h('div', { class: 'row' }, code, verify));
  }
  page(h('h2', null, `MFA check — ${me.username} (${me.role})`), h('p', null, 'Enter the current code from your authenticator app.'), h('div', { class: 'row' }, code, verify));
}

function dashboard(me: any) {
  const body = h('div');
  const tabs: Array<[string, () => Promise<void>]> = [
    ['Overview', async () => { const o = await api('GET', '/overview'); clear(body).append(table([['Online sessions', o.stats.sessions], ['Rooms', o.stats.rooms.length], ['Accounts', o.accounts], ['Characters', `${o.characters.n} (${o.characters.hc} hardcore, ${o.characters.dead} fallen)`], ['Guilds', o.guilds], ['Active listings', o.listings], ['Weekly event', o.weekly.name], ['Maintenance', o.live.maintenance ? 'ON' : 'off']]), h('h3', null, 'Recent server errors'), pre(o.errors)); }],
    ['Analytics', async () => { const a = await api('GET', '/analytics'); clear(body).append(h('h3', null, 'Class usage'), table(a.classes.map((c: any) => [c.cls, `${c.n} characters · avg level ${c.avg_level}`])), h('h3', null, 'Runs (7 days)'), table(a.runs7d.map((r: any) => [r.mode, `${r.won} won · ${r.lost} failed · avg ${r.avg_secs}s`])), h('h3', null, 'Economy'), table([['Gold held by characters', a.economy.gold], ['Astral Dust held', a.economy.dust], ['Hardcore deaths (7d)', a.hardcoreDeaths7d]]), h('h3', null, 'Level distribution (buckets of 10)'), table(a.levelBuckets.map((b: any) => [`${(b.b - 1) * 10 + 1}-${b.b * 10}`, b.n]))); }],
    ['Players', async () => {
      const q = h('input', { type: 'search', placeholder: 'Account or character name', id: 'q' });
      const out = h('div');
      const search = async () => { const r = await api('POST', '/players', { q: q.value }); clear(out).append(...r.rows.map((p: any) => h('div', { class: 'list-row' }, h('span', { class: 'grow' }, `${p.username} (${p.role})${p.banned ? ' BANNED' : ''}${p.muted_until && new Date(p.muted_until) > new Date() ? ' muted' : ''} — ${p.name ?? '(no character)'} ${p.cls ?? ''} ${p.level ?? ''}${p.hardcore ? ' HC' : ''}`),
        p.char_id ? h('button', { class: 'btn tiny ghost', onclick: async () => { const c = await api('GET', `/character/${p.char_id}`); out.append(h('h3', null, `${c.character.name} (read-only, access logged)`), pre({ level: c.character.level, gold: c.character.gold, equipment: Object.fromEntries(Object.entries(c.character.equipment).map(([k, v]: any) => [k, `${v.rarity} ${v.name}`])), stats: c.character.stats }), h('h4', null, 'Recent activity'), pre(c.audit.slice(0, 20))); } }, 'Inspect') : null,
        ...['mute', 'unmute', 'kick', 'ban', 'unban'].map((a) => h('button', { class: 'btn tiny' + (a === 'ban' ? ' danger' : ''), onclick: () => moderate(p.account_id, a) }, a))))); };
      q.onkeydown = (e) => { if (e.key === 'Enter') void search(); };
      clear(body).append(h('div', { class: 'row' }, q, h('button', { class: 'btn', onclick: search }, 'Search')), out);
    }],
    ['Announce', async () => {
      const text = h('input', { type: 'text', maxLength: 300, placeholder: 'Message to every online player', id: 'ann', style: 'width:100%' });
      clear(body).append(text, h('button', { class: 'btn primary', onclick: async () => { const r = await api('POST', '/announce', { text: text.value }); toast(`Delivered to ${r.delivered} sessions`, 'good'); } }, 'Send announcement'));
    }],
    ['Live config', async () => {
      const c = await api('GET', '/config');
      const cfg = structuredClone(c.active);
      const flag = (k: string) => { const cb = h('input', { type: 'checkbox', checked: cfg.flags[k], id: 'f-' + k }); cb.onchange = () => { cfg.flags[k] = cb.checked; }; return h('label', { class: 'check' }, cb, ' ' + k); };
      const num = (k: 'xpMul' | 'goldMul' | 'lootBonus', step: string) => { const i = h('input', { type: 'number', step, value: String(cfg[k]), id: 'n-' + k, style: 'width:90px' }); i.oninput = () => { cfg[k] = Number(i.value); }; return h('label', null, `${k} `, i); };
      const weekly = h('select', { id: 'weekly' }, h('option', { value: '' }, '(automatic rotation)'), WEEKLY_EVENTS.map((e) => h('option', { value: e.id, selected: cfg.weeklyOverride === e.id }, e.name)));
      weekly.onchange = () => { cfg.weeklyOverride = weekly.value || null; };
      const maint = h('input', { type: 'checkbox', checked: cfg.maintenance, id: 'maint' }); maint.onchange = () => { cfg.maintenance = maint.checked; };
      const motd = h('input', { type: 'text', value: cfg.motd, maxLength: 300, id: 'motd', style: 'width:100%' }); motd.oninput = () => { cfg.motd = motd.value; };
      const note = h('input', { type: 'text', placeholder: 'Change note (required for the history)', id: 'note', style: 'width:100%' });
      const diffBox = h('div');
      const admin = me.role === 'admin';
      clear(body).append(
        h('h3', null, 'Feature flags'), h('div', { class: 'row wrap' }, ...Object.keys(cfg.flags).map(flag)),
        h('h3', null, 'Multipliers'), h('div', { class: 'row wrap' }, num('xpMul', '0.05'), num('goldMul', '0.05'), num('lootBonus', '0.05')),
        h('h3', null, 'Weekly event override'), weekly,
        h('h3', null, 'Maintenance & message of the day'), h('label', { class: 'check' }, maint, ' maintenance mode (players cannot log in)'), motd,
        h('h3', null, 'Publish'), note,
        h('div', { class: 'row' }, h('button', { class: 'btn', disabled: !admin, onclick: async () => { try { const r = await api('POST', '/config/preview', { config: cfg }); clear(diffBox).append(r.diff.length ? table(r.diff.map((d: any) => [d[0], `${JSON.stringify(d[1])} → ${JSON.stringify(d[2])}`])) : h('p', null, 'No changes')); } catch (e) { toast((e as Error).message, 'error'); } } }, 'Preview changes'),
          h('button', { class: 'btn primary', disabled: !admin, onclick: async () => { if (!note.value.trim()) return toast('Add a change note', 'error'); try { const r = await api('POST', '/config', { config: cfg, note: note.value }); toast(`Published version ${r.version}`, 'good'); tabs[4]![1](); } catch (e) { toast((e as Error).message, 'error'); } } }, 'Publish')),
        h('p', { class: 'muted', hidden: admin }, 'Moderators can view the config; publishing requires the admin role.'),
        diffBox,
        h('h3', null, 'History'), h('div', { class: 'list' }, c.history.map((v: any) => h('div', { class: 'list-row' }, h('span', { class: 'grow' }, `v${v.version}${v.active ? ' (active)' : ''} — ${v.note || ''} — ${v.username ?? '?'} ${new Date(v.created_at).toLocaleString()}`), admin && !v.active ? h('button', { class: 'btn tiny', onclick: async () => { await api('POST', '/config/rollback', { version: v.version }); toast(`Rolled back to v${v.version}`, 'good'); tabs[4]![1](); } }, 'Roll back to this') : null))));
    }],
    ['Audit log', async () => { const a = await api('GET', '/audit'); clear(body).append(h('div', { class: 'list' }, a.rows.map((r: any) => h('div', { class: 'list-row' }, h('small', { class: 'muted' }, new Date(r.at).toLocaleString()), h('b', null, r.action), h('span', { class: 'grow' }, `${r.username ?? ''} ${r.char_id ?? ''} ${JSON.stringify(r.data ?? '').slice(0, 160)}`))))); }],
  ];
  const nav = h('nav', { class: 'row wrap' }, tabs.map(([name, fn]) => h('button', { class: 'btn', onclick: async (e: Event) => { for (const b of Array.from(nav.children)) b.classList.remove('on'); (e.target as HTMLElement).classList.add('on'); try { await fn(); } catch (err) { clear(body).append(h('p', { class: 'warn' }, (err as Error).message)); } } }, name)));
  page(h('p', { class: 'muted' }, `${me.username} · ${me.role} · MFA verified. Every action here is written to the audit log.`), nav, body);
  (nav.firstChild as HTMLElement).click();
}

async function moderate(accountId: string, action: string) {
  const reason = (await promptDialog(`Reason for ${action}`, 'Visible in the audit log.', '', 'Apply', 'Cancel')) ?? '';
  if (!reason) return toast('A reason is required', 'error');
  const minutes = action === 'mute' ? Number((await promptDialog('Mute duration', 'Minutes', '60')) ?? 60) : undefined;
  try { await api('POST', '/moderate', { accountId, action, reason, minutes }); toast(`${action} applied`, 'good'); } catch (e) { toast((e as Error).message, 'error'); }
}
const table = (rows: Array<[unknown, unknown]>) => h('table', { class: 'stats' }, rows.map(([k, v]) => h('tr', null, h('th', null, String(k)), h('td', null, String(v)))));
const pre = (v: unknown) => h('pre', { class: 'pre' }, JSON.stringify(v, null, 2));
void boot();
