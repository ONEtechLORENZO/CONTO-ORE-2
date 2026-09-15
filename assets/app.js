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
];
const BRAND = '#6B52F5';
// Avatar pastel pairs (bg, text)
const AVATAR_COLORS = [
  ['#EEEDFE','#3C3489'],['#E1F5EE','#085041'],['#FCE4D6','#712B13'],['#FAEEDA','#633806'],
  ['#FBEAF0','#72243E'],['#E6F1FB','#0C447C'],['#EAF3DE','#27500A'],['#FAECE7','#4A1B0C'],
];
const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MONTHS_S = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const WDAYS = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const WDAYS_S = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];

// ---------- date helpers (always LOCAL, never toISOString) ----------
const pad = (n) => String(n).padStart(2,'0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const today = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate()+n); return ymd(d); };
const fmtD = (s) => { if(!s) return ''; const d = parse(s); return `${d.getDate()} ${MONTHS_S[d.getMonth()]} ${d.getFullYear()}`; };
const fmtDL = (s) => { const d = parse(s); return `${WDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };
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
function modal({title, body, okText='OK', cancelText='Annulla', danger=false, input=null}) {
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
const confirm = (title, body, okText='Conferma', danger=false) => modal({title, body, okText, danger});
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Copiato', 'ok'); } catch { toast('Copia manuale: ' + t); } }
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
  if (/Invalid login credentials/i.test(m)) return 'Username o password errati';
  if (/banned/i.test(m)) return 'Account disattivato. Contatta un amministratore.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Connessione assente o progetto Supabase in pausa';
  return m;
}

// ============================================================
//  AUTH
// ============================================================
async function boot() {
  overlay(true, 'Caricamento...');
  if (!CFG.SUPABASE_URL || /YOUR-/.test(CFG.SUPABASE_URL) || /YOUR-/.test(CFG.SUPABASE_ANON_KEY || '')) {
    overlay(false); showLogin();
    const e = $('login-err'); e.hidden = false;
    e.textContent = 'Configurazione mancante: inserisci SUPABASE_URL e SUPABASE_ANON_KEY in config.js';
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
  loginClock();
  setTimeout(() => $('login-user').focus(), 50);
}
function loginClock() {
  const g = $('login-greet'); if (!g) return;
  const d = new Date(), h = d.getHours();
  g.textContent = (h < 5 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera') + '.';
  $('login-date').textContent = `${WDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  $('login-clock').textContent = `${pad(h)}:${pad(d.getMinutes())}`;
}
setInterval(loginClock, 15000);

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
$('btn-logout').addEventListener('click', async () => { overlay(true, 'Uscita...'); await sb.auth.signOut(); overlay(false); showLogin(); });

async function enterApp() {
  overlay(true, 'Caricamento dati...');
  try {
    const { data: { user } } = await sb.auth.getUser();
    const { data: me, error } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (error || !me) throw new Error('Profilo non trovato. Contatta un amministratore.');
    if (!me.active) { await sb.auth.signOut(); throw new Error('Account disattivato. Contatta un amministratore.'); }
    S.me = me; S.isAdmin = me.role === 'admin';
    await Promise.all([loadProfiles(), loadProjects()]);
    // header
    $('me-av').outerHTML = avatarHtml(me).replace('class="av"', 'class="av" id="me-av"');
    $('me-name').textContent = me.full_name; $('me-role').textContent = S.isAdmin ? 'Amministratore' : 'Staff';
    $('nav-admin').hidden = !S.isAdmin;
    $('d-scope').hidden = !S.isAdmin; $('c-person').hidden = !S.isAdmin; $('team-card').hidden = !S.isAdmin;
    $('u-prefix').textContent = CFG.DEFAULT_PASSWORD_PREFIX || '';
    S.scope = S.isAdmin ? '' : me.id; S.cperson = me.id;
    S.dy = new Date().getFullYear(); S.dm = new Date().getMonth(); S.cdate = today();
    buildScopeSelects();
    $('v-login').hidden = true; $('v-app').hidden = false;
    await goPage('dash');
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
const profById = (id) => S.profiles.find(p => p.id === id) || { full_name: '—', username: '?', color_bg: '#F1EFE8', color_tx: '#444' };
const projById = (id) => S.projects.find(p => p.id === id);
const activeProjects = () => S.projects.filter(p => p.active);
const activeProfiles = () => S.profiles.filter(p => p.active);
const projLabel = (p) => p.group_name && p.group_name !== p.name ? `${p.group_name} · ${p.name}` : p.name;

function buildScopeSelects() {
  const opts = `<option value="">Tutto il team</option>` + activeProfiles().map(p => `<option value="${p.id}">${esc(p.full_name)}</option>`).join('');
  $('d-scope').innerHTML = opts; $('d-scope').value = S.scope;
  $('c-person').innerHTML = activeProfiles().map(p => `<option value="${p.id}">${esc(p.full_name)}${p.id===S.me.id?' (io)':''}</option>`).join('');
  $('c-person').value = S.cperson;
}

// ============================================================
//  NAVIGATION
// ============================================================
$('nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-page]'); if (b) goPage(b.dataset.page); });
async function goPage(p) {
  if (p === 'admin' && !S.isAdmin) return;
  if (p !== 'clock' && isDirty() && !(await confirm('Modifiche non salvate', 'Hai ore non salvate. Vuoi uscire senza salvare?', 'Esci senza salvare', true))) return;
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.page === p));
  document.querySelectorAll('.page').forEach(s => s.classList.toggle('active', s.id === 'p-' + p));
  window.scrollTo({ top: 0 });
  if (p === 'dash') await renderDash();
  if (p === 'clock') await loadClock();
  if (p === 'admin') await renderAdmin();
}

