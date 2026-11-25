/* End-to-end system check (Playwright). Run via `bash tests/run.sh`. Real Supabase for public reads; private/write RPCs mocked with synthetic data. */
const { open, login, check, finish, FAKE, ALMATY } = require('./lib');

(async () => {
  /* ---------- A. public data (real Supabase) ---------- */
  console.log('\n[A] public data load');
  let s = await open(), p = s.p;
  check('A1 fresh load opens straight to the plan: no login overlay, no PIN pad', await p.evaluate(() => !document.getElementById('login') && !document.querySelector('.pinpad, #loginPin, #loginUsers') && !document.getElementById('app').hidden && !!document.querySelector('#tl .step')));
  await p.click('[data-tab=menu]'); await p.waitForTimeout(400); await p.click('#bSwitch'); await p.waitForTimeout(300);
  check('A2 traveller list (names only) opens from the Menu members card', await p.evaluate(() => document.querySelectorAll('#whoList [data-u]').length) >= 2);
  await p.click('#dlg button[value=x]'); await p.waitForTimeout(200);
  check('A3 Almaty plan loaded (>= 1 day)', await p.evaluate(() => data.plan && data.plan.days.length) >= 1);
  check('A4 data comes from Supabase, not the Google Sheet', s.reqs.includes('SB') && !s.reqs.includes('SHEET'));
  check('A5 PIN hashes are not exposed in public Users rows', await p.evaluate(() => users().every(u => !u.pin)));
  const src = require('fs').readFileSync(__dirname + '/../app.js', 'utf8') + require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
  check('A6 no PIN UI or PIN flow left in app.js / index.html', !/pinpad|loginPin|loginUsers|ตั้ง PIN|ลืม PIN|ใส่ PIN|verify_pin|set_first_pin|reset_pin|pin_status|tt\.ph|pendingPin/.test(src));
  await s.b.close();

  /* ---------- B. travellers (no login / PIN) ---------- */
  console.log('\n[B] travellers');
  s = await open(); p = s.p;
  const names = await p.evaluate(() => users().map(u => u.name));
  await p.evaluate(() => travellerPicker()); await p.waitForTimeout(300);
  check('B1 Almaty list = every name in the Users tab, in order', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#whoList [data-u]')].map(x => x.dataset.u))) === JSON.stringify(names));
  const solo = names.find(n => !['nine', 'mew'].includes(n.toLowerCase())) || names[0];
  await p.click(`#whoList [data-u="${solo}"]`); await p.waitForTimeout(800);
  check('B2 choosing a name sets "me" and stores it in localStorage (plain text, not secret)', await p.evaluate(n => me === n && JSON.parse(localStorage.getItem('tt.me')) === n, solo));
  check('B3 no PIN RPC or hash anywhere: only the constant dummy hash is ever sent', !s.rpc.some(r => ['verify_pin', 'set_first_pin', 'reset_pin', 'pin_status'].includes(r.fn)) && s.rpc.every(r => !('p_hash' in r.a) || r.a.p_hash === 'open') && await p.evaluate(() => !sessionStorage.getItem('tt.ph') && !localStorage.getItem('tt.ph')));
  await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2300);
  await p.evaluate(() => travellerPicker()); await p.waitForTimeout(300);
  check('B4 a private trip lists exactly Nine and Mew', JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('#whoList [data-u]')].map(x => x.dataset.u))) === '["Nine","Mew"]');
  await p.click('#dlg button[value=x]'); await p.waitForTimeout(200);
  check('B5 chosen name not on this trip: falls back to Nine, the choice itself is kept, trip loads', await p.evaluate(n => me === 'Nine' && JSON.parse(localStorage.getItem('tt.me')) === n && !!data.plan && data.plan.days.length > 0, solo));
  check('B5b private RPCs use the fallback name and the dummy hash', s.rpc.filter(r => r.fn === 'get_private').every(r => r.a.p_name === 'Nine' && r.a.p_hash === 'open'));
  await p.evaluate(() => travellerPicker()); await p.waitForTimeout(300); await p.click('#whoList [data-u=Mew]'); await p.waitForTimeout(1200);
  check('B6 picking Mew on a private trip works', await p.evaluate(() => me === 'Mew' && /ฉัน/.test(document.querySelector('#tab-menu .mrow[data-n=Mew]').innerText) && !document.querySelector('#tab-menu .mrow[data-n=Nine] .chip')));
  await p.evaluate(() => switchTrip(DEFAULT_TRIP.id)); await p.waitForTimeout(2300);
  check('B7 back on Almaty "Mew" (a Users name) is still the effective name', await p.evaluate(() => me === 'Mew' || !users().some(u => u.name === 'Mew')));
  await p.reload(); await p.waitForTimeout(3500);
  check('B8 the choice survives a reload', await p.evaluate(() => JSON.parse(localStorage.getItem('tt.me')) === 'Mew'));
  await s.b.close();
  /* (dropped on purpose: checks of the PIN pad, wrong/mismatching PIN, hash storage and sessionStorage hash - those behaviours no longer exist) */

  /* ---------- C. trips ---------- */
  console.log('\n[C] trips, status, access');
  s = await open(); p = s.p; await login(s, 'Mew'); const keys = Object.keys(FAKE);
  check('C1 every trip is listed (no login needed)', await p.evaluate(() => visibleTrips().length) === 1 + keys.length);
  check('C2 default list = Current + Upcoming only', await p.evaluate(() => tripList().every(t => tripStatus(t) !== 'past')));
  check('C3 Past filter = the finished trips, newest first', await p.evaluate(() => { ui.tripFilter = 'past'; return tripList().map(t => t.key).join(); }) === 'macau,nagoya,xian,kunming');
  await p.evaluate(() => { ui.tripFilter = 'now'; });
  for (const k of keys) {
    await p.evaluate(i => switchTrip(i), 'priv:' + k); await p.waitForTimeout(2300);
    const got = await p.evaluate(() => ({ d: data.plan ? data.plan.days.length : -1, e: data.extra.length, st: tripStatus(trip()) }));
    check(`C4 ${k}: ${FAKE[k].days} days, status Past`, got.d === FAKE[k].days && got.st === 'past', JSON.stringify(got));
  }
  await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2300);
  check('C5 ticket URLs in the Tickets column are clickable', await p.evaluate(() => [...document.querySelectorAll('#tl a')].some(a => /example\.com/.test(a.href))));
  check('C6 picture gallery opens and lazy-loads', await (async () => { await p.evaluate(() => openGallery()); await p.waitForTimeout(1500); return p.evaluate(() => [...document.querySelectorAll('.gimg')].some(b => b.style.backgroundImage.includes('data:image/jpeg'))); })());
  await p.evaluate(() => document.getElementById('dlg').close());
  await s.b.close();
  s = await open({ clock: '2026-07-12T10:00:00' }); p = s.p; await login(s, 'Nine');
  check('C7 status follows the date (Macau is Current on 2026-07-12)', await p.evaluate(() => tripStatus(cfg.trips.find(t => t.key === 'macau'))) === 'current');
  await s.b.close();
  s = await open({ active: 'priv:macau' }); p = s.p;
  check('C8 fresh load with a private trip saved as active opens it directly (no login, no fallback)', await p.evaluate(() => trip().key === 'macau' && data.plan && data.plan.days.length === 4 && me === 'Nine') && s.rpc.some(r => r.fn === 'get_private'));
  await s.b.close();

  /* ---------- D. plan editing (deterministic synthetic trip) ---------- */
  console.log('\n[D] plan view & editing');
  s = await open(); p = s.p; await login(s, 'Nine');
  await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2300);
  check('D1 day bar has one pill per day', await p.evaluate(() => document.querySelectorAll('#homeDays .pill[data-day]').length) === FAKE.macau.days);
  check('D2 cards show travel + stay durations', await p.evaluate(() => /เดินทาง 30 นาที/.test(document.getElementById('tl').innerText) && /อยู่ที่นั่น 1 ชม\. 30 น\./.test(document.getElementById('tl').innerText)));
  await p.click('#editBtn'); await p.waitForTimeout(400);
  check('D3 private trip: edit mode needs no edit code and no PIN', await p.evaluate(() => ui.edit));
  await p.evaluate(() => stepDialog(0)); await p.waitForTimeout(300);
  check('D4 dialog prefilled with travel 30 / stay across the free-text row', (await p.inputValue('[name=trav]')) === '30' && (await p.inputValue('[name=stay]')) === '90');
  await p.fill('[name=trav]', '45'); check('D5 travel minutes -> arrival (09.00 + 45 = 09.45)', (await p.inputValue('[name=at]')) === '09.45');
  await p.fill('[name=at]', '10.00'); check('D6 arrival -> travel minutes (60)', (await p.inputValue('[name=trav]')) === '60');
  await p.click('#reuseStay .tag[data-m="60"]'); await p.click('#dlg button[value=ok]'); await p.waitForTimeout(1500);
  const times = await p.evaluate(() => data.plan.days[0].steps.filter(s => s.time).map(s => s.time + '>' + s.toTime).join(' | '));
  check('D7 next timed stop moved to arrival + stay (11.00 -> 11.00; arrival 10.00 + 60)', /^09\.00>10\.00 \| 11\.00>11\.20/.test(times), times);
  await p.evaluate(() => stepDialog(0)); await p.waitForTimeout(300); await p.click('#reuseStay .tag[data-m="30"]'); await p.click('#dlg button[value=ok]'); await p.waitForTimeout(1500);
  const times2 = await p.evaluate(() => data.plan.days[0].steps.filter(s => s.time).map(s => s.time + '>' + s.toTime).join(' | '));
  check('D8 shorter stay pulls the following stops earlier (30 min -> 10.30)', /^09\.00>10\.00 \| 10\.30>10\.50/.test(times2), times2);
  const w = s.rpc.filter(r => r.fn === 'private_write').pop();
  check('D9 saved through private_write (op=save) with header + all days', !!w && w.a.p_op === 'save' && w.a.p_payload[0][0] === 'Day' && w.a.p_payload.filter(r => /^\d+-/.test(r[0] || '')).length === FAKE.macau.days);
  await p.evaluate(() => { ui.edit = false; stepDialog(null); }); await p.waitForTimeout(300);
  check('D10 add-step form prefills the previous arrival time', /\d\d\.\d\d/.test(await p.inputValue('[name=st]')));
  await s.b.close();
  s = await open(); p = s.p; await login(s, 'Nine');
  await p.click('#editBtn'); await p.waitForTimeout(500);
  check('D11a public trip: edit mode opens straight away, no code dialog', await p.evaluate(() => ui.edit && !document.getElementById('dlg').open));
  await p.evaluate(() => { ui.day = 0; renderPlan(); stepDialog(0); }); await p.waitForTimeout(300);
  await p.fill('[name=note]', 'x'); await p.click('#dlg button[value=ok]'); await p.waitForTimeout(3000);
  const dst = await p.evaluate(() => ({ dlg: document.getElementById('dlg').open, txt: document.body.innerText, cfg: JSON.stringify(cfg) }));
  const sv = s.rpc.filter(r => r.fn === 'save_tab').pop();
  check('D11 public trip: save goes through save_tab with NO edit code and no dialog', !!sv && sv.a.code === '' && sv.a.p_tab === 'plan' && !dst.dlg && !/รหัสแก้ไข/.test(dst.txt) && !/editCode/.test(dst.cfg), JSON.stringify(sv && sv.a).slice(0, 120));
  const cnt = s.rpc.filter(r => ['append_row', 'upsert_row'].includes(r.fn)).length;
  await p.evaluate(() => sheetApi.call('append', { tab: 'Expenses', values: ['a', 'b'] })); await p.evaluate(() => sheetApi.call('upsert', { tab: 'Places', key: 'k', values: ['k', '1'] }));
  check('D11b public append_row / upsert_row go out without a code', s.rpc.filter(r => ['append_row', 'upsert_row'].includes(r.fn)).length === cnt + 2 && s.rpc.filter(r => ['append_row', 'upsert_row'].includes(r.fn)).every(r => r.a.code === ''));
  const srcAll = require('fs').readFileSync(__dirname + '/../app.js', 'utf8') + require('fs').readFileSync(__dirname + '/../index.html', 'utf8') + require('fs').readFileSync(__dirname + '/../style.css', 'utf8');
  check('D11c no edit-code UI / flow left in app.js, index.html, style.css', !/รหัสแก้ไข|editCode|askEditCode|check_code|bUnlock|bLock/.test(srcAll));
  await s.b.close();

  /* ---------- E. money (synthetic expenses, independent arithmetic) ---------- */
  console.log('\n[E] money');
  s = await open(); p = s.p; await login(s, 'Nine');
  const r = await p.evaluate(() => {
    const names = users().map(u => u.name), a = names[0], b = names[1];
    data.expenses = [{ item: 'x', cat: 'x', amount: 1000, cur: 'THB', payer: a, type: 'personal', with: [] }, { item: 'y', cat: 'x', amount: 300, cur: 'THB', payer: a, type: 'shared', with: [] }, { item: 'z', cat: 'x', amount: 90, cur: 'THB', payer: b, type: 'split', with: [a, b] }];
    const c = calcAll().out.THB, g = n => c.list.find(u => u.name === n), n = names.length;
    return { n, a, b, aShare: +g(a).share.toFixed(2), bShare: +g(b).share.toFixed(2), aNet: +g(a).net.toFixed(2), pair: c.pairs.find(x => x.from === a && x.to === b) };
  });
  check('E1 share = personal + shared/n + split/2', Math.abs(r.aShare - (1000 + 300 / r.n + 45)) < 0.01 && Math.abs(r.bShare - (300 / r.n + 45)) < 0.01, JSON.stringify(r));
  check('E2 net = paid - share', Math.abs(r.aNet - (1300 - (1000 + 300 / r.n + 45))) < 0.01);
  check('E3 pairwise debt = split 45 minus b\'s share of the shared 300 (45 - 300/n)', !!r.pair && Math.abs(r.pair.v - (45 - 300 / r.n)) < 0.01, JSON.stringify(r.pair));
  await s.b.close();

  /* ---------- F. other tabs ---------- */
  console.log('\n[F] other tabs');
  s = await open(); p = s.p; await login(s, 'Nine');
  await p.click('[data-tab=spots]'); await p.waitForTimeout(700);
  check('F1 places tab is ONE page: add box + (empty state or saved places), no segment switcher', await p.evaluate(() => !!document.getElementById('linkIn') && !!document.getElementById('addSpot') && (!!document.getElementById('spotEmpty') || !!document.querySelector('.spot')) && document.querySelectorAll('#tab-spots .seg button').length === 0));
  await p.evaluate(() => { ui.tipsOpen = true; renderSpots(); }); await p.waitForTimeout(300);
  check('F2 tips: food items link to Maps / TikTok / Facebook', await p.evaluate(() => { const l = [...document.querySelectorAll('#tab-spots a')].map(a => a.href); return l.some(x => /google\.com\/maps/.test(x)) && l.some(x => /tiktok\.com\/search/.test(x)) && l.some(x => /facebook\.com\/search/.test(x)); }));
  await p.click('[data-tab=plan]'); await p.waitForTimeout(500); await p.click('#dockFull'); await p.waitForTimeout(1300);
  check('F3 full-screen map overlay renders the map', await p.evaluate(() => !document.getElementById('mapOv').hidden && !!document.querySelector('#mapOv .leaflet-container')));
  await p.click('#ovClose'); await p.waitForTimeout(300);
  await p.click('[data-tab=menu]'); await p.waitForTimeout(1000);
  const menu = await p.innerText('#tab-menu');
  check('F4 menu: trips, usage card (X / 500 MB); the profile card and the edit card are gone', /ทริป/.test(menu) && /\/ 500 MB/.test(menu) && !/แก้ไขทริป/.test(menu) && !/โปรไฟล์ของฉัน|กำลังใช้งานในชื่อนี้/.test(menu) && await p.evaluate(() => !document.querySelector('#tab-menu .profile')));
  await p.click('#bTheme'); await p.waitForTimeout(250); check('F5 dark mode toggles', await p.evaluate(() => document.documentElement.dataset.theme) === 'dark');
  await s.b.close();

  /* ---------- G. reminders & location window ---------- */
  console.log('\n[G] reminders & location window');
  s = await open({ clock: '2027-02-13T09:50:00' }); p = s.p; await login(s, 'Nine');
  const first = await p.evaluate(() => { const st = data.plan.days[0].steps.find(x => x.time); return st ? st.time : null; });
  check('G0 Almaty first step has a time (data sanity)', !!first);
  await p.evaluate(() => { cfg.notif.on = true; cfg.notif.lead = 15; cfg.notif.fired = {}; checkReminders(); }); await p.waitForTimeout(400);
  check('G1 reminder fires shortly before the first timed step', /อีก \d+ นาที/.test(await p.evaluate(() => document.getElementById('toast').innerText)));
  check('G2 location gate before landing = before', await p.evaluate(() => gate().state) === 'before');
  await s.b.close();
  s = await open({ clock: '2027-02-14T12:00:00' }); p = s.p; await login(s, 'Nine');
  check('G3 location gate while travelling = active', await p.evaluate(() => gate().state) === 'active'); await s.b.close();
  s = await open({ clock: '2027-02-25T12:00:00' }); p = s.p; await login(s, 'Nine');
  check('G4 location gate after the last flight = after', await p.evaluate(() => gate().state) === 'after'); await s.b.close();

  /* ---------- H. layout ---------- */
  console.log('\n[H] layout');
  for (const [w, h] of [[360, 640], [390, 844], [430, 932]]) {
    s = await open({ w, h, stepsPerDay: 10 }); p = s.p; await login(s, 'Nine');
    await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2300);
    const bad = [];
    for (const t of ['plan', 'money', 'spots', 'docs', 'menu']) { await p.click(`[data-tab=${t}]`); await p.waitForTimeout(500); const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 1) bad.push(t + '+' + o); }
    check(`H1 ${w}x${h}: no horizontal scroll on any tab`, !bad.length, bad.join());
    await p.click('[data-tab=plan]'); await p.waitForTimeout(400);
    const m = await p.evaluate(async () => {
      const w = ms => new Promise(r => setTimeout(r, ms)), dock = document.getElementById('homeDock'), bar = document.getElementById('homeDays'), topH = document.querySelector('.top').getBoundingClientRect().bottom;
      const tr = () => getComputedStyle(dock).transform + '|' + getComputedStyle(bar).transform; const t0 = tr(); let moved = 0, barY = [], dockAbs = [];
      const y0 = dock.getBoundingClientRect().top + scrollY;
      for (const y of [0, 150, 300, 600, 450, 700]) { window.scrollTo(0, y); await w(120); if (tr() !== t0) moved++; barY.push(Math.round(bar.getBoundingClientRect().top - topH)); dockAbs.push(Math.round(dock.getBoundingClientRect().top + scrollY - y0)); }
      const first = document.querySelector('#tl .step');
      window.scrollTo(0, 700); await w(200); first.scrollIntoView({ block: 'start' }); await w(300);
      const fr = first.getBoundingClientRect(), bb = bar.getBoundingClientRect();
      const stuck = barY.slice(2).every(v => Math.abs(v) <= 1);
      window.scrollTo(0, document.documentElement.scrollHeight); await w(450);
      const st = [...document.querySelectorAll('#tl .step')], l = st[st.length - 1].getBoundingClientRect(), n = document.querySelector('nav').getBoundingClientRect();
      return { moved, stuck, barY, flow: dockAbs.every(v => v === 0), firstClear: fr.top >= bb.bottom - 1, tw: getComputedStyle(dock).transitionProperty + '/' + getComputedStyle(bar).transitionProperty, lastClear: l.bottom <= n.top + 1 };
    });
    check(`H2 ${w}x${h}: map card scrolls in normal flow (no transform/transition), day bar stays sticky under the header, first step not covered`, m.moved === 0 && m.stuck && m.flow && m.firstClear && !/transform/.test(m.tw), JSON.stringify(m));
    check(`H3 ${w}x${h}: last card not covered by the bottom bar`, m.lastClear);
    await s.b.close();
  }
  /* ---------- I. refused / failing private reads + reminders on past trips ---------- */
  console.log('\n[I] refused reads & past-trip reminders');
  s = await open(); p = s.p; await login(s, 'Nine');
  await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2300);
  s.flags.err500 = true; await p.evaluate(() => load()); await p.waitForTimeout(1500);
  check('I2 transient HTTP error keeps the trip and the chosen name', await p.evaluate(() => me === 'Nine' && trip().key === 'macau' && !!data.plan));
  s.flags.err500 = false; s.flags.nullPriv = true; await p.evaluate(() => load()); await p.waitForTimeout(2500);
  const st = await p.evaluate(() => ({ me, act: cfg.active, err: document.getElementById('error').hidden ? '' : document.getElementById('error').textContent, toast: document.getElementById('toast').textContent, plan: !!data.plan, login: !!document.getElementById('login') }));
  check('I1 server refuses a private read (null): app stays on the trip with its last data, no sign-out, no PIN toast, no error box', st.me === 'Nine' && st.act === 'priv:macau' && st.plan && !st.err && !/PIN/.test(st.toast) && !st.login, JSON.stringify(st));
  s.flags.nullPriv = false; await p.evaluate(() => load()); await p.waitForTimeout(2300);
  check('I3 reads work again afterwards', await p.evaluate(() => me === 'Nine' && trip().key === 'macau' && !!data.plan && data.plan.days.length > 0));
  check('I4 past trip: menu shows "trip ended" note, no switch/ics buttons', await (async () => { await p.click('[data-tab=menu]'); await p.waitForTimeout(400); return p.evaluate(() => /ทริปนี้จบแล้ว/.test(document.getElementById('tab-menu').innerText) && !document.getElementById('nOn') && !document.getElementById('nIcs')); })());
  await s.b.close();
  s = await open({ clock: '2026-07-01T10:00:00' }); p = s.p; await login(s, 'Nine');
  await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2300); await p.click('[data-tab=menu]'); await p.waitForTimeout(400);
  check('I5 upcoming trip: card keeps count, switch, lead select, ics', await p.evaluate(() => !!document.getElementById('nOn') && !!document.getElementById('nLead') && !!document.getElementById('nIcs') && /\d+ รายการ/.test(document.getElementById('tab-menu').innerText)));
  s.flags.nullPriv = false; await s.b.close();
  s = await open({ clock: '2026-07-12T10:30:00' }); p = s.p; await login(s, 'Nine');
  await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2300);
  check('I6 count excludes events already over', await p.evaluate(() => { const all = planEvents().length, n = planEvents().filter(e => (e.end || e.dt) > Date.now()).length; return n < all && n > 0 && notifCard().includes(n + ' รายการ'); }));
  await s.b.close();

  /* ---------- J. calm UI: stability, overlay map, offline cache ---------- */
  console.log('\n[J] calm UI');
  const CLS = () => { window.__cls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { } };
  const cls = p => p.evaluate(() => +window.__cls.toFixed(4));
  s = await open({ init: CLS }); p = s.p;
  const cBoot = await cls(p);
  check('J1 CLS at boot <= 0.05', cBoot <= 0.05, String(cBoot));
  await login(s, 'Nine'); await p.waitForTimeout(1500);
  const cLogin = await cls(p) - cBoot;
  check('J2 CLS choosing a traveller <= 0.05', cLogin <= 0.05, String(cLogin));
  await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2500);
  await p.evaluate(() => switchTrip('priv:nagoya')); await p.waitForTimeout(2500);
  await p.evaluate(() => switchTrip(DEFAULT_TRIP.id)).catch(() => { }); await p.waitForTimeout(2500);
  const cSwitch = await cls(p) - cBoot - cLogin;
  check('J3 CLS over three trip switches <= 0.05', cSwitch <= 0.05, String(cSwitch));
  check('J4 Map tab is gone: no #tab-map, nav = แผน · ค่าใช้จ่าย · สถานที่ · เอกสาร · เมนู', await p.evaluate(() => !document.getElementById('tab-map') && typeof renderMap === 'undefined' && [...document.querySelectorAll('#tabs button')].map(b => b.textContent.trim()).join('·') === 'แผน·ค่าใช้จ่าย·สถานที่·เอกสาร·เมนู'));
  await s.b.close();

  /* trip switch without blanking (slow private trip so the waiting window is visible) */
  s = await open({ stepsPerDay: 10 }); p = s.p; await login(s, 'Nine'); await p.waitForTimeout(800);
  await p.evaluate(() => { window.__fr = []; const h0 = document.documentElement.scrollHeight, from = data._trip; (function f() { const tl = document.getElementById('tl'); window.__fr.push({ plan: !!tl && tl.children.length > 0, h: document.documentElement.scrollHeight, h0, old: data._trip === from, sub: document.getElementById('tripSub').textContent, dim: document.querySelector('main').classList.contains('busy') }); requestAnimationFrame(f); })(); });
  s.flags.delayMs = 1500; await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(3000);
  const fr = await p.evaluate(() => window.__fr), waiting = fr.filter(f => f.old);
  check('J5 trip switch: 0 frames without a plan, document height never collapses while waiting, "loading" shown', waiting.length > 20 && fr.every(f => f.plan) && waiting.every(f => f.h >= 0.9 * f.h0) && waiting.some(f => /กำลังโหลด/.test(f.sub)), JSON.stringify({ n: waiting.length, noPlan: fr.filter(f => !f.plan).length, minH: Math.min(...waiting.map(f => f.h)), h0: waiting[0] && waiting[0].h0 }));
  s.flags.delayMs = 0; await s.b.close();

  /* no-op refresh, changed refresh, dialog safety */
  s = await open({ stepsPerDay: 10 }); p = s.p; await login(s, 'Nine'); await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2500);
  await p.evaluate(() => { data.plan.days.forEach((_, d) => dayWaypoints(d).forEach(w => { gc.cache[gKey(w.q)] = { lat: 22.19, lng: 113.54 }; })); });          // stops already located: nothing left to geocode / route
  await p.waitForFunction(() => !gc.running && !Object.keys(trv.pending).length, null, { timeout: 30000 }); await p.waitForTimeout(600);
  await p.evaluate(() => { window.scrollTo(0, 700); window.__n = { draw: 0, all: 0, plan: 0 }; for (const k of ['drawMap', 'renderAll', 'renderPlan']) { const o = window[k], key = { drawMap: 'draw', renderAll: 'all', renderPlan: 'plan' }[k]; window[k] = (...a) => { window.__n[key]++; return o(...a); }; } for (const id of ['tl', 'homeDock']) document.getElementById(id).__keep = 1; });
  await p.waitForTimeout(500); const y0 = await p.evaluate(() => scrollY);
  await p.evaluate(() => load()); await p.waitForTimeout(800);
  const same = await p.evaluate(() => ({ keep: ['tl', 'homeDock'].every(id => document.getElementById(id).__keep === 1) && !document.getElementById('map'), n: window.__n, y: scrollY }));
  check('J6 identical refresh: #tl / #homeDock nodes kept, still no #map, no drawMap/renderAll/renderPlan, scroll untouched', same.keep && !same.n.draw && !same.n.all && !same.n.plan && Math.abs(same.y - y0) <= 1, JSON.stringify(same) + ' y0=' + y0);
  const before = await p.evaluate(() => { const lim = document.querySelector('.top').getBoundingClientRect().bottom + document.getElementById('homeDock').getBoundingClientRect().height; const a = [...document.querySelectorAll('#tl .step')].find(n => n.getBoundingClientRect().bottom > lim + 1); return { i: a.dataset.i, top: a.getBoundingClientRect().top, h: document.documentElement.scrollHeight }; });
  s.trips.macau.plan[1][6] = 'changed note\nline two\nline three\nline four\nline five';          // first step of the first day, above the reading position
  await p.evaluate(() => load()); await p.waitForTimeout(800);
  const after = await p.evaluate(sel => { const a = document.querySelector(`#tl .step[data-i="${sel}"]`); return { top: a.getBoundingClientRect().top, h: document.documentElement.scrollHeight, y: scrollY, changed: /changed note/.test(document.getElementById('tl').innerText), moved: document.getElementById('tl').__keep !== 1 }; }, before.i);
  check('J7 changed data: re-rendered, reader stays on the same step (anchor +-2 px)', after.changed && after.moved && Math.abs(after.top - before.top) <= 2, JSON.stringify({ before, after }));
  await p.evaluate(() => { openDlg('<form method="dialog"><input name="x" id="jIn"></form>'); }); await p.fill('#jIn', 'typing'); s.trips.macau.plan[1][6] = 'second change';
  await p.evaluate(() => load()); await p.waitForTimeout(800);
  const dl = await p.evaluate(() => ({ open: document.getElementById('dlg').open, v: document.getElementById('jIn') && document.getElementById('jIn').value, applied: /second change/.test(document.getElementById('tl').innerText) }));
  check('J8 refresh while a dialog is open: dialog + typed text untouched, data waits', dl.open && dl.v === 'typing' && !dl.applied, JSON.stringify(dl));
  await p.evaluate(() => document.getElementById('dlg').close()); await p.waitForTimeout(1500);
  check('J9 ...and is applied right after the dialog closes', await p.evaluate(() => /second change/.test(document.getElementById('tl').innerText)));
  await s.b.close();

  /* per-tab scroll memory */
  s = await open({ stepsPerDay: 10 }); p = s.p; await login(s, 'Nine'); await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2500);
  await p.evaluate(() => { window.scrollTo(0, 700); document.getElementById('tl').__keep = 1; }); await p.waitForTimeout(500);
  await p.click('[data-tab=money]'); await p.waitForTimeout(300); await p.evaluate(() => { document.getElementById('tab-money').firstElementChild.__keep = 1; });
  await p.click('[data-tab=menu]'); await p.waitForTimeout(300); await p.evaluate(() => window.scrollTo(0, 120)); await p.waitForTimeout(300);
  await p.click('[data-tab=plan]'); await p.waitForTimeout(500);
  const t1 = await p.evaluate(() => ({ y: scrollY, keep: document.getElementById('tl').__keep === 1 }));
  check('J10 plan -> money -> menu -> plan: scroll restored (+-2 px), plan not re-rendered', Math.abs(t1.y - 700) <= 2 && t1.keep, JSON.stringify(t1));
  await p.click('[data-tab=menu]'); await p.waitForTimeout(400); const t2 = await p.evaluate(() => scrollY);
  await p.click('[data-tab=money]'); await p.waitForTimeout(400); const t3 = await p.evaluate(() => ({ keep: document.getElementById('tab-money').firstElementChild.__keep === 1 }));
  check('J11 each tab keeps its own scroll (menu 120) and an unchanged tab is not re-rendered', Math.abs(t2 - 120) <= 2 && t3.keep, JSON.stringify({ t2, t3 }));
  await s.b.close();

  /* calm dock */
  s = await open({ stepsPerDay: 10 }); p = s.p; await login(s, 'Nine'); await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2500);
  const calm = await p.evaluate(async () => {
    const d = document.getElementById('homeDock'), bar = document.getElementById('homeDays'), w = ms => new Promise(r => setTimeout(r, ms)); let muts = 0;
    new MutationObserver(() => muts++).observe(d, { attributes: true }); new MutationObserver(() => muts++).observe(bar, { attributes: true, attributeFilter: ['class', 'style'] });
    for (const y of [0, 200, 400, 380, 395, 370, 410, 385, 400, 375, 405, 380, 410]) { window.scrollTo(0, y); await w(100); }
    return { muts, away: !!document.querySelector('.away,.peek'), cls: d.className, sticky: getComputedStyle(bar).position, dsticky: getComputedStyle(d).position, wc: getComputedStyle(d).willChange };
  });
  check('J12 jittery scroll: no class/style changes on the dock or day bar (no scroll-linked JS)', calm.muts === 0 && !calm.away && calm.sticky === 'sticky' && calm.dsticky !== 'sticky' && calm.wc === 'auto', JSON.stringify(calm));
  const shd = await p.evaluate(async () => { const bar = document.getElementById('homeDays'), w = ms => new Promise(r => setTimeout(r, ms)); window.scrollTo(0, 800); await w(200); const r = bar.getBoundingClientRect(), t = document.querySelector('.top').getBoundingClientRect().bottom; return { gap: Math.round(r.top - t), shadow: getComputedStyle(bar).boxShadow !== 'none', map: !!document.querySelector('#peekMap'), label: (document.querySelector('#peekMap') || {}).textContent }; });
  check('J13 day bar pinned right under the header at scroll 800, has a shadow, has the "แผนที่" button', Math.abs(shd.gap) <= 1 && shd.shadow && shd.map && /แผนที่/.test(shd.label), JSON.stringify(shd));
  await p.click('#peekMap'); await p.waitForTimeout(900);
  const bk = await p.evaluate(() => ({ ov: !document.getElementById('mapOv').hidden, one: document.querySelectorAll('.leaflet-container').length, inline: !!document.querySelector('#tab-plan .leaflet-container, #homeDock .leaflet-container') }));
  check('J13b "แผนที่" day-bar button opens the full-screen map overlay (no inline map)', bk.ov && bk.one === 1 && !bk.inline, JSON.stringify(bk));
  await p.evaluate(() => { const st = data.plan.days[ui.day].steps; let k = st.findIndex(s => wpMark[ui.day + '|' + qName(s.to || s.from || '')]);
    window.__real = k >= 0; if (k < 0) { k = 0; wpMark[ui.day + '|' + qName(st[0].to || st[0].from || '')] = L.marker([22.19, 113.54]).on('click', () => showCard({ title: 'x', lat: 22.19, lng: 113.54, name: 'x' })).addTo(map); } window.__k = k; focusStep(k); }); await p.waitForTimeout(700);
  const fs = await p.evaluate(() => ({ one: document.querySelectorAll('.leaflet-container').length, active: ui.activeStep === window.__k && !!document.querySelector('#tab-plan .step.active'), card: !document.getElementById('ovCard').hidden && !!document.getElementById('ovcGo') }));
  check('J13c focusStep (map open) marks the step active, centres the pin and opens its bottom card; one Leaflet instance', fs.one === 1 && fs.active && fs.card, JSON.stringify(fs));
  await p.click('#ovClose'); await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, 175)); await p.waitForTimeout(300);
  const zt = await p.evaluate(() => { const h = document.querySelector('.top').getBoundingClientRect(), pts = [[20, h.bottom - 5], [innerWidth - 25, h.bottom - 5], [innerWidth / 2, h.bottom - 5], [innerWidth - 25, 30]]; return { mb: Math.round(document.querySelector('.mapcard').getBoundingClientRect().bottom), hb: Math.round(h.bottom), bad: pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return e && !e.closest('.top'); }).length }; });
  check('J13e map partly under the header: header (not Leaflet controls) is topmost', zt.bad === 0, JSON.stringify(zt));
  const dc = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); window.scrollTo(0, 500); await w(200); let cls = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) cls += e.value; })).observe({ type: 'layout-shift', buffered: false });
    document.querySelectorAll('#homeDays .pill[data-day]')[1].click(); await w(900); const bar = document.getElementById('homeDays').getBoundingClientRect(), st = document.querySelector('#tl .step'), hd = document.querySelector('.dayh').getBoundingClientRect();
    return { cls, barTop: Math.round(bar.top - document.querySelector('.top').getBoundingClientRect().bottom), headClear: hd.top >= bar.bottom - 1 || scrollY < 5, stepVis: !st || st.getBoundingClientRect().bottom > bar.bottom }; });
  check('J13d day change: day bar stays pinned, heading not covered, CLS <= 0.05', Math.abs(dc.barTop) <= 1 && dc.headClear && dc.cls <= 0.05, JSON.stringify(dc));
  await s.b.close();
  s = await open({ reducedMotion: 'reduce' }); p = s.p; await login(s, 'Nine');
  check('J14 prefers-reduced-motion: no dock/day-bar transition, smooth scroll off', await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('homeDock')).transitionDuration) === 0 && parseFloat(getComputedStyle(document.getElementById('homeDays')).transitionDuration) === 0 && matchMedia('(prefers-reduced-motion: reduce)').matches));
  await s.b.close();

  /* full-screen map overlay: Leaflet is created lazily on the first "เปิดแผนที่" */
  console.log('\n[M] map overlay (lazy), friends, filters, navigation');
  s = await open({ init: CLS }); p = s.p; await login(s, 'Nine'); await p.waitForTimeout(1500);
  const pre = await p.evaluate(() => ({ cont: document.querySelectorAll('.leaflet-container,#map').length, noMap: typeof map === 'undefined' || !map, txt: document.getElementById('dockFull').innerText, ov: document.getElementById('mapOv').hidden, inline: document.querySelectorAll('#dockSize,#dockHide,#dockShow,#homeMapHolder').length }));
  check('M1 before the first tap: no Leaflet container / #map / old dock controls, no OSM tile request, the card says "เปิดแผนที่"', pre.cont === 0 && pre.noMap && /เปิดแผนที่/.test(pre.txt) && pre.ov && pre.inline === 0 && !s.reqs.includes('TILE'), JSON.stringify({ ...pre, tiles: s.reqs.includes('TILE') }));
  const mcls0 = await cls(p);
  const inst = await p.evaluate(() => { document.getElementById('dockFull').click(); const o = document.getElementById('mapOv'), r = o.getBoundingClientRect(); return { vis: !o.hidden, full: Math.round(r.width) === innerWidth && Math.round(r.height) === innerHeight }; });
  check('M2 opening is instant (same tick) and full screen', inst.vis && inst.full, JSON.stringify(inst));
  await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__m = map; }); const m0 = await p.evaluate(() => ({ c: map.getCenter(), z: map.getZoom() }));
  const o1 = await p.evaluate(() => { const cl = document.getElementById('ovClose').getBoundingClientRect(); return { vis: !document.getElementById('mapOv').hidden, one: document.querySelectorAll('.leaflet-container').length, inOv: !!document.querySelector('#ovHolder #map'), same: window.__m === map, chips: [...document.querySelectorAll('#ovFilters [data-f]')].map(b => b.textContent.replace(/[^฀-๿a-z]/gi, '')), closeTR: cl.right > innerWidth - 70 && cl.top < 90, loc: !!document.getElementById('ovLoc'), filt: !!document.getElementById('ovFilt') }; });
  check('M3 tiles are requested only after the first open; one Leaflet instance inside the overlay; filter chips + "ตัวกรอง" button + x top-right', s.reqs.includes('TILE') && o1.vis && o1.one === 1 && o1.inOv && o1.closeTR && o1.loc && o1.filt && o1.chips.join('|').replace(/[0-9]/g, '') === 'เส้นทาง|ร้านอาหาร|ที่เที่ยว|ที่พัก|สถานีขนส่ง|อื่นๆ|เพื่อน', JSON.stringify({ ...o1, tiles: s.reqs.includes('TILE') }));
  const mcls1 = await cls(p) - mcls0;
  check('M4 opening the map causes no layout shift (CLS <= 0.05)', mcls1 <= 0.05, String(mcls1));
  const f0 = await p.evaluate(() => ui.f.food); await p.click('#ovFilters [data-f=food]'); await p.waitForTimeout(200);
  check('J17 filter chip toggles the layer + its state', await p.evaluate(f => ui.f.food === !f && document.querySelector('#ovFilters [data-f=food]').classList.contains('on') === !f, f0));
  await p.click('#ovFilters [data-f=food]');
  await p.evaluate(() => { geo.state = 'denied'; renderMapStatus(); }); const askD = await p.evaluate(() => /ขอสิทธิ์ตำแหน่ง/.test(document.getElementById('ovStatus').innerText));
  await p.evaluate(() => { geo.state = 'ok'; data.me = { lat: 43.25, lng: 76.95, acc: 12, at: new Date() }; renderMapStatus(); }); const askO = await p.evaluate(() => !!document.getElementById('bAsk'));
  await p.evaluate(() => { geo.state = 'idle'; data.me = null; renderMapStatus(); });
  check('J18 location status: "ขอสิทธิ์ตำแหน่ง" only when permission is needed', askD && !askO);
  await p.click('#ovClose'); await p.waitForTimeout(700);
  const o2 = await p.evaluate(() => ({ hidden: document.getElementById('mapOv').hidden, one: document.querySelectorAll('.leaflet-container').length, same: window.__m === map }));
  check('J19 ✕ closes: overlay hidden, still the same single Leaflet instance', o2.hidden && o2.one === 1 && o2.same, JSON.stringify(o2));
  await p.click('#dockFull'); await p.waitForTimeout(700);
  const m1 = await p.evaluate(() => ({ c: map.getCenter(), z: map.getZoom() }));
  check('J16 re-opening does not re-fit or jump the map', Math.abs(m1.c.lat - m0.c.lat) < 0.002 && Math.abs(m1.c.lng - m0.c.lng) < 0.002 && m1.z === m0.z, JSON.stringify({ m0, m1 }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  const esc1 = await p.evaluate(() => document.getElementById('mapOv').hidden);
  await p.click('#peekMap'); await p.waitForTimeout(500); await p.goBack(); await p.waitForTimeout(500);
  check('J20 Esc and browser Back both close the overlay (the day-bar button opens it too)', esc1 && await p.evaluate(() => document.getElementById('mapOv').hidden));
  check('M4b no 2GIS link is built (URL form not verified); only the text hint names 2GIS', !/https?:\/\/[^'"\s`]*2gis/i.test(src) && await p.evaluate(() => !document.documentElement.innerHTML.match(/href="[^"]*2gis/i)));
  await s.b.close();

  /* synthetic Macau trip, "today" = day 2: pins, spots, friends */
  const seedMap = async (p, s) => {
    s.trips.macau.plan.splice(7, 0, ['', '15.00', 'Place 1B', '15.30', 'Test Station', 'Train']);          // a station stop at the end of day 2
    await p.evaluate(() => load()); await p.waitForTimeout(1800);
    await p.evaluate(() => {
      data.stay = { name: 'Test Hotel', address: '1 Test Road', lat: 22.19, lng: 113.54 };
      let i = 0; data.plan.days.forEach((_, d) => dayWaypoints(d).forEach(w => { if (!gc.cache[gKey(w.q)]) gc.cache[gKey(w.q)] = { lat: 22.19 + 0.01 * (++i), lng: 113.54 + 0.012 * i }; }));
      data.spots = [['Food One', 22.2, 113.55, 'food'], ['Sight One', 22.21, 113.56, 'sight'], ['Other One', 22.22, 113.57, 'other']].map(([name, lat, lng, type]) => ({ name, lat, lng, type, meal: '', cuisine: '', note: '' }));
      const iso = m => new Date(Date.now() - m * 60000).toISOString();
      data.locs = { Mew: { lat: 22.25, lng: 113.6, label: 'Test street', at: iso(4) }, Old: { lat: 22.26, lng: 113.61, label: '', at: iso(50) } };
      window.load = async () => { };          // keep the seeded data (the 60 s refresh would replace it)
      renderPlan();          // step buttons now know the coordinates
    });
  };
  s = await open({ clock: '2026-07-12T10:30:00', active: 'priv:macau', init: CLS }); p = s.p; await login(s, 'Nine'); await seedMap(p, s);
  await p.click('#dockFull'); await p.waitForTimeout(1500);
  const ovN = sel => p.evaluate(q => document.querySelectorAll('#ovHolder ' + q).length, sel);
  const ovChip = async k => { await p.click(`#ovFilters [data-f=${k}]`); await p.waitForTimeout(250); };
  const frs = await p.evaluate(() => { const f = [...document.querySelectorAll('#ovHolder .fpin')]; return f.map(x => ({ t: x.innerText.trim(), stale: x.classList.contains('stale'), op: getComputedStyle(x).opacity, a: x.querySelector('.avatar').textContent.trim() })); });
  check('M5 friends: avatar circle (initial fallback) + "x นาทีที่แล้ว"; the 50-minute-old one is muted (stale)', frs.length === 2 && frs.some(x => x.a === 'M' && /4 นาทีที่แล้ว/.test(x.t) && !x.stale && x.op === '1') && frs.some(x => x.a === 'O' && /50 นาทีที่แล้ว/.test(x.t) && x.stale && +x.op < 1), JSON.stringify(frs));
  const base = { plc: await ovN('.plc'), spin: await ovN('.spin'), fpin: await ovN('.fpin'), path: await ovN('path.leaflet-interactive') };
  check('M6 baseline pins on day 2: 4 stops (stay, 2 route, station), 3 spots, 2 friends, route line drawn', base.plc === 4 && base.spin === 3 && base.fpin === 2 && base.path > 0, JSON.stringify(base));
  const lay = {};
  await ovChip('food'); lay.food = await ovN('.spin'); await ovChip('sight'); lay.sight = await ovN('.spin'); await ovChip('other'); lay.other = await ovN('.spin'); await ovChip('food'); await ovChip('sight'); await ovChip('other');
  await ovChip('stay'); lay.stay = await ovN('.plc'); await ovChip('stay');
  await ovChip('transit'); lay.transit = await ovN('.plc'); await ovChip('transit');
  await ovChip('route'); lay.route = { plc: await ovN('.plc'), path: await ovN('path.leaflet-interactive') }; await ovChip('route');
  await ovChip('friends'); lay.friends = await ovN('.fpin'); await ovChip('friends');
  check('M7 each layer chip hides its own type only (food/sight/other/stay/transit/route/friends) and restores it', lay.food === 2 && lay.sight === 1 && lay.other === 0 && lay.stay === 3 && lay.transit === 3 && lay.route.plc === 2 && lay.route.path === 0 && lay.friends === 0 && await ovN('.plc') === 4 && await ovN('.spin') === 3 && await ovN('.fpin') === 2, JSON.stringify(lay));
  /* bottom sheet */
  await p.click('#ovFilt'); await p.waitForTimeout(300);
  const sh0 = await p.evaluate(() => ({ vis: !document.getElementById('ovSheet').hidden, t: document.getElementById('ovSheet').innerText, badge: document.getElementById('ovBadge').hidden, layers: document.querySelectorAll('#ovSheet [data-sf]').length }));
  check('M8 "ตัวกรอง" sheet: layers, by day, by friend, only-not-yet-visited, reset; no badge while nothing is filtered', sh0.vis && sh0.layers === 7 && /ตามวัน/.test(sh0.t) && /เพื่อน/.test(sh0.t) && /เฉพาะที่ยังไม่ไป/.test(sh0.t) && /รีเซ็ต/.test(sh0.t) && /สถานีรถไฟ\/ขนส่ง/.test(sh0.t) && sh0.badge, JSON.stringify(sh0));
  const day = {};
  await p.click('#ovSheet [data-sd=all]'); await p.waitForTimeout(300); day.all = await ovN('.plc');
  await p.click('#ovSheet [data-sd=today]'); await p.waitForTimeout(300); day.today = await ovN('.plc');
  await p.click('#ovSheet [data-sd="0"]'); await p.waitForTimeout(300); day.d0 = await ovN('.plc'); day.badge = await p.evaluate(() => document.getElementById('ovBadge').textContent);
  await p.click('#ovSheet [data-sd=sel]'); await p.waitForTimeout(300);
  check('M9 by day: all > today (= selected day) ; a specific day shows only its stops; badge = 1 while a day filter is on', day.all > 4 && day.today === 4 && day.d0 === 3 && day.badge === '1', JSON.stringify(day));
  await p.click('#ovSheet [data-sfr=Old]'); await p.waitForTimeout(300);
  const fo = { fpin: await ovN('.fpin'), badge: await p.evaluate(() => document.getElementById('ovBadge').textContent) };
  await p.click('#ovSheet #sfTodo'); await p.waitForTimeout(300);
  const td = { plc: await ovN('.plc'), badge: await p.evaluate(() => document.getElementById('ovBadge').textContent), on: await p.evaluate(() => ui.f.todo) };
  check('M10 by friend (hide one) and "เฉพาะที่ยังไม่ไป" (finished stops of today disappear); badge counts active filters', fo.fpin === 1 && fo.badge === '1' && td.on && td.plc < 4 && td.badge === '2', JSON.stringify({ fo, td }));
  await p.click('#ovSheet [data-sf=food]'); await p.waitForTimeout(200);
  await p.evaluate(() => { window.__tt = localStorage.getItem('tt.f'); });
  await p.click('#ovSheet #sfReset'); await p.waitForTimeout(300);
  const rs = await p.evaluate(() => ({ badge: document.getElementById('ovBadge').hidden, f: JSON.stringify(ui.f) === JSON.stringify({ ...F_DEF, hide: [] }), saved: JSON.parse(window.__tt) })); rs.plc = await ovN('.plc'); rs.fpin = await ovN('.fpin');
  check('M11 "รีเซ็ต" restores every default (badge gone, pins and friends back); the choices had been saved in localStorage', rs.badge && rs.f && rs.plc === 4 && rs.fpin === 2 && rs.saved.food === false && rs.saved.todo === true && rs.saved.hide[0] === 'Old', JSON.stringify(rs));
  await p.click('#ovSheet [data-sf=food]'); await p.click('#ovSheet [data-sfr=Old]'); await p.click('#ovSheet #sfDone'); await p.waitForTimeout(200);
  await p.reload(); await p.waitForTimeout(3500); await p.click('#dockFull'); await p.waitForTimeout(900);
  check('M12 remembered after a reload (food off, friend hidden, badge 2)', await p.evaluate(() => ui.f.food === false && ui.f.hide.includes('Old') && document.getElementById('ovBadge').textContent === '2' && !document.querySelector('#ovFilters [data-f=food]').classList.contains('on')));
  await p.evaluate(() => { ui.f = { ...F_DEF, hide: [] }; saveF(); }); await s.b.close();

  /* tap a pin / friend -> bottom card with Google Maps */
  s = await open({ clock: '2026-07-12T10:30:00', active: 'priv:macau', init: CLS }); p = s.p; await login(s, 'Nine'); await seedMap(p, s);
  await p.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { (window.__cp = window.__cp || []).push(t); } }, configurable: true }); });
  await p.click('#dockFull'); await p.waitForTimeout(1300);
  const GM = /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=(-?\d+\.\d{6}),(-?\d+\.\d{6})(&travelmode=(walking|transit|driving))?$/;
  const href = () => p.evaluate(() => (document.getElementById('ovcGo') || {}).href || '');
  const tapAt = async (lat, lng, sel, txt) => { await p.evaluate(([a, b]) => map.setView([a, b], 15, { animate: false }), [lat, lng]); await p.waitForTimeout(400); const l = p.locator('#ovHolder .leaflet-marker-icon ' + sel, txt ? { hasText: txt } : undefined).first(); await l.click(); await p.waitForTimeout(300); };
  await tapAt(22.25, 113.6, '.avatar', 'M');
  const fc = await p.evaluate(() => ({ vis: !document.getElementById('ovCard').hidden, t: document.getElementById('ovCard').innerText, go: document.getElementById('ovcGo').textContent.trim(), seg: [...document.querySelectorAll('#ovCard [data-m]')].map(b => b.textContent.trim() + ':' + b.classList.contains('on')).join() }));
  const fh = await href();
  check('M13 tap a friend avatar: card with name, place label, "x นาทีที่แล้ว", primary "นำทางด้วย Google Maps", segmented เดิน/ขนส่งสาธารณะ/รถ', fc.vis && /Mew/.test(fc.t) && /Test street/.test(fc.t) && /4 นาทีที่แล้ว/.test(fc.t) && /นำทางด้วย Google Maps/.test(fc.go) && fc.seg === 'เดิน:true,ขนส่งสาธารณะ:false,รถ:false', JSON.stringify(fc));
  check('M14 friend URL = their last coordinates + travelmode (walking by default)', GM.test(fh) && fh.includes('destination=22.250000,113.600000&travelmode=walking'), fh);
  await p.click('#ovCard [data-m=transit]'); const h2 = await href(); await p.click('#ovCard [data-m=driving]'); const h3 = await href(); await p.click('#ovCard [data-m=walking]');
  check('M15 travel-mode control rewrites the link (transit / driving / walking)', h2.endsWith('&travelmode=transit') && h3.endsWith('&travelmode=driving') && (await href()).endsWith('&travelmode=walking'), h2 + ' ' + h3);
  await p.click('#ovcLink'); await p.click('#ovcCoord');
  check('M16 "คัดลอกลิงก์" copies the Google Maps URL, "คัดลอกพิกัด" copies lat,lng', JSON.stringify(await p.evaluate(() => window.__cp)) === JSON.stringify([fh, '22.250000,113.600000']), JSON.stringify(await p.evaluate(() => window.__cp)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  check('M17 Esc closes the card first, the overlay stays', await p.evaluate(() => document.getElementById('ovCard').hidden && !document.getElementById('mapOv').hidden));
  const stc = await p.evaluate(() => { const g = gc.cache[gKey('Test Station')]; return g; });
  await tapAt(stc.lat, stc.lng, '.plc', '4');
  const pc = await p.evaluate(() => ({ t: document.getElementById('ovCard').innerText, seg: document.querySelector('#ovCard [data-m].on').dataset.m })); const ph = await href();
  check('M18 tap a station pin: card, URL with the pin coordinates + travelmode=transit, 2GIS / Yandex Go / inDrive hint line', GM.test(ph) && ph.endsWith('&travelmode=transit') && pc.seg === 'transit' && /Test Station/.test(pc.t) && /2GIS \/ Yandex Go \/ inDrive คู่กับ Google Maps/.test(pc.t), JSON.stringify({ pc, ph }));
  const wk = await p.evaluate(() => gc.cache[gKey('Place 1A')]); await tapAt(wk.lat, wk.lng, '.plc', '2');
  const wh = await href(), wt = await p.evaluate(() => document.getElementById('ovCard').innerText);
  check('M19 tap a walking stop: URL with its coordinates + travelmode=walking, no transport hint', GM.test(wh) && wh.includes(`destination=${wk.lat.toFixed(6)},${wk.lng.toFixed(6)}`) && wh.endsWith('travelmode=walking') && !/Yandex/.test(wt), wh);
  await tapAt(22.2, 113.55, '.spin');
  const sc = await p.evaluate(() => ({ t: document.getElementById('ovCard').innerText })); const sph = await href();
  check('M20 tap a spot pin (restaurant): card with its name and a Google Maps URL with its coordinates', /Food One/.test(sc.t) && GM.test(sph) && sph.includes('destination=22.200000,113.550000'), sph);
  await p.evaluate(() => { map.setView([22.2, 113.55], 12); }); await p.waitForTimeout(200); await p.mouse.click(200, 150); await p.waitForTimeout(200);
  const nl = await p.evaluate(() => ({ g: navLinks({ name: 'A B', lat: 1.5, lng: 2.25 }, 'transit'), n: navLinks({ name: 'Cafe แปลก' }), e: navLinks({}), tx: navLinks({ name: 'x', how: 'Taxi' }), ws: navLinks({ name: 'x', how: 'Walk' }), bus: navLinks({ name: 'x', how: 'City bus 12' }), bz: navLinks({ name: 'business centre' }) }));
  check('M21 navLinks(place): coords form / name-query form / empty; mode from "How to Travel" (taxi=driving, walk=walking, bus/train/metro=transit, "business" is not a bus)', nl.g.google === 'https://www.google.com/maps/dir/?api=1&destination=1.500000,2.250000&travelmode=transit' && nl.g.coords === '1.500000,2.250000' && nl.n.google === 'https://www.google.com/maps/dir/?api=1&destination=Cafe%20%E0%B9%81%E0%B8%9B%E0%B8%A5%E0%B8%81' && !nl.n.has && nl.e.google === '' && nl.tx.mode === 'driving' && nl.ws.mode === 'walking' && nl.bus.mode === 'transit' && nl.bz.mode === '', JSON.stringify(nl));
  /* plan steps + spots tab get the same action through navLinks */
  await p.click('#ovClose'); await p.waitForTimeout(400);
  const sn = await p.evaluate(() => {
    const steps = [...document.querySelectorAll('#tl .step')], find = re => { const n = steps.find(x => re.test(x.innerText)); return n && n.querySelector('a.navbtn') && n.querySelector('a.navbtn').href; };
    const a = [...document.querySelectorAll('#tl a.navbtn')][0]; let opened = false; if (a) { a.addEventListener('click', e => e.preventDefault()); a.click(); opened = !document.getElementById('mapOv').hidden; }
    return { n: document.querySelectorAll('#tl a.navbtn').length, taxi: find(/Taxi/), train: find(/Train/), walk: find(/Walk/), opened, lbl: a && a.getAttribute('aria-label'), size: a && Math.round(a.getBoundingClientRect().width) };
  });
  check('M22 each plan step has a "นำทาง" icon button (>= 44 px): Taxi=driving, Train=transit, Walk=walking, uses coordinates when known; tapping it does not open the map', sn.n >= 3 && /destination=22\.\d{6},113\.\d{6}&travelmode=driving/.test(sn.taxi) && /travelmode=transit/.test(sn.train) && /travelmode=walking/.test(sn.walk) && !sn.opened && /นำทาง/.test(sn.lbl) && sn.size >= 44, JSON.stringify(sn));
  await p.click('[data-tab=spots]'); await p.waitForTimeout(500); await p.evaluate(() => renderSpots()); await p.waitForTimeout(300);
  const sp = await p.evaluate(() => [...document.querySelectorAll('#tab-spots .spot-a a.tag')].map(a => a.href));
  check('M23 Places tab cards: "นำทาง" built by navLinks (coordinates)', sp.length >= 3 && sp.every(h => /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=22\.\d{6},113\.\d{6}$/.test(h)), JSON.stringify(sp));
  await s.b.close();

  /* sharing my location: opt-in, writes / clears the Locations row through the RPC (public trip) */
  s = await open(); p = s.p; await login(s, 'Nine'); await s.ctx.grantPermissions(['geolocation']); await s.ctx.setGeolocation({ latitude: 43.2389, longitude: 76.8897, accuracy: 15 });
  await p.evaluate(() => { cfg.forceLoc = true; });
  const locRpc = () => s.rpc.filter(r => ['upsert_row', 'append_row'].includes(r.fn) && r.a.p_tab === 'Locations');
  await p.click('#dockFull'); await p.waitForTimeout(1200);
  const sw0 = await p.evaluate(() => ({ on: document.getElementById('shSw').getAttribute('aria-checked'), t: document.getElementById('ovStatus').innerText, del: !!document.getElementById('shDel'), key: store.get(shareKey(), false) }));
  check('M24 sharing is OFF by default: switch off, says so, nothing written', sw0.on === 'false' && /ปิดอยู่/.test(sw0.t) && sw0.key === false && locRpc().length === 0, JSON.stringify(sw0));
  await p.click('#shSw'); await p.waitForTimeout(400);
  const cs = await p.evaluate(() => ({ open: document.getElementById('dlg').open, t: document.getElementById('dlg').innerText }));
  check('M25 turning it on asks for explicit consent (what is sent, who can see it, how to stop); nothing is written yet', cs.open && /ชื่อ พิกัด และเวลา/.test(cs.t) && /ทุกคนที่มีลิงก์/.test(cs.t) && /หยุดแชร์/.test(cs.t) && locRpc().length === 0, cs.t);
  await p.click('#dlg button[value=x]'); await p.waitForTimeout(300);
  check('M25b declining keeps it off', await p.evaluate(() => !isSharing()) && locRpc().length === 0);
  await p.click('#shSw'); await p.waitForTimeout(300); await p.click('#dlg button[value=ok]'); await p.waitForTimeout(4000);
  const up = s.rpc.filter(r => r.fn === 'upsert_row' && r.a.p_tab === 'Locations');
  const on1 = await p.evaluate(() => ({ on: document.getElementById('shSw').getAttribute('aria-checked'), t: document.getElementById('ovStatus').innerText, me: me }));
  check('M26 after consent: upsert_row on the public tab Locations with Name, Lat, Lng, Label, Updated (ISO) and no edit code; switch shows ON', up.length >= 1 && up[0].a.p_key === on1.me && up[0].a.p_cells[0] === on1.me && Math.abs(+up[0].a.p_cells[1] - 43.2389) < 1e-4 && Math.abs(+up[0].a.p_cells[2] - 76.8897) < 1e-4 && !isNaN(Date.parse(up[0].a.p_cells[4])) && up[0].a.code === '' && on1.on === 'true' && /เปิดอยู่/.test(on1.t), JSON.stringify(up[0] && up[0].a) + JSON.stringify(on1));
  const n1 = locRpc().length; await p.evaluate(() => { geo.lastPush = Date.now() - 60000; }); await p.waitForTimeout(16500);
  check('M27 periodic update while the app is open (~45 s cadence)', locRpc().length > n1, n1 + ' -> ' + locRpc().length);
  await p.click('#shSw'); await p.waitForTimeout(300); const n2 = locRpc().length;
  await p.evaluate(() => { geo.lastPush = 0; return pushLoc(); }); await p.evaluate(() => { geo.lastPush = Date.now() - 60000; }); await p.waitForTimeout(16500);
  check('M28 toggle off stops all writes (switch off, no more RPC)', await p.evaluate(() => !isSharing() && document.getElementById('shSw').getAttribute('aria-checked') === 'false') && locRpc().length === n2, n2 + ' -> ' + locRpc().length);
  await p.click('#shSw'); await p.waitForTimeout(300); await p.click('#dlg button[value=ok]'); await p.waitForTimeout(3500);
  await p.evaluate(() => { data.locs[me] = { lat: 43.2, lng: 76.9, label: '', at: new Date().toISOString() }; renderMapStatus(); });
  check('M29 "หยุดแชร์ + ลบตำแหน่งของฉัน" button is there while sharing', await p.evaluate(() => /หยุดแชร์ \+ ลบตำแหน่งของฉัน/.test(document.getElementById('shDel').textContent)));
  await p.click('#shDel'); await p.waitForTimeout(800);
  const del = s.rpc.filter(r => r.fn === 'upsert_row' && r.a.p_tab === 'Locations').pop();
  check('M30 stop + delete: my row is blanked through upsert_row (Name only), sharing off, my marker/entry gone', !!del && del.a.p_cells[0] === del.a.p_key && del.a.p_cells.slice(1).every(x => x === '') && await p.evaluate(() => !isSharing() && !data.locs[me] && !document.getElementById('shDel')), JSON.stringify(del && del.a));
  check('M30b a blanked row is not read back as a position (parseLocations)', await p.evaluate(() => Object.keys(parseLocations([['Name', 'Lat', 'Lng', 'Label', 'Updated'], ['Nine', '', '', '', ''], ['Mew', '1.5', '2.5', 'x', '2026-01-01T00:00:00Z']]) || {}).join()) === 'Mew');
  await s.b.close();
  /* private trip: same flow through private_write; sharing is per trip */
  s = await open({ active: 'priv:macau' }); p = s.p; await login(s, 'Mew'); await s.ctx.grantPermissions(['geolocation']); await s.ctx.setGeolocation({ latitude: 22.19, longitude: 113.54, accuracy: 10 });
  await p.evaluate(() => { cfg.forceLoc = true; }); await p.click('#dockFull'); await p.waitForTimeout(1000);
  await p.click('#shSw'); await p.waitForTimeout(300); await p.click('#dlg button[value=ok]'); await p.waitForTimeout(4000);
  const pw = s.rpc.filter(r => r.fn === 'private_write' && r.a.p_tab === 'Locations');
  check('M31 private trip: private_write(tab Locations): header row once, then upsert keyed by my name', pw.some(r => r.a.p_op === 'append' && r.a.p_payload[0] === 'Name') && pw.some(r => r.a.p_op === 'upsert' && r.a.p_payload.key === 'Mew' && Math.abs(+r.a.p_payload.cells[1] - 22.19) < 1e-4 && r.a.p_name === 'Mew' && r.a.p_hash === 'open'), JSON.stringify(pw.map(r => r.a.p_op)));
  await p.click('#ovClose'); await p.waitForTimeout(300); await p.evaluate(() => switchTrip(DEFAULT_TRIP.id)); await p.waitForTimeout(2500);
  check('M32 sharing is per trip: another trip starts OFF', await p.evaluate(() => !isSharing()));
  await s.b.close();

  /* layout: 360 / 390 / 430, dark mode, reduced motion */
  for (const [w, h] of [[360, 640], [390, 844], [430, 932]]) {
    s = await open({ w, h, clock: '2026-07-12T10:30:00', active: 'priv:macau', init: CLS }); p = s.p; await login(s, 'Nine'); await seedMap(p, s);
    if (w === 390) await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await p.click('#dockFull'); await p.waitForTimeout(1200);
    await p.evaluate(() => showCard({ kind: 'place', title: 'ชื่อสถานที่ที่ยาวมากๆ ชื่อสถานที่ที่ยาวมากๆ ชื่อสถานที่ที่ยาวมากๆ Metro Station', lines: ['Day 2 10.00', 'มาโดย Metro'], lat: 22.2, lng: 113.5, name: 'x', how: 'Metro' })); await p.waitForTimeout(400);
    const lc = await p.evaluate(() => { const c = document.getElementById('ovCard').getBoundingClientRect(), m = document.getElementById('ovHolder').getBoundingClientRect(), hs = s => Math.min(...[...document.querySelectorAll(s)].map(b => b.getBoundingClientRect().height)); return { inside: c.left >= 0 && c.right <= innerWidth + 0.5 && c.bottom <= innerHeight + 0.5, over: Math.max(document.documentElement.scrollWidth - innerWidth, document.getElementById('ovCard').scrollWidth - document.getElementById('ovCard').clientWidth), go: hs('#ovcGo'), two: hs('.ovc-2 .btn'), seg: hs('#ovCard [data-m]'), x: document.getElementById('ovcX').getBoundingClientRect().width, mapVis: Math.round(m.height - c.height), bg: getComputedStyle(document.getElementById('ovCard')).backgroundColor }; });
    check(`M33 ${w}x${h}: bottom card inside the screen, no horizontal overflow, buttons >= 44 px (mode control >= 40), map still visible above`, lc.inside && lc.over <= 1 && lc.go >= 44 && lc.two >= 44 && lc.seg >= 40 && lc.x >= 36 && lc.mapVis >= 100, JSON.stringify(lc));
    if (w === 390) check('M34 dark mode: card uses the dark card colour', lc.bg === 'rgb(20, 29, 51)', lc.bg);
    await p.evaluate(() => hideCard()); await p.click('#ovFilt'); await p.waitForTimeout(400);
    const ls = await p.evaluate(() => { const i = document.querySelector('#ovSheet .ovs-in').getBoundingClientRect(), tags = [...document.querySelectorAll('#ovSheet .tag')].map(b => b.getBoundingClientRect()), sw = document.getElementById('shSw').getBoundingClientRect(); return { h: Math.round(i.height), max: Math.round(innerHeight * 0.8), left: i.left >= 0 && i.right <= innerWidth + 0.5, tag: Math.min(...tags.map(t => t.height)), done: document.getElementById('sfDone').getBoundingClientRect().height, over: document.documentElement.scrollWidth - innerWidth, swW: sw.width, swH: sw.height }; });
    check(`M35 ${w}x${h}: filters sheet <= 80% of the screen (scrolls), chips >= 44 px, "เสร็จ" >= 44 px, no overflow`, ls.h <= ls.max && ls.left && ls.tag >= 44 && ls.done >= 44 && ls.over <= 1, JSON.stringify(ls));
    await p.click('#sfDone');
    const st = await p.evaluate(() => { const sw = document.getElementById('shSw'), r = sw.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { sw: sw.contains(e) || e === sw, w: r.width, h: r.height, sticky: document.getElementById('ovStatus').getBoundingClientRect().bottom <= innerHeight + 0.5 }; });
    check(`M36 ${w}x${h}: sharing switch reachable (not covered), status bar on screen`, st.sw && st.sticky && st.w >= 44, JSON.stringify(st));
    check(`M37 ${w}x${h}: overlay open/close/day-change CLS <= 0.05`, await p.evaluate(() => window.__cls) <= 0.05, String(await p.evaluate(() => window.__cls)));
    await s.b.close();
  }
  s = await open({ reducedMotion: 'reduce' }); p = s.p; await login(s, 'Nine'); await p.click('#dockFull'); await p.waitForTimeout(800);
  await p.evaluate(() => showCard({ title: 'x', lat: 1, lng: 2, name: 'x' })); await p.click('#ovFilt');
  check('M38 prefers-reduced-motion: card and sheet do not animate, switch has no transition', await p.evaluate(() => getComputedStyle(document.getElementById('ovCard')).animationName === 'none' && getComputedStyle(document.querySelector('.ovs-in')).animationName === 'none' && parseFloat(getComputedStyle(document.getElementById('shSw')).transitionDuration) === 0));
  await s.b.close();

  /* nav with 4 (and 5) evenly spaced items */
  s = await open(); p = s.p; await login(s, 'Nine');
  const nv = await p.evaluate(() => { const r = [...document.querySelectorAll('#tabs button')].map(b => b.getBoundingClientRect()); return { n: r.length, labels: [...document.querySelectorAll('#tabs span')].map(x => x.textContent).join('|'), w: Math.max(...r.map(x => x.width)) - Math.min(...r.map(x => x.width)), gap: Math.max(...r.slice(1).map((x, i) => x.left - r[i].right)) - Math.min(...r.slice(1).map((x, i) => x.left - r[i].right)), h: Math.min(...r.map(x => x.height)), over: document.documentElement.scrollWidth - innerWidth }; });
  check('J21 nav: 5 evenly spaced items (แผน|ค่าใช้จ่าย|สถานที่|เอกสาร|เมนู) >= 44 px tall, no horizontal overflow', nv.n === 5 && nv.labels === 'แผน|ค่าใช้จ่าย|สถานที่|เอกสาร|เมนู' && nv.w < 1 && nv.gap < 1 && nv.h >= 44 && nv.over <= 1, JSON.stringify(nv));
  await s.b.close();

  /* home top compaction */
  for (const [w, h] of [[390, 844], [360, 640]]) {
    s = await open({ w, h }); p = s.p; await login(s, 'Nine'); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600);
    const g = await p.evaluate(() => { const nav = document.querySelector('nav').getBoundingClientRect().top, st = document.querySelector('#tl .step'), hd = document.querySelector('.dayh h2').getBoundingClientRect(), dk = document.getElementById('homeDays').getBoundingClientRect(), mp = document.querySelector('.mapcard').getBoundingClientRect(); return { nav, stepBottom: st ? st.getBoundingClientRect().bottom : null, headTop: hd.top, headBottom: hd.bottom, dockBottom: dk.bottom, map: mp.height, nx: !!document.getElementById('cd'), stayOpen: !!document.getElementById('stayPn') }; });
    if (w === 390) check('J22 390x844: first step card fully above the bottom nav at scroll 0; open-map card slim (60-80 px); stay collapsed', g.stepBottom != null && g.stepBottom <= g.nav && g.map >= 60 && g.map <= 80 && !g.stayOpen, JSON.stringify(g));
    else check('J23 360x640: day heading visible (below the dock, above the nav) at scroll 0', g.headTop >= g.dockBottom - 1 && g.headBottom <= g.nav, JSON.stringify(g));
    await s.b.close();
  }

  /* offline cache (stale-while-revalidate) */
  s = await open(); p = s.p; await login(s, 'Nine'); await p.waitForTimeout(800);
  check('J24 last good data is cached per trip, without picture data', await p.evaluate(() => { const v = localStorage.getItem('tt.cache.' + trip().id); return !!v && v.length < 1.5e6 && !/data:image/.test(v); }));
  check('J25 cache is skipped above ~1.5 MB', await p.evaluate(() => { writeCache('big', 'x'.repeat(1.6e6)); const a = localStorage.getItem('tt.cache.big'); writeCache('small', '{}'); const b = localStorage.getItem('tt.cache.small'); localStorage.removeItem('tt.cache.small'); return a === null && b !== null; }));
  await s.ctx.route('**/rest/v1/sheet_rows*', async r => { await new Promise(x => setTimeout(x, 4000)); r.continue().catch(() => { }); });
  await p.reload({ waitUntil: 'domcontentloaded' }); await p.waitForTimeout(900);
  const c1 = await p.evaluate(() => ({ steps: document.querySelectorAll('#tl .step').length, sub: document.getElementById('tripSub').textContent, shown: !document.getElementById('app').hidden }));
  check('J26 start renders the cached copy immediately (network still pending) and says it is updating', c1.shown && c1.steps > 0 && /กำลังอัปเดต/.test(c1.sub), JSON.stringify(c1));
  await p.waitForFunction(() => !ui.sync, null, { timeout: 30000 }); await s.ctx.unroute('**/rest/v1/sheet_rows*');
  await p.evaluate(() => { document.getElementById('tl').__keep = 1; }); await s.ctx.setOffline(true);
  await p.evaluate(() => load()); await p.waitForTimeout(1200);
  const of = await p.evaluate(() => ({ sub: document.getElementById('tripSub').textContent, err: !document.getElementById('error').hidden, keep: document.getElementById('tl').__keep === 1, steps: document.querySelectorAll('#tl .step').length }));
  check('J27 offline: "ออฟไลน์ — แสดงข้อมูลล่าสุด HH:MM", no red error box, plan stays', /^ออฟไลน์ — แสดงข้อมูลล่าสุด \d\d:\d\d$/.test(of.sub) && !of.err && of.keep && of.steps > 0, JSON.stringify(of));
  await s.ctx.setOffline(false); await p.evaluate(() => load()); await p.waitForTimeout(3500);
  check('J28 back online: banner clears', await p.evaluate(() => !/ออฟไลน์/.test(document.getElementById('tripSub').textContent)));
  await s.b.close();
  s = await open(); p = s.p; await login(s, 'Nine'); await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2500);
  check('J29 private trip cached while signed in', await p.evaluate(() => !!localStorage.getItem('tt.cache.priv:macau')));
  await login(s, 'Mew');
  check('J30 switching user clears private caches (public cache stays)', await p.evaluate(() => !Object.keys(localStorage).some(k => k.startsWith('tt.cache.priv:')) && !!localStorage.getItem('tt.cache.' + DEFAULT_TRIP.id)));
  /* (J31 "stale PIN clears private caches" dropped: there is no PIN session to go stale any more) */
  await s.b.close();


  /* ---------- K. เอกสาร (documents) ---------- */
  console.log('\n[K] documents tab');
  const zlib = require('zlib');
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const png = (w, h) => { const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; const row = Buffer.alloc(1 + w * 3, 0x80); row[0] = 0; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]); };
  const CLSK = () => { window.__cls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { } };
  const addDoc = async (p, { who, kind, title, file }) => {          // who: a traveller name or '__shared' (default = the chosen name / the open chip)
    await p.click('#dcAdd'); await p.waitForSelector('#dfForm'); if (who) await p.click(`#dfWho [data-w="${who}"]`); if (kind) await p.click(`[data-k=${kind}]`);
    if (title) await p.fill('#dfTitle', title); await p.setInputFiles('#dfFile', file); await p.waitForFunction(() => !document.getElementById('dfOk').disabled || document.getElementById('dfErr').textContent, null, { timeout: 8000 });
  };
  const seg = p => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#dcSeg button')].map(b => [b.dataset.seg, +((b.textContent.match(/\((\d+)\)/) || [])[1])])));          // chip -> count
  const off = async (s, v) => { s.flags.offline = v; await s.ctx.setOffline(v); };
  const png1 = { name: 'scan.png', mimeType: 'image/png', buffer: png(2400, 1000) };
  const docTab = async p => { await p.click('[data-tab=docs]'); await p.waitForTimeout(900); };

  /* K1: no name chosen -> everybody's documents are shown right away, no gate */
  s = await open(); p = s.p; await p.evaluate(() => { pick = ''; syncMe(); renderDocs(); });
  const names0 = await p.evaluate(() => users().map(u => u.name));
  await docTab(p);
  const k1 = await p.evaluate(() => ({ me, pick: !!document.getElementById('dcPick'), txt: document.getElementById('tab-docs').innerText, chips: [...document.querySelectorAll('#dcSeg button')].map(b => b.dataset.seg), add: !!document.getElementById('dcAdd') }));
  check('K1 no name chosen: documents open straight away (no "เลือกชื่อ" gate, no PIN wording), doc_list goes out under the first traveller, chips = ทุกคน | each name | ส่วนกลาง', k1.me === '' && !k1.pick && !/เลือกชื่อของคุณ|PIN/.test(k1.txt) && k1.add && s.rpc.some(r => r.fn === 'doc_list' && r.a.p_name === names0[0]) && JSON.stringify(k1.chips) === JSON.stringify(['all', ...names0, 'shared']), JSON.stringify(k1));
  s.flags.users = names0.map(n => n.toLowerCase());
  await p.click('#dcAdd'); await p.waitForSelector('#dfForm'); await p.setInputFiles('#dfFile', { name: 'a.png', mimeType: 'image/png', buffer: png(300, 200) }); await p.waitForTimeout(700);
  const dis0 = await p.evaluate(() => document.getElementById('dfOk').disabled && document.querySelectorAll('#dfWho .tag.sel').length === 0 && /เลือกว่าเอกสารนี้เป็นของใคร/.test(document.getElementById('dfScopeNote').innerText));
  await p.click('#dfWho [data-w="Mew"]'); const en0 = await p.evaluate(() => !document.getElementById('dfOk').disabled); await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(500);
  const pu0 = s.rpc.filter(r => r.fn === 'doc_put').pop();
  check('K1b add asks "เอกสารของใคร" (every traveller + ส่วนกลาง); Save stays disabled until one is picked; upload works without a chosen name (p_owner = the picked person)', dis0 && en0 && pu0.a.p_owner === 'Mew' && pu0.a.p_scope === 'person' && pu0.a.p_name === names0[0] && (await seg(p)).Mew === 1, JSON.stringify(pu0 && pu0.a.p_owner));
  await s.b.close();

  /* K2-K: main flow */
  s = await open({ init: CLSK }); p = s.p; await login(s, 'Nine');
  const unamesK = await p.evaluate(() => users().map(u => u.name));
  await p.evaluate(() => { window.__cls = 0; });
  await docTab(p);
  const cls0 = await p.evaluate(() => window.__cls);
  check('K2 tab opens with CLS <= 0.05', cls0 <= 0.05, String(cls0));
  const cK0 = await seg(p);
  check('K3 chips with counts: ทุกคน (0) | every traveller (0) | ส่วนกลาง (0) and a friendly empty state', JSON.stringify(Object.keys(cK0)) === JSON.stringify(['all', ...unamesK, 'shared']) && Object.values(cK0).every(v => v === 0) && /ยังไม่มีเอกสาร/.test(await p.innerText('#tab-docs')), JSON.stringify(cK0));
  await addDoc(p, { file: png1 });
  const pv = await p.innerText('#dfPrev');
  check('K4 image is downscaled client-side to <= 1800 px (2400x1000 -> 1800x750) and previewed; "ของใคร" defaults to the chosen name', /1800×750/.test(pv) && await p.evaluate(() => !!document.querySelector('#dfPrev img') && document.querySelector('#dfWho .tag.sel').dataset.w === 'Nine'), pv);
  await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(500);
  const put = s.rpc.find(r => r.fn === 'doc_put');
  check('K5 uploaded as JPEG chunks (<= 300k chars each), personal scope for Nine, title auto-filled', !!put && put.a.p_mime === 'image/jpeg' && put.a.p_scope === 'person' && put.a.p_owner === 'Nine' && put.a.p_title === 'พาสปอร์ต' && put.a.p_chunks.every(c => c.length <= 300000) && put.a.p_chunks[0].startsWith('/9j/'), put && JSON.stringify({ m: put.a.p_mime, sc: put.a.p_scope, t: put.a.p_title }));
  const cK1 = await seg(p), tx1 = await p.innerText('#tab-docs');
  check('K6 new document appears under its person (ทุกคน 1, Nine 1), grouped header with name + count, group-visible note', cK1.all === 1 && cK1.Nine === 1 && cK1.shared === 0 && /เห็นทั้งกลุ่ม/.test(tx1) && !/เห็นเฉพาะคุณ/.test(tx1) && await p.evaluate(() => document.querySelectorAll('.dcard[data-id]').length === 1 && document.querySelectorAll('.dgh').length === 1), JSON.stringify(cK1));
  /* a PDF as a shared doc + a second personal image */
  const PDF_BAD = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  await addDoc(p, { who: '__shared', kind: 'hotel', file: { name: 'voucher.pdf', mimeType: 'application/pdf', buffer: PDF_BAD } });
  await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(500);
  const cK2 = await seg(p);
  check('K7 shared document: ส่วนกลาง (1), ทุกคน (2): shown as its own group "ส่วนกลาง", "ทุกคนในทริปเห็น"', cK2.all === 2 && cK2.shared === 1 && cK2.Nine === 1 && /ทุกคนในทริปเห็น/.test(await p.innerText('#tab-docs')) && await p.evaluate(() => [...document.querySelectorAll('.dgh b')].map(b => b.textContent).join('|')) === 'Nine|ส่วนกลาง', JSON.stringify(cK2));
  await p.click('[data-seg="Nine"]'); await addDoc(p, { kind: 'ticket', file: { name: 'b.png', mimeType: 'image/png', buffer: png(300, 200) } });
  await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(500);
  check('K8 two docs under Nine (a person chip lists only that person\'s documents, no group header)', (await seg(p)).Nine === 2 && await p.evaluate(() => document.querySelectorAll('.dgh').length === 0 && document.querySelectorAll('.dcard[data-id]').length === 2));
  /* lazy thumbnail: reserved box, picture arrives without moving the card */
  const th = await p.evaluate(async () => { const c = document.querySelector('.dcard[data-id]'), t = c.querySelector('.dthumb'); const h0 = c.getBoundingClientRect().height; await new Promise(r => setTimeout(r, 800)); return { img: !!t.querySelector('img'), h0, h1: c.getBoundingClientRect().height, box: t.getBoundingClientRect().height }; });
  check('K9 thumbnail loads lazily into a fixed 84 px box (card height unchanged)', th.img && th.box === 84 && th.h0 === th.h1, JSON.stringify(th));
  /* viewer */
  await p.click('[data-show]'); await p.waitForSelector('#dvImg', { timeout: 5000 });
  const v0 = await p.evaluate(() => ({ open: dv.open, title: document.getElementById('dvTitle').textContent, owner: document.getElementById('dvOwner').textContent, bg: getComputedStyle(document.getElementById('docOv')).backgroundColor, lock: document.documentElement.classList.contains('noscroll'), i: dv.i, n: dv.list.length, off: document.getElementById('dvOff').classList.contains('on') && getComputedStyle(document.getElementById('dvOff')).visibility === 'visible', offT: document.getElementById('dvOff').innerText }));
  check('K10 viewer: full-screen white, owner + title, page scroll locked, "บันทึกออฟไลน์แล้ว" shown (the opened file is cached automatically)', v0.open && v0.bg === 'rgb(255, 255, 255)' && v0.title && v0.owner === 'Nine' && v0.lock && v0.n === 2 && v0.off && /บันทึกออฟไลน์แล้ว/.test(v0.offT), JSON.stringify(v0));
  const box = await p.evaluate(() => { const r = document.getElementById('dvStage').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await p.touchscreen.tap(box.x, box.y); await p.waitForTimeout(80); await p.touchscreen.tap(box.x, box.y); await p.waitForTimeout(150);
  const z1 = await p.evaluate(() => dv.s); await p.touchscreen.tap(box.x, box.y); await p.waitForTimeout(80); await p.touchscreen.tap(box.x, box.y); await p.waitForTimeout(150);
  check('K11 double-tap zooms in (2.5x) and back out (1x)', z1 > 2 && (await p.evaluate(() => dv.s)) === 1, String(z1));
  await p.evaluate(() => { const st = document.getElementById('dvStage'), r = st.getBoundingClientRect(), mk = (id, x, y, t) => st.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 })); const cx = r.x + r.width / 2, cy = r.y + r.height / 2; mk(1, cx - 40, cy, 'pointerdown'); mk(2, cx + 40, cy, 'pointerdown'); mk(2, cx + 100, cy, 'pointermove'); mk(2, cx + 100, cy, 'pointerup'); mk(1, cx - 40, cy, 'pointerup'); });
  check('K12 pinch gesture changes zoom (pointer events, no library)', (await p.evaluate(() => dv.s)) > 1.5);
  await p.click('#dvRot'); await p.waitForTimeout(100);
  check('K13 rotate button turns the image 90 degrees', (await p.evaluate(() => dv.r)) === 90 && await p.evaluate(() => /rotate\(90deg\)/.test(document.getElementById('dvImg').style.transform)));
  const i0 = await p.evaluate(() => dv.i); await p.click('#dvNext'); await p.waitForTimeout(500);
  const i1 = await p.evaluate(() => ({ i: dv.i, r: dv.r, s: dv.s })); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(400);
  check('K14 next / arrow-key prev move within the list and reset zoom + rotation', i1.i === i0 + 1 && i1.r === 0 && i1.s === 1 && (await p.evaluate(() => dv.i)) === i0, JSON.stringify({ i0, i1 }));
  check('K15 wake lock hint shown when the browser has no Wake Lock (headless)', await p.evaluate(() => !!navigator.wakeLock) || await p.evaluate(() => !document.getElementById('dvHint').hidden));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check('K16 Esc closes the viewer and unlocks page scroll', await p.evaluate(() => !dv.open && document.getElementById('docOv').hidden && !document.documentElement.classList.contains('noscroll')));
  await p.click('[data-show]'); await p.waitForSelector('#dvImg'); await p.goBack(); await p.waitForTimeout(300);
  check('K17 browser Back closes the viewer', await p.evaluate(() => !dv.open));
  /* a PDF pdf.js cannot read: falls back to the old "open in a new tab" button (pdf.js itself is loaded lazily, only now) */
  check('K17b pdf.js is NOT requested until a PDF is opened', !s.reqs.includes('PDFJS'));
  await p.click('[data-seg=shared]'); await p.click('[data-show]'); await p.waitForSelector('#dvPdf', { timeout: 25000 });
  await p.evaluate(() => { window.__op = null; window.open = u => { window.__op = u; }; }); await p.click('#dvPdf'); const pu = await p.evaluate(() => window.__op);
  check('K18 unreadable PDF: friendly fallback, "เปิด PDF" opens the blob in a new tab', /^blob:/.test(pu || '') && s.reqs.includes('PDFJS'), pu);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.click('[data-seg="Nine"]'); await p.waitForTimeout(200);
  /* share / download */
  await p.evaluate(() => { window.__sh = null; navigator.canShare = () => true; navigator.share = async d => { window.__sh = { n: d.files[0].name, t: d.files[0].type }; }; });
  await p.click('[data-dl]'); await p.waitForTimeout(600);
  const sh = await p.evaluate(() => window.__sh);
  check('K19 share: Web Share API gets the file (sanitised title + .jpg)', !!sh && /^พาสปอร์ต\.jpg$/.test(sh.n) && sh.t === 'image/jpeg', JSON.stringify(sh));
  await p.evaluate(() => { navigator.canShare = undefined; navigator.share = undefined; });
  await p.evaluate(() => { window.__dn = null; const o = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { window.__dn = this.download; return o.call(this); }; });
  const dlp = p.waitForEvent('download', { timeout: 4000 }).catch(() => null); await p.click('[data-dl]'); const dlo = await dlp, dn = await p.evaluate(() => window.__dn);
  check('K20 no share support: falls back to a file download (<a download="พาสปอร์ต.jpg">)', !!dlo && dn === 'พาสปอร์ต.jpg', dn);
  /* rename / delete / menu */
  await p.click('[data-more]'); await p.waitForSelector('[data-a=ren]'); await p.click('[data-a=ren]'); await p.fill('#rnT', 'Passport A'); await p.click('#rnOk'); await p.waitForTimeout(700);
  check('K21 rename works', await p.evaluate(() => (dc.list || []).some(d => d.title === 'Passport A')));
  await p.click('[data-more]'); await p.click('[data-a=del]'); await p.waitForSelector('#dlOk'); const nBefore = s.docs.length; await p.click('#dlOk'); await p.waitForTimeout(700);
  check('K22 delete asks for confirmation, then removes the document', s.docs.length === nBefore - 1 && (await seg(p)).Nine === 1, JSON.stringify(await seg(p)));
  /* offline */
  await off(s, true);
  await p.evaluate(() => { Object.values(dc.urls).forEach(u => URL.revokeObjectURL(u)); dc.urls = {}; dc.list = null; dc.status = 'idle'; dc.cached = new Set(); renderDocs(); }); await p.waitForTimeout(1200);
  check('K23 offline: list comes from cached metadata and an "ออฟไลน์" chip shows', await p.evaluate(() => !!document.getElementById('dcOff') && document.querySelectorAll('.dcard[data-id]').length >= 1));
  await p.click('[data-show]'); await p.waitForSelector('#dvImg', { timeout: 5000 }).catch(() => { });
  check('K24 offline: a document opened before opens from IndexedDB', await p.evaluate(() => dv.open && !!document.getElementById('dvImg') && /^blob:/.test(document.getElementById('dvImg').src)), await p.evaluate(() => document.getElementById('dvStage') && document.getElementById('dvStage').innerText));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  /* upload while offline -> clear Thai error */
  await addDoc(p, { file: png1 }); await p.click('#dfOk'); await p.waitForTimeout(800);
  check('K25 upload offline: clear message, button usable again', /ออฟไลน์/.test(await p.innerText('#dfErr')) && await p.evaluate(() => !document.getElementById('dfOk').disabled));
  await p.click('#dfX'); await off(s, false);
  /* rejections */
  await addDoc(p, { file: { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') } });
  check('K26 wrong type is refused with a Thai message', /ชนิดไฟล์ไม่รองรับ/.test(await p.innerText('#dfErr')) && await p.evaluate(() => document.getElementById('dfOk').disabled));
  await p.setInputFiles('#dfFile', { name: 'big.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(4.5 * 1024 * 1024, 65) }); await p.waitForTimeout(500);
  check('K27 PDF over 4 MB is refused with a Thai message', /ใหญ่เกินไป/.test(await p.innerText('#dfErr')));
  s.flags.forcePut = '-4'; await p.setInputFiles('#dfFile', png1); await p.waitForFunction(() => !document.getElementById('dfOk').disabled); await p.click('#dfOk'); await p.waitForTimeout(800);
  check('K28 server refusal (-4 full) shows a clear message and nothing is added', /เซิร์ฟเวอร์ปฏิเสธ/.test(await p.innerText('#dfErr')) && /เต็ม/.test(await p.innerText('#dfErr')));
  s.flags.forcePut = ''; await p.click('#dfX'); await p.waitForTimeout(200);
  /* wipe on sign-out */
  check('K29 cached files exist in IndexedDB before the user switch', (await p.evaluate(async () => (await idbKeys()).length)) > 0);
  await p.click('[data-tab=plan]'); await p.waitForTimeout(300); await p.evaluate(() => travellerPicker()); await p.waitForTimeout(300); await p.click('#whoList [data-u=Mew]'); await p.waitForTimeout(800); await p.evaluate(() => dc.wiping);
  const wp = await p.evaluate(async () => ({ keys: (await idbKeys()).length, list: dc.list, urls: Object.keys(dc.urls).length }));
  check('K30 user switch wipes every document cache (IndexedDB, memory, blob URLs)', wp.keys === 0 && wp.list === null && wp.urls === 0, JSON.stringify(wp));
  /* group visibility: another member sees, opens and adds for others (policy: private group app) */
  const unames = await p.evaluate(() => users().map(u => u.name)), third = unames.find(n => n !== 'Nine' && n !== 'Mew');
  s.flags.users = unames.map(n => n.toLowerCase());
  await login(s, 'Mew'); await p.waitForTimeout(500); await p.click('[data-tab=docs]'); await p.waitForTimeout(1200);
  const mine = await seg(p);
  check('K31 another member sees the first member\'s docs under ทุกคน (2), Nine (1), ส่วนกลาง (1), Mew (0)', mine.all === 2 && mine.Nine === 1 && mine.Mew === 0 && mine.shared === 1, JSON.stringify(mine));
  const pid = s.docs.find(d => d.scope === 'person').id, sid = s.docs.find(d => d.scope === 'shared').id;
  const px = await p.evaluate(async ([a, b]) => ({ get: !!(await sbRpc('doc_get', { p_name: me, p_hash: myHash(), p_id: a })), del: await sbRpc('doc_delete', { p_name: me, p_hash: myHash(), p_id: a }), ren: await sbRpc('doc_rename', { p_name: me, p_hash: myHash(), p_id: b, p_title: 'x' }) }), [pid, sid]);
  check('K32 server mock: get works for others\' personal docs; delete/rename of docs you neither own nor uploaded return 0', px.get === true && px.del === 0 && px.ren === 0, JSON.stringify(px));
  /* offline scope choice (before anything is opened/cached for this member) */
  const gets = () => s.rpc.filter(r => r.fn === 'doc_get').length; let g0 = gets();
  await p.click('#dcAll'); await p.waitForSelector('[data-p=all]');
  check('K32a "ดาวน์โหลดทั้งหมด" asks for a scope: default (ของฉัน + ส่วนกลาง), เฉพาะของฉัน, ทั้งหมดในกลุ่ม', await p.evaluate(() => ['def', 'me', 'all', 'x'].every(k => !!document.querySelector(`[data-p=${k}]`)) && /ของฉัน \+ ส่วนกลาง/.test(document.getElementById('dlg').innerText)));
  await p.click('[data-p=me]'); await p.waitForTimeout(800); const g1 = gets();
  await p.click('#dcAll'); await p.click('[data-p=def]'); await p.waitForTimeout(1200); const g2 = gets();
  await p.click('#dcAll'); await p.click('[data-p=all]'); await p.waitForTimeout(1200); const g3 = gets();
  check('K32b scope choice downloads only what was chosen (mine: 0 files, default: +shared 1, all: 0 more because Nine\'s picture is already stored by its thumbnail)', g1 - g0 === 0 && g2 - g1 === 1 && g3 - g2 === 0 && /อยู่ในเครื่องแล้ว/.test(await p.innerText('#toast')), [g0, g1, g2, g3].join(','));
  const fg = await p.evaluate(() => ({ grp: document.querySelectorAll('.dgh').length, hdr: [...document.querySelectorAll('.dgh')].map(h => h.innerText.replace(/\s+/g, ' ')), av: !!document.querySelector('.dgh .avatar'), cards: document.querySelectorAll('.dcard[data-id]').length, txt: document.getElementById('tab-docs').innerText }));
  check('K33 ทุกคน view: one group per person who has documents (avatar + name + count) and one for ส่วนกลาง, all open, card says "ของ Nine"', fg.grp === 2 && /Nine/.test(fg.hdr[0]) && /1 รายการ/.test(fg.hdr[0]) && /ส่วนกลาง/.test(fg.hdr[1]) && fg.av && fg.cards === 2 && /ของ Nine/.test(fg.txt), JSON.stringify(fg));
  await p.click('[data-show]'); await p.waitForSelector('#dvImg', { timeout: 5000 });
  check('K33a viewer works on another member\'s doc and names the owner at the top', await p.evaluate(() => dv.open && document.getElementById('dvOwner').textContent === 'Nine' && !!document.getElementById('dvImg') && dv.list.length === 2));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('[data-more]'); await p.waitForSelector('[data-a=save]');
  check('K33b non-owner non-uploader: menu has save but NO rename/delete (hidden, not disabled)', await p.evaluate(() => !document.querySelector('[data-a=del]') && !document.querySelector('[data-a=ren]'))); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.click('[data-seg=shared]'); await p.click('[data-more]'); await p.waitForSelector('[data-a=save]');
  check('K33c non-creator sees no rename/delete on a shared document', await p.evaluate(() => !document.querySelector('[data-a=del]') && !document.querySelector('[data-a=ren]'))); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  /* add for someone else */
  await p.click('[data-seg=all]'); await addDoc(p, { who: 'Nine', title: 'For Nine', file: { name: 'o.png', mimeType: 'image/png', buffer: png(300, 200) } });
  const wp0 = await p.evaluate(() => ({ n: document.querySelectorAll('#dfWho [data-w]').length, names: [...document.querySelectorAll('#dfWho [data-w]')].map(b => b.dataset.w), av: document.querySelectorAll('#dfWho .avatar').length, sel: document.querySelector('#dfWho .tag.sel').dataset.w }));
  check('K34 add sheet: "เอกสารของใคร" chips = every traveller (me included, default me) + ส่วนกลาง', wp0.n === unames.length + 1 && wp0.names.includes('Mew') && wp0.names.includes('__shared') && wp0.av === unames.length, JSON.stringify(wp0));
  await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(500);
  const pu2 = s.rpc.filter(r => r.fn === 'doc_put').pop(), nd = s.docs.find(d => d.title === 'For Nine');
  check('K35 saved with p_owner, owner=nine, created_by=mew, scope person; toast "เพิ่มเอกสารให้ Nine แล้ว"; shows under Nine', pu2.a.p_owner === 'Nine' && pu2.a.p_scope === 'person' && nd && nd.owner === 'nine' && nd.created_by === 'mew' && /เพิ่มเอกสารให้ Nine แล้ว/.test(await p.innerText('#toast')) && (await seg(p)).Nine === 2 && /For Nine/.test(await p.innerText('#tab-docs')) && /เพิ่มโดย Mew/.test(await p.innerText('#tab-docs')), JSON.stringify(pu2.a.p_owner) + JSON.stringify(nd));
  await p.click('.dcard[data-id]:has-text("For Nine") [data-more]'); await p.waitForSelector('[data-a=save]');
  check('K36 the uploader (Mew) sees rename + delete on a doc she added for Nine', await p.evaluate(() => !!document.querySelector('[data-a=del]') && !!document.querySelector('[data-a=ren]'))); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  /* a second person -> another group, toggle keeps layout stable */
  if (third) {
    await addDoc(p, { who: third, title: 'For third', file: { name: 'o2.png', mimeType: 'image/png', buffer: png(300, 200) } }); await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(500);
    const g2x = await p.evaluate(() => [...document.querySelectorAll('.dgh')].map(b => ({ n: b.querySelector('b').textContent, open: b.getAttribute('aria-expanded') })));
    await p.click('.dgh >> nth=0'); await p.waitForTimeout(200);
    const g2y = await p.evaluate(() => ({ ex: [...document.querySelectorAll('.dgh')].map(b => b.getAttribute('aria-expanded')), cards: document.querySelectorAll('.dcard[data-id]').length }));
    await p.click('.dgh >> nth=0'); await p.waitForTimeout(200);
    check('K37 three groups (Nine, third, ส่วนกลาง) all open; a header collapses / expands its cards', g2x.length === 3 && g2x.every(x => x.open === 'true') && g2y.ex[0] === 'false' && g2y.ex[1] === 'true' && g2y.cards < 4 && await p.evaluate(() => document.querySelectorAll('.dcard[data-id]').length) === 4, JSON.stringify([g2x, g2y]));
  }
  await p.evaluate(() => travellerPicker()); await p.waitForTimeout(500);
  await login(s, 'Nine'); await p.waitForTimeout(500); await p.click('[data-tab=docs]'); await p.waitForTimeout(1200);
  const nsg = await seg(p); await p.click('[data-seg="Nine"]'); await p.waitForTimeout(300);
  const forMe = await p.evaluate(() => { const c = [...document.querySelectorAll('.dcard[data-id]')].find(x => /For Nine/.test(x.innerText)); return c && { t: c.innerText, more: !!c.querySelector('[data-more]') }; });
  check('K38 the owner (Nine) sees the doc Mew added: "เพิ่มโดย Mew" and "เห็นทั้งกลุ่ม"', nsg.Nine === 2 && forMe && /เพิ่มโดย Mew/.test(forMe.t) && /เห็นทั้งกลุ่ม/.test(forMe.t), JSON.stringify(nsg) + JSON.stringify(forMe));
  await p.click('.dcard[data-id]:has-text("For Nine") [data-more]'); await p.waitForSelector('[data-a=ren]'); await p.click('[data-a=ren]'); await p.fill('#rnT', 'For Nine ok'); await p.click('#rnOk'); await p.waitForTimeout(600);
  check('K39 the owner may rename a doc someone else uploaded for them', s.docs.some(d => d.title === 'For Nine ok'));
  s.flags.users = ['nine']; await addDoc(p, { who: unames.find(n => n !== 'Nine'), file: png1 }); await p.click('#dfOk'); await p.waitForTimeout(800);
  check('K39a unknown owner (server -6) shows a clear Thai message', /ไม่พบสมาชิก/.test(await p.innerText('#dfErr'))); await p.click('#dfX'); await p.waitForTimeout(200); s.flags.users = null;
  await p.evaluate(() => travellerPicker()); await p.waitForTimeout(500); await login(s, 'Mew'); await p.waitForTimeout(500); await p.click('[data-tab=docs]'); await p.waitForTimeout(1200);
  /* the server does not know this name (null) -> message, stay put; transient errors -> retry panel */
  s.flags.nullDocs = true; await p.evaluate(() => docsRefresh(true)); await p.waitForTimeout(1500);
  check('K40 doc_list null (name unknown to the server): Thai message, name kept, no sign-out screen', await p.evaluate(() => !!me && !document.getElementById('login') && /ไม่รู้จักชื่อนี้/.test(document.getElementById('toast').textContent)));
  await s.b.close();
  s = await open(); p = s.p; await login(s, 'Nine'); await off(s, true); await docTab(p);
  check('K35b network error with nothing cached: inline retry, name kept', await p.evaluate(() => !!me && !!document.getElementById('dcRetry') && !document.getElementById('app').hidden));
  await off(s, false); await p.click('#dcRetry'); await p.waitForTimeout(1500);
  check('K36b retry succeeds once the network is back', await p.evaluate(() => !!document.getElementById('dcSeg')));
  await s.b.close();
  /* SQL not applied */
  s = await open(); p = s.p; s.flags.noDocsSql = true; await login(s, 'Nine'); await docTab(p);
  check('K37b SQL not applied: friendly "ยังไม่เปิดใช้งาน" message, no raw error, other tabs fine', /ฟีเจอร์เอกสารยังไม่เปิดใช้งาน — ผู้ดูแลต้องรัน docs\/supabase_docs\.sql/.test(await p.innerText('#tab-docs')) && !/Could not find/.test(await p.innerText('#tab-docs')) && await p.evaluate(() => document.getElementById('error').hidden));
  await p.click('[data-tab=money]'); await p.waitForTimeout(300);
  check('K38b other tabs still work when docs are not enabled', await p.evaluate(() => !document.getElementById('tab-money').hidden && document.getElementById('tab-money').innerText.length > 20));
  await s.b.close();

  /* ---------- P. batch 2 ---------- */
  {
  console.log('\n[P] batch 2: ค่าใช้จ่าย, places, docs viewer, menu, day lock, stay + quick info');
  /* P1 ค่าใช้จ่าย */
  s = await open(); p = s.p; await login(s, 'Nine');
  const pm = await p.evaluate(() => {
    const [a, b] = travellers(); data.expenses = [{ item: 'dinner', cat: 'x', amount: 90, cur: 'THB', payer: a, type: 'split', with: [a, b] }, { item: 'taxi', cat: 'x', amount: 40, cur: 'USD', payer: b, type: 'split', with: [a, b] }, { item: 'solo', cat: 'x', amount: 10, cur: 'THB', payer: a, type: 'personal', with: [] }]; data.costs = [['รายการ', 'ราคา'], ['x', '1']];
    renderMoney(); const el = document.getElementById('tab-money');
    return { a, b, cards: [...el.querySelectorAll('.card.cur')].map(c => c.dataset.cur), thb: [...el.querySelectorAll('.card.cur[data-cur=THB] .pp')].map(r => r.dataset.p + ':' + r.querySelector('.amt').innerText.replace(/\s+/g, ' ')), usd: [...el.querySelectorAll('.card.cur[data-cur=USD] [data-pair]')].map(r => r.dataset.pair + ':' + r.innerText.replace(/\s+/g, ' ')), thbPair: [...el.querySelectorAll('.card.cur[data-cur=THB] [data-pair]')].map(r => r.dataset.pair + ':' + r.querySelector('.v').innerText), tbl: el.querySelectorAll('table').length, h: [...el.querySelectorAll('h2')].map(x => x.textContent.trim()), tabLabel: document.querySelector('[data-tab=money] span').textContent, seg: el.querySelectorAll('#moneySum .seg').length };
  });
  check('P1 ค่าใช้จ่าย: one page, one card per currency: spent per person (paid) ...', pm.tabLabel === 'ค่าใช้จ่าย' && JSON.stringify(pm.cards) === '["THB","USD"]' && pm.thb.some(x => x.startsWith(pm.a + ':100')) && pm.thb.some(x => x.startsWith(pm.b + ':0')), JSON.stringify(pm));
  check('P1b ... and who pays whom per currency (net pair: THB b->a 45; USD a->b 20); no final table, no currency switcher', pm.thbPair.length === 1 && pm.thbPair[0].startsWith(pm.b + '>' + pm.a + ':45') && pm.usd.length === 1 && pm.usd[0].startsWith(pm.a + '>' + pm.b) && /20/.test(pm.usd[0]) && pm.tbl === 0 && pm.seg === 0, JSON.stringify(pm));
  await s.b.close();
  /* P1c: Cost tab with "นาย" / "มิว" columns on a private trip; rows without a person = shared */
  s = await open({ active: 'priv:macau' }); p = s.p; await login(s, 'Nine');
  s.trips.macau.Cost = [['รายการ', 'นาย', 'มิว', 'ราคา'], ['Ticket', '100', '50', ''], ['Hotel', '', '', '200'], ['รวม', '100', '50', '200']];
  await p.evaluate(() => load()); await p.waitForTimeout(1500); await p.click('[data-tab=money]'); await p.waitForTimeout(500);
  const pc = await p.evaluate(() => { const el = document.getElementById('tab-money'); return { rows: [...el.querySelectorAll('.card.cur .pp')].map(r => r.dataset.p + ':' + r.querySelector('.amt').innerText.replace(/\s+/g, ' ').trim() + '|' + r.querySelector('small').innerText), pairs: el.querySelectorAll('[data-pair]').length, unpaid: /ส่วนกลางที่ยังไม่มีผู้จ่าย 200/.test(el.innerText), list: el.querySelector('#moneyBody').innerText.replace(/\s+/g, ' '), ce: costExpenses().map(e => e.payer + e.amount + e.type).join(',') }; });
  check('P1c Cost tab: นาย = Nine, มิว = Mew (personal amounts), a row without a person (Hotel 200) is shared and split; the total row is ignored; no debts from shared', pc.ce === 'Nine100personal,Mew50personal,200shared' && pc.rows.length === 2 && pc.rows[0].startsWith('Nine:100 THB|ส่วนที่ต้องรับ 200') && pc.rows[1].startsWith('Mew:50 THB|ส่วนที่ต้องรับ 150') && pc.pairs === 0 && pc.unpaid && /Hotel/.test(pc.list), JSON.stringify(pc));
  s.trips.macau.Cost = [['รายการ', 'ราคา'], ['ตั๋ว', '100']]; await p.evaluate(() => load()); await p.waitForTimeout(1200);
  check('P1d default synthetic Cost tab (no person column): the row is a shared cost, nothing is lost', await p.evaluate(() => costExpenses().map(e => e.item + e.amount + e.type + (e.payer || '-')).join()) === 'ตั๋ว100shared-');
  /* P1f: real private Cost shape (synthetic numbers): section headers per currency, blank row, side summaries, total rows */
  s.trips.macau.Cost = [['บาท (จองจากไทย)', 'รายการในไทย', 'ค่าเสียหายมิว (บาท)', 'ค่าเสียหายนาย (บาท)', 'รวม'],
    ['', 'ตั๋วเครื่องบิน', '30.50', '30.50', '61', 'จ่ายแล้ว', 'รวมนาย (หยวน)', '99'],
    ['', 'โรงแรม', '', '', '40', '', '', '', '', '', '', 'expense', 'total', 'Real cost'],
    ['', 'ประกัน', '', '7', ''],
    ['', 'รวม', '30.50', '37.50', '101'], [],
    ['หยวน (จองจากไทย)', 'รายการในจีน', 'ค่าเสียหายมิว (หยวน)', 'ค่าเสียหายนาย (หยวน)', 'รวม'],
    ['', 'รถไฟ', '5', '5', '10'], ['', 'รวม', '5', '5', '10'], ['', 'ว่าง', '', '', '']];
  await p.evaluate(() => load()); await p.waitForTimeout(1500);
  const pf = await p.evaluate(() => costExpenses().map(e => e.item + ':' + e.cur + ':' + (e.payer || '-') + ':' + e.amount + ':' + e.type).join('|'));
  check('P1f real Cost shape: per-person shares by header substring, currency per section (THB / CNY), total rows + side cells + empty rows skipped, total-only row = shared, one-person row = that person', pf === 'ตั๋วเครื่องบิน:THB:Mew:30.5:personal|ตั๋วเครื่องบิน:THB:Nine:30.5:personal|โรงแรม:THB:-:40:shared|ประกัน:THB:Nine:7:personal|รถไฟ:CNY:Mew:5:personal|รถไฟ:CNY:Nine:5:personal', pf);
  await p.click('[data-tab=money]'); await p.waitForTimeout(500);
  const pg = await p.evaluate(() => ({ cards: [...document.querySelectorAll('#tab-money .card.cur')].map(c => c.dataset.cur).join(), pairs: document.querySelectorAll('#tab-money [data-pair]').length }));
  check('P1g real Cost shape: one card per currency (THB, CNY) and no invented debts', pg.cards === 'THB,CNY' && pg.pairs === 0, JSON.stringify(pg));
  /* adding an expense still works on a private trip: payers = Nine / Mew, written through private_write */
  await p.evaluate(() => expenseDialog()); await p.waitForTimeout(300);
  const pay = await p.evaluate(() => [...document.querySelectorAll('select[name=payer] option')].map(o => o.value).join());
  await p.fill('[name=item]', 'Coffee'); await p.fill('[name=amount]', '55'); await p.click('#dlg button[value=ok]'); await p.waitForTimeout(1200);
  const ew = s.rpc.filter(r => r.fn === 'private_write' && r.a.p_tab === 'Expenses').pop();
  check('P1e add expense (private trip): payer list = Nine, Mew; saved with private_write append to Expenses', pay === 'Nine,Mew' && !!ew && ew.a.p_op === 'append' && ew.a.p_payload[1] === 'Coffee' && +ew.a.p_payload[3] === 55, pay + JSON.stringify(ew && ew.a.p_payload));
  await s.b.close();

  /* P2 menu */
  s = await open(); p = s.p; await login(s, 'Nine'); await p.click('[data-tab=menu]'); await p.waitForTimeout(1200);
  const mn = await p.evaluate(() => ({ h: [...document.querySelectorAll('#tab-menu > .card h2')].map(x => x.textContent.trim()), last: document.querySelector('#tab-menu').lastElementChild.id, txt: document.getElementById('tab-menu').innerText, rows: document.querySelectorAll('#tab-menu .mrow').length, names: travellers().length }));
  const iM = mn.h.findIndex(x => /สมาชิก/.test(x)), iT = mn.h.indexOf('ทริป'), iN = mn.h.indexOf('การแจ้งเตือน'), iD = mn.h.indexOf('โหมดมืด'), iQ = mn.h.findIndex(x => /โควตาฟรี Supabase/.test(x));
  check('P2 menu order: สมาชิก -> ทริป -> การแจ้งเตือน -> โหมดมืด ... -> โควตาฟรี Supabase LAST; no "โปรไฟล์ของฉัน", no "แก้ไขทริป" card', iM === 0 && iT === 1 && iN === 2 && iD > iN && iQ === mn.h.length - 1 && mn.last === 'usageBox' && !/โปรไฟล์ของฉัน|แก้ไขทริป/.test(mn.txt) && mn.rows === mn.names, JSON.stringify(mn.h) + mn.last);
  await p.click('#tab-menu .mrow[data-n=Mew] [data-who]'); await p.waitForTimeout(800);
  check('P2b members card: every traveller has a photo action; "ใช้ชื่อนี้" selects who I am', await p.evaluate(() => me === 'Mew' && document.querySelectorAll('#tab-menu .mrow [data-avp]').length === travellers().length && !!document.querySelector('#tab-menu .mrow[data-n=Mew] .chip') && !document.querySelector('#tab-menu .mrow[data-n=Mew] [data-who]')));
  await s.b.close();

  /* P3 day lock */
  s = await open({ init: CLSK }); p = s.p; await login(s, 'Nine'); await p.click('[data-tab=plan]'); await p.waitForTimeout(500);
  const L0 = await p.evaluate(() => ({ label: data.plan.days[ui.day].label, btn: document.getElementById('lockBtn').innerText.trim(), edit: !document.getElementById('editBtn').disabled, badge: !!document.getElementById('lockBadge') }));
  check('P3 each day has a "ล็อกวัน" toggle next to แก้ไข (not locked yet: edit enabled, no badge)', L0.btn === 'ล็อกวัน' && L0.edit && !L0.badge, JSON.stringify(L0));
  await p.evaluate(() => { window.__cls = 0; }); await p.click('#lockBtn'); await p.waitForTimeout(900);
  const hdr = s.rpc.filter(r => r.fn === 'append_row' && r.a.p_tab === 'Locks'), up = s.rpc.filter(r => r.fn === 'upsert_row' && r.a.p_tab === 'Locks').pop();
  const L1 = await p.evaluate(() => ({ btn: document.getElementById('lockBtn').innerText.trim(), dis: document.getElementById('editBtn').disabled, badge: document.getElementById('lockBadge') && document.getElementById('lockBadge').innerText, tl: document.getElementById('tl').classList.contains('locked'), cls: window.__cls, h: document.getElementById('lockBtn').getBoundingClientRect().height }));
  check('P3b lock: written to the shared tab Locks (header row once + upsert Day|1|who|time), button becomes "ปลดล็อก", edit disabled, badge "ล็อกอยู่ · Nine"', hdr.length === 1 && hdr[0].a.p_cells[0] === 'Day' && !!up && up.a.p_key === L0.label && up.a.p_cells[0] === L0.label && up.a.p_cells[1] === '1' && up.a.p_cells[2] === 'Nine' && !isNaN(Date.parse(up.a.p_cells[3])) && up.a.code === '' && L1.btn === 'ปลดล็อก' && L1.dis && /ล็อกอยู่ · Nine/.test(L1.badge) && L1.tl && L1.h >= 44, JSON.stringify({ hdr: hdr.length, up: up && up.a, L1 }));
  check('P3c locking causes no layout shift (CLS <= 0.05)', L1.cls <= 0.05, String(L1.cls));
  await p.evaluate(() => toggleEdit()); await p.waitForTimeout(200);
  check('P3d a locked day cannot be edited: toggleEdit refuses with a toast, edit mode stays off', await p.evaluate(() => !ui.edit && /ถูกล็อก/.test(document.getElementById('toast').textContent)));
  const tgt = await p.evaluate(() => { const i = data.plan.days.findIndex((_, k) => k !== ui.day); window.__locked = ui.day; addToPlanDialog('Test place', null); return [...document.querySelectorAll('#dlg select[name=day] option')].map(o => o.value + (o.disabled ? 'x' : '')).join(); });
  check('P3e "เพิ่มเข้าแผน" cannot target a locked day (option disabled)', tgt.split(',')[await p.evaluate(() => window.__locked)].endsWith('x'), tgt); await p.evaluate(() => document.getElementById('dlg').close());
  const sg = await p.evaluate(async () => { const d = data.plan.days[ui.day], n = d.steps.length; await addSpotToPlan({ di: ui.day, a: { q: 'x', name: 'x' }, spot: { name: 'S' }, ea: { mode: 'walk' } }); return { same: d.steps.length === n, toast: document.getElementById('toast').textContent }; });
  check('P3f suggestion "แทรกเข้าแผน" into a locked day is refused', sg.same && /ถูกล็อก/.test(sg.toast), JSON.stringify(sg));
  await p.click('#lockBtn'); await p.waitForTimeout(800);
  const up2 = s.rpc.filter(r => r.fn === 'upsert_row' && r.a.p_tab === 'Locks').pop();
  check('P3g unlock: row written with Locked = 0, edit enabled again', up2.a.p_cells[1] === '0' && await p.evaluate(() => !document.getElementById('editBtn').disabled && document.getElementById('lockBtn').innerText.trim() === 'ล็อกวัน' && !document.getElementById('lockBadge')));
  /* the lock is loaded for everybody (server rows) */
  await s.b.close();
  s = await open({ active: 'priv:macau' }); p = s.p; await login(s, 'Mew');
  const lab = await p.evaluate(() => data.plan.days[1].label); s.trips.macau.Locks = [['Day', 'Locked', 'By', 'Time'], [lab, '1', 'Nine', '2026-07-01T10:00:00Z']];
  await p.evaluate(() => load()); await p.waitForTimeout(1500); await p.click('.pill[data-day="1"]'); await p.waitForTimeout(400);
  check('P3h a lock written by someone else is read from the Locks tab: day 2 shows "ล็อกอยู่ · Nine", day 1 does not', await p.evaluate(() => /ล็อกอยู่ · Nine/.test(document.getElementById('tab-plan').innerText) && document.getElementById('editBtn').disabled) && await (async () => { await p.click('.pill[data-day="0"]'); await p.waitForTimeout(300); return p.evaluate(() => !document.getElementById('lockBadge') && !document.getElementById('editBtn').disabled); })());
  await p.click('.pill[data-day="1"]'); await p.waitForTimeout(300); await p.click('#lockBtn'); await p.waitForTimeout(800);
  const pw = s.rpc.filter(r => r.fn === 'private_write' && r.a.p_tab === 'Locks' && r.a.p_op === 'upsert').pop();
  check('P3i private trip: unlock goes through private_write(upsert) with the day key and my name; the tab already had its header, so no header append', !!pw && pw.a.p_payload.key === lab && pw.a.p_payload.cells[1] === '0' && pw.a.p_payload.cells[2] === 'Mew' && pw.a.p_name === 'Mew' && !s.rpc.some(r => r.fn === 'private_write' && r.a.p_tab === 'Locks' && r.a.p_op === 'append'), JSON.stringify(pw && pw.a));
  /* a failing write: toast, nothing pretends to be locked, the app keeps working */
  s.flags.failWrites = true; await p.click('#lockBtn'); await p.waitForTimeout(1200);
  check('P3j lock write fails: toast "บันทึกการล็อกไม่สำเร็จ", the day is NOT shown as locked, editing still possible', await p.evaluate(() => /บันทึกการล็อกไม่สำเร็จ/.test(document.getElementById('toast').textContent) && !document.getElementById('lockBadge') && !document.getElementById('editBtn').disabled && !isLocked(data.plan.days[ui.day])));
  s.flags.failWrites = false; await s.b.close();

  /* P4 stay badge + quick info */
  s = await open({ active: 'priv:macau', w: 360, h: 640 }); p = s.p; await login(s, 'Nine');
  const noStay = await p.evaluate(() => ({ badges: document.querySelectorAll('#tl .stlink').length, info: !!document.getElementById('infoBtn') }));
  s.trips.macau.Stay = [['Key', 'Value'], ['name', 'Test Hotel'], ['address', '1 Test Road, Sample City'], ['lat', '22.19'], ['lng', '113.54'], ['checkin', 'Check-in 15.00'], ['checkout', 'Check-out 11.00'], ['booking', 'BK-12345'], ['phone', '+853 1234 5678'], ['note', 'Ask for a high floor'], ['rules', 'No smoking\nQuiet after 22.00']];
  s.trips.macau.Info = [['Key', 'Value'], ['Police', '999'], ['Wi-Fi', 'guest1234']];
  await p.evaluate(() => load()); await p.waitForTimeout(1800);
  const cdH = await p.evaluate(() => ({ h: document.getElementById('cd').getBoundingClientRect().height, info: document.getElementById('infoBtn').getBoundingClientRect(), badges: document.querySelectorAll('#tl .stlink').length, big: !!document.getElementById('infoCard'), over: document.documentElement.scrollWidth - innerWidth }));
  check('P4 stay = a place: plan steps that go to / from "ที่พัก" get a small bed badge button (none while there is no Stay data); quick info is ONE icon button in the existing row (no big card)', noStay.badges === 0 && !noStay.info && cdH.badges >= 1 && cdH.info.width >= 44 && cdH.info.height >= 44 && cdH.h <= 80 && !cdH.big && cdH.over <= 1, JSON.stringify({ noStay, cdH }));
  await p.click('#tl .stlink >> nth=0'); await p.waitForTimeout(400);
  const sd = await p.evaluate(() => ({ open: document.getElementById('dlg').open, t: document.getElementById('dlg').innerText, go: document.getElementById('stGo').href, btnH: Math.min(...[...document.querySelectorAll('#dlg .btn')].map(b => b.getBoundingClientRect().height)), tel: !!document.querySelector('#dlg a[href^="tel:"]'), over: document.getElementById('dlg').scrollWidth - document.getElementById('dlg').clientWidth }));
  check('P4b tapping the badge opens the stay sheet: name, address, check-in/out, booking ref, phone, note, rules, navigate (Google Maps link), copy address, taxi screen', sd.open && /Test Hotel/.test(sd.t) && /1 Test Road/.test(sd.t) && /Check-in 15\.00/.test(sd.t) && /Check-out 11\.00/.test(sd.t) && /BK-12345/.test(sd.t) && /\+853/.test(sd.t) && /high floor/.test(sd.t) && /No smoking/.test(sd.t) && /คัดลอกที่อยู่/.test(sd.t) && /โชว์ให้คนขับแท็กซี่/.test(sd.t) && /google\.com\/maps\/dir\/\?api=1&destination=22\.190000,113\.540000/.test(sd.go) && sd.tel && sd.btnH >= 44 && sd.over <= 1, JSON.stringify(sd));
  await p.evaluate(() => { window.__cp = []; Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__cp.push(t); } }, configurable: true }); });
  await p.click('#stCopy'); await p.click('[data-cp]'); await p.waitForTimeout(200);
  check('P4c copy address + copy booking ref', JSON.stringify(await p.evaluate(() => window.__cp)) === JSON.stringify(['Test Hotel\n1 Test Road, Sample City', 'BK-12345']));
  await p.click('#stTaxi'); await p.waitForTimeout(300);
  const tx = await p.evaluate(() => ({ open: dv.open, t: document.getElementById('docOv').innerText, fs: parseFloat(getComputedStyle(document.querySelector('.tx-a')).fontSize), dlg: document.getElementById('dlg').open }));
  check('P4d "โชว์ให้คนขับแท็กซี่" closes the sheet and shows the full-screen big-text address', tx.open && !tx.dlg && /Test Hotel/.test(tx.t) && /1 Test Road/.test(tx.t) && tx.fs >= 24, JSON.stringify(tx)); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('#stayBtn'); await p.waitForTimeout(300);
  check('P4e the "ที่พัก" button of the next-stop row opens the same sheet', await p.evaluate(() => document.getElementById('dlg').open && /BK-12345/.test(document.getElementById('dlg').innerText))); await p.click('#stX'); await p.waitForTimeout(200);
  await p.click('#infoBtn'); await p.waitForTimeout(300);
  const ip = await p.evaluate(() => ({ t: document.getElementById('dlg').innerText, copies: document.querySelectorAll('#dlg [data-icp]').length, aria: document.getElementById('infoBtn').getAttribute('aria-label') }));
  check('P4f quick info icon opens a popup with the optional Info rows (+ copy); aria-label "ข้อมูลด่วน"', /ข้อมูลด่วน/.test(ip.t) && /999/.test(ip.t) && /guest1234/.test(ip.t) && ip.copies === 2 && ip.aria === 'ข้อมูลด่วน', JSON.stringify(ip)); await p.click('#infX'); await p.waitForTimeout(200);
  await p.click('[data-tab=docs]'); await p.waitForTimeout(900);
  check('P4g nothing of the quick-info card is left in the documents tab', await p.evaluate(() => !document.getElementById('infoCard') && !document.getElementById('infTaxi') && !/ข้อมูลด่วน|Test Hotel/.test(document.getElementById('tab-docs').innerText)));
  await s.b.close();

  /* P5 places: one page, empty state, add -> instant insight + suggestion */
  s = await open({ clock: '2026-07-10T10:00:00', active: 'priv:macau', init: CLSK }); p = s.p; await login(s, 'Nine');
  await s.ctx.route(/nominatim\.openstreetmap\.org/, r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(/Named%20Cafe|Named Cafe/.test(decodeURIComponent(r.request().url())) ? [{ lat: '22.2105', lon: '113.5525' }] : []) }));
  await p.evaluate(() => {
    let i = 0; data.plan.days.forEach((_, d) => dayWaypoints(d).forEach(w => { if (!gc.cache[gKey(w.q)]) gc.cache[gKey(w.q)] = { lat: 22.19 + 0.01 * (++i), lng: 113.54 + 0.012 * i }; }));
    window.load = async () => { }; data.spots = []; data.stay = {}; renderPlan();
  });
  await p.click('[data-tab=spots]'); await p.waitForTimeout(700);
  const em = await p.evaluate(() => ({ empty: !!document.getElementById('spotEmpty'), btn: document.getElementById('addSpotEmpty').innerText.trim(), seg: document.querySelectorAll('#tab-spots .seg').length, builtin: document.querySelectorAll('.spot').length, over: document.documentElement.scrollWidth - innerWidth }));
  check('P5 places with an empty list: friendly empty state + "เพิ่มสถานที่" button, nothing built in, no segment switcher', em.empty && /เพิ่มสถานที่/.test(em.btn) && em.seg === 0 && em.builtin === 0 && em.over <= 1, JSON.stringify(em));
  const w0 = await p.evaluate(() => coordOf('Place 0A'));
  await p.evaluate(([la, ln]) => { window.__c = [la + 0.0025, ln + 0.0015]; }, [w0.lat, w0.lng]);
  await p.click('#addSpotEmpty'); await p.waitForSelector('#dlg input[name=u]');
  await p.fill('#dlg input[name=u]', (w0.lat + 0.0025).toFixed(5) + ', ' + (w0.lng + 0.0015).toFixed(5)); await p.waitForFunction(() => /พบพิกัด/.test(document.getElementById('detect').textContent), null, { timeout: 8000 });
  const ins = await p.evaluate(() => ({ t: document.getElementById('insight').innerText, name: document.querySelector('#dlg input[name=name]').value }));
  check('P5b the dialog finds the nearest plan stop + whether it fits BEFORE saving (distance, walk time, "แทรกหลัง X ช่วง hh.mm–hh.mm")', /ใกล้ Place 0A/.test(ins.t) && /เดิน \d+ นาที/.test(ins.t) && /แทรกหลัง Place 0A ช่วง \d\d\.\d\d–\d\d\.\d\d, เดิน \d+ นาที/.test(ins.t), ins.t);
  await p.fill('#dlg input[name=name]', 'Test Sight'); await p.click('#dlg #typeSeg [data-t=sight]'); await p.click('#dlg button[value=ok]'); await p.waitForTimeout(500);
  const sg1 = await p.evaluate(() => ({ sug: document.querySelectorAll('.spot.sug').length, t: (document.querySelector('.spot.sug') || {}).innerText || '', btn: !!document.querySelector('[data-addplan]'), toast: document.getElementById('toast').textContent, list: document.querySelectorAll('.spot[data-spot]').length, listT: (document.querySelector('.spot[data-spot]') || {}).innerText || '' }));
  const sw = s.rpc.filter(r => r.fn === 'private_write' && r.a.p_tab === 'Places').pop();
  check('P5c right after saving (no extra step): a Suggestion card "แทรกหลัง Place 0A ช่วง ..." with the "แทรกเข้าแผน" button; the place is listed with its nearest stops; saved to Places', sg1.sug === 1 && /แทรกหลัง Place 0A ช่วง/.test(sg1.t) && sg1.btn && /แทรกเข้าแผน/.test(sg1.t) && /Test Sight/.test(sg1.t) && sg1.list === 1 && /ใกล้ Place 0A/.test(sg1.listT) && /แทรกหลัง Place 0A/.test(sg1.toast) && !!sw && sw.a.p_op === 'upsert' && sw.a.p_payload.key === 'Test Sight', JSON.stringify(sg1) + JSON.stringify(sw && sw.a.p_payload));
  const before = await p.evaluate(() => data.plan.days[0].steps.map(s => (s.from || '') + '>' + (s.to || '')).join('|'));
  await p.click('[data-addplan="0"]'); await p.waitForTimeout(1600);
  const after = await p.evaluate(() => ({ st: data.plan.days[0].steps.map(s => (s.from || '') + '>' + (s.to || '')).join('|'), how: data.plan.days[0].steps.find(s => s.to === 'Test Sight').how, sug: document.querySelectorAll('.spot.sug').length }));
  const sv2 = s.rpc.filter(r => r.fn === 'private_write' && r.a.p_op === 'save').pop();
  check('P5d one tap "แทรกเข้าแผน": the stop is inserted right after Place 0A (and the next leg starts from it), saved with the plan, the suggestion disappears', before !== after.st && /Place 0A>Test Sight\|Test Sight>/.test(after.st) && after.how === 'Walk' && after.sug === 0 && !!sv2 && sv2.a.p_payload.some(r => r.includes('Test Sight')), JSON.stringify({ before, after }));
  /* a far-away place: nearest stops are still reported, but no gap is long enough */
  await p.evaluate(() => saveSpot({ name: 'Far Place', lat: 22.19 + 0.35, lng: 113.54 + 0.35, type: 'sight', meal: '', cuisine: '', note: '', src: 'sheet' }, '')); await p.waitForTimeout(500);
  const far = await p.evaluate(() => (document.querySelector('.spot[data-spot="Far Place"]') || {}).innerText || '');
  check('P5e a place far from the plan: nearest stop shown with a drive estimate, honest "ยังไม่มีช่วงเวลาว่างพอ", no suggestion card for it', /ขับรถ/.test(far) && /ยังไม่มีช่วงเวลาว่างพอ/.test(far) && await p.evaluate(() => !document.querySelector('.spot.sug[data-sug="Far Place"]')), far);
  /* by name: geocoded */
  await p.evaluate(() => spotDialog()); await p.waitForSelector('#dlg input[name=u]'); await p.fill('#dlg input[name=u]', 'Named Cafe'); await p.waitForFunction(() => /พบพิกัด/.test(document.getElementById('detect').textContent) || /ไม่พบ/.test(document.getElementById('detect').textContent), null, { timeout: 15000 });
  const nm = await p.evaluate(() => ({ d: document.getElementById('detect').textContent, name: document.querySelector('#dlg input[name=name]').value, ins: document.getElementById('insight').innerText }));
  check('P5f a plain place NAME is geocoded: "พบพิกัด … (จากชื่อ)", the name field is filled, insight appears', /พบพิกัด 22\.21050, 113\.55250 \(จากชื่อ\)/.test(nm.d) && nm.name === 'Named Cafe' && /ใกล้/.test(nm.ins), JSON.stringify(nm)); await p.evaluate(() => document.getElementById('dlg').close());
  check('P5g one page: no tab segments on the Places tab, CLS <= 0.05', await p.evaluate(() => document.querySelectorAll('#tab-spots .seg').length === 0 && window.__cls <= 0.05), String(await p.evaluate(() => window.__cls)));
  await s.b.close();
  /* geocoding fails -> clear message, nothing saved */
  s = await open({ active: 'priv:macau' }); p = s.p; await login(s, 'Nine'); await p.click('[data-tab=spots]'); await p.waitForTimeout(600);
  await p.evaluate(() => spotDialog()); await p.fill('#dlg input[name=u]', 'Nowhere Land'); await p.waitForFunction(() => /ไม่พบสถานที่นี้/.test(document.getElementById('detect').textContent), null, { timeout: 15000 });
  await p.fill('#dlg input[name=name]', 'x'); await p.click('#dlg button[value=ok]'); await p.waitForTimeout(300);
  check('P5h unknown name: "ไม่พบสถานที่นี้" and saving is refused (no row written)', await p.evaluate(() => /ยังไม่มีพิกัด/.test(document.getElementById('toast').textContent)) && !s.rpc.some(r => r.fn === 'private_write' && r.a.p_tab === 'Places'));
  await s.b.close();

  /* P6 documents viewer: PDF inline, cached pages, offline */
  const pdfOf = n => { const objs = []; objs.push('<< /Type /Catalog /Pages 2 0 R >>'); objs.push(`<< /Type /Pages /Kids [${Array.from({ length: n }, (_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`); for (let i = 0; i < n; i++) { const t = `BT /F1 36 Tf 60 400 Td (Page ${i + 1}) Tj ET`; objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 500] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>`); objs.push(`<< /Length ${t.length} >>\nstream\n${t}\nendstream`); } let out = '%PDF-1.4\n'; const off = []; objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; }); const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`; return Buffer.from(out, 'latin1'); };
  s = await open({ init: CLSK }); p = s.p; await login(s, 'Nine'); await docTab(p);
  await addDoc(p, { kind: 'hotel', title: 'Voucher', file: { name: 'v.pdf', mimeType: 'application/pdf', buffer: pdfOf(3) } }); await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(600);
  const pdfReq0 = s.reqs.filter(x => x === 'PDFJS').length, g00 = s.rpc.filter(r => r.fn === 'doc_get').length;
  await p.click('.dcard[data-id]:has-text("Voucher") [data-show]');
  await p.waitForFunction(() => document.querySelectorAll('#dvPin img').length === 3, null, { timeout: 30000 });
  const pv1 = await p.evaluate(async () => { const ims = [...document.querySelectorAll('#dvPin img')]; await Promise.all(ims.map(i => i.decode().catch(() => { }))); return { n: ims.length, w: ims.map(i => i.naturalWidth), ok: ims.every(i => i.naturalWidth > 300), fullW: Math.abs(ims[0].getBoundingClientRect().width - document.getElementById('dvPages').clientWidth) < 2, off: document.getElementById('dvOff').classList.contains('on'), msg: document.getElementById('dvMsg').hidden, rot: document.getElementById('dvRot').hidden, idb: null }; });
  pv1.idb = await p.evaluate(async () => (await idbKeys()).filter(k => /^p:/.test(k)).length);
  check('P6 PDF is rendered inline page by page as images (3 pages, full width, no "open in new tab" step), pdf.js loaded only now, "บันทึกออฟไลน์แล้ว" shown, pages cached in IndexedDB', pv1.n === 3 && pv1.ok && pv1.fullW && pv1.off && pv1.msg && pv1.rot && pv1.idb === 1 && pdfReq0 === 0 && s.reqs.includes('PDFJS'), JSON.stringify(pv1));
  const clsA = await p.evaluate(() => window.__cls);
  await p.evaluate(() => { const st = document.getElementById('dvPages'), r = st.getBoundingClientRect(), mk = (id, x, y, t) => st.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1 })); const cx = r.x + r.width / 2, cy = r.y + r.height / 2; mk(1, cx - 40, cy, 'pointerdown'); mk(2, cx + 40, cy, 'pointerdown'); mk(2, cx + 120, cy, 'pointermove'); mk(2, cx + 120, cy, 'pointerup'); mk(1, cx - 40, cy, 'pointerup'); });
  const zm = await p.evaluate(() => ({ s: dv.s, w: document.getElementById('dvPin').style.width, sw: document.getElementById('dvPages').scrollWidth > document.getElementById('dvPages').clientWidth }));
  check('P6b pinch zooms the pages (container widens, scrollable sideways); double-tap toggles 1x / 2.5x', zm.s > 1.5 && parseFloat(zm.w) > 150 && zm.sw, JSON.stringify(zm));
  const bx = await p.evaluate(() => { const r = document.getElementById('dvPages').getBoundingClientRect(); return [r.x + 20, r.y + 60]; });
  await p.evaluate(() => { const st = document.getElementById('dvPages'); st.scrollLeft = 0; });
  await p.touchscreen.tap(bx[0], bx[1]); await p.waitForTimeout(80); await p.touchscreen.tap(bx[0], bx[1]); await p.waitForTimeout(200);
  check('P6c double-tap while zoomed returns to 1x', await p.evaluate(() => dv.s) === 1);
  const clsB = await p.evaluate(() => window.__cls);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  /* next open: offline, from cache only */
  const g01 = s.rpc.filter(r => r.fn === 'doc_get').length, pdfN = s.reqs.filter(x => x === 'PDFJS').length;
  await off(s, true); await p.evaluate(() => { dc.urls = {}; }); await p.click('.dcard[data-id]:has-text("Voucher") [data-show]');
  await p.waitForFunction(() => document.querySelectorAll('#dvPin img').length === 3, null, { timeout: 10000 }).catch(() => { });
  const pv2 = await p.evaluate(() => ({ n: document.querySelectorAll('#dvPin img').length, off: document.getElementById('dvOff').classList.contains('on') }));
  check('P6d the next open (network OFF) shows the cached pages immediately: 3 pages, no doc_get, pdf.js not requested again, still marked offline', pv2.n === 3 && pv2.off && s.rpc.filter(r => r.fn === 'doc_get').length === g01 && s.reqs.filter(x => x === 'PDFJS').length === pdfN, JSON.stringify({ pv2, g00, g01 }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); await off(s, false);
  await p.click('.dcard[data-id]:has-text("Voucher") [data-more]'); await p.click('[data-a=del]'); await p.click('#dlOk'); await p.waitForTimeout(800);
  check('P6e deleting a document also drops its cached pages', await p.evaluate(async () => (await idbKeys()).filter(k => /^p:/.test(k)).length) === 0);
  check('P6f CLS <= 0.05 while the PDF pages arrive and while re-opening / deleting (the deliberate zoom resize driven by the synthetic pinch is excluded)', clsA <= 0.05 && (await p.evaluate(() => window.__cls)) - clsB <= 0.05, clsA + ' / ' + clsB + ' / ' + await p.evaluate(() => window.__cls));
  await s.b.close();
  /* chips are sticky under the header, and an image opened is marked offline */
  s = await open({ w: 390, h: 700 }); p = s.p; await login(s, 'Nine'); await docTab(p);
  for (let i = 0; i < 6; i++) { await addDoc(p, { title: 'Doc ' + i, file: { name: 'd.png', mimeType: 'image/png', buffer: png(200, 100) } }); await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(300); }
  await p.evaluate(() => window.scrollTo(0, 500)); await p.waitForTimeout(300);
  const stk = await p.evaluate(() => { const c = document.querySelector('.dsegw'), r = c.getBoundingClientRect(), h = document.querySelector('.top').getBoundingClientRect().bottom, bs = [...document.querySelectorAll('#dcSeg button')].map(b => b.getBoundingClientRect().height); return { pos: getComputedStyle(c).position, gap: Math.round(r.top - h), minH: Math.min(...bs), y: scrollY }; });
  check('P7 documents chips (ทุกคน | names | ส่วนกลาง) stay pinned right under the header while scrolling, each >= 44 px', stk.pos === 'sticky' && Math.abs(stk.gap) <= 1 && stk.minH >= 44 && stk.y > 250, JSON.stringify(stk));
  await s.b.close();

  }

  /* L: no emoji glyphs anywhere in the UI; icons come from the one inline-SVG helper */
  {
    const EMO = /(?![©®™])\p{Extended_Pictographic}|️/u, fsx = require('fs'), root = require('path').join(__dirname, '..');
    const staticTxt = fsx.readFileSync(root + '/index.html', 'utf8') + (fsx.readFileSync(root + '/style.css', 'utf8').match(/content:\s*["'][^"']*["']/g) || []).join(' ');
    check('L1 index.html / style.css content: have no emoji', !EMO.test(staticTxt));
    s = await open(); p = s.p; await login(s, 'Nine');
    const bad = {};
    const scan = async name => { const t = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.offsetParent !== null || e.closest('dialog[open]')).map(e => (e.childNodes.length ? [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue).join('') : '') + ' ' + (e.getAttribute('aria-label') || '') + ' ' + (e.title || '')).join('\n')); const m = t.match(EMO); if (m) bad[name] = m[0]; };
    for (const tab of ['plan', 'money', 'spots', 'docs', 'menu']) { await p.click(`[data-tab=${tab}]`); await p.waitForTimeout(700); await scan(tab); }
    await p.click('[data-tab=docs]'); await p.waitForTimeout(400); await p.click('#dcAdd'); await p.waitForTimeout(400); await scan('doc-dialog'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    await p.click('[data-tab=plan]'); await p.waitForTimeout(500); await p.click('#dockFull'); await p.waitForTimeout(1300); await scan('map-overlay');
    await p.evaluate(() => showCard({ title: 'สถานีรถไฟ Test', lines: ['x'], lat: 43.2, lng: 76.9, name: 'x', how: 'Metro' })); await p.waitForTimeout(300); await scan('map-card'); await p.evaluate(() => hideCard());
    await p.click('#ovFilt'); await p.waitForTimeout(300); await scan('map-sheet'); await p.click('#sfDone');
    const ov = await p.evaluate(() => ({ svg: document.querySelectorAll('#mapOv svg.ic').length, nav: document.querySelectorAll('#tabs svg').length, hid: [...document.querySelectorAll('svg.ic')].every(x => x.getAttribute('aria-hidden') === 'true'), fn: typeof ic === 'function' }));
    check('L2 rendered tabs, dialog and map overlay contain no emoji glyphs', Object.keys(bad).length === 0, JSON.stringify(bad));
    check('L3 icons come from ic(): SVGs in the overlay + nav, all aria-hidden', ov.fn && ov.svg >= 2 && ov.nav === 5 && ov.hid, JSON.stringify(ov));
    await s.b.close();
  }
  /* layouts */
  for (const [w, h] of [[360, 640], [390, 844], [430, 932]]) {
    s = await open({ w, h, init: CLSK }); p = s.p; await login(s, 'Nine'); await docTab(p);
    for (const f of [png1, { name: 'c.png', mimeType: 'image/png', buffer: png(200, 100) }]) { await addDoc(p, { file: f, title: 'เอกสารที่มีชื่อยาวมากๆ สำหรับทดสอบการตัดบรรทัดในมือถือ ' + w }); await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open); await p.waitForTimeout(300); }
    await p.waitForTimeout(600);
    const L = await p.evaluate(() => { const nav = document.querySelector('nav').getBoundingClientRect(), cs = [...document.querySelectorAll('.dcard[data-id]')]; window.scrollTo(0, document.body.scrollHeight); const last = cs[cs.length - 1].getBoundingClientRect(); return { over: document.documentElement.scrollWidth - innerWidth, n: cs.length, under: last.bottom > nav.top + 1 ? last.bottom - nav.top : 0, cardOver: cs.some(c => c.scrollWidth > c.clientWidth + 1), btnH: Math.min(...[...document.querySelectorAll('.dact .btn')].map(b => b.getBoundingClientRect().height)), cls: window.__cls }; });
    check(`K43 ${w}x${h}: no horizontal scroll, 44px+ buttons, nothing under the nav`, L.over <= 1 && L.n === 2 && !L.cardOver && L.btnH >= 44 && L.under <= 1, JSON.stringify(L));
    await s.b.close();
  }




  /* ---------- N. header countdown chip + sheet ---------- */
  console.log('\n[N] countdown chip');
  const chip = () => p.evaluate(() => ({ l: document.getElementById('cdL').textContent, v: document.getElementById('cdV').textContent, c: document.getElementById('btnCd').className, a: document.getElementById('btnCd').getAttribute('aria-label') }));
  for (const [w, h] of [[360, 640], [390, 844], [430, 932]]) {
    s = await open({ w, h, clock: '2026-07-01T10:00:00', init: CLSK, active: 'priv:macau' }); p = s.p; await login(s, 'Nine'); await p.waitForTimeout(500);
    let c = await chip();
    check(`N1 ${w}: upcoming trip -> "อีก 10 วัน", no #btnMe in the header`, c.v === 'อีก 10 วัน' && /up/.test(c.c) && await p.evaluate(() => !document.getElementById('btnMe')), JSON.stringify(c));
    const g = await p.evaluate(() => { const b = document.getElementById('btnCd').getBoundingClientRect(), t = document.getElementById('tripTitle').getBoundingClientRect(); return { bw: b.width, bh: b.height, over: t.right > b.left + 0.5, out: b.right > innerWidth + 0.5 || b.left < 0 }; });
    check(`N2 ${w}: chip fixed 112x44, inside the screen, title does not overlap`, Math.abs(g.bw - 112) < 0.5 && Math.abs(g.bh - 44) < 0.5 && !g.over && !g.out, JSON.stringify(g));
    await p.click('#btnCd'); await p.waitForTimeout(400);
    const sh = await p.evaluate(() => ({ t: document.getElementById('cdSheet').innerText, n: document.querySelectorAll('#cdSheet [data-cdtrip]').length, ids: [...document.querySelectorAll('#cdSheet [data-cdtrip]')].map(x => x.dataset.cdtrip) }));
    check(`N3 ${w}: sheet lists this trip + upcoming trips (soonest first) + name switch`, /นับถอยหลัง/.test(sh.t) && /อีก 10 วัน/.test(sh.t) && sh.n >= 1 && /สลับชื่อ/.test(sh.t), JSON.stringify(sh).slice(0, 300));
    if (w === 390) {
      await p.evaluate(() => { cfg.dates = Object.assign(cfg.dates || {}, { 'priv:xian': { s: '2026-08-01', e: '2026-08-05' }, 'priv:nagoya': { s: '2026-07-20', e: '2026-07-25' } }); document.getElementById('dlg').close(); });
      await p.click('#btnCd'); await p.waitForTimeout(300);
      const ids = await p.evaluate(() => [...document.querySelectorAll('#cdSheet [data-cdtrip]')].map(x => x.dataset.cdtrip));
      check('N4 upcoming trips are sorted soonest first', JSON.stringify(ids) === JSON.stringify(['priv:macau', 'priv:nagoya', 'priv:xian', ALMATY.id]), JSON.stringify(ids));
      await p.click('#cdSheet [data-cdtrip="priv:nagoya"]'); await p.waitForTimeout(2500);
      check('N5 tap on an upcoming trip switches to it and closes the sheet', await p.evaluate(() => cfg.active === 'priv:nagoya' && !document.getElementById('dlg').open));
    }
    check(`N6 ${w}: CLS <= 0.05`, await p.evaluate(() => window.__cls) <= 0.05);
    await s.b.close();
  }
  /* current trip: next stop; tick updates only text */
  s = await open({ clock: '2026-07-12T08:30:00', init: CLSK, active: 'priv:macau' }); p = s.p; await login(s, 'Nine'); await p.waitForTimeout(500);
  let c = await chip();
  check('N7 current trip -> "ถัดไป · 09.00" and "30 น."', /^ถัดไป · 09\.00$/.test(c.l) && c.v === '30 น.' && /cur/.test(c.c), JSON.stringify(c));
  await p.evaluate(() => { document.getElementById('tab-plan').dataset.mark = '1'; window.__cd0 = document.getElementById('btnCd'); });
  const r0 = await p.evaluate(() => JSON.stringify(document.getElementById('btnCd').getBoundingClientRect()) + JSON.stringify(document.getElementById('tripTitle').getBoundingClientRect()));
  await p.clock.runFor(61000); await p.waitForTimeout(100);
  c = await chip();
  check('N8 a 30 s tick updates the text only (30 min -> 29 min after ~1 min), nothing re-rendered, geometry unchanged', c.v === '29 น.' && await p.evaluate(() => document.getElementById('btnCd') === window.__cd0 && document.getElementById('tab-plan').dataset.mark === '1') && r0 === await p.evaluate(() => JSON.stringify(document.getElementById('btnCd').getBoundingClientRect()) + JSON.stringify(document.getElementById('tripTitle').getBoundingClientRect())), JSON.stringify(c));
  check('N8b aria-label carries the full sentence', /ถัดไป 09\.00 อีก 29 น\./.test(c.a), c.a);
  await p.click('#btnCd'); await p.waitForTimeout(400);
  const stx = await p.evaluate(() => document.getElementById('cdSheet').innerText);
  check('N9 sheet (current trip): next stops with time + "อีก", trip day "วันที่ 2 จาก 4"', /จุดถัดไป/.test(stx) && /09\.30|11\.00|09\.00/.test(stx) && /อีก 29 น\./.test(stx) && /วันที่ 2 จาก 4/.test(stx), stx.slice(0, 300));
  /* N9b: a tap spanning the 30 s refresh must not be lost (Close, then who) */
  await p.locator('#cdClose').hover(); await p.mouse.down(); await p.clock.runFor(30500); await p.mouse.up(); await p.waitForTimeout(200);
  check('N9b tap on Close spanning a 30 s refresh still closes the sheet', await p.evaluate(() => !document.getElementById('dlg').open), '');
  await p.click('#btnCd'); await p.waitForTimeout(300);
  await p.locator('#cdWho').hover(); await p.mouse.down(); await p.clock.runFor(30500); await p.mouse.up(); await p.waitForTimeout(300);
  check('N9c tap on #cdWho spanning a refresh opens the picker', await p.evaluate(() => !!document.getElementById('whoList')));
  check('N10 sheet footer switches the traveller name (picker opens)', await p.evaluate(() => !!document.getElementById('whoList')));
  await s.b.close();
  /* past trip */
  s = await open({ clock: '2026-08-20T10:00:00', active: 'priv:macau' }); p = s.p; await login(s, 'Nine'); await p.waitForTimeout(500);
  c = await chip(); check('N11 finished trip -> muted "สิ้นสุดแล้ว"', c.v === 'สิ้นสุดแล้ว' && /end/.test(c.c), JSON.stringify(c));
  await p.click('#btnCd'); await p.waitForTimeout(300);
  check('N12 sheet says "เสร็จสิ้นแล้ว" for the trip', /เสร็จสิ้นแล้ว/.test(await p.evaluate(() => document.getElementById('cdSheet').innerText)));
  await s.b.close();
  /* hidden tab: no tick work */
  s = await open({ clock: '2026-07-12T08:30:00', active: 'priv:macau' }); p = s.p; await login(s, 'Nine'); await p.waitForTimeout(500);
  check('N13 menu still reaches the avatar chooser ("สลับ") and avatars remain in the Menu', await p.evaluate(() => { renderMenu(); return !!document.getElementById('bSwitch') && !!document.querySelector('#tab-menu .mrow .avatar'); }));
  await s.b.close();

  /* ---------- M. profile photos (central; anyone sets / removes anyone's photo) ---------- */
  console.log('\n[M] profile photos');
  for (const [w, h] of [[360, 640], [390, 844], [430, 932]]) {
    s = await open({ w, h, init: CLSK }); p = s.p; await login(s, 'Nine');
    const un = await p.evaluate(() => users().map(u => u.name)), other = un.find(n => n !== 'Nine'); s.flags.users = un.map(n => n.toLowerCase());
    const before = await p.evaluate(() => document.getElementById('btnCd').getBoundingClientRect().width);
    await p.click('[data-tab=menu]'); await p.waitForTimeout(700);
    check(`M1 ${w}: menu members card shows initials first (no photo, no img)`, await p.evaluate(() => document.querySelectorAll('.avatar img').length === 0 && /N/.test(document.querySelector('#tab-menu .mrow[data-n=Nine] .avatar').innerText)));
    const fc = p.waitForEvent('filechooser'); await p.click('#tab-menu .mrow[data-n=Nine] [data-avp]'); (await fc).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(900, 500) }); await p.waitForTimeout(1500);
    const put = s.rpc.filter(r => r.fn === 'avatar_put').pop();
    check(`M2 ${w}: upload is a square JPEG <= 256 px, <= 120k chars, sent to avatar_put for Nine`, !!put && put.a.p_mime === 'image/jpeg' && put.a.p_name === 'Nine' && put.a.p_data.length < 120000 && await p.evaluate(d => new Promise(ok => { const i = new Image(); i.onload = () => ok(i.naturalWidth === 256 && i.naturalHeight === 256); i.src = 'data:image/jpeg;base64,' + d; }), put.a.p_data));
    check(`M3 ${w}: photo appears in the members card (header holds the countdown chip, no avatar)`, await p.evaluate(() => document.querySelectorAll('#btnMe').length === 0 && document.querySelectorAll('#tab-menu .mrow img').length === 1 && document.querySelectorAll('#tab-menu .mrow[data-n=Nine] img').length === 1));
    const fc2 = p.waitForEvent('filechooser'); await p.click(`#tab-menu [data-avp="${other}"]`); (await fc2).setFiles({ name: 'o.png', mimeType: 'image/png', buffer: png(300, 600) }); await p.waitForTimeout(1500);
    check(`M4 ${w}: anyone can set ANOTHER traveller's photo (central), request targets that name`, s.rpc.filter(r => r.fn === 'avatar_put').pop().a.p_name === other && !!s.avs[other.toLowerCase()]);
    await p.click('[data-tab=money]'); await p.waitForTimeout(500);
    await p.evaluate(() => { data.expenses = [{ item: 'x', cat: 'x', amount: 10, cur: 'THB', payer: 'Nine', type: 'personal', with: [] }]; renderMoney(); });
    check(`M5 ${w}: money rows show the photo`, await p.evaluate(() => document.querySelectorAll('#tab-money .avatar img').length >= 1));
    await p.evaluate(() => travellerPicker()); await p.waitForTimeout(400);
    check(`M6 ${w}: chooser shows photos + per-traveller actions`, await p.evaluate(() => document.querySelectorAll('#whoList .avatar img').length >= 1 && document.querySelectorAll('#avList [data-avp]').length >= 2));
    await p.click('#dlg button[value=x]'); await p.waitForTimeout(200);
    s.docs.push({ id: '00000000-0000-4000-8000-0000000000aa', scope: 'person', owner: other.toLowerCase(), trip: '', title: 'Synthetic doc', kind: 'other', mime: 'image/png', size_bytes: 3, note: '', created_by: other.toLowerCase(), created_at: new Date().toISOString(), chunks: 1, chunkData: ['QUJD'] });
    await p.click('[data-tab=docs]'); await p.waitForTimeout(1500);
    check(`M7 ${w}: docs person groups show the photo`, await p.evaluate(() => { dc.seg = 'all'; renderDocs(); return true; }) && await p.evaluate(() => document.querySelectorAll('#tab-docs .dgh .avatar img, #tab-docs .avatar img').length >= 1));
    check(`M8 ${w}: photo cached in localStorage <= 300 KB and CLS <= 0.05, chip box fixed`, await p.evaluate(() => (localStorage.getItem('tt.av') || '').length) > 100 && await p.evaluate(() => localStorage.getItem('tt.av').length <= 300000) && await p.evaluate(() => window.__cls) <= 0.05 && Math.abs(before - await p.evaluate(() => document.getElementById('btnCd').getBoundingClientRect().width)) < 0.5);
    await p.reload(); await p.waitForTimeout(1500);
    check(`M9 ${w}: photo is there right after a reload (cache)`, await p.evaluate(() => document.querySelectorAll('#tab-menu .mrow[data-n=Nine] img').length === 1));
    if (w === 390) {
      await p.click('[data-tab=menu]'); await p.waitForTimeout(600);
      await p.click('#tab-menu .mrow[data-n=Nine] [data-avd]'); await p.waitForTimeout(1000);
      check('M10 remove returns to initials (menu + server + cache)', await p.evaluate(() => document.querySelectorAll('#tab-menu .mrow[data-n=Nine] img').length === 0 && /N/.test(document.querySelector('#tab-menu .mrow[data-n=Nine] .avatar').innerText) && !JSON.parse(localStorage.getItem('tt.av') || '{}').nine) && !s.avs.nine && !!s.avs[other.toLowerCase()]);
      await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
      const cr = await p.evaluate(() => { const a = document.querySelector('#tab-menu .row .avatar'), c = getComputedStyle(a); return { fg: c.color, bg: c.backgroundColor }; });
      check('M11 dark mode: initials stay white on the coloured circle', cr.fg === 'rgb(255, 255, 255)' && cr.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(cr));
      await p.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    }
    await s.b.close();
  }
  s = await open(); p = s.p; s.flags.noAvSql = true; await login(s, 'Nine');
  await p.click('[data-tab=menu]'); await p.waitForTimeout(700);
  check('M12 SQL not applied: initials only, app fine', await p.evaluate(() => document.querySelectorAll('.avatar img').length === 0 && document.querySelectorAll('#tab-menu .mrow[data-n=Nine] .avatar').length === 1));
  const fc3 = p.waitForEvent('filechooser'); await p.click('#tab-menu .mrow[data-n=Nine] [data-avp]'); (await fc3).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(300, 300) }); await p.waitForTimeout(1500);
  check('M13 SQL not applied: trying to upload shows a Thai hint about supabase_avatars.sql', /supabase_avatars\.sql/.test(await p.evaluate(() => document.getElementById('toast').innerText)));
  await s.b.close();
  s = await open(); p = s.p; s.flags.users = ['nine']; await login(s, 'Nine');
  await p.click('[data-tab=menu]'); await p.waitForTimeout(600);
  const un2 = await p.evaluate(() => users().map(u => u.name)), stranger = un2.find(n => !['nine', 'mew'].includes(n.toLowerCase()));
  const avBad = await p.evaluate(async n => { try { return await sbRpc('avatar_put', { p_name: n, p_hash: 'open', p_mime: 'image/jpeg', p_data: 'QUJD' }); } catch (e) { return String(e); } }, stranger);
  check('M14 unknown target is refused (-1) and nothing is stored', Number(avBad) === -1 && !s.avs[stranger.toLowerCase()]);
  await s.b.close();

  finish();
})();
