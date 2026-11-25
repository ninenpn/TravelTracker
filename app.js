'use strict';
/* Travel Tracker — static mobile app. Data lives in Google Sheets; edits are saved back through an optional Apps Script web app. */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = ['#2f7bff', '#ff6b6b', '#12b886', '#ffb020', '#9b6bff', '#ff6bb5', '#22c55e', '#10c6d8'];
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DEFAULT_TRIP = { id: '1PW6xAogCla1lhb4wMwhOQeo2d8g_OXmaRONo1OMSlOw', name: 'Almaty Trip', planGid: '101963523', usersTab: 'Users', expensesTab: 'Expenses', locationsTab: 'Locations', placesTab: 'Places', costTab: 'ค่าใช้จ่าย', extraTabs: '', currency: 'THB' };
/* Extra trips live in Supabase tables the public key cannot read; any member who is signed in with a verified PIN may open them (checked on the server) */
const PRIV = { usersTab: 'Users', expensesTab: 'Expenses', locationsTab: 'Locations', placesTab: 'Places', costTab: 'Cost', currency: 'THB', priv: true, planGid: 'plan' };
const PRIV_TRIPS = [
  { ...PRIV, id: 'priv:macau', key: 'macau', name: 'Macau Trip', extraTabs: '', start: '2026-07-11', end: '2026-07-14' },
  { ...PRIV, id: 'priv:nagoya', key: 'nagoya', name: 'Nagoya-Osaka Trip', extraTabs: 'Transport Price,JCB-Transport', start: '2025-12-05', end: '2025-12-11' },
  { ...PRIV, id: 'priv:kunming', key: 'kunming', name: 'Kunming-Lijiang Trip', extraTabs: 'Chinese Language', start: '2024-12-20', end: '2024-12-24' },
  { ...PRIV, id: 'priv:xian', key: 'xian', name: "Xi'an Trip", extraTabs: 'Xian OJC Holiday,Chinese Language,ภาษาจีน', start: '2025-04-30', end: '2025-05-04' }
];
const OLD_PRESETS = ['10SWKXgZ1Tw1YUhZGYkrLdNv_99DYBk9N', '18xlP9LoISk-_Gy3Y0ATXkQM0lWElkvh3', '1ec6Jq7HhUSjsyC50sjyLoFvw-gNXS9gN', '1Lii3MIGLVncBMjXrVBAKZDfxHORD222Z'];

/* ---------- icons: one inline-SVG set (stroke, currentColor, 1.75, round caps); ic(name) returns decorative markup ---------- */
const ICONS = {
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  car: '<path d="M5 17H3v-4l2-5h14l2 5v4h-2M5 13h14"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/><path d="M9.5 17h5"/>',
  train: '<rect x="4" y="3" width="16" height="16" rx="3"/><path d="M4 11h16M12 3v8M8 19l-2 3M16 19l2 3"/><circle cx="8" cy="15" r=".6"/><circle cx="16" cy="15" r=".6"/>',
  bus: '<path d="M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11zM4 11h16M4 17v2M20 17v2"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/>',
  walk: '<circle cx="13" cy="4.5" r="1.7"/><path d="M8 21l3-7 3 2v5M11 14l-1-5 5-1 2 4M10 9l-3 3"/>',
  ship: '<path d="M3 17l1.5 3h15L21 17zM5 17l-1-5 8-3 8 3-1 5M12 9V3h4"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  note: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  ticket: '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M14 6v12"/>',
  warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>',
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  bellOff: '<path d="M6 16v-5a6 6 0 0 1 9-5.2M18 11v5l2 2H4M10 21h4M4 4l16 16"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/>',
  food: '<path d="M6 3v7a2 2 0 0 0 4 0V3M8 3v18M17 21V3c-2 2-3 5-3 8h3"/>',
  sight: '<path d="M3 21h18M5 21V10M9 21V10M15 21V10M19 21V10M2 10l10-7 10 7z"/>',
  cafe: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M7 2v3M11 2v3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  spark: '<path d="M12 3l2 5.5 5.5 2-5.5 2L12 18l-2-5.5-5.5-2L10 8.5z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5"/>',
  locate: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  passport: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 17h6"/>',
  bed: '<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6"/><circle cx="7" cy="11.5" r="1.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 1 5-3l-2.5 2.5.8 2.4 2.4.8 2.5-2.5a4 4 0 0 1-5 5L7 22l-4-4z"/>',
  signal: '<path d="M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0"/><circle cx="12" cy="19" r="1"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'
};
const ic = (n, cls = '') => `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[n] || ''}</svg>`;

/* static markup in index.html: <i data-ic="name"> placeholders are filled from the same icon set */
document.querySelectorAll('[data-ic]').forEach(e => { e.outerHTML = ic(e.dataset.ic, e.dataset.cls || ''); });

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
};
const sess = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { } }
};
let cfg = store.get('tt.cfg', null) || { trips: [DEFAULT_TRIP], active: DEFAULT_TRIP.id, lastMe: '' };
if (cfg.v !== 5) {
  cfg.v = 5;
  cfg.trips = cfg.trips.filter(t => !OLD_PRESETS.includes(t.id) || t.id === cfg.active);
  if (!cfg.trips.some(t => t.id === DEFAULT_TRIP.id)) cfg.trips.unshift(DEFAULT_TRIP);
  cfg.trips.forEach(t => { t.placesTab = t.placesTab || 'Places'; });
  cfg.lastMe = cfg.lastMe || cfg.me || '';
  delete cfg.rates;
}
cfg.trips = cfg.trips.filter(t => !t.priv && !t.id.startsWith('priv:')); cfg.trips.push(...PRIV_TRIPS);
if (cfg.active && cfg.active.startsWith('priv:') && !cfg.trips.some(t => t.id === cfg.active)) cfg.active = DEFAULT_TRIP.id;
const saveCfg = () => store.set('tt.cfg', cfg);
function applyTheme() { const d = cfg.theme === 'dark'; document.documentElement.dataset.theme = d ? 'dark' : 'light'; const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = d ? '#0b1220' : '#f3f8ff'; }
applyTheme();
const trip = () => cfg.trips.find(t => t.id === cfg.active) || cfg.trips[0];
let me = sess.get('tt.me') || '';
const myHash = () => sess.get('tt.ph') || '';
const canSeePriv = t => !!me && !!myHash();
const visibleTrips = () => cfg.trips.filter(t => !t.priv || canSeePriv(t));
/* trip status from its dates: Current (today is inside), Upcoming (starts later), Past (already ended) */
const ymd = x => { const [y, m, d] = x.split('-').map(Number); return new Date(y, m - 1, d); };
const isoD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function tripRange(t) {
  const c = cfg.dates && cfg.dates[t.id], r = c || (t.start ? { s: t.start, e: t.end } : t.id === DEFAULT_TRIP.id ? { s: '2027-02-13', e: '2027-02-18' } : null);
  return r ? { s: ymd(r.s), e: ymd(r.e) } : null;
}
function tripStatus(t) { const r = tripRange(t); if (!r) return 'upcoming'; const n = new Date(); n.setHours(0, 0, 0, 0); return r.e < n ? 'past' : r.s > n ? 'upcoming' : 'current'; }
const STAT = { current: ['Current', 'cur'], upcoming: ['Upcoming', 'up'], past: ['Past', 'past'] };
function tripRangeText(t) {
  const r = tripRange(t); if (!r) return ''; const a = r.s, b = r.e, M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() ? `${a.getDate()}–${b.getDate()} ${M[a.getMonth()]} ${b.getFullYear()}` : `${a.getDate()} ${M[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${M[b.getMonth()]} ${b.getFullYear()}`;
}
/* default view = Current + Upcoming only; Past trips are one tap away */
function tripList(filter) {
  const rank = { current: 0, upcoming: 1, past: 2 }, f = filter || ui.tripFilter || 'now';
  return visibleTrips().filter(t => f === 'all' || (f === 'past' ? tripStatus(t) === 'past' : tripStatus(t) !== 'past'))
    .sort((a, b) => rank[tripStatus(a)] - rank[tripStatus(b)] || (tripStatus(a) === 'past' ? tripRange(b).s - tripRange(a).s : (tripRange(a) && tripRange(b) ? tripRange(a).s - tripRange(b).s : 0)));
}
function tripFilterBar(attr) {
  const vt = visibleTrips(), f = ui.tripFilter || 'now', n = vt.filter(t => tripStatus(t) !== 'past').length, p = vt.length - n;
  return `<div class="chips">${[['now', 'Current + Upcoming', n], ['past', 'Past', p], ['all', 'ทั้งหมด', vt.length]].map(([k, l, c]) => `<button type="button" class="tag ${f === k ? 'on' : ''}" ${attr}="${k}">${l} <small>${c}</small></button>`).join('')}</div>`;
}
function tripItems(attr) {
  const list = tripList(); if (!list.length) return '<div class="mut" style="padding:8px 2px">ไม่มีทริปในหมวดนี้</div>';
  return list.map(t => { const st = tripStatus(t), [lb, cl] = STAT[st]; return `<button type="button" class="li ${t.id === cfg.active ? 'on' : ''}" ${attr}="${esc(t.id)}"><span class="radio"></span><div><b>${esc(t.name)}</b><small style="display:block">${esc(tripRangeText(t))}</small></div><span class="chip ${cl}">${lb}</span></button>`; }).join('');
}
let data = { plan: null, costs: null, extra: [], users: [], expenses: [], locs: {}, places: {}, spots: [], settings: {}, stay: {}, info: [], me: null, meLabel: '' };
const ui = { tab: 'plan', day: null, exFilter: 'all', cur: null, edit: false, dirty: false, saving: false, loaded: false, ver: 0, tabVer: {}, scroll: {}, sync: '', sig: null };

/* ---------- CSV / Sheets ---------- */
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.map(r => r.map(x => x.trim()));
}
let sbOk = null;
async function fetchSb(tab) {
  const sb = SB(); if (!sb || !sb.url || sbOk === false) return null;
  try {
    const r = await fetch(`${sb.url}/rest/v1/sheet_rows?tab=eq.${encodeURIComponent(tab)}&select=cells&order=row_no`, { headers: { apikey: sb.key } });
    if (!r.ok) { if (r.status === 404 || r.status === 401 || r.status === 403) sbOk = false; return null; }
    const txt = await r.text(); apiStat.add(txt.length); const j = JSON.parse(txt); if (!Array.isArray(j) || !j.length) return null;
    sbOk = true; return j.map(x => Array.isArray(x.cells) ? x.cells.map(v => v == null ? '' : String(v)) : []);
  } catch { return null; }
}
let staleSess = false;          // get_private returned null for a signed-in member = saved PIN hash no longer valid
async function fetchPriv(t, tab) {
  if (!myHash()) throw new Error('ต้องเข้าสู่ระบบด้วย PIN ถึงจะดูทริปนี้ได้');
  const j = await sbRpc('get_private', { p_trip: t.key, p_tab: tab, p_name: me, p_hash: myHash() });
  if (j === null) { staleSess = true; throw new Error('เปิดทริปนี้ไม่ได้ — ต้องเป็นสมาชิกและเข้าสู่ระบบด้วย PIN ที่ถูกต้อง'); }
  return j.map(r => Array.isArray(r) ? r.map(v => v == null ? '' : String(v)) : []);
}
async function fetchTab(t, { gid, name, noSheet }) {
  if (t.priv && (gid || name !== t.usersTab)) return fetchPriv(t, gid ? 'plan' : name);
  const fromSb = await fetchSb(gid ? 'plan' : name); if (fromSb) return fromSb;
  if (noSheet) return [];          // optional tab (Info): never fall back to the Google Sheet
  const q = gid ? `gid=${encodeURIComponent(gid)}` : `sheet=${encodeURIComponent(name)}`;
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${t.id}/gviz/tq?tqx=out:csv&headers=1&${q}&_=${Date.now()}`);
  if (!r.ok) throw new Error(`โหลดชีตไม่ได้ (HTTP ${r.status}) — ตรวจว่าแชร์เป็น "ทุกคนที่มีลิงก์ดูได้"`);
  return parseCSV(await r.text());
}
const norm = s => String(s || '').toLowerCase().replace(/[\s_.]/g, '');
function colIndex(header, names) { const h = header.map(norm); for (const n of names) { const i = h.indexOf(norm(n)); if (i >= 0) return i; } return -1; }
const num = s => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/g); return m ? m.map(Number) : []; };

/* ---------- data layer: Supabase (reads: publishable key; writes: RPC functions guarded by an edit code) ---------- */
const SB = () => (window.TT_CONFIG && window.TT_CONFIG.supabase) || null;
const apiStat = {
  add(bytes) { try { const m = new Date().toISOString().slice(0, 7); let st = JSON.parse(localStorage.getItem('tt.api') || '{}'); if (st.m !== m) st = { m, n: 0, b: 0 }; st.n++; st.b += bytes || 0; localStorage.setItem('tt.api', JSON.stringify(st)); } catch { } },
  get() { try { const m = new Date().toISOString().slice(0, 7), st = JSON.parse(localStorage.getItem('tt.api') || '{}'); return st.m === m ? st : { m, n: 0, b: 0 }; } catch { return { n: 0, b: 0 }; } }
};
async function sbRpc(fn, args) {
  const sb = SB(); if (!sb) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
  const r = await fetch(`${sb.url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: sb.key, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  const txt = await r.text(); apiStat.add(txt.length + JSON.stringify(args).length);
  let j; try { j = JSON.parse(txt); } catch { j = txt; }
  if (!r.ok) {
    const m = (j && j.message) || String(txt);
    if (/wrong code/i.test(m)) { cfg.editCode = ''; saveCfg(); throw new Error('รหัสแก้ไขไม่ถูกต้อง'); }
    if (/^doc_/.test(fn) && /Could not find the function|schema cache/i.test(m)) throw Object.assign(new Error('docs sql missing'), { nosql: true });
    if (/Could not find the function|schema cache/i.test(m)) throw new Error(/private|verify_pin|pin_status|reset_pin/.test(fn) ? 'ยังไม่ได้รันสคริปต์ docs/supabase_trips.sql ใน Supabase' : 'ยังไม่ได้รันสคริปต์ docs/supabase_edit.sql ใน Supabase');
    throw new Error(m);
  }
  return j;
}
const auth = { valid: () => trip().priv ? !!myHash() : !!cfg.editCode, email: '', token: '', name: '' };       // "signed in" = the edit code is known on this device
const clientId = () => '';
const silentRenew = () => { };
let askP = null;
function askEditCode(reason) {
  if (askP) return askP;
  askP = new Promise((resolve, reject) => {
    const d = openDlg(`<form method="dialog"><h3>รหัสแก้ไข</h3>${reason ? `<div class="mut">${esc(reason)}</div>` : ''}<div class="mut" style="margin:6px 0">ใส่รหัสที่ผู้ดูแลทริปตั้งไว้ ระบบจำไว้ในเครื่องนี้</div><input name="code" type="password" autocomplete="off" autocapitalize="off" placeholder="รหัสแก้ไข"><div class="btns"><button value="ok" class="btn pri">ยืนยัน</button><button value="x" class="btn" formnovalidate>ยกเลิก</button></div></form>`);
    let pending = false;
    $('form', d).onsubmit = async ev => {
      if (ev.submitter && ev.submitter.value !== 'ok') return;
      pending = true; const code = String(new FormData(ev.target).get('code') || '').trim();
      try { if (!code || !(await sbRpc('check_code', { code }))) throw new Error('รหัสแก้ไขไม่ถูกต้อง'); cfg.editCode = code; saveCfg(); toast('ปลดล็อกการแก้ไขแล้ว', 2500); resolve(true); }
      catch (e) { toast(e.message, 4500); reject(e); }
    };
    d.addEventListener('close', () => { if (!pending) reject(new Error('ยกเลิก')); }, { once: true });
  }).finally(() => { askP = null; });
  return askP;
}
const googleDialog = reason => askEditCode(reason).catch(() => { });
const signIn = () => cfg.editCode ? Promise.resolve(true) : askEditCode();
const signOut = () => { cfg.editCode = ''; saveCfg(); renderAll(); };
const sheetApi = {
  on: () => !!SB(),                       // database configured
  ready: () => trip().priv ? !!myHash() : !!cfg.editCode,            // edit code (public trip) or PIN session (private trip)
  async call(action, p) {
    const T = trip();
    if (T.priv) {                                   // private trip: identity = the member's PIN session, no edit code needed
      if (!myHash()) throw new Error('ต้องเข้าสู่ระบบด้วย PIN');
      const pt = p.gid ? 'plan' : p.tab, pstr = a => a.map(v => v == null ? '' : String(v));
      const W = async (op, payload) => { const n = await sbRpc('private_write', { p_trip: T.key, p_tab: pt, p_op: op, p_payload: payload, p_name: me, p_hash: myHash() }); if (n === -1) throw new Error('ไม่มีสิทธิ์แก้ไขทริปนี้'); return n; };
      if (action === 'append') { await W('append', pstr(p.values)); return { ok: true }; }
      if (action === 'upsert') { await W('upsert', { key: String(p.key), cells: pstr(p.values) }); return { ok: true }; }
      if (action === 'savePlan') {
        if (!p.rows || p.rows.length < 2) throw new Error('ไม่บันทึก: ไม่มีข้อมูลแผนให้เขียน (กันข้อมูลว่าง)');
        const rows = p.rows.map(r => { const x = pstr(r); while (x.length && x[x.length - 1] === '') x.pop(); return x; });
        await W('save', rows); return { ok: true, rows: rows.length };
      }
      throw new Error('unknown action ' + action);
    }
    if (!cfg.editCode) await askEditCode('ต้องใช้รหัสแก้ไขเพื่อบันทึก');
    const code = cfg.editCode || '', tab = p.gid ? 'plan' : p.tab, str = a => a.map(v => v == null ? '' : String(v));
    switch (action) {
      case 'append': await sbRpc('append_row', { p_tab: tab, p_cells: str(p.values), code }); return { ok: true };
      case 'upsert': await sbRpc('upsert_row', { p_tab: tab, p_key: String(p.key), p_cells: str(p.values), code }); return { ok: true };
      case 'savePlan': {
        if (!p.rows || p.rows.length < 2) throw new Error('ไม่บันทึก: ไม่มีข้อมูลแผนให้เขียน (กันข้อมูลว่าง)');
        const rows = p.rows.map(r => { const x = str(r); while (x.length && x[x.length - 1] === '') x.pop(); return x; });
        await sbRpc('save_tab', { p_tab: 'plan', p_rows: rows, code }); return { ok: true, rows: rows.length };
      }
      default: throw new Error('unknown action ' + action);
    }
  }
};
function setSub(msg, ms) { ui.subMsg = msg; renderSub(); if (ms) { clearTimeout(setSub.t); setSub.t = setTimeout(() => { ui.subMsg = ''; renderSub(); }, ms); } }

/* ---------- plan parsing ---------- */
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_M = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function parseDayLabel(s) {
  const m = String(s).match(/(\d{1,2})\s*[-/ ]\s*(.+)/); if (!m) return null;
  const ms = m[2].replace(/\./g, ''); let mi = TH_M.findIndex(x => ms.includes(x.replace(/\./g, '')));
  if (mi < 0) mi = EN_M.findIndex(x => m[2].toLowerCase().includes(x));
  const ym = String(m[2]).match(/(?:^|\D)(20\d{2})(?:\D|$)/);
  return mi < 0 ? null : { d: +m[1], m: mi, y: ym ? +ym[1] : null };
}
const cleanT = s => String(s || '').replace(/\s*น\.?\s*$/, '').trim();
const isTime = s => /^\d{1,2}[.:]\d{2}$/.test(cleanT(s));
const tm = s => { const m = String(s || '').match(/(\d{1,2})[.:](\d{2})/); return m ? [+m[1], +m[2]] : null; };
function planCols(h) {
  const ix = { day: colIndex(h, ['Day', 'วัน', 'วันที่']), loc: colIndex(h, ['Location', 'เมือง']), st: colIndex(h, ['Start time']), sl: colIndex(h, ['Start Location']), at: colIndex(h, ['Arrive time']), al: colIndex(h, ['Arrive Location']), how: colIndex(h, ['How to Travel']), note: colIndex(h, ['Note']), notice: colIndex(h, ['Notice']), tk: colIndex(h, ['Tickets']) };
  if (ix.day < 0) ix.day = 0; return ix;
}
function stepFromRow(r, ix, first) {
  const g = i => i >= 0 ? (r[i] || '') : '';
  const st = g(ix.st), step = isTime(st) ? { time: cleanT(st) } : { text: st };
  return Object.assign(step, { from: g(ix.sl), toTime: cleanT(g(ix.at)), to: g(ix.al), how: g(ix.how), note: g(ix.note), notice: g(ix.notice), tickets: g(ix.tk), city: first ? '' : g(ix.loc), _row: r });
}
function parsePlan(rows) {
  const header = rows[0] || [], ix = planCols(header), g = (r, i) => i >= 0 ? (r[i] || '') : '';
  const days = [], ideas = [], tail = []; let day = null, idea = null;
  for (const r of rows.slice(1)) {
    const v = { d: g(r, ix.day), loc: g(r, ix.loc), st: g(r, ix.st), sl: g(r, ix.sl), at: g(r, ix.at), al: g(r, ix.al), how: g(r, ix.how), note: g(r, ix.note), notice: g(r, ix.notice), tk: g(r, ix.tk) };
    if (!Object.values(v).some(Boolean)) continue;
    const first = !!v.d;
    if (first) { day = { label: v.d, city: v.loc, date: parseDayLabel(v.d), steps: [], extra: [], head: null }; days.push(day); idea = null; }
    else if (/^day\s*\d+/i.test(v.st) && !v.at) { idea = { title: v.st, items: [], rows: [] }; ideas.push(idea); day = null; if (v.sl) { idea.items.push(v.sl); idea.rows.push({ r, head: true }); } tail.push(r); continue; }
    if (!day && idea) { const t = [v.sl, v.st, v.al].filter(Boolean).join(' · '); if (t) { idea.items.push(t); idea.rows.push({ r, head: false }); } tail.push(r); continue; }
    if (!day) { tail.push(r); continue; }
    if (/^end\s*day$/i.test(v.st.trim())) { day.extra.push(r); continue; }
    const hasStep = isTime(v.st) || v.st || v.sl || v.at || v.al || v.how || v.note || v.notice || v.tk;
    if (hasStep) day.steps.push(stepFromRow(r, ix, first)); else if (first) day.head = r;
  }
  return { days, ideas, tail, header, cols: ix };
}
function planToRows(p) {
  const width = Math.max(p.header.length, ...p.days.flatMap(d => [...d.steps.map(s => s._row.length), d.head ? d.head.length : 0]), ...p.tail.map(r => r.length));
  const pad = r => { const x = r.slice(); while (x.length < width) x.push(''); return x; };
  const dc = p.cols.day, out = [pad(p.header)];
  for (const d of p.days) {
    let labelled = false;
    const put = (r, isStep) => { const x = pad(r); x[dc] = labelled ? '' : d.label; labelled = true; out.push(x); };
    if (d.head) put(d.head, false);
    d.steps.forEach(s => put(s._row, true));
    if (!labelled) put([], false);
    d.extra.forEach(r => out.push(pad(r)));
  }
  p.tail.forEach(r => out.push(pad(r)));
  return out;
}
function parseTable(rows) {
  rows = rows.filter(r => r.some(Boolean));
  const keep = (rows[0] || []).map((_, i) => rows.some(r => r[i]));
  return rows.map(r => r.filter((_, i) => keep[i])).slice(0, 300);
}

/* ---------- users, expenses, locations, places ---------- */
function parseTips(rows) {
  const h = rows[0] || [], ix = { t: colIndex(h, ['type']), n: colIndex(h, ['name']), d: colIndex(h, ['detail']), w: colIndex(h, ['besttime', 'best time']), s: colIndex(h, ['source']) };
  if (ix.n < 0) return [];
  const g = (r, i) => i >= 0 ? String(r[i] || '').trim() : '';
  return rows.slice(1).filter(r => g(r, ix.n)).map(r => ({ type: (g(r, ix.t) || 'food').toLowerCase(), name: g(r, ix.n), detail: g(r, ix.d), when: g(r, ix.w), src: g(r, ix.s) }));
}
function parseMedia(rows) {
  const h = rows[0] || [], ix = { id: colIndex(h, ['id']), tab: colIndex(h, ['tab']), row: colIndex(h, ['row']), cap: colIndex(h, ['caption']), w: colIndex(h, ['w']), h: colIndex(h, ['h']) };
  if (ix.id < 0) return [];
  return rows.slice(1).filter(r => r[ix.id]).map(r => ({ id: r[ix.id], tab: r[ix.tab] || '', row: +r[ix.row] || 0, cap: r[ix.cap] || '', w: +r[ix.w] || 0, h: +r[ix.h] || 0 }));
}
/* trip pictures (from the Excel files): stored in chunks, fetched on demand and cached for the session */
const mediaCache = {};
async function mediaUrl(m) {
  const k = trip().id + '|' + m.id; if (mediaCache[k]) return mediaCache[k];
  const rows = await fetchPriv(trip(), 'media:' + m.id);
  return (mediaCache[k] = 'data:image/jpeg;base64,' + rows.map(r => r[0] || '').join(''));
}
const TAB_TH = { plan: 'แผนการเดินทาง', Cost: 'ค่าใช้จ่าย' };
function openGallery() {
  const list = data.media || []; if (!list.length) return;
  const groups = {}; list.forEach(m => (groups[m.tab] = groups[m.tab] || []).push(m));
  const d = openDlg(`<form method="dialog"><h3>${ic('image')} รูปภาพของทริป <small>(${list.length})</small></h3>${Object.entries(groups).map(([tab, arr]) => `<div class="dgroup" style="margin:10px 0 4px!important">${esc(TAB_TH[tab] || tab)}</div>${arr.map((m, i) => `${i === 0 || arr[i - 1].cap !== m.cap ? `<div class="mut" style="font-size:.78rem;margin:8px 2px 4px">${esc(m.cap || '')}</div>` : ''}${i === 0 || arr[i - 1].cap !== m.cap ? '<div class="gal">' : ''}<button type="button" class="gimg" data-g="${esc(m.id)}" aria-label="${esc(m.cap)}"></button>${i === arr.length - 1 || arr[i + 1].cap !== m.cap ? '</div>' : ''}`).join('')}`).join('')}<div class="btns"><button value="x" class="btn">ปิด</button></div></form>`);
  const load1 = async b => { const m = list.find(x => x.id === b.dataset.g); if (!m || b.dataset.done) return; b.dataset.done = '1'; try { const u = await mediaUrl(m); b.style.backgroundImage = `url(${u})`; b.onclick = () => lightbox(u, m.cap); } catch (e) { b.innerHTML = ic('warn'); b.title = e.message; } };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); load1(e.target); } }), { root: d, rootMargin: '200px' }) : null;
  $$('.gimg', d).forEach(b => io ? io.observe(b) : load1(b));
}
function lightbox(url, cap) {
  const el = document.createElement('div'); el.className = 'glb'; el.innerHTML = `<div><img src="${url}" alt=""><small>${esc(cap || '')}</small></div>`;
  el.onclick = () => el.remove(); document.body.appendChild(el);
}
const mediaCard = () => (data.media || []).length ? `<div class="card"><div class="row2"><div><h2>${ic('image')} รูปภาพของทริป</h2><small>${data.media.length} รูป จากไฟล์ Excel (ภาษาจีน/ตั๋ว/แผนที่)</small></div><button class="btn" id="bGallery">เปิดดู</button></div></div>` : '';
function parseStay(rows) {
  const h = rows[0] || [], ki = colIndex(h, ['key', 'คีย์']), vi = colIndex(h, ['value', 'ค่า']); if (ki < 0 || vi < 0) return {};
  const o = {}; rows.slice(1).forEach(r => { if (r[ki]) o[norm(r[ki])] = String(r[vi] || '').trim(); });
  if (!o.name && !o.address) return {};
  const la = num(o.lat)[0], lo = num(o.lng)[0];
  return { name: o.name || '', platform: o.platform || '', address: o.address || '', lat: la != null ? la : null, lng: lo != null ? lo : null, checkin: o.checkin || '', rules: o.rules || '', note: o.note || '' };
}
function parseInfo(rows) {          // optional public tab `Info` (Key,Value): emergency numbers, embassy, Wi-Fi …
  const h = rows[0] || [], ki = colIndex(h, ['key', 'คีย์']), vi = colIndex(h, ['value', 'ค่า']); if (ki < 0 || vi < 0) return [];
  return rows.slice(1).filter(r => r[ki] && r[vi]).map(r => ({ k: String(r[ki]).trim(), v: String(r[vi]).trim() }));
}
function parseUsers(rows) {
  const h = rows[0] || []; const ni = colIndex(h, ['name', 'ชื่อ', 'user']);
  if (ni < 0) return null;
  const main = trip().currency || 'THB';
  const bcols = h.map((x, i) => { const m = String(x).match(/^\s*(budget|งบประมาณ|งบ)\s*[\s_(\-]*([a-zA-Z]{3})?\)?\s*$/i); return m ? { i, cur: (m[2] || main).toUpperCase() } : null; }).filter(Boolean);
  const pi = colIndex(h, ['pin', 'รหัส']), gci = colIndex(h, ['googleclientid', 'clientid']);
  return rows.slice(1).filter(r => r[ni]).map(r => { const budgets = {}; bcols.forEach(b => { const v = num(r[b.i])[0]; if (v) budgets[b.cur] = v; }); return { name: r[ni], budgets, pin: pi >= 0 ? String(r[pi] || '').trim() : '', cid: gci >= 0 ? String(r[gci] || '').trim() : '' }; });
}
function normType(s) {
  s = norm(s);
  if (/shared|central|ส่วนกลาง|กลาง|หารเท่า/.test(s)) return 'shared';
  if (/personal|ส่วนตัว|ตัวเอง/.test(s)) return 'personal';
  if (/for|split|ออกให้|หาร|ให้/.test(s)) return 'split';
  return s ? 'split' : 'shared';
}
function parseExpenses(rows) {
  const h = rows[0] || [];
  const ix = { date: colIndex(h, ['date', 'วันที่']), item: colIndex(h, ['item', 'รายการ']), cat: colIndex(h, ['category', 'หมวด', 'หมวดหมู่']), amt: colIndex(h, ['amount', 'จำนวนเงิน', 'จำนวน', 'ราคา']), cur: colIndex(h, ['currency', 'สกุลเงิน']), payer: colIndex(h, ['paidby', 'payer', 'ผู้จ่าย', 'คนจ่าย']), type: colIndex(h, ['type', 'ประเภท']), w: colIndex(h, ['splitwith', 'for', 'หารกับ', 'จ่ายให้', 'ให้ใคร']) };
  if (ix.amt < 0 || ix.payer < 0) return null;
  return rows.slice(1).filter(r => num(r[ix.amt]).length && r[ix.payer]).map((r, i) => ({
    id: 's' + i, date: r[ix.date] || '', item: r[ix.item] || '', cat: r[ix.cat] || '', amount: num(r[ix.amt])[0],
    cur: (r[ix.cur] || trip().currency || 'THB').toUpperCase(), payer: r[ix.payer], type: normType(r[ix.type]),
    with: (r[ix.w] || '').split(/[,;/、]/).map(x => x.trim()).filter(Boolean)
  }));
}
function parseLocations(rows) {
  const h = rows[0] || []; const ix = { n: colIndex(h, ['name', 'ชื่อ', 'user']), lat: colIndex(h, ['lat', 'latitude']), lng: colIndex(h, ['lng', 'lon', 'long', 'longitude']), l: colIndex(h, ['label', 'place', 'สถานที่']), t: colIndex(h, ['updated', 'time', 'เวลา']) };
  if (ix.n < 0 || ix.lat < 0 || ix.lng < 0) return null;
  const out = {};
  for (const r of rows.slice(1)) { const la = num(r[ix.lat])[0], lo = num(r[ix.lng])[0]; if (r[ix.n] && la != null && lo != null) out[r[ix.n]] = { lat: la, lng: lo, label: r[ix.l] || '', at: r[ix.t] || '' }; }
  return out;
}
const spotType = t => /food|eat|restaurant|cafe|ร้าน|อาหาร|กิน|คาเฟ่/i.test(t) ? 'food' : /sight|attraction|tour|visit|เที่ยว|สถานที่/i.test(t) ? 'sight' : 'other';
function parsePlaces(rows) {
  const h = rows[0] || [], ni = colIndex(h, ['name', 'place', 'ชื่อ', 'สถานที่']), la = colIndex(h, ['lat', 'latitude']), lo = colIndex(h, ['lng', 'lon', 'long', 'longitude']);
  if (ni < 0 || la < 0 || lo < 0) return null;
  const ti = colIndex(h, ['type', 'ประเภท', 'kind']), mi = colIndex(h, ['meal', 'มื้อ']), ci = colIndex(h, ['cuisine', 'อาหาร']), no = colIndex(h, ['note', 'โน้ต', 'หมายเหตุ']);
  const over = {}, spots = [], g = (r, i) => i >= 0 ? (r[i] || '') : '';
  rows.slice(1).forEach(r => {
    const a = num(r[la])[0], b = num(r[lo])[0]; if (!(r[ni] && a != null && b != null)) return;
    over[norm(r[ni])] = { lat: a, lng: b };
    const t = g(r, ti).trim(); if (t) spots.push({ name: r[ni], lat: a, lng: b, type: spotType(t), meal: g(r, mi), cuisine: g(r, ci), note: g(r, no), src: 'sheet' });
  });
  return { over, spots };
}
const users = () => data.users;
const colorOf = n => { const i = users().findIndex(u => u.name === n); return COLORS[(i < 0 ? String(n).length : i) % COLORS.length]; };
const initial = n => (String(n).trim()[0] || '?').toUpperCase();
const avatar = (n, cls = '') => `<span class="avatar ${cls}" style="--c:${colorOf(n)}">${esc(initial(n))}</span>`;

