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

/* In-memory twin of docs/supabase_docs.sql (same rules: every member sees/gets every doc, p_owner = add for someone else, rename/delete by owner or uploader, MIME/size/count/title limits). SYNTHETIC data only. */
function mockDocs(fn, a, docs, flags) {
  if (flags.noDocsSql) return { status: 404, body: { message: `Could not find the function public.${fn} in the schema cache` } };
  const me = String(a.p_name || '').toLowerCase(), ok = !!me && !flags.nullDocs, vis = () => true, meta = ({ chunkData, ...m }) => m;
  const mine = d => d.created_by === me || (d.scope === 'person' && d.owner === me);
  if (fn === 'doc_list') return { status: 200, body: ok ? docs.filter(vis).map(meta) : null };
  if (fn === 'doc_get') { const d = docs.find(x => x.id === a.p_id && vis(x)); return { status: 200, body: ok && d ? { id: d.id, scope: d.scope, owner: d.owner, title: d.title, kind: d.kind, mime: d.mime, note: d.note, chunks: d.chunkData } : null }; }
  if (fn === 'doc_put') {
    if (flags.forcePut) return { status: 200, body: flags.forcePut };
    if (!ok) return { status: 200, body: '-1' };
    if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(a.p_mime)) return { status: 200, body: '-2' };
    const t = String(a.p_title || '').trim(), tot = (a.p_chunks || []).reduce((n, c) => n + c.length, 0);
    if (!['person', 'shared'].includes(a.p_scope) || !t || t.length > 80 || !(a.p_chunks || []).length) return { status: 200, body: '-5' };
    if (tot > 6e6) return { status: 200, body: '-3' };
    const ow = a.p_scope === 'person' && a.p_owner ? String(a.p_owner).trim().toLowerCase() : me;
    if (a.p_scope === 'person' && a.p_owner && flags.users && !flags.users.includes(ow)) return { status: 200, body: '-6' };
    if (docs.filter(d => a.p_scope === 'person' ? d.scope === 'person' && d.owner === ow : d.scope === 'shared').length >= (a.p_scope === 'person' ? 40 : 60)) return { status: 200, body: '-4' };
    docs.seq = (docs.seq || 0) + 1; const nid = '00000000-0000-4000-8000-' + String(docs.seq).padStart(12, '0');
    docs.push({ id: nid, scope: a.p_scope, owner: a.p_scope === 'person' ? ow : '', trip: a.p_trip || '', title: t, kind: a.p_kind || 'other', mime: a.p_mime, size_bytes: Math.floor(tot * 3 / 4), note: a.p_note || '', created_by: me, created_at: new Date().toISOString(), chunks: a.p_chunks.length, chunkData: a.p_chunks });
    return { status: 200, body: nid };
  }
  if (!ok) return { status: 200, body: -1 };
  const d = docs.find(x => x.id === a.p_id && mine(x));
  if (fn === 'doc_rename') { const t = String(a.p_title || '').trim(); if (!t || t.length > 80) return { status: 200, body: -5 }; if (d) d.title = t; return { status: 200, body: d ? 1 : 0 }; }
  if (fn === 'doc_delete') { if (d) docs.splice(docs.indexOf(d), 1); return { status: 200, body: d ? 1 : 0 }; }
  return { status: 404, body: { message: 'unknown ' + fn } };
}

