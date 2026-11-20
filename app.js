'use strict';
/* Travel Tracker — static mobile app. Data lives in Google Sheets; edits are saved back through an optional Apps Script web app. */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = ['#6366f1', '#ef4444', '#14b8a6', '#f59e0b', '#8b5cf6', '#ec4899', '#22c55e', '#0ea5e9'];
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DEFAULT_TRIP = { id: '1PW6xAogCla1lhb4wMwhOQeo2d8g_OXmaRONo1OMSlOw', name: 'Almaty Trip', planGid: '101963523', usersTab: 'Users', expensesTab: 'Expenses', locationsTab: 'Locations', placesTab: 'Places', costTab: 'ค่าใช้จ่าย', extraTabs: '', currency: 'THB', scriptUrl: '', scriptToken: '' };
const OLD_PRESETS = ['10SWKXgZ1Tw1YUhZGYkrLdNv_99DYBk9N', '18xlP9LoISk-_Gy3Y0ATXkQM0lWElkvh3', '1ec6Jq7HhUSjsyC50sjyLoFvw-gNXS9gN', '1Lii3MIGLVncBMjXrVBAKZDfxHORD222Z'];

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
  cfg.trips.forEach(t => { t.placesTab = t.placesTab || 'Places'; t.scriptUrl = t.scriptUrl || ''; t.scriptToken = t.scriptToken || ''; });
  cfg.lastMe = cfg.lastMe || cfg.me || '';
  delete cfg.rates;
}
const saveCfg = () => store.set('tt.cfg', cfg);
const trip = () => cfg.trips.find(t => t.id === cfg.active) || cfg.trips[0];
let me = sess.get('tt.me') || '';
let data = { plan: null, costs: null, extra: [], users: [], expenses: [], locs: {}, places: {}, me: null, meLabel: '' };
const ui = { tab: 'plan', day: null, exFilter: 'all', cur: null, edit: false, dirty: false, saving: false, loaded: false };

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
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${t.id}/gviz/tq?tqx=out:csv&${q}&_=${Date.now()}`);
  if (!r.ok) throw new Error(`โหลดชีตไม่ได้ (HTTP ${r.status}) — ตรวจว่าแชร์เป็น "ทุกคนที่มีลิงก์ดูได้"`);
  return parseCSV(await r.text());
}
const norm = s => String(s || '').toLowerCase().replace(/[\s_.]/g, '');
function colIndex(header, names) { const h = header.map(norm); for (const n of names) { const i = h.indexOf(norm(n)); if (i >= 0) return i; } return -1; }
const num = s => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/g); return m ? m.map(Number) : []; };

/* ---------- write-back (Apps Script) ---------- */
const sheetApi = {
  on: () => !!(trip().scriptUrl && trip().scriptToken),
  async call(action, payload) {
    const t = trip();
    const r = await fetch(t.scriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: t.scriptToken, action, ...payload }) });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok) throw new Error((j && j.error) || 'บันทึกไม่สำเร็จ');
    return j;
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
  return mi < 0 ? null : { d: +m[1], m: mi };
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
    else if (/^day\s*\d+/i.test(v.st) && !v.at) { idea = { title: v.st, items: [] }; ideas.push(idea); day = null; if (v.sl) idea.items.push(v.sl); tail.push(r); continue; }
    if (!day && idea) { const t = [v.sl, v.st, v.al].filter(Boolean).join(' · '); if (t) idea.items.push(t); tail.push(r); continue; }
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
function parsePlaces(rows) {
  const h = rows[0] || [], ni = colIndex(h, ['name', 'place', 'ชื่อ', 'สถานที่']), la = colIndex(h, ['lat', 'latitude']), lo = colIndex(h, ['lng', 'lon', 'long', 'longitude']);
  if (ni < 0 || la < 0 || lo < 0) return null;
  const out = {}; rows.slice(1).forEach(r => { const a = num(r[la])[0], b = num(r[lo])[0]; if (r[ni] && a != null && b != null) out[norm(r[ni])] = { lat: a, lng: b }; });
  return out;
}
const users = () => data.users;
const colorOf = n => { const i = users().findIndex(u => u.name === n); return COLORS[(i < 0 ? String(n).length : i) % COLORS.length]; };
const initial = n => (String(n).trim()[0] || '?').toUpperCase();
const avatar = (n, cls = '') => `<span class="avatar ${cls}" style="--c:${colorOf(n)}">${esc(initial(n))}</span>`;
const ago = s => { const t = Date.parse(s); if (!t) return s || ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'เมื่อสักครู่' : m < 60 ? `${m} นาทีที่แล้ว` : m < 1440 ? `${Math.round(m / 60)} ชม.ที่แล้ว` : new Date(t).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }); };

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

/* ---------- load ---------- */
const toast = (m, ms = 2400) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); };
function showErr(m) { const e = $('#error'); e.hidden = !m; e.textContent = m || ''; }
let rawPlanHead = '';
const sameAsPlan = r => rawPlanHead && (r[0] || []).join('|') === rawPlanHead;
async function load() {
  const t = trip(); $('#tripTitle').textContent = t.name;
  const keep = { me: data.me, meLabel: data.meLabel };
  const next = { plan: null, costs: null, extra: [], users: [], expenses: [], locs: {}, places: {}, ...keep };
  const planP = fetchTab(t, { gid: t.planGid }).then(r => { rawPlanHead = (r[0] || []).join('|'); next.plan = parsePlan(r); });
  await Promise.allSettled([planP]);
  const rest = [
    async () => { next.users = parseUsers(await fetchTab(t, { name: t.usersTab })) || []; },
    async () => { next.expenses = parseExpenses(await fetchTab(t, { name: t.expensesTab })) || []; },
    async () => { next.locs = parseLocations(await fetchTab(t, { name: t.locationsTab || 'Locations' })) || {}; },
    async () => { next.places = parsePlaces(await fetchTab(t, { name: t.placesTab || 'Places' })) || {}; },
    async () => { if (t.costTab) { const r = await fetchTab(t, { name: t.costTab }); next.costs = sameAsPlan(r) ? null : parseTable(r); } },
    async () => { for (const n of String(t.extraTabs || '').split(',').map(x => x.trim()).filter(Boolean)) { try { const r = await fetchTab(t, { name: n }); if (!sameAsPlan(r)) next.extra.push({ name: n, rows: parseTable(r) }); } catch { } } }
  ];
  await Promise.allSettled(rest.map(f => f()));
  if (!next.plan && data.plan) next.plan = data.plan;
  data = next;
  showErr(!data.plan ? 'โหลดแผนไม่ได้ — ตรวจว่าชีตแชร์เป็น "ทุกคนที่มีลิงก์ดูได้" แล้วลองโหลดใหม่' : '');
  ui.loaded = true; ui.updated = new Date();
  if (me && users().length && !users().some(u => u.name === me)) { me = ''; sess.set('tt.me', null); }
  if (!me && !$('#login').hidden) renderLogin();
  renderAll();
  if (me && geo.state === 'idle') startLocation();
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
  if (name) startLocation();
}
$('#loginUsers').onclick = e => { const b = e.target.closest('[data-u]'); if (b) enter(b.dataset.u); };
$('#loginGuest').onclick = () => enter('');
$('#btnMe').onclick = () => { $('#login').hidden = false; renderLogin(); };

/* ---------- plan view ---------- */
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
/* dates carry the year the trip happens; days that already passed are shown as Day 1, 2, 3… */
function planDates(p) {
  const now = new Date(), first = p.days.find(d => d.date); if (!first) return false;
  let y = now.getFullYear();
  if (new Date(y, first.date.m, first.date.d) < new Date(y, now.getMonth(), now.getDate()) - 60 * 864e5) y++;
  let prev = null;
  p.days.forEach(d => { if (!d.date) { d.dt = null; return; } if (prev !== null && d.date.m < prev) y++; prev = d.date.m; d.dt = new Date(y, d.date.m, d.date.d); });
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
function renderPlan() {
  const el = $('#tab-plan'), p = data.plan;
  if (!p) { el.innerHTML = ui.loaded ? '<div class="empty">ไม่มีข้อมูลแผน</div>' : '<div class="skeleton"></div><div class="skeleton"></div>'; return; }
  planDates(p);
  if (!p.days.length) { el.innerHTML = '<div class="empty">ยังไม่มีแผนในชีต</div>'; return; }
  if (ui.day == null || ui.day >= p.days.length) { const t = p.days.findIndex(isToday); ui.day = t >= 0 ? t : Math.max(0, p.days.findIndex(d => !isPast(d))); }
  const d = p.days[ui.day], wd = d.dt && !isPast(d) ? d.dt.toLocaleDateString('th-TH', { weekday: 'long' }) : '';
  let h = `<div class="days">${p.days.map(pill).join('')}${ui.edit ? '<button class="pill add" id="addDay" aria-label="เพิ่มวัน">+</button>' : ''}</div>`;
  h += `<div class="dayh"><div><h2>${esc(dayTitle(d, ui.day))}</h2><small>${[wd, d.city].filter(Boolean).map(esc).join(' · ')}${isToday(d) ? ' <span class="chip">วันนี้</span>' : ''}</small></div><button class="edit-btn ${ui.edit ? 'on' : ''}" id="editBtn">${ui.edit ? 'เสร็จ' : '<svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>แก้ไข'}</button></div>`;
  h += `<div class="tl ${ui.edit ? 'editing' : ''}" id="tl">` + d.steps.map((s, k) => `<div class="step" data-i="${k}"><div class="step-t">${esc(s.time || '')}${s.toTime ? `<small>→ ${esc(s.toTime)}</small>` : ''}</div><div class="step-c"><div class="step-i">${howIcon(s.how, !!s.text)}</div><div class="step-b">
    ${s.text ? `<div>${link(s.text)}</div>` : ''}${(s.from || s.to) ? `<div class="route">${ui.edit ? esc(s.from) : mapLink(s.from)}${s.to ? ' <span class="arrow">→</span> ' + (ui.edit ? esc(s.to) : mapLink(s.to)) : ''}</div>` : ''}
    ${s.city ? `<span class="chip">${esc(s.city)}</span>` : ''}${s.how ? `<span class="chip">${esc(s.how)}</span>` : ''}${s.tickets ? `<span class="chip">🎫 ${esc(s.tickets)}</span>` : ''}
    ${s.note ? `<div class="note">${link(s.note)}</div>` : ''}${s.notice ? `<div class="note">⚠️ ${link(s.notice)}</div>` : ''}</div>
    <div class="grip" aria-label="ลากเพื่อจัดลำดับ"><svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg></div></div></div>`).join('') + '</div>';
  if (!d.steps.length && !ui.edit) h += '<div class="card empty flat">ยังไม่มีแผนสำหรับวันนี้<br><small>กด “แก้ไข” เพื่อเพิ่มรายการ</small></div>';
  if (ui.edit) h += '<button class="addstep" id="addStep">+ เพิ่มรายการ</button>';
  if (!ui.edit) for (const g of p.ideas) h += `<div class="card flat"><h3>💡 ${esc(g.title)} <small>(ไอเดีย)</small></h3><ul class="ideas">${g.items.map(i => `<li>${mapLink(i)}</li>`).join('')}</ul></div>`;
  el.innerHTML = h;
  const sel = $('.pill.sel', el); sel && sel.scrollIntoView({ inline: 'center', block: 'nearest' });
  $$('.pill[data-day]', el).forEach(b => b.onclick = () => { ui.day = +b.dataset.day; renderPlan(); });
  $('#editBtn').onclick = toggleEdit;
  if (ui.edit) {
    $('#addStep').onclick = () => stepDialog(null);
    const ad = $('#addDay'); if (ad) ad.onclick = addDay;
    $$('.step', el).forEach(n => n.onclick = e => { if (e.target.closest('.grip')) return; stepDialog(+n.dataset.i); });
    if (window.Sortable) Sortable.create($('#tl'), { handle: '.grip', animation: 160, forceFallback: true, fallbackTolerance: 3, ghostClass: 'sortable-ghost', chosenClass: 'sortable-chosen',
      onEnd: () => { const old = d.steps, order = $$('.step', $('#tl')).map(n => +n.dataset.i); d.steps = order.map(i => old[i]); renderPlan(); scheduleSave(); } });
  }
}
function toggleEdit() {
  if (!ui.edit && !sheetApi.on()) return setupDialog('แก้ไขแผนและบันทึกลงชีตได้เมื่อเชื่อมต่อชีตแล้ว');
  ui.edit = !ui.edit; renderPlan();
}
function renderSub() {
  const p = data.plan; let s = ui.subMsg || '';
  if (!s && p && p.days.length) {
    planDates(p); const first = p.days.find(d => d.dt), last = [...p.days].reverse().find(d => d.dt), t0 = todayStart();
    if (first && last) { const diff = Math.round((first.dt - t0) / 864e5); s = diff > 0 ? `อีก ${diff} วันถึงวันเดินทาง` : last.dt < t0 ? `จบทริปแล้ว · ${p.days.length} วัน` : `กำลังเดินทาง · ${p.days.length} วัน`; }
  }
  $('#tripSub').textContent = s;
}
/* auto-save plan to the sheet */
let saveTimer;
function scheduleSave() { ui.dirty = true; setSub('กำลังบันทึก…'); clearTimeout(saveTimer); saveTimer = setTimeout(savePlan, 900); }
async function savePlan() {
  if (!sheetApi.on() || !data.plan) return;
  if (ui.saving) { scheduleSave(); return; }
  ui.saving = true;
  try { await sheetApi.call('savePlan', { gid: trip().planGid || '', rows: planToRows(data.plan) }); ui.dirty = false; setSub('บันทึกลงชีตแล้ว ✓', 2500); }
  catch (e) { setSub('บันทึกไม่สำเร็จ — แตะเพื่อลองใหม่'); toast(e.message); }
  finally { ui.saving = false; }
}
$('#tripSub').onclick = () => { if (ui.dirty && !ui.saving) savePlan(); };

/* step editor */
function stepDialog(i) {
  const p = data.plan, d = p.days[ui.day], s = i == null ? { time: '', text: '', from: '', to: '', toTime: '', how: '', note: '', _row: [] } : d.steps[i];
  const d0 = d.steps[i == null ? d.steps.length - 1 : i - 1];
  const dlgEl = openDlg(`<form method="dialog"><h3>${i == null ? 'เพิ่มรายการ' : 'แก้ไขรายการ'}</h3>
  <label>เวลาเริ่ม (เช่น 10.05) หรือข้อความอิสระ</label><input name="st" value="${esc(s.time || s.text || '')}" placeholder="10.05 หรือ “เดินเล่น + หาข้าว”">
  <label>ต้นทาง</label><input name="from" value="${esc(s.from || (i == null && d0 ? d0.to : ''))}">
  <label>ปลายทาง</label><input name="to" value="${esc(s.to || '')}">
  <label>เวลาถึง</label><input name="at" value="${esc(s.toTime || '')}">
  <label>วิธีเดินทาง</label><input name="how" value="${esc(s.how || '')}" placeholder="Airplane / Taxi / Walk">
  <label>โน้ต</label><input name="note" value="${esc(s.note || '')}">
  <label>ลิงก์ Google Maps ของปลายทาง (ไม่บังคับ — ใช้ปักหมุด)</label><input name="map" inputmode="url" placeholder="วางลิงก์จาก Google Maps">
  <label>ย้ายไปวัน</label><select name="day">${p.days.map((x, k) => `<option value="${k}" ${k === ui.day ? 'selected' : ''}>${esc(dayTitle(x, k))}</option>`).join('')}</select>
  <div class="btns"><button value="ok" class="btn pri">บันทึก</button>${i == null ? '' : '<button value="del" class="btn danger" formnovalidate>ลบ</button>'}<button value="x" class="btn" formnovalidate>ยกเลิก</button></div></form>`);
  $('form', dlgEl).onsubmit = async ev => {
    const v = ev.submitter ? ev.submitter.value : 'ok', f = new FormData(ev.target);
    if (v === 'x') return;
    if (v === 'del') { if (confirm('ลบรายการนี้?')) { d.steps.splice(i, 1); renderPlan(); scheduleSave(); } return; }
    const ix = p.cols, row = s._row.slice(), set = (c, val) => { if (c >= 0) { while (row.length <= c) row.push(''); row[c] = val; } };
    set(ix.st, f.get('st')); set(ix.sl, f.get('from')); set(ix.al, f.get('to')); set(ix.at, f.get('at')); set(ix.how, f.get('how')); set(ix.note, f.get('note'));
    const ns = stepFromRow(row, ix, i === 0);
    const target = p.days[+f.get('day')];
    if (target === d && i != null) d.steps[i] = ns; else { if (i != null) d.steps.splice(i, 1); target.steps.push(ns); }
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
  if (/(goo\.gl|maps\.app)/i.test(url)) {
    if (!sheetApi.on()) throw new Error('ลิงก์สั้นต้องเชื่อมต่อชีตก่อน หรือใช้ลิงก์เต็ม/พิกัด');
    const r = await sheetApi.call('resolve', { url }); c = coordsInText(r.url); if (c) return c;
  }
  return null;
}
async function savePlace(name, c) {
  data.places[norm(qName(name))] = c; data.places[norm(name)] = c;
  if (sheetApi.on()) { try { await sheetApi.call('upsert', { tab: trip().placesTab || 'Places', header: ['Name', 'Lat', 'Lng', 'Note'], key: qName(name), keyCol: 0, values: [qName(name), +c.lat.toFixed(6), +c.lng.toFixed(6), ''] }); toast('บันทึกพิกัดลงชีตแล้ว'); } catch (e) { toast(e.message); } }
  if (typeof drawPlaces === 'function') { drawPlaces(); renderPlaces(); }
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
  return `<div class="donut"><svg viewBox="0 0 96 96"><circle cx="48" cy="48" r="38" stroke="#ffffff30"/><circle cx="48" cy="48" r="38" stroke="${over ? '#fda4af' : '#99f6e4'}" stroke-dasharray="${v} ${C}" stroke-linecap="round"/></svg><div class="t">${Math.round(pct)}%</div></div>`;
}
function tableCard(title, rows) {
  if (!rows || !rows.length) return '';
  return `<div class="card"><h3>${esc(title)}</h3><div class="tbl"><table>${rows.map((r, i) => `<tr>${r.map(c => i === 0 ? `<th>${link(c)}</th>` : `<td>${link(c)}</td>`).join('')}</tr>`).join('')}</table></div></div>`;
}
function renderBudget() {
  const el = $('#tab-budget');
  if (!users().length) { el.innerHTML = `<div class="card empty">ยังไม่มีสมาชิก<br><small>สร้างแท็บ “${esc(trip().usersTab)}” ในชีต (คอลัมน์ Name, Budget)</small></div>` + tableCard('ประมาณการ', data.costs); return; }
  const { out, order } = calcAll(); if (!ui.cur || !out[ui.cur]) ui.cur = order[0];
  const c = out[ui.cur], cur = ui.cur, who = me || users()[0].name, mine = c.list.find(u => u.name === who) || c.list[0];
  let h = '';
  if (order.length > 1) h += `<div class="seg">${order.map(k => `<button data-cur="${esc(k)}" class="${k === cur ? 'on' : ''}">${esc(k)}</button>`).join('')}</div>`;
  const rem = mine.budget - mine.share, pct = mine.budget ? mine.share / mine.budget * 100 : 0;
  h += c.hasBudget
    ? `<div class="card hero">${donut(pct, rem < 0)}<div><small>งบคงเหลือของ ${esc(mine.name)}</small><div class="big">${fmt(rem)} <small>${esc(cur)}</small></div><small>ใช้ไป ${fmt(mine.share)} จาก ${fmt(mine.budget)}</small></div></div>`
    : `<div class="card hero"><div><small>ใช้ไปของ ${esc(mine.name)}</small><div class="big">${fmt(mine.share)} <small>${esc(cur)}</small></div><small>ตั้งงบได้ที่คอลัมน์ “Budget ${esc(cur)}” ในแท็บ ${esc(trip().usersTab)}</small></div></div>`;
  h += `<div class="stats"><div class="stat"><small>จ่ายให้ตัวเอง</small><b>${fmt(mine.personal)}</b></div><div class="stat"><small>ส่วนกลาง (หารเท่า)</small><b>${fmt(mine.shared)}</b></div><div class="stat"><small>คนอื่นออกให้ฉัน</small><b>${fmt(mine.forMe)}</b></div><div class="stat"><small>ฉันออกให้คนอื่น</small><b>${fmt(mine.forOthers)}</b></div></div>`;
  h += `<div class="card"><h2>ใครติดใคร</h2>${c.pairs.length ? c.pairs.map(p => `<div class="tx">${avatar(p.from, 'sm')}<b>${esc(p.from)}</b><span class="arr">ติด</span>${avatar(p.to, 'sm')}<b>${esc(p.to)}</b><b class="v ${p.from === mine.name ? 'neg' : p.to === mine.name ? 'pos' : ''}">${fmt(p.v)} ${esc(cur)}</b></div>`).join('') : '<span class="mut">ไม่มีใครติดกัน</span>'}</div>`;
  h += `<div class="card"><h2>ทุกคน</h2>${c.list.map(u => { const r = u.budget - u.share, p = u.budget ? Math.min(100, u.share / u.budget * 100) : 0; return `<div class="row">${avatar(u.name)}<div><b>${esc(u.name)}${u.name === me ? ' <span class="chip">ฉัน</span>' : ''}</b>${u.budget ? `<div class="track ${r < 0 ? 'over' : ''}"><i style="width:${p}%"></i></div>` : ''}<small>ส่วนตัว ${fmt(u.personal)} · กลาง ${fmt(u.shared)} · ออกให้ ${fmt(u.forOthers)}</small></div><div class="amt ${u.net >= 0 ? 'pos' : 'neg'}">${u.net >= 0 ? '+' : '−'}${fmt(Math.abs(u.net))}</div></div>`; }).join('')}</div>`;
  const cats = Object.entries(c.cats).sort((a, b) => b[1] - a[1]), mx = cats[0] ? cats[0][1] : 1;
  if (cats.length) h += `<div class="card"><h2>แยกตามหมวด</h2>${cats.map(([k, v]) => `<div class="cat"><div><span>${esc(k)}</span><b>${fmt(v)}</b></div><div class="track"><i style="width:${v / mx * 100}%"></i></div></div>`).join('')}</div>`;
  if (data.costs && data.costs.length) h += tableCard('ประมาณการ', data.costs);
  el.innerHTML = h;
  $$('[data-cur]', el).forEach(b => b.onclick = () => { ui.cur = b.dataset.cur; renderBudget(); });
}

/* ---------- expenses ---------- */
const TYPE_TH = { shared: 'ส่วนกลาง', personal: 'ส่วนตัว', split: 'ออกให้' };
function renderExpenses() {
  const el = $('#tab-expenses');
  let ex = data.expenses; if (ui.exFilter === 'mine' && me) ex = ex.filter(e => e.payer === me || e.with.includes(me) || (e.type === 'shared' && !e.with.length));
  const groups = {}; ex.forEach(e => (groups[e.date || 'ไม่ระบุวันที่'] = groups[e.date || 'ไม่ระบุวันที่'] || []).push(e));
  let h = `<div class="seg"><button data-f="all" class="${ui.exFilter === 'all' ? 'on' : ''}">ทั้งหมด</button><button data-f="mine" class="${ui.exFilter === 'mine' ? 'on' : ''}">เกี่ยวกับฉัน</button></div>`;
  h += Object.entries(groups).reverse().map(([d, list]) => `<div class="dgroup">${esc(d)}</div>` + list.slice().reverse().map(e => `<div class="ex">${avatar(e.payer)}<div><div class="it">${esc(e.item || '—')}</div><small>${esc(e.payer)} · ${TYPE_TH[e.type]}${e.cat ? ' · ' + esc(e.cat) : ''}${e.with.length ? ' · ' + esc(e.with.join(', ')) : ''}</small></div><div class="am">${fmt(e.amount)}<small style="display:block;font-weight:400">${esc(e.cur)}</small></div></div>`).join('')).join('') || '<div class="empty">ยังไม่มีรายการ<br><small>กด + เพื่อเพิ่มค่าใช้จ่าย</small></div>';
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
  <div class="btns"><button value="ok" class="btn pri">${sheetApi.on() ? 'บันทึกลงชีต' : 'คัดลอกแถว'}</button><button value="x" class="btn" formnovalidate>ยกเลิก</button></div></form>`);
  const form = $('form', d);
  const vals = () => { const f = new FormData(form); return { amount: f.get('amount'), cur: f.get('cur'), payer: f.get('payer'), type: f.get('type'), with: f.getAll('w') }; };
  const upd = () => { const v = vals(); $('#whoBox').hidden = v.type === 'personal'; $('#preview').innerHTML = expensePreview(v); };
  $$('#curSeg button', d).forEach(b => b.onclick = () => { form.elements.cur.value = b.dataset.c; $$('#curSeg button', d).forEach(x => x.classList.toggle('on', x === b)); upd(); });
  form.addEventListener('input', upd); form.addEventListener('change', upd); upd();
  form.onsubmit = async ev => {
    if (ev.submitter && ev.submitter.value !== 'ok') return; const f = new FormData(ev.target);
    const row = [new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }), f.get('item'), f.get('cat'), +f.get('amount'), f.get('cur'), f.get('payer'), f.get('type'), f.getAll('w').join(', ')];
    if (!sheetApi.on()) return copyText(row.join('\t'), 'คัดลอกแถวแล้ว — วางต่อท้ายแท็บ ' + trip().expensesTab + ' ในชีต');
    try { setSub('กำลังบันทึก…'); await sheetApi.call('append', { tab: trip().expensesTab, header: ['Date', 'Item', 'Category', 'Amount', 'Currency', 'PaidBy', 'Type', 'SplitWith'], values: row }); setSub('บันทึกลงชีตแล้ว ✓', 2500); await load(); }
    catch (e) { setSub(''); toast(e.message); }
  };
}