/* ---------- expenses math (per currency, no FX) ---------- */
const participants = (e, names) => { const ps = e.type === 'shared' ? (e.with.length ? e.with : names) : e.type === 'personal' ? [e.payer] : (e.with.length ? e.with : [e.payer]); return ps.length ? ps : [e.payer]; };
function calcCur(cur, names) {
  const S = {}; users().forEach(u => S[u.name] = { name: u.name, budget: (u.budgets || {})[cur] || 0, paid: 0, share: 0, personal: 0, shared: 0, forMe: 0, forOthers: 0, net: 0 });
  const ensure = n => S[n] || (S[n] = { name: n, budget: 0, paid: 0, share: 0, personal: 0, shared: 0, forMe: 0, forOthers: 0, net: 0 });
  const cats = {}, owe = {}; let count = 0;
  for (const e of data.expenses.filter(x => x.cur === cur)) {
    count++; const ps = participants(e, names), each = e.amount / ps.length; ensure(e.payer).paid += e.amount;
    for (const p of ps) {
      const u = ensure(p); u.share += each;
      if (e.type === 'shared') u.shared += each; else if (p === e.payer) u.personal += each; else { u.forMe += each; ensure(e.payer).forOthers += each; }
      if (p !== e.payer) { owe[p] = owe[p] || {}; owe[p][e.payer] = (owe[p][e.payer] || 0) + each; }
    }
    const c = e.cat || 'อื่นๆ'; cats[c] = (cats[c] || 0) + e.amount;
  }
  const list = Object.values(S); list.forEach(u => u.net = u.paid - u.share);
  const pairs = [], ns = list.map(u => u.name);
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
    const a = ns[i], b = ns[j], d = ((owe[a] || {})[b] || 0) - ((owe[b] || {})[a] || 0);
    if (d > 0.005) pairs.push({ from: a, to: b, v: d }); else if (d < -0.005) pairs.push({ from: b, to: a, v: -d });
  }
  pairs.sort((x, y) => y.v - x.v);
  return { cur, list, pairs, cats, count, hasBudget: list.some(u => u.budget > 0) };
}
function calcAll() {
  const names = users().map(u => u.name), main = trip().currency || 'THB', set = new Set([main]);
  data.expenses.forEach(e => set.add(e.cur)); users().forEach(u => Object.keys(u.budgets || {}).forEach(c => set.add(c)));
  const order = [main, ...[...set].filter(c => c !== main).sort()], out = {};
  order.forEach(c => out[c] = calcCur(c, names));
  return { out, order };
}

/* ---------- cache (stale-while-revalidate) + calm re-rendering ---------- */
const CK = 'tt.cache.', CACHE_MAX = 1.5e6;
const SNAP = ['plan', 'costs', 'extra', 'users', 'expenses', 'locs', 'places', 'spots', 'settings', 'stay', 'tips', 'media', 'info'];
const snapOf = d => JSON.stringify(Object.fromEntries(SNAP.map(k => [k, d[k]])), (k, v) => k === 'dt' ? undefined : v);      // `dt` is derived from today's date, not data
function writeCache(id, snap) { try { if (snap.length > CACHE_MAX) localStorage.removeItem(CK + id); else localStorage.setItem(CK + id, Date.now() + '\n' + snap); } catch { } }
function readCache(id) { try { const v = localStorage.getItem(CK + id), i = v ? v.indexOf('\n') : -1; return i < 0 ? null : { t: +v.slice(0, i), snap: v.slice(i + 1), d: JSON.parse(v.slice(i + 1)) }; } catch { return null; } }
const clearPrivCaches = () => { try { docsWipe(); } catch { } try { Object.keys(localStorage).filter(k => k.startsWith(CK + 'priv:')).forEach(k => localStorage.removeItem(k)); } catch { } };
const blankData = () => ({ plan: null, costs: null, extra: [], users: [], expenses: [], locs: {}, places: {}, spots: [], settings: {}, stay: {}, tips: [], media: [], info: [] });
const dataFromCache = (id, c) => { const d = { ...blankData(), ...c.d, _trip: id, me: data.me, meLabel: data.meLabel }; if (d.plan) planDates(d.plan); return d; };
const dim = on => $('main').classList.toggle('busy', on);
const busy = () => dlg.open || !!$('.glb') || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
/* run a re-render without moving what the reader is looking at: anchor on the first visible step */
function keepScroll(fn, top) {
  const y0 = scrollY, dock = $('#homeDock'), lim = Math.max($('.top').getBoundingClientRect().bottom, dock.hidden ? 0 : dock.getBoundingClientRect().bottom);
  const a = ui.tab === 'plan' ? $$('#tl .step').find(n => n.getBoundingClientRect().bottom > lim + 1) : null, ai = a && a.dataset.i, ay = a && a.getBoundingClientRect().top, day = ui.day;
  fn();
  scrollTo(0, top && ui.tab === 'plan' ? 0 : y0);          // a different trip starts at the top of the plan
  if (top) return;
  const b = a && ui.day === day && $(`#tl .step[data-i="${ai}"]`); if (b) scrollBy(0, b.getBoundingClientRect().top - ay);
}

/* ---------- load ---------- */
const toast = (m, ms = 2400) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); };
function showErr(m) { const e = $('#error'); e.hidden = !m; e.textContent = m || ''; }
let rawPlanHead = '';
const sameAsPlan = r => rawPlanHead && (r[0] || []).join('|') === rawPlanHead;
function allowedTrip() {
  let t = trip();
  if (t.priv && !canSeePriv(t)) { cfg.active = DEFAULT_TRIP.id; saveCfg(); t = trip(); }          // not allowed (or not logged in with PIN) -> back to the public trip
  return t;
}
function applyData(nd, snap, top) {
  keepScroll(() => {
    data = nd; ui.sig = snap; dim(false);
    try { if (data.plan && data.plan.days.length) { planDates(data.plan); const ds = data.plan.days.filter(d => d.dt); if (ds.length) { cfg.dates = cfg.dates || {}; const r = { s: isoD(ds[0].dt), e: isoD(ds[ds.length - 1].dt) }, o = cfg.dates[nd._trip]; if (!o || o.s !== r.s || o.e !== r.e) { cfg.dates[nd._trip] = r; saveCfg(); } } } } catch { }
    showErr(!data.plan ? 'โหลดแผนไม่ได้ — ตรวจว่าชีตแชร์เป็น "ทุกคนที่มีลิงก์ดูได้" แล้วลองโหลดใหม่' : '');
    ui.loaded = true;
    if (me && users().length && !users().some(u => u.name === me)) { me = ''; sess.set('tt.me', null); sess.set('tt.ph', null); }
    if (!me && !$('#login').hidden) renderLogin();
    renderAll();
  }, top);
}
/* network/RPC failed: keep what is on screen (or the last good copy) and say so in the sub-title instead of an error box */
function loadFailed(t, next) {
  ui.sync = 'offline'; dim(false);
  if (data._trip !== t.id) {
    const c = readCache(t.id);
    if (c) { ui.updated = new Date(c.t); applyData(dataFromCache(t.id, c), c.snap, true); } else { ui.updated = null; applyData(next, null, true); }
  } else showErr('');
  renderSub();
}
async function load() {
  const t = allowedTrip();
  $('#tripTitle').innerHTML = esc(t.name) + (visibleTrips().length > 1 ? ' <span class="chev">▾</span>' : '');
  const tripChanged = data._trip !== t.id;
  ui.sync = tripChanged ? 'switch' : 'loading'; renderSub();
  const same = !tripChanged, next = { media: same ? (data.media || []) : [], _trip: t.id, tips: same ? (data.tips || []) : [], plan: null, costs: null, extra: [], users: [], expenses: [], locs: {}, places: {}, spots: [], settings: same ? (data.settings || {}) : {}, stay: same ? (data.stay || {}) : {}, info: same ? (data.info || []) : [], me: data.me, meLabel: data.meLabel };
  let planErr = null;
  const planP = fetchTab(t, { gid: t.planGid }).then(r => { rawPlanHead = (r[0] || []).join('|'); next.plan = parsePlan(r); }).catch(e => { planErr = e; });
  staleSess = false;
  await planP;
  if (trip().id !== t.id) return;                    // the trip was switched while loading
  if (staleSess && t.priv && me) {          // PIN was reset/deleted on the server -> sign out cleanly
    staleSess = false; me = ''; sess.set('tt.me', null); sess.set('tt.ph', null); cfg.active = DEFAULT_TRIP.id; saveCfg(); ui.day = null; clearPrivCaches();
    showErr(''); toast('PIN ของคุณใช้ไม่ได้แล้ว (อาจถูกรีเซ็ต) — กรุณาเข้าสู่ระบบใหม่อีกครั้ง', 5000);
    $('#login').hidden = false; $('#loginPin').hidden = true; $('#loginPin').innerHTML = ''; $('#loginUsers').hidden = false; $('#loginSub').hidden = false; renderLogin();
    return load();
  }
  if (planErr) return loadFailed(t, next);
  const rest = [
    async () => { if (t.priv) { try { next.media = parseMedia(await fetchTab(t, { name: 'media' })); } catch { } } },
    async () => { try { pinSet = new Set((await sbRpc('pin_status', {})).map(lc)); } catch { pinSet = null; } },
    async () => { try { next.tips = parseTips(await fetchTab(t, { name: t.tipsTab || 'Tips' })); } catch { } },
    async () => { try { next.stay = parseStay(await fetchTab(t, { name: 'Stay' })); } catch { } },
    async () => { next.users = parseUsers(await fetchTab(t, { name: t.usersTab })) || []; },
    async () => { next.expenses = parseExpenses(await fetchTab(t, { name: t.expensesTab })) || []; },
    async () => { next.locs = parseLocations(await fetchTab(t, { name: t.locationsTab || 'Locations' })) || {}; },
    async () => { const pl = parsePlaces(await fetchTab(t, { name: t.placesTab || 'Places' })) || { over: {}, spots: [] }; next.places = pl.over; next.spots = pl.spots; },
    async () => { if (t.costTab) { const r = await fetchTab(t, { name: t.costTab }); next.costs = sameAsPlan(r) ? null : parseTable(r); } },
    async () => { try { next.info = parseInfo(await fetchTab(t, { name: 'Info', noSheet: true })); } catch { } },
    async () => { for (const n of String(t.extraTabs || '').split(',').map(x => x.trim()).filter(Boolean)) { try { const r = await fetchTab(t, { name: n }); if (!sameAsPlan(r)) next.extra.push({ name: n, rows: parseTable(r) }); } catch { } } }
  ];
  const res = await Promise.allSettled(rest.map(f => f()));
  if (trip().id !== t.id) return;
  if (same) [[4, 'users'], [5, 'expenses'], [6, 'locs'], [7, 'places'], [7, 'spots'], [8, 'costs']].forEach(([i, k]) => { if (res[i].status === 'rejected') next[k] = data[k]; });          // a tab that failed to load keeps its last good copy
  { const cu = next.users.find(u => u.cid); if (cu) next.settings = { googleClientId: cu.cid }; }
  const snap = snapOf(next); ui.sync = ''; ui.updated = new Date();
  if (!tripChanged && ui.loaded && snap === ui.sig) { dim(false); showErr(''); renderSub(); renderUpd(); return; }          // identical data: touch nothing
  if (busy()) { ui.stale = true; dim(false); renderSub(); return; }          // never re-render under an open dialog / text field / picture; retried when it closes
  ui.stale = false; applyData(next, snap, tripChanged); writeCache(t.id, snap);
  if (me && geo.state === 'idle') startLocation();
}

/* ---------- login ---------- */
function renderLogin() {
  if (!$('#loginPin').hidden) return;
  const us = users();
  $('#loginSub').textContent = us.length ? 'ใครกำลังเข้าใช้งาน? แตะชื่อของคุณ' : (ui.loaded ? 'ยังไม่พบสมาชิกในชีต' : 'กำลังโหลดสมาชิก…');
  $('#loginUsers').innerHTML = us.map(u => `<button data-u="${esc(u.name)}" class="${u.name === cfg.lastMe ? 'last' : ''}">${avatar(u.name, 'lg')}<span>${esc(u.name)}</span>${u.name === cfg.lastMe ? '<small>ใช้ล่าสุด</small>' : ''}</button>`).join('');
  $('#loginGuest').hidden = !(ui.loaded && !us.length);
}
function enter(name) {
  me = name; sess.set('tt.me', name); if (name) { cfg.lastMe = name; saveCfg(); }
  if (cfg.cacheOwner !== name) { clearPrivCaches(); cfg.cacheOwner = name; saveCfg(); }          // another person on this phone must not see the previous person's cached trips
  $('#login').hidden = true; $('#app').hidden = false; renderAll();
  if (name) startLocation();
  if (name && !sess.get('tt.picked') && tripStatus(trip()) === 'past') { const best = tripList('now')[0]; if (best && best.id !== cfg.active && tripStatus(best) !== 'past') switchTrip(best.id, true); }
}
/* PIN: stored as a salted SHA-256 hash in the sheet's Users tab (column "PIN") so it works on every device; remembered per device after the first success.
   A 4-digit PIN only keeps friends from picking each other's name — anyone who can read the sheet could brute-force it. */
const PIN_LEN = 4;
cfg.pendingPin = cfg.pendingPin || {}; delete cfg.trusted;
async function hashPin(name, pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${String(name).trim().toLowerCase()}|${pin}|traveltracker`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
const colLetter = i => { let t = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = Math.floor((n - 1) / 26); } return t; };
async function setPinInSheet(name, hash) {
  if (hash && !cfg.editCode) { await sbRpc('set_first_pin', { p_name: name, p_hash: hash }); if (pinSet) pinSet.add(lc(name)); return; }          // first-time PIN needs no code
  if (!hash && pinSet) { await sbRpc('reset_pin', { p_name: name, code: cfg.editCode || '' }); pinSet.delete(lc(name)); return; }
  await sbRpc('set_cell', { p_tab: trip().usersTab, p_key: name, p_col: 'PIN', p_val: hash, code: cfg.editCode || '' });
}
let syncingPins = false;
async function syncPendingPins(interactive) {
  const names = Object.keys(cfg.pendingPin); if (!names.length || syncingPins || !sheetApi.on()) return;
  syncingPins = true;
  try {
    for (const n of names) {
      const u = users().find(x => x.name === n);
      if ((u && u.pin) || (pinSet && pinSet.has(lc(n)))) { delete cfg.pendingPin[n]; continue; }          // somebody already set a PIN for this name
      try { await setPinInSheet(n, cfg.pendingPin[n]); if (u) u.pin = cfg.pendingPin[n]; delete cfg.pendingPin[n]; }
      catch (e) { if (interactive) toast('บันทึก PIN ไม่สำเร็จ: ' + e.message + ' — PIN ใช้ได้เฉพาะเครื่องนี้', 5000); break; }
    }
    saveCfg();
  } catch (e) { if (interactive) toast('PIN ใช้ได้เฉพาะเครื่องนี้ก่อน (' + e.message + ')', 4500); }
  finally { syncingPins = false; }
}
let pinSet = null;                       // names that have a PIN on the server; null = unknown (older schema)
const lc = x => String(x || '').trim().toLowerCase();
const hasPin = name => pinSet ? (pinSet.has(lc(name)) || !!cfg.pendingPin[name]) : !!storedPin(name);
const storedPin = name => { const u = users().find(x => x.name === name); return (u && u.pin) || cfg.pendingPin[name] || ''; };
function pickUser(name) { pinPad(name, hasPin(name) ? 'verify' : 'create'); }   // PIN is asked every time; only a name without a PIN gets to create one
function pinPad(name, mode) {
  const box = $('#loginPin'); let digits = '', first = '';
  $('#loginUsers').hidden = true; $('#loginGuest').hidden = true; $('#loginSub').hidden = true; box.hidden = false;
  const title = () => mode === 'verify' ? 'ใส่ PIN ของคุณ' : first ? 'ยืนยัน PIN อีกครั้ง' : 'ตั้ง PIN 4 หลัก (ครั้งแรก)';
  const draw = (msg, bad) => {
    box.innerHTML = `<div class="pinpad">${avatar(name, 'lg')}<h2>${esc(name)}</h2><p id="pinMsg" class="${bad ? 'bad' : ''}">${esc(msg || title())}</p>
    <div class="dots ${bad ? 'shake' : ''}">${Array.from({ length: PIN_LEN }, (_, i) => `<i class="${i < digits.length ? 'f' : ''}"></i>`).join('')}</div>
    <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button data-k="${k}">${k}</button>`).join('')}<button data-k="back" aria-label="ลบ">⌫</button><button data-k="0">0</button><span></span></div>
    <div class="pin-links"><button class="link" data-a="back">← เปลี่ยนชื่อ</button>${mode === 'verify' ? '<button class="link" data-a="forgot">ลืม PIN?</button>' : ''}</div></div>`;
    $$('[data-k]', box).forEach(b => b.onclick = () => press(b.dataset.k));
    $('[data-a=back]', box).onclick = leave; const fg = $('[data-a=forgot]', box); if (fg) fg.onclick = () => resetPin(name);
  };
  const leave = () => { box.hidden = true; box.innerHTML = ''; $('#loginUsers').hidden = false; $('#loginSub').hidden = false; renderLogin(); };
  const press = async k => {
    if (k === 'back') digits = digits.slice(0, -1); else if (digits.length < PIN_LEN) digits += k;
    draw();
    if (digits.length < PIN_LEN) return;
    const pin = digits; digits = '';
    if (mode === 'verify') {
      const h = await hashPin(name, pin);
      let ok;
      if (pinSet && cfg.pendingPin[name] !== h) {
        try { ok = await sbRpc('verify_pin', { p_name: name, p_hash: h }); }
        catch (e) { return draw(/too many/i.test(e.message) ? 'ลองผิดหลายครั้ง รอ 10 นาทีแล้วลองใหม่' : 'ตรวจ PIN ไม่ได้: ' + e.message, true); }
      } else ok = pinSet ? true : storedPin(name) === h;
      if (ok) { sess.set('tt.ph', h); box.hidden = true; box.innerHTML = ''; return enter(name); }
      return draw('PIN ไม่ถูกต้อง ลองอีกครั้ง', true);
    }
    if (!first) { first = pin; return draw(); }
    if (first !== pin) { first = ''; return draw('PIN ไม่ตรงกัน ตั้งใหม่อีกครั้ง', true); }
    const h = await hashPin(name, pin); cfg.pendingPin[name] = h; saveCfg(); sess.set('tt.ph', h);
    box.hidden = true; box.innerHTML = ''; enter(name);
    syncPendingPins(false);
  };
  draw();
}
async function resetPin(name) {
  if (!confirm(`ล้าง PIN ของ ${name}? (ต้องใช้รหัสแก้ไข)`)) return;
  try { await signIn(); await setPinInSheet(name, ''); delete cfg.pendingPin[name]; saveCfg(); const u = users().find(x => x.name === name); if (u) u.pin = ''; toast('ล้าง PIN แล้ว — ตั้ง PIN ใหม่ได้เลย'); pinPad(name, 'create'); }
  catch (e) { toast(e.message, 5000); }
}
$('#loginUsers').onclick = e => { const b = e.target.closest('[data-u]'); if (b) pickUser(b.dataset.u); };
$('#loginGuest').onclick = () => enter('');
$('#btnMe').onclick = () => { clearPrivCaches(); $('#login').hidden = false; $('#loginPin').hidden = true; $('#loginUsers').hidden = false; $('#loginSub').hidden = false; renderLogin(); };

