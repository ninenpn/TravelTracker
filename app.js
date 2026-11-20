'use strict';
/* Travel Tracker — static app (GitHub Pages). All data comes from Google Sheets (read-only). */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COLORS = ['#0f766e', '#dc2626', '#2563eb', '#d97706', '#7c3aed', '#db2777', '#059669', '#475569'];
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const DEFAULT_TRIP = {
  id: '1gtOWIff4TirHlJ8ZP3Ei84F9zb2cLPT-', name: 'Almaty Trip', planGid: '101963523',
  usersTab: 'Users', expensesTab: 'Expenses', locationsTab: 'Locations', costTab: 'ค่าใช้จ่าย', currency: 'THB'
};

/* ---------- storage ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } }
};
let cfg = store.get('tt.cfg', null) || { trips: [DEFAULT_TRIP], active: DEFAULT_TRIP.id, me: '', rates: { KZT: 0.07 } };
const saveCfg = () => store.set('tt.cfg', cfg);
const trip = () => cfg.trips.find(t => t.id === cfg.active) || cfg.trips[0];
let data = { plan: null, costs: null, users: [], expenses: [], locs: {}, me: null };

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
function colIndex(header, names) {
  const h = header.map(norm);
  for (const n of names) { const i = h.indexOf(norm(n)); if (i >= 0) return i; }
  return -1;
}
const num = s => { const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/g); return m ? m.map(Number) : []; };

/* ---------- plan ---------- */
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_M = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function parseDayLabel(s) {
  const m = String(s).match(/(\d{1,2})\s*[-/ ]\s*(.+)/); if (!m) return null;
  let mi = TH_M.findIndex(x => m[2].includes(x.replace(/\./g, '')));
  if (mi < 0) mi = EN_M.findIndex(x => m[2].toLowerCase().includes(x));
  return mi < 0 ? null : { d: +m[1], m: mi };
}
const isTime = s => /^\d{1,2}[.:]\d{2}$/.test(s);
function parsePlan(rows) {
  const days = [], ideas = []; let day = null, idea = null;
  for (const r of rows.slice(1)) {
    const [c0, c1, c2, c3, c4, c5, c6] = [0, 1, 2, 3, 4, 5, 6].map(i => r[i] || '');
    if (![c0, c1, c2, c3, c4, c5, c6].some(Boolean)) continue;
    if (c0) { day = { label: c0, date: parseDayLabel(c0), steps: [] }; days.push(day); idea = null; }
    else if (/^day\s*\d+/i.test(c1) && !c3) { idea = { title: c1, items: [] }; ideas.push(idea); day = null; if (c2) idea.items.push(c2); continue; }
    if (!day && idea) { const t = [c2, c1, c4].filter(Boolean).join(' · '); if (t) idea.items.push(t); continue; }
    if (!day) continue;
    const step = isTime(c1) ? { time: c1 } : { text: c1 };
    Object.assign(step, { from: c2, toTime: c3, to: c4, how: c5, note: c6 });
    if (step.time || step.text || c2 || c3 || c4 || c5 || c6) day.steps.push(step);
  }
  return { days, ideas };
}
function parseCosts(rows) {
  const a = [], b = [];
  for (const r of rows.slice(1)) {
    if (r[0] || r[1]) a.push({ name: r[0], raw: r[1], v: Math.max(0, ...num(r[1])) });
    if (r[2] || r[3]) b.push({ name: r[2], raw: r[3], v: Math.max(0, ...num(r[3])) });
  }
  const clean = l => l.filter(x => x.name && !/^รวม|total/i.test(x.name));
  return { person: clean(a), group: clean(b) };
}

