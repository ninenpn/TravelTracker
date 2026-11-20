'use strict';
/* Travel Tracker — static mobile app. All trip data comes from Google Sheets (read-only). */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = ['#6366f1', '#ef4444', '#14b8a6', '#f59e0b', '#8b5cf6', '#ec4899', '#22c55e', '#0ea5e9'];
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const DEFAULT_TRIP = { id: '1PW6xAogCla1lhb4wMwhOQeo2d8g_OXmaRONo1OMSlOw', name: 'Almaty Trip', planGid: '101963523', usersTab: 'Users', expensesTab: 'Expenses', locationsTab: 'Locations', costTab: 'ค่าใช้จ่าย', extraTabs: '', currency: 'THB' };
const PRESETS = [
  { id: '10SWKXgZ1Tw1YUhZGYkrLdNv_99DYBk9N', name: 'Kunming - Lijiang', costTab: 'ค่าเสียหาย', extraTabs: 'Chinese Language' },
  { id: '18xlP9LoISk-_Gy3Y0ATXkQM0lWElkvh3', name: 'Macao', costTab: 'ค่าเสียหาย' },
  { id: '1ec6Jq7HhUSjsyC50sjyLoFvw-gNXS9gN', name: 'Nagoya - Osaka', costTab: 'ค่าเสียหาย', extraTabs: 'Transport Price,JCB-Transport' },
  { id: '1Lii3MIGLVncBMjXrVBAKZDfxHORD222Z', name: "Xi'an", costTab: 'ค่าเสียหาย', extraTabs: 'Xian OJC Holiday,Chinese Language' }
].map(p => ({ planGid: '', usersTab: 'Users', expensesTab: 'Expenses', locationsTab: 'Locations', extraTabs: '', currency: 'THB', ...p }));

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
const OLD = '1gtOWIff4TirHlJ8ZP3Ei84F9zb2cLPT-';
if (cfg.v !== 4) {
  cfg.v = 4;
  cfg.trips.forEach(t => { if (t.id === OLD) t.id = DEFAULT_TRIP.id; });
  if (cfg.active === OLD) cfg.active = DEFAULT_TRIP.id;
  PRESETS.forEach(p => { if (!cfg.trips.some(t => t.id === p.id)) cfg.trips.push(p); });
  if (!cfg.trips.some(t => t.id === DEFAULT_TRIP.id)) cfg.trips.unshift(DEFAULT_TRIP);
  cfg.lastMe = cfg.lastMe || cfg.me || '';
}
const saveCfg = () => store.set('tt.cfg', cfg);
const trip = () => cfg.trips.find(t => t.id === cfg.active) || cfg.trips[0];
let me = sess.get('tt.me') || '';
let data = { plan: null, costs: null, extra: [], users: [], expenses: [], locs: {} };
const ui = { tab: 'plan', day: null, exFilter: 'all', loaded: false };

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
async function fetchTab(t, { gid, name }) {
  const q = gid ? `gid=${encodeURIComponent(gid)}` : `sheet=${encodeURIComponent(name)}`;
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${t.id}/gviz/tq?tqx=out:csv&${q}`);
  if (!r.ok) throw new Error(`โหลดชีตไม่ได้ (HTTP ${r.status}) — ตรวจว่าแชร์เป็น "ทุกคนที่มีลิงก์ดูได้"`);
  return parseCSV(await r.text());
}
const norm = s => String(s || '').toLowerCase().replace(/[\s_.]/g, '');
function colIndex(header, names) { const h = header.map(norm); for (const n of names) { const i = h.indexOf(norm(n)); if (i >= 0) return i; } return -1; }
const num = s => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/g); return m ? m.map(Number) : []; };

/* ---------- plan ---------- */
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_M = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function parseDayLabel(s) {
  const m = String(s).match(/(\d{1,2})\s*[-/ ]\s*(.+)/); if (!m) return null;
  const ms = m[2].replace(/\./g, ''); let mi = TH_M.findIndex(x => ms.includes(x.replace(/\./g, '')));
  if (mi < 0) mi = EN_M.findIndex(x => m[2].toLowerCase().includes(x));
  return mi < 0 ? null : { d: +m[1], m: mi };
}
const cleanT = s => String(s || '').replace(/\s*น\.?\s*$/, '').trim();
const isTime = s => /^\d{1,2}[.:]\d{2}$/.test(cleanT(s));
function parsePlan(rows) {
  const h = rows[0] || [];
  const ix = { day: colIndex(h, ['Day', 'วัน', 'วันที่']), loc: colIndex(h, ['Location', 'เมือง']), st: colIndex(h, ['Start time']), sl: colIndex(h, ['Start Location']), at: colIndex(h, ['Arrive time']), al: colIndex(h, ['Arrive Location']), how: colIndex(h, ['How to Travel']), note: colIndex(h, ['Note']), notice: colIndex(h, ['Notice']), tk: colIndex(h, ['Tickets']) };
  if (ix.day < 0) ix.day = 0;
  const g = (r, i) => i >= 0 ? (r[i] || '') : '';
  const days = [], ideas = []; let day = null, idea = null;
  for (const r of rows.slice(1)) {
    const v = { d: g(r, ix.day), loc: g(r, ix.loc), st: g(r, ix.st), sl: g(r, ix.sl), at: g(r, ix.at), al: g(r, ix.al), how: g(r, ix.how), note: g(r, ix.note), notice: g(r, ix.notice), tk: g(r, ix.tk) };
    if (!Object.values(v).some(Boolean)) continue;
    if (v.d) { day = { label: v.d, city: v.loc, date: parseDayLabel(v.d), steps: [] }; days.push(day); idea = null; }
    else if (/^day\s*\d+/i.test(v.st) && !v.at) { idea = { title: v.st, items: [] }; ideas.push(idea); day = null; if (v.sl) idea.items.push(v.sl); continue; }
    if (!day && idea) { const t = [v.sl, v.st, v.al].filter(Boolean).join(' · '); if (t) idea.items.push(t); continue; }
    if (!day) continue;
    if (/^end\s*day$/i.test(v.st.trim())) continue;
    const step = isTime(v.st) ? { time: cleanT(v.st) } : { text: v.st };
    Object.assign(step, { from: v.sl, toTime: cleanT(v.at), to: v.al, how: v.how, note: v.note, notice: v.notice, tickets: v.tk, city: v.d ? '' : v.loc });
    if (step.time || step.text || v.sl || v.at || v.al || v.how || v.note || v.notice || v.tk) day.steps.push(step);
  }
  return { days, ideas };
}
function parseTable(rows) {
  rows = rows.filter(r => r.some(Boolean));
  const keep = (rows[0] || []).map((_, i) => rows.some(r => r[i]));
  return rows.map(r => r.filter((_, i) => keep[i])).slice(0, 300);
}

/* ---------- users, expenses, locations ---------- */
function parseUsers(rows) {
  const h = rows[0] || []; const ni = colIndex(h, ['name', 'ชื่อ', 'user']);
  if (ni < 0) return null;
  const main = trip().currency || 'THB';
  const bcols = h.map((x, i) => { const m = String(x).match(/^\s*(budget|งบประมาณ|งบ)\s*[\s_(\-]*([a-zA-Z]{3})?\)?\s*$/i); return m ? { i, cur: (m[2] || main).toUpperCase() } : null; }).filter(Boolean);
  return rows.slice(1).filter(r => r[ni]).map(r => { const budgets = {}; bcols.forEach(b => { const v = num(r[b.i])[0]; if (v) budgets[b.cur] = v; }); return { name: r[ni], budgets }; });
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
const users = () => data.users;
const colorOf = n => { const i = users().findIndex(u => u.name === n); return COLORS[(i < 0 ? n.length : i) % COLORS.length]; };
const initial = n => (String(n).trim()[0] || '?').toUpperCase();
const avatar = (n, cls = '') => `<span class="avatar ${cls}" style="--c:${colorOf(n)}">${esc(initial(n))}</span>`;
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
  const cr = list.filter(u => u.net > 0.005).map(u => ({ n: u.name, v: u.net })).sort((a, b) => b.v - a.v);
  const db = list.filter(u => u.net < -0.005).map(u => ({ n: u.name, v: -u.net })).sort((a, b) => b.v - a.v);
  const tx = []; let i = 0, j = 0;
  while (i < cr.length && j < db.length) { const v = Math.min(cr[i].v, db[j].v); tx.push({ from: db[j].n, to: cr[i].n, v }); cr[i].v -= v; db[j].v -= v; if (cr[i].v < 0.005) i++; if (db[j].v < 0.005) j++; }
  return { cur, list, pairs, tx, cats, count, total: list.reduce((a, u) => a + u.paid, 0), hasBudget: list.some(u => u.budget > 0) };
}
function calcAll() {
  const names = users().map(u => u.name), main = trip().currency || 'THB', set = new Set([main]);
  data.expenses.forEach(e => set.add(e.cur)); users().forEach(u => Object.keys(u.budgets || {}).forEach(c => set.add(c)));
  const order = [main, ...[...set].filter(c => c !== main).sort()], out = {};
  order.forEach(c => out[c] = calcCur(c, names));
  return { out, order };
}

/* ---------- load ---------- */
const toast = (m, ms = 2600) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); };
function showErr(m) { const e = $('#error'); e.hidden = !m; e.textContent = m || ''; }
let rawPlanHead = '';
const sameAsPlan = r => rawPlanHead && (r[0] || []).join('|') === rawPlanHead;
async function load() {
  const t = trip(); $('#tripTitle').textContent = t.name;
  data = { plan: null, costs: null, extra: [], users: [], expenses: [], locs: {}, me: data.me, meLabel: data.meLabel };
  const planP = fetchTab(t, { gid: t.planGid }).then(r => { rawPlanHead = (r[0] || []).join('|'); data.plan = parsePlan(r); });
  await Promise.allSettled([planP]);
  const rest = [
    async () => { data.users = parseUsers(await fetchTab(t, { name: t.usersTab })) || []; },
    async () => { data.expenses = parseExpenses(await fetchTab(t, { name: t.expensesTab })) || []; },
    async () => { data.locs = parseLocations(await fetchTab(t, { name: t.locationsTab || 'Locations' })) || {}; },
    async () => { if (t.costTab) { const r = await fetchTab(t, { name: t.costTab }); data.costs = sameAsPlan(r) ? null : parseTable(r); } },
    async () => { for (const n of String(t.extraTabs || '').split(',').map(x => x.trim()).filter(Boolean)) { try { const r = await fetchTab(t, { name: n }); if (!sameAsPlan(r)) data.extra.push({ name: n, rows: parseTable(r) }); } catch { } } }
  ];
  await Promise.allSettled(rest.map(f => f()));
  const failed = !data.plan;
  showErr(failed ? 'โหลดแผนไม่ได้ — ตรวจว่าชีตแชร์เป็น "ทุกคนที่มีลิงก์ดูได้" แล้วลองโหลดใหม่' : '');
  ui.loaded = true; ui.updated = new Date();
  if (me && users().length && !users().some(u => u.name === me)) { me = ''; sess.set('tt.me', null); }
  if (!me && !$('#login').hidden) renderLogin();
  renderAll();
}

/* ---------- login ---------- */
function renderLogin() {
  const us = users();
  $('#loginSub').textContent = us.length ? 'ใครกำลังเข้าใช้งาน? แตะชื่อของคุณ' : (ui.loaded ? 'ยังไม่พบสมาชิกในชีต' : 'กำลังโหลดสมาชิก…');
  $('#loginUsers').innerHTML = us.map(u => `<button data-u="${esc(u.name)}" class="${u.name === cfg.lastMe ? 'last' : ''}">${avatar(u.name, 'lg')}<span>${esc(u.name)}</span>${u.name === cfg.lastMe ? '<small>ใช้ล่าสุด</small>' : ''}</button>`).join('');
  $('#loginGuest').hidden = !(ui.loaded && !us.length);
}
function enter(name) {
  me = name; sess.set('tt.me', name); if (name) { cfg.lastMe = name; saveCfg(); }
  $('#login').hidden = true; $('#app').hidden = false; renderAll();
  if (name) startLocation(true);
}
$('#loginUsers').onclick = e => { const b = e.target.closest('[data-u]'); if (b) enter(b.dataset.u); };
$('#loginGuest').onclick = () => enter('');
$('#btnMe').onclick = () => { $('#login').hidden = false; renderLogin(); };

/* ---------- plan ---------- */
const link = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">เปิดลิงก์</a>');
const mapLink = p => (!p || /^ที่พัก$/.test(p)) ? esc(p) : `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p)}" target="_blank" rel="noopener">${esc(p)}</a>`;
function howIcon(h, hasText) {
  const s = String(h || '').toLowerCase();
  if (/air|flight|plane|บิน|\b[a-z]{2}\s?-?\d{2,4}\b/.test(s)) return '✈️';
  if (/taxi|yandex|didi|grab|uber|แท็กซี่/.test(s)) return '🚕';
  if (/bullet|train|rail|metro|bts|mrt|subway|line|shink|รถไฟ/.test(s)) return '🚆';
  if (/bus|tour|รถบัส|รถ/.test(s)) return '🚌';
  if (/walk|เดิน/.test(s)) return '🚶';
  if (/boat|ferry|เรือ/.test(s)) return '⛴️';
  return h ? '🧭' : (hasText ? '📝' : '📍');
}
function dayPill(d, i) { const dt = d.date; return `<button class="day-pill ${i === ui.day ? 'sel' : ''} ${isToday(d) ? 'today' : ''}" data-day="${i}"><b>${dt ? dt.d : i + 1}</b><small>${dt ? TH_M[dt.m] : esc(d.label)}</small></button>`; }
const isToday = d => { const n = new Date(); return d.date && d.date.d === n.getDate() && d.date.m === n.getMonth(); };
function renderPlan() {
  const el = $('#tab-plan'), p = data.plan;
  if (!p) { el.innerHTML = ui.loaded ? '<div class="empty">ไม่มีข้อมูลแผน</div>' : '<div class="skeleton"></div><div class="skeleton"></div>'; return; }
  if (!p.days.length) { el.innerHTML = '<div class="empty">ยังไม่มีแผนในชีต</div>'; return; }
  if (ui.day == null || ui.day >= p.days.length) { const t = p.days.findIndex(isToday); ui.day = t >= 0 ? t : 0; }
  const d = p.days[ui.day];
  let h = `<div class="days">${p.days.map(dayPill).join('')}</div>`;
  h += `<div class="dayhead"><h2>${esc(d.label.replace('-', ' '))}${d.city ? ' · ' + esc(d.city) : ''}</h2>${isToday(d) ? '<span class="chip">วันนี้</span>' : `<small>${d.steps.length} รายการ</small>`}</div>`;
  if (!d.steps.length) h += '<div class="card empty">ยังไม่มีแผนสำหรับวันนี้<br><small>เพิ่มได้ในชีต Almaty Plan</small></div>';
  else h += '<div class="tl">' + d.steps.map(s => `<div class="tl-item"><div class="tl-time">${esc(s.time || '')}${s.toTime ? `<small>→ ${esc(s.toTime)}</small>` : ''}</div><div class="tl-dot">${howIcon(s.how, !!s.text)}</div><div class="tl-card">
    ${s.text ? `<div>${link(s.text)}</div>` : ''}${(s.from || s.to) ? `<div class="route">${mapLink(s.from)}${s.to ? ' <span class="arrow">→</span> ' + mapLink(s.to) : ''}</div>` : ''}
    ${s.city ? `<span class="chip">${esc(s.city)}</span>` : ''}${s.how ? `<span class="chip">${esc(s.how)}</span>` : ''}${s.tickets ? `<span class="chip">🎫 ${esc(s.tickets)}</span>` : ''}
    ${s.note ? `<div class="note">${link(s.note)}</div>` : ''}${s.notice ? `<div class="note">⚠️ ${link(s.notice)}</div>` : ''}</div></div>`).join('') + '</div>';
  for (const g of p.ideas) h += `<div class="card"><h3>💡 ${esc(g.title)} <small>(ไอเดีย/สำรอง)</small></h3><ul class="ideas">${g.items.map(i => `<li>${mapLink(i)}</li>`).join('')}</ul></div>`;
  el.innerHTML = h;
  const sel = $('.day-pill.sel', el); sel && sel.scrollIntoView({ inline: 'center', block: 'nearest' });
  $$('.day-pill', el).forEach(b => b.onclick = () => { ui.day = +b.dataset.day; renderPlan(); });
  renderSub();
}
function renderSub() {
  const p = data.plan; let s = '';
  if (p && p.days.length) {
    const first = p.days.find(d => d.date), now = new Date();
    if (first) { let y = now.getFullYear(), st = new Date(y, first.date.m, first.date.d), t0 = new Date(y, now.getMonth(), now.getDate()); if (st < t0 - 30 * 864e5) st = new Date(y + 1, first.date.m, first.date.d); const diff = Math.round((st - t0) / 864e5); s = diff > 0 && diff < 366 ? `อีก ${diff} วันถึงวันเดินทาง` : `${p.days.length} วัน`; }
  }
  $('#tripSub').textContent = s;
}