// ============================================================
//  DASHBOARD
// ============================================================
$('m-prev').onclick = () => { S.dm--; if (S.dm < 0) { S.dm = 11; S.dy--; } renderDash(); };
$('m-next').onclick = () => { S.dm++; if (S.dm > 11) { S.dm = 0; S.dy++; } renderDash(); };
$('m-today').onclick = () => { S.dy = new Date().getFullYear(); S.dm = new Date().getMonth(); renderDash(); };
$('d-scope').onchange = (e) => { S.scope = e.target.value; renderDash(); };
$('d-csv').onclick = () => exportCsv(...monthRange(S.dy, S.dm).slice(0,2), 'wide', S.scope || null);

async function fetchEntries(from, to, userId) {
  let q = sb.from('time_entries').select('id,user_id,project_id,entry_date,hours').gte('entry_date', from).lte('entry_date', to).order('entry_date');
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q;
  if (error) { toast(errMsg(error), 'err'); return []; }
  return (data || []).map(r => ({ ...r, hours: Number(r.hours) }));
}

async function renderDash() {
  const [from, to, ndays] = monthRange(S.dy, S.dm);
  $('m-label').textContent = `${MONTHS[S.dm]} ${S.dy}`;
  const userId = S.isAdmin ? (S.scope || null) : S.me.id;
  const rows = await fetchEntries(from, to, userId);
  const teamScope = S.isAdmin && !S.scope;
  const who = teamScope ? 'del team' : (userId === S.me.id ? 'tue' : 'di ' + profById(userId).full_name.split(' ')[0]);

  // ---- KPIs
  const total = rows.reduce((a, r) => a + r.hours, 0);
  const days = new Set(rows.map(r => r.entry_date)).size;
  const people = new Set(rows.map(r => r.user_id)).size;
  const personDays = new Set(rows.map(r => r.user_id + r.entry_date)).size;
  const isCur = S.dy === new Date().getFullYear() && S.dm === new Date().getMonth();
  const wk = mondayOf(today()); const wkEnd = addDays(wk, 6);
  const weekHrs = rows.filter(r => r.entry_date >= wk && r.entry_date <= wkEnd).reduce((a, r) => a + r.hours, 0);
  const kp = [];
  kp.push({ k: 'Ore ' + (teamScope ? 'team' : 'nel mese'), v: fnum(total), u: 'h', d: `${MONTHS[S.dm]} ${S.dy}` });
  if (teamScope) {
    kp.push({ k: 'Persone attive', v: people, d: `su ${activeProfiles().length} nel team` });
    kp.push({ k: 'Media / persona', v: people ? fnum(total / people) : 0, u: 'h', d: 'nel mese' });
    kp.push({ k: 'Media / giorno', v: personDays ? fnum(total / personDays) : 0, u: 'h', d: 'per persona-giorno' });
  } else {
    kp.push({ k: 'Giorni registrati', v: days, d: `su ${ndays} del mese` });
    kp.push({ k: 'Media / giorno', v: days ? fnum(total / days) : 0, u: 'h', d: 'nei giorni registrati' });
    if (isCur) kp.push({ k: 'Questa settimana', v: fnum(weekHrs), u: 'h', d: `da ${fmtD(wk)}` });
  }
  $('kpis').innerHTML = kp.map(x => `<div class="kpi"><div class="k">${esc(x.k)}</div><div class="v">${esc(x.v)}${x.u ? `<small>${x.u}</small>` : ''}</div><div class="d">${esc(x.d)}</div></div>`).join('');

  // ---- chart: hours per day
  const perDay = new Array(ndays).fill(0);
  rows.forEach(r => { perDay[parse(r.entry_date).getDate() - 1] += r.hours; });
  $('c1-title').textContent = 'Ore per giorno' + (teamScope ? ' (team)' : '');
  drawDaysChart(perDay, ndays);

  // ---- bars: hours per project
  const byP = {};
  rows.forEach(r => { byP[r.project_id] = (byP[r.project_id] || 0) + r.hours; });
  const prow = Object.entries(byP).map(([id, h]) => ({ p: projById(id) || { name: '(eliminato)', group_name: '', color: '#999' }, h })).sort((a, b) => b.h - a.h);
  const max = prow.length ? prow[0].h : 1;
  $('proj-bars').innerHTML = prow.length ? `<div class="bars">${prow.map(({ p, h }) => `
    <div class="bar" title="${esc(projLabel(p))}: ${fh(h)}">
      <div class="n"><i style="background:${esc(p.color)}"></i><span>${p.group_name && p.group_name !== p.name ? `<span class="sub">${esc(p.group_name)} · </span>` : ''}${esc(p.name)}</span></div>
      <div class="t"><b style="width:${Math.max(2, h / max * 100)}%;background:${esc(p.color)}"></b></div>
      <div class="v">${fh(h)}<small>${total ? Math.round(h / total * 100) : 0}%</small></div>
    </div>`).join('')}</div>` : `<div class="empty"><i class="ti ti-chart-bar-off"></i>Nessuna ora nel mese</div>`;

  // ---- team table (admin, team scope)
  $('team-card').hidden = !teamScope;
  if (teamScope) {
    const byU = {};
    rows.forEach(r => { const u = byU[r.user_id] ||= { h: 0, days: new Set(), byP: {} }; u.h += r.hours; u.days.add(r.entry_date); u.byP[r.project_id] = (u.byP[r.project_id] || 0) + r.hours; });
    const trs = activeProfiles().map(p => ({ p, s: byU[p.id] || { h: 0, days: new Set(), byP: {} } })).sort((a, b) => b.s.h - a.s.h);
    $('team-hint').textContent = `${MONTHS[S.dm]} ${S.dy}`;
    $('team-table').innerHTML = `<div class="twrap"><table><thead><tr><th>Persona</th><th class="num">Ore</th><th class="num">Giorni</th><th class="num">Media/gg</th><th>Progetto principale</th><th></th></tr></thead><tbody>${trs.map(({ p, s }) => {
      const top = Object.entries(s.byP).sort((a, b) => b[1] - a[1])[0];
      const tp = top ? projById(top[0]) : null;
      return `<tr><td><span style="display:inline-flex;align-items:center;gap:8px">${avatarHtml(p, true)}${esc(p.full_name)}</span></td>
        <td class="num b">${s.h ? fh(s.h) : '<span class="mute">—</span>'}</td><td class="num">${s.days.size || '—'}</td><td class="num mute">${s.days.size ? fh(s.h / s.days.size) : '—'}</td>
        <td>${tp ? `<span class="badge grp" style="--c:${esc(tp.color)}">${esc(projLabel(tp))}</span>` : '<span class="mute">—</span>'}</td>
        <td class="actions"><button class="btn sm" data-scope="${p.id}">Dettaglio</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
    $('team-table').querySelectorAll('[data-scope]').forEach(b => b.onclick = () => { S.scope = b.dataset.scope; $('d-scope').value = S.scope; renderDash(); });
  }

  // ---- log
  const byUD = {};
  rows.forEach(r => { const k = r.user_id + '|' + r.entry_date; (byUD[k] ||= { user_id: r.user_id, date: r.entry_date, items: [], tot: 0 }); byUD[k].items.push(r); byUD[k].tot += r.hours; });
  const logs = Object.values(byUD).sort((a, b) => b.date.localeCompare(a.date) || profById(a.user_id).full_name.localeCompare(profById(b.user_id).full_name));
  $('log-hint').textContent = logs.length ? `${logs.length} giornate · ore ${who}` : '';
  $('log-table').innerHTML = logs.length ? `<div class="twrap"><table><thead><tr><th>Data</th>${teamScope ? '<th>Chi</th>' : ''}<th>Progetti</th><th class="num">Tot</th><th></th></tr></thead><tbody>${logs.map(l => {
    const p = profById(l.user_id);
    const badges = l.items.sort((a, b) => b.hours - a.hours).map(r => { const pr = projById(r.project_id) || { name: '?', color: '#999' }; return `<span class="badge grp" style="--c:${esc(pr.color)};margin:2px 3px 2px 0">${esc(pr.name)} ${fh(r.hours)}</span>`; }).join('');
    return `<tr><td style="white-space:nowrap;color:var(--tm);font-size:12px">${esc(fmtD(l.date))}</td>${teamScope ? `<td><span style="display:inline-flex;align-items:center;gap:6px">${avatarHtml(p, true)}${esc(p.full_name)}</span></td>` : ''}<td>${badges}</td><td class="num b">${fh(l.tot)}</td>
      <td class="actions"><button class="iconbtn" title="Modifica" data-edit="${l.user_id}|${l.date}"><i class="ti ti-pencil"></i></button></td></tr>`;
  }).join('')}</tbody></table></div>` : `<div class="empty"><i class="ti ti-clock-off"></i>Nessuna ora registrata in ${MONTHS[S.dm]} ${S.dy}</div>`;
  $('log-table').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => { const [u, d] = b.dataset.edit.split('|'); S.cperson = u; S.cdate = d; goPage('clock'); });
}