/* ---------- plan view ---------- */
const link = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">เปิดลิงก์</a>');
const mapLink = p => (!p || /^ที่พัก$/.test(p)) ? esc(p) : `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p)}" target="_blank" rel="noopener">${esc(p)}</a>`;
function howName(h, hasText) {
  const s = String(h || '').toLowerCase();
  if (/air|flight|plane|บิน|\b[a-z]{2}\s?-?\d{2,4}\b/.test(s)) return 'plane';
  if (/taxi|yandex|didi|grab|uber|แท็กซี่/.test(s)) return 'car';
  if (/bullet|train|rail|metro|bts|mrt|subway|line|shink|รถไฟ/.test(s)) return 'train';
  if (/bus|tour|รถบัส|รถ/.test(s)) return 'bus';
  if (/walk|เดิน/.test(s)) return 'walk';
  if (/boat|ferry|เรือ/.test(s)) return 'ship';
  return h ? 'compass' : (hasText ? 'note' : 'pin');
}
const howIcon = (h, hasText) => ic(howName(h, hasText));
/* dates carry the year the trip happens; days that already passed are shown as Day 1, 2, 3… */
function planDates(p) {
  const now = new Date(), first = p.days.find(d => d.date); if (!first) return false;
  let y = now.getFullYear();
  if (first.date.y) y = first.date.y;
  else if (new Date(y, first.date.m, first.date.d) < new Date(y, now.getMonth(), now.getDate()) - 60 * 864e5) y++;
  let prev = null;
  p.days.forEach(d => { if (!d.date) { d.dt = null; return; } if (d.date.y) y = d.date.y; else if (prev !== null && d.date.m < prev) y++; prev = d.date.m; d.dt = new Date(y, d.date.m, d.date.d); });
  return true;
}
const todayStart = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const isPast = d => d.dt && d.dt < todayStart();
const isToday = d => d.dt && +d.dt === +todayStart();
const dateTh = d => `${d.dt.getDate()} ${TH_M[d.dt.getMonth()]} ${d.dt.getFullYear()}`;
function dayTitle(d, i) { return d.dt ? (isPast(d) ? `Day ${i + 1}` : dateTh(d)) : d.label.replace('-', ' '); }
function pill(d, i) {
  const past = isPast(d), top = past || !d.dt ? (i + 1) : d.dt.getDate(), sub = past ? 'Day' : d.dt ? TH_M[d.dt.getMonth()] : '';
  return `<button class="pill ${i === ui.day ? 'sel' : ''} ${isToday(d) ? 'now' : ''}" data-day="${i}"><b>${top}</b><small>${sub}</small></button>`;
}
/* ---------- home: sticky map dock (the same Leaflet map is moved between the dock and the full-screen overlay) ---------- */
const wpMark = {};
ui.dockSize = store.get('tt.dock', 'm');
function mountMap(holder) {
  let el = $('#map'); if (!el) { el = document.createElement('div'); el.id = 'map'; }
  if (el.parentNode !== holder) holder.insertBefore(el, holder.firstChild);
  if (ensureMap()) setTimeout(() => map.invalidateSize(), 80);
}
function updateDock() {
  const dock = $('#homeDock'), show = ui.tab === 'plan'; dock.hidden = !show; if (!show) { document.documentElement.style.setProperty('--dockH', '0px'); return; }
  if (!show || ui.edit || ui.dockSize === 'l' || ui.dockSize === 's') ui.dockAway = false;
  dock.className = 'dock ' + (ui.dockSize || 'm') + (ui.edit ? ' edit' : '') + (ui.dockAway === 'hide' ? ' away' : ui.dockAway === 'peek' ? ' peek' : '');
  { const mh = $('.dock-map', dock), dh = $('#homeDays'); if (mh && dh) document.documentElement.style.setProperty('--peekY', Math.max(0, dock.offsetHeight - dh.offsetHeight - 8) + 'px'); }
  document.documentElement.classList.toggle('dockaway', ui.dockAway === 'hide'); document.documentElement.classList.toggle('dockpeek', ui.dockAway === 'peek');
  $('#dockShow').hidden = ui.dockSize !== 's';
  $('#dockSize').innerHTML = ui.dockSize === 'l' ? '<svg viewBox="0 0 24 24"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  document.documentElement.style.setProperty('--topH', $('.top').offsetHeight + 'px');
  if (ui.dockSize !== 's') mountMap($('#homeMapHolder'));
  const setH = () => document.documentElement.style.setProperty('--dockH', dock.offsetHeight + 'px'); setH(); setTimeout(setH, 300);   // keeps scrolled-to items from hiding under the sticky map
}
function drawHome(fit) {
  if (ui.tab !== 'plan') return; updateDock();
  if (ui.dockSize !== 's') { drawMap(fit); runGeocode(); }
}
/* the dock hides / peeks only after >= 28 px of sustained movement in one direction; small reversals restart the count */
let lastY = 0, acc = 0;
function setAway(st) {
  if (st === (ui.dockAway || false)) return;
  const dock = $('#homeDock');
  if (st === 'peek') { const dh = $('#homeDays'); document.documentElement.style.setProperty('--peekY', Math.max(0, dock.offsetHeight - dh.offsetHeight - 8) + 'px'); }
  ui.dockAway = st; dock.classList.toggle('away', st === 'hide'); dock.classList.toggle('peek', st === 'peek');
  document.documentElement.classList.toggle('dockaway', st === 'hide'); document.documentElement.classList.toggle('dockpeek', st === 'peek');
}
window.addEventListener('scroll', () => {
  const y = window.scrollY, dy = y - lastY; lastY = y;
  if (Date.now() - (ui.dockLockAt || 0) < 800 || ui.tab !== 'plan' || ui.edit || ui.dockSize === 'l' || ui.dockSize === 's') { acc = 0; return; }   // just opened / tab switched: leave it alone
  if (y < 60) { acc = 0; return setAway(false); }
  if (dy * acc < 0) acc = 0;
  acc += dy;
  if (acc > 28 && y > 140) setAway('hide'); else if (acc < -28 && ui.dockAway === 'hide') setAway('peek');
}, { passive: true });
function setDock(v) { ui.dockSize = v; store.set('tt.dock', v); updateDock(); if (v !== 's' && map) setTimeout(() => { map.invalidateSize(); drawMap(true); }, 100); }
function focusStep(k) {
  if (ui.dockAway) { ui.dockAway = false; updateDock(); }                       // the map must be on screen to show the stop
  const d = data.plan && data.plan.days[ui.day], s = d && d.steps[k]; if (!s) return;
  ui.activeStep = k; $$('#tab-plan .step').forEach(n => n.classList.toggle('active', +n.dataset.i === k));
  const m = wpMark[ui.day + '|' + qName(s.to || s.from || '')];
  if (m && map && ui.dockSize !== 's') { map.setView(m.getLatLng(), Math.max(map.getZoom(), 15)); m.openPopup(); }
  else if (ui.dockSize === 's') toast('แผนที่ถูกซ่อนอยู่ — กด “แสดงแผนที่”');
  else toast('ยังไม่มีพิกัดของจุดนี้ — ตั้งพิกัดได้ในหน้าแก้ไขรายการ (วางลิงก์ Google Maps)');
}
$('#dockSize').onclick = () => setDock(ui.dockSize === 'l' ? 'm' : 'l');
$('#dockHide').onclick = () => setDock('s');
$('#dockShow').onclick = () => setDock('m');
const locateMe = () => { if (data.me && map) map.setView([data.me.lat, data.me.lng], 16); else { ui.centered = false; startLocation(); } };
$('#dockLoc').onclick = locateMe;
$('#dockFull').onclick = openMapOv;
/* one slim row: what is next + the stay (details collapsed, one tap away) */
function stayPanel() {
  const st = data.stay, nav = st.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(st.address)}`;
  const rules = String(st.rules || '').split('\n').map(x => x.trim()).filter(Boolean);
  return `<div class="card stay" id="stayPn" ${ui.stayOpen ? '' : 'hidden'}><div class="row2"><b>${ic('home')} ${esc(st.name || 'ที่พัก')}</b><a class="btn pri sm" target="_blank" rel="noopener" href="${nav}">นำทาง</a></div>
  ${st.address ? `<div class="note">${esc(st.address)}</div>` : ''}
  ${st.checkin ? `<div class="stay-ci">${ic('mail')} ${esc(st.checkin)}</div>` : ''}
  ${st.address ? '<div class="btns" style="margin-top:8px"><button class="btn" id="stCopy">คัดลอกที่อยู่</button></div>' : ''}
  ${rules.length ? `<div class="stay-r"><b>กฎของที่พัก</b><ul class="ideas">${rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}</div>`;
}
function nextCard() {
  const e = nextEvent(), st = data.stay, hasStay = !!st && !!(st.name || st.address); if (!e && !hasStay) return '';
  const on = e && remOn(e);
  return `<div class="cd" id="cd" data-key="${e ? esc(e.key) : ''}"><div class="cd-b"><small>${e ? `ถัดไป · อีก <span id="cdTime">${fmtCd(e.dt - Date.now())}</span>` : 'ที่พัก'}</small><b>${esc(e ? e.title : st.name || st.address)}</b></div>`
    + (e ? `<button class="bellbtn ${on ? 'on' : ''}" data-bell="${esc(e.key)}" aria-label="เตือน">${ic(on ? 'bell' : 'bellOff')}</button>` : '')
    + (hasStay ? `<button class="cd-stay" id="stayBtn" aria-expanded="${!!ui.stayOpen}">${ic('home')} ที่พัก</button>` : '') + '</div>' + (hasStay ? stayPanel() : '');
}
function renderPlan() {
  const el = $('#tab-plan'), p = data.plan, dayBar = $('#homeDays');
  if (!p) { dayBar.innerHTML = ''; el.innerHTML = ui.loaded ? '<div class="empty">ไม่มีข้อมูลแผน</div>' : '<div class="skeleton"></div><div class="skeleton"></div>'; return; }
  planDates(p);
  evMapCur = {}; planEvents().forEach(e => evMapCur[e.di + '|' + e.si] = e);
  if (!p.days.length) { dayBar.innerHTML = ''; el.innerHTML = '<div class="empty">ยังไม่มีแผนในชีต</div>'; return; }
  if (ui.day == null || ui.day >= p.days.length) { const t = p.days.findIndex(isToday); ui.day = t >= 0 ? t : Math.max(0, p.days.findIndex(d => !isPast(d))); }
  const d = p.days[ui.day], wd = d.dt && !isPast(d) ? d.dt.toLocaleDateString('th-TH', { weekday: 'long' }) : '';
  let h = (ui.edit ? '' : nextCard());
  h += `<div class="dayh"><div><h2>${esc(dayTitle(d, ui.day))}</h2><small>${[wd, d.city].filter(Boolean).map(esc).join(' · ')}${isToday(d) ? ' <span class="chip">วันนี้</span>' : ''}</small></div><button class="edit-btn ${ui.edit ? 'on' : ''}" id="editBtn">${ui.edit ? 'เสร็จ' : ic('edit') + 'แก้ไข'}</button></div>`;
  if (!ui.edit && !isPast(d)) { const hits = spotMatches().items.filter(m => m.di === ui.day); if (hits.length) h += `<button class="nudge" id="nudge"><span>${ic('route')}</span><div><b>แวะได้ ${hits.length} ที่จากลิสของคุณ</b><small>อยู่ใกล้เส้นทางของวันนี้ — แตะเพื่อดู</small></div></button>`; }
  h += `<div class="tl ${ui.edit ? 'editing' : ''}" id="tl">` + d.steps.map((s, k) => `<div class="step" data-i="${k}"><div class="step-t">${esc(s.time || '')}${s.toTime ? `<small>→ ${esc(s.toTime)}</small>` : ''}</div><div class="step-c"><div class="step-i">${howIcon(s.how, !!s.text)}</div><div class="step-b">
    ${s.text ? `<div>${link(s.text)}</div>` : ''}${(s.from || s.to) ? `<div class="route">${ui.edit ? esc(s.from) : mapLink(s.from)}${s.to ? ' <span class="arrow">→</span> ' + (ui.edit ? esc(s.to) : mapLink(s.to)) : ''}</div>` : ''}
    ${s.city ? `<span class="chip">${esc(s.city)}</span>` : ''}${s.how ? `<span class="chip">${esc(s.how)}</span>` : ''}${durChips(d.steps, k)}${s.tickets ? `<span class="chip">${ic('ticket')} ${link(s.tickets)}</span>` : ''}
    ${s.note ? `<div class="note">${link(s.note)}</div>` : ''}${s.notice ? `<div class="note">${ic('warn')} ${link(s.notice)}</div>` : ''}</div>
    ${ui.edit ? '' : bell(ui.day, k)}<div class="grip" aria-label="ลากเพื่อจัดลำดับ"><svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg></div></div></div>`).join('') + '</div>';
  if (!d.steps.length && !ui.edit) h += '<div class="card empty flat">ยังไม่มีแผนสำหรับวันนี้<br><small>กด “แก้ไข” เพื่อเพิ่มรายการ</small></div>';
  if (ui.edit) h += '<button class="addstep" id="addStep">+ เพิ่มรายการ</button>';
  if (!ui.edit) p.ideas.forEach((g, gi) => { if (g.items.length) h += `<div class="card flat"><h3>${ic('bulb')} ${esc(g.title)} <small>(ไอเดีย)</small></h3><ul class="ideas">${g.items.map((i, ii) => `<li>${mapLink(i)} <button class="tag sm" data-gi="${gi}" data-ii="${ii}">+ เพิ่มเข้าแผน</button></li>`).join('')}</ul></div>`; });
  if (!ui.edit && (data.media || []).length) h += `<button class="nudge" id="planGallery"><span>${ic('image')}</span><div><b>รูปภาพของทริป (${data.media.length})</b><small>ภาพประกอบจากไฟล์ Excel — แตะเพื่อดู</small></div></button>`;
  el.innerHTML = h;
  dayBar.innerHTML = `<button class="pill mapbtn" id="peekMap" aria-label="แสดงแผนที่">${ic('map')}</button>` + p.days.map(pill).join('') + (ui.edit ? '<button class="pill add" id="addDay" aria-label="เพิ่มวัน">+</button>' : '');
  { const pm = $('#peekMap', dayBar); if (pm) pm.onclick = () => { ui.dockLockAt = Date.now(); ui.dockAway = false; updateDock(); }; }
  const sel = $('.pill.sel', dayBar); if (sel) dayBar.scrollLeft = sel.offsetLeft - dayBar.clientWidth / 2 + sel.clientWidth / 2;
  $$('[data-gi]', el).forEach(b => b.onclick = () => { const g = p.ideas[+b.dataset.gi]; addToPlanDialog(g.items[+b.dataset.ii], { gi: +b.dataset.gi, ii: +b.dataset.ii }); });
  $$('.pill[data-day]', dayBar).forEach(b => b.onclick = () => { ui.day = +b.dataset.day; ui.refit = true; ui.activeStep = null; ui.ver++; renderPlan(); });
  $('#editBtn').onclick = toggleEdit;
  bindBells(el);
  const sb = $('#stayBtn'); if (sb) sb.onclick = () => { ui.stayOpen = !ui.stayOpen; $('#stayPn').hidden = !ui.stayOpen; sb.setAttribute('aria-expanded', ui.stayOpen); };
  const sc = $('#stCopy'); if (sc) sc.onclick = () => copyText(data.stay.address, 'คัดลอกที่อยู่แล้ว');
  const pg = $('#planGallery'); if (pg) pg.onclick = openGallery;
  const nd = $('#nudge'); if (nd) nd.onclick = () => { ui.spotView = 'sug'; $('[data-tab=spots]').click(); };
  if (ui.edit) {
    $('#addStep').onclick = () => stepDialog(null);
    const ad = $('#addDay'); if (ad) ad.onclick = addDay;
    $$('.step', el).forEach(n => n.onclick = e => { if (e.target.closest('.grip')) return; stepDialog(+n.dataset.i); });
    if (window.Sortable) Sortable.create($('#tl'), { handle: '.grip', animation: 160, forceFallback: true, fallbackTolerance: 3, ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen',
      onEnd: () => { const old = d.steps, order = $$('.step', $('#tl')).map(n => +n.dataset.i); d.steps = order.map(i => old[i]); renderPlan(); scheduleSave(); } });
  } else {
    $$('.step', el).forEach(n => n.onclick = e => { if (e.target.closest('a,button')) return; focusStep(+n.dataset.i); });
    if (ui.activeStep != null) { const a = $(`.step[data-i="${ui.activeStep}"]`, el); if (a) a.classList.add('active'); }
  }
  drawHome(ui.refit);
}
async function toggleEdit() {
  if (!ui.edit) {
    if (!sheetApi.on()) return googleDialog('แก้ไขแผนได้เมื่อเข้าสู่ระบบด้วย Google — เจ้าของแอปต้องตั้งค่า Client ID ก่อน (ครั้งเดียว)');
    if (!auth.valid()) { try { await signIn(); } catch (e) { toast(e.message, 4500); return; } }
  }
  ui.edit = !ui.edit; renderPlan();
}
const hhmm = d => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
function renderSub() {
  const p = data.plan; let s = ui.subMsg || '';
  if (!s && ui.sync === 'offline') s = 'ออฟไลน์ — แสดงข้อมูลล่าสุด' + (ui.updated ? ' ' + hhmm(ui.updated) : '');
  else if (!s && ui.sync) s = ui.sync === 'switch' ? 'กำลังโหลด…' : 'กำลังอัปเดต…';
  if (!s && p && p.days.length) {
    planDates(p); const first = p.days.find(d => d.dt), last = [...p.days].reverse().find(d => d.dt), t0 = todayStart();
    if (first && last) { const diff = Math.round((first.dt - t0) / 864e5); s = diff > 0 ? `อีก ${diff} วันถึงวันเดินทาง` : last.dt < t0 ? `จบทริปแล้ว · ${p.days.length} วัน` : `กำลังเดินทาง · ${p.days.length} วัน`; }
  }
  $('#tripSub').textContent = s;
}
/* auto-save plan to the sheet */
let saveTimer;
function scheduleSave() { ui.ver++; ui.dirty = true; setSub('กำลังบันทึก…'); clearTimeout(saveTimer); saveTimer = setTimeout(savePlan, 900); }
async function savePlan() {
  if (!sheetApi.on() || !data.plan) return;
  if (ui.saving) { scheduleSave(); return; }
  ui.saving = true;
  try { await sheetApi.call('savePlan', { gid: trip().planGid || '', rows: planToRows(data.plan) }); ui.dirty = false; setSub('บันทึกแล้ว ✓', 2500); }
  catch (e) { setSub('บันทึกไม่สำเร็จ — แตะเพื่อลองใหม่'); toast('บันทึกไม่สำเร็จ: ' + e.message, 9000); }
  finally { ui.saving = false; }
}
$('#tripSub').onclick = () => { if (ui.dirty && !ui.saving) savePlan(); };