/* ---------- budget ---------- */
function donut(pct, over) {
  const C = 2 * Math.PI * 42, v = Math.min(100, pct) / 100 * C;
  return `<div class="donut"><svg viewBox="0 0 104 104"><circle cx="52" cy="52" r="42" stroke="#ffffff30"/><circle cx="52" cy="52" r="42" stroke="${over ? '#fb7185' : '#5eead4'}" stroke-dasharray="${v} ${C}" stroke-linecap="round"/></svg><div class="t">${Math.round(pct)}%</div></div>`;
}
function tableCard(title, rows) {
  if (!rows || !rows.length) return '';
  return `<div class="card"><h3>${esc(title)}</h3><div class="tbl"><table>${rows.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${link(c)}</th>` : `<td>${link(c)}</td>`).join('')}</tr>`).join('')}</table></div></div>`;
}
function renderBudget() {
  const el = $('#tab-budget');
  if (!users().length) { el.innerHTML = '<div class="card empty">ยังไม่มีสมาชิก<br><small>สร้างแท็บ “' + esc(trip().usersTab) + '” ในชีต (คอลัมน์ Name, Budget)</small></div>' + tableCard('ประมาณการ: ' + trip().costTab, data.costs); return; }
  const { out, order } = calcAll(); if (!ui.cur || !out[ui.cur]) ui.cur = order[0];
  const c = out[ui.cur], cur = ui.cur, who = me || users()[0].name, mine = c.list.find(u => u.name === who) || c.list[0];
  let h = '';
  if (order.length > 1) h += `<div class="seg">${order.map(k => `<button data-cur="${esc(k)}" class="${k === cur ? 'on' : ''}">${esc(k)}</button>`).join('')}</div>`;
  const active = order.filter(k => out[k].count || out[k].hasBudget);
  if (active.length > 1) {
    const mm = k => out[k].list.find(u => u.name === who) || { net: 0 };
    h += `<div class="card"><h3>สรุปของ ${esc(who)} (แยกตามสกุลเงิน)</h3>${active.map(k => { const n = mm(k).net; return `<div class="urow"><div><b>${esc(k)}</b></div><div class="amt ${n >= 0 ? 'pos' : 'neg'}">${n >= 0 ? 'ได้คืน ' : 'ต้องจ่ายคืน '}${fmt(Math.abs(n))}</div></div>`; }).join('')}</div>`;
  }
  const rem = mine.budget - mine.share, pct = mine.budget ? mine.share / mine.budget * 100 : 0;
  h += c.hasBudget
    ? `<div class="card hero">${donut(pct, rem < 0)}<div><small>งบคงเหลือของ ${esc(mine.name)}</small><div class="big">${fmt(rem)} <small>${esc(cur)}</small></div><small>ใช้ไป ${fmt(mine.share)} / งบ ${fmt(mine.budget)}</small></div></div>`
    : `<div class="card hero"><div><small>ใช้ไปของ ${esc(mine.name)}</small><div class="big">${fmt(mine.share)} <small>${esc(cur)}</small></div><small>ยังไม่ได้ตั้งงบ ${esc(cur)} — เพิ่มคอลัมน์ “Budget ${esc(cur)}” ในแท็บ ${esc(trip().usersTab)}</small></div></div>`;
  h += `<div class="stats">
    <div class="stat"><small>จ่ายให้ตัวเอง (ส่วนตัว)</small><b>${fmt(mine.personal)}</b></div>
    <div class="stat"><small>ส่วนกลาง (หารเท่า)</small><b>${fmt(mine.shared)}</b></div>
    <div class="stat"><small>คนอื่นออกให้ฉัน</small><b>${fmt(mine.forMe)}</b></div>
    <div class="stat"><small>ฉันออกให้คนอื่น</small><b>${fmt(mine.forOthers)}</b></div></div>`;
  h += `<div class="card"><h2>🤝 ใครติดใคร (${esc(cur)})</h2>${c.pairs.length ? c.pairs.map(p => `<div class="tx">${avatar(p.from, 'sm')}<b>${esc(p.from)}</b><span class="arr">ติด</span>${avatar(p.to, 'sm')}<b>${esc(p.to)}</b><b class="v ${p.from === mine.name ? 'neg' : p.to === mine.name ? 'pos' : ''}">${fmt(p.v)}</b></div>`).join('') : '<span class="mut">ไม่มีใครติดกัน / ยังไม่มีรายการ</span>'}
    ${c.tx.length ? `<details><summary>วิธีโอนให้จำนวนครั้งน้อยที่สุด</summary>${c.tx.map(t => `<div class="tx">${avatar(t.from, 'sm')}<b>${esc(t.from)}</b><span class="arr">โอนให้</span>${avatar(t.to, 'sm')}<b>${esc(t.to)}</b><b class="v">${fmt(t.v)}</b></div>`).join('')}</details>` : ''}</div>`;
  h += `<div class="card"><h2>ทุกคน (${esc(cur)})</h2>${c.list.map(u => { const r = u.budget - u.share, p = u.budget ? Math.min(100, u.share / u.budget * 100) : 0; return `<div class="urow">${avatar(u.name)}<div><b>${esc(u.name)}${u.name === me ? ' <span class="chip">ฉัน</span>' : ''}</b>${u.budget ? `<div class="bar-track ${r < 0 ? 'over' : ''}"><i style="width:${p}%"></i></div>` : ''}<small>ส่วนตัว ${fmt(u.personal)} · กลาง ${fmt(u.shared)} · ออกให้ ${fmt(u.forOthers)}${u.budget ? ` · เหลือ <span class="${r < 0 ? 'neg' : ''}">${fmt(r)}</span>` : ''}</small></div><div class="amt ${u.net >= 0 ? 'pos' : 'neg'}">${u.net >= 0 ? '+' : '−'}${fmt(Math.abs(u.net))}</div></div>`; }).join('')}<small>ตัวเลขขวา = สุทธิที่ต้องได้รับ (+) / ต้องจ่าย (−) · ไม่แปลงค่าเงิน คำนวณแยกแต่ละสกุล</small></div>`;
  const cats = Object.entries(c.cats).sort((a, b) => b[1] - a[1]), mx = cats[0] ? cats[0][1] : 1;
  if (cats.length) h += `<div class="card"><h2>📊 แยกตามหมวด (${esc(cur)})</h2>${cats.map(([k, v]) => `<div class="catrow"><div><span>${esc(k)}</span><b>${fmt(v)}</b></div><div class="bar-track"><i style="width:${v / mx * 100}%"></i></div></div>`).join('')}</div>`;
  if (data.costs && data.costs.length) h += tableCard('ประมาณการ: ' + trip().costTab, data.costs);
  el.innerHTML = h;
  $$('[data-cur]', el).forEach(b => b.onclick = () => { ui.cur = b.dataset.cur; renderBudget(); });
}