function drawDaysChart(perDay, ndays) {
  const ctx = $('chart-days').getContext('2d');
  if (S.chart) { S.chart.destroy(); S.chart = null; }
  const labels = Array.from({ length: ndays }, (_, i) => i + 1);
  const todayD = new Date(); const isCur = S.dy === todayD.getFullYear() && S.dm === todayD.getMonth();
  const weekend = labels.map(d => { const w = new Date(S.dy, S.dm, d).getDay(); return w === 0 || w === 6; });
  S.chart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Ore', data: perDay, backgroundColor: weekend.map(w => w ? '#C4BAF8' : BRAND), borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 22, hoverBackgroundColor: '#3C3489' }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
      plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { title: (it) => fmtDL(`${S.dy}-${pad(S.dm + 1)}-${pad(it[0].label)}`), label: (it) => ' ' + fh(it.raw) } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9C9CB0', font: { size: 11 }, autoSkip: true, maxTicksLimit: 16 }, border: { color: '#E5E4E8' } },
        y: { beginAtZero: true, grid: { color: '#F0EFF5' }, border: { display: false }, ticks: { color: '#9C9CB0', font: { size: 11 }, callback: (v) => v + 'h', maxTicksLimit: 5 } }
      }
    }
  });
  if (isCur) { /* today marker via bar colour */ const d = todayD.getDate() - 1; S.chart.data.datasets[0].backgroundColor[d] = perDay[d] > 0 ? BRAND : '#E5E4E8'; S.chart.update(); }
}