/* step editor */
const tmin = x => { const t = tm(x); return t ? t[0] * 60 + t[1] : null; };
const fmtT = m => `${pad2(((Math.floor(m / 60) % 24) + 24) % 24)}.${pad2(((m % 60) + 60) % 60)}`;
const gapMin = (a, b) => { if (a == null || b == null) return null; let d = b - a; if (d < 0) d += 1440; return d; };
const shiftT = (str, delta) => { const t = tm(str); if (!t) return str; const m = (((t[0] * 60 + t[1] + delta) % 1440) + 1440) % 1440; return String(str).replace(/(\d{1,2})[.:](\d{2})/, fmtT(m)); };
/* travel time (departure -> arrival) and time spent at the place (arrival -> next departure), derived from the sheet times */
function travelMin(st) { if (howName(st.how, false) === 'plane') return null; const g = gapMin(tmin(st.time), tmin(st.toTime)); return g > 0 && g < 1440 ? g : null; }
const nextTimed = (steps, k) => { for (let j = k + 1; j < steps.length; j++) if (tmin(steps[j].time) != null && isTime(steps[j].time)) return steps[j]; return null; };   // skips free-text rows like "lunch nearby"
function stayMin(steps, k) { const nx = nextTimed(steps, k), g = nx ? gapMin(tmin(steps[k].toTime), tmin(nx.time)) : null; return g > 0 && g < 720 ? g : null; }
function durChips(steps, k) {
  const tr = travelMin(steps[k]), sy = stayMin(steps, k);
  return (tr ? `<span class="chip">${ic('timer')} เดินทาง ${fmtDur(tr)}</span>` : '') + (sy ? `<span class="chip">${ic('clock')} อยู่ที่นั่น ${fmtDur(sy)}</span>` : '');
}
function shiftFrom(day, k0, delta) {
  const ix = data.plan.cols;
  for (let k = k0; k < day.steps.length; k++) {
    const row = day.steps[k]._row.slice();
    if (ix.st >= 0 && isTime(row[ix.st])) row[ix.st] = shiftT(row[ix.st], delta);
    if (ix.at >= 0 && tmin(row[ix.at]) != null) row[ix.at] = shiftT(row[ix.at], delta);
    day.steps[k] = stepFromRow(row, ix, k === 0);
  }
}
/* places / transport already used in the plan (most used first, "ที่พัก" pinned) - to reuse on other days */
function reuseLists() {
  const pl = {}, hw = {}, add = (o, k) => { k = String(k || '').trim(); if (k) o[k] = (o[k] || 0) + 1; };
  data.plan.days.forEach(d => d.steps.forEach(st => { add(pl, st.from); add(pl, st.to); add(hw, st.how); }));
  data.spots.forEach(x => add(pl, x.name));
  const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const places = top(pl).filter(n => n !== 'ที่พัก' && !GENERIC.test(n)).slice(0, 14);
  return { places: ['ที่พัก', ...places], how: top(hw).slice(0, 8) };
}
function stepDialog(i) {
  const p = data.plan, d = p.days[ui.day], s = i == null ? { time: '', text: '', from: '', to: '', toTime: '', how: '', note: '', _row: [] } : d.steps[i];
  const d0 = d.steps[i == null ? d.steps.length - 1 : i - 1];
  const trav0 = i == null ? null : travelMin(s) ?? gapMin(tmin(s.time), tmin(s.toTime)), stay0 = i == null ? null : stayMin(d.steps, i);
  if (i == null && d0 && d0.toTime) s.time = d0.toTime;                // a new step starts when the previous one arrives
  const dlgEl = openDlg(`<form method="dialog"><h3>${i == null ? 'เพิ่มรายการ' : 'แก้ไขรายการ'}</h3>
  <label>เวลาเริ่ม (เช่น 10.05) หรือข้อความอิสระ</label><input name="st" value="${esc(s.time || s.text || '')}" placeholder="10.05 หรือ “เดินเล่น + หาข้าว”">
  <label>ต้นทาง / ปลายทาง <small>(แตะเพื่อเติมช่องที่เลือกอยู่)</small></label><div class="chips reuse" id="reusePl">${reuseLists().places.map(n => `<button type="button" class="tag" data-v="${esc(n)}">${esc(n.length > 26 ? n.slice(0, 25) + '…' : n)}</button>`).join('')}</div>
  <label>ต้นทาง</label><input name="from" value="${esc(s.from || (i == null && d0 ? d0.to : ''))}">
  <label>ปลายทาง</label><input name="to" value="${esc(s.to || '')}">
  <label>วิธีเดินทาง</label><input name="how" value="${esc(s.how || '')}" placeholder="Airplane / Taxi / Walk"><div class="chips reuse" id="reuseHow">${reuseLists().how.map(n => `<button type="button" class="tag" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>
  <label>เวลาเดินทาง (นาที) <small>(พิมพ์แล้วเวลาถึงคำนวณให้)</small></label><input name="trav" type="number" inputmode="numeric" min="0" value="${trav0 ?? ''}"><div class="chips reuse" id="reuseTrav">${[10, 15, 20, 30, 45, 60, 90, 120].map(m => `<button type="button" class="tag" data-m="${m}">${fmtDur(m)}</button>`).join('')}</div>
  <label>เวลาถึง</label><input name="at" value="${esc(s.toTime || '')}" placeholder="เช่น 10.35">
  <label>ใช้เวลาที่จุดหมาย (นาที)</label><input name="stay" type="number" inputmode="numeric" min="0" value="${stay0 ?? ''}" placeholder="เช่น 90"><div class="chips reuse" id="reuseStay">${[30, 60, 90, 120, 180, 240].map(m => `<button type="button" class="tag" data-m="${m}">${fmtDur(m)}</button>`).join('')}</div>
  ${i != null && d.steps[i + 1] ? '<label class="chk"><input type="checkbox" name="shift" checked> เลื่อนรายการถัดไปในวันนี้ตามเวลา</label>' : ''}
  <label>โน้ต</label><input name="note" value="${esc(s.note || '')}">
  <label>ลิงก์ Google Maps ของปลายทาง (ไม่บังคับ — ใช้ปักหมุด)</label><input name="map" inputmode="url" placeholder="วางลิงก์จาก Google Maps">
  <label>ย้ายไปวัน</label><select name="day">${p.days.map((x, k) => `<option value="${k}" ${k === ui.day ? 'selected' : ''}>${esc(dayTitle(x, k))}</option>`).join('')}</select>
  <div class="btns"><button value="ok" class="btn pri">บันทึก</button>${i == null ? '' : '<button value="del" class="btn danger" formnovalidate>ลบ</button>'}<button value="x" class="btn" formnovalidate>ยกเลิก</button></div></form>`);
  const fm = $('form', dlgEl); let tgt = fm.elements.from.value ? 'to' : 'from';
  ['from', 'to'].forEach(n => fm.elements[n].addEventListener('focus', () => { tgt = n; }));
  $$('#reusePl .tag', dlgEl).forEach(b => b.onclick = () => { fm.elements[tgt].value = b.dataset.v; if (tgt === 'from') { tgt = 'to'; fm.elements.to.focus(); } });
  $$('#reuseHow .tag', dlgEl).forEach(b => b.onclick = () => { fm.elements.how.value = b.dataset.v; });
  const F = fm.elements;
  const syncAt = () => { const a = tmin(F.st.value), t = +F.trav.value; if (a != null && F.trav.value !== '' && t >= 0) F.at.value = fmtT(a + t); };
  const syncTrav = () => { const g = gapMin(tmin(F.st.value), tmin(F.at.value)); if (g != null) F.trav.value = g; };
  F.trav.addEventListener('input', syncAt); F.at.addEventListener('input', syncTrav);
  F.st.addEventListener('input', () => { if (F.trav.value !== '') syncAt(); else syncTrav(); });
  $$('#reuseTrav .tag', dlgEl).forEach(b => b.onclick = () => { F.trav.value = b.dataset.m; syncAt(); });
  $$('#reuseStay .tag', dlgEl).forEach(b => b.onclick = () => { F.stay.value = b.dataset.m; });
  $('form', dlgEl).onsubmit = async ev => {
    const v = ev.submitter ? ev.submitter.value : 'ok', f = new FormData(ev.target);
    if (v === 'x') return;
    if (v === 'del') { if (confirm('ลบรายการนี้?')) { d.steps.splice(i, 1); renderPlan(); scheduleSave(); } return; }
    const ix = p.cols, row = s._row.slice(), set = (c, val) => { if (c >= 0) { while (row.length <= c) row.push(''); row[c] = val; } };
    set(ix.st, f.get('st')); set(ix.sl, f.get('from')); set(ix.al, f.get('to')); set(ix.at, f.get('at')); set(ix.how, f.get('how')); set(ix.note, f.get('note'));
    const ns = stepFromRow(row, ix, i === 0);
    const target = p.days[+f.get('day')];
    if (target === d && i != null) d.steps[i] = ns; else { if (i != null) d.steps.splice(i, 1); target.steps.push(ns); }
    { const stayV = String(f.get('stay') || '').trim(), atM = tmin(f.get('at'));                      // time spent at the destination moves the next stops
      if (i != null && target === d && stayV !== '' && atM != null && f.get('shift')) {
        const nx = nextTimed(d.steps, i), nxM = nx ? tmin(nx.time) : null;
        if (nxM != null) { const delta = atM + (+stayV) - nxM; if (delta) shiftFrom(d, i + 1, delta); }
      } }
    const url = f.get('map').trim(); if (url && ns.to) { try { const c = await coordsFromLink(url); if (c) await savePlace(ns.to, c); else toast('อ่านพิกัดจากลิงก์ไม่ได้'); } catch (e) { toast(e.message); } }
    renderPlan(); scheduleSave();
  };
}
function addDay() {
  const label = prompt('วันที่ของวันใหม่ (เช่น 19-ก.พ.)'); if (!label) return;
  data.plan.days.push({ label: label.trim(), city: '', date: parseDayLabel(label), steps: [], extra: [], head: null }); ui.day = data.plan.days.length - 1; renderPlan(); scheduleSave();
}

/* ---------- google maps link -> coordinates ---------- */
function coordsInText(t) {
  t = decodeURIComponent(String(t));
  let m = t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || t.match(/[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+)[,+ ](-?\d+\.\d+)/) || t.match(/^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/);
  return m ? { lat: +m[1], lng: +m[2] } : null;
}
async function coordsFromLink(url) {
  let c = coordsInText(url); if (c) return c;
  if (/(goo\.gl|maps\.app)/i.test(url)) throw new Error('ลิงก์สั้นอ่านพิกัดไม่ได้ — เปิดลิงก์แล้วคัดลอก “ลิงก์เต็ม” จากแถบ URL (หรือวางพิกัด เช่น 43.26, 76.95)');
  return null;
}
async function savePlace(name, c) {
  data.places[norm(qName(name))] = c; data.places[norm(name)] = c;
  if (sheetApi.on()) { try { await sheetApi.call('upsert', { tab: trip().placesTab || 'Places', header: ['Name', 'Lat', 'Lng', 'Note'], key: qName(name), keyCol: 0, values: [qName(name), +c.lat.toFixed(6), +c.lng.toFixed(6), ''] }); toast('บันทึกพิกัดลงชีตแล้ว'); } catch (e) { toast(e.message); } }
  ui.ver++; drawMap(false);
}
function placeDialog(name) {
  const d = openDlg(`<form method="dialog"><h3>ตั้งตำแหน่ง</h3><div class="mut">${esc(name)}</div>
  <label>วางลิงก์ Google Maps หรือพิกัด (เช่น 43.26, 76.95)</label><input name="u" inputmode="url" placeholder="https://maps.app.goo.gl/… หรือ 43.26, 76.95">
  <div class="btns"><button value="ok" class="btn pri">บันทึก</button>${data.me ? '<button value="me" class="btn" formnovalidate>ใช้ตำแหน่งฉัน</button>' : ''}<button value="x" class="btn" formnovalidate>ยกเลิก</button></div></form>`);
  $('form', d).onsubmit = async ev => {
    const v = ev.submitter ? ev.submitter.value : 'ok'; if (v === 'x') return;
    try { const c = v === 'me' ? { lat: data.me.lat, lng: data.me.lng } : await coordsFromLink(new FormData(ev.target).get('u').trim()); if (c) await savePlace(name, c); else toast('อ่านพิกัดจากลิงก์ไม่ได้'); } catch (e) { toast(e.message); }
  };
}

/* ---------- budget ---------- */
function donut(pct, over) {
  const C = 2 * Math.PI * 38, v = Math.min(100, pct) / 100 * C;
  return `<div class="donut"><svg viewBox="0 0 96 96"><circle cx="48" cy="48" r="38" stroke="#ffffff40"/><circle cx="48" cy="48" r="38" stroke="${over ? '#ffd1d1' : '#ffffff'}" stroke-dasharray="${v} ${C}" stroke-linecap="round"/></svg><div class="t">${Math.round(pct)}%</div></div>`;
}
function tableCard(title, rows) {
  if (!rows || !rows.length) return '';
  return `<div class="card"><h3>${esc(title)}</h3><div class="tbl"><table>${rows.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${link(c)}</th>` : `<td>${link(c)}</td>`).join('')}</tr>`).join('')}</table></div></div>`;
}
function renderBudget(el) {
  if (!users().length) { el.innerHTML = `<div class="card empty">ยังไม่มีสมาชิก<br><small>สร้างแท็บ “${esc(trip().usersTab)}” ในชีต (คอลัมน์ Name, Budget)</small></div>` + tableCard('ประมาณการ', data.costs); return; }
  const { out, order } = calcAll(); if (!ui.cur || !out[ui.cur]) ui.cur = order[0];
  const c = out[ui.cur], cur = ui.cur, who = me || users()[0].name, mine = c.list.find(u => u.name === who) || c.list[0];
  let h = '';
  if (order.length > 1) h += `<div class="seg">${order.map(k => `<button data-cur="${esc(k)}" class="${k === cur ? 'on' : ''}">${esc(k)}</button>`).join('')}</div>`;
  const rem = mine.budget - mine.share, pct = mine.budget ? mine.share / mine.budget * 100 : 0;
  h += c.hasBudget
    ? `<div class="card hero">${donut(pct, rem < 0)}<div><small>งบคงเหลือของ ${esc(mine.name)}</small><div class="big">${fmt(rem)} <small>${esc(cur)}</small></div><small>ใช้ไป ${fmt(mine.share)} จาก ${fmt(mine.budget)}</small></div></div>`
    : `<div class="card hero"><div><small>ใช้ไปของ ${esc(mine.name)}</small><div class="big">${fmt(mine.share)} <small>${esc(cur)}</small></div></div></div>`;
  const bits = [['จ่ายให้ตัวเอง', mine.personal], ['ส่วนกลาง', mine.shared], ['คนอื่นออกให้', mine.forMe], ['ออกให้คนอื่น', mine.forOthers]].filter(x => x[1]); if (bits.length) h += `<div class="bits">${bits.map(x => `<span>${x[0]} <b>${fmt(x[1])}</b></span>`).join('')}</div>`;
  h += `<div class="card"><h2>ใครติดใคร</h2>${c.pairs.length ? c.pairs.map(p => `<div class="tx">${avatar(p.from, 'sm')}<b>${esc(p.from)}</b><span class="arr">ติด</span>${avatar(p.to, 'sm')}<b>${esc(p.to)}</b><b class="v ${p.from === mine.name ? 'neg' : p.to === mine.name ? 'pos' : ''}">${fmt(p.v)} ${esc(cur)}</b></div>`).join('') : '<span class="mut">ไม่มีใครติดกัน</span>'}</div>`;
  h += `<div class="card"><h2>ทุกคน</h2>${c.list.map(u => { const r = u.budget - u.share, p = u.budget ? Math.min(100, u.share / u.budget * 100) : 0; return `<div class="row">${avatar(u.name)}<div><b>${esc(u.name)}${u.name === me ? ' <span class="chip">ฉัน</span>' : ''}</b>${u.budget ? `<div class="track ${r < 0 ? 'over' : ''}"><i style="width:${p}%"></i></div>` : ''}</div><div class="amt ${u.net >= 0 ? 'pos' : 'neg'}">${u.net >= 0 ? '+' : '−'}${fmt(Math.abs(u.net))}</div></div>`; }).join('')}</div>`;
  const cats = Object.entries(c.cats).sort((a, b) => b[1] - a[1]), mx = cats[0] ? cats[0][1] : 1;
  if (cats.length) h += `<div class="card"><h2>แยกตามหมวด</h2>${cats.map(([k, v]) => `<div class="cat"><div><span>${esc(k)}</span><b>${fmt(v)}</b></div><div class="track"><i style="width:${v / mx * 100}%"></i></div></div>`).join('')}</div>`;
  if (data.costs && data.costs.length) h += tableCard('ประมาณการ', data.costs);
  el.innerHTML = h;
  $$('[data-cur]', el).forEach(b => b.onclick = () => { ui.cur = b.dataset.cur; renderBudget(); });
}

/* ---------- expenses ---------- */
const TYPE_TH = { shared: 'ส่วนกลาง', personal: 'ส่วนตัว', split: 'ออกให้' };
function renderExpenses(el) {
  let ex = data.expenses; if (ui.exFilter === 'mine' && me) ex = ex.filter(e => e.payer === me || e.with.includes(me) || (e.type === 'shared' && !e.with.length));
  const groups = {}; ex.forEach(e => (groups[e.date || 'ไม่ระบุวันที่'] = groups[e.date || 'ไม่ระบุวันที่'] || []).push(e));
  let h = `<div class="seg"><button data-f="all" class="${ui.exFilter === 'all' ? 'on' : ''}">ทั้งหมด</button><button data-f="mine" class="${ui.exFilter === 'mine' ? 'on' : ''}">เกี่ยวกับฉัน</button></div>`;
  h += Object.entries(groups).reverse().map(([d, list]) => `<div class="dgroup">${esc(d)}</div>` + list.slice().reverse().map(e => `<div class="ex">${avatar(e.payer)}<div><div class="it">${esc(e.item || '—')}</div><small>${esc(e.payer)} · ${TYPE_TH[e.type]}${e.cat ? ' · ' + esc(e.cat) : ''}${e.with.length ? ' · ' + esc(e.with.join(', ')) : ''}</small></div><div class="am">${fmt(e.amount)}<small style="display:block;font-weight:400">${esc(e.cur)}</small></div></div>`).join('')).join('') || '<div class="empty">ยังไม่มีรายการ<br><small>กด + เพื่อเพิ่มค่าใช้จ่าย</small></div>';
  el.innerHTML = h;
  $$('[data-f]', el).forEach(b => b.onclick = () => { ui.exFilter = b.dataset.f; renderExpenses(el); });
}
function renderMoney() {
  const el = $('#tab-money'), v = ui.moneyView || 'sum';
  el.innerHTML = `<div class="seg"><button data-v="sum" class="${v === 'sum' ? 'on' : ''}">สรุป</button><button data-v="list" class="${v === 'list' ? 'on' : ''}">รายการ</button></div><div id="moneyBody"></div><button class="fab" id="addExp" aria-label="เพิ่มค่าใช้จ่าย"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>`;
  (v === 'list' ? renderExpenses : renderBudget)($('#moneyBody'));
  $$('[data-v]', el).forEach(b => b.onclick = () => { ui.moneyView = b.dataset.v; renderMoney(); });
  $('#addExp').onclick = expenseDialog;
}
async function copyText(t, okMsg) { try { await navigator.clipboard.writeText(t); toast(okMsg); } catch { prompt('คัดลอกข้อความนี้:', t); } }
function expensePreview(f) {
  const amt = +f.amount || 0, cur = (f.cur || '').toUpperCase() || (trip().currency || 'THB');
  const names = users().map(u => u.name), ps = participants({ type: f.type, payer: f.payer, with: f.with }, names), each = amt / ps.length;
  if (!amt) return '<small>กรอกจำนวนเงินเพื่อดูว่าใครติดใคร</small>';
  let h = `<b>${esc(f.payer)} จ่าย ${fmt(amt)} ${esc(cur)}</b> <span class="chip">${TYPE_TH[f.type]}</span>`;
  if (f.type === 'personal') return h + '<div class="mut">จ่ายให้ตัวเอง — ไม่มีใครติด</div>';
  h += `<div class="mut">หาร ${ps.length} คน · คนละ ${fmt(each)} ${esc(cur)}</div>`;
  h += ps.map(p => p === f.payer ? `<div class="tx">${avatar(p, 'sm')}<b>${esc(p)}</b><span class="arr">ส่วนของตัวเอง</span><b class="v">${fmt(each)}</b></div>` : `<div class="tx">${avatar(p, 'sm')}<b>${esc(p)}</b><span class="arr">ติด</span>${avatar(f.payer, 'sm')}<b>${esc(f.payer)}</b><b class="v neg">${fmt(each)}</b></div>`).join('');
  return h;
}
function expenseDialog() {
  const us = users().map(u => u.name); if (!us.length) return toast('ยังไม่มีสมาชิกในชีต');
  const main = trip().currency || 'THB', curs = [...new Set([main, 'KZT', 'USD', ...data.expenses.map(e => e.cur)])];
  const d = openDlg(`<form method="dialog"><h3>เพิ่มค่าใช้จ่าย</h3>
  <label>รายการ</label><input name="item" required placeholder="เช่น ข้าวเย็น, Yandex Go">
  <label>จำนวนเงิน</label><input name="amount" type="number" step="any" inputmode="decimal" required>
  <label>สกุลเงิน (แยกคำนวณ ไม่แปลงค่าเงิน)</label><div class="seg" id="curSeg">${curs.map(c => `<button type="button" data-c="${esc(c)}" class="${c === main ? 'on' : ''}">${esc(c)}</button>`).join('')}</div><input type="hidden" name="cur" value="${esc(main)}">
  <label>ใครจ่าย</label><select name="payer">${us.map(n => `<option ${n === me ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
  <label>ประเภท</label><select name="type"><option value="shared">ส่วนกลาง — หารเท่ากันทุกคน</option><option value="personal">ส่วนตัว — จ่ายให้ตัวเอง</option><option value="split">ออกให้ — หารเฉพาะคนที่เลือก</option></select>
  <div id="whoBox"><label>หารกับใคร (ว่าง = ทุกคนสำหรับส่วนกลาง)</label><div class="checks">${us.map(n => `<label><input type="checkbox" name="w" value="${esc(n)}">${esc(n)}</label>`).join('')}</div></div>
  <label>หมวด</label><input name="cat" placeholder="อาหาร / เดินทาง / ที่พัก">
  <div class="card preview" id="preview"></div>
  <div class="btns"><button value="ok" class="btn pri">${sheetApi.on() ? 'บันทึก' : 'คัดลอกแถว'}</button><button value="x" class="btn" formnovalidate>ยกเลิก</button></div></form>`);
  const form = $('form', d);
  const vals = () => { const f = new FormData(form); return { amount: f.get('amount'), cur: f.get('cur'), payer: f.get('payer'), type: f.get('type'), with: f.getAll('w') }; };
  const upd = () => { const v = vals(); $('#whoBox').hidden = v.type === 'personal'; $('#preview').innerHTML = expensePreview(v); };
  $$('#curSeg button', d).forEach(b => b.onclick = () => { form.elements.cur.value = b.dataset.c; $$('#curSeg button', d).forEach(x => x.classList.toggle('on', x === b)); upd(); });
  form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
  form.onsubmit = async ev => {
    if (ev.submitter && ev.submitter.value !== 'ok') return; const f = new FormData(ev.target);
    const row = [new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }), f.get('item'), f.get('cat'), +f.get('amount'), f.get('cur'), f.get('payer'), f.get('type'), f.getAll('w').join(', ')];
    if (!sheetApi.on()) return copyText(row.join('\t'), 'คัดลอกแถวแล้ว — วางต่อท้ายแท็บ ' + trip().expensesTab + ' ในชีต');
    try { setSub('กำลังบันทึก…'); await sheetApi.call('append', { tab: trip().expensesTab, header: ['Date', 'Item', 'Category', 'Amount', 'Currency', 'PaidBy', 'Type', 'SplitWith'], values: row }); setSub('บันทึกแล้ว ✓', 2500); await load(); }
    catch (e) { setSub(''); toast(e.message); }
  };
}

