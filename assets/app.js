/* ============================================================
   One Tech · Tracker Ore — application
   Static front end (GitHub Pages) + Supabase (auth, Postgres, RLS)
   ============================================================ */
(() => {
'use strict';

const CFG = window.ONETECH_CONFIG || {};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Validated categorical palette (fixed order — see dataviz reference palette)
const GROUP_COLORS = [
  ['#2a78d6','Blu'], ['#eb6834','Arancio'], ['#1baf7a','Verde acqua'], ['#eda100','Giallo'],
  ['#e87ba4','Magenta'], ['#008300','Verde'], ['#4a3aa7','Viola'], ['#e34948','Rosso'],
  ['#0d9488','Petrolio'], ['#b45309','Ambra'], ['#7c3aed','Indaco'], ['#be185d','Fucsia'],
  ['#0369a1','Blu scuro'], ['#4d7c0f','Oliva'], ['#9333ea','Porpora'], ['#c2410c','Ruggine'],
];
const BRAND = '#6B52F5';
// Avatar pastel pairs (bg, text)
const AVATAR_COLORS = [
  ['#EEEDFE','#3C3489'],['#E1F5EE','#085041'],['#FCE4D6','#712B13'],['#FAEEDA','#633806'],
  ['#FBEAF0','#72243E'],['#E6F1FB','#0C447C'],['#EAF3DE','#27500A'],['#FAECE7','#4A1B0C'],
];
// ---------- preferences + i18n ----------
const DICT = window.OT_I18N;
const PREFS = { lang: 'en', theme: 'light' };
try { if (localStorage.getItem('ot_lang') === 'it') PREFS.lang = 'it'; if (localStorage.getItem('ot_theme') === 'dark') PREFS.theme = 'dark'; } catch {}
const L = () => DICT[PREFS.lang];
function t(key, vars) {
  let s = L()[key] ?? DICT.en[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}
const tp = (key, n, vars) => t(`${key}_${n === 1 ? 'one' : 'other'}`, { n, ...vars });
function applyI18n() {
  document.documentElement.lang = PREFS.lang;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); });
}
function applyTheme() { document.documentElement.setAttribute('data-theme', PREFS.theme); }
function savePref(k, v) { PREFS[k] = v; try { localStorage.setItem('ot_' + k, v); } catch {} }
// chart colours follow the theme (read from CSS custom properties)
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const chartColors = () => ({ tick: cssVar('--chart-tick'), grid: cssVar('--chart-grid'), axis: cssVar('--chart-axis'), line: cssVar('--chart-line'), weekend: cssVar('--chart-weekend'), hover: cssVar('--chart-hover') });

// ---------- date helpers (always LOCAL, never toISOString) ----------
const pad = (n) => String(n).padStart(2,'0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate()+n); return ymd(d); };
const fmtD = (s) => { if(!s) return ''; const d = parse(s); return `${d.getDate()} ${L().monthsS[d.getMonth()]} ${d.getFullYear()}`; };
const fmtDL = (s, lcMonth = false) => { const d = parse(s); const m = L().months[d.getMonth()]; return L().dateLong(L().wdays[d.getDay()], d.getDate(), lcMonth && L().lcMonths ? m.toLowerCase() : m, d.getFullYear()); };
const monthRange = (y, m) => { const a = new Date(y, m, 1), b = new Date(y, m+1, 0); return [ymd(a), ymd(b), b.getDate()]; };
const mondayOf = (s) => { const d = parse(s); const k = (d.getDay()+6)%7; d.setDate(d.getDate()-k); return ymd(d); };
const fh = (n) => { const v = Math.round(n*100)/100; return (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/,'')) + 'h'; };
const fnum = (n) => { const v = Math.round(n*100)/100; return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/,''); };

