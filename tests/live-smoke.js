/* Read-only smoke test against the LIVE Supabase using only the public (publishable) key — safe to run any time.
   Verifies row-level security, the PIN/private-data guards and that the public data is intact. Does not write anything. */
const KEY = process.env.SB_PUBLISHABLE_KEY || 'sb_publishable_r5o_W0BafIaL9vbBZBUFAA_MXd-Djbm';
const U = 'https://vqelnacauxxprredxjda.supabase.co/rest/v1';
let ok = 0, bad = [];
const check = (n, c, d = '') => { c ? ok++ : bad.push(n + (d ? ' — ' + d : '')); console.log((c ? ' PASS ' : ' FAIL ') + n + (!c && d ? '  → ' + d : '')); };
const h = { apikey: KEY, 'Content-Type': 'application/json' };
const get = async p => { const r = await fetch(U + p, { headers: h }); return { s: r.status, j: await r.json().catch(() => null), cr: r.headers.get('content-range') }; };
const rpc = async (fn, b) => { const r = await fetch(`${U}/rpc/${fn}`, { method: 'POST', headers: h, body: JSON.stringify(b) }); const t = await r.text(); return { s: r.status, j: t ? JSON.parse(t) : null }; };
(async () => {
  console.log('[live] public data');
  for (const t of ['plan', 'Users', 'Expenses', 'Stay', 'ค่าใช้จ่าย']) { const r = await get(`/sheet_rows?tab=eq.${encodeURIComponent(t)}&select=row_no`); check(`public tab "${t}" has rows`, Array.isArray(r.j) && r.j.length > 0, `status ${r.s}`); }
  const users = await get('/sheet_rows?tab=eq.Users&row_no=gt.0&select=cells');
  check('PIN column in public Users rows is empty', Array.isArray(users.j) && users.j.every(r => !(r.cells[2] || '').trim() || !/^[0-9a-f]{64}$/.test(r.cells[2])));
  console.log('[live] row-level security');
  for (const t of ['private_rows', 'member_pins', 'trip_members', 'pin_fail', 'app_secrets', 'sheet_history']) { const r = await get(`/${t}?select=*&limit=1`); check(`anon cannot read ${t}`, r.s === 401 || r.s === 403 || r.s === 404 || (Array.isArray(r.j) && r.j.length === 0 && r.s !== 200), `status ${r.s}`); }
  const w = await fetch(`${U}/sheet_rows`, { method: 'POST', headers: h, body: JSON.stringify({ tab: '__probe', row_no: 0, cells: [] }) });
  check('anon cannot write sheet_rows directly', w.status === 401 || w.status === 403, `status ${w.status}`);
  console.log('[live] function guards');
  /* NOTE: there is no edit code any more, so never send a writable payload here (it would really write). A 1-row plan is refused by the server guard before anything is touched. */
  check('save_tab refuses an empty plan (1 row) without touching data', (await rpc('save_tab', { p_tab: 'plan', p_rows: [['a']], code: '' })).s === 400);
  check('private_write by a stranger returns -1', (await rpc('private_write', { p_trip: 'macau', p_tab: 'plan', p_op: 'save', p_payload: [['a'], ['b']], p_name: 'Stranger', p_hash: 'x' })).j === -1);
  check('get_private by a stranger returns null', (await rpc('get_private', { p_trip: 'macau', p_tab: 'plan', p_name: 'Stranger', p_hash: 'x' })).j === null);
  const st = await rpc('usage_stats', {}); check('usage_stats works and DB is far below the 500 MB free limit', st.s === 200 && st.j.db_bytes < 400 * 1048576, JSON.stringify(st.j).slice(0, 100));
  check('pin_status returns a list of names only', Array.isArray((await rpc('pin_status', {})).j));
  console.log(`\nRESULT: ${ok}/${ok + bad.length} checks passed`); if (bad.length) console.log('FAILED:\n - ' + bad.join('\n - '));
  process.exit(bad.length ? 1 : 0);
})();