/* ---------- location (only between landing and departure) ---------- */
const geo = { state: 'idle', watch: null, lastGeo: 0, lastPt: null, lastPush: 0 };
function planWindowDates() { const p = data.plan; return p && p.days.length && planDates(p) ? p : null; }
const at = (date, t) => { const x = new Date(date); if (t) x.setHours(t[0], t[1], 0, 0); return x; };
function tripWindow() {
  const p = planWindowDates(); if (!p) return null;
  const fl = []; p.days.forEach(d => d.steps.forEach(s => { if (d.dt && howName(s.how, false) === 'plane') fl.push({ d, s }); }));
  const lastDay = [...p.days].reverse().find(d => d.dt); if (!lastDay) return null;
  if (!fl.length) return { start: at(p.days.find(d => d.dt).dt), end: at(lastDay.dt, [23, 59]), where: '' };
  const f = fl[0], dep = tm(f.s.time), arr = tm(f.s.toTime);
  let start = at(f.d.dt, arr);
  const pm = String(f.s.toTime || '').match(/\(([^)]+)\)/), pd = pm && parseDayLabel(pm[1]);
  if (pd) start = new Date(f.d.dt.getFullYear(), pd.m, pd.d, arr ? arr[0] : 0, arr ? arr[1] : 0);
  else if (dep && arr && (arr[0] * 60 + arr[1]) < (dep[0] * 60 + dep[1])) start.setDate(start.getDate() + 1);
  let end = at(lastDay.dt, [23, 59]);
  if (fl.length > 1) { const l = fl[fl.length - 1]; end = at(l.d.dt, tm(l.s.time) || [0, 0]); }
  return { start, end, where: f.s.to || '' };
}
function gate() {
  if (cfg.forceLoc) return { state: 'active' };
  if (!data.plan) return { state: 'pending' };
  const w = tripWindow(); if (!w) return { state: 'active' };
  const n = Date.now();
  return { state: n < w.start ? 'before' : n > w.end ? 'after' : 'active', w };
}
const dtTh = d => d.toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function stopLocation() { if (geo.watch != null) { navigator.geolocation.clearWatch(geo.watch); geo.watch = null; } }
function startLocation() {
  if (!navigator.geolocation) { geo.state = 'unsupported'; return renderMapStatus(); }
  const g = gate();
  if (g.state !== 'active') { stopLocation(); geo.state = g.state === 'pending' ? 'idle' : g.state; if (g.state !== 'pending') data.me = null; return renderMapStatus(); }
  if (geo.watch != null) return;
  geo.state = 'asking'; renderMapStatus();
  geo.watch = navigator.geolocation.watchPosition(onPos, err => { stopLocation(); geo.state = err.code === 1 ? 'denied' : 'error'; renderMapStatus(); }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 25000 });
}
function onPos(pos) {
  const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
  data.me = { lat, lng, acc, at: new Date() }; geo.state = 'ok';
  const moved = !geo.lastPt || distM(geo.lastPt, data.me) > 80;
  if (moved && Date.now() - geo.lastGeo > 8000) { geo.lastGeo = Date.now(); geo.lastPt = { lat, lng }; reverse(lat, lng); }
  if (sheetApi.ready() && me && Date.now() - geo.lastPush > 60000) { geo.lastPush = Date.now(); pushLoc(); }
  drawMap(!ui.centered); ui.centered = true; renderMapStatus();
}
async function pushLoc() {
  if (!data.me || !me) return;
  try { await sheetApi.call('upsert', { tab: trip().locationsTab || 'Locations', header: ['Name', 'Lat', 'Lng', 'Label', 'Updated'], key: me, keyCol: 0, values: [me, +data.me.lat.toFixed(6), +data.me.lng.toFixed(6), data.meLabel || '', new Date().toISOString()] }); } catch { }
}
const distM = (a, b) => { const R = 6371e3, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng), q = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(q)); };
async function reverse(lat, lng) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=th,en&lat=${lat}&lon=${lng}`);
    if (!r.ok) return; const j = await r.json(), a = j.address || {};
    const parts = [j.name || a.road || a.pedestrian, a.suburb || a.neighbourhood || a.quarter, a.city || a.town || a.village || a.county || a.state].filter(Boolean);
    data.meLabel = [...new Set(parts)].slice(0, 3).join(', ') || (j.display_name || '').split(',').slice(0, 3).join(',');
    renderMapStatus();
  } catch { }
}

/* ---------- map ---------- */
let map, layer, plLayer, spLayer, sgLayer;
ui.f = store.get('tt.f', null) || { route: true, food: true, sight: true, other: true, friends: true };
const pinIcon = (n, isMe) => L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32], html: `<div class="pin ${isMe ? 'me' : ''}" style="--c:${colorOf(n)}"><span>${esc(initial(n))}</span></div>` });
const SPOT = { food: ['food', '#f97316', 'ร้านอาหาร'], sight: ['sight', '#0ea5e9', 'ที่เที่ยว'], other: ['pin', '#8b5cf6', 'อื่นๆ'] };
const spotIcon = (type, soft, hot) => L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14], html: `<div class="spin ${soft ? 'soft' : ''} ${hot ? 'hot' : ''}" style="--c:${SPOT[type][1]}">${ic(SPOT[type][0])}</div>` });
const sugIcon = kind => L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12], html: `<div class="spin sug">${ic(kind === 'sight' ? 'sight' : kind === 'cafe' ? 'cafe' : 'food')}</div>` });
const placeIcon = (n, di) => { const w = Math.max(28, 12 + 8 * String(n).length); return L.divIcon({ className: '', iconSize: [w, 28], iconAnchor: [w / 2, 14], popupAnchor: [0, -12], html: `<div class="plc" style="--c:${COLORS[di % 8]};${w > 28 ? 'width:' + w + 'px;border-radius:14px;' : ''}">${n}</div>` }); };
function ensureMap() {
  const el = $('#map'); if (!el) return false;
  if (map && map._container !== el) { map.remove(); map = null; }
  if (!map) {
    map = L.map(el, { zoomControl: false }).setView([43.25, 76.95], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
    spLayer = L.layerGroup().addTo(map); plLayer = L.layerGroup().addTo(map); sgLayer = L.layerGroup().addTo(map); layer = L.layerGroup().addTo(map);
  }
  return true;
}
function drawMap(fit) {
  if ((ui.tab !== 'plan' && !ui.ov) || !ensureMap()) return;
  layer.clearLayers(); const pts = [];
  const all = { ...data.locs }; if (data.me && me) all[me] = { ...data.me, label: data.meLabel || '' };
  for (const [n, p] of Object.entries(all)) {
    if (n !== me && !ui.f.friends) continue;
    pts.push([p.lat, p.lng]);
    if (n === me && p.acc) L.circle([p.lat, p.lng], { radius: p.acc, color: '#2f7bff', weight: 1, fillOpacity: .08 }).addTo(layer);
    L.marker([p.lat, p.lng], { icon: pinIcon(n, n === me), zIndexOffset: 1000 }).addTo(layer).bindPopup(`<b>${esc(n)}</b><br>${esc(p.label || '')}`);
  }
  const route = drawPlaces(), spots = drawSpots();
  let focus = route.length ? [...pts.slice(0, 1), ...route] : [...pts, ...spots];
  if (route.length > 2) {
    const R = 150e3, near = (a, b) => distM({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] }) < R;
    let best = -1, bi = 0; route.forEach((a, i) => { const n = route.filter(b => near(a, b)).length; if (n >= best) { best = n; bi = i; } });
    if (best < route.length) focus = [...pts.slice(0, 1).filter(q => near(q, route[bi])), ...route.filter(b => near(route[bi], b))];
  }
  setTimeout(() => { map.invalidateSize(); if (fit && focus.length) focus.length === 1 ? map.setView(focus[0], 16) : map.fitBounds(focus, { maxZoom: 16, padding: [40, 40] }); }, 60);
}
const GEO_MSG = {
  idle: ['pin', 'ยังไม่ได้เปิดตำแหน่ง', 'กดปุ่มเพื่ออนุญาตให้แอปตรวจจับตำแหน่งของคุณ'],
  asking: ['hourglass', 'กำลังหาตำแหน่ง…', 'หากมีหน้าต่างขอสิทธิ์ ให้กด “อนุญาต”'],
  denied: ['ban', 'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง', 'เปิดสิทธิ์ตำแหน่งให้เว็บนี้ในการตั้งค่าเบราว์เซอร์ แล้วกดลองอีกครั้ง'],
  error: ['warn', 'หาตำแหน่งไม่ได้', 'ตรวจว่าเปิด GPS แล้วลองใหม่'],
  unsupported: ['warn', 'อุปกรณ์ไม่รองรับระบุตำแหน่ง', ''],
  before: ['plane', 'ยังไม่ถึงเวลาเปิดตำแหน่ง', ''],
  after: ['home', 'ทริปจบแล้ว', 'ปิดการติดตามตำแหน่งแล้ว']
};
/* location status line of the full-screen map; the permission button only shows when there is something to ask */
function renderMapStatus() {
  const el = $('#ovStatus'); if (!el) return;
  let [ico, t, sub] = GEO_MSG[geo.state] || GEO_MSG.idle;
  if (geo.state === 'ok' && data.me) { ico = 'pin'; t = data.meLabel || (me || 'คุณ') + ' อยู่ที่นี่'; sub = `แม่นยำ ±${Math.round(data.me.acc)} ม.`; }
  else if (geo.state === 'before') { const w = gate().w; sub = w ? `จะขอสิทธิ์เมื่อบินถึง${w.where ? ' ' + w.where : ''} (${dtTh(w.start)})` : ''; }
  el.innerHTML = `<span>${ic(ico)} <b>${esc(t)}</b>${sub ? `<br><small>${esc(sub)}</small>` : ''}</span>${['idle', 'denied', 'error'].includes(geo.state) ? '<button class="btn pri sm" id="bAsk">ขอสิทธิ์ตำแหน่ง</button>' : ''}`;
  const b = $('#bAsk'); if (b) b.onclick = () => { stopLocation(); ui.centered = false; startLocation(); };
}
function renderFilters() {
  const el = $('#ovFilters'); if (!el) return;
  const cnt = t => allSpots().filter(s => s.type === t).length;
  const chip = (k, ik, lb, n) => `<button class="tag ${ui.f[k] ? 'on' : ''}" data-f="${k}">${ic(ik)} ${lb}${n != null ? ` <small>${n}</small>` : ''}</button>`;
  el.innerHTML = chip('route', 'compass', 'เส้นทาง') + chip('food', 'food', 'ร้านอาหาร', cnt('food')) + chip('sight', 'sight', 'ที่เที่ยว', cnt('sight')) + chip('other', 'pin', 'อื่นๆ', cnt('other')) + chip('friends', 'users', 'เพื่อน')
    + (ui.sugPins && ui.sugPins.length ? `<button class="tag on" id="clrSug">${ic('spark')} แนะนำ ${ui.sugPins.length} ${ic('x')}</button>` : '');
  $$('[data-f]', el).forEach(b => b.onclick = () => { const k = b.dataset.f; ui.f[k] = !ui.f[k]; store.set('tt.f', ui.f); renderFilters(); drawMap(false); if (k === 'sight' && ui.f.sight) runGeocode(); });
  const c = $('#clrSug'); if (c) c.onclick = () => { ui.sugPins = []; renderFilters(); drawMap(false); };
}
/* full-screen map: the one Leaflet instance is moved into the overlay and back (same view, no re-fit); Back / Esc / close button close it */
function openMapOv() {
  if (ui.ov) return; ui.ov = true; $('#mapOv').hidden = false; history.pushState({ ov: 1 }, '');
  mountMap($('#ovHolder')); renderFilters(); renderMapStatus(); drawMap(false);
}
function closeMapOv(fromPop) {
  if (!ui.ov) return; ui.ov = false; $('#mapOv').hidden = true; mountMap($('#homeMapHolder'));
  if (!fromPop) history.back();
}
$('#ovClose').onclick = () => closeMapOv();
$('#ovLoc').onclick = locateMe;
addEventListener('popstate', () => closeMapOv(true));
addEventListener('keydown', e => { if (e.key === 'Escape' && ui.ov && !dlg.open) closeMapOv(); });

/* ---------- plan route on the map (waypoints in order, dashed line + arrows) ---------- */
const gc = { cache: store.get('tt.gc2', {}), running: false, center: null };
const GENERIC = /^(ที่พัก|home|hotel|accommodation|พัก|สนามบิน|airport)$/i;
const qName = n => String(n || '').replace(/\([^)]*\)/g, '').split(/\s\/\s|\s\+\s/)[0].trim();
const gKey = q => trip().id + '|' + q;
const stayCoord = q => { const st = data.stay; return st && st.lat != null && st.lng != null && norm(q) === 'ที่พัก' ? { lat: st.lat, lng: st.lng } : undefined; };
const ovr = q => (data.places || {})[norm(q)] || stayCoord(q);
const coordOf = q => ovr(q) || gc.cache[gKey(q)];
const knownQ = q => !!ovr(q) || (gKey(q) in gc.cache);
function dayWaypoints(di) {
  const p = data.plan, d = p && p.days[di]; if (!d) return [];
  const out = [], add = (n, t, how, ts, te) => {
    if (!n) return; const q = qName(n); if (!q) return;
    if (GENERIC.test(n.trim()) && !ovr(q)) return;
    if (out.length && out[out.length - 1].q === q) { if (how && !out[out.length - 1].how) out[out.length - 1].how = how; return; }
    out.push({ name: norm(q) === 'ที่พัก' && data.stay && data.stay.name ? `${n.trim()} · ${data.stay.name}` : n.trim(), q, time: t || '', di, day: dayTitle(d, di), how: how || '', ts: ts || '', te: te || '' });
  };
  d.steps.forEach((st, k) => { if (k === 0) add(st.from, st.time, ''); add(st.to, st.toTime || st.time, st.how, st.time, st.toTime); });
  return out;
}
function scopeDays() {
  const p = data.plan; if (!p) return [];
  if (ui.tab === 'spots') return p.days.map((_, i) => i).filter(i => !isPast(p.days[i]));
  return p.days[ui.day] ? [ui.day] : [];
}
const scopeStops = () => scopeDays().flatMap(dayWaypoints);
const ideaSpots = () => data.plan ? data.plan.ideas.flatMap(g => g.items.map(it => ({ name: it, q: qName(it), type: 'sight', src: 'idea' }))).filter(x => x.q && !GENERIC.test(x.q)) : [];
const cityHint = () => { const w = tripWindow(); return w && w.where ? String(w.where).replace(/\b(international|airport|station)\b/ig, '').replace(/(สนามบิน|ท่าอากาศยาน).*/, '').replace(/\s+/g, ' ').trim() : ''; };
async function nominatim(q, isCenter) {
  let url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en,th&q=${encodeURIComponent(q)}`;
  if (gc.center && !isCenter) url += `&viewbox=${gc.center.lng - 1.5},${gc.center.lat + 1.5},${gc.center.lng + 1.5},${gc.center.lat - 1.5}`;
  const r = await fetch(url); if (!r.ok) throw new Error('geocode ' + r.status);
  const x = (await r.json())[0]; if (!x) return null;
  const c = { lat: +x.lat, lng: +x.lon };
  return (gc.center && !isCenter && distM(gc.center, c) > 600e3) ? null : c;
}
async function geocode(q, isCenter) {
  if (knownQ(q)) return coordOf(q);
  const hint = isCenter ? '' : cityHint(), first = q.split(/\s&\s/)[0].trim();
  const tries = [...new Set([q, hint && !q.toLowerCase().includes(hint.toLowerCase()) ? `${q}, ${hint}` : '', first !== q ? first : '', hint && first !== q ? `${first}, ${hint}` : ''].filter(Boolean))];
  let c = null;
  for (let k = 0; k < tries.length && !c; k++) { if (k) await sleep(1100); c = await nominatim(tries[k], isCenter); }
  gc.cache[gKey(q)] = c; store.set('tt.gc2', gc.cache);
  return c;
}
async function runGeocode() {
  if (gc.running) return; gc.running = true;
  try {
    gc.center = gc.cache[gKey('__center')] || null;
    if (!gc.center) { const w = tripWindow(), name = w && qName(w.where); if (name) { const c = await geocode(name, true); if (c) { gc.center = c; gc.cache[gKey('__center')] = c; store.set('tt.gc2', gc.cache); } } }
    for (; ;) {
      const need = [...(ui.f.route ? scopeStops() : []), ...(ui.f.sight ? ideaSpots() : [])].find(x => !knownQ(x.q)); if (!need) break;
      await geocode(need.q); drawMap(false); if (ui.tab === 'spots') renderSpots(); await sleep(1100);
    }
  } catch { } finally { gc.running = false; const rf = ui.refit; ui.refit = false; drawMap(rf); }
}
/* ---------- travel time between stops: OSM routing (foot/car); transit & taxi are estimates; flights use the plan's own times ---------- */
const trv = { cache: store.get('tt.trv', {}), memo: {}, pending: {}, q: Promise.resolve(), t: 0 };
const legMode = (how, d) => {
  const s = String(how || '').toLowerCase();
  if (howName(how, false) === 'plane') return 'air';
  if (/walk|เดิน/.test(s)) return 'foot';
  if (/bullet|train|rail|metro|bts|mrt|subway|รถไฟ|bus|tour|รถบัส/.test(s)) return 'transit';
  if (/taxi|yandex|didi|grab|uber|แท็กซี่|car|รถ/.test(s)) return 'car';
  return d < 1500 ? 'foot' : 'car';
};
const MODE_ICON = { foot: 'walk', car: 'car', transit: 'train', air: 'plane' };
const fmtDur = m => { m = Math.max(1, Math.round(m)); return m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชม.${m % 60 ? ' ' + (m % 60) + ' น.' : ''}`; };
const fmtKm = m => m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} ม.` : `${(m / 1000).toLocaleString('th-TH', { maximumFractionDigits: 1 })} กม.`;
const planMin = w => { const a = tm(w.ts), b = tm(w.te); if (!a || !b) return null; let m = b[0] * 60 + b[1] - (a[0] * 60 + a[1]); if (m <= 0) m += 1440; return m; };
const legKey = (a, b, mode) => { const f = x => x.toFixed(4); return `${f(a.lat)},${f(a.lng)}|${f(b.lat)},${f(b.lng)}|${mode}`; };
function legsChanged() { clearTimeout(trv.t); trv.t = setTimeout(() => drawMap(false), 150); }
function legInfo(a, b, how) {
  const d = distM(a, b), mode = legMode(how, d);
  if (mode === 'air') return { mode, air: true, m: d };
  if (d < 80) return { mode, skip: true, min: 0, m: d };
  const key = legKey(a, b, mode), hit = trv.cache[key] || trv.memo[key];
  if (hit) return { mode, ...hit };
  ensureLeg(key, a, b, mode, d); return { mode, loading: true, m: d };
}
function ensureLeg(key, a, b, mode, d) {
  if (trv.pending[key]) return; trv.pending[key] = 1;
  trv.q = trv.q.then(async () => {
    let r = null;
    try {
      const res = await fetch(`https://routing.openstreetmap.de/${mode === 'foot' ? 'routed-foot' : 'routed-car'}/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=false`);
      if (res.ok) { const j = await res.json(), rt = j.routes && j.routes[0]; if (j.code === 'Ok' && rt) r = mode === 'foot' ? { min: rt.duration / 60, m: rt.distance, est: false } : mode === 'car' ? { min: rt.duration / 60 * 1.15, m: rt.distance, est: true } : { min: rt.duration / 60 * 1.5 + 5, m: rt.distance, est: true }; }
    } catch { }
    if (r) { trv.cache[key] = r; store.set('tt.trv', trv.cache); }
    else { const km = d * 1.3 / 1000; trv.memo[key] = { min: km / ({ foot: 4.8, car: 28, transit: 20 }[mode]) * 60, m: d * 1.3, est: true, approx: true }; }
    delete trv.pending[key]; legsChanged(); await sleep(350);
  });
}
const legText = (info, w) => {
  if (info.air) return `ระยะบิน ~${fmtKm(info.m)}`;
  if (info.skip) return '';
  if (info.loading) return 'คำนวณเวลา…';
  return `${info.est ? '~' : ''}${fmtDur(info.min)} · ${fmtKm(info.m)}`;
};
const tight = (info, w) => { if (info.air || info.skip || info.loading) return null; const pm = planMin(w); return pm != null && info.min > pm * 1.15 + 5 ? pm : null; };
const bearing = (a, b) => Math.atan2(-(b.lat - a.lat), (b.lng - a.lng) * Math.cos(a.lat * Math.PI / 180)) * 180 / Math.PI;
const legIcon = (how, color, timeTxt, warn, mode) => L.divIcon({ className: '', iconSize: [0, 0], iconAnchor: [0, 0], html: `<div class="seglbl ${warn ? 'warn' : ''}" style="--c:${color}">${how ? howIcon(how, false) + ' ' + esc(String(how).length > 14 ? String(how).slice(0, 14) + '…' : how) : (MODE_ICON[mode] ? ic(MODE_ICON[mode]) : '')}${timeTxt ? ` · ${esc(timeTxt)}` : ''}${warn ? ' ' + ic('warn') : ''}</div>` });
const arrowIcon = (deg, color) => L.divIcon({ className: '', iconSize: [20, 20], iconAnchor: [10, 10], html: `<svg viewBox="0 0 24 24" width="20" height="20" style="transform:rotate(${deg}deg);display:block"><path d="M4 12h14M12 5l7 7-7 7" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12h14M12 5l7 7-7 7" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>` });
/* stops whose activity is over (today: we have left / passed the time; earlier days: all) are not drawn */
function stillAhead(di, seq) {
  const d = data.plan.days[di]; if (!d || !d.dt) return seq;
  if (isPast(d)) return data.plan.days.every(x => !x.dt || isPast(x)) ? seq : [];
  if (!isToday(d)) return seq;
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  return seq.filter((w, k) => { const nx = seq[k + 1], end = nx ? (wpMin(nx.ts) ?? wpMin(nx.time)) : wpMin(w.time); return end == null || end >= now; });
}
function drawPlaces() {
  if (!map || !plLayer) return []; plLayer.clearLayers(); Object.keys(wpMark).forEach(k => delete wpMark[k]);
  if (!ui.f.route) return [];
  const all = [];
  for (const di of scopeDays()) {
    const color = COLORS[di % 8], seq = stillAhead(di, dayWaypoints(di).map(w => ({ ...w, c: coordOf(w.q) })).filter(w => w.c));
    const groups = [];                                            // visits to the same place (<40 m) share ONE pin
    seq.forEach((w, k) => { w.num = k + 1; let g = groups.find(x => distM(x.c, w.c) < 40); if (!g) groups.push(g = { c: w.c, v: [] }); w.g = g; g.v.push(w); });
    all.push(...groups.map(g => [g.c.lat, g.c.lng]));
    const pairN = {}, dirN = {}, pk = (A, B) => [groups.indexOf(A), groups.indexOf(B)].sort().join('-');
    for (let i = 0; i < seq.length - 1; i++) if (seq[i].g !== seq[i + 1].g) pairN[pk(seq[i].g, seq[i + 1].g)] = (pairN[pk(seq[i].g, seq[i + 1].g)] || 0) + 1;
    for (let i = 0; i < seq.length - 1; i++) {
      const A = seq[i].g, B = seq[i + 1].g; if (A === B) continue;
      const a = A.c, b = B.c, d = distM(a, b), how = seq[i + 1].how, key = groups.indexOf(A) + '>' + groups.indexOf(B);
      const f = pairN[pk(A, B)] > 1 ? 0.16 * (1 + 0.9 * (dirN[key] = (dirN[key] ?? -1) + 1)) : 0;   // roads used twice are drawn as separate arcs
      const cl = Math.cos(a.lat * Math.PI / 180), dx = (b.lng - a.lng) * cl, dy = b.lat - a.lat;
      const ctl = { x: (a.lng + b.lng) / 2 * cl - dy * 2 * f, y: (a.lat + b.lat) / 2 + dx * 2 * f };
      const pt = t => { const u = 1 - t; return f ? { lat: u * u * a.lat + 2 * u * t * ctl.y + t * t * b.lat, lng: (u * u * a.lng * cl + 2 * u * t * ctl.x + t * t * b.lng * cl) / cl } : { lat: a.lat + dy * t, lng: a.lng + (b.lng - a.lng) * t }; };
      const path = f ? Array.from({ length: 21 }, (_, n) => pt(n / 20)).map(q => [q.lat, q.lng]) : [[a.lat, a.lng], [b.lat, b.lng]];
      L.polyline(path, { color: '#fff', weight: 9, opacity: .95, lineCap: 'round' }).addTo(plLayer);
      L.polyline(path, { color, weight: 4, opacity: 1, dashArray: '10 9', lineCap: 'round' }).addTo(plLayer);
      if (d < 80) continue;
      const info = legInfo(a, b, how), tt = info.air ? fmtKm(info.m) : (info.loading || info.skip ? '' : `${info.est ? '~' : ''}${fmtDur(info.min)}`), wn = tight(info, seq[i + 1]) != null;
      const showLbl = d >= 150 && (how || tt), ta = showLbl ? .66 : .5, tb = showLbl ? .36 : .5, p1 = pt(ta - .04), p2 = pt(ta + .04), pa = pt(ta), pl = pt(tb);
      L.marker([pa.lat, pa.lng], { icon: arrowIcon(bearing(p1, p2), color), interactive: false }).addTo(plLayer);
      if (showLbl) L.marker([pl.lat, pl.lng], { icon: legIcon(how, color, tt, wn, info.mode), interactive: false, zIndexOffset: 300 }).addTo(plLayer);
    }
    groups.forEach(g => {
      const lbl = g.v.map(w => w.num).join('·'), body = g.v.map(w => { const k = seq.indexOf(w), lt = k ? legText(legInfo(seq[k - 1].c, w.c, w.how), w) : ''; return `<b>${w.num}. ${esc(w.name)}</b><br>${esc(w.day)} ${esc(w.time)}${w.how ? `<br>มาโดย ${howIcon(w.how, false)} ${esc(w.how)}` : ''}${lt && seq[k - 1].g !== g ? `<br>เดินทางจากจุดก่อนหน้า: ${esc(lt)}` : ''}`; }).join('<hr style="border:0;border-top:1px solid #0002;margin:6px 0">');
      const m = L.marker([g.c.lat, g.c.lng], { icon: placeIcon(lbl, di), zIndexOffset: 500 }).addTo(plLayer).bindPopup(`${body}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${g.c.lat},${g.c.lng}" target="_blank" rel="noopener">นำทางด้วย Google Maps</a>`);
      g.v.forEach(w => { wpMark[`${di}|${w.q}`] = m; });
    });
  }
  return all;
}
function drawSpots() {
  if (!map || !spLayer) return []; spLayer.clearLayers(); sgLayer.clearLayers(); const pts = [];
  const hot = new Set(spotMatches().items.filter(m => scopeDays().includes(m.di)).map(m => m.spot.name));
  for (const s of allSpots()) {
    if (!ui.f[s.type]) continue; const c = s.c; if (!c) continue; pts.push([c.lat, c.lng]);
    L.marker([c.lat, c.lng], { icon: spotIcon(s.type, s.src === 'idea', hot.has(s.name)) }).addTo(spLayer).bindPopup(`<b>${esc(s.name)}</b><br>${[s.cuisine, s.meal].filter(Boolean).map(esc).join(' · ')}${s.note ? '<br><small>' + esc(s.note) + '</small>' : ''}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}" target="_blank" rel="noopener">นำทางด้วย Google Maps</a>`);
  }
  (ui.sugPins || []).forEach(x => { L.marker([x.lat, x.lng], { icon: sugIcon(x.kind) }).addTo(sgLayer).bindPopup(`<b>${esc(x.name)}</b><br>${esc(x.sub || '')}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lng}" target="_blank" rel="noopener">นำทางด้วย Google Maps</a>`); pts.push([x.lat, x.lng]); });
  return pts;
}
/* ---------- spots: restaurants / sights saved in the Places tab + nearby suggestions ---------- */
function allSpots() {
  const sheet = data.spots.map(s => ({ ...s, c: { lat: s.lat, lng: s.lng } }));
  const ideas = ideaSpots().map(s => ({ ...s, c: coordOf(s.q) || null }));
  return [...sheet, ...ideas];
}
const slotOf = (d = new Date()) => { const h = d.getHours() + d.getMinutes() / 60; return h < 5 ? 'late' : h < 10.5 ? 'morning' : h < 14.5 ? 'lunch' : h < 17.5 ? 'afternoon' : h < 22 ? 'dinner' : 'late'; };
const slotOfMin = m => slotOf(new Date(2000, 0, 1, Math.floor(m / 60), m % 60));
const mealMatches = (meal, slot) => { const m = String(meal || ''); if (!m || /ทุกมื้อ|any/i.test(m)) return true; return ({ morning: /เช้า|breakfast|brunch/i, lunch: /กลางวัน|เที่ยง|lunch/i, afternoon: /บ่าย|คาเฟ่|ของหวาน|cafe|dessert|snack/i, dinner: /เย็น|ค่ำ|dinner/i, late: /ดึก|late|bar|night/i })[slot].test(m); };
const nice = s => String(s || '').replace(/_/g, ' ').split(';').filter(Boolean).slice(0, 3).join(' / ');
const dist = d => d < 1000 ? `${Math.max(10, Math.round(d / 10) * 10)} ม.` : `${(d / 1000).toFixed(1)} กม.`;
const walk = d => `เดิน ${Math.max(1, Math.round(d / 80))} นาที`;
function anchorOptions() {
  const o = []; if (data.me) o.push({ id: 'me', label: 'ตำแหน่งของฉัน', c: { lat: data.me.lat, lng: data.me.lng } });
  const p = data.plan; if (p && p.days.length) { planDates(p); let di = p.days.findIndex(isToday); if (di < 0) di = ui.day || 0; dayWaypoints(di).forEach((w, k) => { const c = coordOf(w.q); if (c) o.push({ id: 'w' + di + '_' + k, label: 'ใกล้ ' + w.name, c }); }); }
  return o;
}
const currentAnchor = () => { const o = anchorOptions(); return o.find(x => x.id === ui.anchor) || o[0] || null; };
function focusOnMap(c) { openMapOv(); setTimeout(() => { if (map) map.setView([c.lat, c.lng], 17); }, 300); }
function spotCard(s, a) {
  const [ik, col] = SPOT[s.type], d = a && s.c ? distM(a.c, s.c) : null;
  return `<div class="spot"><div class="spot-i" style="--c:${col}">${ic(ik)}</div><div class="spot-b"><b>${esc(s.name)}</b><small>${[nice(s.cuisine), s.meal, d != null ? dist(d) : ''].filter(Boolean).map(esc).join(' · ')}</small>${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
  <div class="spot-a">${s.c ? `<a class="tag" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${s.c.lat},${s.c.lng}">นำทาง</a><button class="tag" data-focus="${esc(s.name)}">ดูบนแผนที่</button>` : `<button class="tag" data-fix="${esc(s.q || s.name)}">ตั้งพิกัด</button>`}<button class="tag pri" data-pick="${esc(s.name)}">+ เพิ่มเข้าแผน</button></div></div></div>`;
}
function listHtml() {
  const a = currentAnchor(), f = ui.spotFilter || 'all', all = allSpots(), cnt = t => all.filter(s => s.type === t).length;
  let h = `<div class="card"><label style="margin-top:0">เพิ่มสถานที่ — วางลิงก์ Google Maps</label><div class="addrow"><input id="linkIn" inputmode="url" placeholder="วางลิงก์ที่นี่ แล้วระบบหาพิกัดให้"><button class="btn pri" id="linkGo">เพิ่ม</button></div></div>`;
  h += `<div class="chips">${[['all', '', 'ทั้งหมด', all.length], ['food', 'food', 'ร้านอาหาร', cnt('food')], ['sight', 'sight', 'ที่เที่ยว', cnt('sight')], ['other', 'pin', 'อื่นๆ', cnt('other')]].map(([k, i, l, n]) => `<button class="tag ${f === k ? 'on' : ''}" data-sf="${k}">${i ? ic(i) + ' ' : ''}${l} <small>${n}</small></button>`).join('')}</div>`;
  const list = all.filter(s => f === 'all' || s.type === f).sort((x, y) => (a && x.c && y.c) ? distM(a.c, x.c) - distM(a.c, y.c) : 0);
  h += list.length ? list.map(s => spotCard(s, a)).join('') : '<div class="empty">ยังไม่มีสถานที่<br><small>วางลิงก์ Google Maps ด้านบนเพื่อเพิ่ม</small></div>';
  if (a) h += `<div class="mut" style="text-align:center"><small>ระยะทางนับจาก: ${esc(a.label)}</small></div>`;
  return h;
}

/* ---- suggestions: ONLY places from your own list, ONLY where the plan already goes (on the way, or close to a stop) ---- */
const fmtMin = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const wpMin = t => { const x = tm(t); return x ? x[0] * 60 + x[1] : null; };
function estimateTimes(wps) {
  const n = wps.length, known = wps.map((w, i) => w.m != null ? i : -1).filter(i => i >= 0);
  if (!known.length) { wps.forEach((w, i) => { w.m = n === 1 ? 750 : Math.round(540 + (600 * i) / (n - 1)); w.est = true; }); return wps; }
  wps.forEach((w, i) => {
    if (w.m != null) return; w.est = true;
    const prev = [...known].reverse().find(k => k < i), next = known.find(k => k > i);
    if (prev != null && next != null) w.m = Math.round(wps[prev].m + (wps[next].m - wps[prev].m) * (i - prev) / (next - prev));
    else if (prev != null) w.m = Math.min(1380, wps[prev].m + 60 * (i - prev));
    else w.m = Math.max(360, wps[next].m - 60 * (next - i));
  });
  return wps;
}
const NEAR_STOP = 700, DETOUR_MAX = 450;     // metres: "close to a stop" / extra walking if it is on the way
/* does it make sense time-wise? (visit length, gap to the next stop, meal slot, opening hours, already past) */
const visitMin = s => s.type === 'food' ? (/ทุกมื้อ|any/i.test(s.meal || '') || !s.meal ? 40 : 50) : s.type === 'sight' ? 60 : 30;
function timeOk(s, c, a, b, di) {
  const m = c.m, h = m / 60, V = visitMin(s);
  if (isToday(data.plan.days[di]) && m < new Date().getHours() * 60 + new Date().getMinutes()) return false;   // already past
  if (h < (s.type === 'food' ? 7 : 9) || h > (s.type === 'food' ? 23 : 19)) return false;                    // sleeping / closed hours
  if (!c.est && s.type === 'food' && s.meal && !mealMatches(s.meal, slotOfMin(m))) return false;              // wrong meal for that hour
  if (b && !a.est && !b.est) {                                                                                // enough room before the next fixed time
    const leg = distM(a.c, b.c), extra = c.kind === 'onway' ? c.detour / 80 : 2 * c.d / 80;
    if (b.m - a.m < leg / 250 + extra + V + 10) return false;
  }
  return true;
}
function spotMatches() {
  const p = data.plan; if (!p) return { items: [], pending: 0 }; planDates(p);
  const list = data.spots.map(s => ({ ...s, c: { lat: s.lat, lng: s.lng } })); let pending = 0;
  const days = [];
  p.days.forEach((d, di) => {
    if (isPast(d)) return;
    const all = estimateTimes(dayWaypoints(di).map(w => ({ ...w, m: wpMin(w.time) })));
    pending += all.filter(w => !knownQ(w.q)).length;
    const wps = all.map(w => ({ ...w, c: coordOf(w.q) })).filter(w => w.c); if (wps.length) days.push({ di, wps });
  });
  const planned = days.flatMap(x => x.wps);
  const items = [];
  for (const s of list) {
    if (planned.some(w => distM(w.c, s.c) < 80)) continue;                  // already part of the plan (any upcoming day)
    for (const { di, wps } of days) {                                       // earliest day where it fits
      let cand = null;
      for (let i = 0; i < wps.length; i++) {
        const a = wps[i], dA = distM(a.c, s.c);
        if (dA <= NEAR_STOP && (!cand || dA < cand.score)) { const c = { kind: 'near', stop: a, d: dA, score: dA, m: a.m, est: !!a.est, pos: i }; if (timeOk(s, c, a, wps[i + 1], di)) cand = c; }
        if (i < wps.length - 1) {
          const b = wps[i + 1], leg = distM(a.c, b.c), dB = distM(s.c, b.c);
          if (leg >= 150 && dA < leg && dB < leg) { const detour = dA + dB - leg, sc = detour * 0.6; if (detour <= DETOUR_MAX && (!cand || sc < cand.score)) { const c = { kind: 'onway', from: a, to: b, detour, score: sc, m: Math.round((a.m + b.m) / 2), est: !!(a.est || b.est), pos: i + .5 }; if (timeOk(s, c, a, b, di)) cand = c; } }
        }
      }
      if (cand) { items.push({ spot: s, di, ...cand }); break; }
    }
  }
  return { items: items.sort((x, y) => x.di - y.di || x.pos - y.pos), pending };
}
function sugCard(it, idx) {
  const s = it.spot, [ik, col] = SPOT[s.type], slot = slotOfMin(it.m);
  const ctx = it.kind === 'onway' ? `${ic('route')} ผ่านทางอยู่แล้ว ระหว่าง <b>${esc(it.from.name)}</b> → <b>${esc(it.to.name)}</b> · แวะเพิ่มประมาณ ${Math.max(1, Math.round(it.detour / 80))} นาที`
    : `${ic('pin')} ใกล้ <b>${esc(it.stop.name)}</b> · ${walk(it.d)}จากจุดนั้น`;
  const fit = s.type === 'food' && s.meal && mealMatches(s.meal, slot) ? `<span class="chip ok">เหมาะกับมื้อ${esc(s.meal)}</span>` : '';
  return `<div class="spot"><div class="spot-i" style="--c:${col}">${ic(ik)}</div><div class="spot-b"><b>${esc(s.name)}</b><small>${[nice(s.cuisine), s.meal].filter(Boolean).map(esc).join(' · ')}</small>
  <div class="ctx">${ctx}</div><div>${fit}<span class="chip">ช่วง ~${fmtMin(it.m)}${it.est ? ' (ประมาณ)' : ''}</span></div>${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
  <div class="spot-a"><button class="tag pri" data-addplan="${idx}">+ เพิ่มเข้าแผน</button><a class="tag" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${s.c.lat},${s.c.lng}">นำทาง</a><button class="tag" data-focus="${esc(s.name)}">ดูบนแผนที่</button></div></div></div>`;
}
function sugHtml() {
  const { items, pending } = spotMatches(), p = data.plan; ui._sug = items;
  let h = '';
  if (!data.spots.length) return h + '<div class="empty">ยังไม่มีสถานที่ในลิส<br><small>กด + หรือวางลิงก์ Google Maps ในแท็บ “ลิสทั้งหมด”</small></div>';
  if (pending) h += `<div class="mut" style="font-size:.82rem;margin:2px 4px">${ic('hourglass')} กำลังหาพิกัดจุดในแผนอีก ${pending} จุด…</div>`;
  if (!items.length) return h + (pending ? '' : '<div class="empty">ยังไม่มีสถานที่ในลิสที่อยู่ใกล้เส้นทางตามแผน<br><small>เพิ่มสถานที่ใหม่ หรือเพิ่มจุดในแผนแถวนั้น แล้วจะแนะนำให้เอง</small></div>');
  let lastDi = -1;
  items.forEach((it, idx) => { if (it.di !== lastDi) { lastDi = it.di; h += `<div class="dgroup">${esc(dayTitle(p.days[it.di], it.di))}</div>`; } h += sugCard(it, idx); });
  return h;
}
/* insert the place as a stop in the plan, right after the stop it is near / on the way from */
async function addSpotToPlan(it) {
  if (!sheetApi.on()) return googleDialog('เพิ่มเข้าแผนได้เมื่อเข้าสู่ระบบด้วย Google');
  if (!auth.valid()) { try { await signIn(); } catch (e) { return toast(e.message, 4500); } }
  const p = data.plan, d = p.days[it.di], ix = p.cols, afterQ = (it.kind === 'onway' ? it.from : it.stop).q;
  const k = d.steps.findIndex(st => qName(st.to) === afterQ);                                   // step that arrives at the stop
  const t = d.steps.findIndex((st, i) => i > k && qName(st.from) === afterQ && (st.to || st.from));   // step that leaves it
  const fromName = k >= 0 ? d.steps[k].to : (t >= 0 ? d.steps[t].from : (it.kind === 'onway' ? it.from : it.stop).name);
  const setCell = (row, c, v) => { if (c >= 0) { while (row.length <= c) row.push(''); row[c] = v; } };
  const row = []; setCell(row, ix.sl, fromName); setCell(row, ix.al, it.spot.name);
  const at = t >= 0 ? t : k + 1;                                                                 // right before the departing step, so notes like "ผ่านตม." stay where they were
  d.steps.splice(at, 0, stepFromRow(row, ix, at === 0));
  if (t >= 0) { const nx = d.steps[at + 1]; setCell(nx._row, ix.sl, it.spot.name); d.steps[at + 1] = stepFromRow(nx._row, ix, false); }
  ui.day = it.di; renderPlan(); renderSpots(); scheduleSave(); toast(`เพิ่ม “${it.spot.name}” เข้าแผน ${dayTitle(d, it.di)} แล้ว`, 3500);
}
function removeIdea(gi, ii) {
  const p = data.plan, g = p && p.ideas[gi]; if (!g || !g.rows || !g.rows[ii]) return;
  const { r, head } = g.rows[ii];
  if (head) { if (p.cols.sl >= 0) r[p.cols.sl] = ''; } else { const k = p.tail.indexOf(r); if (k >= 0) p.tail.splice(k, 1); }
  g.items.splice(ii, 1); g.rows.splice(ii, 1);
}
/* put any place (an idea from the plan sheet or a saved place) into a chosen day, at a chosen time */
async function addToPlanDialog(name, idea) {
  if (!sheetApi.on()) return googleDialog('เพิ่มเข้าแผนได้เมื่อเข้าสู่ระบบด้วย Google');
  if (!auth.valid()) { try { await signIn(); } catch (e) { return toast(e.message, 4500); } }
  const p = data.plan; if (!p || !p.days.length) return toast('ยังไม่มีวันในแผน');
  planDates(p); const cur = ui.day != null && ui.day < p.days.length ? ui.day : 0;
  const d = openDlg(`<form method="dialog"><h3>เพิ่มเข้าแผน</h3><div class="mut" style="margin-bottom:6px"><b>${esc(name)}</b></div>
  <label>วัน</label><select name="day">${p.days.map((x, i) => `<option value="${i}" ${i === cur ? 'selected' : ''}>${esc(dayTitle(x, i))}${x.city ? ' · ' + esc(x.city) : ''}</option>`).join('')}</select>
  <label>เวลาออกเดินทาง (ไม่ใส่ = ต่อท้ายวัน)</label><input name="time" type="time">
  <label>วิธีเดินทาง</label><input name="how" placeholder="Walk / Taxi / Metro"><div class="chips reuse" id="reuseHow2">${reuseLists().how.map(n => `<button type="button" class="tag" data-v="${esc(n)}">${esc(n)}</button>`).join('')}</div>
  <label>เวลาเดินทาง (นาที)</label><input name="trav" type="number" inputmode="numeric" min="0" placeholder="เช่น 20">
  <div class="btns"><button value="ok" class="btn pri">เพิ่มเข้าแผน</button><button value="x" class="btn" formnovalidate>ยกเลิก</button></div></form>`);
  $$('#reuseHow2 .tag', d).forEach(b => b.onclick = () => { $('form', d).elements.how.value = b.dataset.v; });
  $('form', d).onsubmit = ev => {
    if (ev.submitter && ev.submitter.value !== 'ok') return;
    const f = new FormData(ev.target), di = +f.get('day'), t = String(f.get('time') || '');
    const day = p.days[di], ix = p.cols, mins = t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : null;
    let at = day.steps.length;
    if (mins != null) { const k = day.steps.findIndex(st => { const x = tm(st.time); return x && x[0] * 60 + x[1] > mins; }); if (k >= 0) at = k; }
    const prev = at > 0 ? day.steps[at - 1] : null, from = prev ? (prev.to || prev.from || '') : '';
    const setCell = (row, c, v) => { if (c >= 0) { while (row.length <= c) row.push(''); row[c] = v; } };
    const row = []; if (t) setCell(row, ix.st, t.replace(':', '.')); setCell(row, ix.sl, from); setCell(row, ix.al, name);
    if (String(f.get('how') || '').trim()) setCell(row, ix.how, String(f.get('how')).trim());
    if (t && f.get('trav') !== '' && +f.get('trav') >= 0) setCell(row, ix.at, fmtT(mins + +f.get('trav')));
    day.steps.splice(at, 0, stepFromRow(row, ix, at === 0));
    const nx = day.steps[at + 1];
    if (nx && from && qName(nx.from) === qName(from)) { setCell(nx._row, ix.sl, name); day.steps[at + 1] = stepFromRow(nx._row, ix, false); }
    if (idea) removeIdea(idea.gi, idea.ii);
    ui.day = di; renderPlan(); if (ui.tab === 'spots') renderSpots(); scheduleSave(); toast(`เพิ่ม “${name}” เข้า ${dayTitle(day, di)} แล้ว`, 3500);
  };
}
const TIP = { travel: ['car', '#2f7bff', 'เดินทาง'], food: ['food', '#ff7a45', 'ร้านอาหาร'], cafe: ['cafe', '#a06bff', 'คาเฟ่'] };
function tipsHtml() {
  const all = data.tips || [], f = ui.tipFilter || 'all';
  if (!all.length) return '<div class="empty">ยังไม่มีคำแนะนำ<br><small>เพิ่มข้อมูลแท็บ “Tips” (Type, Name, Detail, BestTime, Source)</small></div>';
  const list = all.filter(x => f === 'all' || x.type === f), cnt = t => all.filter(x => x.type === t).length;
  let h = `<div class="chips">${[['all', '', 'ทั้งหมด', all.length], ['travel', 'car', 'เดินทาง', cnt('travel')], ['food', 'food', 'อาหาร', cnt('food')], ['cafe', 'cafe', 'คาเฟ่', cnt('cafe')]].map(([k, i, l, n]) => `<button class="tag ${f === k ? 'on' : ''}" data-tf="${k}">${i ? ic(i) + ' ' : ''}${l} <small>${n}</small></button>`).join('')}</div>`;
  h += '<div class="mut" style="font-size:.78rem;margin:2px 4px 8px">เวลาที่แนะนำเป็นคำแนะนำทั่วไป ไม่ใช่เวลาเปิด-ปิดร้าน · ข้อมูลรวมจากไกด์/Reddit/Yandex — กดปุ่ม TikTok / Facebook เพื่อดูคลิปและรีวิวจริง</div>';
  h += list.map(x => {
    const [ik, col] = TIP[x.type] || TIP.food, q = encodeURIComponent(x.name.replace(/\(.*?\)/g, '').trim() + ' Almaty');
    const links = x.type === 'travel' ? '' : `<div class="spot-a"><a class="tag" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${q}">แผนที่</a><a class="tag" target="_blank" rel="noopener" href="https://www.tiktok.com/search?q=${q}">TikTok</a><a class="tag" target="_blank" rel="noopener" href="https://www.facebook.com/search/top?q=${q}">Facebook</a></div>`;
    return `<div class="spot"><div class="spot-i" style="--c:${col}">${ic(ik)}</div><div class="spot-b"><b>${esc(x.name)}</b>${x.detail ? `<div class="note">${esc(x.detail)}</div>` : ''}${x.when ? `<div class="ctx">${ic('clock')} ${esc(x.when)}</div>` : ''}${links}${x.src ? `<small class="src">แหล่งข้อมูล: ${esc(x.src)}</small>` : ''}</div></div>`;
  }).join('');
  return h;
}
function renderSpots() {
  const el = $('#tab-spots'); if (!el) return;
  const v = ui.spotView === 'list' ? 'list' : ui.spotView === 'tips' && (data.tips || []).length ? 'tips' : 'sug';
  el.innerHTML = `<div class="seg"><button data-v="sug" class="${v === 'sug' ? 'on' : ''}">แนะนำตามแผน</button><button data-v="list" class="${v === 'list' ? 'on' : ''}">ลิสทั้งหมด</button>${(data.tips || []).length ? `<button data-v="tips" class="${v === 'tips' ? 'on' : ''}">น่าไป</button>` : ''}</div>` + (v === 'sug' ? sugHtml() : v === 'tips' ? tipsHtml() : listHtml()) + '<button class="fab" id="addSpot" aria-label="เพิ่มสถานที่"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>';
  $$('[data-v]', el).forEach(b => b.onclick = () => { ui.spotView = b.dataset.v; renderSpots(); });
  $('#addSpot').onclick = () => spotDialog();
  $$('[data-tf]', el).forEach(b => b.onclick = () => { ui.tipFilter = b.dataset.tf; renderSpots(); });
  $$('[data-sf]', el).forEach(b => b.onclick = () => { ui.spotFilter = b.dataset.sf; renderSpots(); });
  $$('[data-focus]', el).forEach(b => b.onclick = () => { const x = allSpots().find(y => y.name === b.dataset.focus); if (x && x.c) focusOnMap(x.c); });
  $$('[data-pick]', el).forEach(b => b.onclick = () => {
    const n = b.dataset.pick; let idea = null;
    (data.plan ? data.plan.ideas : []).forEach((g, gi) => { const ii = g.items.indexOf(n); if (!idea && ii >= 0) idea = { gi, ii }; });
    addToPlanDialog(n, idea);
  });
  $$('[data-fix]', el).forEach(b => b.onclick = () => placeDialog(b.dataset.fix));
  $$('[data-addplan]', el).forEach(b => b.onclick = () => { const it = (ui._sug || [])[+b.dataset.addplan]; if (it) addSpotToPlan(it); });
  const gi = $('#linkIn'), go = $('#linkGo');
  if (gi) { gi.onpaste = () => setTimeout(() => { if (gi.value.trim()) spotDialog({ url: gi.value.trim() }); }, 50); go.onclick = () => spotDialog({ url: gi.value.trim() }); }
  if (ui.tab === 'spots' && v === 'sug' && data.spots.length) runGeocode();   // make sure the plan's stops have coordinates
}
/* paste a Google Maps link -> name + coordinates */
async function detectLink(url) {
  url = String(url || '').trim(); if (!url) return null;
  const nm = u => { try { const m = decodeURIComponent(u).match(/\/place\/([^/@?]+)/); return m ? m[1].replace(/\+/g, ' ').trim() : ''; } catch { return ''; } };
  let c = coordsInText(url), name = nm(url);
  if (!c && /(goo\.gl|maps\.app)/i.test(url)) throw new Error('ลิงก์สั้นอ่านพิกัดไม่ได้ — เปิดลิงก์แล้วคัดลอก “ลิงก์เต็ม” จากแถบ URL (หรือวางพิกัด เช่น 43.26, 76.95)');
  return c ? { ...c, name } : null;
}
function spotDialog(init = {}) {
  let type = init.type || 'sight', meal = init.meal || '', c = init.lat != null ? { lat: init.lat, lng: init.lng } : null, tok = 0, timer;
  const meals = ['เช้า', 'กลางวัน', 'เย็น', 'คาเฟ่', 'ของหวาน', 'ดึก', 'ได้ทุกมื้อ'], p = data.plan;
  const d = openDlg(`<form method="dialog"><h3>เพิ่มสถานที่</h3>
  <label>วางลิงก์ Google Maps</label><input name="u" inputmode="url" value="${esc(init.url || '')}" placeholder="https://maps.app.goo.gl/… หรือ 43.26, 76.95" ${c ? 'disabled' : ''}>
  <div id="detect" class="mut" style="margin-top:6px;font-size:.85rem">${c ? `✓ พิกัด ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}` : ''}</div>
  <label>ชื่อสถานที่</label><input name="name" required value="${esc(init.name || '')}" placeholder="ชื่อร้าน / สถานที่">
  <label>ประเภท</label><div class="seg" id="typeSeg">${[['food', 'food', 'ร้านอาหาร'], ['sight', 'sight', 'ที่เที่ยว'], ['other', 'pin', 'อื่นๆ']].map(([k, i, l]) => `<button type="button" data-t="${k}" class="${k === type ? 'on' : ''}">${ic(i)} ${l}</button>`).join('')}</div>
  <div id="mealBox" ${type === 'food' ? '' : 'hidden'}><label>เหมาะกับมื้อ</label><div class="chips" style="margin:0;padding:0;flex-wrap:wrap">${meals.map(m => `<button type="button" class="tag ${m === meal ? 'on' : ''}" data-m="${m}">${m}</button>`).join('')}</div></div>
  <label>โน้ต (ไม่บังคับ)</label><input name="note">
  ${p && p.days.length ? `<label>เพิ่มเข้าแผนของวัน (ไม่บังคับ)</label><select name="day"><option value="">ไม่เพิ่มเข้าแผน</option>${p.days.map((x, k) => `<option value="${k}">${esc(dayTitle(x, k))}</option>`).join('')}</select>` : ''}
  <div class="btns"><button value="ok" class="btn pri">บันทึก</button><button value="x" class="btn" formnovalidate>ยกเลิก</button></div></form>`);
  const form = $('form', d), url = form.elements.u;
  const detect = async () => {
    const my = ++tok, box = $('#detect'); box.textContent = 'กำลังหาพิกัด…';
    try { const r = await detectLink(url.value); if (my !== tok) return; if (r) { c = { lat: r.lat, lng: r.lng }; box.textContent = `✓ พบพิกัด ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`; if (r.name && !form.elements.name.value) form.elements.name.value = r.name; } else { c = null; box.textContent = url.value.trim() ? 'อ่านพิกัดจากลิงก์ไม่ได้' : ''; } }
    catch (e) { if (my === tok) { c = null; box.textContent = e.message; } }
  };
  url.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(detect, 450); });
  if (init.url) detect();
  $$('#typeSeg button', d).forEach(b => b.onclick = () => { type = b.dataset.t; $$('#typeSeg button', d).forEach(x => x.classList.toggle('on', x === b)); $('#mealBox').hidden = type !== 'food'; });
  $$('[data-m]', d).forEach(b => b.onclick = () => { meal = meal === b.dataset.m ? '' : b.dataset.m; $$('[data-m]', d).forEach(x => x.classList.toggle('on', x.dataset.m === meal)); });
  form.onsubmit = ev => {
    if (ev.submitter && ev.submitter.value !== 'ok') return;
    if (!c) { ev.preventDefault(); toast('ยังไม่มีพิกัด — วางลิงก์ Google Maps ก่อน'); return; }
    const f = new FormData(form), name = f.get('name').trim(); if (!name) { ev.preventDefault(); return; }
    saveSpot({ name, lat: c.lat, lng: c.lng, type, meal: type === 'food' ? meal : '', cuisine: init.cuisine || '', note: f.get('note') || '', src: 'sheet' }, f.get('day'));
  };
}
async function saveSpot(s, dayIdx) {
  s.c = { lat: s.lat, lng: s.lng }; data.spots = data.spots.filter(x => norm(x.name) !== norm(s.name)); data.spots.push(s); data.places[norm(s.name)] = s.c;
  ui.ver++; renderSpots(); renderFilters(); drawMap(false);
  const row = [s.name, +s.lat.toFixed(6), +s.lng.toFixed(6), s.note, s.type, s.meal, s.cuisine];
  if (sheetApi.on()) { try { await sheetApi.call('upsert', { tab: trip().placesTab || 'Places', header: ['Name', 'Lat', 'Lng', 'Note', 'Type', 'Meal', 'Cuisine'], key: s.name, keyCol: 0, values: row }); toast('บันทึกแล้ว ✓'); } catch (e) { toast(e.message); } }
  else copyText(row.join('\t'), 'ยังไม่ได้เชื่อมต่อชีต — คัดลอกแถวแล้ว วางในแท็บ ' + (trip().placesTab || 'Places'));
  if (dayIdx !== '' && dayIdx != null && data.plan) {
    const d = data.plan.days[+dayIdx], ix = data.plan.cols, last = d.steps.length ? d.steps[d.steps.length - 1].to : '', r = [], set = (cc, v) => { if (cc >= 0) { while (r.length <= cc) r.push(''); r[cc] = v; } };
    set(ix.sl, last); set(ix.al, s.name); d.steps.push(stepFromRow(r, ix, false)); renderPlan();
    if (sheetApi.on()) scheduleSave(); else toast('เพิ่มเข้าแผนในเครื่องนี้เท่านั้น — เชื่อมต่อชีตเพื่อบันทึก');
  }
}

