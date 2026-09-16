#!/usr/bin/env node
/* ============================================================
   One-off migration: old Google Sheet tracker  →  Supabase
   - Fixes the one-day date shift (UTC timestamps → Europe/Rome dates)
   - Merges duplicate person+day rows (last one wins)
   - Creates missing projects; creates missing users (as admin)

   Runs as an ADMIN USER of the app (no secret key needed):
     ADMIN_USER=MARAT ADMIN_PASS=... node tools/migrate-from-sheet.mjs [--dry-run] [--no-users]
   URL and publishable key are read from config.js.

   PowerShell:
     $env:ADMIN_USER="MARAT"; $env:ADMIN_PASS="..."; node tools/migrate-from-sheet.mjs
   ============================================================ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SHEET_API = 'https://script.google.com/macros/s/AKfycbyjbTLGVXKSUwtKeEY3AIeY9U18EplmbikfOrp8NnMg3kWdkilb7bNwR3wGPiO7U8Sd/exec';
const here = dirname(fileURLToPath(import.meta.url));
const cfgSrc = readFileSync(join(here, '..', 'config.js'), 'utf8');
const cfg = (k) => (cfgSrc.match(new RegExp(k + ':\\s*"([^"]+)"')) || [])[1];
const URL_ = process.env.SUPABASE_URL || cfg('SUPABASE_URL');
const KEY = process.env.SUPABASE_ANON_KEY || cfg('SUPABASE_ANON_KEY');
const DOMAIN = process.env.AUTH_EMAIL_DOMAIN || cfg('AUTH_EMAIL_DOMAIN') || 'onetech.local';
const PREFIX = process.env.DEFAULT_PASSWORD_PREFIX || cfg('DEFAULT_PASSWORD_PREFIX') || '301301';
const ADMIN_USER = process.env.ADMIN_USER, ADMIN_PASS = process.env.ADMIN_PASS;
const DRY = process.argv.includes('--dry-run');
const NO_USERS = process.argv.includes('--no-users');
const GROUP_COLORS = ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#4a3aa7','#e34948'];
const AVATAR = [['#EEEDFE','#3C3489'],['#E1F5EE','#085041'],['#FCE4D6','#712B13'],['#FAEEDA','#633806'],['#FBEAF0','#72243E'],['#E6F1FB','#0C447C'],['#EAF3DE','#27500A'],['#FAECE7','#4A1B0C']];

if (!URL_ || !KEY) { console.error('SUPABASE_URL / SUPABASE_ANON_KEY missing (config.js)'); process.exit(1); }
if (!ADMIN_USER || !ADMIN_PASS) { console.error('Set ADMIN_USER and ADMIN_PASS (an admin login of the app)'); process.exit(1); }

let TOKEN = '';
const H = () => ({ apikey: KEY, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });
async function rest(path, opts = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: { ...H(), Prefer: 'return=representation', ...(opts.headers || {}) } });
  const t = await r.text(); if (!r.ok) throw new Error(`${r.status} ${path}: ${t}`);
  return t ? JSON.parse(t) : null;
}
async function adminFn(body) {
  const r = await fetch(`${URL_}/functions/v1/admin-users`, { method: 'POST', headers: H(), body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(`admin-users: ${j.error || r.status}`);
  return j;
}
const romeDate = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Rome' });
const creds = (full) => { const p = full.trim().split(/\s+/); const fi = p[0][0] || '', li = p.length > 1 ? p[p.length - 1][0] : ''; return { username: p[0].normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase(), password: PREFIX + fi.toUpperCase() + li.toLowerCase() }; };

(async () => {
  console.log('0) Login as', ADMIN_USER);
  const lr = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${ADMIN_USER.toLowerCase()}@${DOMAIN}`, password: ADMIN_PASS }) });
  const lj = await lr.json(); if (!lj.access_token) throw new Error('login failed: ' + JSON.stringify(lj)); TOKEN = lj.access_token;

  console.log('1) Downloading old data...');
  const txt = await (await fetch(`${SHEET_API}?action=getAll&callback=x`)).text();
  const old = JSON.parse(txt.slice(2, -1));
  console.log(`   ${old.team.length} people, ${old.projects.length} projects, ${old.entries.length} entries`);
  const byKey = new Map();
  for (const e of old.entries) byKey.set(e.person + '|' + romeDate(e.date), { person: e.person, date: romeDate(e.date), hours: e.hours });
  const entries = [...byKey.values()];
  console.log(`   ${entries.length} unique person-days after merging ${old.entries.length - entries.length} duplicates`);

  console.log('2) Projects...');
  const existing = await rest('projects?select=*');
  const groupColor = {}; existing.forEach(p => groupColor[p.group_name] = p.color);
  let ci = Object.keys(groupColor).length;
  const projMap = {};
  // groups must exist before their projects (projects.group_name → project_groups.name)
  const ensureGroup = async (name, color) => { if (!DRY) await rest('project_groups?on_conflict=name', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ name, color }) }); };
  for (const [i, op] of old.projects.entries()) {
    const group = op.group || op.name;
    let row = existing.find(p => p.name.toLowerCase() === op.name.toLowerCase() && p.group_name.toLowerCase() === group.toLowerCase());
    if (!row) {
      const color = groupColor[group] || GROUP_COLORS[(ci++) % GROUP_COLORS.length]; groupColor[group] = color;
      console.log(`   + create project "${group} · ${op.name}"`);
      if (!DRY) { await ensureGroup(group, color); [row] = await rest('projects', { method: 'POST', body: JSON.stringify({ name: op.name, group_name: group, color, sort_order: 100 + i * 10 }) }); existing.push(row); }
      else row = { id: 'dry-' + op.id };
    }
    projMap[op.id] = row.id;
  }

  console.log('3) Users...');
  let profiles = await rest('profiles?select=*');
  const userMap = {}; let ai = profiles.length;
  for (const t of old.team) {
    const c = creds(t.name);
    let pr = profiles.find(p => p.username === c.username);
    if (!pr && !NO_USERS) {
      const [bg, tx] = AVATAR[(ai++) % AVATAR.length];
      console.log(`   + create user ${c.username}  (${t.name})  password ${c.password}`);
      if (!DRY) { const u = await adminFn({ action: 'create', username: c.username, full_name: t.name, password: c.password, role: 'member', color_bg: bg, color_tx: tx, email_domain: DOMAIN }); pr = { id: u.id, username: c.username }; profiles.push(pr); }
      else pr = { id: 'dry-' + c.username };
    }
    if (!pr) { console.log(`   ! no user for "${t.name}" — skipped`); continue; }
    userMap[t.name] = pr.id;
  }

  console.log('4) Entries...');
  const rows = []; let skipped = 0;
  for (const e of entries) {
    const uid = userMap[e.person]; if (!uid) { skipped++; continue; }
    for (const [pid, h] of Object.entries(e.hours || {})) {
      const hours = Number(h); if (!(hours > 0)) continue;
      let project_id = projMap[pid];
      if (!project_id) {
        // project deleted in the old sheet: keep the hours under one archived placeholder
        if (!projMap.__deleted) {
          let row = existing.find(p => p.name === 'Progetti eliminati');
          if (!row) { console.log('   + create archived project "Altro · Progetti eliminati" for hours on deleted projects');
            if (!DRY) { await ensureGroup('Altro', '#9AA0B4'); [row] = await rest('projects', { method: 'POST', body: JSON.stringify({ name: 'Progetti eliminati', group_name: 'Altro', color: '#9AA0B4', sort_order: 9999, active: false }) }); existing.push(row); } else row = { id: 'dry-deleted' }; }
          projMap.__deleted = row.id;
        }
        project_id = projMap.__deleted;
      }
      rows.push({ user_id: uid, project_id, entry_date: e.date, hours: Math.min(24, hours) });
    }
  }
  // merge rows that map to the same (user, project, day), e.g. several deleted projects → one placeholder
  const merged = new Map();
  for (const r of rows) { const k = r.user_id + '|' + r.project_id + '|' + r.entry_date; const m = merged.get(k); if (m) m.hours = Math.min(24, m.hours + r.hours); else merged.set(k, { ...r }); }
  rows.length = 0; rows.push(...merged.values());
  const total = rows.reduce((a, r) => a + r.hours, 0);
  console.log(`   ${rows.length} rows (${total}h) to upsert, ${skipped} person-days skipped, date range ${entries.map(e => e.date).sort()[0]} → ${entries.map(e => e.date).sort().pop()}`);
  if (!DRY) {
    for (let i = 0; i < rows.length; i += 500) {
      await rest('time_entries?on_conflict=user_id,project_id,entry_date', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(rows.slice(i, i + 500)) });
      console.log(`   upserted ${Math.min(i + 500, rows.length)}/${rows.length}`);
    }
  }
  console.log(DRY ? 'Dry run complete — nothing written.' : 'Done.');
})().catch(e => { console.error(e.message || e); process.exit(1); });