/* ---------- location (only between landing and departure) ---------- */
const geo = { state: 'idle', watch: null, lastGeo: 0, lastPt: null, lastPush: 0 };
function planWindowDates() { const p = data.plan; return p && p.days.length && planDates(p) ? p : null; }
const at = (date, t) => { const x = new Date(date); if (t) x.setHours(t[0], t[1], 0, 0); return x; };
function tripWindow() {
  const p = planWindowDates(); if (!p) return null;
  const fl = []; p.days.forEach(d => d.steps.forEach(s => { if (d.dt && howIcon(s.how, false) === '✈️') fl.push({ d, s }); }));
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
  if (sheetApi.on() && me && Date.now() - geo.lastPush > 60000) { geo.lastPush = Date.now(); pushLoc(); }
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
    renderMapStatus(); renderMapPeople();
  } catch { }
}

/* ---------- map ---------- */
let map, layer, plLayer;
const pinIcon = (n, isMe) => L.divIcon({ className: '', iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -32], html: `<div class="pin ${isMe ? 'me' : ''}" style="--c:${colorOf(n)}"><span>${esc(initial(n))}</span></div>` });
function ensureMap() {
  const el = $('#map'); if (!el) return false;
  if (map && map._container !== el) { map.remove(); map = null; }
  if (!map) {
    map = L.map(el, { zoomControl: false }).setView([43.25, 76.95], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
    layer = L.layerGroup().addTo(map); plLayer = L.layerGroup().addTo(map);
  }
  return true;
}
function drawMap(fit) {
  if (ui.tab !== 'map' || !ensureMap()) return;
  layer.clearLayers(); const pts = [];
  const all = { ...data.locs }; if (data.me && me) all[me] = { ...data.me, label: data.meLabel || '' };
  for (const [n, p] of Object.entries(all)) {
    pts.push([p.lat, p.lng]);
    if (n === me && p.acc) L.circle([p.lat, p.lng], { radius: p.acc, color: '#5b4bf0', weight: 1, fillOpacity: .08 }).addTo(layer);
    L.marker([p.lat, p.lng], { icon: pinIcon(n, n === me) }).addTo(layer).bindPopup(`<b>${esc(n)}</b><br>${esc(p.label || '')}`);
  }
  pts.push(...placePts()); drawPlaces();
  setTimeout(() => { map.invalidateSize(); if (fit && pts.length) pts.length === 1 ? map.setView(pts[0], 16) : map.fitBounds(pts, { maxZoom: 16, padding: [40, 40] }); }, 60);
}
const GEO_MSG = {
  idle: ['📍', 'ยังไม่ได้เปิดตำแหน่ง', 'กดปุ่มเพื่ออนุญาตให้แอปตรวจจับตำแหน่งของคุณ'],
  asking: ['⏳', 'กำลังหาตำแหน่ง…', 'หากมีหน้าต่างขอสิทธิ์ ให้กด “อนุญาต”'],
  denied: ['🚫', 'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง', 'เปิดสิทธิ์ตำแหน่งให้เว็บนี้ในการตั้งค่าเบราว์เซอร์ แล้วกดลองอีกครั้ง'],
  error: ['⚠️', 'หาตำแหน่งไม่ได้', 'ตรวจว่าเปิด GPS แล้วลองใหม่'],
  unsupported: ['⚠️', 'อุปกรณ์ไม่รองรับระบุตำแหน่ง', ''],
  before: ['🛫', 'ยังไม่ถึงเวลาเปิดตำแหน่ง', ''],
  after: ['🏠', 'ทริปจบแล้ว', 'ปิดการติดตามตำแหน่งแล้ว']
};
function renderMapStatus() {
  const el = $('#mapStatus'); if (!el) return; renderNext();
  if (geo.state === 'ok' && data.me) {
    const m = data.me;
    el.innerHTML = `<div class="status"><div class="ico">📍</div><div><b>${esc(me || 'คุณ')} อยู่ที่นี่</b><div>${esc(data.meLabel || 'กำลังระบุชื่อสถานที่…')}</div><small>แม่นยำ ±${Math.round(m.acc)} ม.${sheetApi.on() ? ' · แชร์ให้เพื่อนผ่านชีตอัตโนมัติ' : ''}</small></div></div>${sheetApi.on() ? '' : '<div class="btns"><button class="btn" id="bConn">เชื่อมต่อชีตเพื่อแชร์ตำแหน่งให้เพื่อน</button></div>'}`;
    const b = $('#bConn'); if (b) b.onclick = () => setupDialog('เชื่อมต่อแล้วแอปจะอัปเดตตำแหน่งของคุณลงชีตให้เพื่อนเห็นอัตโนมัติ');
  } else {
    let [ico, t, s] = GEO_MSG[geo.state] || GEO_MSG.idle;
    if (geo.state === 'before') { const w = gate().w; s = w ? `ระบบจะขอสิทธิ์อัตโนมัติเมื่อบินถึง${w.where ? ' ' + w.where : ''} (${dtTh(w.start)}) และปิดเมื่อออกเดินทางกลับ (${dtTh(w.end)})` : ''; }
    el.innerHTML = `<div class="status"><div class="ico">${ico}</div><div><b>${t}</b><div class="mut">${s}</div></div></div>${['asking', 'unsupported', 'before', 'after'].includes(geo.state) ? '' : '<div class="btns"><button class="btn pri" id="bAsk">เปิด / ลองหาตำแหน่งอีกครั้ง</button></div>'}`;
    const b = $('#bAsk'); if (b) b.onclick = () => { stopLocation(); ui.centered = false; startLocation(); };
  }
}
const gmDir = (to, mode) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(to)}${data.me ? `&origin=${data.me.lat},${data.me.lng}` : ''}${mode ? '&travelmode=' + mode : ''}`;
function nextStop() {
  const p = planWindowDates(); if (!p) return null;
  const d = p.days.find(isToday); if (!d) return null;
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  return d.steps.find(st => st.to && (!tm(st.time) || tm(st.time)[0] * 60 + tm(st.time)[1] >= nowM - 30)) || null;
}
function renderNext() {
  const el = $('#mapNext'); if (!el) return;
  const n = geo.state === 'ok' ? nextStop() : null;
  el.innerHTML = n ? `<div class="card"><small>จุดหมายถัดไป</small><div class="route">${esc(n.to)}</div><div class="btns"><a class="btn pri" target="_blank" rel="noopener" href="${gmDir(n.to)}">นำทางด้วย Google Maps</a><a class="btn" target="_blank" rel="noopener" href="${gmDir(n.to, 'transit')}">ขนส่งสาธารณะ</a></div></div>` : '';
}
function renderMap() {
  const el = $('#tab-map');
  if (!el.dataset.init) {
    el.dataset.init = 1;
    el.innerHTML = `<div class="card" id="mapStatus"></div><div id="mapNext"></div><div class="mapwrap"><div id="map"></div><button class="locate" id="bLocate" aria-label="ไปที่ตำแหน่งฉัน"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></button></div><div id="placesBox"></div><div id="mapPeople"></div>`;
    $('#bLocate').onclick = () => { if (data.me) map.setView([data.me.lat, data.me.lng], 17); else { ui.centered = false; startLocation(); } };
  }
  renderMapStatus(); renderPlaces(); renderMapPeople(); drawMap(true); runGeocode();
}
function renderMapPeople() {
  const el = $('#mapPeople'); if (!el) return;
  const all = { ...data.locs }; if (data.me && me) all[me] = { ...data.me, label: data.meLabel || '', at: data.me.at.toISOString() };
  const names = users().map(u => u.name); if (me && !names.includes(me)) names.push(me);
  if (names.length < 2) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="people">${names.map(n => { const p = all[n]; return `<button class="pcard" data-n="${esc(n)}"><div class="pr">${avatar(n, 'sm')}<b>${esc(n)}</b></div><small>${p ? esc(p.label || `${(+p.lat).toFixed(3)}, ${(+p.lng).toFixed(3)}`) : 'ยังไม่มีตำแหน่ง'}</small>${p && p.at ? `<small>${esc(ago(p.at))}</small>` : ''}</button>`; }).join('')}</div>`;
  $$('.pcard', el).forEach(b => b.onclick = () => { const p = all[b.dataset.n]; if (!p) return toast('ยังไม่มีตำแหน่งของ ' + b.dataset.n); if (map) map.setView([p.lat, p.lng], 16); });
}