/* ---------- menu / settings / sheet connection ---------- */
const updAt = () => ui.updated ? ui.updated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—';
const renderUpd = () => { const u = $('#updAt'); if (u) u.textContent = updAt(); };
function renderMenu() {
  const el = $('#tab-menu'), on = sheetApi.on();
  let h = `<div class="card profile">${me ? avatar(me, 'lg') : '<span class="avatar lg" style="--c:#94a3b8">?</span>'}<div style="flex:1"><b style="font-size:1.1rem">${esc(me || 'ผู้เยี่ยมชม')}</b><div class="mut">${me ? 'กำลังใช้งานในชื่อนี้' : 'ยังไม่ได้เลือกผู้ใช้'}</div></div><button class="btn" id="bSwitch">สลับ</button></div>`;
  if (me && cfg.pendingPin[me]) h += `<div class="card" style="border-color:#ffb020"><h2>${ic('warn')} PIN ของคุณยังอยู่แค่ในเครื่องนี้</h2><div class="mut">ยังไม่ได้บันทึกลงฐานข้อมูล เปลี่ยนเครื่องแล้วจะต้องตั้ง PIN ใหม่ — กดปุ่มเพื่อบันทึก</div><div class="btns"><button class="btn pri" id="bPinSync">บันทึก PIN ลงชีตตอนนี้</button></div></div>`;
  h += editCard(); h += mediaCard(); h += usageCard();
  h += notifCard();
  h += `<div class="card"><div class="row2" style="margin:0"><div><h2>โหมดมืด</h2><small>ค่าเริ่มต้นเป็นโหมดสว่าง</small></div><button class="switch ${cfg.theme === 'dark' ? 'on' : ''}" id="bTheme" aria-label="สลับโหมดมืด"><i></i></button></div></div>`;
  h += `<div class="card"><h2 style="margin-bottom:6px">ทริป</h2>${tripFilterBar('data-tfm')}${tripItems('data-trip')}${trip().priv ? '' : '<div class="btns"><button class="btn" id="bNew">+ เพิ่มทริป</button><button class="btn" id="bSet">ตั้งค่าทริปนี้</button></div>'}</div>`;
  h += `<div class="card"><h2 style="margin-bottom:4px">สมาชิก</h2>${users().map(u => `<div class="row">${avatar(u.name, 'sm')}<div><b>${esc(u.name)}</b></div><div class="amt mut">${Object.entries(u.budgets || {}).map(([k, v]) => fmt(v) + ' ' + k).join(' · ') || '—'}</div></div>`).join('') || '<span class="mut">ยังไม่มี — เพิ่มในแท็บ ' + esc(trip().usersTab) + '</span>'}</div>`;
  h += data.extra.map(x => tableCard(x.name, x.rows)).join('');
  h += `<div class="btns" style="justify-content:center"><button class="btn" id="bReload">รีเฟรชข้อมูล</button></div><div style="text-align:center"><small>อัปเดตล่าสุด <span id="updAt">${updAt()}</span> · เวอร์ชัน ${esc(String(window.BUILD || 'dev').startsWith('__') ? 'dev' : window.BUILD)}</small></div>`;
  el.innerHTML = h;
  $('#bSwitch').onclick = () => $('#btnMe').click();
  const bp = $('#bPinSync'); if (bp) bp.onclick = async () => { await syncPendingPins(true); renderMenu(); if (!cfg.pendingPin[me]) toast('บันทึก PIN แล้ว — ใช้ได้ทุกเครื่อง', 3500); };
  const bg = $('#bGallery'); if (bg) bg.onclick = openGallery;
  const eu = $('#bUnlock'); if (eu) eu.onclick = () => askEditCode().then(() => renderMenu()).catch(() => { });
  const el2 = $('#bLock'); if (el2) el2.onclick = signOut;
  fillUsage();
  bindNotif(el);
  $('#bTheme').onclick = () => { cfg.theme = cfg.theme === 'dark' ? 'light' : 'dark'; saveCfg(); applyTheme(); renderMenu(); }; { const bn = $('#bNew'); if (bn) bn.onclick = newTripDialog; const bs2 = $('#bSet'); if (bs2) bs2.onclick = settingsDialog; }
  $('#bReload').onclick = async () => { toast('กำลังโหลด…', 1000); await load(); toast('อัปเดตแล้ว', 1200); };
  $$('[data-tfm]', el).forEach(b => b.onclick = () => { ui.tripFilter = b.dataset.tfm; renderMenu(); });
  $$('[data-trip]', el).forEach(b => b.onclick = () => { if (b.dataset.trip !== cfg.active) switchTrip(b.dataset.trip); });
}
function switchTrip(id, auto) {
  if (!auto) sess.set('tt.picked', '1');
  cfg.active = id; saveCfg(); ui.day = null; ui.edit = false; ui.centered = false; ui.stayOpen = false; ui.activeStep = null; ui.scroll = {}; ui.refit = true;
  const c = readCache(id);
  if (c) { ui.updated = new Date(c.t); applyData(dataFromCache(id, c), c.snap, true); } else { dim(true); renderMenu(); }          // last good copy, or the previous plan stays (dimmed) until the new one is ready
  load();
}
function tripPicker() {
  if (visibleTrips().length < 2) return;
  const draw = () => {
    const d = dlg.open ? dlg : null; if (!d) return;
    d.innerHTML = `<form method="dialog"><h3>เลือกทริป</h3>${tripFilterBar('data-tf2')}<div id="tpList">${tripItems('data-tp')}</div><div class="btns"><button value="x" class="btn">ปิด</button></div></form>`;
    $$('[data-tf2]', d).forEach(b => b.onclick = () => { ui.tripFilter = b.dataset.tf2; draw(); });
    $$('[data-tp]', d).forEach(b => b.onclick = () => { d.close(); if (b.dataset.tp !== cfg.active) switchTrip(b.dataset.tp); });
  };
  openDlg(''); draw();
}
$('#tripTitle').onclick = tripPicker;
const dlg = $('#dlg');
function openDlg(html) { dlg.innerHTML = html; dlg.showModal(); return dlg; }
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
function editCard() {
  if (trip().priv) return `<div class="card"><div class="row2"><h2>แก้ไขทริป</h2><span class="chip ok">ใช้ PIN ของคุณ</span></div><div class="mut">สมาชิกที่เข้าสู่ระบบด้วย PIN แก้แผนและบันทึกได้เลย ไม่ต้องใช้รหัสแก้ไข</div></div>`;
  const on = !!cfg.editCode;
  return `<div class="card"><div class="row2"><h2>แก้ไขทริป</h2><span class="chip ${on ? 'ok' : ''}">${on ? 'ปลดล็อกแล้ว' : 'ล็อกอยู่'}</span></div><div class="mut">${on ? 'แก้แผน เพิ่มค่าใช้จ่าย และเพิ่มสถานที่ได้ — ข้อมูลบันทึกลงฐานข้อมูล Supabase อัตโนมัติ' : 'ดูอย่างเดียว — ใส่รหัสแก้ไขเพื่อแก้แผน เพิ่มค่าใช้จ่าย/สถานที่'}</div><div class="btns">${on ? '<button class="btn" id="bLock">ล็อกเครื่องนี้</button>' : '<button class="btn pri" id="bUnlock">ใส่รหัสแก้ไข</button>'}</div></div>`;
}
const usageCard = () => '<div class="card" id="usageBox"><div class="row2"><h2>โควตาฟรี Supabase</h2></div><div class="mut">กำลังตรวจสอบ…</div></div>';
const mb = b => b < 102400 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
async function fillUsage() {
  const box = $('#usageBox'); if (!box) return;
  const LIM_DB = 500 * 1048576, LIM_EG = 5 * 1073741824, st = apiStat.get();
  const bar = (v, lim) => { const p = Math.min(100, v / lim * 100); return `<div class="track ${p > 80 ? 'over' : ''}"><i style="width:${Math.max(p, 1)}%"></i></div>`; };
  let u = null, err = '';
  try { if (fillUsage.c && Date.now() - fillUsage.c.t < 60000) u = fillUsage.c.u; else { u = await sbRpc('usage_stats', {}); fillUsage.c = { t: Date.now(), u }; } } catch (e) { err = e.message; }
  const rows = u ? Object.entries(u.tables || {}).map(([k, v]) => `${esc(k)} ${v}`).join(' · ') : '';
  box.innerHTML = `<div class="row2"><h2>โควตาฟรี Supabase</h2><small>แพ็กเกจ Free</small></div>
  ${u ? `<div class="usage"><span>ฐานข้อมูล</span><b>${mb(u.db_bytes)} / 500 MB (${(u.db_bytes / LIM_DB * 100).toFixed(1)}%)</b></div>${bar(u.db_bytes, LIM_DB)}<small class="mut">ข้อมูลแอป ${u.total_rows} แถว · ${rows}</small>` : `<div class="mut">วัดขนาดฐานข้อมูลไม่ได้: ${esc(err || '—')}<br><small>รันสคริปต์ docs/supabase_edit.sql เพื่อเปิดการวัดโควตา</small></div>`}
  <div class="usage" style="margin-top:10px"><span>ทราฟฟิกเดือนนี้ (เครื่องนี้)</span><b>~${mb(st.b)} / 5 GB · ${st.n} คำขอ</b></div>${bar(st.b, LIM_EG)}
  <small class="mut" style="display:block;margin-top:6px">ขีดจำกัดฟรี: ฐานข้อมูล 500 MB · ทราฟฟิก 5 GB/เดือน · ผู้ใช้ 50,000 คน/เดือน · ไม่มีการใช้งาน 7 วันโปรเจกต์จะถูกพัก (ตัวเลขทราฟฟิกนับเฉพาะเครื่องนี้ ไม่ใช่ยอดรวมทุกคน — ดูยอดจริงที่ Dashboard › Usage)</small>`;
}
function tripFields(t) {
  return `<label>ชื่อทริป</label><input name="name" value="${esc(t.name || '')}" required>
  <label>ลิงก์ Google Sheet (แชร์ “ทุกคนที่มีลิงก์ดูได้”)</label><input name="url" value="${t.id ? `https://docs.google.com/spreadsheets/d/${esc(t.id)}/edit?gid=${esc(t.planGid || '')}` : ''}" required>
  <details><summary>ขั้นสูง</summary>
  <label>gid แท็บแผน (ว่าง = แท็บแรก)</label><input name="planGid" value="${esc(t.planGid || '')}">
  <label>แท็บสมาชิก/งบ</label><input name="usersTab" value="${esc(t.usersTab || 'Users')}">
  <label>แท็บค่าใช้จ่าย</label><input name="expensesTab" value="${esc(t.expensesTab || 'Expenses')}">
  <label>แท็บตำแหน่ง</label><input name="locationsTab" value="${esc(t.locationsTab || 'Locations')}">
  <label>แท็บพิกัดสถานที่</label><input name="placesTab" value="${esc(t.placesTab || 'Places')}">
  <label>แท็บประมาณการ (ไม่บังคับ)</label><input name="costTab" value="${esc(t.costTab || '')}">
  <label>แท็บข้อมูลเพิ่มเติม (คั่นด้วย ,)</label><input name="extraTabs" value="${esc(t.extraTabs || '')}">
  <label>สกุลเงินหลัก</label><input name="currency" value="${esc(t.currency || 'THB')}"></details>`;
}
function readTrip(f, old) {
  const url = f.get('url'), m = url.match(/\/d\/([\w-]+)/); if (!m) { toast('ลิงก์ไม่ถูกต้อง'); return null; }
  const g = url.match(/gid=(\d+)/), same = old && old.id === m[1];
  return { id: m[1], name: f.get('name'), planGid: f.get('planGid') || (g ? g[1] : ''), usersTab: f.get('usersTab') || 'Users', expensesTab: f.get('expensesTab') || 'Expenses', locationsTab: f.get('locationsTab') || 'Locations', placesTab: f.get('placesTab') || 'Places', costTab: f.get('costTab') || '', extraTabs: f.get('extraTabs') || '', currency: (f.get('currency') || 'THB').toUpperCase() };
}
function settingsDialog() {
  const t = trip();
  const d = openDlg(`<form method="dialog"><h3>ตั้งค่าทริป</h3>${tripFields(t)}
  <details><summary>ทดสอบ</summary><label class="chk" style="display:flex;gap:8px;color:var(--ink)"><input type="checkbox" name="force" style="width:auto" ${cfg.forceLoc ? 'checked' : ''}> ข้ามเงื่อนไขเวลา — ขอตำแหน่งได้ทันที</label></details>
  <div class="btns"><button value="ok" class="btn pri">บันทึก</button><button value="del" class="btn danger" formnovalidate>ลบทริปนี้</button><button value="x" class="btn" formnovalidate>ปิด</button></div></form>`);
  $('form', d).onsubmit = ev => {
    const v = ev.submitter ? ev.submitter.value : 'ok', f = new FormData(ev.target);
    if (v === 'del') { if (cfg.trips.length > 1 && confirm('ลบทริปนี้ออกจากรายการ (ไม่กระทบชีตจริง)?')) { cfg.trips = cfg.trips.filter(x => x.id !== t.id); cfg.active = cfg.trips[0].id; saveCfg(); load(); } return; }
    if (v !== 'ok') return;
    const nt = readTrip(f, t); if (!nt) return;
    Object.assign(t, nt); cfg.active = nt.id; cfg.forceLoc = f.get('force') === 'on'; stopLocation(); geo.state = 'idle'; saveCfg(); load();
  };
}
function newTripDialog() {
  const d = openDlg(`<form method="dialog"><h3>เพิ่มทริป</h3>${tripFields({ name: '', currency: 'THB' })}<div class="btns"><button value="ok" class="btn pri">เพิ่ม</button><button value="x" class="btn" formnovalidate>ยกเลิก</button></div></form>`);
  $('form', d).onsubmit = ev => {
    if (ev.submitter && ev.submitter.value !== 'ok') return; const nt = readTrip(new FormData(ev.target)); if (!nt) return;
    cfg.trips = cfg.trips.filter(x => x.id !== nt.id).concat(nt); cfg.active = nt.id; ui.day = null; saveCfg(); load();
  };
}

/* ---------- countdown + reminders + calendar export ---------- */
cfg.notif = cfg.notif || { on: false, lead: 15, per: {}, fired: {} };
let evMapCur = {};
function planEvents() {
  const p = data.plan; if (!p) return []; planDates(p); const out = [];
  p.days.forEach((d, di) => {
    if (!d.dt) return;
    d.steps.forEach((st, si) => {
      let t = st.time ? tm(st.time) : null;
      if (!t && st.text) { const m = String(st.text).match(/^\s*(\d{1,2}[.:]\d{2})/); if (m) t = tm(m[1]); }
      if (!t) return;
      const dt = at(d.dt, t), e2 = tm(st.toTime), end = e2 ? at(d.dt, e2) : null; if (end && end <= dt) end.setDate(end.getDate() + 1);
      out.push({ key: [trip().id, d.label, st.time || '', st.from || '', st.to || '', String(st.text || '').slice(0, 30)].join('|'), dt, end, di, si, title: st.text || [st.from, st.to].filter(Boolean).join(' → '), how: st.how || '', to: st.to || '', note: st.note || '' });
    });
  });
  return out.sort((a, b) => a.dt - b.dt);
}
const remOn = ev => { const v = cfg.notif.per[ev.key]; return v !== undefined ? v : cfg.notif.on; };
const pad2 = n => String(n).padStart(2, '0');
function fmtCd(ms) {
  ms = Math.max(0, ms); const t = Math.floor(ms / 1000), d = Math.floor(t / 86400), h = Math.floor(t % 86400 / 3600), m = Math.floor(t % 3600 / 60), sc = t % 60;
  return (d ? `${d} วัน ` : '') + `${pad2(h)}:${pad2(m)}:${pad2(sc)}`;
}
const nextEvent = () => planEvents().find(e => e.dt.getTime() > Date.now()) || null;
const bell = (di, k) => { const e = evMapCur[di + '|' + k]; if (!e || e.dt < Date.now() - 36e5) return ''; return `<button class="bellbtn sm ${remOn(e) ? 'on' : ''}" data-bell="${esc(e.key)}" aria-label="เตือน">${ic(remOn(e) ? 'bell' : 'bellOff')}</button>`; };
function bindBells(el) {
  $$('[data-bell]', el).forEach(b => b.onclick = async ev => {
    ev.stopPropagation(); const key = b.dataset.bell, e = planEvents().find(x => x.key === key); if (!e) return;
    const next = !remOn(e); cfg.notif.per[key] = next; saveCfg();
    if (next) { const ok = await ensurePermission(); toast(ok ? `จะเตือน ${cfg.notif.lead} นาทีก่อนถึงเวลา` : 'ตั้งเตือนในแอปแล้ว (ยังไม่ได้อนุญาตการแจ้งเตือนของเบราว์เซอร์ — เปิดได้ในแท็บเมนู)', 3500); } else toast('ยกเลิกการเตือนรายการนี้');
    renderPlan();
  });
}
async function ensurePermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
}
async function notify(title, body, tag) {
  toast(`${title} — ${body}`, 9000);
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch { }
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opt = { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: location.href } };
  try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) { await reg.showNotification(title, { ...opt, vibrate: [200, 100, 200] }); return; } } catch { }
  try { new Notification(title, opt); } catch { }
}
function checkReminders() {
  const now = Date.now(), lead = cfg.notif.lead * 60000; let changed = false;
  for (const e of planEvents()) {
    if (!remOn(e)) continue; const id = e.key + '|' + cfg.notif.lead, fireAt = e.dt.getTime() - lead;
    if (now >= fireAt && now < e.dt.getTime() && !cfg.notif.fired[id]) {
      cfg.notif.fired[id] = now; changed = true;
      const mins = Math.max(1, Math.round((e.dt.getTime() - now) / 60000));
      notify(`อีก ${mins} นาที · ${pad2(e.dt.getHours())}:${pad2(e.dt.getMinutes())}`, e.title + (e.how ? ` (${e.how})` : ''), id);
    }
  }
  for (const k of Object.keys(cfg.notif.fired)) if (now - cfg.notif.fired[k] > 7 * 864e5) { delete cfg.notif.fired[k]; changed = true; }
  if (changed) saveCfg();
}
function tickCountdown() {
  const el = $('#cdTime'); if (!el) return;
  const e = nextEvent(), box = $('#cd');
  if (ui.tab !== 'plan' && (!e || (box && box.dataset.key !== e.key))) { ui.ver++; return; }
  if (!e || (box && box.dataset.key !== e.key)) { keepScroll(renderPlan); return; }
  el.textContent = fmtCd(e.dt - Date.now());
}
/* calendar export: the phone's calendar app does the reminding, even when this app is closed */
const icsEsc = t => String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsFold(line) {
  const enc = new TextEncoder(); let out = '', cur = '', len = 0;
  for (const ch of line) { const b = enc.encode(ch).length; if (len + b > 74) { out += cur + '\r\n '; cur = ''; len = 1; } cur += ch; len += b; }
  return out + cur;
}
const icsDt = d => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
function hashStr(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(16); }
function buildIcs() {
  const lead = cfg.notif.lead, stamp = new Date().toISOString().replace(/[-:]|\.\d+/g, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Travel Tracker//TH', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEsc(trip().name)];
  planEvents().forEach(e => {
    const end = e.end || new Date(e.dt.getTime() + 45 * 60000), title = e.title + (e.how ? ` (${e.how})` : '');
    L.push('BEGIN:VEVENT', `UID:${hashStr(e.key)}-${e.dt.getTime()}@traveltracker`, 'DTSTAMP:' + stamp, 'DTSTART:' + icsDt(e.dt), 'DTEND:' + icsDt(end), 'SUMMARY:' + icsEsc(title));
    if (e.to) L.push('LOCATION:' + icsEsc(e.to));
    if (e.note) L.push('DESCRIPTION:' + icsEsc(e.note));
    L.push('BEGIN:VALARM', `TRIGGER:-PT${lead}M`, 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(title), 'END:VALARM', 'END:VEVENT');
  });
  L.push('END:VCALENDAR'); return L.map(icsFold).join('\r\n') + '\r\n';
}
function downloadIcs() {
  if (!planEvents().length) return toast('ยังไม่มีรายการที่ระบุเวลาในแผน — ใส่เวลาในคอลัมน์ Start time ก่อน');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buildIcs()], { type: 'text/calendar;charset=utf-8' })); a.download = (trip().name || 'trip').replace(/[^\w\-]+/g, '_') + '.ics';
  document.body.appendChild(a); a.click(); a.remove(); toast(`ส่งออก ${planEvents().length} รายการ — เปิดไฟล์เพื่อเพิ่มลงปฏิทิน (เตือน ${lead0()} นาทีก่อน)`, 4500);
}
const lead0 = () => cfg.notif.lead;
function notifCard() {
  const perm = !('Notification' in window) ? 'unsupported' : Notification.permission, n = planEvents().filter(e => (e.end || e.dt) > Date.now()).length;
  const chip = perm === 'granted' ? '<span class="chip ok">อนุญาตแล้ว</span>' : perm === 'denied' ? '<span class="chip bad">ถูกบล็อก</span>' : perm === 'unsupported' ? '<span class="chip bad">ไม่รองรับ</span>' : '<span class="chip">ยังไม่อนุญาต</span>';
  if (!n) return `<div class="card"><div class="row2"><h2>การแจ้งเตือน</h2>${chip}</div><small id="nEnded" style="display:block;margin-top:8px">ทริปนี้จบแล้ว — ไม่มีรายการให้เตือน</small></div>`;
  return `<div class="card"><div class="row2"><h2>การแจ้งเตือน</h2>${chip}</div>
  <div class="row2" style="margin:8px 0"><div>เตือนทุกรายการที่มีเวลา<small style="display:block">${n} รายการ · เปิดปิดรายตัวด้วยกระดิ่ง</small></div><button class="switch ${cfg.notif.on ? 'on' : ''}" id="nOn" aria-label="เตือนทุกรายการ"><i></i></button></div>
  <div class="row2" style="margin:8px 0"><span>เตือนล่วงหน้า</span><select class="dropdown" id="nLead">${[5, 10, 15, 30, 60, 120].map(m => `<option value="${m}" ${cfg.notif.lead === m ? 'selected' : ''}>${m < 60 ? m + ' นาที' : m / 60 + ' ชั่วโมง'}</option>`).join('')}</select></div>
  <div class="btns" style="margin-top:6px">${perm === 'default' ? '<button class="btn pri" id="nAllow">อนุญาตการแจ้งเตือน</button>' : ''}<button class="btn" id="nIcs">เพิ่มลงปฏิทิน (.ics)</button></div>
  <small style="display:block;margin-top:8px">เตือนได้ตอนเปิดแอปค้างไว้ · อยากให้เตือนตอนปิดแอป ให้ใช้ “เพิ่มลงปฏิทิน”</small></div>`;
}
function bindNotif(el) {
  const on = $('#nOn'); if (!on) return;
  on.onclick = async () => { cfg.notif.on = !cfg.notif.on; saveCfg(); if (cfg.notif.on) await ensurePermission(); renderMenu(); renderPlan(); };
  $('#nLead').onchange = e => { cfg.notif.lead = +e.target.value; saveCfg(); };
  const al = $('#nAllow'); if (al) al.onclick = async () => { await ensurePermission(); renderMenu(); };
  $('#nIcs').onclick = downloadIcs;
}

/* ---------- documents (เอกสาร): personal + shared files, shown full-screen, cached offline in IndexedDB (per member) ---------- */
const DOC_KINDS = { passport: ['passport', 'พาสปอร์ต/วีซ่า', 'พาสปอร์ต'], ticket: ['plane', 'ตั๋ว/บอร์ดดิงพาส', 'ตั๋วเครื่องบิน'], hotel: ['bed', 'ที่พัก', 'ใบจองที่พัก'], insurance: ['shield', 'ประกัน', 'ประกันการเดินทาง'], other: ['file', 'อื่นๆ', 'เอกสาร'] };
const DOC_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], DOC_MAX_B64 = 6e6, DOC_PDF_MAX = 4 * 1024 * 1024, DOC_CHUNK = 300000;
const DOC_NOSQL = 'ฟีเจอร์เอกสารยังไม่เปิดใช้งาน — ผู้ดูแลต้องรัน docs/supabase_docs.sql';
const dc = { open: {}, list: null, seg: 'me', status: 'idle', offline: false, epoch: 0, urls: {}, cached: new Set(), t: 0, running: null, prefetch: '', up: false };
const dv = { open: false, mode: '', list: [], i: 0, s: 1, x: 0, y: 0, r: 0, lock: null, d: null, pop: false };
const docIcon = k => ic((DOC_KINDS[k] || DOC_KINDS.other)[0]);
const docDate = s => { try { return new Date(s).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const docExt = m => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[m] || 'bin');
const docFileName = d => (String(d.title || 'document').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, '_').trim().slice(0, 60) || 'document') + '.' + docExt(d.mime);
/* IndexedDB: one store 'kv' — `l:<me>` = last document list, `f:<me>:<id>` = {blob}. Wiped as a whole on sign-out / user switch. */
let idbP = null;
const idb = () => idbP || (idbP = new Promise((ok, no) => { try { const r = indexedDB.open('tt-docs', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); } }));
const idbDo = async (mode, fn) => { const d = await idb(); return new Promise((ok, no) => { const q = fn(d.transaction('kv', mode).objectStore('kv')); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); }); };
const idbGet = k => idbDo('readonly', s => s.get(k)).catch(() => undefined), idbSet = (k, v) => idbDo('readwrite', s => s.put(v, k)).catch(() => { }), idbDel = k => idbDo('readwrite', s => s.delete(k)).catch(() => { });
const idbKeys = () => idbDo('readonly', s => s.getAllKeys()).catch(() => []);
const dkey = () => String(me).toLowerCase();
function docsWipe() {
  dc.epoch++; Object.values(dc.urls).forEach(u => { try { URL.revokeObjectURL(u); } catch { } });
  dc.urls = {}; dc.list = null; dc.cached = new Set(); dc.status = 'idle'; dc.offline = false; dc.running = null; dc.seg = 'me'; dc.open = {};
  if (typeof dv !== 'undefined' && dv.open) closeViewer(true);
  const p = idbP; idbP = null;
  dc.wiping = (p ? p.then(d => d.close(), () => { }) : Promise.resolve()).then(() => new Promise(ok => { try { const r = indexedDB.deleteDatabase('tt-docs'); r.onsuccess = r.onerror = r.onblocked = () => ok(); } catch { ok(); } }));
}
const b64Blob = (chunks, mime) => { const bin = atob(chunks.join('')), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: mime }); };
const blobB64 = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(b); });
/* get a document's bytes: memory -> IndexedDB -> network (then cached) */
async function docBlob(d) {
  const ep = dc.epoch, k = `f:${dkey()}:${d.id}`;
  const c = await idbGet(k); if (c && c.blob) { dc.cached.add(d.id); return c.blob; }
  const j = await sbRpc('doc_get', { p_name: me, p_hash: myHash(), p_id: d.id });
  if (j === null) { const e = new Error('ไม่พบเอกสารนี้แล้ว'); e.gone = true; throw e; }
  const b = b64Blob(j.chunks || [], d.mime);
  if (ep === dc.epoch) { await idbSet(k, { blob: b, t: Date.now() }); dc.cached.add(d.id); }
  return b;
}
const docUrl = async d => { if (dc.urls[d.id]) return dc.urls[d.id]; const ep = dc.epoch, b = await docBlob(d); if (ep !== dc.epoch) throw new Error('cancelled'); return dc.urls[d.id] = URL.createObjectURL(b); };
const docNetErr = e => !!e && (e.net || e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(e.message || ''));
const docErrText = e => e.nosql ? DOC_NOSQL : e.gone ? e.message : docNetErr(e) ? 'ออฟไลน์ — เอกสารนี้ยังไม่ได้บันทึกไว้ในเครื่อง' : 'เปิดเอกสารไม่ได้ — ' + (e.message || 'ลองใหม่อีกครั้ง');
function docsStale() {          // doc_list answered null for a signed-in member: the saved PIN is no longer valid -> clean sign-out (same as get_private)
  me = ''; sess.set('tt.me', null); sess.set('tt.ph', null); cfg.active = DEFAULT_TRIP.id; saveCfg(); ui.day = null; clearPrivCaches();
  showErr(''); toast('PIN ของคุณใช้ไม่ได้แล้ว (อาจถูกรีเซ็ต) — กรุณาเข้าสู่ระบบใหม่อีกครั้ง', 5000);
  $('#login').hidden = false; $('#loginPin').hidden = true; $('#loginPin').innerHTML = ''; $('#loginUsers').hidden = false; $('#loginSub').hidden = false; renderLogin(); load();
}
function docsRefresh(force) {
  if (!me || !myHash()) return Promise.resolve();
  if (dc.running) return dc.running;
  if (!force && dc.list && Date.now() - dc.t < 20000) return Promise.resolve();
  const ep = dc.epoch, k = 'l:' + dkey(); if (!dc.list) { dc.status = 'loading'; renderDocs(true); }
  return dc.running = (async () => {
    let next = null;
    try {
      const j = await sbRpc('doc_list', { p_name: me, p_hash: myHash() });
      if (ep !== dc.epoch) return;
      if (j === null) return docsStale();
      dc.list = j; dc.status = 'ok'; dc.offline = false; dc.t = Date.now(); await idbSet(k, j);
    } catch (e) {
      if (ep !== dc.epoch) return;
      if (e.nosql) { dc.status = 'nosql'; dc.list = null; }
      else { const c = await idbGet(k); if (c) { dc.list = c; dc.status = 'ok'; dc.offline = true; } else { dc.status = 'error'; dc.list = null; } }
    }
    if (ep !== dc.epoch) return;
    const ks = await idbKeys(), pre = `f:${dkey()}:`; if (ep === dc.epoch) dc.cached = new Set(ks.filter(x => String(x).startsWith(pre)).map(x => String(x).slice(pre.length)));
  })().finally(() => { if (dc.epoch === ep) { dc.running = null; renderDocs(true); } });
}
function infoCard() {
  const st = data.stay || {}, info = data.info || [], hasStay = !!(st.name || st.address); if (!hasStay && !info.length) return '';
  const open = ui.infoOpen !== false, nav = st.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${st.lat},${st.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(st.address || st.name || '')}`;
  let b = '';
  if (hasStay) b += `<div class="inf-stay"><small>${ic('home')} ที่พัก</small>${st.name ? `<div class="inf-big">${esc(st.name)}</div>` : ''}${st.address ? `<div class="inf-addr">${esc(st.address)}</div>` : ''}<div class="btns" style="margin-top:8px">${st.address ? '<button class="btn" id="infCopy">คัดลอก</button>' : ''}<a class="btn" target="_blank" rel="noopener" href="${nav}">นำทาง</a><button class="btn pri" id="infTaxi">โชว์ให้คนขับแท็กซี่</button></div></div>`;
  b += info.map((r, i) => `<div class="inf-row"><div><small>${esc(r.k)}</small><div class="inf-v">${esc(r.v)}</div></div><button class="btn sm" data-icp="${i}" aria-label="คัดลอก ${esc(r.k)}">คัดลอก</button></div>`).join('');
  return `<div class="card info" id="infoCard"><div class="row2"><h2>ข้อมูลด่วน</h2><button class="btn sm" id="infTgl" aria-expanded="${open}">${open ? 'ซ่อน' : 'แสดง'}</button></div><div id="infBody" ${open ? '' : 'hidden'}>${b}</div></div>`;
}
const ownerName = o => { const u = users().find(x => String(x.name).toLowerCase() === String(o || '').toLowerCase()); return u ? u.name : o; };
const docCan = d => d.created_by === dkey() || (d.scope === 'person' && d.owner === dkey());          // owner or uploader may rename / delete
function docCard(d) {
  const u = dc.urls[d.id], img = d.mime !== 'application/pdf', own = d.scope === 'person' && d.owner === dkey(), by = d.created_by && (d.scope === 'shared' || d.created_by !== d.owner) ? ' · ' + (d.scope === 'shared' ? 'โดย ' : 'เพิ่มโดย ') + esc(ownerName(d.created_by)) : '';
  return `<div class="dcard" data-id="${esc(d.id)}"><div class="dthumb ${img ? '' : 'pdf'}" data-th="${esc(d.id)}">${u && img ? `<img src="${u}" alt="">` : docIcon(d.kind)}</div>
  <div class="dbody"><div class="dt"><b>${docIcon(d.kind)} ${esc(d.title)}</b><button class="dmore" data-more="${esc(d.id)}" aria-label="เมนูเอกสาร">⋯</button></div>
  ${d.note ? `<small class="dnote">${esc(d.note)}</small>` : ''}<small>${d.scope === 'person' && !own ? 'ของ ' + esc(ownerName(d.owner)) + ' · ' : ''}เพิ่ม ${esc(docDate(d.created_at))}${by}</small>
  <small class="lock">${d.scope === 'shared' ? ic('users') + ' ทุกคนในทริปเห็น' : own ? ic('users') + ' เห็นทั้งกลุ่ม' : ic('user') + ' เอกสารของ ' + esc(ownerName(d.owner))}${dc.cached.has(d.id) ? ' · ' + ic('download') + ' ในเครื่อง' : ''}</small></div>
  <div class="dact"><button class="btn pri big" data-show="${esc(d.id)}">โชว์</button><button class="btn" data-dl="${esc(d.id)}">ดาวน์โหลด/แชร์</button></div></div>`;
}
const friendIdx = o => { const i = users().findIndex(u => String(u.name).toLowerCase() === o); return i < 0 ? 999 : i; };
const docsOf = seg => seg === 'friends' ? (dc.list || []).filter(d => d.scope === 'person' && d.owner !== dkey()).sort((a, b) => friendIdx(a.owner) - friendIdx(b.owner) || (a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0))
  : (dc.list || []).filter(d => seg === 'me' ? d.scope === 'person' && d.owner === dkey() : d.scope === 'shared');
