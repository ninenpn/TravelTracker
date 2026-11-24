/* Shared test harness. Reads hit the real (public) Supabase; private-trip / write RPCs are mocked with SYNTHETIC data (no real itineraries are kept in this repo). */
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:8123/';
const SB = 'https://vqelnacauxxprredxjda.supabase.co';
const ALMATY = { id: '1PW6xAogCla1lhb4wMwhOQeo2d8g_OXmaRONo1OMSlOw', name: 'Almaty Trip', planGid: '101963523', usersTab: 'Users', expensesTab: 'Expenses', locationsTab: 'Locations', placesTab: 'Places', costTab: 'ค่าใช้จ่าย', extraTabs: '', currency: 'THB' };
const TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const PIXEL = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDPooorhPqD/9k=';

/* synthetic trips matching the keys hard-wired in app.js (PRIV_TRIPS) */
const FAKE = {
  macau: { y: 2026, m: 7, d: 11, days: 4 }, nagoya: { y: 2025, m: 12, d: 5, days: 7 },
  kunming: { y: 2024, m: 12, d: 20, days: 5 }, xian: { y: 2025, m: 4, d: 30, days: 5 }
};
const EXTRA = { nagoya: ['Transport Price', 'JCB-Transport'], kunming: ['Chinese Language'], xian: ['Xian OJC Holiday', 'Chinese Language', 'ภาษาจีน'] };
function fakeTrip(key, stepsPerDay = 3) {
  const f = FAKE[key], plan = [['Day', 'Start time', 'Start Location', 'Arrive time', 'Arrive Location', 'How to Travel', 'Note', 'Tickets']];
  for (let i = 0; i < f.days; i++) {
    const dt = new Date(f.y, f.m - 1, f.d + i), label = `${dt.getDate()}-${TH_M[dt.getMonth()]} ${dt.getFullYear()}`;
    plan.push([label, '09.00', 'ที่พัก', '09.30', `Place ${i}A`, 'Walk', 'note', i === 0 ? 'Ticket https://example.com/t' : '']);
    plan.push(['', 'กินข้าวกลางวันแถวนั้น']);                                   // free-text row between timed steps
    plan.push(['', '11.00', `Place ${i}A`, '11.20', `Place ${i}B`, 'Taxi']);
    for (let k = 3; k < stepsPerDay; k++) plan.push(['', `${11 + k}.00`, `Place ${i}B`, `${11 + k}.20`, `Place ${i}B${k}`, 'Walk']);
  }
  const t = { plan, Cost: [['รายการ', 'ราคา'], ['ตั๋ว', '100']], media: [['id', 'tab', 'row', 'col', 'caption', 'mime', 'w', 'h', 'chunks']] };
  (EXTRA[key] || []).forEach(n => { t[n] = [['A', 'B'], ['x', 'y']]; });
  if (key === 'macau') { t.media.push([`${key}-1`, 'plan', '3', '6', 'Test picture', 'image/jpeg', '1', '1', '1']); t['media:macau-1'] = [[PIXEL]]; }
  return t;
}

const state = { results: [], fails: [], errors: [] };
function check(name, ok, detail = '') {
  state.results.push(!!ok); if (!ok) state.fails.push(name + (detail ? ' — ' + detail : ''));
  console.log((ok ? ' PASS ' : ' FAIL ') + name + (!ok && detail ? '  → ' + detail : ''));
}
function finish() {
  const uniq = [...new Set(state.errors)];
  check('no uncaught page/console errors', uniq.length === 0, uniq.slice(0, 5).join(' || '));
  const ok = state.results.filter(Boolean).length;
  console.log(`\nRESULT: ${ok}/${state.results.length} checks passed`);
  if (state.fails.length) console.log('FAILED:\n - ' + state.fails.join('\n - '));
  process.exit(state.fails.length ? 1 : 0);
}

/* opts: w,h, clock(ISO), active (saved trip id), editCode, goodHash, stepsPerDay, pinned (names that already have a PIN) */
async function open(opts = {}) {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: opts.w || 390, height: opts.h || 844 }, hasTouch: true, isMobile: true });
  const rpc = [], trips = Object.fromEntries(Object.keys(FAKE).map(k => [k, fakeTrip(k, opts.stepsPerDay || 3)]));
  await ctx.route(`${SB}/rest/v1/rpc/*`, async r => {
    const req = r.request(), HH = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: HH });
    const fn = req.url().split('/rpc/')[1], a = JSON.parse(req.postData() || '{}'); rpc.push({ fn, a });
    let body = null, status = 200;
    if (fn === 'pin_status') body = opts.pinned || ['nine'];
    else if (fn === 'verify_pin') body = !opts.goodHash || a.p_hash === opts.goodHash;
    else if (fn === 'usage_stats') body = { db_bytes: 12e6, total_rows: 500, tables: { plan: 25, '(ทริปส่วนตัว)': 400 } };
    else if (fn === 'check_code') body = a.code === 'good';
    else if (fn === 'get_private') body = a.p_hash ? ((trips[a.p_trip] || {})[a.p_tab] || []) : null;
    else if (fn === 'private_write') body = 1;
    else if (['save_tab', 'append_row', 'upsert_row'].includes(fn)) { if (a.code !== 'good') { status = 400; body = { message: 'wrong code' }; } else body = 1; }
    r.fulfill({ status, contentType: 'application/json', headers: HH, body: JSON.stringify(body) });
  });
  const p = await ctx.newPage(), reqs = [];
  p.on('pageerror', e => state.errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) state.errors.push('console: ' + m.text().slice(0, 140)); });
  p.on('request', rq => { const u = rq.url(); if (u.includes('supabase.co')) reqs.push('SB'); else if (/docs\.google\.com\/spreadsheets/.test(u)) reqs.push('SHEET'); });
  if (opts.clock) await p.clock.install({ time: new Date(opts.clock) });
  await p.addInitScript(([c]) => { if (!localStorage.getItem('tt.cfg')) localStorage.setItem('tt.cfg', JSON.stringify(c)); },
    [{ v: 5, trips: [ALMATY], active: opts.active || ALMATY.id, lastMe: '', pendingPin: {}, googleClientId: '', editCode: opts.editCode || '' }]);
  await p.goto(BASE); if (opts.clock) await p.clock.runFor(4000); await p.waitForTimeout(4500);
  return { b, p, rpc, reqs, trips };
}
async function login(s, who, pin = '1234') {
  await s.p.click(`#loginUsers [data-u=${who}]`); await s.p.waitForTimeout(250);
  const create = /ตั้ง PIN/.test(await s.p.innerText('#loginPin'));
  for (const k of pin) await s.p.click(`#loginPin [data-k="${k}"]`);
  if (create) { await s.p.waitForTimeout(250); for (const k of pin) await s.p.click(`#loginPin [data-k="${k}"]`); }
  await s.p.waitForTimeout(2200);
}
module.exports = { open, login, check, finish, fakeTrip, ALMATY, SB, FAKE, state };
