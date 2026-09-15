#!/usr/bin/env node
/* ============================================================
   One-off migration: old Google Sheet tracker  →  Supabase
   - Fixes the one-day date shift (UTC timestamps → Europe/Rome dates)
   - Merges duplicate person+day rows (last one wins)
   - Creates missing projects; optionally creates missing users

   Usage (from repo root, Node 18+):
     SUPABASE_URL=https://xxxx.supabase.co \
     SUPABASE_SERVICE_ROLE_KEY=eyJ... \
     node tools/migrate-from-sheet.mjs [--create-users] [--dry-run]

   Never commit the service-role key. Run it once, from your PC.
   ============================================================ */

const SHEET_API = 'https://script.google.com/macros/s/AKfycbyjbTLGVXKSUwtKeEY3AIeY9U18EplmbikfOrp8NnMg3kWdkilb7bNwR3wGPiO7U8Sd/exec';
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOMAIN = process.env.AUTH_EMAIL_DOMAIN || 'onetech.local';
const PREFIX = process.env.DEFAULT_PASSWORD_PREFIX || '301301';
const CREATE_USERS = process.argv.includes('--create-users');
const DRY = process.argv.includes('--dry-run');
const GROUP_COLORS = ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#4a3aa7','#e34948'];
const AVATAR = [['#EEEDFE','#3C3489'],['#E1F5EE','#085041'],['#FCE4D6','#712B13'],['#FAEEDA','#633806'],['#FBEAF0','#72243E'],['#E6F1FB','#0C447C'],['#EAF3DE','#27500A'],['#FAECE7','#4A1B0C']];

if (!URL_ || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function rest(path, opts = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: { ...H, Prefer: 'return=representation', ...(opts.headers || {}) } });
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${path}: ${t}`);
  return t ? JSON.parse(t) : null;
}
async function authAdmin(path, body) {
  const r = await fetch(`${URL_}/auth/v1/admin/${path}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json(); if (!r.ok) throw new Error(`${r.status} auth/${path}: ${JSON.stringify(j)}`);
  return j;
}
const romeDate = (iso) => {
  // sheet returns e.g. 2026-05-25T22:00:00.000Z == 2026-05-26 00:00 Europe/Rome
  const s = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
  return s;
};
const creds = (full) => { const p = full.trim().split(/\s+/); const fi = p[0][0] || '', li = p.length > 1 ? p[p.length - 1][0] : ''; return { username: p[0].normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(), password: PREFIX + fi.toUpperCase() + li.toLowerCase() }; };

(async () => {
  console.log('1) Downloading old data...');
  const txt = await (await fetch(`${SHEET_API}?action=getAll&callback=x`)).text();
  const old = JSON.parse(txt.slice(2, -1));
  console.log(`   ${old.team.length} people, ${old.projects.length} projects, ${old.entries.length} entries`);

  // ---- normalise + dedupe entries (last wins)
  const byKey = new Map();
  for (const e of old.entries) byKey.set(e.person + '|' + romeDate(e.date), { person: e.person, date: romeDate(e.date), hours: e.hours });
  const entries = [...byKey.values()];
  console.log(`   ${entries.length} unique person-days after merging ${old.entries.length - entries.length} duplicates`);

  // ---- projects
  console.log('2) Projects...');
  const existing = await rest('projects?select=*');
  const groupColor = {}; existing.forEach(p => groupColor[p.group_name] = p.color);
  let ci = existing.length;
  const projMap = {}; // old id → new uuid
  for (const [i, op] of old.projects.entries()) {
    const group = op.group || op.name;
    let row = existing.find(p => p.name.toLowerCase() === op.name.toLowerCase() && p.group_name.toLowerCase() === group.toLowerCase());
    if (!row) {
      const color = groupColor[group] || GROUP_COLORS[(ci++) % GROUP_COLORS.length]; groupColor[group] = color;
      console.log(`   + create project "${group} · ${op.name}"`);
      if (!DRY) { [row] = await rest('projects', { method: 'POST', body: JSON.stringify({ name: op.name, group_name: group, color, sort_order: 100 + i * 10 }) }); existing.push(row); }
      else row = { id: 'dry-' + op.id };
    }
    projMap[op.id] = row.id;
  }

  // ---- users
  console.log('3) Users...');
  let profiles = await rest('profiles?select=*');
  const userMap = {}; // old person name → profile id
  let ai = profiles.length;
  for (const t of old.team) {
    const c = creds(t.name);
    let pr = profiles.find(p => p.username === c.username);
    if (!pr && CREATE_USERS) {
      const [bg, tx] = AVATAR[(ai++) % AVATAR.length];
      console.log(`   + create user ${c.username} (${t.name}) password ${c.password}`);
      if (!DRY) {
        const u = await authAdmin('users', { email: `${c.username.toLowerCase()}@${DOMAIN}`, password: c.password, email_confirm: true, user_metadata: { username: c.username, full_name: t.name, role: 'member', color_bg: bg, color_tx: tx } });
        pr = { id: u.id, username: c.username }; profiles.push(pr);
      } else pr = { id: 'dry-' + c.username };
    }
    if (!pr) { console.log(`   ! no user for "${t.name}" (username ${c.username}) — create it in Admin or rerun with --create-users; their entries will be skipped`); continue; }
    userMap[t.name] = pr.id;
  }

  // ---- entries
  console.log('4) Entries...');
  const rows = [];
  let skipped = 0;
  for (const e of entries) {
    const uid = userMap[e.person]; if (!uid) { skipped++; continue; }
    for (const [pid, h] of Object.entries(e.hours || {})) {
      const hours = Number(h); if (!(hours > 0)) continue;
      const project_id = projMap[pid]; if (!project_id) { console.log(`   ! unknown project id ${pid}`); continue; }
      rows.push({ user_id: uid, project_id, entry_date: e.date, hours: Math.min(24, hours) });
    }
  }
  console.log(`   ${rows.length} rows to upsert, ${skipped} person-days skipped (no user)`);
  if (!DRY) {
    for (let i = 0; i < rows.length; i += 500) {
      await rest('time_entries?on_conflict=user_id,project_id,entry_date', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) });
      console.log(`   upserted ${Math.min(i + 500, rows.length)}/${rows.length}`);
    }
  }
  console.log(DRY ? 'Dry run complete — nothing written.' : 'Done.');
})().catch(e => { console.error(e); process.exit(1); });