// ============================================================
//  CLOCKING
// ============================================================
$('c-date').onchange = (e) => { if (e.target.value) switchDay(e.target.value); };
$('d-prev').onclick = () => switchDay(addDays(S.cdate, -1));
$('d-next').onclick = () => switchDay(addDays(S.cdate, 1));
$('d-today').onclick = () => switchDay(today());
$('c-person').onchange = async (e) => { if (isDirty() && !(await confirm('Modifiche non salvate', 'Cambiare persona senza salvare?', 'Continua', true))) { e.target.value = S.cperson; return; } S.cperson = e.target.value; loadClock(); };
$('btn-save').onclick = saveClock;
$('btn-reset').onclick = () => { S.hrs = { ...S.orig }; renderRows(); };

async function switchDay(d) {
  if (isDirty() && !(await confirm('Modifiche non salvate', 'Cambiare giorno senza salvare?', 'Continua', true))) { $('c-date').value = S.cdate; return; }
  S.cdate = d; loadClock();
}
function isDirty() {
  const ids = new Set([...Object.keys(S.hrs), ...Object.keys(S.orig)]);
  for (const id of ids) if ((S.hrs[id] || 0) !== (S.orig[id] || 0)) return true;
  return false;
}

async function loadClock() {
  $('c-date').value = S.cdate; $('c-daylabel').textContent = fmtDL(S.cdate);
  if (S.isAdmin) $('c-person').value = S.cperson;
  const wk = mondayOf(S.cdate);
  const rows = await fetchEntries(wk, addDays(wk, 6), S.cperson);
  S.week = {}; S.orig = {};
  rows.forEach(r => { S.week[r.entry_date] = (S.week[r.entry_date] || 0) + r.hours; if (r.entry_date === S.cdate) S.orig[r.project_id] = r.hours; });
  S.hrs = { ...S.orig };
  // week strip
  $('week').innerHTML = Array.from({ length: 7 }, (_, i) => { const d = addDays(wk, i); const dd = parse(d); const h = S.week[d] || 0; const we = dd.getDay() === 0 || dd.getDay() === 6;
    return `<div class="wd${d === S.cdate ? ' sel' : ''}${d === today() ? ' today' : ''}${we ? ' wknd' : ''}" data-d="${d}"><div class="dn">${WDAYS_S[dd.getDay()]}</div><div class="dd">${dd.getDate()}</div><div class="dh${h ? ' on' : ''}">${h ? fh(h) : '·'}</div></div>`; }).join('');
  $('week').querySelectorAll('.wd').forEach(el => el.onclick = () => switchDay(el.dataset.d));
  renderRows();
}

