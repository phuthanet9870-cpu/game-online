import { migrate, pool } from './db.js';
const applied = await migrate();
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database up to date');
await pool.end();