// ---------- ui helpers ----------
function overlay(on, msg) { $('overlay').style.display = on ? 'flex' : 'none'; if (msg) $('overlay-msg').textContent = msg; }
function toast(msg, kind='') {
  const t = document.createElement('div'); t.className = 'toast ' + kind;
  t.innerHTML = `<i class="ti ${kind==='ok'?'ti-check':kind==='err'?'ti-alert-circle':'ti-info-circle'}"></i>${esc(msg)}`;
  $('toasts').appendChild(t); setTimeout(() => t.remove(), kind==='err' ? 6000 : 3200);
}
function avatarHtml(p, sm) {
  const ini = (p.full_name || p.username || '?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
  return `<span class="av${sm?' sm':''}" style="background:${esc(p.color_bg)};color:${esc(p.color_tx)}">${esc(ini)}</span>`;
}
function modal({title, body, okText=t('ok'), cancelText=t('cancel'), danger=false, input=null}) {
  return new Promise((resolve) => {
    const root = $('modal-root');
    root.innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3>${body ? `<p>${body}</p>` : ''}
      ${input ? `<div class="field"><label>${esc(input.label||'')}</label><input class="inp ${input.mono?'pw':''}" id="modal-inp" value="${esc(input.value||'')}" placeholder="${esc(input.placeholder||'')}"></div>` : ''}
      <div class="acts">${cancelText ? `<button class="btn" id="modal-cancel">${esc(cancelText)}</button>` : ''}<button class="btn ${danger?'danger':'primary'}" id="modal-ok">${esc(okText)}</button></div>
    </div></div>`;
    const close = (v) => { root.innerHTML = ''; resolve(v); };
    $('modal-ok').onclick = () => close(input ? $('modal-inp').value : true);
    if ($('modal-cancel')) $('modal-cancel').onclick = () => close(null);
    root.querySelector('.modal-bg').addEventListener('click', e => { if (e.target === e.currentTarget && cancelText) close(null); });
    if (input) { const i = $('modal-inp'); i.focus(); i.select(); i.addEventListener('keydown', e => { if (e.key==='Enter') $('modal-ok').click(); }); }
    else $('modal-ok').focus();
  });
}
const confirm = (title, body, okText=t('confirm'), danger=false) => modal({title, body, okText, danger});
async function copyText(s) { try { await navigator.clipboard.writeText(s); toast(t('copied'), 'ok'); } catch { toast(t('copyManual') + s); } }
function downloadCsv(rows, filename) {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], {type:'text/csv;charset=utf-8'}));
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

// ---------- supabase ----------
let sb = null;
const S = {
  me: null,             // my profile
  profiles: [],         // all profiles (admin) or [me]
  projects: [],         // projects (active for members; all for admins)
  isAdmin: false,
  section: 'staff',     // 'staff' | 'admin'
  personId: null, chart2: null, personRows: [],
  dper: { mode: 'month', from: '', to: '' }, pper: { mode: 'all', from: '', to: '' }, prper: { mode: 'all', from: '', to: '' }, projectId: null, projectRows: [],
  usersPage: 1, projectsPage: 1, teamPage: 1, logPage: 1, groupsPage: 1,
  groupRows: [], groupsTable: false, editGroup: null, editProj: null,
  roles: [], roleLinks: [], rolesTable: false, rolesPage: 1, editRole: null, roleColor: null, rolePick: new Set(), rolePickFor: null,
  // dashboard
  dy: new Date().getFullYear(), dm: new Date().getMonth(), scope: '',
  chart: null,
  // clocking
  cdate: today(), cperson: null, hrs: {}, orig: {}, week: {},
  // admin
  showArchived: false,
};

function username2email(u) { return `${String(u).trim().toLowerCase()}@${CFG.AUTH_EMAIL_DOMAIN || 'onetech.local'}`; }
function errMsg(e) {
  const m = (e && (e.message || e.error_description || e.error)) || String(e);
  if (/Invalid login credentials/i.test(m)) return t('errCreds');
  if (/banned/i.test(m)) return t('errBanned');
  if (/Failed to fetch|NetworkError/i.test(m)) return t('errNetwork');
  return m;
}

// ============================================================
//  AUTH
// ============================================================
async function boot() {
  applyI18n(); applyTheme();
  overlay(true, t('loading'));
  if (!CFG.SUPABASE_URL || /YOUR-/.test(CFG.SUPABASE_URL) || /YOUR-/.test(CFG.SUPABASE_ANON_KEY || '')) {
    overlay(false); showLogin();
    const e = $('login-err'); e.hidden = false;
    e.textContent = t('errConfig');
    $('login-btn').disabled = true; return;
  }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { S.me = null; showLogin(); } });
  const { data: { session } } = await sb.auth.getSession();
  if (session) { await enterApp(); } else { overlay(false); showLogin(); }
}

function showLogin() {
  $('v-app').hidden = true; $('v-login').hidden = false;
  $('login-err').hidden = true; $('login-pass').value = '';
  setTimeout(() => $('login-user').focus(), 50);
}
$('login-eye').addEventListener('click', () => {
  const p = $('login-pass'), show = p.type === 'password';
  p.type = show ? 'text' : 'password';
  $('login-eye').innerHTML = `<i class="ti ${show ? 'ti-eye-off' : 'ti-eye'}"></i>`;
  $('login-eye').dataset.i18nTitle = show ? 'hidePw' : 'showPw';
  $('login-eye').title = t($('login-eye').dataset.i18nTitle); $('login-eye').setAttribute('aria-label', $('login-eye').title);
  p.focus();
});

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = $('login-user').value.trim(), p = $('login-pass').value;
  if (!u || !p) return;
  const btn = $('login-btn'); btn.disabled = true; $('login-err').hidden = true;
  const { error } = await sb.auth.signInWithPassword({ email: username2email(u), password: p });
  btn.disabled = false;
  if (error) { const el = $('login-err'); el.textContent = errMsg(error); el.hidden = false; return; }
  await enterApp();
});
$('login-user').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
$('btn-logout').addEventListener('click', async () => { overlay(true, t('signingOut')); await sb.auth.signOut(); overlay(false); showLogin(); });

async function enterApp() {
  overlay(true, t('loadingData'));
  try {
    const { data: { user } } = await sb.auth.getUser();
    const { data: me, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (error || !me) throw new Error(t('errNoProfile'));
    if (!me.active) { await sb.auth.signOut(); throw new Error(t('errBanned')); }
    S.me = me; S.isAdmin = me.role === 'admin';
    await Promise.all([loadProfiles(), loadProjects(), loadGroups(), loadRoles()]);
    // header
    $('me-av').outerHTML = avatarHtml(me).replace('class="av"', 'class="av" id="me-av"');
    $('me-name').textContent = me.full_name; $('me-role').textContent = S.isAdmin ? t('roleAdminLong') : t('roleStaff');
    $('u-prefix').textContent = CFG.DEFAULT_PASSWORD_PREFIX || '';
    S.cperson = me.id;
    S.cdate = today();
    buildScopeSelects();
    let sec = 'staff';
    try { sec = localStorage.getItem('ot_section') || 'admin'; } catch {}
    setSection(S.isAdmin && sec === 'admin' ? 'admin' : 'staff', false);
    $('v-login').hidden = true; $('v-app').hidden = false;
    await applyRoute();
  } catch (e) {
    overlay(false); showLogin();
    const el = $('login-err'); el.textContent = errMsg(e); el.hidden = false;
    return;
  }
  overlay(false);
}

async function loadProfiles() {
  const { data, error } = await sb.from('profiles').select('*').order('full_name');
  if (error) throw error;
  S.profiles = data || [];
}
async function loadProjects() {
  const { data, error } = await sb.from('projects').select('*').order('sort_order').order('created_at');
  if (error) throw error;
  S.projects = data || [];
}
// groups: rows of project_groups (migration 003). Until that migration is run the
// table is missing, so we fall back to the group names found on projects.
async function loadGroups() {
  const { data, error } = await sb.from('project_groups').select('*').order('name');
  S.groupsTable = !error;
  S.groupRows = error ? [] : (data || []);
}
function allGroups() {
  const map = new Map();
  S.groupRows.forEach(g => map.set(g.name, { name: g.name, color: g.color, projects: [] }));
  S.projects.forEach(p => {
    if (!map.has(p.group_name)) map.set(p.group_name, { name: p.group_name, color: p.color, projects: [] });
    map.get(p.group_name).projects.push(p);
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
const groupByName = (name) => allGroups().find(g => g.name.toLowerCase() === String(name).trim().toLowerCase());
// staff roles (migration 004): job roles / teams, a person can have several.
// Separate from profiles.role, which is the admin / member access level.
async function loadRoles() {
  const [r, l] = await Promise.all([sb.from('staff_roles').select('*').order('name'), sb.from('profile_roles').select('user_id,role_id')]);
  S.rolesTable = !r.error && !l.error;
  S.roles = S.rolesTable ? (r.data || []) : [];
  S.roleLinks = S.rolesTable ? (l.data || []) : [];
}
const roleById = (id) => S.roles.find(r => r.id === id);
const rolesOf = (uid) => S.roleLinks.filter(x => x.user_id === uid).map(x => roleById(x.role_id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
const membersOf = (rid) => S.roleLinks.filter(x => x.role_id === rid).map(x => S.profiles.find(p => p.id === x.user_id)).filter(Boolean).sort((a, b) => a.full_name.localeCompare(b.full_name));
const roleBadges = (uid, empty = '') => rolesOf(uid).map(r => `<span class="badge grp" style="--c:${esc(r.color)};margin:2px 3px 2px 0">${esc(r.name)}</span>`).join('') || empty;
const profById = (id) => S.profiles.find(p => p.id === id) || { full_name: '—', username: '?', color_bg: '#F1EFE8', color_tx: '#444' };
const projById = (id) => S.projects.find(p => p.id === id);
const activeProjects = () => S.projects.filter(p => p.active);
const activeProfiles = () => S.profiles.filter(p => p.active);
const projLabel = (p) => p.group_name && p.group_name !== p.name ? `${p.group_name} · ${p.name}` : p.name;

function buildScopeSelects() {
  const ppl = activeProfiles().map(p => `<option value="${p.id}">${esc(p.full_name)}</option>`).join('');
  const teams = S.rolesTable ? S.roles : [];
  const opts = `<option value="">${esc(t('wholeTeam'))}</option>` + (teams.length
    ? `<optgroup label="${esc(t('teamsOpt'))}">${teams.map(r => `<option value="team:${r.id}">${esc(r.name)}</option>`).join('')}</optgroup><optgroup label="${esc(t('peopleOpt'))}">${ppl}</optgroup>`
    : ppl);
  $('d-scope').innerHTML = opts; $('d-scope').value = S.scope;
  $('c-person').innerHTML = activeProfiles().map(p => `<option value="${p.id}">${esc(p.full_name)}${p.id===S.me.id?` (${esc(t('me'))})`:''}</option>`).join('');
  $('c-person').value = S.cperson;
}

// ============================================================
//  NAVIGATION  (sections: staff / admin)
// ============================================================
const NAV = {
  staff: [
    { page: 'dash', icon: 'ti-layout-dashboard', label: 'navDash' },
    { page: 'clock', icon: 'ti-clock-hour-4', label: 'navHours' },
  ],
  admin: [
    { page: 'dash', icon: 'ti-chart-bar', label: 'navStats' },
    { page: 'users', icon: 'ti-users', label: 'navUsers' },
    { page: 'roles', icon: 'ti-id-badge-2', label: 'navRoles' },
    { page: 'groups', icon: 'ti-stack-2', label: 'navGroups' },
    { page: 'projects', icon: 'ti-folders', label: 'navProjects' },
    { page: 'export', icon: 'ti-download', label: 'navExport' },
  ],
};
// [title key, subtitle key]
const ADMIN_PAGES = { users: ['navUsers', 'usersSub'], roles: ['navRoles', 'rolesSub'], groups: ['navGroups', 'groupsSub'], projects: ['navProjects', 'projectsSub'], export: ['navExport', 'exportSub'] };
const inAdmin = () => S.isAdmin && S.section === 'admin';

// ---- routes (hash based: works on GitHub Pages and survives reload)
const ROUTES = {
  dashboard:   { page: 'dash',     section: 'staff' },
  ore:         { page: 'clock' },
  statistiche: { page: 'dash',     section: 'admin' },
  dipendenti:  { page: 'users',    section: 'admin' },
  progetti:    { page: 'projects', section: 'admin' },
  gruppi:      { page: 'groups',   section: 'admin' },
  ruoli:       { page: 'roles',    section: 'admin' },
  export:     { page: 'export',   section: 'admin' },
  settings:    { page: 'settings' },
};
function routeOf(p) {
  if (p === 'dash') return inAdmin() ? 'statistiche' : 'dashboard';
  if (p === 'clock') return 'ore';
  if (p === 'settings') return 'settings';
  if (p === 'users') return 'dipendenti';
  if (p === 'projects') return 'progetti';
  if (p === 'groups') return 'gruppi';
  if (p === 'roles') return 'ruoli';
  if (p === 'export') return 'export';
  if (p === 'person') return 'dipendenti/' + S.personId;
  if (p === 'project') return 'progetti/' + S.projectId;
  return 'dashboard';
}
function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '').replace(/\/$/, '');
  if (!raw) return null;
  const [head, id] = raw.split('/');
  if (head === 'dipendenti' && id) return { page: 'person', section: 'admin', personId: id };
  if (head === 'progetti' && id) return { page: 'project', section: 'admin', projectId: id };
  const r = ROUTES[head];
  return r ? { ...r } : null;
}
function setHash(route) {
  const h = '#/' + route;
  if (location.hash === h) return;
  history.pushState(null, '', h);
}
async function applyRoute() {
  const r = parseHash();
  // unknown address, or an admin address opened by staff: show the dashboard and fix the address bar
  const fallback = async () => { await goPage('dash', false); history.replaceState(null, '', '#/' + routeOf('dash')); };
  if (!r) return fallback();
  if (r.section === 'admin' && !S.isAdmin) return fallback();
  if (r.section && r.section !== S.section) setSection(r.section, false);
  if (r.personId) S.personId = r.personId;
  if (r.projectId) S.projectId = r.projectId;
  await goPage(r.page, false);
}
window.addEventListener('popstate', () => { if (S.me) applyRoute(); });
window.addEventListener('hashchange', () => { if (S.me) applyRoute(); });

function setSection(sec, nav = true) {
  S.section = S.isAdmin && sec === 'admin' ? 'admin' : 'staff';
  try { localStorage.setItem('ot_section', S.section); } catch {}
  const adm = inAdmin();
  $('side-sec').hidden = !adm;
  $('um-switch').hidden = !S.isAdmin;
  $('um-switch-l').textContent = adm ? t('toStaff') : t('toAdmin');
  renderNav();
  $('d-scope').hidden = !adm; $('c-person').hidden = !adm; $('team-card').hidden = !adm;
  S.scope = adm ? '' : S.me.id;
  if (!adm) S.cperson = S.me.id;
  $('d-scope').value = S.scope; $('c-person').value = S.cperson;
  closeMenu();
  if (nav) goPage('dash');
}
function renderNav() {
  $('nav').innerHTML = NAV[S.section].map(n => `<button data-page="${n.page}"><i class="ti ${n.icon}"></i><span>${esc(t(n.label))}</span></button>`).join('');
  markNav();
}
function markNav() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.page === S.page || (S.page === 'person' && b.dataset.page === 'users') || (S.page === 'project' && b.dataset.page === 'projects')));
}
function closeMenu() { $('umenu').hidden = true; document.querySelector('.side-user-wrap').classList.remove('open'); }
$('side-user').onclick = (e) => { e.stopPropagation(); const m = $('umenu'); m.hidden = !m.hidden; document.querySelector('.side-user-wrap').classList.toggle('open', !m.hidden); };
document.addEventListener('click', (e) => { if (!e.target.closest('.side-user-wrap')) closeMenu(); });
$('um-switch').onclick = () => setSection(inAdmin() ? 'staff' : 'admin');
$('um-settings').onclick = () => { closeMenu(); goPage('settings'); };

// ---- settings (language + theme, stored per browser)
function renderSettings() {
  document.querySelectorAll('#set-lang .opt').forEach(b => { const on = b.dataset.lang === PREFS.lang; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  document.querySelectorAll('#set-theme .opt').forEach(b => { const on = b.dataset.themeOpt === PREFS.theme; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
}
$('set-lang').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]'); if (!b || b.dataset.lang === PREFS.lang) return;
  savePref('lang', b.dataset.lang);
  applyI18n(); refreshChrome(); renderSettings();
});
$('set-theme').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-opt]'); if (!b || b.dataset.themeOpt === PREFS.theme) return;
  savePref('theme', b.dataset.themeOpt);
  applyTheme(); renderSettings();
});
// re-render language-dependent parts of the shell that JS fills in
function refreshChrome() {
  if (!S.me) return;
  $('me-role').textContent = S.isAdmin ? t('roleAdminLong') : t('roleStaff');
  $('um-switch-l').textContent = inAdmin() ? t('toStaff') : t('toAdmin');
  renderNav();
  buildScopeSelects();
  if (S.buildDper) S.buildDper();
  if (S.buildPper) S.buildPper();
  if (S.buildPrper) S.buildPrper();
}

$('nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-page]'); if (b) goPage(b.dataset.page); });
// list filters: reset when a list page is opened fresh; kept when coming back from that list's detail page.
// A shortcut from another page (group → projects, team → employees) applies its own filter after the reset.
const LIST_FILTERS = {
  users:    { fields: { 'u-q': '', 'u-frole': '', 'u-fteam': '', 'u-fstatus': 'active' }, page: 'usersPage', detail: 'person' },
  projects: { fields: { 'pj-q': '', 'pj-fgroup': '', 'pj-fstatus': 'active' }, page: 'projectsPage', detail: 'project' },
  roles:    { fields: { 'r-q': '' } },
  groups:   { fields: { 'g-q': '' } },
};
function resetListFilters(p, prev) {
  const f = LIST_FILTERS[p];
  if (!f || prev === p || prev === f.detail) return;
  Object.entries(f.fields).forEach(([id, v]) => { const el = $(id); if (el) el.value = v; });
  if (f.page) S[f.page] = 1;
}

async function goPage(p, push = true) {
  const adminPage = p in ADMIN_PAGES;
  if (adminPage && !inAdmin()) return;
  if (p !== 'clock' && isDirty() && !(await confirm(t('unsavedTitle'), t('unsavedLeave'), t('leaveNoSave'), true))) return;
  const prevPage = S.page;
  S.page = p; markNav();
  const sec = adminPage ? 'p-admin' : 'p-' + p;
  document.querySelectorAll('.page').forEach(s => s.classList.toggle('active', s.id === sec));
  window.scrollTo({ top: 0 });
  if (p === 'dash') await renderDash();
  if (p === 'clock') {
    $('clock-title').textContent = inAdmin() ? t('clockTitleAdmin') : t('clockTitle');
    $('clock-sub').textContent = inAdmin() ? t('clockSubAdmin') : t('clockSub');
    await loadClock();
  }
  if (p === 'settings') renderSettings();
  if (push) setHash(routeOf(p));
  if (p === 'person') { if (!inAdmin() || !S.personId) return goPage('users'); await renderPerson(); }
  if (p === 'project') { if (!inAdmin() || !S.projectId) return goPage('projects'); await renderProject(); }
  if (adminPage) {
    resetListFilters(p, prevPage);
    $('admin-title').textContent = t(ADMIN_PAGES[p][0]); $('admin-sub').textContent = t(ADMIN_PAGES[p][1]);
    S.adminPage = p; $('admin-new').hidden = p === 'export'; $('admin-new-l').textContent = t({ projects: 'newProject', groups: 'newGroup', roles: 'newRole' }[p] || 'newUser');
    ['users', 'roles', 'groups', 'projects', 'export'].forEach(k => $('a-' + k).hidden = k !== p);
    await renderAdmin();
  }
}

// ============================================================
//  DASHBOARD
// ============================================================
const HOURS_PER_DAY = 8;
$('d-scope').onchange = (e) => { S.scope = e.target.value; renderDash(); };
$('d-csv').onclick = () => { const [f, z] = periodRange(S.dper); exportCsv(f, z, 'wide', S.scope || null); };

async function fetchEntries(from, to, userId) {
  const out = [], PAGE = 1000;
  for (let off = 0; ; off += PAGE) {
    let q = sb.from('time_entries').select('id,user_id,project_id,entry_date,hours').gte('entry_date', from).lte('entry_date', to).order('entry_date').order('id').range(off, off + PAGE - 1);
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) { toast(errMsg(error), 'err'); return out; }
    for (const r of data || []) out.push({ ...r, hours: Number(r.hours) });
    if (!data || data.length < PAGE) break;
  }
  return out;
}
const isWorkday = (s) => { const w = parse(s).getDay(); return w !== 0 && w !== 6; };
// working days of the month up to `until` (inclusive)
function workdays(y, m, until) {
  const out = []; const [from, to] = monthRange(y, m);
  for (let d = from; d <= to && d <= until; d = addDays(d, 1)) if (isWorkday(d)) out.push(d);
  return out;
}
function lastWorkday(before) { let d = addDays(before, -1); while (!isWorkday(d)) d = addDays(d, -1); return d; }
function pct(a, b) { return b > 0 ? Math.round(a / b * 100) : 0; }
function delta(cur, prev, label) {
  if (!prev) return `<span class="flat">—</span> ${esc(t('noDataPrev', { p: label }))}`;
  const p = Math.round((cur - prev) / prev * 100);
  const cls = p > 0 ? 'up' : p < 0 ? 'down' : 'flat';
  const ic = p > 0 ? 'ti-trending-up' : p < 0 ? 'ti-trending-down' : 'ti-minus';
  return `<span class="${cls}"><i class="ti ${ic}"></i> ${p > 0 ? '+' : ''}${p}%</span> ${esc(t('vsPrev', { p: label }))}`;
}

// ============================================================
//  PERIOD PICKER  (Today / Week / Month / [All] / Custom range)
// ============================================================
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
function wdList(a, b) { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) if (isWorkday(d)) out.push(d); return out; }
function addMonths(s, n) { const d = parse(s); const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); d.setDate(Math.min(day, last)); return ymd(d); }
// [from, to] for a period state; `first` = earliest entry (for mode 'all')
function periodRange(st, first) {
  const td = today();
  if (st.mode === 'today') return [td, td];
  if (st.mode === 'week') { const m = mondayOf(td); return [m, addDays(m, 6)]; }
  if (st.mode === 'month') { const d = new Date(); const [a, b] = monthRange(d.getFullYear(), d.getMonth()); return [a, b]; }
  if (st.mode === 'all') return [first && first < td ? first : td, td];
  return [st.from, st.to];
}
// same elapsed stretch of the previous period, for the delta
function prevPeriod(st, from, effTo) {
  if (st.mode === 'all' || effTo < from) return null;
  if (st.mode === 'today') { const d = lastWorkday(from); return [d, d]; }
  if (st.mode === 'week') return [addDays(from, -7), addDays(effTo, -7)];
  if (st.mode === 'month') {
    const f = parse(from); const pf = new Date(f.getFullYear(), f.getMonth() - 1, 1);
    const [a, b] = monthRange(pf.getFullYear(), pf.getMonth());
    let pt = addDays(a, diffDays(from, effTo)); if (pt > b) pt = b;
    return [a, pt];
  }
  const pt = addDays(from, -1); return [addDays(pt, -diffDays(from, effTo)), pt];
}
function rangeLabel(a, b) {
  const A = parse(a), B = parse(b), ms = L().monthsS;
  const m = (x) => ms[x.getMonth()];
  if (a === b) return `${A.getDate()} ${m(A)} ${A.getFullYear()}`;
  if (a.slice(0, 7) === b.slice(0, 7)) return `${A.getDate()}–${B.getDate()} ${m(A)} ${A.getFullYear()}`;
  if (a.slice(0, 4) === b.slice(0, 4)) return `${A.getDate()} ${m(A)} – ${B.getDate()} ${m(B)} ${B.getFullYear()}`;
  return `${A.getDate()} ${m(A)} ${A.getFullYear()} – ${B.getDate()} ${m(B)} ${B.getFullYear()}`;
}
function periodPicker(elId, st, getRange, onChange, withAll) {
  const el = $(elId);
  const build = () => {
    const modes = [['today', 'segToday'], ['week', 'segWeek'], ['month', 'segMonth']];
    if (withAll) modes.push(['all', 'segAll']);
    el.innerHTML = `<div class="seg" role="tablist">${modes.map(([m, k]) => `<button type="button" data-m="${m}">${esc(t(k))}</button>`).join('')}<button type="button" data-m="custom"><i class="ti ti-calendar"></i> ${esc(t('segCustom'))}</button></div>
      <div class="per-pop" hidden>
        <h4>${esc(t('perCustomTitle'))}</h4>
        <div class="row2">
          <div class="field"><label>${esc(t('perFrom'))}</label><input type="date" class="inp" data-f="from"></div>
          <div class="field"><label>${esc(t('perTo'))}</label><input type="date" class="inp" data-f="to"></div>
        </div>
        <p class="hint" data-f="msg">${esc(t('perLimit'))}</p>
        <div class="acts"><button type="button" class="btn ghost" data-f="cancel">${esc(t('cancel'))}</button><button type="button" class="btn accent" data-f="apply">${esc(t('perApply'))}</button></div>
      </div>`;
    const pop = el.querySelector('.per-pop'), fi = el.querySelector('[data-f="from"]'), ti = el.querySelector('[data-f="to"]'), msg = el.querySelector('[data-f="msg"]');
    const sync = () => el.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.m === st.mode));
    sync();
    el.querySelectorAll('.seg button').forEach(b => b.onclick = (e) => {
      e.stopPropagation();
      if (b.dataset.m === 'custom') {
        if (!pop.hidden) { pop.hidden = true; return; }
        const [a, z] = getRange(); const td = today();
        fi.value = a; ti.value = z > td ? td : z; fi.max = td; ti.max = td;
        msg.textContent = t('perLimit'); msg.classList.remove('err');
        pop.hidden = false; fi.focus(); return;
      }
      if (st.mode === b.dataset.m) return;
      st.mode = b.dataset.m; pop.hidden = true; sync(); onChange();
    });
    pop.addEventListener('click', (e) => e.stopPropagation());
    el.querySelector('[data-f="cancel"]').onclick = () => { pop.hidden = true; };
    el.querySelector('[data-f="apply"]').onclick = () => {
      const a = fi.value, z = ti.value, td = today();
      const bad = (k) => { msg.textContent = t(k); msg.classList.add('err'); };
      if (!a || !z) return bad('perErrEmpty');
      if (a > z) return bad('perErrOrder');
      if (z > td) return bad('perErrFuture');
      if (z >= addMonths(a, 12)) return bad('perErrSpan');
      st.mode = 'custom'; st.from = a; st.to = z; pop.hidden = true; sync(); onChange();
    };
    [fi, ti].forEach(i => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.querySelector('[data-f="apply"]').click(); if (e.key === 'Escape') pop.hidden = true; }));
  };
  build();
  if (!el.dataset.bound) {
    el.dataset.bound = '1';
    document.addEventListener('click', (e) => { if (!el.contains(e.target)) { const p = el.querySelector('.per-pop'); if (p) p.hidden = true; } });
  }
  return build; // call again after a language change
}
// bars per day (≤ 62 days) or per month, with the expected-hours line
function buckets(rows, from, to, nPeople) {
  const td = today();
  if (diffDays(from, to) < 62) {
    const dates = []; for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
    const idx = {}; dates.forEach((d, i) => idx[d] = i);
    const vals = dates.map(() => 0); rows.forEach(r => { if (r.entry_date in idx) vals[idx[r.entry_date]] += r.hours; });
    const oneMonth = from.slice(0, 7) === to.slice(0, 7);
    return {
      kind: 'day', keys: dates, vals,
      labels: dates.map(d => { const x = parse(d); return oneMonth ? String(x.getDate()) : `${x.getDate()} ${L().monthsS[x.getMonth()]}`; }),
      target: dates.map(d => isWorkday(d) ? HOURS_PER_DAY * nPeople : null),
      weekend: dates.map(d => !isWorkday(d)),
      title: (i) => fmtDL(dates[i]),
    };
  }
  const keys = []; const s = parse(from); s.setDate(1); const e = parse(to);
  for (const d = new Date(s); d <= e; d.setMonth(d.getMonth() + 1)) keys.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  const ki = {}; keys.forEach((k, i) => ki[k] = i);
  const vals = keys.map(() => 0); rows.forEach(r => { const k = r.entry_date.slice(0, 7); if (k in ki) vals[ki[k]] += r.hours; });
  const target = keys.map(k => { const [y, m] = k.split('-').map(Number); const [a, b] = monthRange(y, m - 1); const aa = a < from ? from : a; const bb = [b, to, td].sort()[0]; return wdList(aa, bb).length * HOURS_PER_DAY * nPeople; });
  return {
    kind: 'month', keys, vals, target, weekend: keys.map(() => false),
    labels: keys.map(k => `${L().monthsS[Number(k.slice(5)) - 1]} ${k.slice(2, 4)}`),
    title: (i) => `${L().months[Number(keys[i].slice(5)) - 1]} ${keys[i].slice(0, 4)}`,
  };
}
function drawBars(canvasId, key, b, colors) {
  const ctx = $(canvasId).getContext('2d'); const cc = chartColors();
  if (S[key]) { S[key].destroy(); S[key] = null; }
  const ds = [{ type: 'bar', label: t('dsHours'), data: b.vals, backgroundColor: colors || b.weekend.map(w => w ? cc.weekend : BRAND), borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 34, hoverBackgroundColor: cc.hover, order: 2 }];
  if (b.target) ds.push({ type: 'line', label: t('dsExpected'), data: b.target, borderColor: cc.line, borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false, spanGaps: false, order: 1 });
  const maxV = Math.max(1, ...b.vals, ...(b.target || []).filter(v => v != null));
  S[key] = new Chart(ctx, {
    data: { labels: b.labels, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 }, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { title: (it) => it.length ? b.title(it[0].dataIndex) : '', label: (it) => it.raw == null ? null : ` ${it.dataset.label}: ${fh(it.raw)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: cc.tick, font: { size: 11 }, autoSkip: true, maxTicksLimit: 16 }, border: { color: cc.axis } },
        y: { beginAtZero: true, suggestedMax: Math.ceil(maxV * 1.15), grid: { color: cc.grid }, border: { display: false }, ticks: { color: cc.tick, font: { size: 11 }, callback: (v) => v + 'h', maxTicksLimit: 5 } },
      },
    },
  });
}