function renderRows() {
  // projects: active ones + any archived project that has hours on this day
  const list = S.projects.filter(p => p.active || (S.orig[p.id] || 0) > 0);
  const groups = [];
  list.forEach(p => { let g = groups.find(x => x.name === p.group_name); if (!g) { g = { name: p.group_name, color: p.color, items: [] }; groups.push(g); } g.items.push(p); });
  $('plist').innerHTML = groups.length ? groups.map(g => `<div class="pgroup"><div class="gh"><i style="background:${esc(g.color)}"></i>${esc(g.name)}</div>${g.items.map(p => {
    const h = S.hrs[p.id] || 0; const single = g.items.length === 1 && p.name === g.name;
    return `<div class="prow${h > 0 ? ' on' : ''}" id="row-${p.id}"><span class="pn">${single ? esc(p.name) : esc(p.name)}${p.active ? '' : ' <span class="badge off">archiviato</span>'}</span>
      <div class="hc"><button class="hbtn" data-ch="${p.id}|-0.5" title="-30 min">−</button><input class="hval${h > 0 ? ' on' : ''}" id="hv-${p.id}" type="number" inputmode="decimal" min="0" max="24" step="0.25" value="${fnum(h)}" data-id="${p.id}"><button class="hbtn" data-ch="${p.id}|0.5" title="+30 min">+</button></div></div>`;
  }).join('')}</div>`).join('') : `<div class="empty"><i class="ti ti-folder-off"></i>Nessun progetto attivo. Un admin può aggiungerli in Admin → Progetti.</div>`;
  $('plist').querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { const [id, d] = b.dataset.ch.split('|'); setH(id, (S.hrs[id] || 0) + Number(d)); });
  $('plist').querySelectorAll('.hval').forEach(i => { i.onchange = () => setH(i.dataset.id, parseFloat(i.value.replace(',', '.'))); i.onfocus = () => i.select(); });
  updTot();
}
function setH(id, v) {
  v = isNaN(v) ? 0 : Math.round(v * 4) / 4; v = Math.max(0, Math.min(24, v));
  S.hrs[id] = v;
  const i = $('hv-' + id); if (i) { i.value = fnum(v); i.classList.toggle('on', v > 0); }
  const r = $('row-' + id); if (r) r.classList.toggle('on', v > 0);
  updTot();
}
function updTot() {
  const t = Object.values(S.hrs).reduce((a, b) => a + b, 0);
  const el = $('totval'); el.textContent = fh(t); el.classList.toggle('warn', t > 24);
  const st = $('save-status'); const dirty = isDirty();
  st.textContent = t > 24 ? 'Massimo 24 ore al giorno' : dirty ? 'Modifiche non salvate' : (Object.keys(S.orig).length ? 'Salvato' : '');
  st.className = 'status' + (dirty || t > 24 ? ' dirty' : '');
  $('btn-save').disabled = !dirty || t > 24; $('btn-reset').disabled = !dirty;
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
    const t = Object.values(S.hrs).reduce((a, b) => a + b, 0);
    toast(`${fh(t)} salvate per ${fmtD(S.cdate)}`, 'ok');
    await loadClock();
  } catch (e) { toast(errMsg(e), 'err'); btn.disabled = false; }
}

