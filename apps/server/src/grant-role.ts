// Grant a staff role from the server shell (there is deliberately no in-game way to do this).
// Usage: npx tsx apps/server/src/grant-role.ts <username> <admin|moderator|player>
import { pool } from './db.js';
const [username, role] = process.argv.slice(2);
if (!username || !['admin', 'moderator', 'player'].includes(role ?? '')) { console.error('Usage: grant-role.ts <username> <admin|moderator|player>'); process.exit(1); }
const r = await pool.query('UPDATE accounts SET role = $1 WHERE lower(username) = lower($2) RETURNING id', [role, username]);
if (!r.rowCount) { console.error('No such account'); process.exit(1); }
await pool.query("INSERT INTO audit_log (account_id, action, data) VALUES ($1, 'role_change', $2)", [r.rows[0].id, JSON.stringify({ role, via: 'cli' })]);
console.log(`${username} is now ${role}. They must set up MFA at /admin.html before using staff tools.`);
await pool.end();