function friendGroups(fr) {          // friends' documents grouped under each member (collapsed unless only one member has documents)
  const g = []; fr.forEach(d => { let x = g[g.length - 1]; if (!x || x.o !== d.owner) g.push(x = { o: d.owner, l: [] }); x.l.push(d); });
  return g.map(x => { const nm = ownerName(x.o), open = dc.open[x.o] !== undefined ? dc.open[x.o] : g.length === 1;
    return `<div class="dgrp"><button class="dgh" data-grp="${esc(x.o)}" aria-expanded="${open}">${avatar(nm, 'sm')}<b>${esc(nm)}</b><span class="mut">${x.l.length} รายการ</span><i>${open ? '▾' : '▸'}</i></button>${open ? x.l.map(docCard).join('') : ''}</div>`; }).join('');
}
function renderDocs(fromLoad) {
  const el = $('#tab-docs'); if (!el) return;
  let h = infoCard();
  if (!me || !myHash()) h += `<div class="card dpanel"><div class="dp-i">${ic('lock')}</div><h2>เข้าสู่ระบบด้วย PIN เพื่อดูเอกสาร</h2><div class="mut">เอกสารเห็นได้ทั้งกลุ่ม (แอปส่วนตัว) และเปิดโดยไม่ต้องมีอินเทอร์เน็ตได้หลังบันทึกไว้ในเครื่อง</div><div class="btns" style="justify-content:center"><button class="btn pri" id="dcLogin">เข้าสู่ระบบ</button></div></div>`;
  else if (dc.status === 'nosql') h += `<div class="card dpanel" id="dcNoSql"><div class="dp-i">${ic('tool')}</div><h2>${esc(DOC_NOSQL)}</h2></div>`;
  else if (dc.status === 'error') h += `<div class="card dpanel"><div class="dp-i">${ic('signal')}</div><h2>โหลดเอกสารไม่ได้</h2><div class="mut">ตรวจอินเทอร์เน็ตแล้วลองใหม่ (ยังไม่ได้ออกจากระบบ)</div><div class="btns" style="justify-content:center"><button class="btn pri" id="dcRetry">ลองใหม่</button></div></div>`;
  else {
    const me_ = docsOf('me'), sh = docsOf('shared'), fr = docsOf('friends'), ready = dc.status === 'ok', cur = dc.seg === 'shared' ? sh : dc.seg === 'friends' ? fr : me_;
    h += `<div class="dsegw"><div class="seg" id="dcSeg"><button data-seg="me" class="${dc.seg === 'me' ? 'on' : ''}">ของฉัน (${ready ? me_.length : '…'})</button><button data-seg="shared" class="${dc.seg === 'shared' ? 'on' : ''}">ส่วนกลาง (${ready ? sh.length : '…'})</button><button data-seg="friends" class="${dc.seg === 'friends' ? 'on' : ''}">เพื่อน (${ready ? fr.length : '…'})</button></div></div>`;
    h += `<div class="dtools"><button class="btn pri" id="dcAdd">${ic('plus')} เพิ่มเอกสาร</button><button class="btn" id="dcAll" ${ready && (dc.list || []).length ? '' : 'disabled'}>${ic('download')} ${esc(dc.prefetch || 'ดาวน์โหลดทั้งหมดไว้ใช้ออฟไลน์')}</button>${dc.offline ? '<span class="chip bad" id="dcOff">ออฟไลน์</span>' : ''}</div>`;
    if (!ready) h += '<div class="dcard sk"></div><div class="dcard sk"></div><div class="dcard sk"></div>';
    else if (!cur.length) h += dc.seg === 'friends' ? `<div class="card dpanel"><div class="dp-i">${ic('users')}</div><h2>เพื่อนยังไม่มีเอกสาร</h2><div class="mut">เอกสารของเพื่อนในกลุ่มจะแสดงที่นี่ — กด “เพิ่มเอกสาร” แล้วเลือก “ของคนอื่น” เพื่ออัปโหลดแทนเพื่อนได้</div></div>` : dc.seg === 'shared' ? `<div class="card dpanel"><div class="dp-i">${ic('users')}</div><h2>ยังไม่มีเอกสารส่วนกลาง</h2><div class="mut">ใส่ใบจองโรงแรม/ตั๋วกลุ่มที่ทุกคนต้องใช้ แล้วทุกคนจะเปิดได้ทันที</div></div>` : `<div class="card dpanel"><div class="dp-i">${ic('passport')}</div><h2>ยังไม่มีเอกสารของคุณ</h2><div class="mut">เก็บพาสปอร์ต วีซ่า ตั๋ว ประกัน ไว้ที่นี่ แล้วกด “โชว์” ให้เจ้าหน้าที่ได้เลย — กด “เพิ่มเอกสาร” เพื่อเริ่ม</div></div>`;
    else h += dc.seg === 'friends' ? friendGroups(cur) : cur.map(docCard).join('');
  }
  if (fromLoad && el.__sig === h) return; el.__sig = h; el.innerHTML = h; bindDocs(el);
  if (ui.tab === 'docs' && me && myHash() && dc.status === 'idle') docsRefresh();
}
function bindDocs(el) {
  const g = (s, f) => { const n = $(s, el); if (n) n.onclick = f; };
  const st = data.stay || {};
  g('#infTgl', () => { ui.infoOpen = ui.infoOpen === false; $('#infBody').hidden = !ui.infoOpen; $('#infTgl').textContent = ui.infoOpen ? 'ซ่อน' : 'แสดง'; $('#infTgl').setAttribute('aria-expanded', ui.infoOpen); });
  g('#infCopy', () => copyText([st.name, st.address].filter(Boolean).join('\n'), 'คัดลอกที่อยู่แล้ว'));
  g('#infTaxi', () => openViewer({ mode: 'taxi' }));
  $$('[data-icp]', el).forEach(b => b.onclick = () => copyText((data.info[+b.dataset.icp] || {}).v || '', 'คัดลอกแล้ว'));
  g('#dcLogin', () => $('#btnMe').click()); g('#dcRetry', () => { dc.status = 'idle'; renderDocs(); });
  $$('#dcSeg [data-seg]', el).forEach(b => b.onclick = () => { dc.seg = b.dataset.seg; renderDocs(); });
  g('#dcAdd', addDocDialog); g('#dcAll', prefetchDialog);
  $$('[data-grp]', el).forEach(b => b.onclick = () => { const o = b.dataset.grp, cur = dc.open[o] !== undefined ? dc.open[o] : docsOf('friends').every(d => d.owner === o); dc.open[o] = !cur; renderDocs(); });
  const byId = id => (dc.list || []).find(d => d.id === id);
  $$('[data-show]', el).forEach(b => b.onclick = () => openViewer({ mode: 'doc', id: b.dataset.show }));
  $$('[data-dl]', el).forEach(b => b.onclick = () => shareDoc(byId(b.dataset.dl)));
  $$('[data-more]', el).forEach(b => b.onclick = () => docMenu(byId(b.dataset.more)));
  if ('IntersectionObserver' in window) {          // lazy thumbnails (the box has a fixed size, so nothing moves when the picture arrives)
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting) return; io.unobserve(en.target); const d = byId(en.target.dataset.th); if (!d || d.mime === 'application/pdf' || en.target.querySelector('img')) return;
      docUrl(d).then(u => { if (en.target.isConnected && !en.target.querySelector('img')) { en.target.innerHTML = `<img src="${u}" alt="">`; } }).catch(() => { });
    }), { rootMargin: '200px' });
    $$('.dthumb[data-th]', el).forEach(n => io.observe(n));
  }
}
function prefetchDialog() {
  if (dc.prefetch) return; const n = s => docsOf(s).length;
  const dl = openDlg(`<h3>ดาวน์โหลดไว้ใช้ออฟไลน์</h3><div class="dmenu"><button class="btn pri block" data-p="def">ของฉัน + ส่วนกลาง (${n('me') + n('shared')})</button><button class="btn block" data-p="me">เฉพาะของฉัน (${n('me')})</button><button class="btn block" data-p="all">ทั้งหมดในกลุ่ม (${(dc.list || []).length})</button><button class="btn block" data-p="x">ยกเลิก</button></div>`);
  $$('[data-p]', dl).forEach(b => b.onclick = () => { const k = b.dataset.p; dl.close(); if (k !== 'x') prefetchAll(k); });
}
async function prefetchAll(scope) {
  if (dc.prefetch) return; const ep = dc.epoch, all = scope === 'all' ? (dc.list || []) : scope === 'me' ? docsOf('me') : [...docsOf('me'), ...docsOf('shared')], todo = all.filter(d => !dc.cached.has(d.id)); let n = 0;
  for (const d of todo) {
    dc.prefetch = `กำลังบันทึก ${++n}/${todo.length}…`; renderDocs();
    try { await docBlob(d); } catch (e) { if (ep === dc.epoch) { dc.prefetch = ''; renderDocs(); toast(docErrText(e), 3500); } return; }
    if (ep !== dc.epoch) return;
  }
  dc.prefetch = ''; renderDocs(); toast(todo.length ? 'บันทึกเอกสารทั้งหมดไว้ในเครื่องแล้ว' : 'เอกสารทั้งหมดอยู่ในเครื่องแล้ว', 2500);
}
function docMenu(d) {
  if (!d) return; const can = docCan(d);
  const dl = openDlg(`<h3>${docIcon(d.kind)} ${esc(d.title)}</h3><div class="dmenu"><button class="btn block" data-a="save">${ic('download')} บันทึกไว้ในเครื่อง${dc.cached.has(d.id) ? ' (บันทึกแล้ว)' : ''}</button>${can ? `<button class="btn block" data-a="ren">${ic('edit')} เปลี่ยนชื่อ</button><button class="btn block danger" data-a="del">${ic('trash')} ลบ</button>` : ''}<button class="btn block" data-a="x">ปิด</button></div>`);
  $$('[data-a]', dl).forEach(b => b.onclick = async () => {
    const a = b.dataset.a; dl.close(); if (a === 'save') { try { await docBlob(d); renderDocs(); toast('บันทึกไว้ในเครื่องแล้ว'); } catch (e) { toast(docErrText(e), 3500); } }
    if (a === 'ren') renameDialog(d); if (a === 'del') deleteDialog(d);
  });
}
function docWrite(fn, args, okMsg) {
  return sbRpc(fn, { p_name: me, p_hash: myHash(), ...args }).then(r => {
    if (r === null || r === -1) { docsStale(); return false; }
    if (r === 0) { toast('ทำรายการนี้ไม่ได้ — ไม่มีสิทธิ์หรือไม่พบเอกสาร', 3500); return false; }
    if (r < 0) { toast('ชื่อไม่ถูกต้อง (ต้องไม่ว่างและไม่เกิน 80 ตัวอักษร)', 3500); return false; }
    toast(okMsg); return true;
  }).catch(e => { toast(e.nosql ? DOC_NOSQL : docNetErr(e) ? 'ออฟไลน์ — ทำรายการไม่ได้ ลองใหม่เมื่อมีอินเทอร์เน็ต' : 'ไม่สำเร็จ — ' + e.message, 4000); return false; });
}
function renameDialog(d) {
  const dl = openDlg(`<form method="dialog"><h3>เปลี่ยนชื่อเอกสาร</h3><input id="rnT" maxlength="80" value="${esc(d.title)}"><div class="btns"><button type="button" class="btn" id="rnX">ยกเลิก</button><button type="button" class="btn pri" id="rnOk">บันทึก</button></div></form>`);
  $('#rnX', dl).onclick = () => dl.close();
  $('#rnOk', dl).onclick = async () => { const t = $('#rnT', dl).value.trim(); if (!t) return; dl.close(); if (await docWrite('doc_rename', { p_id: d.id, p_title: t }, 'เปลี่ยนชื่อแล้ว')) docsRefresh(true); };
}
function deleteDialog(d) {
  const dl = openDlg(`<form method="dialog"><h3>ลบเอกสาร?</h3><p>“${esc(d.title)}” จะถูกลบถาวร${d.scope === 'shared' ? ' และคนอื่นในทริปจะเปิดไม่ได้อีก' : ''}</p><div class="btns"><button type="button" class="btn" id="dlX">ยกเลิก</button><button type="button" class="btn pri danger" id="dlOk">ลบ</button></div></form>`);
  $('#dlX', dl).onclick = () => dl.close();
  $('#dlOk', dl).onclick = async () => { dl.close(); if (await docWrite('doc_delete', { p_id: d.id }, 'ลบแล้ว')) { delete dc.urls[d.id]; idbDel(`f:${dkey()}:${d.id}`); dc.cached.delete(d.id); docsRefresh(true); } };
}
/* ---- add a document ---- */
function loadImg(file) {
  return new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error('bad image')); }; im.src = u; });
}
async function prepDocFile(f) {          // -> {blob, mime} or throws Error(thai message)
  const t = f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : /\.(jpe?g|png|webp|heic)$/i.test(f.name) ? 'image/jpeg' : '');
  if (t === 'application/pdf') { if (f.size > DOC_PDF_MAX) throw new Error('ไฟล์ PDF ใหญ่เกินไป (ไม่เกิน 4 MB)'); return { blob: f, mime: t }; }
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(t)) throw new Error('ชนิดไฟล์ไม่รองรับ — ใช้รูปภาพ (JPG/PNG/WebP) หรือ PDF');
  if (f.size > 30 * 1024 * 1024) throw new Error('รูปใหญ่เกินไป (เกิน 30 MB)');
  let im; try { im = await loadImg(f); } catch { throw new Error('เปิดรูปนี้ไม่ได้ — ลองถ่ายใหม่หรือเลือกไฟล์ JPG/PNG'); }
  const w0 = im.naturalWidth, h0 = im.naturalHeight, k = Math.min(1, 1800 / Math.max(w0, h0)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  const cx = c.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(im, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82)); if (!blob) throw new Error('แปลงรูปไม่สำเร็จ');
  return { blob, mime: 'image/jpeg', w: c.width, h: c.height };
}
function dcPut(args, onProg) {
  return new Promise((ok, no) => {
    const sb = SB(), x = new XMLHttpRequest(), body = JSON.stringify(args); x.open('POST', `${sb.url}/rest/v1/rpc/doc_put`); x.setRequestHeader('apikey', sb.key); x.setRequestHeader('Content-Type', 'application/json');
    x.upload.onprogress = e => { if (e.lengthComputable) onProg(e.loaded / e.total); };
    x.onload = () => { const t = x.responseText; apiStat.add(body.length + t.length); let j; try { j = JSON.parse(t); } catch { j = t; } if (x.status >= 200 && x.status < 300) return ok(j); const m = (j && j.message) || String(t), e = new Error(m); e.nosql = /Could not find the function|schema cache/i.test(m); no(e); };
    x.onerror = x.ontimeout = () => { const e = new Error('network'); e.net = true; no(e); }; x.send(body);
  });
}
function addDocDialog() {
  const f = { scope: dc.seg === 'shared' ? 'shared' : dc.seg === 'friends' ? 'other' : 'person', owner: '', kind: 'passport', title: DOC_KINDS.passport[2], dirty: false, file: null, prep: null }, ep = dc.epoch;
  const dl = openDlg(`<form method="dialog" id="dfForm"><h3>เพิ่มเอกสาร</h3>
    <div class="seg" id="dfScope"><button type="button" data-sc="person">ของฉัน</button><button type="button" data-sc="shared">ส่วนกลาง</button><button type="button" data-sc="other">ของคนอื่น</button></div>
    <small id="dfScopeNote" class="mut"></small>
    <div class="chips reuse" id="dfWho" hidden>${users().filter(u => String(u.name).toLowerCase() !== dkey()).map(u => `<button type="button" class="tag" data-w="${esc(u.name)}">${avatar(u.name, 'sm')} ${esc(u.name)}</button>`).join('') || '<span class="mut">ยังไม่มีสมาชิกคนอื่น</span>'}</div>
    <div class="chips reuse" id="dfKinds">${Object.entries(DOC_KINDS).map(([k, v]) => `<button type="button" class="tag" data-k="${k}">${ic(v[0])} ${v[1]}</button>`).join('')}</div>
    <input id="dfTitle" maxlength="80" placeholder="ชื่อเอกสาร"><input id="dfNote" maxlength="300" placeholder="โน้ต (ไม่บังคับ)" style="margin-top:8px">
    <div class="btns"><button type="button" class="btn" id="dfPick">${ic('folder')} เลือกไฟล์</button><button type="button" class="btn" id="dfCamBtn">${ic('camera')} ถ่ายรูป</button></div>
    <input type="file" id="dfFile" accept="image/*,application/pdf" hidden><input type="file" id="dfCam" accept="image/*" capture="environment" hidden>
    <div class="dprev" id="dfPrev"><span class="mut">ยังไม่ได้เลือกไฟล์ (รูป JPG/PNG/WebP หรือ PDF ไม่เกิน 4 MB — รูปจะถูกย่อให้อัตโนมัติ)</span></div>
    <div class="prog" id="dfProg" hidden><i id="dfBar"></i></div><div class="derr" id="dfErr" role="alert"></div>
    <div class="btns"><button type="button" class="btn" id="dfX">ยกเลิก</button><button type="button" class="btn pri" id="dfOk" disabled>บันทึกเอกสาร</button></div></form>`);
  const q = s => $(s, dl), err = m => { q('#dfErr').textContent = m || ''; };
  const sync = () => {
    $$('[data-sc]', dl).forEach(b => b.classList.toggle('on', b.dataset.sc === f.scope)); $$('[data-k]', dl).forEach(b => b.classList.toggle('sel', b.dataset.k === f.kind));
    q('#dfScopeNote').innerHTML = f.scope === 'shared' ? ic('users') + ' ทุกคนในทริปที่ล็อกอินเห็นได้' : f.scope === 'other' ? (f.owner ? ic('user') + ' เพิ่มให้ ' + esc(f.owner) + ' (ทุกคนในกลุ่มเห็นได้)' : ic('user') + ' เลือกคนที่จะเพิ่มเอกสารให้') : ic('users') + ' เห็นทั้งกลุ่ม';
    q('#dfWho').hidden = f.scope !== 'other'; $$('[data-w]', dl).forEach(b => b.classList.toggle('sel', b.dataset.w === f.owner)); if (!f.dirty) q('#dfTitle').value = f.title;
    q('#dfOk').disabled = !f.prep || f.up || (f.scope === 'other' && !f.owner);
  };
  $$('[data-sc]', dl).forEach(b => b.onclick = () => { if (f.up) return; f.scope = b.dataset.sc; sync(); });
  $$('[data-w]', dl).forEach(b => b.onclick = () => { if (f.up) return; f.owner = b.dataset.w; sync(); });
  $$('[data-k]', dl).forEach(b => b.onclick = () => { if (f.up) return; f.kind = b.dataset.k; if (!f.dirty) f.title = DOC_KINDS[f.kind][2]; sync(); });
  q('#dfTitle').oninput = e => { f.dirty = true; f.title = e.target.value; };
  q('#dfPick').onclick = () => q('#dfFile').click(); q('#dfCamBtn').onclick = () => q('#dfCam').click(); q('#dfX').onclick = () => { if (!f.up) dl.close(); };
  const pick = async e => {
    const file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file) return; err(''); f.prep = null; sync();
    q('#dfPrev').innerHTML = '<span class="mut">กำลังเตรียมไฟล์…</span>';
    try {
      const r = await prepDocFile(file); f.prep = r; f.file = file;
      const b64len = Math.ceil(r.blob.size / 3) * 4; if (b64len > DOC_MAX_B64) throw new Error('ไฟล์ใหญ่เกิน 6 MB');
      const u = URL.createObjectURL(r.blob); q('#dfPrev').innerHTML = r.mime === 'application/pdf' ? `<div class="pdfp">${ic('file')} ${esc(file.name)}<br><small>${Math.round(r.blob.size / 1024)} KB</small></div>` : `<img src="${u}" alt="ตัวอย่าง"><small>${r.w}×${r.h} · ${Math.round(r.blob.size / 1024)} KB</small>`;
      if (r.mime !== 'application/pdf') setTimeout(() => URL.revokeObjectURL(u), 60000);
    } catch (x) { q('#dfPrev').innerHTML = '<span class="mut">ยังไม่ได้เลือกไฟล์</span>'; err(x.message); }
    sync();
  };
  q('#dfFile').onchange = pick; q('#dfCam').onchange = pick;
  q('#dfOk').onclick = async () => {
    const title = q('#dfTitle').value.trim(); if (!f.prep || f.up) return; if (!title) return err('ใส่ชื่อเอกสารก่อน'); if (title.length > 80) return err('ชื่อยาวเกิน 80 ตัวอักษร');
    err(''); f.up = true; q('#dfOk').disabled = true; q('#dfOk').textContent = 'กำลังอัปโหลด…'; q('#dfProg').hidden = false; q('#dfBar').style.width = '4%';
    try {
      const b64 = await blobB64(f.prep.blob); if (b64.length > DOC_MAX_B64) throw new Error('ไฟล์ใหญ่เกิน 6 MB');
      const chunks = []; for (let i = 0; i < b64.length; i += DOC_CHUNK) chunks.push(b64.slice(i, i + DOC_CHUNK));
      const r = await dcPut({ p_name: me, p_hash: myHash(), p_scope: f.scope === 'shared' ? 'shared' : 'person', p_owner: f.scope === 'other' ? f.owner : null, p_trip: '', p_title: title, p_kind: f.kind, p_mime: f.prep.mime, p_note: q('#dfNote').value.trim(), p_chunks: chunks }, p => { q('#dfBar').style.width = Math.max(4, Math.round(p * 100)) + '%'; });
      if (typeof r === 'string' && /^-\d$/.test(r)) throw Object.assign(new Error({ '-1': 'เข้าสู่ระบบใหม่อีกครั้ง — PIN ใช้ไม่ได้', '-2': 'ชนิดไฟล์ไม่รองรับ (เฉพาะ JPG/PNG/WebP/PDF)', '-3': 'ไฟล์ใหญ่เกิน 6 MB', '-4': 'เอกสารเต็มแล้ว (ส่วนตัวคนละ 40 / ส่วนกลาง 60) — ลบบางรายการก่อน', '-5': 'ข้อมูลไม่ถูกต้อง (ชื่อว่างหรือยาวเกิน 80 ตัวอักษร)', '-6': 'ไม่พบสมาชิกคนนี้' }[r] || 'เซิร์ฟเวอร์ปฏิเสธ'), { refused: true });
      if (ep === dc.epoch && /^[0-9a-f-]{36}$/.test(r)) { await idbSet(`f:${dkey()}:${r}`, { blob: f.prep.blob, t: Date.now() }); }
      f.up = false; dl.close(); dc.seg = f.scope === 'shared' ? 'shared' : f.scope === 'other' ? 'friends' : 'me'; if (f.scope === 'other') dc.open[f.owner.toLowerCase()] = true; toast(f.scope === 'other' ? `เพิ่มเอกสารให้ ${f.owner} แล้ว` : 'เพิ่มเอกสารแล้ว'); await docsRefresh(true);
    } catch (x) {
      f.up = false; q('#dfProg').hidden = true; q('#dfOk').textContent = 'บันทึกเอกสาร';
      err(x.nosql ? DOC_NOSQL : docNetErr(x) ? 'ออฟไลน์ — เชื่อมต่ออินเทอร์เน็ตก่อนจึงจะเพิ่มเอกสารได้' : x.refused ? 'เซิร์ฟเวอร์ปฏิเสธ — ' + x.message : x.message); sync();
    }
  };
  sync();
}
/* ---- share / download ---- */
async function shareDoc(d) {
  if (!d) return;
  let b; try { b = await docBlob(d); } catch (e) { return toast(docErrText(e), 3500); }
  const name = docFileName(d), file = new File([b], name, { type: d.mime });
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: d.title }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  const u = URL.createObjectURL(b), a = document.createElement('a');
  if ('download' in a) { a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast('ดาวน์โหลดแล้ว'); setTimeout(() => URL.revokeObjectURL(u), 30000); }
  else { window.open(u, '_blank'); setTimeout(() => URL.revokeObjectURL(u), 60000); }
}
/* ---- full-screen viewer ("โชว์") ---- */
const dvEl = () => $('#docOv');
function dvApply() {
  const im = $('#dvImg'), st = $('#dvStage'); if (!im || !st) return; const r = st.getBoundingClientRect(), q = dv.r % 180 !== 0;
  im.style.width = (q ? r.height : r.width) + 'px'; im.style.height = (q ? r.width : r.height) + 'px';
  im.style.transform = `translate(-50%,-50%) translate(${dv.x}px,${dv.y}px) scale(${dv.s}) rotate(${dv.r}deg)`;
}
const dvReset = () => { dv.s = 1; dv.x = dv.y = 0; dvApply(); };
function dvClamp() { const st = $('#dvStage'); if (!st) return; const r = st.getBoundingClientRect(), mx = r.width * (dv.s - 1) / 2, my = r.height * (dv.s - 1) / 2; dv.x = Math.max(-mx, Math.min(mx, dv.x)); dv.y = Math.max(-my, Math.min(my, dv.y)); }
async function dvWake() {
  try { if (navigator.wakeLock && dv.open && !dv.lock) { dv.lock = await navigator.wakeLock.request('screen'); dv.lock.addEventListener('release', () => { dv.lock = null; }); } } catch { dv.lock = null; }
  const h = $('#dvHint'); if (h) h.hidden = !!dv.lock && !navigator.standalone;
}
function openViewer(o) {
  if (dv.open) return; const ov = dvEl();
  dv.open = true; dv.mode = o.mode; dv.s = 1; dv.x = dv.y = 0; dv.r = 0; ov.hidden = false; document.documentElement.classList.add('noscroll'); history.pushState({ dov: 1 }, ''); dv.pop = false;
  if (o.mode === 'taxi') { const st = data.stay || {}; ov.innerHTML = `<div class="dov-bar"><div class="dov-t"><small>โชว์ให้คนขับแท็กซี่</small><b>กรุณาพาไปที่นี่</b></div><button class="ov-btn" id="dvClose" aria-label="ปิด">${ic('x')}</button></div><div class="dov-stage taxi" id="dvStage"><div class="tx-n">${esc(st.name || '')}</div><div class="tx-a">${esc(st.address || '')}</div></div>`; $('#dvClose').onclick = () => closeViewer(); dvWake(); return; }
  dv.list = docsOf(dc.seg); dv.i = Math.max(0, dv.list.findIndex(d => d.id === o.id));
  ov.innerHTML = `<div class="dov-bar"><div class="dov-t"><small id="dvOwner"></small><b id="dvTitle"></b></div><button class="ov-btn" id="dvRot" aria-label="หมุน">${ic('rotate')}</button><button class="ov-btn" id="dvClose" aria-label="ปิด">${ic('x')}</button></div>
    <div class="dov-stage" id="dvStage"><div class="dov-msg" id="dvMsg"></div></div>
    <div class="dov-foot"><div class="dov-hint" id="dvHint" hidden>เพิ่มความสว่าง/ปิดล็อกหน้าจออัตโนมัติ</div><div class="dov-nav"><button class="ov-btn" id="dvPrev" aria-label="ก่อนหน้า">‹</button><span id="dvCount"></span><button class="ov-btn" id="dvNext" aria-label="ถัดไป">›</button><button class="btn" id="dvShare">ดาวน์โหลด/แชร์</button></div></div>`;
  $('#dvClose').onclick = () => closeViewer(); $('#dvRot').onclick = () => { dv.r = (dv.r + 90) % 360; dvClamp(); dvApply(); }; $('#dvPrev').onclick = () => dvGo(-1); $('#dvNext').onclick = () => dvGo(1); $('#dvShare').onclick = () => shareDoc(dv.list[dv.i]);
  dvGestures(); dvShow(); dvWake();
}
async function dvShow() {
  const d = dv.list[dv.i], st = $('#dvStage'); if (!d || !st) return; const ep = dc.epoch, idx = dv.i;
  $('#dvOwner').textContent = d.scope === 'shared' ? 'ส่วนกลาง' : ownerName(d.owner); $('#dvTitle').textContent = d.title; $('#dvCount').textContent = `${dv.i + 1}/${dv.list.length}`;
  $('#dvPrev').disabled = dv.i <= 0; $('#dvNext').disabled = dv.i >= dv.list.length - 1; dv.s = 1; dv.x = dv.y = 0; dv.r = 0;
  $$('#dvStage > :not(.dov-msg)').forEach(n => n.remove()); const msg = $('#dvMsg'); msg.textContent = 'กำลังโหลด…'; msg.hidden = false;
  try {
    const u = await docUrl(d); if (ep !== dc.epoch || !dv.open || idx !== dv.i) return; msg.hidden = true; renderDocs(true);
    if (d.mime === 'application/pdf') { st.insertAdjacentHTML('beforeend', `<div class="dov-pdf"><div class="dp-i">${ic('file')}</div><b>${esc(d.title)}</b><button class="btn pri big" id="dvPdf">เปิด PDF</button></div>`); $('#dvPdf').onclick = () => window.open(u, '_blank'); $('#dvRot').hidden = true; }
    else { $('#dvRot').hidden = false; st.insertAdjacentHTML('beforeend', `<img id="dvImg" src="${u}" alt="${esc(d.title)}" draggable="false">`); dvApply(); }
  } catch (e) { if (idx === dv.i) { msg.hidden = false; msg.textContent = docErrText(e); } }
}
function dvGo(n) { const j = dv.i + n; if (!dv.open || dv.mode !== 'doc' || j < 0 || j >= dv.list.length) return; dv.i = j; dvShow(); }
function dvGestures() {
  const st = $('#dvStage'), pts = new Map(); let g = null, last = 0, lx = 0, ly = 0;
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const base = () => { const p = [...pts.values()][0]; g = { x0: p.x, y0: p.y, ox: dv.x, oy: dv.y, moved: 0, d0: pts.size > 1 ? dist() : 0, s0: dv.s }; };
  st.onpointerdown = e => { if (e.target.closest('button')) return; try { st.setPointerCapture(e.pointerId); } catch { } pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); base(); };
  st.onpointermove = e => {
    if (!pts.has(e.pointerId) || !g) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2 && g.d0) { dv.s = Math.max(1, Math.min(6, g.s0 * dist() / g.d0)); g.moved = 99; dvClamp(); dvApply(); }
    else { const dx = e.clientX - g.x0, dy = e.clientY - g.y0; g.moved = Math.max(g.moved, Math.hypot(dx, dy)); if (dv.s > 1) { dv.x = g.ox + dx; dv.y = g.oy + dy; dvClamp(); dvApply(); } }
  };
  const end = e => {
    if (!pts.has(e.pointerId)) return; const one = pts.size === 1, p = pts.get(e.pointerId), gg = g; pts.delete(e.pointerId);
    if (pts.size) { base(); return; } g = null; if (!one || !gg) return;
    const dx = p.x - gg.x0, dy = p.y - gg.y0;
    if (gg.moved < 10 && e.type === 'pointerup') {          // tap; two taps = zoom in / out
      const now = Date.now(); if (now - last < 320 && Math.hypot(e.clientX - lx, e.clientY - ly) < 40) { if (dv.s > 1) dvReset(); else { dv.s = 2.5; dvApply(); } last = 0; } else { last = now; lx = e.clientX; ly = e.clientY; }
    } else if (dv.s <= 1.02 && dv.mode === 'doc' && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) dvGo(dx < 0 ? 1 : -1);          // swipe = previous / next
    if (dv.s < 1.02) dvReset();
  };
  st.onpointerup = end; st.onpointercancel = end;
}
function closeViewer(fromPop) {
  if (!dv.open) return; dv.open = false; const ov = dvEl(); ov.hidden = true; ov.innerHTML = ''; document.documentElement.classList.remove('noscroll');
  try { if (dv.lock) dv.lock.release(); } catch { } dv.lock = null;
  if (!fromPop) history.back();
}
addEventListener('popstate', () => closeViewer(true));
addEventListener('keydown', e => { if (!dv.open) return; if (e.key === 'Escape') closeViewer(); else if (e.key === 'ArrowLeft') dvGo(-1); else if (e.key === 'ArrowRight') dvGo(1); });
addEventListener('resize', () => { if (dv.open) dvApply(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && dv.open) dvWake(); });