/* ---------- expenses ---------- */
const TYPE_TH = { shared: 'ส่วนกลาง', personal: 'ส่วนตัว (จ่ายให้ตัวเอง)', split: 'ออกให้/หาร' };
function renderExpenses() {
  const el = $('#tab-expenses');
  let ex = data.expenses; if (ui.exFilter === 'mine' && me) ex = ex.filter(e => e.payer === me || e.with.includes(me) || (e.type === 'shared' && !e.with.length));
  const groups = {}; ex.forEach(e => (groups[e.date || 'ไม่ระบุวันที่'] ||= []).push(e));
  let h = `<div class="seg"><button data-f="all" class="${ui.exFilter === 'all' ? 'on' : ''}">ทั้งหมด</button><button data-f="mine" class="${ui.exFilter === 'mine' ? 'on' : ''}">เกี่ยวกับฉัน</button></div>`;
  h += Object.entries(groups).reverse().map(([d, list]) => `<div class="dgroup">${esc(d)}</div>` + list.slice().reverse().map(e => `<div class="ex">${avatar(e.payer)}<div><div class="it">${esc(e.item || '—')}</div><small>${esc(e.payer)} · ${TYPE_TH[e.type]}${e.cat ? ' · ' + esc(e.cat) : ''}${e.with.length ? ' · ' + esc(e.with.join(', ')) : ''}</small></div><div class="am">${fmt(e.amount)}<small style="display:block;font-weight:400">${esc(e.cur)}</small></div></div>`).join('')).join('') || '<div class="empty">ยังไม่มีรายการ<br><small>เพิ่มในแท็บ “' + esc(trip().expensesTab) + '” ของชีต หรือกด + เพื่อสร้างแถว</small></div>';
  el.innerHTML = h + '<button class="fab" id="addExp" aria-label="เพิ่มค่าใช้จ่าย"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>';
  $$('[data-f]', el).forEach(b => b.onclick = () => { ui.exFilter = b.dataset.f; renderExpenses(); });
  $('#addExp').onclick = expenseDialog;
}
async function copyText(t, okMsg) { try { await navigator.clipboard.writeText(t); toast(okMsg); } catch { prompt('คัดลอกข้อความนี้:', t); } }
function expensePreview(f) {
  const amt = +f.amount || 0, cur = (f.cur || '').toUpperCase() || (trip().currency || 'THB');
  const names = users().map(u => u.name), ps = participants({ type: f.type, payer: f.payer, with: f.with }, names), each = amt / ps.length;
  if (!amt) return '<small>กรอกจำนวนเงินเพื่อดูว่าใครติดใคร</small>';
  let h = `<b>${esc(f.payer)} จ่าย ${fmt(amt)} ${esc(cur)}</b> <span class="chip">${TYPE_TH[f.type]}</span>`;
  if (f.type === 'personal') return h + '<div class="mut">จ่ายให้ตัวเอง — ไม่มีใครติดใคร</div>';
  h += `<div class="mut">${f.type === 'shared' ? 'ส่วนกลาง หารเท่ากัน' : 'หารเฉพาะคนที่เลือก'} ${ps.length} คน · คนละ ${fmt(each)} ${esc(cur)}</div>`;
  h += ps.map(p => p === f.payer ? `<div class="tx">${avatar(p, 'sm')}<b>${esc(p)}</b><span class="arr">ส่วนของตัวเอง</span><b class="v">${fmt(each)}</b></div>` : `<div class="tx">${avatar(p, 'sm')}<b>${esc(p)}</b><span class="arr">ติด</span>${avatar(f.payer, 'sm')}<b>${esc(f.payer)}</b><b class="v neg">${fmt(each)}</b></div>`).join('');
  if (!ps.includes(f.payer)) h += `<div class="mut">${esc(f.payer)} ออกให้ทั้งหมด ไม่มีส่วนของตัวเอง</div>`;
  return h;
}
function expenseDialog() {
  const us = users().map(u => u.name); if (!us.length) return toast('ยังไม่มีสมาชิกในชีต');
  const main = trip().currency || 'THB', curs = [...new Set([main, 'KZT', 'USD', ...data.expenses.map(e => e.cur)])];
  const d = openDlg(`<form method="dialog"><h3>เพิ่มค่าใช้จ่าย</h3>
  <label>รายการ</label><input name="item" required placeholder="เช่น ข้าวเย็น, Yandex Go">
  <label>จำนวนเงิน</label><input name="amount" type="number" step="any" inputmode="decimal" required>
  <label>สกุลเงิน (คำนวณแยกแต่ละสกุล ไม่แปลงค่าเงิน)</label><div class="seg" id="curSeg">${curs.map(c => `<button type="button" data-c="${esc(c)}" class="${c === main ? 'on' : ''}">${esc(c)}</button>`).join('')}</div><input type="hidden" name="cur" value="${esc(main)}">
  <label>ใครจ่าย</label><select name="payer">${us.map(n => `<option ${n === me ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
  <label>ประเภท</label><select name="type"><option value="shared">ส่วนกลาง — หารเท่ากันทุกคน</option><option value="personal">ส่วนตัว — จ่ายให้ตัวเอง</option><option value="split">ออกให้ — หารเฉพาะคนที่เลือก</option></select>
  <div id="whoBox"><label>หารกับใคร (ว่าง = ทุกคนสำหรับส่วนกลาง / ตัวเองสำหรับออกให้)</label><div class="checks">${us.map(n => `<label><input type="checkbox" name="w" value="${esc(n)}">${esc(n)}</label>`).join('')}</div></div>
  <label>หมวด</label><input name="cat" placeholder="อาหาร / เดินทาง / ที่พัก">
  <div class="card preview" id="preview"></div>
  <small>แอปอ่านชีตอย่างเดียว กด “คัดลอกแถว” แล้ววางต่อท้ายแท็บ ${esc(trip().expensesTab)} จากนั้นกด ⟳</small>
  <div class="btns"><button value="ok" class="btn pri">คัดลอกแถว</button><button value="x" class="btn" formnovalidate>ยกเลิก</button></div></form>`);
  const form = $('form', d);
  const vals = () => { const f = new FormData(form); return { amount: f.get('amount'), cur: f.get('cur'), payer: f.get('payer'), type: f.get('type'), with: f.getAll('w') }; };
  const upd = () => { const v = vals(); $('#whoBox').hidden = v.type === 'personal'; $('#preview').innerHTML = expensePreview(v); };
  $$('#curSeg button', d).forEach(b => b.onclick = () => { form.elements.cur.value = b.dataset.c; $$('#curSeg button', d).forEach(x => x.classList.toggle('on', x === b)); upd(); });
  form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
  form.onsubmit = ev => {
    if (ev.submitter && ev.submitter.value !== 'ok') return; const f = new FormData(ev.target);
    copyText([new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }), f.get('item'), f.get('cat'), f.get('amount'), f.get('cur'), f.get('payer'), f.get('type'), f.getAll('w').join(', ')].join('\t'), 'คัดลอกแถวแล้ว — วางในชีตแล้วกด ⟳');
  };
}

/* ---------- location & map ---------- */
const geo = { state: 'idle', watch: null, lastGeo: 0, lastPt: null };
function startLocation(userGesture) {
  if (!navigator.geolocation) { geo.state = 'unsupported'; return renderMapStatus(); }
  if (geo.watch != null) return;
  geo.state = 'asking'; renderMapStatus();
  geo.watch = navigator.geolocation.watchPosition(onPos, err => {
    geo.watch != null && navigator.geolocation.clearWatch(geo.watch); geo.watch = null;
    geo.state = err.code === 1 ? 'denied' : 'error'; renderMapStatus();
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 25000 });
}
function onPos(pos) {
  const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
  data.me = { lat, lng, acc, at: new Date() }; geo.state = 'ok';
  const moved = !geo.lastPt || distM(geo.lastPt, data.me) > 80;
  if (moved && Date.now() - geo.lastGeo > 8000) { geo.lastGeo = Date.now(); geo.lastPt = { lat, lng }; reverse(lat, lng); }
  drawMap(!ui.centered); ui.centered = true; renderMapStatus();
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
let map, layer, tiles;
const pinIcon = (n, isMe) => L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32], html: `<div class="pin ${isMe ? 'me' : ''}" style="--c:${colorOf(n)}"><span>${esc(initial(n))}</span></div>` });
function ensureMap() {
  const el = $('#map'); if (!el) return false;
  if (map && map._container !== el) { map.remove(); map = null; }
  if (!map) {
    map = L.map(el, { zoomControl: false, attributionControl: true }).setView([43.25, 76.95], 11);
    tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
    layer = L.layerGroup().addTo(map);
  }
  return true;
}
function drawMap(fit) {
  if (ui.tab !== 'map' || !ensureMap()) return;
  layer.clearLayers(); const pts = [];
  const all = { ...data.locs }; if (data.me && me) all[me] = { ...data.me, label: data.meLabel || '' };
  for (const [n, p] of Object.entries(all)) {
    pts.push([p.lat, p.lng]);
    if (n === me && p.acc) L.circle([p.lat, p.lng], { radius: p.acc, color: '#4f46e5', weight: 1, fillOpacity: .08 }).addTo(layer);
    L.marker([p.lat, p.lng], { icon: pinIcon(n, n === me) }).addTo(layer).bindPopup(`<b>${esc(n)}</b><br>${esc(p.label || '')}`);
  }
  setTimeout(() => { map.invalidateSize(); if (fit && pts.length) pts.length === 1 ? map.setView(pts[0], 16) : map.fitBounds(pts, { maxZoom: 16, padding: [40, 40] }); }, 60);
}
const GEO_MSG = {
  idle: ['📍', 'ยังไม่ได้เปิดตำแหน่ง', 'กดปุ่มด้านล่างเพื่ออนุญาตให้แอปตรวจจับตำแหน่งของคุณ'],
  asking: ['⏳', 'กำลังหาตำแหน่ง…', 'หากมีหน้าต่างขอสิทธิ์ ให้กด “อนุญาต”'],
  denied: ['🚫', 'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง', 'เปิดสิทธิ์ตำแหน่งให้เว็บนี้ในการตั้งค่าเบราว์เซอร์ (ไอคอนแม่กุญแจข้าง URL) แล้วกดลองอีกครั้ง'],
  error: ['⚠️', 'หาตำแหน่งไม่ได้', 'ตรวจว่าเปิด GPS/Location Services แล้วลองใหม่'],
  unsupported: ['⚠️', 'อุปกรณ์ไม่รองรับระบุตำแหน่ง', '']
};
function renderMapStatus() {
  const el = $('#mapStatus'); if (!el) return;
  if (geo.state === 'ok' && data.me) {
    const m = data.me;
    el.innerHTML = `<div class="status"><div class="ico">📍</div><div><b>${esc(me || 'คุณ')} อยู่ที่นี่</b><div>${esc(data.meLabel || 'กำลังระบุชื่อสถานที่…')}</div><small>${m.lat.toFixed(5)}, ${m.lng.toFixed(5)} · แม่นยำ ±${Math.round(m.acc)} ม.</small></div></div>
    <div class="btns"><button class="btn pri" id="bShare"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>ส่งตำแหน่ง</button><button class="btn" id="bRow">คัดลอกแถวลงชีต</button></div>`;
    $('#bShare').onclick = shareLoc; $('#bRow').onclick = () => copyText([me, m.lat.toFixed(6), m.lng.toFixed(6), data.meLabel || '', new Date().toLocaleString('th-TH')].join('\t'), 'คัดลอกแล้ว — วางในแท็บ ' + (trip().locationsTab || 'Locations'));
  } else {
    const [ico, t, s] = GEO_MSG[geo.state] || GEO_MSG.idle;
    el.innerHTML = `<div class="status"><div class="ico">${ico}</div><div><b>${t}</b><div class="mut">${s}</div></div></div>${geo.state === 'asking' || geo.state === 'unsupported' ? '' : '<div class="btns"><button class="btn pri" id="bAsk">เปิด/ลองหาตำแหน่งอีกครั้ง</button></div>'}`;
    const b = $('#bAsk'); if (b) b.onclick = () => { geo.watch != null && navigator.geolocation.clearWatch(geo.watch); geo.watch = null; ui.centered = false; startLocation(true); };
  }
}
async function shareLoc() {
  const m = data.me, url = `https://www.google.com/maps?q=${m.lat},${m.lng}`, text = `${me} อยู่ที่ ${data.meLabel || 'ตำแหน่งนี้'}`;
  if (navigator.share) { try { await navigator.share({ title: 'ตำแหน่งของฉัน', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  copyText(text + ' ' + url, 'คัดลอกลิงก์ตำแหน่งแล้ว');
}
function renderMap() {
  const el = $('#tab-map');
  if (!el.dataset.init) {
    el.dataset.init = 1;
    el.innerHTML = `<div class="card" id="mapStatus"></div><div class="mapwrap"><div id="map"></div><button class="locate" id="bLocate" aria-label="ไปที่ตำแหน่งฉัน"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button></div><div id="mapPeople"></div>`;
    $('#bLocate').onclick = () => { if (data.me) map.setView([data.me.lat, data.me.lng], 17); else { ui.centered = false; startLocation(true); } };
  }
  renderMapStatus(); renderMapPeople(); drawMap(true);
}
function renderMapPeople() {
  const el = $('#mapPeople'); if (!el) return;
  const all = { ...data.locs }; if (data.me && me) all[me] = { ...data.me, label: data.meLabel || '' };
  const names = users().map(u => u.name); if (me && !names.includes(me)) names.push(me);
  el.innerHTML = `<h2 style="margin-top:14px">สมาชิก</h2><div class="people">${names.map(n => { const p = all[n]; return `<button class="pcard" data-n="${esc(n)}"><div class="prow">${avatar(n, 'sm')}<b>${esc(n)}</b></div><small>${p ? esc(p.label || `${(+p.lat).toFixed(3)}, ${(+p.lng).toFixed(3)}`) : 'ยังไม่มีตำแหน่ง'}</small>${p && p.at ? `<small>${p.at instanceof Date ? p.at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : esc(p.at)}</small>` : ''}</button>`; }).join('')}</div>${Object.keys(data.locs).length ? '' : '<small>ตำแหน่งเพื่อนอ่านจากแท็บ “' + esc(trip().locationsTab || 'Locations') + '” ของชีต</small>'}`;
  $$('.pcard', el).forEach(b => b.onclick = () => { const p = all[b.dataset.n]; if (p && map) map.setView([p.lat, p.lng], 16); else toast('ยังไม่มีตำแหน่งของ ' + b.dataset.n); });
}

/* ---------- menu & settings ---------- */
function renderMenu() {
  const el = $('#tab-menu');
  let h = `<div class="card profile">${me ? avatar(me, 'lg') : '<span class="avatar lg" style="--c:#94a3b8">?</span>'}<div style="flex:1"><b style="font-size:1.1rem">${esc(me || 'ผู้เยี่ยมชม')}</b><div class="mut">${me ? 'กำลังใช้งานในชื่อนี้' : 'ยังไม่ได้เลือกผู้ใช้'}</div></div><button class="btn" id="bSwitch">สลับ</button></div>`;
  h += `<div class="card"><h2>ทริป</h2>${cfg.trips.map(t => `<button class="list-item ${t.id === cfg.active ? 'on' : ''}" data-trip="${esc(t.id)}"><span class="radio"></span><div><b>${esc(t.name)}</b></div></button>`).join('')}<div class="btns"><button class="btn" id="bNew">+ เพิ่มทริป/ชีตอื่น</button><button class="btn" id="bSet">ตั้งค่าทริปนี้</button></div></div>`;
  h += `<div class="card"><h2>สมาชิก (${users().length})</h2>${users().map(u => `<div class="urow">${avatar(u.name)}<div><b>${esc(u.name)}</b></div><div class="amt">${Object.entries(u.budgets || {}).map(([k, v]) => fmt(v) + ' ' + k).join(' · ') || '—'}</div></div>`).join('') || '<span class="mut">ยังไม่มี</span>'}<small>จัดการสมาชิกและงบในแท็บ ${esc(trip().usersTab)} ของชีต</small></div>`;
  h += data.extra.map(x => tableCard(x.name, x.rows)).join('');
  h += `<div class="card"><small>อัปเดตล่าสุด ${ui.updated ? ui.updated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—'} · ข้อมูลจาก Google Sheet</small></div>`;
  el.innerHTML = h;
  $('#bSwitch').onclick = () => $('#btnMe').click();
  $('#bNew').onclick = newTripDialog; $('#bSet').onclick = settingsDialog;
  $$('[data-trip]', el).forEach(b => b.onclick = () => { cfg.active = b.dataset.trip; saveCfg(); ui.day = null; load(); });
}
const dlg = $('#dlg');
function openDlg(html) { dlg.innerHTML = html; dlg.showModal(); return dlg; }
function tripFields(t) {
  return `<label>ชื่อทริป</label><input name="name" value="${esc(t.name || '')}" required>
  <label>ลิงก์ Google Sheet (แชร์ “ทุกคนที่มีลิงก์ดูได้”)</label><input name="url" value="${t.id ? `https://docs.google.com/spreadsheets/d/${esc(t.id)}/edit?gid=${esc(t.planGid || '')}` : ''}" required>
  <label>gid แท็บแผน (ว่าง = แท็บแรก)</label><input name="planGid" value="${esc(t.planGid || '')}">
  <label>แท็บสมาชิก/งบ</label><input name="usersTab" value="${esc(t.usersTab || 'Users')}">
  <label>แท็บค่าใช้จ่าย</label><input name="expensesTab" value="${esc(t.expensesTab || 'Expenses')}">
  <label>แท็บตำแหน่ง</label><input name="locationsTab" value="${esc(t.locationsTab || 'Locations')}">
  <label>แท็บประมาณการ (ไม่บังคับ)</label><input name="costTab" value="${esc(t.costTab || '')}">
  <label>แท็บข้อมูลเพิ่มเติม (คั่นด้วย ,)</label><input name="extraTabs" value="${esc(t.extraTabs || '')}">
  <label>สกุลเงินหลัก</label><input name="currency" value="${esc(t.currency || 'THB')}">`;
}
function readTrip(f) {
  const url = f.get('url'), m = url.match(/\/d\/([\w-]+)/); if (!m) { toast('ลิงก์ไม่ถูกต้อง'); return null; }
  const g = url.match(/gid=(\d+)/);
  return { id: m[1], name: f.get('name'), planGid: f.get('planGid') || (g ? g[1] : ''), usersTab: f.get('usersTab'), expensesTab: f.get('expensesTab'), locationsTab: f.get('locationsTab'), costTab: f.get('costTab'), extraTabs: f.get('extraTabs'), currency: (f.get('currency') || 'THB').toUpperCase() };
}
function settingsDialog() {
  const t = trip();
  const d = openDlg(`<form method="dialog"><h3>ตั้งค่าทริป</h3>${tripFields(t)}
  <div class="btns"><button value="ok" class="btn pri">บันทึก</button><button value="del" class="btn danger" formnovalidate>ลบทริปนี้</button><button value="x" class="btn" formnovalidate>ปิด</button></div></form>`);
  $('form', d).onsubmit = ev => {
    const v = ev.submitter?.value, f = new FormData(ev.target);
    if (v === 'del') { if (cfg.trips.length > 1 && confirm('ลบทริปนี้ออกจากรายการ (ไม่กระทบชีตจริง)?')) { cfg.trips = cfg.trips.filter(x => x.id !== t.id); cfg.active = cfg.trips[0].id; saveCfg(); load(); } return; }
    if (v !== 'ok') return;
    const nt = readTrip(f); if (!nt) return;
    Object.assign(t, nt); cfg.active = nt.id;
    saveCfg(); load();
  };
}
function newTripDialog() {
  const d = openDlg(`<form method="dialog"><h3>เพิ่มทริป / ชีตอื่น</h3>${tripFields({ name: '', currency: 'THB', usersTab: 'Users', expensesTab: 'Expenses', locationsTab: 'Locations' })}<div class="btns"><button value="ok" class="btn pri">เพิ่ม</button><button value="x" class="btn" formnovalidate>ยกเลิก</button></div></form>`);
  $('form', d).onsubmit = ev => {
    if (ev.submitter?.value !== 'ok') return; const nt = readTrip(new FormData(ev.target)); if (!nt) return;
    cfg.trips = cfg.trips.filter(x => x.id !== nt.id).concat(nt); cfg.active = nt.id; ui.day = null; saveCfg(); load();
  };
}
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

/* ---------- boot ---------- */
function renderAll() {
  $('#btnMe').textContent = me ? initial(me) : '?';
  renderPlan(); renderBudget(); renderExpenses(); renderMenu();
  if (ui.tab === 'map') renderMap(); renderSub();
}
$('#tabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return; ui.tab = b.dataset.tab;
  $$('#tabs button').forEach(x => x.classList.toggle('active', x === b));
  $$('main > section').forEach(s => s.hidden = s.id !== 'tab-' + ui.tab);
  scrollTo(0, 0);
  if (ui.tab === 'map') { renderMap(); if (geo.state === 'idle' && me) startLocation(true); }
};
$('#btnReload').onclick = async () => { toast('กำลังโหลดใหม่…', 1200); await load(); toast('อัปเดตแล้ว', 1200); };
setInterval(() => { if (!document.hidden && !dlg.open && $('#login').hidden) load(); }, 60000);
(async function boot() {
  if (me) { $('#login').hidden = true; $('#app').hidden = false; renderAll(); }
  await load();
  if (me) startLocation(false);
})();