/* ---------- users & expenses ---------- */
function parseUsers(rows) {
  const h = rows[0] || []; const ni = colIndex(h, ['name', 'ชื่อ', 'user']); const bi = colIndex(h, ['budget', 'งบ', 'งบประมาณ']);
  if (ni < 0) return null;
  return rows.slice(1).filter(r => r[ni]).map(r => ({ name: r[ni], budget: num(r[bi])[0] || 0 }));
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
    id: 's' + i, src: 'sheet', date: r[ix.date] || '', item: r[ix.item] || '', cat: r[ix.cat] || '', amount: num(r[ix.amt])[0],
    cur: (r[ix.cur] || trip().currency || 'THB').toUpperCase(), payer: r[ix.payer], type: normType(r[ix.type]),
    with: (r[ix.w] || '').split(/[,;/、]/).map(x => x.trim()).filter(Boolean)
  }));
}
const rate = c => c === 'THB' ? 1 : (cfg.rates[c] || 1);
const allUsers = () => data.users;
const allExpenses = () => data.expenses;
function calc() {
  const users = allUsers(), names = users.map(u => u.name);
  const S = {}; users.forEach(u => S[u.name] = { ...u, paid: 0, share: 0, personal: 0, shared: 0, forMe: 0, forOthers: 0, net: 0 });
  const ensure = n => S[n] || (S[n] = { name: n, budget: 0, paid: 0, share: 0, personal: 0, shared: 0, forMe: 0, forOthers: 0, net: 0, ghost: true });
  const cats = {};
  for (const e of allExpenses()) {
    const amt = e.amount * rate(e.cur);
    let ps = e.type === 'shared' ? (e.with.length ? e.with : names) : e.type === 'personal' ? [e.payer] : (e.with.length ? e.with : [e.payer]);
    if (!ps.length) ps = [e.payer];
    const each = amt / ps.length;
    ensure(e.payer).paid += amt;
    for (const p of ps) {
      const u = ensure(p); u.share += each;
      if (e.type === 'shared') u.shared += each; else if (p === e.payer) u.personal += each; else { u.forMe += each; ensure(e.payer).forOthers += each; }
    }
    const c = e.cat || 'อื่นๆ'; cats[c] = (cats[c] || 0) + amt;
  }
  const list = Object.values(S); list.forEach(u => u.net = u.paid - u.share);
  const cr = list.filter(u => u.net > 0.005).map(u => ({ n: u.name, v: u.net })).sort((a, b) => b.v - a.v);
  const db = list.filter(u => u.net < -0.005).map(u => ({ n: u.name, v: -u.net })).sort((a, b) => b.v - a.v);
  const tx = []; let i = 0, j = 0;
  while (i < cr.length && j < db.length) {
    const v = Math.min(cr[i].v, db[j].v); tx.push({ from: db[j].n, to: cr[i].n, v });
    cr[i].v -= v; db[j].v -= v; if (cr[i].v < 0.005) i++; if (db[j].v < 0.005) j++;
  }
  return { list, tx, cats, total: list.reduce((a, u) => a + u.paid, 0) };
}

function parseLocations(rows) {
  const h = rows[0] || []; const ix = { n: colIndex(h, ['name', 'ชื่อ', 'user']), lat: colIndex(h, ['lat', 'latitude']), lng: colIndex(h, ['lng', 'lon', 'long', 'longitude']), l: colIndex(h, ['label', 'place', 'สถานที่', 'ที่อยู่']), t: colIndex(h, ['updated', 'time', 'เวลา']) };
  if (ix.n < 0 || ix.lat < 0 || ix.lng < 0) return null;
  const out = {};
  for (const r of rows.slice(1)) { const la = num(r[ix.lat])[0], lo = num(r[ix.lng])[0]; if (r[ix.n] && la != null && lo != null) out[r[ix.n]] = { lat: la, lng: lo, label: r[ix.l] || '', at: r[ix.t] || '' }; }
  return out;
}

/* ---------- load ---------- */
function showErr(m) { const e = $('#error'); e.hidden = !m; e.textContent = m || ''; }
async function load() {
  const t = trip(); $('#tripTitle').textContent = t.name; $('#syncInfo').textContent = 'กำลังโหลด…';
  const errs = []; data.users = []; data.expenses = []; data.locs = {}; data.plan = null; data.costs = null;
  const tries = [
    async () => { data.plan = parsePlan(await fetchTab(t, { gid: t.planGid })); },
    async () => { const r = await fetchTab(t, { name: t.usersTab }); data.users = parseUsers(r) || []; },
    async () => { const r = await fetchTab(t, { name: t.expensesTab }); data.expenses = parseExpenses(r) || []; },
    async () => { if (t.costTab) { const r = await fetchTab(t, { name: t.costTab }); data.costs = r[0] && r[0].length >= 2 ? parseCosts(r) : null; } },
    async () => { const r = await fetchTab(t, { name: t.locationsTab || 'Locations' }); data.locs = parseLocations(r) || {}; }
  ];
  const res = await Promise.allSettled(tries.map(f => f()));
  if (res[0].status === 'rejected') errs.push('แผนเที่ยว: ' + res[0].reason.message);
  showErr(errs.join('\n'));
  $('#syncInfo').textContent = 'อัปเดต ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' · ข้อมูลจาก Google Sheet';
  if (!cfg.me || !allUsers().some(u => u.name === cfg.me)) cfg.me = allUsers()[0]?.name || '';
  renderAll();
}