S.buildDper = periodPicker('d-per', S.dper, () => periodRange(S.dper), () => renderDash(), false);

async function renderDash() {
  const now = new Date(), td = today();
  const [from, to] = periodRange(S.dper);
  const effTo = to < td ? to : td;
  const prev = prevPeriod(S.dper, from, effTo);
  let teamId = inAdmin() && String(S.scope).startsWith('team:') ? S.scope.slice(5) : null;
  const team = teamId ? roleById(teamId) : null;
  if (teamId && !team) { teamId = null; S.scope = ''; $('d-scope').value = ''; }   // team was deleted
  const userId = inAdmin() ? (teamId ? null : (S.scope || null)) : S.me.id;
  const teamScope = inAdmin() && (!S.scope || !!team);
  const memberIds = team ? new Set(membersOf(team.id).map(p => p.id)) : null;
  const inScope = (r) => !memberIds || memberIds.has(r.user_id);
  const [rowsAll, prevAll] = await Promise.all([fetchEntries(from, to, userId), prev ? fetchEntries(prev[0], prev[1], userId) : Promise.resolve([])]);
  const rows = rowsAll.filter(inScope), prevRows = prevAll.filter(inScope);
  const people = teamScope ? (team ? membersOf(team.id).filter(p => p.active) : activeProfiles()) : [profById(userId)];
  const nPeople = people.length;
  const who = teamScope ? (team ? team.name : t('whoTeam')) : (userId === S.me.id ? t('whoMine') : t('whoOf', { name: profById(userId).full_name.split(' ')[0] }));

  // ---- header
  const h = now.getHours();
  const greet = t(h < 5 ? 'greetNight' : h < 13 ? 'greetMorning' : h < 18 ? 'greetAfternoon' : 'greetEvening');
  $('dash-title').textContent = inAdmin() ? t('navStats') : `${greet}, ${S.me.full_name.split(' ')[0]}`;
  $('dash-sub').textContent = rangeLabel(from, to) + (teamScope ? (team ? t('teamViewOf', { name: team.name }) : t('teamView')) : userId !== S.me.id ? t('viewOf', { name: profById(userId).full_name }) : '');

  // ---- aggregates
  const total = rows.reduce((a, r) => a + r.hours, 0);
  const prevTotal = prevRows.reduce((a, r) => a + r.hours, 0);
  const dayset = new Set(rows.map(r => r.entry_date));
  const personDays = new Set(rows.map(r => r.user_id + r.entry_date));
  const activeNow = new Set(rows.map(r => r.user_id)).size;
  const wd = effTo < from ? [] : wdList(from, effTo);          // working days elapsed in the period
  const expected = wd.length * HOURS_PER_DAY * nPeople;
  // per person stats
  const byU = {};
  rows.forEach(r => { const u = byU[r.user_id] ||= { h: 0, days: new Set(), byP: {}, last: '' }; u.h += r.hours; u.days.add(r.entry_date); u.byP[r.project_id] = (u.byP[r.project_id] || 0) + r.hours; if (r.entry_date > u.last) u.last = r.entry_date; });
  const missingFor = (uid) => wd.filter(d => !(byU[uid] && byU[uid].days.has(d)));

  // ---- alert (disabled on request)
  const al = $('dash-alert'); al.hidden = true; al.innerHTML = '';

  // ---- KPIs
  const kp = [];
  kp.push({ i: 'ti-clock', k: teamScope ? t('kpiTeamHours') : t('kpiPeriodHours'), v: fnum(total), u: 'h', d: prev ? delta(total, prevTotal, rangeLabel(prev[0], prev[1])) : '' });
  const comp = pct(total, expected);
  kp.push({ i: 'ti-target', k: t('kpiCoverage'), v: comp, u: '%', d: esc(t('kpiCoverageD', { h: fnum(total), e: fnum(expected), hpd: HOURS_PER_DAY, d: wd.length, x: teamScope ? ' × ' + nPeople : '' })), bar: Math.min(100, comp) });
  if (teamScope) {
    const totMissing = people.reduce((a, p) => a + missingFor(p.id).length, 0);
    kp.push({ i: 'ti-users', k: t('kpiActive'), v: activeNow, d: `${esc(t('kpiActiveD', { n: nPeople }))} · <span class="${totMissing ? 'miss' : 'okt'}">${esc(totMissing ? tp('missingDays', totMissing) : t('noMissing'))}</span>` });
    kp.push({ i: 'ti-chart-bar', k: t('kpiAvgPerson'), v: activeNow ? fnum(total / activeNow) : 0, u: 'h', d: esc(t('kpiAvgPersonD', { h: personDays.size ? fnum(total / personDays.size) : 0 })) });
  } else {
    const miss = missingFor(userId).length;
    kp.push({ i: 'ti-calendar-check', k: t('kpiDays'), v: dayset.size, d: `${esc(t('kpiDaysD', { n: wd.length }))} · <span class="${miss ? 'miss' : 'okt'}">${esc(miss ? t('missingN', { n: miss }) : t('allLogged'))}</span>` });
    kp.push({ i: 'ti-chart-bar', k: t('kpiAvgDay'), v: dayset.size ? fnum(total / dayset.size) : 0, u: 'h', d: esc(t('kpiAvgDayD')) });
  }
  $('kpis').innerHTML = kp.map(x => `<div class="kpi"><div class="k"><i class="ti ${x.i}"></i>${esc(x.k)}</div><div class="v">${esc(x.v)}${x.u ? `<small>${x.u}</small>` : ''}</div><div class="d">${x.d}</div>${x.bar !== undefined ? `<span class="bar"><b style="width:${x.bar}%"></b></span>` : ''}</div>`).join('');

  // ---- chart: one day → by person (team) or by project; otherwise by day / by month
  const cc = chartColors();
  const leg = (color, label, line) => `<span><i ${line ? 'class="line"' : `style="background:${color}"`}></i>${esc(label)}</span>`;
  let b, colors = null;
  if (from === to) {
    if (teamScope) {
      const list = people.map(p => ({ short: p.full_name.split(' ')[0], full: p.full_name, h: (byU[p.id] || { h: 0 }).h }));
      b = { labels: list.map(x => x.short), vals: list.map(x => x.h), target: isWorkday(from) ? list.map(() => HOURS_PER_DAY) : null, weekend: list.map(() => false), title: (i) => list[i].full };
      $('c1-title').textContent = t('chartToday');
      $('c1-legend').innerHTML = leg(BRAND, t('legLogged')) + (b.target ? leg(null, t('legTarget', { h: HOURS_PER_DAY }), true) : '');
    } else {
      const byPj = {}; rows.forEach(r => { byPj[r.project_id] = (byPj[r.project_id] || 0) + r.hours; });
      const list = Object.entries(byPj).map(([id, h]) => ({ p: projById(id) || { name: t('deletedItem'), group_name: '', color: '#999' }, h })).sort((x, y) => y.h - x.h);
      b = { labels: list.map(x => x.p.name), vals: list.map(x => x.h), target: null, weekend: list.map(() => false), title: (i) => projLabel(list[i].p) };
      colors = list.map(x => x.p.color);
      $('c1-title').textContent = t('chartTodayMine');
      $('c1-legend').innerHTML = '';
    }
  } else {
    b = buckets(rows, from, to, nPeople);
    $('c1-title').textContent = (b.kind === 'day' ? t('chartDays') : t('perMonth')) + (teamScope ? t('teamSuffix') : '');
    $('c1-legend').innerHTML = leg(BRAND, t('legLogged'))
      + (b.kind === 'day' ? leg(cc.weekend, t('legWeekend')) + leg(null, t('legTarget', { h: HOURS_PER_DAY * nPeople }), true) : leg(null, t('legExpected'), true));
  }
  drawBars('chart-days', 'chart', b, colors);

  // ---- project + group bars
  const byP = {}, byG = {};
  rows.forEach(r => { byP[r.project_id] = (byP[r.project_id] || 0) + r.hours; const pr = projById(r.project_id); const g = pr ? pr.group_name : t('deletedItem'); byG[g] = (byG[g] || 0) + r.hours; });
  const prow = Object.entries(byP).map(([id, h]) => ({ p: projById(id) || { name: t('deletedItem'), group_name: '', color: '#999' }, h })).sort((a, b) => b.h - a.h);
  const grow = Object.entries(byG).map(([g, h]) => ({ g, h, color: (S.projects.find(p => p.group_name === g) || { color: '#999' }).color })).sort((a, b) => b.h - a.h);
  const barsHtml = (items, max) => `<div class="bars">${items.map(x => `
    <div class="bar" title="${esc(x.label)}: ${fh(x.h)}">
      <div class="n"><i style="background:${esc(x.color)}"></i><span>${x.html}</span></div>
      <div class="t"><b style="width:${Math.max(2, x.h / max * 100)}%;background:${esc(x.color)}"></b></div>
      <div class="v">${fh(x.h)}<small>${pct(x.h, total)}%</small></div>
    </div>`).join('')}</div>`;
  const emptyB = `<div class="empty"><i class="ti ti-chart-bar-off"></i>${esc(t('noHoursPeriod2'))}</div>`;
  $('proj-hint').textContent = prow.length ? tp('nProjects', prow.length) : '';
  $('group-hint').textContent = grow.length ? tp('nGroups', grow.length) : '';
  $('proj-bars').innerHTML = prow.length ? barsHtml(prow.map(({ p, h }) => ({ label: projLabel(p), h, color: p.color, html: (p.group_name && p.group_name !== p.name ? `<span class="sub">${esc(p.group_name)} · </span>` : '') + esc(p.name) })), prow[0].h) : emptyB;
  $('group-bars').innerHTML = grow.length ? barsHtml(grow.map(x => ({ label: x.g, h: x.h, color: x.color, html: esc(x.g) })), grow[0].h) : emptyB;

  // ---- team table (admin, team scope)
  // ---- hours by team (admin, whole-team view)
  const showTeams = inAdmin() && !S.scope && S.rolesTable && S.roles.length > 0;
  $('teams-card').hidden = !showTeams;
  if (showTeams) renderTeamsCard(rows, wd.length, total);

  $('team-card').hidden = !teamScope;
  if (teamScope) {
    S.teamRows = people.map(p => ({ p, s: byU[p.id] || { h: 0, days: new Set(), byP: {}, last: '' }, miss: missingFor(p.id) })).sort((a, b) => b.s.h - a.s.h);
    S.teamWd = wd.length;
    $('team-hint').textContent = t('teamHint2', { p: rangeLabel(from, to), n: wd.length });
    renderTeamTable();
  }

  // ---- log
  const byUD = {};
  rows.forEach(r => { const k = r.user_id + '|' + r.entry_date; (byUD[k] ||= { user_id: r.user_id, date: r.entry_date, items: [], tot: 0 }); byUD[k].items.push(r); byUD[k].tot += r.hours; });
  S.logRows = Object.values(byUD).sort((a, b) => b.date.localeCompare(a.date) || profById(a.user_id).full_name.localeCompare(profById(b.user_id).full_name));
  S.logTeam = teamScope;
  $('log-hint').textContent = S.logRows.length ? `${tp('nDaysLogged', S.logRows.length)} · ${who}` : '';
  // filter options list only the people/projects that appear in the period
  const setOpts = (el, allLabel, opts) => { const cur = el.value; el.innerHTML = `<option value="">${esc(allLabel)}</option>` + opts.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join(''); el.value = opts.some(([v]) => v === cur) ? cur : ''; };
  $('lg-fperson').hidden = !teamScope;
  setOpts($('lg-fperson'), t('allPeople'), [...new Set(rows.map(r => r.user_id))].map(id => [id, profById(id).full_name]).sort((x, y) => x[1].localeCompare(y[1])));
  setOpts($('lg-fproj'), t('allProjects'), [...new Set(rows.map(r => r.project_id))].map(id => [id, projLabel(projById(id) || { name: t('deletedItem'), group_name: '' })]).sort((x, y) => x[1].localeCompare(y[1])));
  renderLogTable();
}