// ============================================================
//  ADMIN
// ============================================================
document.querySelectorAll('[data-atab]').forEach(b => b.onclick = () => {
  document.querySelectorAll('[data-atab]').forEach(x => x.classList.toggle('active', x === b));
  ['users', 'projects', 'export'].forEach(t => $('a-' + t).hidden = t !== b.dataset.atab);
});
async function renderAdmin() {
  await Promise.all([loadProfiles(), loadProjects()]);
  buildScopeSelects();
  renderUsers(); renderProjects();
  if (!$('x-from').value) { const [f, t] = monthRange(new Date().getFullYear(), new Date().getMonth()); $('x-from').value = f; $('x-to').value = t; }
}
async function adminFn(payload) {
  const { data, error } = await sb.functions.invoke('admin-users', { body: payload });
  if (error) {
    // try to surface the function's own message
    let msg = error.message;
    try { const ctx = error.context; if (ctx && typeof ctx.json === 'function') { const j = await ctx.json(); if (j && j.error) msg = j.error; } } catch {}
    if (/Failed to send a request|Failed to fetch/i.test(msg)) msg = 'Edge Function "admin-users" non raggiungibile: è stata deployata?';
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

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
  if (!full_name || !username || !password) return toast('Compila nome, username e password', 'err');
  if (password.length < 6) return toast('Password: minimo 6 caratteri', 'err');
  if (S.profiles.find(p => p.username === username)) return toast('Username già esistente', 'err');
  const [color_bg, color_tx] = AVATAR_COLORS[S.profiles.length % AVATAR_COLORS.length];
  $('u-add').disabled = true; overlay(true, 'Creazione utente...');
  try {
    await adminFn({ action: 'create', username, full_name, password, role, color_bg, color_tx, email_domain: CFG.AUTH_EMAIL_DOMAIN });
    overlay(false);
    await modal({ title: 'Utente creato', body: `Comunica queste credenziali a <b>${esc(full_name)}</b>:</p><div class="copybox"><code>${esc(username)}</code><button class="btn sm" onclick="navigator.clipboard.writeText('${esc(username)}')">Copia</button></div><div class="copybox"><code>${esc(password)}</code><button class="btn sm" onclick="navigator.clipboard.writeText('${esc(password).replace(/'/g, "\\'")}')">Copia</button></div><p>`, okText: 'Fatto', cancelText: '' });
    $('u-full').value = ''; $('u-user').value = ''; $('u-pass').value = ''; $('u-role').value = 'member';
    await renderAdmin(); toast(`${full_name} aggiunto`, 'ok');
  } catch (e) { overlay(false); toast(errMsg(e), 'err'); }
  $('u-add').disabled = false;
};
function renderUsers() {
  const list = [...S.profiles].sort((a, b) => (b.active - a.active) || a.full_name.localeCompare(b.full_name));
  $('users-hint').textContent = `${activeProfiles().length} attivi · ${S.profiles.length - activeProfiles().length} disattivati`;
  $('users-table').innerHTML = `<div class="twrap"><table><thead><tr><th>Persona</th><th>Username</th><th>Ruolo</th><th>Stato</th><th></th></tr></thead><tbody>${list.map(p => `<tr style="${p.active ? '' : 'opacity:.6'}">
    <td><span style="display:inline-flex;align-items:center;gap:8px">${avatarHtml(p, true)}${esc(p.full_name)}${p.id === S.me.id ? ' <span class="hint">(io)</span>' : ''}</span></td>
    <td class="pw">${esc(p.username)}</td>
    <td><span class="badge ${p.role}">${p.role === 'admin' ? 'Admin' : 'Staff'}</span></td>
    <td><span class="badge ${p.active ? 'on' : 'off'}">${p.active ? 'Attivo' : 'Disattivato'}</span></td>
    <td class="actions">
      <button class="iconbtn" title="Reimposta password" data-act="pw" data-id="${p.id}"><i class="ti ti-key"></i></button>
      <button class="iconbtn" title="${p.role === 'admin' ? 'Rendi staff' : 'Rendi admin'}" data-act="role" data-id="${p.id}" ${p.id === S.me.id ? 'disabled' : ''}><i class="ti ${p.role === 'admin' ? 'ti-user-down' : 'ti-user-up'}"></i></button>
      <button class="iconbtn" title="${p.active ? 'Disattiva' : 'Riattiva'}" data-act="active" data-id="${p.id}" ${p.id === S.me.id ? 'disabled' : ''}><i class="ti ${p.active ? 'ti-user-off' : 'ti-user-check'}"></i></button>
      <button class="iconbtn danger" title="Elimina" data-act="del" data-id="${p.id}" ${p.id === S.me.id ? 'disabled' : ''}><i class="ti ti-trash"></i></button>
    </td></tr>`).join('')}</tbody></table></div>`;
  $('users-table').querySelectorAll('[data-act]').forEach(b => b.onclick = () => userAction(b.dataset.act, b.dataset.id));
}
async function userAction(act, id) {
  const p = profById(id);
  try {
    if (act === 'pw') {
      const sug = suggestCreds(p.full_name).password;
      const pw = await modal({ title: `Nuova password per ${p.full_name}`, body: 'La password attuale verrà sostituita. Comunica quella nuova alla persona.', okText: 'Reimposta', input: { label: 'Nuova password', value: sug, mono: true } });
      if (pw === null) return; if (pw.length < 6) return toast('Minimo 6 caratteri', 'err');
      overlay(true, 'Aggiornamento...'); await adminFn({ action: 'reset_password', user_id: id, password: pw }); overlay(false);
      await modal({ title: 'Password aggiornata', body: `<div class="copybox"><code>${esc(pw)}</code><button class="btn sm" onclick="navigator.clipboard.writeText('${esc(pw).replace(/'/g, "\\'")}')">Copia</button></div>`, okText: 'Fatto', cancelText: '' });
    } else if (act === 'role') {
      const role = p.role === 'admin' ? 'member' : 'admin';
      if (!(await confirm('Cambia ruolo', `${esc(p.full_name)} diventerà <b>${role === 'admin' ? 'Admin' : 'Staff'}</b>.`))) return;
      overlay(true, 'Aggiornamento...'); await adminFn({ action: 'set_role', user_id: id, role }); overlay(false); toast('Ruolo aggiornato', 'ok');
    } else if (act === 'active') {
      const active = !p.active;
      if (!(await confirm(active ? 'Riattiva utente' : 'Disattiva utente', active ? `${esc(p.full_name)} potrà di nuovo accedere.` : `${esc(p.full_name)} non potrà più accedere. Le ore registrate restano nei report.`, active ? 'Riattiva' : 'Disattiva', !active))) return;
      overlay(true, 'Aggiornamento...'); await adminFn({ action: 'set_active', user_id: id, active }); overlay(false); toast(active ? 'Utente riattivato' : 'Utente disattivato', 'ok');
    } else if (act === 'del') {
      if (!(await confirm('Elimina utente', `Eliminare <b>${esc(p.full_name)}</b>? <b>Tutte le sue ore verranno cancellate</b>. Se vuoi conservare lo storico, usa "Disattiva".`, 'Elimina definitivamente', true))) return;
      overlay(true, 'Eliminazione...'); await adminFn({ action: 'delete', user_id: id }); overlay(false); toast('Utente eliminato', 'ok');
    }
    await renderAdmin();
  } catch (e) { overlay(false); toast(errMsg(e), 'err'); }
}

// ---- projects
$('pj-color').innerHTML = GROUP_COLORS.map(([c, n]) => `<option value="${c}">${n}</option>`).join('');
$('pj-group').addEventListener('input', () => {
  const g = $('pj-group').value.trim(); const ex = S.projects.find(p => p.group_name.toLowerCase() === g.toLowerCase());
  if (ex) { $('pj-color').value = ex.color; $('pj-color').disabled = true; } else { $('pj-color').disabled = false; }
});
$('pj-showarch').onchange = (e) => { S.showArchived = e.target.checked; renderProjects(); };
$('pj-add').onclick = async () => {
  const name = $('pj-name').value.trim(); const group_name = $('pj-group').value.trim() || name;
  if (!name) return toast('Inserisci il nome del progetto', 'err');
  const ex = S.projects.find(p => p.group_name.toLowerCase() === group_name.toLowerCase());
  const color = ex ? ex.color : $('pj-color').value;
  if (S.projects.find(p => p.name.toLowerCase() === name.toLowerCase() && p.group_name.toLowerCase() === group_name.toLowerCase())) return toast('Progetto già esistente', 'err');
  const sort_order = Math.max(0, ...S.projects.map(p => p.sort_order)) + 10;
  const { error } = await sb.from('projects').insert({ name, group_name: ex ? ex.group_name : group_name, color, sort_order });
  if (error) return toast(errMsg(error), 'err');
  $('pj-name').value = ''; $('pj-group').value = ''; $('pj-color').disabled = false;
  await loadProjects(); renderProjects(); toast('Progetto aggiunto', 'ok');
};
function renderProjects() {
  $('group-list').innerHTML = [...new Set(S.projects.map(p => p.group_name))].map(g => `<option value="${esc(g)}">`).join('');
  const list = S.projects.filter(p => p.active || S.showArchived);
  $('projects-table').innerHTML = list.length ? `<div class="twrap"><table><thead><tr><th>Gruppo</th><th>Progetto</th><th>Stato</th><th></th></tr></thead><tbody>${list.map(p => `<tr style="${p.active ? '' : 'opacity:.6'}">
    <td><span class="badge grp" style="--c:${esc(p.color)}">${esc(p.group_name)}</span></td>
    <td class="b">${esc(p.name)}</td>
    <td><span class="badge ${p.active ? 'on' : 'off'}">${p.active ? 'Attivo' : 'Archiviato'}</span></td>
    <td class="actions">
      <button class="iconbtn" title="Rinomina" data-pact="ren" data-id="${p.id}"><i class="ti ti-pencil"></i></button>
      <button class="iconbtn" title="Cambia colore gruppo" data-pact="col" data-id="${p.id}"><i class="ti ti-palette"></i></button>
      <button class="iconbtn" title="${p.active ? 'Archivia' : 'Ripristina'}" data-pact="arch" data-id="${p.id}"><i class="ti ${p.active ? 'ti-archive' : 'ti-archive-off'}"></i></button>
      <button class="iconbtn danger" title="Elimina" data-pact="del" data-id="${p.id}"><i class="ti ti-trash"></i></button>
    </td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><i class="ti ti-folder-off"></i>Nessun progetto</div>`;
  $('projects-table').querySelectorAll('[data-pact]').forEach(b => b.onclick = () => projectAction(b.dataset.pact, b.dataset.id));
}
async function projectAction(act, id) {
  const p = projById(id);
  try {
    if (act === 'ren') {
      const name = await modal({ title: 'Rinomina progetto', okText: 'Salva', input: { label: 'Nome', value: p.name } });
      if (name === null || !name.trim()) return;
      const { error } = await sb.from('projects').update({ name: name.trim() }).eq('id', id); if (error) throw error;
    } else if (act === 'col') {
      const idx = GROUP_COLORS.findIndex(([c]) => c === p.color);
      const next = GROUP_COLORS[(idx + 1) % GROUP_COLORS.length][0];
      const { error } = await sb.from('projects').update({ color: next }).eq('group_name', p.group_name); if (error) throw error;
      toast(`Colore gruppo ${p.group_name}: ${GROUP_COLORS.find(([c]) => c === next)[1]}`);
    } else if (act === 'arch') {
      const { error } = await sb.from('projects').update({ active: !p.active }).eq('id', id); if (error) throw error;
      toast(p.active ? 'Progetto archiviato' : 'Progetto ripristinato', 'ok');
    } else if (act === 'del') {
      if (!(await confirm('Elimina progetto', `Eliminare <b>${esc(p.name)}</b>? Possibile solo se non ha ore registrate; altrimenti usa "Archivia".`, 'Elimina', true))) return;
      const { error } = await sb.from('projects').delete().eq('id', id);
      if (error) { if (/foreign key|violates/i.test(error.message)) throw new Error('Il progetto ha ore registrate: usa "Archivia"'); throw error; }
      toast('Progetto eliminato', 'ok');
    }
    await loadProjects(); renderProjects();
  } catch (e) { toast(errMsg(e), 'err'); }
}

// ---- export
$('x-go').onclick = () => { const f = $('x-from').value, t = $('x-to').value; if (!f || !t || f > t) return toast('Controlla le date', 'err'); exportCsv(f, t, $('x-fmt').value, null); };
async function exportCsv(from, to, fmt, userId) {
  overlay(true, 'Preparazione CSV...');
  const rows = await fetchEntries(from, to, userId);
  overlay(false);
  if (!rows.length) return toast('Nessuna ora nel periodo', 'err');
  const out = [];
  if (fmt === 'long') {
    out.push(['Data', 'Username', 'Persona', 'Gruppo', 'Progetto', 'Ore']);
    rows.sort((a, b) => a.entry_date.localeCompare(b.entry_date)).forEach(r => { const p = profById(r.user_id), pr = projById(r.project_id) || { group_name: '', name: '?' }; out.push([r.entry_date, p.username, p.full_name, pr.group_name, pr.name, fnum(r.hours)]); });
  } else {
    const cols = S.projects.filter(p => p.active || rows.some(r => r.project_id === p.id));
    out.push(['Data', 'Persona', ...cols.map(projLabel), 'Totale']);
    const byUD = {};
    rows.forEach(r => { const k = r.entry_date + '|' + r.user_id; (byUD[k] ||= { d: r.entry_date, u: r.user_id, h: {} }); byUD[k].h[r.project_id] = (byUD[k].h[r.project_id] || 0) + r.hours; });
    Object.values(byUD).sort((a, b) => a.d.localeCompare(b.d) || profById(a.u).full_name.localeCompare(profById(b.u).full_name)).forEach(x => { const tot = Object.values(x.h).reduce((a, b) => a + b, 0); out.push([x.d, profById(x.u).full_name, ...cols.map(c => fnum(x.h[c.id] || 0)), fnum(tot)]); });
  }
  downloadCsv(out, `one_tech_ore_${from}_${to}.csv`);
}

// ============================================================
window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
boot();
})();