/* ---------- boot ---------- */
/* tabs keep their own scroll position and are only re-rendered when something changed since they were drawn */
const TABS = { plan: () => renderPlan(), money: () => renderMoney(), spots: () => renderSpots(), docs: () => renderDocs(), menu: () => renderMenu() };
function renderTab(t) { TABS[t](); ui.tabVer[t] = ui.ver; }
function renderAll() {
  ui.ver++; $('#btnMe').textContent = me ? initial(me) : '?';
  Object.keys(TABS).forEach(renderTab); renderSub();
}
$('#tabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return; const to = b.dataset.tab;
  if (to === ui.tab) return scrollTo(0, 0);          // tapping the active tab = back to its top
  ui.scroll[ui.tab] = scrollY; ui.dockLockAt = Date.now() - 650; ui.tab = to;          // ignores only the scroll event of the restore itself (~150 ms)
  $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  $$('main > section').forEach(s => s.hidden = s.id !== 'tab-' + to);
  updateDock();
  if (ui.tabVer[to] !== ui.ver) renderTab(to); else if (to === 'plan') drawMap(false);
  scrollTo(0, ui.scroll[to] || 0);
  if (to === 'docs') docsRefresh();
};
setInterval(() => { if (!document.hidden && !dlg.open && $('#login').hidden && !ui.edit && !ui.dirty && !ui.saving) load(); }, 60000);
setInterval(() => {
  if (!me || !data.plan) return; const g = gate().state;
  if (g === 'active' && geo.watch == null && !['denied', 'unsupported'].includes(geo.state)) startLocation();
  else if (g !== 'active' && (geo.watch != null || geo.state === 'ok')) { stopLocation(); startLocation(); }
  else if (g === 'before' || g === 'after') { geo.state = g; renderMapStatus(); }
}, 30000);
setInterval(silentRenew, 60000);
setInterval(tickCountdown, 1000);
setInterval(() => { if (document.hidden || !map || !data.plan || ui.edit || (ui.tab !== 'plan' && !ui.ov)) return; const d = data.plan.days[ui.day]; if (!(d && isToday(d))) return; try { drawMap(false); } catch { } }, 60000);
setInterval(() => { try { checkReminders(); } catch { } }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { try { checkReminders(); } catch { } tickCountdown();  } });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
/* a refresh that arrived while a dialog / text field / picture was open is applied as soon as it is closed */
const retryStale = () => setTimeout(() => { if (ui.stale && !busy()) load(); }, 250);
dlg.addEventListener('close', retryStale); document.addEventListener('focusout', retryStale);
(async function boot() {
  ui.refit = true;
  if (!me) clearPrivCaches();
  if (me) { $('#login').hidden = true; $('#app').hidden = false; }
  { const t = allowedTrip(), c = readCache(t.id); if (c) { ui.updated = new Date(c.t); applyData(dataFromCache(t.id, c), c.snap, true); } else if (me) renderAll(); }          // last good copy first, then refresh
  await load();
  if (me) startLocation();
})();