function renderTeamsCard(rows, nWd, total) {
  const hByUser = {}; rows.forEach(r => { hByUser[r.user_id] = (hByUser[r.user_id] || 0) + r.hours; });
  const list = S.roles.map(ro => {
    const members = membersOf(ro.id), act = members.filter(p => p.active);
    const h = members.reduce((a, p) => a + (hByUser[p.id] || 0), 0);
    return { ro, act, h, cov: act.length ? pct(h, act.length * nWd * HOURS_PER_DAY) : null };
  }).sort((a, b) => b.h - a.h || a.ro.name.localeCompare(b.ro.name));
  const noTeamH = Object.entries(hByUser).filter(([uid]) => !rolesOf(uid).length).reduce((a, [, h]) => a + h, 0);
  const max = Math.max(1, ...list.map(x => x.h), noTeamH);
  const covColor = (c) => c >= 90 ? '#0F6E56' : c >= 60 ? BRAND : '#C77A0B';
  const row = (x) => `<tr>
    <td>${x.id ? `<button class="linkname" data-team="${x.id}"><span class="badge grp" style="--c:${esc(x.color)}">${esc(x.name)}</span></button>` : `<span class="badge grp" style="--c:${esc(x.color)}">${esc(x.name)}</span>`}</td>
    <td>${x.act && x.act.length ? `<span class="avs" title="${esc(x.act.map(p => p.full_name).join(', '))}">${x.act.map(p => avatarHtml(p, true)).join('')}</span>` : '<span class="mute">—</span>'}</td>
    <td><span class="tbar"><b style="width:${x.h ? Math.max(2, x.h / max * 100) : 0}%;background:${esc(x.color)}"></b></span></td>
    <td class="num b">${x.h ? fh(x.h) : '<span class="mute">—</span>'}</td>
    <td class="num mute">${total && x.h ? pct(x.h, total) + '%' : '—'}</td>
    <td class="num">${x.act && x.act.length ? fh(x.h / x.act.length) : '<span class="mute">—</span>'}</td>
    <td>${x.cov === null ? '<span class="mute">—</span>' : `<span class="mbar"><b style="width:${Math.min(100, x.cov)}%;background:${covColor(x.cov)}"></b></span><span style="font-variant-numeric:tabular-nums">${x.cov}%</span>`}</td>
  </tr>`;
  $('teams-table').innerHTML = `<div class="twrap"><table><thead><tr><th>${esc(t('thTeam'))}</th><th>${esc(t('thMembers'))}</th><th class="tbar-h"></th><th class="num">${esc(t('thHours'))}</th><th class="num">${esc(t('thShare'))}</th><th class="num">${esc(t('thAvgPerson'))}</th><th>${esc(t('thCoverage'))}</th></tr></thead><tbody>`
    + list.map(x => row({ id: x.ro.id, name: x.ro.name, color: x.ro.color, act: x.act, h: x.h, cov: x.cov })).join('')
    + (noTeamH ? row({ id: null, name: t('noTeamRow'), color: '#9AA0B4', act: null, h: noTeamH, cov: null }) : '')
    + '</tbody></table></div>';
  $('teams-table').querySelectorAll('[data-team]').forEach(b => b.onclick = () => { S.scope = 'team:' + b.dataset.team; $('d-scope').value = S.scope; renderDash(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}

function renderTeamTable() {
  const q = ($('tm-q').value || '').trim().toLowerCase(), fc = $('tm-fcov').value;
  const list = (S.teamRows || []).filter(({ p, s, miss }) => (!q || p.full_name.toLowerCase().includes(q) || (p.username || '').toLowerCase().includes(q))
    && (!fc || (fc === 'miss' ? miss.length > 0 : fc === 'ok' ? miss.length === 0 : s.h === 0)));
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (S.teamPage > pages) S.teamPage = pages;
  const slice = list.slice((S.teamPage - 1) * PER_PAGE, S.teamPage * PER_PAGE);
  $('team-table').innerHTML = slice.length ? `<div class="twrap"><table><thead><tr><th>${t('thPerson')}</th>${S.rolesTable ? `<th>${t('thTeam')}</th>` : ''}<th class="num">${t('thHours')}</th><th class="num">${t('thDays')}</th><th class="num">${t('thAvgDay')}</th><th>${t('thCoverage')}</th><th>${t('thLastEntry')}</th><th>${t('thTopProject')}</th><th></th></tr></thead><tbody>${slice.map(({ p, s, miss }) => {
    const top = Object.entries(s.byP).sort((a, b) => b[1] - a[1])[0];
    const topPj = top ? projById(top[0]) : null;
    const cov = pct(s.h, S.teamWd * HOURS_PER_DAY);
    return `<tr><td><button class="linkname" data-scope="${p.id}">${avatarHtml(p, true)}${esc(p.full_name)}</button></td>${S.rolesTable ? `<td>${roleBadges(p.id, '<span class="mute">—</span>')}</td>` : ''}
      <td class="num b">${s.h ? fh(s.h) : '<span class="mute">—</span>'}</td><td class="num">${s.days.size || '—'}</td><td class="num mute">${s.days.size ? fh(s.h / s.days.size) : '—'}</td>
      <td><span style="display:inline-flex;align-items:center;gap:8px"><span style="width:70px;height:6px;background:var(--bs);border:1px solid var(--bd);border-radius:3px;overflow:hidden;display:inline-block"><b style="display:block;height:100%;width:${Math.min(100, cov)}%;background:${cov >= 90 ? '#0F6E56' : cov >= 60 ? BRAND : '#C77A0B'}"></b></span><span style="font-variant-numeric:tabular-nums">${cov}%</span>${miss.length ? `<span class="badge warn">${esc(tp('daysMissing', miss.length))}</span>` : `<span class="badge on">${t('okBadge')}</span>`}</span></td>
      <td class="mute" style="white-space:nowrap">${s.last ? esc(fmtD(s.last)) : '—'}</td>
      <td>${topPj ? `<span class="badge grp" style="--c:${esc(topPj.color)}">${esc(projLabel(topPj))}</span>` : '<span class="mute">—</span>'}</td>
      <td class="actions"><button class="btn sm" data-scope="${p.id}">${esc(t('details'))}</button></td></tr>`;
  }).join('')}</tbody></table></div>` : `<div class="empty"><i class="ti ti-user-search"></i>${esc(t('noUsersMatch'))}</div>`;
  $('team-table').querySelectorAll('[data-scope]').forEach(b => b.onclick = () => openPerson(b.dataset.scope));
  pager('team-pager', list.length, S.teamPage, (n) => { S.teamPage = n; renderTeamTable(); $('team-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

function renderLogTable() {
  const teamScope = S.logTeam, all = S.logRows || [];
  const q = ($('lg-q').value || '').trim().toLowerCase(), fu = teamScope ? $('lg-fperson').value : '', fp = $('lg-fproj').value;
  const list = all.filter(l => (!fu || l.user_id === fu) && (!fp || l.items.some(r => r.project_id === fp))
    && (!q || (teamScope && profById(l.user_id).full_name.toLowerCase().includes(q)) || l.items.some(r => { const pr = projById(r.project_id); return pr && projLabel(pr).toLowerCase().includes(q); })));
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (S.logPage > pages) S.logPage = pages;
  const slice = list.slice((S.logPage - 1) * PER_PAGE, S.logPage * PER_PAGE);
  $('log-table').innerHTML = slice.length ? `<div class="twrap"><table><thead><tr><th>${t('thDate')}</th>${teamScope ? `<th>${t('thWho')}</th>` : ''}<th>${t('thProjects')}</th><th class="num">${t('thTot')}</th><th></th></tr></thead><tbody>${slice.map(l => {
    const p = profById(l.user_id);
    const badges = [...l.items].sort((a, b) => b.hours - a.hours).map(r => { const pr = projById(r.project_id) || { name: '?', color: '#999' }; return `<span class="badge grp" style="--c:${esc(pr.color)};margin:2px 3px 2px 0">${esc(pr.name)} ${fh(r.hours)}</span>`; }).join('');
    return `<tr><td style="white-space:nowrap;color:var(--tm);font-size:12px">${esc(fmtD(l.date))}</td>${teamScope ? `<td><span style="display:inline-flex;align-items:center;gap:6px">${avatarHtml(p, true)}${esc(p.full_name)}</span></td>` : ''}<td>${badges}</td><td class="num b">${fh(l.tot)}</td>
      <td class="actions"><button class="iconbtn" title="${esc(t('edit'))}" data-edit="${l.user_id}|${l.date}"><i class="ti ti-pencil"></i></button></td></tr>`;
  }).join('')}</tbody></table></div>` : `<div class="empty"><i class="ti ti-clock-off"></i>${esc(all.length ? t('noLogMatch') : t('noHoursPeriod2'))}</div>`;
  $('log-table').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const [u, d] = b.dataset.edit.split('|'); S.cperson = u; S.cdate = d; goPage('clock'); });
  $('lg-filters').hidden = !all.length;
  pager('log-pager', list.length, S.logPage, (n) => { S.logPage = n; renderLogTable(); $('log-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

// ============================================================
//  CLOCKING  (shop-style: pick projects → set hours)
// ============================================================
$('c-date').onchange = (e) => { if (e.target.value) switchDay(e.target.value); };
$('d-prev').onclick = () => switchDay(addDays(S.cdate, -1));
$('d-next').onclick = () => switchDay(addDays(S.cdate, 1));
$('d-today').onclick = () => switchDay(today());
$('c-person').onchange = async (e) => { if (isDirty() && !(await confirm(t('unsavedTitle'), t('unsavedPerson'), t('continue'), true))) { e.target.value = S.cperson; return; } S.cperson = e.target.value; loadClock(); };
$('btn-save').onclick = saveClock;
$('btn-reset').onclick = () => { S.hrs = { ...S.orig }; S.cart = new Set(Object.keys(S.orig)); renderPicker(); renderCart(); };
S.cart = new Set();

const QUICK = [1, 2, 4, 8];
const mono = (name) => { const w = name.trim().split(/\s+/).filter(Boolean); return (w.length > 1 ? w[0][0] + w[1][0] : name.slice(0, 2)).toUpperCase(); };

async function switchDay(d) {
  if (isDirty() && !(await confirm(t('unsavedTitle'), t('unsavedDay'), t('continue'), true))) { $('c-date').value = S.cdate; return; }
  S.cdate = d; loadClock();
}
function isDirty() {
  const ids = new Set([...Object.keys(S.hrs), ...Object.keys(S.orig)]);
  for (const id of ids) if ((S.hrs[id] || 0) !== (S.orig[id] || 0)) return true;
  return false;
}

async function loadClock() {
  $('c-date').value = S.cdate; $('c-daylabel').textContent = fmtDL(S.cdate);
  if (inAdmin()) $('c-person').value = S.cperson;
  const wk = mondayOf(S.cdate);
  const rows = await fetchEntries(wk, addDays(wk, 6), S.cperson);
  S.week = {}; S.orig = {};
  rows.forEach(r => { S.week[r.entry_date] = (S.week[r.entry_date] || 0) + r.hours; if (r.entry_date === S.cdate) S.orig[r.project_id] = r.hours; });
  S.hrs = { ...S.orig }; S.cart = new Set(Object.keys(S.orig));
  // week strip
  $('week').innerHTML = Array.from({ length: 7 }, (_, i) => { const d = addDays(wk, i); const dd = parse(d); const h = S.week[d] || 0; const we = dd.getDay() === 0 || dd.getDay() === 6;
    return `<div class="wd${d === S.cdate ? ' sel' : ''}${d === today() ? ' today' : ''}${we ? ' wknd' : ''}" data-d="${d}"><div class="dn">${L().wdaysS[dd.getDay()]}</div><div class="dd">${dd.getDate()}</div><div class="dh${h ? ' on' : ''}">${h ? fh(h) : '·'}</div></div>`; }).join('');
  $('week').querySelectorAll('.wd').forEach(el => el.onclick = () => switchDay(el.dataset.d));
  renderPicker(); renderCart();
}

// ---- step 1: picker grid
const patOf = (name) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 6; };
function renderPicker() {
  const list = S.projects.filter(p => p.active || S.cart.has(p.id));
  $('pick-hint').textContent = S.cart.size ? tp('nSelected', S.cart.size) : t('pickHint');
  $('pgrid').innerHTML = list.length ? list.map(p => { const on = S.cart.has(p.id); const h = S.hrs[p.id] || 0;
    return `<button class="pcard${on ? ' sel' : ''}" style="--c:${esc(p.color)}" data-id="${p.id}" title="${esc(t(on ? 'removeX' : 'addX', { name: p.name }))}">
      <span class="pc-img pat${patOf(p.name)}${p.logo_url ? ' haslogo' : ''}">${logoHtml(p)}<span class="mono">${esc(mono(p.name))}</span><span class="pc-add"><i class="ti ${on ? 'ti-check' : 'ti-plus'}"></i></span></span>
      <span class="pc-t"><span class="pc-n">${esc(p.name)}</span><span class="pc-g">${esc(p.group_name !== p.name ? p.group_name : (p.active ? '' : t('archived')))}</span><span class="pc-h" id="pch-${p.id}">${esc(h ? t('hoursLogged', { h: fh(h) }) : t('added'))}</span></span>
    </button>`; }).join('') : `<div class="empty" style="grid-column:1/-1"><i class="ti ti-folder-off"></i>${esc(t('noActiveProjects'))}</div>`;
  $('pgrid').querySelectorAll('.pcard').forEach(b => b.onclick = () => togglePick(b.dataset.id));
}
function togglePick(id) {
  if (S.cart.has(id)) { S.cart.delete(id); S.hrs[id] = 0; renderPicker(); renderCart(); return; }
  S.cart.add(id);
  if (!(S.hrs[id] > 0)) S.hrs[id] = 1;
  renderPicker(); renderCart();
  const row = $('row-' + id); if (row) { row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); const i = $('hv-' + id); if (i) { i.focus(); i.select(); } }
}

// ---- step 2: cart rows
function renderCart() {
  const ids = [...S.cart].filter(id => projById(id));
  ids.sort((a, b) => (projById(a).sort_order - projById(b).sort_order));
  $('cart-hint').textContent = ids.length ? tp('nProjects', ids.length) : '';
  $('cart').innerHTML = ids.length ? ids.map(id => { const p = projById(id); const h = S.hrs[id] || 0;
    return `<div class="crow" id="row-${id}" style="--c:${esc(p.color)}">
      <span class="mono${p.logo_url ? ' haslogo' : ''}">${p.logo_url ? logoHtml(p) : esc(mono(p.name))}</span>
      <div><div class="cn">${esc(p.name)}</div><div class="cg">${esc(p.group_name !== p.name ? p.group_name : '')}</div></div>
      <div class="quick">${QUICK.map(q => `<button data-q="${id}|${q}" class="${h === q ? 'on' : ''}">${q}h</button>`).join('')}</div>
      <div class="hc"><button class="hbtn" data-ch="${id}|-0.5" title="-30 min">−</button><input class="hval" id="hv-${id}" type="number" inputmode="decimal" min="0" max="24" step="0.25" value="${fnum(h)}" data-id="${id}"><button class="hbtn" data-ch="${id}|0.5" title="+30 min">+</button></div>
      <button class="rm" data-rm="${id}" title="${esc(t('remove'))}"><i class="ti ti-x"></i></button>
    </div>`; }).join('') : `<div class="cart-empty">${esc(t('cartEmpty'))}</div>`;
  $('cart').querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { const [id, d] = b.dataset.ch.split('|'); setH(id, (S.hrs[id] || 0) + Number(d)); });
  $('cart').querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const [id, q] = b.dataset.q.split('|'); setH(id, Number(q)); });
  $('cart').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => togglePick(b.dataset.rm));
  $('cart').querySelectorAll('.hval').forEach(i => { i.onchange = () => setH(i.dataset.id, parseFloat(i.value.replace(',', '.'))); i.onfocus = () => i.select(); });
  updTot();
}
function setH(id, v) {
  v = isNaN(v) ? 0 : Math.round(v * 4) / 4; v = Math.max(0, Math.min(24, v));
  S.hrs[id] = v;
  const i = $('hv-' + id); if (i) i.value = fnum(v);
  const row = $('row-' + id); if (row) row.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('on', Number(b.dataset.q.split('|')[1]) === v));
  const c = $('pch-' + id); if (c) c.textContent = v ? t('hoursLogged', { h: fh(v) }) : t('added');
  updTot();
}
function updTot() {
  const tot = Object.values(S.hrs).reduce((a, b) => a + b, 0);
  const el = $('totval'); el.textContent = fh(tot); el.classList.toggle('warn', tot > 24);
  const zero = [...S.cart].filter(id => !(S.hrs[id] > 0)).length;
  const st = $('save-status'); const dirty = isDirty();
  st.textContent = tot > 24 ? t('max24') : dirty ? t('unsaved') : (Object.keys(S.orig).length ? t('saved') : '');
  if (!dirty && zero && tot <= 24) st.textContent = tp('nNoHours', zero);
  st.className = 'status' + (dirty || tot > 24 ? ' dirty' : '');
  $('btn-save').disabled = !dirty || tot > 24; $('btn-reset').disabled = !dirty;
}
async function saveClock() {
  if (!isDirty()) return;
  const btn = $('btn-save'); btn.disabled = true;
  const ups = [], dels = [];
  new Set([...Object.keys(S.hrs), ...Object.keys(S.orig)]).forEach(id => {
    const n = S.hrs[id] || 0, o = S.orig[id] || 0;
    if (n === o) return;
    if (n > 0) ups.push({ user_id: S.cperson, project_id: id, entry_date: S.cdate, hours: n }); else dels.push(id);
  });
  try {
    if (ups.length) { const { error } = await sb.from('time_entries').upsert(ups, { onConflict: 'user_id,project_id,entry_date' }); if (error) throw error; }
    if (dels.length) { const { error } = await sb.from('time_entries').delete().eq('user_id', S.cperson).eq('entry_date', S.cdate).in('project_id', dels); if (error) throw error; }
    const tot = Object.values(S.hrs).reduce((a, b) => a + b, 0);
    toast(t('savedToast', { h: fh(tot), d: fmtD(S.cdate) }), 'ok');
    await loadClock();
  } catch (e) { toast(errMsg(e), 'err'); btn.disabled = false; }
}

// ============================================================
//  PERSON PAGE (admin)
// ============================================================
function openPerson(id) { S.personId = id; goPage('person'); }
$('ps-back').onclick = () => goPage('users');
$('ps-csv').onclick = () => { const [f, to] = personRange(); exportCsv(f, to, 'long', S.personId); };
$('ps-pw').onclick = () => userAction('pw', S.personId);
$('ps-role').onclick = () => userAction('role', S.personId);
$('ps-active').onclick = () => userAction('active', S.personId);
$('ps-del').onclick = () => userAction('del', S.personId);

function personRange() { return periodRange(S.pper, S.personRows.length ? S.personRows[0].entry_date : null); }
S.buildPper = periodPicker('ps-per', S.pper, personRange, () => renderPersonBody(), true);
async function renderPerson() {
  const p = profById(S.personId); if (!p || !p.id) return goPage('users');
  $('ps-av').innerHTML = avatarHtml(p); $('ps-name').textContent = p.full_name;
  $('ps-meta').innerHTML = `<span class="pw">${esc(p.username)}</span> · <span class="badge ${p.role}">${p.role === 'admin' ? t('roleAdmin') : t('roleStaff')}</span> <span class="badge ${p.active ? 'on' : 'off'}">${p.active ? t('active') : t('deactivated')}</span>`
    + (S.rolesTable ? `<span class="ps-roles">${roleBadges(p.id, `<span class="mute">${esc(t('noRoles'))}</span>`)}</span>` : '');
  const me = p.id === S.me.id;
  $('ps-role').disabled = me; $('ps-active').disabled = me; $('ps-del').disabled = me;
  $('ps-role').querySelector('span').textContent = p.role === 'admin' ? t('makeStaff') : t('makeAdmin');
  $('ps-active').querySelector('span').textContent = p.active ? t('deactivate') : t('reactivate');
  $('ps-active').querySelector('i').className = 'ti ' + (p.active ? 'ti-user-off' : 'ti-user-check');
  overlay(true, t('loading'));
  const pteam = S.rolesTable ? rolesOf(p.id)[0] : null;
  const mates = pteam ? new Set(membersOf(pteam.id).filter(m => m.active && m.id !== p.id).map(m => m.id)) : new Set();
  S.personTeam = mates.size ? { name: pteam.name, ids: mates } : null;
  const [mine, all] = await Promise.all([fetchEntries('2000-01-01', '2100-01-01', p.id), mates.size ? fetchEntries('2000-01-01', '2100-01-01', null) : Promise.resolve([])]);
  S.personRows = mine;
  S.personTeamRows = all.filter(r => mates.has(r.user_id));
  overlay(false);
  renderPersonBody();
}
function renderPersonBody() {
  const p = profById(S.personId);
  const [from, to] = personRange();
  const rows = S.personRows.filter(r => r.entry_date >= from && r.entry_date <= to);
  const total = rows.reduce((a, r) => a + r.hours, 0);
  const days = new Set(rows.map(r => r.entry_date));
  const td = today(), effTo = to < td ? to : td;
  const wdCount = effTo < from ? 0 : wdList(from, effTo).length;   // working days elapsed in the period
  const cov = pct(total, wdCount * HOURS_PER_DAY);
  let teamCovNote = '';
  if (S.personTeam && wdCount) {
    const th = (S.personTeamRows || []).filter(r => r.entry_date >= from && r.entry_date <= to).reduce((a, r) => a + r.hours, 0);
    teamCovNote = ' · ' + t('teamAvgCov', { name: S.personTeam.name, c: pct(th, S.personTeam.ids.size * wdCount * HOURS_PER_DAY) });
  }
  const first = rows.length ? rows[0].entry_date : null, last = rows.length ? rows[rows.length - 1].entry_date : null;
  const { months: MONTHS, monthsS: MONTHS_S } = L();
  const kp = [
    { i: 'ti-clock', k: t('kpiTotal'), v: fnum(total), u: 'h', d: rangeLabel(from, to) },
    { i: 'ti-calendar-check', k: t('kpiDays'), v: days.size, d: t('kpiDaysD', { n: wdCount }) },
    { i: 'ti-chart-bar', k: t('kpiAvgDay'), v: days.size ? fnum(total / days.size) : 0, u: 'h', d: t('kpiAvgDayD') },
    { i: 'ti-target', k: t('kpiCoverage'), v: cov, u: '%', d: t('kpiExpected', { h: fnum(total), e: fnum(wdCount * HOURS_PER_DAY) }) + teamCovNote, bar: Math.min(100, cov) },
    { i: 'ti-calendar-plus', k: t('kpiFirst'), v: first ? fmtD(first).replace(/ \d{4}$/, '') : '—', d: first ? parse(first).getFullYear() : '' },
    { i: 'ti-calendar-event', k: t('kpiLast'), v: last ? fmtD(last).replace(/ \d{4}$/, '') : '—', d: last ? (() => { const n = Math.round((parse(today()) - parse(last)) / 86400000); return n === 0 ? t('agoToday') : n === 1 ? t('agoYesterday') : t('agoDays', { n }); })() : '' },
  ];
  $('ps-kpis').innerHTML = kp.map(x => `<div class="kpi"><div class="k"><i class="ti ${x.i}"></i>${esc(x.k)}</div><div class="v" style="${String(x.v).length > 6 ? 'font-size:24px' : ''}">${esc(x.v)}${x.u ? `<small>${x.u}</small>` : ''}</div><div class="d">${esc(x.d)}</div>${x.bar !== undefined ? `<span class="bar"><b style="width:${x.bar}%"></b></span>` : ''}</div>`).join('');

  // ---- per month
  const months = []; const byM = {};
  const mStart = parse(from); mStart.setDate(1); const mEnd = parse(to);
  for (let d = new Date(mStart); d <= mEnd; d.setMonth(d.getMonth() + 1)) { const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; months.push(k); byM[k] = { h: 0, days: new Set(), byP: {} }; }
  rows.forEach(r => { const k = r.entry_date.slice(0, 7); const m = byM[k]; if (!m) return; m.h += r.hours; m.days.add(r.entry_date); m.byP[r.project_id] = (m.byP[r.project_id] || 0) + r.hours; });
  const mWd = (k) => { const [y, m] = k.split('-').map(Number); const [a, b] = monthRange(y, m - 1); const aa = a < from ? from : a; const bb = [b, to, td].sort()[0]; return bb < aa ? 0 : wdList(aa, bb).length; };
  const pb = buckets(rows, from, to, 1);
  const pcc = chartColors();
  $('ps-chart-title').textContent = pb.kind === 'day' ? t('chartDays') : t('perMonth');
  $('ps-legend').innerHTML = `<span><i style="background:${BRAND}"></i>${esc(t('legLogged'))}</span>`
    + (pb.kind === 'day' ? `<span><i style="background:${pcc.weekend}"></i>${esc(t('legWeekend'))}</span><span><i class="line"></i>${esc(t('legTarget', { h: HOURS_PER_DAY }))}</span>` : `<span><i class="line"></i>${esc(t('legExpected'))}</span>`);
  drawBars('ps-chart', 'chart2', pb);
  $('ps-months').innerHTML = `<div class="twrap"><table class="mtable"><thead><tr><th>${t('thMonth')}</th><th class="num">${t('thHours')}</th><th class="num">${t('thDays')}</th><th class="num">${t('thAvgDay')}</th><th>${t('thCoverage')}</th><th>${t('thTopProject')}</th></tr></thead><tbody>${[...months].reverse().map(k => { const m = byM[k]; const wd = mWd(k); const c = pct(m.h, wd * HOURS_PER_DAY); const top = Object.entries(m.byP).sort((a, b) => b[1] - a[1])[0]; const topPj = top ? projById(top[0]) : null;
    return `<tr><td class="b">${esc(MONTHS[Number(k.slice(5, 7)) - 1])} ${k.slice(0, 4)}</td><td class="num b">${m.h ? fh(m.h) : '<span class="mute">—</span>'}</td><td class="num">${m.days.size || '—'}</td><td class="num mute">${m.days.size ? fh(m.h / m.days.size) : '—'}</td>
      <td class="bar"><span class="mbar"><b style="width:${Math.min(100, c)}%;background:${c >= 90 ? '#0F6E56' : c >= 60 ? BRAND : '#C77A0B'}"></b></span><span style="font-variant-numeric:tabular-nums">${c}%</span> <span class="hint">${esc(t('ofNDays', { n: wd }))}</span></td>
      <td>${topPj ? `<span class="badge grp" style="--c:${esc(topPj.color)}">${esc(projLabel(topPj))}</span>` : '<span class="mute">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>`;

  // ---- projects / groups
  const byP = {}, byG = {};
  rows.forEach(r => { byP[r.project_id] = (byP[r.project_id] || 0) + r.hours; const pr = projById(r.project_id); const g = pr ? pr.group_name : t('deletedItem'); byG[g] = (byG[g] || 0) + r.hours; });
  const prow = Object.entries(byP).map(([id, h]) => ({ p: projById(id) || { name: t('deletedItem'), group_name: '', color: '#999' }, h })).sort((a, b) => b.h - a.h);
  const grow = Object.entries(byG).map(([g, h]) => ({ g, h, color: (S.projects.find(x => x.group_name === g) || { color: '#999' }).color })).sort((a, b) => b.h - a.h);
  const barsHtml = (items, max) => `<div class="bars">${items.map(x => `<div class="bar" title="${esc(x.label)}: ${fh(x.h)}"><div class="n"><i style="background:${esc(x.color)}"></i><span>${x.html}</span></div><div class="t"><b style="width:${Math.max(2, x.h / max * 100)}%;background:${esc(x.color)}"></b></div><div class="v">${fh(x.h)}<small>${pct(x.h, total)}%</small></div></div>`).join('')}</div>`;
  const emptyB = `<div class="empty"><i class="ti ti-chart-bar-off"></i>${esc(t('noHoursPeriod'))}</div>`;
  $('ps-proj-hint').textContent = prow.length ? tp('nProjects', prow.length) : ''; $('ps-group-hint').textContent = grow.length ? tp('nGroups', grow.length) : '';
  $('ps-proj').innerHTML = prow.length ? barsHtml(prow.map(({ p, h }) => ({ label: projLabel(p), h, color: p.color, html: (p.group_name && p.group_name !== p.name ? `<span class="sub">${esc(p.group_name)} · </span>` : '') + esc(p.name) })), prow[0].h) : emptyB;
  $('ps-group').innerHTML = grow.length ? barsHtml(grow.map(x => ({ label: x.g, h: x.h, color: x.color, html: esc(x.g) })), grow[0].h) : emptyB;

  // ---- full log
  const byD = {};
  rows.forEach(r => { (byD[r.entry_date] ||= { items: [], tot: 0 }); byD[r.entry_date].items.push(r); byD[r.entry_date].tot += r.hours; });
  const dates = Object.keys(byD).sort((a, b) => b.localeCompare(a));
  $('ps-log-hint').textContent = dates.length ? `${tp('nDaysLogged', dates.length)} · ${fh(total)}` : '';
  $('ps-log').innerHTML = dates.length ? `<div class="twrap"><table><thead><tr><th>${t('thDate')}</th><th>${t('thDay')}</th><th>${t('thProjects')}</th><th class="num">${t('thTot')}</th><th></th></tr></thead><tbody>${dates.map(d => { const l = byD[d]; const dd = parse(d);
    const badges = l.items.sort((a, b) => b.hours - a.hours).map(r => { const pr = projById(r.project_id) || { name: '?', color: '#999' }; return `<span class="badge grp" style="--c:${esc(pr.color)};margin:2px 3px 2px 0">${esc(pr.name)} ${fh(r.hours)}</span>`; }).join('');
    return `<tr><td style="white-space:nowrap;color:var(--tm);font-size:12px">${esc(fmtD(d))}</td><td class="mute">${L().wdaysS[dd.getDay()]}</td><td>${badges}</td><td class="num b">${fh(l.tot)}</td><td class="actions"><button class="iconbtn" title="${esc(t('edit'))}" data-edit="${d}"><i class="ti ti-pencil"></i></button></td></tr>`; }).join('')}</tbody></table></div>` : `<div class="empty"><i class="ti ti-clock-off"></i>${esc(t('noHoursPeriod'))}</div>`;
  $('ps-log').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { S.cperson = p.id; S.cdate = b.dataset.edit; goPage('clock'); });
}
// ============================================================
//  ADMIN
// ============================================================
// ---- PROJECT PAGE (admin): stats for one project + its actions
function openProject(id) { S.projectId = id; goPage('project'); }
$('pr-back').onclick = () => goPage('projects');
$('pr-csv').onclick = () => { const [f, to] = projectRange(); exportCsv(f, to, 'long', { kind: 'project', id: S.projectId }); };
$('pr-logo-up').onclick = () => projectAction('logo', S.projectId);
$('pr-logo-rm').onclick = () => projectAction('logorm', S.projectId);
$('pr-edit').onclick = () => projectAction('ren', S.projectId);
$('pr-arch').onclick = () => projectAction('arch', S.projectId);
$('pr-del').onclick = () => projectAction('del', S.projectId);
function projectRange() { return periodRange(S.prper, S.projectRows.length ? S.projectRows[0].entry_date : null); }
S.buildPrper = periodPicker('pr-per', S.prper, projectRange, () => renderProjectBody(), true);
const projLogoHtml = (p) => p.logo_url
  ? `<img class="pr-logo" src="${esc(p.logo_url)}" alt="">`
  : `<span class="pr-logo mono" style="color:${esc(p.color)};background:color-mix(in srgb,${esc(p.color)} 14%,var(--bg))">${esc(mono(p.name))}</span>`;
// header only (cheap): used after edits so the page reflects the new name / group / logo
function renderProjectHead() {
  const p = projById(S.projectId); if (!p) return false;
  $('pr-logo').innerHTML = projLogoHtml(p);
  $('pr-name').textContent = p.name;
  $('pr-meta').innerHTML = `<span class="badge grp" style="--c:${esc(p.color)}">${esc(p.group_name)}</span> <span class="badge ${p.active ? 'on' : 'off'}">${p.active ? t('active') : t('archived')}</span>`;
  $('pr-logo-up').querySelector('span').textContent = p.logo_url ? t('changeLogo') : t('uploadLogo');
  $('pr-logo-rm').hidden = !p.logo_url;
  $('pr-arch').querySelector('span').textContent = p.active ? t('archive') : t('restore');
  $('pr-arch').querySelector('i').className = 'ti ' + (p.active ? 'ti-archive' : 'ti-archive-off');
  return true;
}
async function renderProject() {
  if (!projById(S.projectId)) { await loadProjects(); if (!projById(S.projectId)) return goPage('projects'); }
  renderProjectHead();
  overlay(true, t('loading'));
  const { data, error } = await sb.from('time_entries').select('id,user_id,project_id,entry_date,hours').eq('project_id', S.projectId).order('entry_date');
  overlay(false);
  if (error) toast(errMsg(error), 'err');
  S.projectRows = (data || []).map(r => ({ ...r, hours: Number(r.hours) }));
  renderProjectBody();
}
function renderProjectBody() {
  const p = projById(S.projectId); if (!p) return;
  const [from, to] = projectRange();
  const rows = S.projectRows.filter(r => r.entry_date >= from && r.entry_date <= to);
  const total = rows.reduce((a, r) => a + r.hours, 0);
  const days = new Set(rows.map(r => r.entry_date));
  const byU = {};
  rows.forEach(r => { const u = byU[r.user_id] ||= { h: 0, days: new Set(), last: '' }; u.h += r.hours; u.days.add(r.entry_date); if (r.entry_date > u.last) u.last = r.entry_date; });
  const nPeople = Object.keys(byU).length;
  const first = rows.length ? rows[0].entry_date : null, last = rows.length ? rows[rows.length - 1].entry_date : null;
  const ago = (d) => { const n = Math.round((parse(today()) - parse(d)) / 86400000); return n === 0 ? t('agoToday') : n === 1 ? t('agoYesterday') : t('agoDays', { n }); };
  const kp = [
    { i: 'ti-clock', k: t('kpiTotal'), v: fnum(total), u: 'h', d: rangeLabel(from, to) },
    { i: 'ti-users', k: t('pjPeople'), v: nPeople, d: nPeople ? t('pjPeopleD', { h: fnum(total / nPeople) }) : '' },
    { i: 'ti-calendar-check', k: t('kpiDays'), v: days.size, d: t('pjDaysD') },
    { i: 'ti-chart-bar', k: t('kpiAvgDay'), v: days.size ? fnum(total / days.size) : 0, u: 'h', d: t('kpiAvgDayD') },
    { i: 'ti-calendar-plus', k: t('kpiFirst'), v: first ? fmtD(first).replace(/ \d{4}$/, '') : '—', d: first ? parse(first).getFullYear() : '' },
    { i: 'ti-calendar-event', k: t('kpiLast'), v: last ? fmtD(last).replace(/ \d{4}$/, '') : '—', d: last ? ago(last) : '' },
  ];
  $('pr-kpis').innerHTML = kp.map(x => `<div class="kpi"><div class="k"><i class="ti ${x.i}"></i>${esc(x.k)}</div><div class="v" style="${String(x.v).length > 6 ? 'font-size:24px' : ''}">${esc(x.v)}${x.u ? `<small>${x.u}</small>` : ''}</div><div class="d">${esc(x.d)}</div></div>`).join('');

  // ---- chart (no expected-hours line: a project has no daily target)
  const b = buckets(rows, from, to, 1); b.target = null;
  $('pr-chart-title').textContent = b.kind === 'day' ? t('chartDays') : t('perMonth');
  $('pr-legend').innerHTML = `<span><i style="background:${esc(p.color)}"></i>${esc(t('legLogged'))}</span>`;
  drawBars('pr-chart', 'chart3', b, b.vals.map(() => p.color));

  // ---- by person
  const people = Object.entries(byU).map(([id, s]) => ({ pr: profById(id), id, ...s })).sort((a, z) => z.h - a.h);
  $('pr-people-hint').textContent = people.length ? tp('pjNPeople', people.length) : '';
  $('pr-people').innerHTML = people.length ? `<div class="bars">${people.map(x => `<div class="bar" title="${esc(x.pr.full_name)}: ${fh(x.h)}">
      <div class="n"><button class="linkname" data-pperson="${x.id}">${avatarHtml(x.pr, true)}<span>${esc(x.pr.full_name)}</span></button></div>
      <div class="t"><b style="width:${Math.max(2, x.h / people[0].h * 100)}%;background:${esc(p.color)}"></b></div>
      <div class="v">${fh(x.h)}<small>${pct(x.h, total)}%</small></div></div>`).join('')}</div>`
    : `<div class="empty"><i class="ti ti-chart-bar-off"></i>${esc(t('noHoursPeriod'))}</div>`;
  $('pr-people').querySelectorAll('[data-pperson]').forEach(el => el.onclick = () => openPerson(el.dataset.pperson));

  // ---- month by month
  const byM = {};
  rows.forEach(r => { const k = r.entry_date.slice(0, 7); const m = byM[k] ||= { h: 0, days: new Set(), people: new Set() }; m.h += r.hours; m.days.add(r.entry_date); m.people.add(r.user_id); });
  const mk = Object.keys(byM).sort().reverse();
  const MONTHS = L().months;
  $('pr-months').innerHTML = mk.length ? `<div class="twrap"><table><thead><tr><th>${t('thMonth')}</th><th class="num">${t('thHours')}</th><th class="num">${t('thDays')}</th><th class="num">${t('thPeople')}</th></tr></thead><tbody>${mk.map(k => { const m = byM[k];
    return `<tr><td class="b">${esc(MONTHS[Number(k.slice(5, 7)) - 1])} ${k.slice(0, 4)}</td><td class="num b">${fh(m.h)}</td><td class="num">${m.days.size}</td><td class="num">${m.people.size}</td></tr>`; }).join('')}</tbody></table></div>`
    : `<div class="empty"><i class="ti ti-calendar-off"></i>${esc(t('noHoursPeriod'))}</div>`;

  // ---- full history (one row per entry), filtered + paged in renderProjectLog
  S.projectLog = [...rows].sort((a, z) => z.entry_date.localeCompare(a.entry_date) || profById(a.user_id).full_name.localeCompare(profById(z.user_id).full_name));
  $('pr-log-hint').textContent = rows.length ? `${tp('nDaysLogged', days.size)} · ${fh(total)}` : '';
  const setOpts = (el, allLabel, opts) => { const cur = el.value; el.innerHTML = `<option value="">${esc(allLabel)}</option>` + opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join(''); el.value = opts.some(([v]) => String(v) === cur) ? cur : ''; };
  setOpts($('pr-fperson'), t('allPeople'), people.map(x => [x.id, x.pr.full_name]).sort((x, y) => x[1].localeCompare(y[1])));
  const wd = L().wdays; // Monday first
  setOpts($('pr-fday'), t('allDays'), [1, 2, 3, 4, 5, 6, 0].filter(k => rows.some(r => parse(r.entry_date).getDay() === k)).map(k => [k, wd[k]]));
  S.projectLogPage = 1;
  renderProjectLog();
}
function renderProjectLog() {
  const all = S.projectLog || [];
  const q = ($('pr-q').value || '').trim().toLowerCase(), fu = $('pr-fperson').value, fd = $('pr-fday').value;
  const list = all.filter(r => (!fu || r.user_id === fu) && (fd === '' || parse(r.entry_date).getDay() === Number(fd))
    && (!q || profById(r.user_id).full_name.toLowerCase().includes(q) || r.entry_date.includes(q) || (' ' + fmtD(r.entry_date).toLowerCase()).includes(' ' + q)));
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (S.projectLogPage > pages) S.projectLogPage = pages;
  const slice = list.slice((S.projectLogPage - 1) * PER_PAGE, S.projectLogPage * PER_PAGE);
  $('pr-log').innerHTML = slice.length ? `<div class="twrap"><table><thead><tr><th>${t('thDate')}</th><th>${t('thDay')}</th><th>${t('thPerson')}</th><th class="num">${t('thHours')}</th><th></th></tr></thead><tbody>${slice.map(r => { const pr = profById(r.user_id);
    return `<tr><td style="white-space:nowrap;color:var(--tm);font-size:12px">${esc(fmtD(r.entry_date))}</td><td class="mute">${L().wdaysS[parse(r.entry_date).getDay()]}</td>
      <td><button class="linkname" data-lperson="${r.user_id}">${avatarHtml(pr, true)}${esc(pr.full_name)}</button></td><td class="num b">${fh(r.hours)}</td>
      <td class="actions"><button class="iconbtn" title="${esc(t('edit'))}" data-edit="${r.user_id}|${r.entry_date}"><i class="ti ti-pencil"></i></button></td></tr>`; }).join('')}</tbody></table></div>`
    : `<div class="empty"><i class="ti ti-clock-off"></i>${esc(all.length ? t('noLogMatch') : t('noHoursPeriod'))}</div>`;
  $('pr-log').querySelectorAll('[data-edit]').forEach(el => el.onclick = () => { const [u, d] = el.dataset.edit.split('|'); S.cperson = u; S.cdate = d; goPage('clock'); });
  $('pr-log').querySelectorAll('[data-lperson]').forEach(el => el.onclick = () => openPerson(el.dataset.lperson));
  $('pr-filters').hidden = !all.length;
  pager('pr-log-pager', list.length, S.projectLogPage, (n) => { S.projectLogPage = n; renderProjectLog(); $('pr-log-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
['pr-q', 'pr-fperson', 'pr-fday'].forEach(id => $(id).addEventListener('input', () => { S.projectLogPage = 1; renderProjectLog(); }));

async function renderAdmin() {
  await Promise.all([loadProfiles(), loadProjects(), loadGroups(), loadRoles()]);
  buildScopeSelects();
  renderUsers(); renderRoles(); renderGroups(); renderProjects(); renderExport();
}
async function adminFn(payload) {
  const { data, error } = await sb.functions.invoke('admin-users', { body: payload });
  if (error) {
    // try to surface the function's own message
    let msg = error.message;
    try { const ctx = error.context; if (ctx && typeof ctx.json === 'function') { const j = await ctx.json(); if (j && j.error) msg = j.error; } } catch {}
    if (/Failed to send a request|Failed to fetch/i.test(msg)) msg = t('errFn');
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

// ---- form modal (moves the form node into a centered dialog and back)
const FORMS = { user: ['hold-user-form', 'form-user'], proj: ['hold-proj-form', 'form-proj'], group: ['hold-group-form', 'form-group'], role: ['hold-role-form', 'form-role'], proles: ['hold-role-form', 'form-proles'] };
function openForm(kind, title) {
  const form = $(FORMS[kind][1]);
  $('fmodal-title').textContent = title;
  $('fmodal-slot').appendChild(form); $('fmodal').hidden = false; $('fmodal').dataset.kind = kind;
  const first = form.querySelector('input'); if (first) setTimeout(() => first.focus(), 30);
}
function closeForm() {
  const kind = $('fmodal').dataset.kind; if (!kind) return;
  $(FORMS[kind][0]).appendChild($(FORMS[kind][1]));
  $('fmodal').hidden = true; $('fmodal').dataset.kind = '';
}
$('fmodal').addEventListener('click', (e) => { if (e.target === e.currentTarget || e.target.closest('[data-close]')) closeForm(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('fmodal').hidden) closeForm(); });
$('admin-new').onclick = () => {
  if (S.adminPage === 'projects') openProjForm(null);
  else if (S.adminPage === 'groups') openGroupForm(null);
  else if (S.adminPage === 'roles') openRoleForm(null);
  else { $('u-roles-f').hidden = !S.rolesTable; renderRolePicker('u-roles', S.newUserRoles); openForm('user', t('newUser')); }
};
// row "CSV" buttons open the Export page with that group / project / person preselected
function exportFor(kind, id) { S.exportPreset = { kind, id }; goPage('export'); }
['u-q', 'u-frole', 'u-fstatus'].forEach(id => $(id).addEventListener('input', () => { S.usersPage = 1; renderUsers(); }));
$('g-q').addEventListener('input', () => { S.groupsPage = 1; renderGroups(); });
$('r-q').addEventListener('input', () => { S.rolesPage = 1; renderRoles(); });
$('u-fteam').addEventListener('input', () => { S.usersPage = 1; renderUsers(); });
['tm-q', 'tm-fcov'].forEach(id => $(id).addEventListener('input', () => { S.teamPage = 1; renderTeamTable(); }));
['lg-q', 'lg-fperson', 'lg-fproj'].forEach(id => $(id).addEventListener('input', () => { S.logPage = 1; renderLogTable(); }));
['pj-q', 'pj-fgroup', 'pj-fstatus'].forEach(id => $(id).addEventListener('input', () => { S.projectsPage = 1; renderProjects(); }));

// ---- users
function suggestCreds(full) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const fi = (parts[0] || '')[0] || '', li = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
  return { username: first, password: (CFG.DEFAULT_PASSWORD_PREFIX || '') + fi.toUpperCase() + li.toLowerCase() };
}
$('u-full').addEventListener('input', () => { const s = suggestCreds($('u-full').value); $('u-user').value = s.username; $('u-pass').value = s.password; });
$('u-user').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_.-]/g, ''); });
$('u-add').onclick = async () => {
  const full_name = $('u-full').value.trim(), username = $('u-user').value.trim(), password = $('u-pass').value, role = $('u-role').value;
  if (!full_name || !username || !password) return toast(t('fillAll'), 'err');
  if (password.length < 6) return toast(t('pwMin'), 'err');
  if (S.profiles.find(p => p.username === username)) return toast(t('userExists'), 'err');
  if (S.rolesTable && !S.newUserRoles.size) return toast(t('teamRequired'), 'err');
  const [color_bg, color_tx] = AVATAR_COLORS[S.profiles.length % AVATAR_COLORS.length];
  $('u-add').disabled = true; overlay(true, t('creatingUser'));
  try {
    const created = await adminFn({ action: 'create', username, full_name, password, role, color_bg, color_tx, email_domain: CFG.AUTH_EMAIL_DOMAIN });
    if (created && created.id && S.newUserRoles.size) await setUserRoles(created.id, S.newUserRoles);
    S.newUserRoles = new Set(); renderRolePicker('u-roles', S.newUserRoles);
    overlay(false); closeForm();
    await modal({ title: t('userCreated'), body: `${t('shareCreds', { name: esc(full_name) })}</p><div class="copybox"><code>${esc(username)}</code><button class="btn sm" onclick="navigator.clipboard.writeText('${esc(username)}')">${esc(t('copy'))}</button></div><div class="copybox"><code>${esc(password)}</code><button class="btn sm" onclick="navigator.clipboard.writeText('${esc(password).replace(/'/g, "\\'")}')">${esc(t('copy'))}</button></div><p>`, okText: t('done'), cancelText: '' });
    $('u-full').value = ''; $('u-user').value = ''; $('u-pass').value = ''; $('u-role').value = 'member';
    closeForm(); await renderAdmin(); toast(t('userAdded', { name: full_name }), 'ok');
  } catch (e) { overlay(false); toast(errMsg(e), 'err'); }
  $('u-add').disabled = false;
};
const PER_PAGE = 10;
function pager(el, total, page, onGo) {
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const box = $(el);
  if (pages <= 1) { box.hidden = true; box.innerHTML = ''; return; }
  const from = (page - 1) * PER_PAGE + 1, to = Math.min(total, page * PER_PAGE);
  const nums = []; const add = (n) => nums.push(`<button class="${n === page ? 'on' : ''}" data-p="${n}">${n}</button>`);
  const gap = () => nums.push('<span class="gap">…</span>');
  if (pages <= 7) { for (let i = 1; i <= pages; i++) add(i); }
  else {
    add(1);
    if (page > 3) gap();
    for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) add(i);
    if (page < pages - 2) gap();
    add(pages);
  }
  box.hidden = false;
  box.innerHTML = `<span class="pinfo">${esc(t('pagerInfo', { a: from, b: to, n: total }))}</span>
    <button data-p="${page - 1}" ${page === 1 ? 'disabled' : ''}><i class="ti ti-chevron-left"></i></button>
    ${nums.join('')}
    <button data-p="${page + 1}" ${page === pages ? 'disabled' : ''}><i class="ti ti-chevron-right"></i></button>`;
  box.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { const n = Number(b.dataset.p); if (n >= 1 && n <= pages) onGo(n); });
}

function renderUsers() {
  const ft = $('u-fteam'); const curT = ft.value;
  ft.hidden = !S.rolesTable;
  ft.innerHTML = `<option value="">${esc(t('allJobRoles'))}</option>` + S.roles.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('') + `<option value="none">${esc(t('noRoles'))}</option>`;
  let wantT = curT;
  if (S.usersTeam !== undefined) { wantT = S.usersTeam; S.usersTeam = undefined; S.usersPage = 1; }
  ft.value = wantT === 'none' || roleById(wantT) ? wantT : '';
  const q = ($('u-q').value || '').trim().toLowerCase(), fr = $('u-frole').value, fs = $('u-fstatus').value, fteam = ft.value;
  const all = [...S.profiles].sort((a, b) => (b.active - a.active) || a.full_name.localeCompare(b.full_name));
  const hasRole = (p) => fteam === 'none' ? !rolesOf(p.id).length : S.roleLinks.some(x => x.user_id === p.id && x.role_id === fteam);
  const list = all.filter(p => (!q || p.full_name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q) || rolesOf(p.id).some(r => r.name.toLowerCase().includes(q)))
    && (!fr || p.role === fr) && (!fteam || hasRole(p)) && (fs === '' || (fs === 'active' ? p.active : !p.active)));
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (S.usersPage > pages) S.usersPage = pages;
  const slice = list.slice((S.usersPage - 1) * PER_PAGE, S.usersPage * PER_PAGE);
  $('users-table').innerHTML = slice.length ? `<div class="twrap"><table><thead><tr><th>${t('thPerson')}</th><th>${t('thUsername')}</th>${S.rolesTable ? `<th>${t('thJobRoles')}</th>` : ''}<th>${t('thRole')}</th><th>${t('thStatus')}</th><th></th></tr></thead><tbody>${slice.map(p => `<tr style="${p.active ? '' : 'opacity:.6'}">
    <td><button class="linkname" data-person="${p.id}">${avatarHtml(p, true)}${esc(p.full_name)}${p.id === S.me.id ? ` <span class="hint">(${esc(t('me'))})</span>` : ''}</button></td>
    <td class="pw">${esc(p.username)}</td>
    ${S.rolesTable ? `<td><span class="rcell">${roleBadges(p.id, p.active ? `<span class="badge warn"><i class="ti ti-alert-triangle"></i> ${esc(t('noRoles'))}</span>` : '<span class="mute">—</span>')}<button class="iconbtn" title="${esc(t('changeTeam'))}" data-uteam="${p.id}"><i class="ti ti-pencil"></i></button></span></td>` : ''}
    <td><span class="badge ${p.role}">${p.role === 'admin' ? t('roleAdmin') : t('roleStaff')}</span></td>
    <td><span class="badge ${p.active ? 'on' : 'off'}">${p.active ? t('active') : t('deactivated')}</span></td>
    <td class="actions"><button class="iconbtn" title="${esc(t('exportCsv'))}" data-ucsv="${p.id}"><i class="ti ti-file-download"></i></button><button class="btn sm" data-person="${p.id}" style="margin-left:4px">${esc(t('open'))} <i class="ti ti-chevron-right"></i></button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><i class="ti ti-user-search"></i>${esc(t('noUsersMatch'))}</div>`;
  $('users-table').querySelectorAll('[data-person]').forEach(b => b.onclick = () => openPerson(b.dataset.person));
  $('users-table').querySelectorAll('[data-uteam]').forEach(b => b.onclick = () => openPersonRoles(b.dataset.uteam));
  $('users-table').querySelectorAll('[data-ucsv]').forEach(b => b.onclick = () => exportFor('person', b.dataset.ucsv));
  pager('users-pager', list.length, S.usersPage, (n) => { S.usersPage = n; renderUsers(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}
async function userAction(act, id) {
  const p = profById(id);
  try {
    if (act === 'pw') {
      const sug = suggestCreds(p.full_name).password;
      const pw = await modal({ title: t('newPwFor', { name: p.full_name }), body: esc(t('newPwBody')), okText: t('reset'), input: { label: t('newPw'), value: sug, mono: true } });
      if (pw === null) return; if (pw.length < 6) return toast(t('pwMinShort'), 'err');
      overlay(true, t('updating')); await adminFn({ action: 'reset_password', user_id: id, password: pw }); overlay(false);
      await modal({ title: t('pwUpdated'), body: `<div class="copybox"><code>${esc(pw)}</code><button class="btn sm" onclick="navigator.clipboard.writeText('${esc(pw).replace(/'/g, "\\'")}')">${esc(t('copy'))}</button></div>`, okText: t('done'), cancelText: '' });
    } else if (act === 'role') {
      const role = p.role === 'admin' ? 'member' : 'admin';
      if (!(await confirm(t('changeRole'), t('changeRoleBody', { name: esc(p.full_name), role: role === 'admin' ? t('roleAdmin') : t('roleStaff') })))) return;
      overlay(true, t('updating')); await adminFn({ action: 'set_role', user_id: id, role }); overlay(false); toast(t('roleUpdated'), 'ok');
    } else if (act === 'active') {
      const active = !p.active;
      if (!(await confirm(active ? t('reactivateUser') : t('deactivateUser'), t(active ? 'reactivateBody' : 'deactivateBody', { name: esc(p.full_name) }), active ? t('reactivate') : t('deactivate'), !active))) return;
      overlay(true, t('updating')); await adminFn({ action: 'set_active', user_id: id, active }); overlay(false); toast(active ? t('userReactivated') : t('userDeactivated'), 'ok');
    } else if (act === 'del') {
      if (!(await confirm(t('deleteUser'), t('deleteUserBody', { name: esc(p.full_name) }), t('deleteForever'), true))) return;
      overlay(true, t('deleting')); await adminFn({ action: 'delete', user_id: id }); overlay(false); toast(t('userDeleted'), 'ok');
    }
    await renderAdmin();
    if (act !== 'del' && document.getElementById('p-person').classList.contains('active')) await renderPerson();
    if (act === 'del' && document.getElementById('p-person').classList.contains('active')) goPage('users');
  } catch (e) { overlay(false); toast(errMsg(e), 'err'); }
}