/* opts: w,h, clock(ISO), active (saved trip id), stepsPerDay, init (function run in the page before any script), reducedMotion */
async function open(opts = {}) {
  const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: opts.w || 390, height: opts.h || 844 }, hasTouch: true, isMobile: true, reducedMotion: opts.reducedMotion || 'no-preference' });
  const rpc = [], docs = [], flags = { nullPriv: false, err500: false, delayMs: 0, noDocsSql: false, nullDocs: false, offline: false, noAvSql: false }, avs = {}, trips = Object.fromEntries(Object.keys(FAKE).map(k => [k, fakeTrip(k, opts.stepsPerDay || 3)]));
  await ctx.route(`${SB}/rest/v1/rpc/*`, async r => {
    if (flags.offline) return r.abort('internetdisconnected');
    const req = r.request(), HH = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: HH });
    const fn = req.url().split('/rpc/')[1], a = JSON.parse(req.postData() || '{}'); rpc.push({ fn, a });
    let body = null, status = 200;
    if (flags.delayMs && fn === 'get_private') await new Promise(x => setTimeout(x, flags.delayMs));
    const trav = ['nine', 'mew'].includes(String(a.p_name || '').trim().toLowerCase());          // open rules (docs/supabase_open.sql): private trips = trip members by NAME, the hash is ignored
    if (fn === 'usage_stats') body = { db_bytes: 12e6, total_rows: 500, tables: { plan: 25, '(ทริปส่วนตัว)': 400 } };
    else if (fn.startsWith('avatar_')) {          /* twin of docs/supabase_avatars.sql: central photos, any known traveller may set/remove any traveller's photo */
      if (flags.noAvSql) { status = 404; body = { message: `Could not find the function public.${fn} in the schema cache` }; }
      else if (fn === 'avatar_list') body = avs;
      else { const k = String(a.p_name || '').trim().toLowerCase(), known = ['nine', 'mew', ...(flags.users || [])].includes(k);
        if (!known) body = -1;
        else if (fn === 'avatar_put') body = !['image/jpeg', 'image/png', 'image/webp'].includes(a.p_mime) ? -2 : (!a.p_data || a.p_data.length > 120000) ? -3 : (avs[k] = { m: a.p_mime, d: a.p_data }, 1);
        else { body = avs[k] ? 1 : 0; delete avs[k]; } }
    }
    else if (fn === 'get_private') { if (flags.err500) { status = 500; body = { message: 'boom' }; } else body = trav && !flags.nullPriv ? ((trips[a.p_trip] || {})[a.p_tab] || []) : null; }
    else if (fn.startsWith('doc_')) { const r = mockDocs(fn, a, docs, flags); status = r.status; body = r.body; }
    else if (fn === 'private_write') body = trav ? 1 : -1;
    else if (['save_tab', 'append_row', 'upsert_row'].includes(fn)) body = 1;          // no edit code any more (docs/supabase_nocode.sql)
    r.fulfill({ status, contentType: 'application/json', headers: HH, body: JSON.stringify(body) });
  });
  /* third-party geocoding / routing are not under test (and are rate limited): answer "nothing found" so runs are deterministic */
  await ctx.route(/nominatim\.openstreetmap\.org|routing\.openstreetmap\.de/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: r.request().url().includes('routing') ? '{"code":"NoRoute"}' : '[]' }));
  const p = await ctx.newPage(), reqs = [];
  p.on('pageerror', e => state.errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) state.errors.push('console: ' + m.text().slice(0, 140)); });
  p.on('request', rq => { const u = rq.url(); if (u.includes('supabase.co')) reqs.push('SB'); else if (/docs\.google\.com\/spreadsheets/.test(u)) reqs.push('SHEET'); });
  if (opts.init) await p.addInitScript(opts.init);
  if (opts.clock) await p.clock.install({ time: new Date(opts.clock) });
  await p.addInitScript(([c]) => { if (!localStorage.getItem('tt.cfg')) localStorage.setItem('tt.cfg', JSON.stringify(c)); },
    [{ v: 5, trips: [ALMATY], active: opts.active || ALMATY.id, lastMe: '', googleClientId: '' }]);
  await p.goto(BASE); if (opts.clock) await p.clock.runFor(4000); await p.waitForTimeout(4500);
  return { b, ctx, p, rpc, reqs, trips, flags, docs, avs };
}
/* "log in" = choose who you are from the plain traveller list (no PIN anywhere) */
async function login(s, who) {
  if (!(await s.p.isVisible('#whoList'))) { await s.p.click('#btnMe'); await s.p.waitForTimeout(250); }
  await s.p.click(`#whoList [data-u=${who}]`); await s.p.waitForTimeout(1500);
}
module.exports = { open, login, check, finish, fakeTrip, ALMATY, SB, FAKE, state };