/* ---------- planned places on the map ---------- */
const gc = { cache: store.get('tt.gc2', {}), running: false, center: null };
const GENERIC = /^(ที่พัก|home|hotel|accommodation|พัก|สนามบิน|airport)$/i;
const qName = n => String(n || '').replace(/\([^)]*\)/g, '').split(/\s\/\s|\s\+\s/)[0].trim();
const gKey = q => trip().id + '|' + q;
const ovr = q => (data.places || {})[norm(q)];
const coordOf = q => ovr(q) || gc.cache[gKey(q)];
const knownQ = q => !!ovr(q) || (gKey(q) in gc.cache);
function scopeStops() {
  const p = data.plan; if (!p || ui.placeDay === 'none') return [];
  const di = ui.placeDay === 'all' ? 'all' : (ui.placeDay != null ? ui.placeDay : (ui.day || 0));
  const days = di === 'all' ? p.days.map((d, i) => [d, i]) : [[p.days[di], di]].filter(x => x[0]);
  const out = [], seen = new Set();
  for (const [d, i] of days) {
    let last = '';
    const add = (n, t) => {
      if (!n || GENERIC.test(n.trim())) return; const q = qName(n); if (!q) return;
      if (di !== 'all' && q === last) return; last = q;
      if (di === 'all') { if (seen.has(q)) return; seen.add(q); }
      out.push({ name: n.trim(), q, day: dayTitle(d, i), time: t || '', di: i });
    };
    d.steps.forEach((st, k) => { if (k === 0) add(st.from, st.time); add(st.to, st.toTime || st.time); });
  }
  if (di === 'all') p.ideas.forEach(g => g.items.forEach(it => { const q = qName(it); if (q && !GENERIC.test(q) && !seen.has(q)) { seen.add(q); out.push({ name: it, q, day: 'ไอเดีย', di: -1, time: '' }); } }));
  return out;
}
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
      const need = scopeStops().find(x => !knownQ(x.q)); if (!need) break;
      await geocode(need.q); drawPlaces(); renderPlaces(); await sleep(1100);
    }
  } catch { } finally { gc.running = false; drawPlaces(); renderPlaces(); }
}
const placeIcon = (n, di) => L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -12], html: `<div class="plc" style="--c:${COLORS[(di < 0 ? 7 : di) % 8]}">${n}</div>` });
function placePts() { return scopeStops().map(x => coordOf(x.q)).filter(Boolean).map(c => [c.lat, c.lng]); }
function drawPlaces() {
  if (!map || !plLayer) return; plLayer.clearLayers();
  const pts = [];
  scopeStops().forEach((x, k) => {
    const c = coordOf(x.q); if (!c) return; pts.push([c.lat, c.lng]);
    L.marker([c.lat, c.lng], { icon: placeIcon(k + 1, x.di) }).addTo(plLayer).bindPopup(`<b>${k + 1}. ${esc(x.name)}</b><br>${esc(x.day)} ${esc(x.time)}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}" target="_blank" rel="noopener">นำทางด้วย Google Maps</a>`);
  });
  if (ui.placeDay !== 'all' && pts.length > 1) L.polyline(pts, { color: '#5b4bf0', weight: 3, opacity: .6, dashArray: '6 8' }).addTo(plLayer);
}
function renderPlaces() {
  const el = $('#placesBox'); if (!el) return;
  const p = data.plan; if (!p || !p.days.length) { el.innerHTML = ''; return; }
  planDates(p);
  const cur = ui.placeDay != null ? ui.placeDay : (ui.day || 0), stops = scopeStops(), done = stops.filter(x => knownQ(x.q)).length;
  el.innerHTML = `<div class="card"><div class="row2"><h3>สถานที่ในแผน</h3><select class="dropdown" id="placeSel"><option value="none" ${cur === 'none' ? 'selected' : ''}>ซ่อน</option><option value="all" ${cur === 'all' ? 'selected' : ''}>ทั้งทริป</option>${p.days.map((d, i) => `<option value="${i}" ${cur === i ? 'selected' : ''}>${esc(dayTitle(d, i))}</option>`).join('')}</select></div>
  ${stops.length && done < stops.length ? `<small>กำลังค้นหาพิกัด ${done}/${stops.length}…</small>` : ''}
  ${stops.map((x, k) => { const c = coordOf(x.q), st = !knownQ(x.q) ? '⏳' : c ? '' : 'ตั้งพิกัด'; return `<button class="pl" data-k="${k}"><span class="plc sm" style="--c:${COLORS[(x.di < 0 ? 7 : x.di) % 8]}">${k + 1}</span><div><b>${esc(x.name)}</b><small>${esc(x.day)}${x.time ? ' · ' + esc(x.time) : ''}</small></div>${st ? `<span class="chip">${st}</span>` : ''}</button>`; }).join('')}</div>`;
  $('#placeSel').onchange = e => { ui.placeDay = e.target.value === 'all' || e.target.value === 'none' ? e.target.value : +e.target.value; drawMap(true); renderPlaces(); runGeocode(); };
  $$('.pl', el).forEach(b => b.onclick = () => { const x = stops[+b.dataset.k], c = coordOf(x.q); if (!c) return placeDialog(x.q); scrollTo({ top: 0, behavior: 'smooth' }); if (map) map.setView([c.lat, c.lng], 16); });
}