// ---- projects
const LOGO_BUCKET = 'project-logos';
function pickColor() {
  // least-used palette colour among existing groups, random among ties
  const used = {}; allGroups().forEach(g => { used[g.color] = (used[g.color] || 0) + 1; });
  const min = Math.min(...GROUP_COLORS.map(([c]) => used[c] || 0));
  const cands = GROUP_COLORS.filter(([c]) => (used[c] || 0) === min);
  return cands[Math.floor(Math.random() * cands.length)][0];
}
function shrinkImage(file, max = 480) {
  if (file.type === 'image/svg+xml') return Promise.resolve(file);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => { const sc = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => resolve(b || file), 'image/png'); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
async function uploadLogo(projectId, file) {
  const blob = await shrinkImage(file);
  const ext = file.type === 'image/svg+xml' ? 'svg' : 'png';
  const path = `${projectId}.${ext}`;
  const { error } = await sb.storage.from(LOGO_BUCKET).upload(path, blob, { upsert: true, contentType: file.type === 'image/svg+xml' ? 'image/svg+xml' : 'image/png', cacheControl: '3600' });
  if (error) throw new Error(/bucket/i.test(error.message) ? t('errBucket') : error.message);
  const url = sb.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
  const { error: e2 } = await sb.from('projects').update({ logo_url: url }).eq('id', projectId);
  if (e2) throw e2;
  return url;
}
const logoHtml = (p, cls = '') => p.logo_url ? `<img class="${cls}" src="${esc(p.logo_url)}" alt="">` : '';
// make sure a group row exists (creates it when new); returns { name, color }
async function ensureGroup(rawName) {
  const ex = groupByName(rawName);
  if (ex) return ex;
  const g = { name: rawName.trim(), color: pickColor() };
  if (S.groupsTable) {
    const { error } = await sb.from('project_groups').insert(g);
    if (error) throw error;
    S.groupRows.push(g);
  }
  return g;
}

// ---- project form (create + edit)
const NEW_GROUP = '__new__';
function fillGroupSelect(selected) {
  const sel = $('pj-group');
  sel.innerHTML = allGroups().map(g => `<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('') + `<option value="${NEW_GROUP}">${esc(t('newGroupOpt'))}</option>`;
  sel.value = selected && groupByName(selected) ? groupByName(selected).name : NEW_GROUP;
  $('pj-newgroup').value = '';
  $('pj-newgroup').hidden = sel.value !== NEW_GROUP;
}
$('pj-group').onchange = () => { const isNew = $('pj-group').value === NEW_GROUP; $('pj-newgroup').hidden = !isNew; if (isNew) $('pj-newgroup').focus(); };
function openProjForm(p, group) {
  S.editProj = p ? p.id : null;
  $('pj-name').value = p ? p.name : ''; $('pj-logo').value = '';
  fillGroupSelect(p ? p.group_name : group);
  $('pj-add-l').textContent = p ? t('save') : t('add');
  openForm('proj', p ? t('editProj') : t('newProject'));
}
$('pj-add').onclick = async () => {
  const name = $('pj-name').value.trim();
  if (!name) return toast(t('enterProjName'), 'err');
  const pick = $('pj-group').value;
  const groupName = pick === NEW_GROUP ? ($('pj-newgroup').value.trim() || name) : pick;
  const editing = S.editProj ? projById(S.editProj) : null;
  const clash = S.projects.find(p => p.id !== S.editProj && p.name.toLowerCase() === name.toLowerCase() && p.group_name.toLowerCase() === groupName.toLowerCase());
  if (clash) return toast(t('projExists'), 'err');
  $('pj-add').disabled = true;
  try {
    const g = await ensureGroup(groupName);
    const fields = { name, group_name: g.name, color: g.color };
    let id = S.editProj;
    if (editing) {
      const { error } = await sb.from('projects').update(fields).eq('id', id); if (error) throw error;
    } else {
      fields.sort_order = Math.max(0, ...S.projects.map(p => p.sort_order)) + 10;
      const { data, error } = await sb.from('projects').insert(fields).select('id').single(); if (error) throw error;
      id = data.id;
    }
    const f = $('pj-logo').files[0];
    if (f) { overlay(true, t('uploadingLogo')); await uploadLogo(id, f); overlay(false); }
    closeForm(); await Promise.all([loadProjects(), loadGroups()]); renderProjects(); renderGroups();
    if (S.page === 'project') renderProjectHead();
    toast(editing ? t('projSaved') : t('projAdded'), 'ok');
  } catch (e) { overlay(false); toast(errMsg(e), 'err'); }
  $('pj-add').disabled = false;
};

// ---- groups page
function openGroupForm(g) {
  if (!S.groupsTable) return toast(t('errGroupsTable'), 'err');
  S.editGroup = g ? g.name : null;
  $('g-name').value = g ? g.name : '';
  S.groupColor = g ? g.color : pickColor();
  renderSwatches();
  $('g-save-l').textContent = g ? t('save') : t('add');
  openForm('group', g ? t('editGroup') : t('newGroup'));
}
function renderSwatches() {
  $('g-colors').innerHTML = GROUP_COLORS.map(([c, label]) => `<button type="button" class="swatch-btn${c.toLowerCase() === String(S.groupColor).toLowerCase() ? ' on' : ''}" role="radio" aria-checked="${c.toLowerCase() === String(S.groupColor).toLowerCase()}" title="${esc(label)}" data-c="${c}" style="--c:${c}"></button>`).join('');
}
$('g-colors').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; S.groupColor = b.dataset.c; renderSwatches(); };
$('g-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('g-save').click(); });
$('g-save').onclick = async () => {
  const name = $('g-name').value.trim(), color = S.groupColor;
  if (!name) return toast(t('enterGroupName'), 'err');
  const clash = groupByName(name);
  if (clash && clash.name !== S.editGroup) return toast(t('groupExists'), 'err');
  $('g-save').disabled = true;
  try {
    if (S.editGroup) {
      // renaming cascades to projects.group_name (foreign key); keep project colours in sync
      const { error } = await sb.from('project_groups').update({ name, color }).eq('name', S.editGroup); if (error) throw error;
      const { error: e2 } = await sb.from('projects').update({ color }).eq('group_name', name); if (e2) throw e2;
    } else {
      const { error } = await sb.from('project_groups').insert({ name, color }); if (error) throw error;
    }
    const wasEdit = !!S.editGroup;
    closeForm(); await Promise.all([loadProjects(), loadGroups()]); renderGroups(); renderProjects();
    toast(wasEdit ? t('groupSaved') : t('groupAdded'), 'ok');
  } catch (e) { toast(errMsg(e), 'err'); }
  $('g-save').disabled = false;
};
function renderGroups() {
  const q = ($('g-q').value || '').trim().toLowerCase();
  const list = allGroups().filter(g => !q || g.name.toLowerCase().includes(q) || g.projects.some(p => p.name.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (S.groupsPage > pages) S.groupsPage = pages;
  const slice = list.slice((S.groupsPage - 1) * PER_PAGE, S.groupsPage * PER_PAGE);
  const MAXP = 4;
  $('groups-table').innerHTML = slice.length ? `<div class="twrap"><table><thead><tr><th>${t('thGroup')}</th><th>${t('thProjects')}</th><th></th></tr></thead><tbody>${slice.map(g => {
    const chips = g.projects.slice(0, MAXP).map(p => `<span class="pchip${p.active ? '' : ' off'}">${esc(p.name)}</span>`).join('') + (g.projects.length > MAXP ? `<span class="pchip more">+${g.projects.length - MAXP}</span>` : '');
    const inUse = g.projects.length > 0;
    return `<tr>
      <td><button class="linkname" data-gview="${esc(g.name)}"><span class="gdot" style="--c:${esc(g.color)}"></span>${esc(g.name)}</button></td>
      <td>${chips || `<span class="mute">${esc(t('noProjectsYet'))}</span>`}</td>
      <td class="actions">
        <button class="iconbtn" title="${esc(t('exportCsv'))}" data-gcsv="${esc(g.name)}" ${inUse ? '' : 'disabled'}><i class="ti ti-file-download"></i></button>
        <button class="iconbtn" title="${esc(t('newProject'))}" data-gadd="${esc(g.name)}"><i class="ti ti-folder-plus"></i></button>
        <button class="iconbtn" title="${esc(t('editGroup'))}" data-gedit="${esc(g.name)}"><i class="ti ti-pencil"></i></button>
        <button class="iconbtn danger" title="${esc(inUse ? t('groupInUse') : t('deleteGroup'))}" data-gdel="${esc(g.name)}" ${inUse ? 'disabled' : ''}><i class="ti ti-trash"></i></button>
      </td></tr>`;
  }).join('')}</tbody></table></div>` : `<div class="empty"><i class="ti ti-stack-2"></i>${esc(t('noGroupsMatch'))}</div>`;
  const tb = $('groups-table'), byName = (n) => allGroups().find(g => g.name === n);
  tb.querySelectorAll('[data-gview]').forEach(b => b.onclick = () => { S.projectsGroup = b.dataset.gview; goPage('projects'); });
  tb.querySelectorAll('[data-gcsv]').forEach(b => b.onclick = () => exportFor('group', b.dataset.gcsv));
  tb.querySelectorAll('[data-gadd]').forEach(b => b.onclick = () => openProjForm(null, b.dataset.gadd));
  tb.querySelectorAll('[data-gedit]').forEach(b => b.onclick = () => openGroupForm(byName(b.dataset.gedit)));
  tb.querySelectorAll('[data-gdel]').forEach(b => b.onclick = () => deleteGroup(b.dataset.gdel));
  pager('groups-pager', list.length, S.groupsPage, (n) => { S.groupsPage = n; renderGroups(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}
async function deleteGroup(name) {
  if (!S.groupsTable) return toast(t('errGroupsTable'), 'err');
  if (!(await confirm(t('deleteGroup'), t('deleteGroupBody', { name: esc(name) }), t('delete'), true))) return;
  try {
    const { error } = await sb.from('project_groups').delete().eq('name', name);
    if (error) { if (/foreign key|violates/i.test(error.message)) throw new Error(t('groupInUse')); throw error; }
    await loadGroups(); renderGroups(); toast(t('groupDeleted'), 'ok');
  } catch (e) { toast(errMsg(e), 'err'); }
}

// ---- roles page (staff roles / teams)
S.newUserRoles = new Set();
// chip picker: toggles ids in `set`; `items` = [{ id, label, color?, html? }]
function renderChipPicker(el, items, set, emptyText, onChange) {
  $(el).innerHTML = items.length ? items.map(x => `<button type="button" class="chip${set.has(x.id) ? ' active' : ''}" data-pick="${x.id}" aria-pressed="${set.has(x.id)}">${x.html || `<i class="dot" style="--c:${esc(x.color)}"></i>`}${esc(x.label)}</button>`).join('') : `<span class="mute">${esc(emptyText)}</span>`;
  $(el).onclick = (e) => { const b = e.target.closest('[data-pick]'); if (!b) return; const id = b.dataset.pick; set.has(id) ? set.delete(id) : set.add(id); b.classList.toggle('active', set.has(id)); b.setAttribute('aria-pressed', set.has(id)); if (onChange) onChange(); };
}
const renderRolePicker = (el, set) => renderChipPicker(el, S.roles.map(r => ({ id: r.id, label: r.name, color: r.color })), set, t('noRolesYet'));
// replace a person's roles with `set`
async function setUserRoles(uid, set) {
  const cur = new Set(S.roleLinks.filter(x => x.user_id === uid).map(x => x.role_id));
  const add = [...set].filter(id => !cur.has(id)), del = [...cur].filter(id => !set.has(id));
  if (add.length) { const { error } = await sb.from('profile_roles').insert(add.map(role_id => ({ user_id: uid, role_id }))); if (error) throw error; }
  if (del.length) { const { error } = await sb.from('profile_roles').delete().eq('user_id', uid).in('role_id', del); if (error) throw error; }
}
// replace a role's members with `set`
async function setRoleMembers(rid, set) {
  const cur = new Set(S.roleLinks.filter(x => x.role_id === rid).map(x => x.user_id));
  const add = [...set].filter(id => !cur.has(id)), del = [...cur].filter(id => !set.has(id));
  if (add.length) { const { error } = await sb.from('profile_roles').insert(add.map(user_id => ({ user_id, role_id: rid }))); if (error) throw error; }
  if (del.length) { const { error } = await sb.from('profile_roles').delete().eq('role_id', rid).in('user_id', del); if (error) throw error; }
}
function renderMemberPicker() {
  const q = ($('r-mq').value || '').trim().toLowerCase();
  // active people, plus anyone inactive who is already a member
  const people = S.profiles.filter(p => (p.active || S.rolePick.has(p.id)) && (!q || p.full_name.toLowerCase().includes(q)));
  const count = () => { $('r-mcount').textContent = tp('nMembers', S.rolePick.size); };
  renderChipPicker('r-members', people.map(p => ({ id: p.id, label: p.full_name, html: avatarHtml(p, true) })), S.rolePick, t('noUsersMatch'), count);
  count();
}
$('r-mq').addEventListener('input', renderMemberPicker);
function openRoleForm(r) {
  if (!S.rolesTable) return toast(t('errRolesTable'), 'err');
  S.editRole = r ? r.id : null;
  $('r-name').value = r ? r.name : '';
  S.roleColor = r ? r.color : GROUP_COLORS[S.roles.length % GROUP_COLORS.length][0];
  renderRoleSwatches();
  S.rolePick = new Set(r ? S.roleLinks.filter(x => x.role_id === r.id).map(x => x.user_id) : []);
  $('r-mq').value = ''; renderMemberPicker();
  $('r-save-l').textContent = r ? t('save') : t('add');
  openForm('role', r ? t('editRole') : t('newRole'));
}
function renderRoleSwatches() {
  $('r-colors').innerHTML = GROUP_COLORS.map(([c, label]) => { const on = c.toLowerCase() === String(S.roleColor).toLowerCase(); return `<button type="button" class="swatch-btn${on ? ' on' : ''}" role="radio" aria-checked="${on}" title="${esc(label)}" data-c="${c}" style="--c:${c}"></button>`; }).join('');
}
$('r-colors').onclick = (e) => { const b = e.target.closest('[data-c]'); if (!b) return; S.roleColor = b.dataset.c; renderRoleSwatches(); };
$('r-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('r-save').click(); });
$('r-save').onclick = async () => {
  const name = $('r-name').value.trim(), color = S.roleColor;
  if (!name) return toast(t('enterRoleName'), 'err');
  if (S.roles.some(r => r.id !== S.editRole && r.name.toLowerCase() === name.toLowerCase())) return toast(t('roleExists'), 'err');
  const wasEdit = !!S.editRole;
  $('r-save').disabled = true;
  try {
    let id = S.editRole;
    if (wasEdit) {
      const { error } = await sb.from('staff_roles').update({ name, color }).eq('id', id); if (error) throw error;
    } else {
      const { data, error } = await sb.from('staff_roles').insert({ name, color }).select('id').single(); if (error) throw error;
      id = data.id;
    }
    await setRoleMembers(id, S.rolePick);
    closeForm(); await loadRoles(); renderRoles(); renderUsers();
    toast(wasEdit ? t('roleSaved') : t('roleAdded'), 'ok');
  } catch (e) { toast(errMsg(e), 'err'); }
  $('r-save').disabled = false;
};
function renderRoles() {
  $('roles-missing').hidden = S.rolesTable;
  const q = ($('r-q').value || '').trim().toLowerCase();
  const list = S.roles.map(r => ({ ...r, members: membersOf(r.id) }))
    .filter(r => !q || r.name.toLowerCase().includes(q) || r.members.some(p => p.full_name.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (S.rolesPage > pages) S.rolesPage = pages;
  const slice = list.slice((S.rolesPage - 1) * PER_PAGE, S.rolesPage * PER_PAGE);
  const MAXM = 6;
  $('roles-table').innerHTML = slice.length ? `<div class="twrap"><table><thead><tr><th>${t('thJobRole')}</th><th>${t('thMembers')}</th><th></th></tr></thead><tbody>${slice.map(r => {
    const act = r.members.filter(p => p.active);
    const faces = act.slice(0, MAXM).map(p => `<button class="linkname rmember" data-person="${p.id}" title="${esc(p.full_name)}">${avatarHtml(p, true)}<span>${esc(p.full_name.split(' ')[0])}</span></button>`).join('')
      + (act.length > MAXM ? `<span class="pchip more">+${act.length - MAXM}</span>` : '');
    return `<tr>
      <td><button class="linkname" data-rview="${r.id}"><span class="gdot" style="--c:${esc(r.color)}"></span>${esc(r.name)}</button></td>
      <td><span class="rmembers">${faces || `<span class="mute">${esc(t('noMembersYet'))}</span>`}</span></td>
      <td class="actions">
        <button class="iconbtn" title="${esc(t('showMembers'))}" data-rview="${r.id}"><i class="ti ti-users"></i></button>
        <button class="iconbtn" title="${esc(t('editRole'))}" data-redit="${r.id}"><i class="ti ti-pencil"></i></button>
        <button class="iconbtn danger" title="${esc(t('deleteRole'))}" data-rdel="${r.id}"><i class="ti ti-trash"></i></button>
      </td></tr>`;
  }).join('')}</tbody></table></div>` : `<div class="empty"><i class="ti ti-id-badge-2"></i>${esc(S.roles.length ? t('noRolesMatch') : t('noRolesYet'))}</div>`;
  const tb = $('roles-table');
  tb.querySelectorAll('[data-person]').forEach(b => b.onclick = () => openPerson(b.dataset.person));
  tb.querySelectorAll('[data-rview]').forEach(b => b.onclick = () => { S.usersTeam = b.dataset.rview; goPage('users'); });
  tb.querySelectorAll('[data-redit]').forEach(b => b.onclick = () => openRoleForm(roleById(b.dataset.redit)));
  tb.querySelectorAll('[data-rdel]').forEach(b => b.onclick = () => deleteRole(b.dataset.rdel));
  pager('roles-pager', list.length, S.rolesPage, (n) => { S.rolesPage = n; renderRoles(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}
async function deleteRole(id) {
  const r = roleById(id); if (!r) return;
  const n = membersOf(id).length;
  if (!(await confirm(t('deleteRole'), t('deleteRoleBody', { name: esc(r.name), n }), t('delete'), true))) return;
  try {
    const { error } = await sb.from('staff_roles').delete().eq('id', id); if (error) throw error;
    await loadRoles(); renderRoles(); renderUsers(); toast(t('roleDeleted'), 'ok');
  } catch (e) { toast(errMsg(e), 'err'); }
}
// person page: edit this person's roles
function openPersonRoles(uid) {
  if (!S.rolesTable) return toast(t('errRolesTable'), 'err');
  const p = profById(uid);
  S.rolePickUid = uid;
  S.rolePickFor = new Set(S.roleLinks.filter(x => x.user_id === uid).map(x => x.role_id));
  renderRolePicker('pr-roles', S.rolePickFor);
  openForm('proles', t('rolesOf', { name: p.full_name }));
}
$('ps-roles').onclick = () => openPersonRoles(S.personId);
$('pr-save').onclick = async () => {
  if (profById(S.rolePickUid).active && !S.rolePickFor.size) return toast(t('teamRequired'), 'err');
  $('pr-save').disabled = true;
  try {
    await setUserRoles(S.rolePickUid, S.rolePickFor);
    closeForm(); await loadRoles();
    if (S.page === 'person') await renderPerson();
    renderUsers(); renderRoles();
    toast(t('rolesUpdated'), 'ok');
  } catch (e) { toast(errMsg(e), 'err'); }
  $('pr-save').disabled = false;
};

function renderProjects() {
  const groups = allGroups().map(g => g.name);
  const fg = $('pj-fgroup'); let cur = fg.value;
  if (S.projectsGroup !== undefined) { cur = S.projectsGroup; S.projectsGroup = undefined; S.projectsPage = 1; }
  fg.innerHTML = `<option value="">${esc(t('allGroups'))}</option>` + groups.map(g => `<option value="${esc(g)}">${esc(g)}</option>`).join(''); fg.value = groups.includes(cur) ? cur : '';
  const q = ($('pj-q').value || '').trim().toLowerCase(), fs = $('pj-fstatus').value;
  const list = S.projects.filter(p => (!q || p.name.toLowerCase().includes(q) || p.group_name.toLowerCase().includes(q)) && (!fg.value || p.group_name === fg.value) && (fs === '' || (fs === 'active' ? p.active : !p.active)));
  const ppages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (S.projectsPage > ppages) S.projectsPage = ppages;
  const pslice = list.slice((S.projectsPage - 1) * PER_PAGE, S.projectsPage * PER_PAGE);
  $('projects-table').innerHTML = pslice.length ? `<div class="twrap"><table><thead><tr><th>${t('thLogo')}</th><th>${t('thGroup')}</th><th>${t('thProject')}</th><th>${t('thStatus')}</th><th></th></tr></thead><tbody>${pslice.map(p => `<tr style="${p.active ? '' : 'opacity:.6'}">
    <td>${p.logo_url ? logoHtml(p, 'plogo') : `<span class="mono plogo" style="display:inline-flex;align-items:center;justify-content:center;font-family:'Fraunces',serif;color:${esc(p.color)};background:color-mix(in srgb,${esc(p.color)} 14%,var(--bg));border:0">${esc(mono(p.name))}</span>`}</td>
    <td><span class="badge grp" style="--c:${esc(p.color)}">${esc(p.group_name)}</span></td>
    <td><button class="linkname" data-popen="${p.id}">${esc(p.name)}</button></td>
    <td><span class="badge ${p.active ? 'on' : 'off'}">${p.active ? t('active') : t('archived')}</span></td>
    <td class="actions"><button class="btn sm" data-popen="${p.id}">${esc(t('open'))} <i class="ti ti-chevron-right"></i></button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><i class="ti ti-folder-off"></i>${esc(t('noProjMatch'))}</div>`;
  $('projects-table').querySelectorAll('[data-popen]').forEach(b => b.onclick = () => openProject(b.dataset.popen));
  pager('projects-pager', list.length, S.projectsPage, (n) => { S.projectsPage = n; renderProjects(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}
async function projectAction(act, id) {
  const p = projById(id);
  try {
    if (act === 'ren') return openProjForm(p);
    if (act === 'csv') return exportFor('project', id);
    if (act === 'logo') {
      const inp = $('pj-logo-row'); inp.value = '';
      inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { overlay(true, t('uploadingLogo')); await uploadLogo(id, f); overlay(false); toast(t('logoUpdated'), 'ok'); await loadProjects(); renderProjects(); if (S.page === 'project') renderProjectHead(); } catch (e) { overlay(false); toast(errMsg(e), 'err'); } };
      inp.click(); return;
    } else if (act === 'logorm') {
      if (!(await confirm(t('removeLogo'), t('removeLogoBody', { name: esc(p.name) }), t('remove')))) return;
      await sb.storage.from(LOGO_BUCKET).remove([`${id}.png`, `${id}.svg`]);
      const { error } = await sb.from('projects').update({ logo_url: null }).eq('id', id); if (error) throw error;
      toast(t('logoRemoved'), 'ok');
    } else if (act === 'arch') {
      const { error } = await sb.from('projects').update({ active: !p.active }).eq('id', id); if (error) throw error;
      toast(p.active ? t('projArchived') : t('projRestored'), 'ok');
    } else if (act === 'del') {
      if (!(await confirm(t('deleteProj'), t('deleteProjBody', { name: esc(p.name) }), t('delete'), true))) return;
      const { error } = await sb.from('projects').delete().eq('id', id);
      if (error) { if (/foreign key|violates/i.test(error.message)) throw new Error(t('projHasHours')); throw error; }
      toast(t('projDeleted'), 'ok');
      await loadProjects(); renderProjects();
      if (S.page === 'project') goPage('projects');
      return;
    }
    await loadProjects(); renderProjects();
    if (S.page === 'project') renderProjectHead();
  } catch (e) { toast(errMsg(e), 'err'); }
}

// ---- export
// scope picker: whole team, or one group / project / person
function renderExport() {
  if (!$('x-from').value) { const [f, z] = monthRange(new Date().getFullYear(), new Date().getMonth()); $('x-from').value = f; $('x-to').value = z; }
  if (S.exportPreset) $('x-scope').value = S.exportPreset.kind;
  fillExportItems(S.exportPreset ? S.exportPreset.id : $('x-item').value);
  S.exportPreset = null;
}
function fillExportItems(selected) {
  const kind = $('x-scope').value, sel = $('x-item');
  const items = kind === 'group' ? allGroups().filter(g => g.projects.length).map(g => [g.name, g.name])
    : kind === 'project' ? S.projects.map(p => [p.id, projLabel(p) + (p.active ? '' : ` (${t('archived')})`)])
    : kind === 'person' ? S.profiles.map(p => [p.id, p.full_name + (p.active ? '' : ` (${t('deactivated')})`)]) : [];
  sel.innerHTML = items.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  if (items.some(([v]) => v === selected)) sel.value = selected;
  sel.disabled = kind === 'all';
  $('x-item-l').textContent = kind === 'all' ? ' ' : t({ group: 'group', project: 'thProject', person: 'thPerson' }[kind]);
}
$('x-scope').onchange = () => fillExportItems(null);
$('x-go').onclick = () => {
  const f = $('x-from').value, to = $('x-to').value; if (!f || !to || f > to) return toast(t('checkDates'), 'err');
  const kind = $('x-scope').value;
  exportCsv(f, to, $('x-fmt').value, kind === 'all' ? null : { kind, id: $('x-item').value });
};
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
// filter: null (everything), a user id (older callers), or { kind: 'person' | 'group' | 'project', id }
async function exportCsv(from, to, fmt, filter) {
  if (typeof filter === 'string') filter = { kind: 'person', id: filter };
  const kind = filter && filter.kind;
  let projIds = null, tag = '';
  if (kind === 'group') { projIds = new Set(S.projects.filter(p => p.group_name === filter.id).map(p => p.id)); tag = filter.id; }
  if (kind === 'project') { projIds = new Set([filter.id]); const p = projById(filter.id); tag = p ? projLabel(p) : ''; }
  if (kind === 'person') tag = profById(filter.id).username;
  overlay(true, t('preparingCsv'));
  let rows = await fetchEntries(from, to, kind === 'person' ? filter.id : null);
  overlay(false);
  if (projIds) rows = rows.filter(r => projIds.has(r.project_id));
  // no hours: still download the file (header row only)
  if (!rows.length) toast(t('noHoursExport'));
  const out = [];
  if (fmt === 'long') {
    out.push([t('thDate'), t('thUsername'), t('thPerson'), t('thGroup'), t('thProject'), t('thHours')]);
    rows.sort((a, b) => a.entry_date.localeCompare(b.entry_date)).forEach(r => { const p = profById(r.user_id), pr = projById(r.project_id) || { group_name: '', name: '?' }; out.push([r.entry_date, p.username, p.full_name, pr.group_name, pr.name, fnum(r.hours)]); });
  } else {
    const cols = S.projects.filter(p => (projIds ? projIds.has(p.id) : p.active) || rows.some(r => r.project_id === p.id));
    out.push([t('thDate'), t('thPerson'), ...cols.map(projLabel), t('csvTotal')]);
    const byUD = {};
    rows.forEach(r => { const k = r.entry_date + '|' + r.user_id; (byUD[k] ||= { d: r.entry_date, u: r.user_id, h: {} }); byUD[k].h[r.project_id] = (byUD[k].h[r.project_id] || 0) + r.hours; });
    Object.values(byUD).sort((a, b) => a.d.localeCompare(b.d) || profById(a.u).full_name.localeCompare(profById(b.u).full_name)).forEach(x => { const tot = Object.values(x.h).reduce((a, b) => a + b, 0); out.push([x.d, profById(x.u).full_name, ...cols.map(c => fnum(x.h[c.id] || 0)), fnum(tot)]); });
  }
  downloadCsv(out, [t('csvFile'), slug(tag), from, to].filter(Boolean).join('_') + '.csv');
}

// ============================================================
window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
boot();
})();