/* ---------- render ---------- */
const link = s => esc(s).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
const mapLink = p => (!p || /^ที่พัก$/.test(p)) ? esc(p) : `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p)}" target="_blank" rel="noopener">${esc(p)}</a>`;
function renderPlan() {
  const el = $('#tab-plan'), p = data.plan;
  if (!p) { el.innerHTML = '<div class="card">ไม่มีข้อมูลแผน</div>'; return; }
  const now = new Date(), nd = now.getDate(), nm = now.getMonth();
  let html = '';
  const first = p.days.find(d => d.date);
  if (first) {
    let y = now.getFullYear(), s = new Date(y, first.date.m, first.date.d);
    if (s < new Date(y, nm, nd) - 30 * 864e5) s = new Date(y + 1, first.date.m, first.date.d);
    const diff = Math.round((s - new Date(y, nm, nd)) / 864e5);
    if (diff > 0 && diff < 366) html += `<div class="card">⏳ อีก <b>${diff}</b> วันถึงวันออกเดินทาง (${esc(first.label)})</div>`;
  }
  for (const d of p.days) {
    const today = d.date && d.date.d === nd && d.date.m === nm;
    html += `<div class="card day ${today ? 'today' : ''}"><h2>${esc(d.label)}${today ? ' <span class="chip">วันนี้</span>' : ''}<small>${d.steps.length ? '' : 'ยังไม่มีแผน'}</small></h2>`;
    for (const s of d.steps) {
      const route = (s.from || s.to) ? `<div class="route">${mapLink(s.from)}${s.to ? ' <span class="arrow">→</span> ' + mapLink(s.to) : ''}</div>` : '';
      html += `<div class="step"><div class="time">${esc(s.time || '')}${s.toTime ? `<br><small>→ ${esc(s.toTime)}</small>` : ''}</div><div>
        ${s.text ? `<div>${link(s.text)}</div>` : ''}${route}
        ${s.how ? `<span class="chip">${esc(s.how)}</span>` : ''}${s.note ? `<span class="note">${link(s.note)}</span>` : ''}</div></div>`;
    }
    html += '</div>';
  }
  for (const g of p.ideas) html += `<div class="card"><h3>💡 ${esc(g.title)} (ไอเดีย/สำรอง)</h3><ul>${g.items.map(i => `<li>${mapLink(i)}</li>`).join('')}</ul></div>`;
  el.innerHTML = html || '<div class="card">ไม่พบข้อมูลในชีต</div>';
}
function renderBudget() {
  const el = $('#tab-budget'), c = calc(), cur = trip().currency || 'THB';
  if (!c.list.length) { el.innerHTML = '<div class="card">ยังไม่มีสมาชิก — เพิ่มที่แท็บ 👥 สมาชิก หรือสร้างแท็บ "Users" ในชีต</div>'; return; }
  let h = `<div class="card"><b>รวมจ่ายไปแล้ว ${fmt(c.total)} ${cur}</b></div><div class="grid">`;
  c.list.forEach((u, i) => {
    const rem = u.budget - u.share, pct = u.budget ? Math.min(100, u.share / u.budget * 100) : 0;
    h += `<div class="card"><h3><span class="dot" style="background:${COLORS[i % 8]}"></span>${esc(u.name)}${u.name === cfg.me ? ' <span class="chip">ฉัน</span>' : ''}</h3>
      <div class="bar ${rem < 0 ? 'over' : ''}"><i style="width:${pct}%"></i></div>
      <table><tr><td>งบตั้งต้น</td><td class="n">${fmt(u.budget)}</td></tr>
      <tr><td>ใช้ไป (ส่วนตัว)</td><td class="n">${fmt(u.personal)}</td></tr>
      <tr><td>ส่วนกลาง (หารเท่า)</td><td class="n">${fmt(u.shared)}</td></tr>
      <tr><td>คนอื่นออกให้</td><td class="n">${fmt(u.forMe)}</td></tr>
      <tr><td><b>ใช้รวม</b></td><td class="n"><b>${fmt(u.share)}</b></td></tr>
      <tr><td><b>งบคงเหลือ</b></td><td class="n ${rem < 0 ? 'neg' : 'pos'}"><b>${fmt(rem)}</b></td></tr>
      <tr><td>จ่ายออกไปจริง</td><td class="n">${fmt(u.paid)}</td></tr>
      <tr><td>ออกให้คนอื่น</td><td class="n">${fmt(u.forOthers)}</td></tr>
      <tr><td><b>${u.net >= 0 ? 'ควรได้รับคืน' : 'ต้องจ่ายคืน'}</b></td><td class="n ${u.net >= 0 ? 'pos' : 'neg'}"><b>${fmt(Math.abs(u.net))}</b></td></tr></table></div>`;
  });
  h += '</div>';
  h += `<div class="card"><h3>🔁 สรุปการโอนเงินเคลียร์กัน</h3>${c.tx.length ? '<ul>' + c.tx.map(t => `<li><b>${esc(t.from)}</b> โอนให้ <b>${esc(t.to)}</b> ${fmt(t.v)} ${cur}</li>`).join('') + '</ul>' : '<span class="mut">เคลียร์กันครบแล้ว / ยังไม่มีรายการ</span>'}</div>`;
  const cats = Object.entries(c.cats).sort((a, b) => b[1] - a[1]);
  if (cats.length) h += `<div class="card"><h3>📊 แยกตามหมวด</h3><table>${cats.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${fmt(v)}</td></tr>`).join('')}</table></div>`;
  if (data.costs && (data.costs.person.length || data.costs.group.length)) {
    const sum = l => l.reduce((a, x) => a + x.v, 0);
    h += `<div class="card"><h3>📋 ประมาณการจากชีต "${esc(trip().costTab)}"</h3><div class="grid"><div><b>ต่อคน</b><table>${data.costs.person.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${esc(x.raw)}</td></tr>`).join('')}<tr><td><b>รวม (สูงสุด)</b></td><td class="n"><b>${fmt(sum(data.costs.person))}</b></td></tr></table></div>
      <div><b>บางคน/รวม</b><table>${data.costs.group.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${esc(x.raw)}</td></tr>`).join('')}<tr><td><b>รวม</b></td><td class="n"><b>${fmt(sum(data.costs.group))}</b></td></tr></table></div></div></div>`;
  }
  el.innerHTML = h;
}
function renderExpenses() {
  const el = $('#tab-expenses'), ex = allExpenses(), T = { shared: 'ส่วนกลาง', personal: 'ส่วนตัว', split: 'ออกให้/หาร' };
  let h = `<div class="row"><button class="pri" id="addExp">+ สร้างแถวสำหรับวางในชีต</button><small>ข้อมูลทั้งหมดอ่านจากแท็บ "${esc(trip().expensesTab)}" — เพิ่ม/แก้ในชีตแล้วกด ⟳</small></div><div class="card"><table><tr><th>วันที่/รายการ</th><th>ผู้จ่าย</th><th>ประเภท</th><th class="n">จำนวน</th></tr>`;
  h += ex.map(e => `<tr><td>${esc(e.date)} ${esc(e.item)}<br><small>${esc(e.cat)}${e.with.length ? ' · ' + esc(e.with.join(', ')) : ''}</small></td><td>${esc(e.payer)}</td><td>${T[e.type]}</td><td class="n">${fmt(e.amount)} ${esc(e.cur)}</td></tr>`).join('') || '<tr><td colspan="4" class="mut">ยังไม่มีรายการ (สร้างแท็บ Expenses ในชีต)</td></tr>';
  el.innerHTML = h + '</table></div>';
  $('#addExp').onclick = expenseDialog;
}
function renderPeople() {
  const el = $('#tab-people'), us = allUsers();
  el.innerHTML = `<div class="card"><h3>ฉันคือใคร?</h3><select id="meSel">${us.map(u => `<option ${u.name === cfg.me ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
  <div class="card"><h3>สมาชิกในทริป</h3><table><tr><th>ชื่อ</th><th class="n">งบ</th></tr>${us.map(u => `<tr><td>${esc(u.name)}</td><td class="n">${fmt(u.budget)}</td></tr>`).join('') || '<tr><td colspan="2" class="mut">ยังไม่มี</td></tr>'}</table>
  <small>เพิ่มสมาชิกในแท็บ <b>${esc(trip().usersTab)}</b> ของชีต: คอลัมน์ <code>Name, Budget</code></small></div>`;
  $('#meSel').onchange = e => { cfg.me = e.target.value; saveCfg(); renderAll(); };
}

/* ---------- map / location ---------- */
let map, markers = {}, watchId = null;
function renderMap() {
  const el = $('#tab-map');
  if (!el.dataset.init) {
    el.dataset.init = 1;
    el.innerHTML = `<div class="row"><button class="pri" id="shareBtn">📡 แชร์ตำแหน่งของฉัน</button><input id="lbl" placeholder="ตอนนี้อยู่ที่… (เช่น Green Bazaar)" style="flex:1"><button id="lblBtn">📋 คัดลอกแถวตำแหน่ง</button></div><div id="map"></div><div class="card" id="locList" style="margin-top:12px"></div>`;
    map = L.map('map').setView([43.25, 76.95], 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map);
    $('#shareBtn').onclick = toggleShare; $('#lblBtn').onclick = copyLocRow;
  }
  $('#shareBtn').textContent = watchId == null ? '📡 แชร์ตำแหน่งของฉัน' : '⏹ หยุดแชร์ตำแหน่ง';
  const us = allUsers().map(u => u.name); if (cfg.me && !us.includes(cfg.me)) us.push(cfg.me); Object.keys(data.locs).forEach(n => { if (!us.includes(n)) us.push(n); });
  const pts = [];
  us.forEach((n, i) => {
    const p = (n === cfg.me && data.me) || data.locs[n]; if (!p) return; pts.push([p.lat, p.lng]);
    const html = `<b>${esc(n)}</b><br>${esc(p.label || '')}<br><small>${p.at ? new Date(p.at).toLocaleString('th-TH') : ''}</small>`;
    if (markers[n]) { markers[n].setLatLng([p.lat, p.lng]).setPopupContent(html); }
    else markers[n] = L.circleMarker([p.lat, p.lng], { radius: 10, color: '#fff', weight: 2, fillColor: COLORS[i % 8], fillOpacity: 1 }).addTo(map).bindPopup(html);
  });
  $('#locList').innerHTML = '<h3>ใครอยู่ที่ไหน</h3><table>' + us.map((n, i) => { const p = (n === cfg.me && data.me) || data.locs[n]; return `<tr><td><span class="dot" style="background:${COLORS[i % 8]}"></span>${esc(n)}</td><td>${p ? `<a href="https://www.google.com/maps?q=${p.lat},${p.lng}" target="_blank" rel="noopener">${esc(p.label || `${(+p.lat).toFixed(4)}, ${(+p.lng).toFixed(4)}`)}</a>` : '<span class="mut">ยังไม่แชร์</span>'}</td><td><small>${p?.at ? new Date(p.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''}</small></td></tr>`; }).join('') + '</table>' + '<small>ตำแหน่งเพื่อนอ่านจากแท็บ "' + esc(trip().locationsTab || 'Locations') + '" (Name, Lat, Lng, Label, Updated) — กด "คัดลอกแถวตำแหน่ง" แล้ววางในชีต จากนั้นทุกคนกด ⟳</small>';
  setTimeout(() => { map.invalidateSize(); if (pts.length) map.fitBounds(pts, { maxZoom: 15, padding: [30, 30] }); }, 50);
}
function toggleShare() {
  if (!cfg.me) return alert('เลือกชื่อของคุณที่แท็บสมาชิกก่อน');
  if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; return renderMap(); }
  if (!navigator.geolocation) return alert('อุปกรณ์ไม่รองรับ GPS');
  watchId = navigator.geolocation.watchPosition(pos => pushLoc(pos.coords.latitude, pos.coords.longitude), err => { alert('ขอตำแหน่งไม่ได้: ' + err.message); watchId = null; renderMap(); }, { enableHighAccuracy: true, maximumAge: 15000 });
  renderMap();
}
function pushLoc(lat, lng) {
  data.me = { lat, lng, label: $('#lbl')?.value.trim() || '', at: new Date().toISOString() };
  if (!$('#tab-map').hidden) renderMap();
}
async function copyLocRow() {
  if (!data.me) return alert('ต้องเปิดแชร์ตำแหน่งก่อน');
  const m = data.me, row = [cfg.me, m.lat.toFixed(6), m.lng.toFixed(6), $('#lbl').value.trim(), new Date().toLocaleString('th-TH')].join('\t');
  try { await navigator.clipboard.writeText(row); alert('คัดลอกแล้ว — วางเป็นแถวใหม่ (หรือทับแถวชื่อคุณ) ในแท็บ Locations'); } catch { prompt('คัดลอกแถวนี้:', row); }
}