/* ---------- menu / settings / sheet connection ---------- */
function renderMenu() {
  const el = $('#tab-menu'), on = sheetApi.on();
  let h = `<div class="card profile">${me ? avatar(me, 'lg') : '<span class="avatar lg" style="--c:#94a3b8">?</span>'}<div style="flex:1"><b style="font-size:1.1rem">${esc(me || 'ผู้เยี่ยมชม')}</b><div class="mut">${me ? 'กำลังใช้งานในชื่อนี้' : 'ยังไม่ได้เลือกผู้ใช้'}</div></div><button class="btn" id="bSwitch">สลับ</button></div>`;
  h += `<div class="card"><div class="row2"><h2>การบันทึกลงชีต</h2><span class="chip ${on ? 'ok' : 'bad'}">${on ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}</span></div><div class="mut">${on ? 'แก้แผน เพิ่มค่าใช้จ่าย และแชร์ตำแหน่ง จะบันทึกลง Google Sheet อัตโนมัติ' : 'เชื่อมต่อเพื่อให้แอปบันทึกการแก้ไขลงชีตอัตโนมัติ'}</div><div class="btns"><button class="btn ${on ? '' : 'pri'}" id="bConn">${on ? 'ตั้งค่าการเชื่อมต่อ' : 'เชื่อมต่อชีต'}</button></div></div>`;
  h += `<div class="card"><h2 style="margin-bottom:4px">ทริป</h2>${cfg.trips.map(t => `<button class="li ${t.id === cfg.active ? 'on' : ''}" data-trip="${esc(t.id)}"><span class="radio"></span><div><b>${esc(t.name)}</b></div></button>`).join('')}<div class="btns"><button class="btn" id="bNew">+ เพิ่มทริป</button><button class="btn" id="bSet">ตั้งค่าทริปนี้</button></div></div>`;
  h += `<div class="card"><h2 style="margin-bottom:4px">สมาชิก</h2>${users().map(u => `<div class="row">${avatar(u.name, 'sm')}<div><b>${esc(u.name)}</b></div><div class="amt mut">${Object.entries(u.budgets || {}).map(([k, v]) => fmt(v) + ' ' + k).join(' · ') || '—'}</div></div>`).join('') || '<span class="mut">ยังไม่มี — เพิ่มในแท็บ ' + esc(trip().usersTab) + '</span>'}</div>`;
  h += data.extra.map(x => tableCard(x.name, x.rows)).join('');
  h += `<div class="btns" style="justify-content:center"><button class="btn" id="bReload">รีเฟรชข้อมูล</button></div><div style="text-align:center"><small>อัปเดตล่าสุด ${ui.updated ? ui.updated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '—'}</small></div>`;
  el.innerHTML = h;
  $('#bSwitch').onclick = () => $('#btnMe').click(); $('#bConn').onclick = () => setupDialog(); $('#bNew').onclick = newTripDialog; $('#bSet').onclick = settingsDialog;
  $('#bReload').onclick = async () => { toast('กำลังโหลด…', 1000); await load(); toast('อัปเดตแล้ว', 1200); };
  $$('[data-trip]', el).forEach(b => b.onclick = () => { cfg.active = b.dataset.trip; saveCfg(); ui.day = null; ui.edit = false; load(); });
}
const dlg = $('#dlg');
function openDlg(html) { dlg.innerHTML = html; dlg.showModal(); return dlg; }
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
async function setupDialog(reason) {
  const t = trip(), token = t.scriptToken || Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
  let code = '';
  try { code = (await (await fetch('apps-script/Code.gs')).text()).replace('__TOKEN__', token); } catch { code = '// โหลดโค้ดไม่ได้ — เปิดไฟล์ apps-script/Code.gs ใน repo'; }
  const d = openDlg(`<form method="dialog"><h3>เชื่อมต่อ Google Sheet</h3>${reason ? `<div class="mut">${esc(reason)}</div>` : ''}
  <ol class="steps"><li>เปิดชีตของทริป → <b>ส่วนขยาย → Apps Script</b></li><li>ลบโค้ดเดิม แล้ว<b>วางโค้ดด้านล่าง</b> กดบันทึก</li><li>กด <b>Deploy → New deployment → Web app</b> ตั้ง <i>Execute as: Me</i> และ <i>Who has access: Anyone</i> แล้วอนุญาตสิทธิ์</li><li>คัดลอก <b>Web app URL</b> มาวางด้านล่าง</li></ol>
  <textarea class="code" readonly id="codeBox">${esc(code)}</textarea>
  <div class="btns" style="margin-top:6px"><button type="button" class="btn" id="bCopy">คัดลอกโค้ด</button></div>
  <label>Web app URL</label><input name="url" value="${esc(t.scriptUrl || '')}" placeholder="https://script.google.com/macros/s/…/exec" inputmode="url">
  <input type="hidden" name="token" value="${esc(token)}">
  <div class="btns"><button value="ok" class="btn pri">ทดสอบและบันทึก</button>${t.scriptUrl ? '<button value="off" class="btn danger" formnovalidate>ยกเลิกการเชื่อมต่อ</button>' : ''}<button value="x" class="btn" formnovalidate>ปิด</button></div></form>`);
  $('#bCopy').onclick = () => copyText(code, 'คัดลอกโค้ดแล้ว');
  $('form', d).onsubmit = async ev => {
    const v = ev.submitter ? ev.submitter.value : 'ok', f = new FormData(ev.target); if (v === 'x') return;
    if (v === 'off') { t.scriptUrl = ''; t.scriptToken = ''; saveCfg(); renderAll(); return; }
    const url = f.get('url').trim(); if (!/^https:\/\/script\.google\.com\//.test(url)) { toast('URL ไม่ถูกต้อง'); return; }
    const prev = { u: t.scriptUrl, k: t.scriptToken }; t.scriptUrl = url; t.scriptToken = f.get('token');
    try { const r = await sheetApi.call('ping', {}); saveCfg(); toast(`เชื่อมต่อสำเร็จ (${r.sheets.length} แท็บ)`); renderAll(); }
    catch (e) { t.scriptUrl = prev.u; t.scriptToken = prev.k; toast('เชื่อมต่อไม่สำเร็จ: ' + e.message); }
  };
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
  return { id: m[1], name: f.get('name'), planGid: f.get('planGid') || (g ? g[1] : ''), usersTab: f.get('usersTab') || 'Users', expensesTab: f.get('expensesTab') || 'Expenses', locationsTab: f.get('locationsTab') || 'Locations', placesTab: f.get('placesTab') || 'Places', costTab: f.get('costTab') || '', extraTabs: f.get('extraTabs') || '', currency: (f.get('currency') || 'THB').toUpperCase(), scriptUrl: same ? old.scriptUrl : '', scriptToken: same ? old.scriptToken : '' };
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

/* ---------- boot ---------- */
function renderAll() {
  $('#btnMe').textContent = me ? initial(me) : '?';
  renderPlan(); renderBudget(); renderExpenses(); renderMenu(); renderSub();
  if (ui.tab === 'map') renderMap();
}
$('#tabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return; ui.tab = b.dataset.tab;
  $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  $$('main > section').forEach(s => s.hidden = s.id !== 'tab-' + ui.tab);
  scrollTo(0, 0);
  if (ui.tab === 'map') { renderMap(); if (geo.state === 'idle' && me) startLocation(); }
};
setInterval(() => { if (!document.hidden && !dlg.open && $('#login').hidden && !ui.edit && !ui.dirty && !ui.saving) load(); }, 60000);
setInterval(() => {
  if (!me || !data.plan) return; const g = gate().state;
  if (g === 'active' && geo.watch == null && !['denied', 'unsupported'].includes(geo.state)) startLocation();
  else if (g !== 'active' && (geo.watch != null || geo.state === 'ok')) { stopLocation(); startLocation(); }
  else if (g === 'before' || g === 'after') { geo.state = g; if (ui.tab === 'map') renderMapStatus(); }
}, 30000);
(async function boot() {
  if (me) { $('#login').hidden = true; $('#app').hidden = false; renderAll(); }
  await load();
  if (me) startLocation();
})();