/* ---------- dialogs ---------- */
const dlg = $('#dlg');
function openDlg(html) { dlg.innerHTML = html; dlg.showModal(); return dlg; }
function expenseDialog() {
  const us = allUsers().map(u => u.name);
  if (!us.length) return alert('เพิ่มสมาชิกก่อน');
  const d = openDlg(`<form method="dialog"><h3>สร้างแถวค่าใช้จ่าย</h3>
  <label>รายการ</label><input name="item" required><label>จำนวนเงิน</label><input name="amount" type="number" step="any" required>
  <label>สกุลเงิน (อัตราแปลงตั้งใน ⚙️)</label><input name="cur" value="${esc(trip().currency || 'THB')}">
  <label>หมวด</label><input name="cat" placeholder="อาหาร / เดินทาง / ที่พัก…">
  <label>ใครจ่าย</label><select name="payer">${us.map(n => `<option ${n === cfg.me ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
  <label>ประเภท</label><select name="type"><option value="shared">ส่วนกลาง — หารเท่ากันทุกคน</option><option value="personal">ส่วนตัว — เฉพาะผู้จ่าย</option><option value="split">ออกให้ — หารเฉพาะคนที่เลือก</option></select>
  <label>หารกับใคร (ใช้กับ "ออกให้" / จำกัดผู้หารส่วนกลาง)</label><div class="checks">${us.map(n => `<label><input type="checkbox" name="w" value="${esc(n)}">${esc(n)}</label>`).join('')}</div>
  <div class="row" style="margin-top:12px"><button value="ok" class="pri">คัดลอกแถว</button><button value="x" formnovalidate>ยกเลิก</button></div></form>`);
  $('form', d).onsubmit = async ev => {
    if (ev.submitter?.value !== 'ok') return;
    const f = new FormData(ev.target);
    const row = [new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }), f.get('item'), f.get('cat'), f.get('amount'), (f.get('cur') || 'THB').toUpperCase(), f.get('payer'), f.get('type'), f.getAll('w').join(', ')].join('\t');
    try { await navigator.clipboard.writeText(row); alert('คัดลอกแถวแล้ว — วางต่อท้ายแท็บ Expenses ในชีต แล้วกด ⟳'); } catch { prompt('คัดลอกแถวนี้:', row); }
  };
}
function tripFields(t) {
  return `<label>ชื่อทริป</label><input name="name" value="${esc(t.name || '')}" required>
  <label>ลิงก์ Google Sheet (แชร์แบบ "ทุกคนที่มีลิงก์ดูได้")</label><input name="url" value="${t.id ? `https://docs.google.com/spreadsheets/d/${esc(t.id)}/edit?gid=${esc(t.planGid || '')}` : ''}" required>
  <label>แท็บแผนเที่ยว: gid (ท้ายลิงก์ ?gid=…; ว่าง = แท็บแรก)</label><input name="planGid" value="${esc(t.planGid || '')}">
  <label>ชื่อแท็บสมาชิก/งบ</label><input name="usersTab" value="${esc(t.usersTab || 'Users')}">
  <label>ชื่อแท็บค่าใช้จ่าย</label><input name="expensesTab" value="${esc(t.expensesTab || 'Expenses')}">
  <label>ชื่อแท็บตำแหน่ง</label><input name="locationsTab" value="${esc(t.locationsTab || 'Locations')}">
  <label>ชื่อแท็บประมาณการ (ไม่บังคับ)</label><input name="costTab" value="${esc(t.costTab || '')}">
  <label>สกุลเงินหลัก</label><input name="currency" value="${esc(t.currency || 'THB')}">`;
}
function readTrip(f) {
  const url = f.get('url'), m = url.match(/\/d\/([\w-]+)/); if (!m) { alert('ลิงก์ไม่ถูกต้อง'); return null; }
  const g = url.match(/gid=(\d+)/);
  return { id: m[1], name: f.get('name'), planGid: f.get('planGid') || (g ? g[1] : ''), usersTab: f.get('usersTab'), expensesTab: f.get('expensesTab'), locationsTab: f.get('locationsTab'), costTab: f.get('costTab'), currency: (f.get('currency') || 'THB').toUpperCase() };
}
function settingsDialog() {
  const t = trip();
  const d = openDlg(`<form method="dialog"><h3>⚙️ ตั้งค่า</h3>
  <h3>ทริปปัจจุบัน</h3>${tripFields(t)}
  <label>อัตราแปลงเป็น ${esc(t.currency)} (เช่น KZT=0.07, USD=35)</label><input name="rates" value="${esc(Object.entries(cfg.rates).map(([k, v]) => k + '=' + v).join(', '))}">
  <div class="row" style="margin-top:12px"><button value="ok" class="pri">บันทึก</button><button value="new" formnovalidate>+ เพิ่มทริป/ชีตอื่น</button><button value="del" class="danger" formnovalidate>ลบทริปนี้</button><button value="x" formnovalidate>ปิด</button></div></form>`);
  $('form', d).onsubmit = ev => {
    const v = ev.submitter?.value, f = new FormData(ev.target);
    if (v === 'new') { setTimeout(newTripDialog, 0); return; }
    if (v === 'del') { if (cfg.trips.length > 1 && confirm('ลบทริปนี้ออกจากรายการ (ไม่กระทบชีตจริง)?')) { cfg.trips = cfg.trips.filter(x => x.id !== t.id); cfg.active = cfg.trips[0].id; saveCfg(); fillTrips(); load(); } return; }
    if (v !== 'ok') return;
    const nt = readTrip(f); if (!nt) return;
    Object.assign(t, nt); if (nt.id !== cfg.active) cfg.active = nt.id;
    cfg.rates = Object.fromEntries(String(f.get('rates')).split(',').map(x => x.split('=').map(s => s.trim())).filter(p => p[0] && +p[1]).map(p => [p[0].toUpperCase(), +p[1]]));
    saveCfg(); fillTrips(); load();
  };
}
function newTripDialog() {
  const d = openDlg(`<form method="dialog"><h3>เพิ่มทริป / สลับไปชีตอื่น</h3>${tripFields({ name: '', currency: 'THB', usersTab: 'Users', expensesTab: 'Expenses' })}<div class="row" style="margin-top:12px"><button value="ok" class="pri">เพิ่ม</button><button value="x" formnovalidate>ยกเลิก</button></div></form>`);
  $('form', d).onsubmit = ev => {
    if (ev.submitter?.value !== 'ok') return;
    const nt = readTrip(new FormData(ev.target)); if (!nt) return;
    cfg.trips = cfg.trips.filter(x => x.id !== nt.id).concat(nt); cfg.active = nt.id; saveCfg(); fillTrips(); load();
  };
}

/* ---------- boot ---------- */
function fillTrips() { $('#tripSelect').innerHTML = cfg.trips.map(t => `<option value="${esc(t.id)}" ${t.id === cfg.active ? 'selected' : ''}>${esc(t.name)}</option>`).join(''); }
function renderAll() { renderPlan(); renderBudget(); renderExpenses(); renderPeople(); if (!$('#tab-map').hidden) renderMap(); }
$('#tabs').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('main > section').forEach(s => s.hidden = s.id !== 'tab-' + b.dataset.tab);
  if (b.dataset.tab === 'map') renderMap();
};
$('#tripSelect').onchange = e => { cfg.active = e.target.value; saveCfg(); load(); };
$('#btnReload').onclick = load; $('#btnSettings').onclick = settingsDialog;
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
setInterval(() => { if (!document.hidden && !dlg.open) load(); }, 60000);
fillTrips(); load();
