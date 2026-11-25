/* End-to-end system check (Playwright). Run via `bash tests/run.sh`. Real Supabase for public reads; private/write RPCs mocked with synthetic data. */
const { open, login, check, finish, FAKE, ALMATY } = require('./lib');

(async () => {
  /* ---------- A. public data (real Supabase) ---------- */
  console.log('\n[A] public data load');
  let s = await open(), p = s.p;
  check('A1 fresh load opens straight to the plan: no login overlay, no PIN pad', await p.evaluate(() => !document.getElementById('login') && !document.querySelector('.pinpad, #loginPin, #loginUsers') && !document.getElementById('app').hidden && !!document.querySelector('#tl .step')));
  await p.click('[data-tab=menu]'); await p.waitForTimeout(400); await p.click('#bSwitch'); await p.waitForTimeout(300);
  check('A2 traveller list (names only) opens from the Menu profile card', await p.evaluate(() => document.querySelectorAll('#whoList [data-u]').length) >= 2);
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
  check('B6 picking Mew on a private trip works', await p.evaluate(() => me === 'Mew' && document.querySelector('#tab-menu .profile .avatar').textContent.trim() === 'M'));
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
  check('F1 places tab renders segments', await p.evaluate(() => document.querySelectorAll('#tab-spots .seg button').length) >= 2);
  await p.evaluate(() => { ui.spotView = 'tips'; renderSpots(); }); await p.waitForTimeout(300);
  check('F2 tips: food items link to Maps / TikTok / Facebook', await p.evaluate(() => { const l = [...document.querySelectorAll('#tab-spots a')].map(a => a.href); return l.some(x => /google\.com\/maps/.test(x)) && l.some(x => /tiktok\.com\/search/.test(x)) && l.some(x => /facebook\.com\/search/.test(x)); }));
  await p.click('[data-tab=plan]'); await p.waitForTimeout(500); await p.click('#dockFull'); await p.waitForTimeout(1300);
  check('F3 full-screen map overlay renders the map', await p.evaluate(() => !document.getElementById('mapOv').hidden && !!document.querySelector('#mapOv .leaflet-container')));
  await p.click('#ovClose'); await p.waitForTimeout(300);
  await p.click('[data-tab=menu]'); await p.waitForTimeout(1000);
  const menu = await p.innerText('#tab-menu');
  check('F4 menu: trips, usage card (X / 500 MB), edit card', /ทริป/.test(menu) && /\/ 500 MB/.test(menu) && /แก้ไขทริป/.test(menu));
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
  check('J4 Map tab is gone: no #tab-map, nav = แผน · เงิน · สถานที่ · เอกสาร · เมนู', await p.evaluate(() => !document.getElementById('tab-map') && typeof renderMap === 'undefined' && [...document.querySelectorAll('#tabs button')].map(b => b.textContent.trim()).join('·') === 'แผน·เงิน·สถานที่·เอกสาร·เมนู'));
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
  await p.evaluate(() => { window.scrollTo(0, 700); window.__n = { draw: 0, all: 0, plan: 0 }; for (const k of ['drawMap', 'renderAll', 'renderPlan']) { const o = window[k], key = { drawMap: 'draw', renderAll: 'all', renderPlan: 'plan' }[k]; window[k] = (...a) => { window.__n[key]++; return o(...a); }; } for (const id of ['tl', 'homeDock', 'map']) document.getElementById(id).__keep = 1; });
  await p.waitForTimeout(500); const y0 = await p.evaluate(() => scrollY);
  await p.evaluate(() => load()); await p.waitForTimeout(800);
  const same = await p.evaluate(() => ({ keep: ['tl', 'homeDock', 'map'].every(id => document.getElementById(id).__keep === 1), n: window.__n, y: scrollY }));
  check('J6 identical refresh: #tl / #homeDock / #map nodes kept, no drawMap/renderAll/renderPlan, scroll untouched', same.keep && !same.n.draw && !same.n.all && !same.n.plan && Math.abs(same.y - y0) <= 1, JSON.stringify(same) + ' y0=' + y0);
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
  await p.click('#peekMap'); await p.waitForTimeout(1000);
  const bk = await p.evaluate(() => ({ y: scrollY, mapTop: document.getElementById('homeDock').getBoundingClientRect().top, hdr: document.querySelector('.top').getBoundingClientRect().bottom }));
  check('J13b "แผนที่" button scrolls the map back into view', bk.mapTop >= bk.hdr - 2 && bk.mapTop < bk.hdr + 40, JSON.stringify(bk));
  await p.evaluate(() => window.scrollTo(0, 800)); await p.waitForTimeout(200);
  await p.evaluate(() => { const st = data.plan.days[ui.day].steps; let k = st.findIndex(s => wpMark[ui.day + '|' + qName(s.to || s.from || '')]);
    window.__real = k >= 0; if (k < 0) { k = 0; wpMark[ui.day + '|' + qName(st[0].to || st[0].from || '')] = L.marker([22.19, 113.54]).bindPopup('x').addTo(map); } window.__k = k; focusStep(k); }); await p.waitForTimeout(1000);
  const fs = await p.evaluate(() => ({ mapTop: document.getElementById('homeDock').getBoundingClientRect().top, hdr: document.querySelector('.top').getBoundingClientRect().bottom, one: document.querySelectorAll('.leaflet-container').length, real: window.__real, active: ui.activeStep === window.__k && !!document.querySelector('#tab-plan .step.active'), popup: !!document.querySelector('.leaflet-popup') }));
  check('J13c focusStep (off-screen map) scrolls it into view, marks the step active, opens the popup; one Leaflet instance', fs.mapTop > -5 && fs.mapTop < 300 && fs.one === 1 && fs.active && fs.popup, JSON.stringify(fs));
  await p.evaluate(() => window.scrollTo(0, 175)); await p.waitForTimeout(300);
  const zt = await p.evaluate(() => { const h = document.querySelector('.top').getBoundingClientRect(), pts = [[20, h.bottom - 5], [innerWidth - 25, h.bottom - 5], [innerWidth / 2, h.bottom - 5], [innerWidth - 25, 30]]; return { mb: Math.round(document.querySelector('.dock-map').getBoundingClientRect().bottom), hb: Math.round(h.bottom), bad: pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return e && !e.closest('.top'); }).length }; });
  check('J13e map partly under the header: header (not Leaflet controls) is topmost', zt.bad === 0, JSON.stringify(zt));
  const dc = await p.evaluate(async () => { const w = ms => new Promise(r => setTimeout(r, ms)); window.scrollTo(0, 500); await w(200); let cls = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) cls += e.value; })).observe({ type: 'layout-shift', buffered: false });
    document.querySelectorAll('#homeDays .pill[data-day]')[1].click(); await w(900); const bar = document.getElementById('homeDays').getBoundingClientRect(), st = document.querySelector('#tl .step'), hd = document.querySelector('.dayh').getBoundingClientRect();
    return { cls, barTop: Math.round(bar.top - document.querySelector('.top').getBoundingClientRect().bottom), headClear: hd.top >= bar.bottom - 1 || scrollY < 5, stepVis: !st || st.getBoundingClientRect().bottom > bar.bottom }; });
  check('J13d day change: day bar stays pinned, heading not covered, CLS <= 0.05', Math.abs(dc.barTop) <= 1 && dc.headClear && dc.cls <= 0.05, JSON.stringify(dc));
  await s.b.close();
  s = await open({ reducedMotion: 'reduce' }); p = s.p; await login(s, 'Nine');
  check('J14 prefers-reduced-motion: no dock/day-bar transition, smooth scroll off', await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('homeDock')).transitionDuration) === 0 && parseFloat(getComputedStyle(document.getElementById('homeDays')).transitionDuration) === 0 && matchMedia('(prefers-reduced-motion: reduce)').matches));
  await s.b.close();

  /* full-screen map overlay */
  s = await open(); p = s.p; await login(s, 'Nine'); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__m = map; }); const m0 = await p.evaluate(() => ({ c: map.getCenter(), z: map.getZoom() }));
  await p.click('#dockFull'); await p.waitForTimeout(900);
  const o1 = await p.evaluate(() => { const r = document.getElementById('bAsk'), cl = document.getElementById('ovClose').getBoundingClientRect(); return { vis: !document.getElementById('mapOv').hidden, one: document.querySelectorAll('.leaflet-container').length, inOv: !!document.querySelector('#ovHolder #map'), same: window.__m === map, chips: [...document.querySelectorAll('#ovFilters [data-f]')].map(b => b.textContent.replace(/[^\u0E00-\u0E7Fa-z]/gi, '')), closeTR: cl.right > innerWidth - 70 && cl.top < 90, loc: !!document.getElementById('ovLoc'), c: map.getCenter(), z: map.getZoom() }; });
  check('J15 overlay opens: one Leaflet instance moved in, ✕ top-right, ⟲, filter chips เส้นทาง/ร้านอาหาร/ที่เที่ยว/อื่นๆ/เพื่อน', o1.vis && o1.one === 1 && o1.inOv && o1.same && o1.closeTR && o1.loc && o1.chips.join('|').replace(/[0-9]/g, '') === 'เส้นทาง|ร้านอาหาร|ที่เที่ยว|อื่นๆ|เพื่อน', JSON.stringify(o1));
  check('J16 opening does not re-fit or jump the map', Math.abs(o1.c.lat - m0.c.lat) < 0.002 && Math.abs(o1.c.lng - m0.c.lng) < 0.002 && o1.z === m0.z, JSON.stringify({ m0, c: o1.c, z: o1.z }));
  const f0 = await p.evaluate(() => ui.f.food); await p.click('#ovFilters [data-f=food]'); await p.waitForTimeout(200);
  check('J17 filter chip toggles the layer + its state', await p.evaluate(f => ui.f.food === !f && document.querySelector('#ovFilters [data-f=food]').classList.contains('on') === !f, f0));
  await p.click('#ovFilters [data-f=food]');
  await p.evaluate(() => { geo.state = 'denied'; renderMapStatus(); }); const askD = await p.evaluate(() => /ขอสิทธิ์ตำแหน่ง/.test(document.getElementById('ovStatus').innerText));
  await p.evaluate(() => { geo.state = 'ok'; data.me = { lat: 43.25, lng: 76.95, acc: 12, at: new Date() }; renderMapStatus(); }); const askO = await p.evaluate(() => !!document.getElementById('bAsk'));
  await p.evaluate(() => { geo.state = 'idle'; data.me = null; renderMapStatus(); });
  check('J18 location status: "ขอสิทธิ์ตำแหน่ง" only when permission is needed', askD && !askO);
  await p.click('#ovClose'); await p.waitForTimeout(700);
  const o2 = await p.evaluate(() => ({ hidden: document.getElementById('mapOv').hidden, home: !!document.querySelector('#homeMapHolder #map'), one: document.querySelectorAll('.leaflet-container').length, same: window.__m === map, c: map.getCenter(), z: map.getZoom() }));
  check('J19 ✕ closes: map back in the dock, same instance, same view', o2.hidden && o2.home && o2.one === 1 && o2.same && Math.abs(o2.c.lat - m0.c.lat) < 0.002 && o2.z === m0.z, JSON.stringify(o2));
  await p.click('#dockFull'); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  const esc1 = await p.evaluate(() => document.getElementById('mapOv').hidden);
  await p.click('#dockFull'); await p.waitForTimeout(500); await p.goBack(); await p.waitForTimeout(500);
  check('J20 Esc and browser Back both close the overlay', esc1 && await p.evaluate(() => document.getElementById('mapOv').hidden && !!document.querySelector('#homeMapHolder #map')));
  await s.b.close();

  /* nav with 4 (and 5) evenly spaced items */
  s = await open(); p = s.p; await login(s, 'Nine');
  const nv = await p.evaluate(() => { const r = [...document.querySelectorAll('#tabs button')].map(b => b.getBoundingClientRect()); return { n: r.length, labels: [...document.querySelectorAll('#tabs span')].map(x => x.textContent).join('|'), w: Math.max(...r.map(x => x.width)) - Math.min(...r.map(x => x.width)), gap: Math.max(...r.slice(1).map((x, i) => x.left - r[i].right)) - Math.min(...r.slice(1).map((x, i) => x.left - r[i].right)), h: Math.min(...r.map(x => x.height)), over: document.documentElement.scrollWidth - innerWidth }; });
  check('J21 nav: 5 evenly spaced items (แผน|เงิน|สถานที่|เอกสาร|เมนู) >= 44 px tall, no horizontal overflow', nv.n === 5 && nv.labels === 'แผน|เงิน|สถานที่|เอกสาร|เมนู' && nv.w < 1 && nv.gap < 1 && nv.h >= 44 && nv.over <= 1, JSON.stringify(nv));
  await s.b.close();

  /* home top compaction */
  for (const [w, h] of [[390, 844], [360, 640]]) {
    s = await open({ w, h }); p = s.p; await login(s, 'Nine'); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(600);
    const g = await p.evaluate(() => { const nav = document.querySelector('nav').getBoundingClientRect().top, st = document.querySelector('#tl .step'), hd = document.querySelector('.dayh h2').getBoundingClientRect(), dk = document.getElementById('homeDays').getBoundingClientRect(), mp = document.querySelector('.dock-map').getBoundingClientRect(); return { nav, stepBottom: st ? st.getBoundingClientRect().bottom : null, headTop: hd.top, headBottom: hd.bottom, dockBottom: dk.bottom, map: mp.height, nx: !!document.getElementById('cd'), stayOpen: !document.getElementById('stayPn') || document.getElementById('stayPn').hidden === false }; });
    if (w === 390) check('J22 390x844: first step card fully above the bottom nav at scroll 0; map ~23 dvh; stay collapsed', g.stepBottom != null && g.stepBottom <= g.nav && g.map < 844 * 0.25 && g.map >= 120 && !g.stayOpen, JSON.stringify(g));
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
  const addDoc = async (p, { scope, owner, kind, title, file }) => {
    await p.click('#dcAdd'); await p.waitForSelector('#dfForm'); if (scope) await p.click(`[data-sc=${scope}]`); if (owner) await p.click(`[data-w="${owner}"]`); if (kind) await p.click(`[data-k=${kind}]`);
    if (title) await p.fill('#dfTitle', title); await p.setInputFiles('#dfFile', file); await p.waitForFunction(() => !document.getElementById('dfOk').disabled || document.getElementById('dfErr').textContent, null, { timeout: 8000 });
  };
  const seg = p => p.evaluate(() => [...document.querySelectorAll('#dcSeg button')].map(b => b.textContent.trim()));
  const off = async (s, v) => { s.flags.offline = v; await s.ctx.setOffline(v); };
  const png1 = { name: 'scan.png', mimeType: 'image/png', buffer: png(2400, 1000) };
  const docTab = async p => { await p.click('[data-tab=docs]'); await p.waitForTimeout(900); };

  /* K1-K2: signed out / guest sees the panel and no RPC is called */
  s = await open(); p = s.p; await p.evaluate(() => { pick = ''; syncMe(); renderDocs(); });
  await docTab(p);
  check('K1 no name chosen yet: "เลือกชื่อของคุณเพื่อดูเอกสาร" panel, no doc_* RPC, no login wording', /เลือกชื่อของคุณเพื่อดูเอกสาร/.test(await p.innerText('#tab-docs')) && !/PIN/.test(await p.innerText('#tab-docs')) && !s.rpc.some(r => r.fn.startsWith('doc_')));
  await p.click('#dcPick'); await p.waitForTimeout(300); await p.click('#whoList [data-u=Nine]'); await p.waitForTimeout(1500);
  check('K1b picking a name from that panel loads the documents', await p.evaluate(() => me === 'Nine' && dc.status === 'ok') && s.rpc.some(r => r.fn === 'doc_list'));
  await s.b.close();

  /* K2-K: main flow */
  s = await open({ init: CLSK }); p = s.p; await login(s, 'Nine');
  await p.evaluate(() => { window.__cls = 0; });
  await docTab(p);
  const cls0 = await p.evaluate(() => window.__cls);
  check('K2 tab opens with CLS <= 0.05', cls0 <= 0.05, String(cls0));
  check('K3 segments with counts: ของฉัน (0) | ส่วนกลาง (0) | เพื่อน (0) and a friendly empty state', (await seg(p)).join('|') === 'ของฉัน (0)|ส่วนกลาง (0)|เพื่อน (0)' && /ยังไม่มีเอกสารของคุณ/.test(await p.innerText('#tab-docs')), (await seg(p)).join('|'));
  await addDoc(p, { file: png1 });
  const pv = await p.innerText('#dfPrev');
  check('K4 image is downscaled client-side to <= 1800 px (2400x1000 -> 1800x750) and previewed', /1800×750/.test(pv) && await p.evaluate(() => !!document.querySelector('#dfPrev img')), pv);
  await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(500);
  const put = s.rpc.find(r => r.fn === 'doc_put');
  check('K5 uploaded as JPEG chunks (<= 300k chars each), personal scope, title auto-filled', !!put && put.a.p_mime === 'image/jpeg' && put.a.p_scope === 'person' && put.a.p_title === 'พาสปอร์ต' && put.a.p_chunks.every(c => c.length <= 300000) && put.a.p_chunks[0].startsWith('/9j/'), put && JSON.stringify({ m: put.a.p_mime, sc: put.a.p_scope, t: put.a.p_title }));
  check('K6 new document appears in the list, counts update, group-visible note shown', (await seg(p)).join('|') === 'ของฉัน (1)|ส่วนกลาง (0)|เพื่อน (0)' && /เห็นทั้งกลุ่ม/ && !/เห็นเฉพาะคุณ/.test(await p.innerText('#tab-docs')) && await p.evaluate(() => document.querySelectorAll('.dcard[data-id]').length) === 1);
  /* a PDF as a shared doc + a second personal image */
  await addDoc(p, { scope: 'shared', kind: 'hotel', file: { name: 'voucher.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF') } });
  await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(500);
  check('K7 shared document: segment switches to ส่วนกลาง (1), "ทุกคนในทริปเห็น"', (await seg(p)).join('|') === 'ของฉัน (1)|ส่วนกลาง (1)|เพื่อน (0)' && /ทุกคนในทริปเห็น/.test(await p.innerText('#tab-docs')), (await seg(p)).join('|'));
  await p.click('[data-seg=me]'); await addDoc(p, { kind: 'ticket', file: { name: 'b.png', mimeType: 'image/png', buffer: png(300, 200) } });
  await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(500);
  check('K8 two personal docs listed', (await seg(p))[0] === 'ของฉัน (2)');
  /* lazy thumbnail: reserved box, picture arrives without moving the card */
  const th = await p.evaluate(async () => { const c = document.querySelector('.dcard[data-id]'), t = c.querySelector('.dthumb'); const h0 = c.getBoundingClientRect().height; await new Promise(r => setTimeout(r, 800)); return { img: !!t.querySelector('img'), h0, h1: c.getBoundingClientRect().height, box: t.getBoundingClientRect().height }; });
  check('K9 thumbnail loads lazily into a fixed 84 px box (card height unchanged)', th.img && th.box === 84 && th.h0 === th.h1, JSON.stringify(th));
  /* viewer */
  await p.click('[data-show]'); await p.waitForSelector('#dvImg', { timeout: 5000 });
  const v0 = await p.evaluate(() => ({ open: dv.open, title: document.getElementById('dvTitle').textContent, owner: document.getElementById('dvOwner').textContent, bg: getComputedStyle(document.getElementById('docOv')).backgroundColor, lock: document.documentElement.classList.contains('noscroll'), i: dv.i, n: dv.list.length }));
  check('K10 viewer: full-screen white, owner + title, page scroll locked', v0.open && v0.bg === 'rgb(255, 255, 255)' && v0.title && v0.owner === 'Nine' && v0.lock && v0.n === 2, JSON.stringify(v0));
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
  check('K14 next / arrow-key prev move within the group and reset zoom + rotation', i1.i === i0 + 1 && i1.r === 0 && i1.s === 1 && (await p.evaluate(() => dv.i)) === i0, JSON.stringify({ i0, i1 }));
  check('K15 wake lock hint shown when the browser has no Wake Lock (headless)', await p.evaluate(() => !!navigator.wakeLock) || await p.evaluate(() => !document.getElementById('dvHint').hidden));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check('K16 Esc closes the viewer and unlocks page scroll', await p.evaluate(() => !dv.open && document.getElementById('docOv').hidden && !document.documentElement.classList.contains('noscroll')));
  await p.click('[data-show]'); await p.waitForSelector('#dvImg'); await p.goBack(); await p.waitForTimeout(300);
  check('K17 browser Back closes the viewer', await p.evaluate(() => !dv.open));
  /* PDF viewer */
  await p.click('[data-seg=shared]'); await p.click('[data-show]'); await p.waitForSelector('#dvPdf', { timeout: 5000 });
  await p.evaluate(() => { window.__op = null; window.open = u => { window.__op = u; }; }); await p.click('#dvPdf'); const pu = await p.evaluate(() => window.__op);
  check('K18 PDF: "เปิด PDF" opens the blob in a new tab', /^blob:/.test(pu || ''), pu);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.click('[data-seg=me]'); await p.waitForTimeout(200);
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
  check('K22 delete asks for confirmation, then removes the document', s.docs.length === nBefore - 1 && /\(1\)/.test((await seg(p))[0]), (await seg(p))[0]);
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
  check('K31 another member sees the first member\'s personal docs under เพื่อน (1) and shared (1)', mine.join('|') === 'ของฉัน (0)|ส่วนกลาง (1)|เพื่อน (1)', mine.join('|'));
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
  check('K32b scope choice downloads only what was chosen (mine: 0 files, default: +shared 1, all: +friends 1)', g1 - g0 === 0 && g2 - g1 === 1 && g3 - g2 === 1, [g0, g1, g2, g3].join(','));
  await p.click('[data-seg=friends]'); await p.waitForTimeout(500);
  const fg = await p.evaluate(() => ({ grp: document.querySelectorAll('.dgh').length, hdr: document.querySelector('.dgh').innerText, av: !!document.querySelector('.dgh .avatar'), cards: document.querySelectorAll('.dcard[data-id]').length, txt: document.getElementById('tab-docs').innerText }));
  check('K33 เพื่อน segment: one group per member (avatar + name + count), single group opens by itself, card says "ของ Nine"', fg.grp === 1 && /Nine/.test(fg.hdr) && /1 รายการ/.test(fg.hdr) && fg.av && fg.cards === 1 && /ของ Nine/.test(fg.txt), JSON.stringify(fg));
  await p.click('[data-show]'); await p.waitForSelector('#dvImg', { timeout: 5000 });
  check('K33a viewer works on another member\'s doc and names the owner at the top', await p.evaluate(() => dv.open && document.getElementById('dvOwner').textContent === 'Nine' && !!document.getElementById('dvImg')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('[data-more]'); await p.waitForSelector('[data-a=save]');
  check('K33b non-owner non-uploader: menu has save but NO rename/delete (hidden, not disabled)', await p.evaluate(() => !document.querySelector('[data-a=del]') && !document.querySelector('[data-a=ren]'))); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.click('[data-seg=shared]'); await p.click('[data-more]'); await p.waitForSelector('[data-a=save]');
  check('K33c non-creator sees no rename/delete on a shared document', await p.evaluate(() => !document.querySelector('[data-a=del]') && !document.querySelector('[data-a=ren]'))); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  /* add for someone else */
  await p.click('[data-seg=friends]'); await addDoc(p, { scope: 'other', owner: 'Nine', title: 'For Nine', file: { name: 'o.png', mimeType: 'image/png', buffer: png(300, 200) } });
  const wp0 = await p.evaluate(() => ({ who: !document.getElementById('dfWho').hidden, n: document.querySelectorAll('#dfWho [data-w]').length, names: [...document.querySelectorAll('#dfWho [data-w]')].map(b => b.dataset.w), av: document.querySelectorAll('#dfWho .avatar').length }));
  check('K34 add sheet: third chip "ของคนอื่น" shows a member picker with every member except me', wp0.who && wp0.n === unames.length - 1 && !wp0.names.includes('Mew') && wp0.av === wp0.n, JSON.stringify(wp0));
  await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(500);
  const pu2 = s.rpc.filter(r => r.fn === 'doc_put').pop(), nd = s.docs.find(d => d.title === 'For Nine');
  check('K35 saved with p_owner, owner=nine, created_by=mew, scope person; toast "เพิ่มเอกสารให้ Nine แล้ว"; shows under Nine in เพื่อน', pu2.a.p_owner === 'Nine' && pu2.a.p_scope === 'person' && nd && nd.owner === 'nine' && nd.created_by === 'mew' && /เพิ่มเอกสารให้ Nine แล้ว/.test(await p.innerText('#toast')) && (await seg(p))[2] === 'เพื่อน (2)' && /For Nine/.test(await p.innerText('#tab-docs')) && /เพิ่มโดย Mew/.test(await p.innerText('#tab-docs')), JSON.stringify(pu2.a.p_owner) + JSON.stringify(nd));
  await p.click('.dcard[data-id]:has-text("For Nine") [data-more]'); await p.waitForSelector('[data-a=save]');
  check('K36 the uploader (Mew) sees rename + delete on a doc she added for Nine', await p.evaluate(() => !!document.querySelector('[data-a=del]') && !!document.querySelector('[data-a=ren]'))); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  /* a second friend -> two collapsed/expanded groups, toggle keeps layout stable */
  if (third) {
    await addDoc(p, { scope: 'other', owner: third, title: 'For third', file: { name: 'o2.png', mimeType: 'image/png', buffer: png(300, 200) } }); await p.click('#dfOk'); await p.waitForFunction(() => !document.getElementById('dlg').open, null, { timeout: 8000 }); await p.waitForTimeout(500);
    const g2x = await p.evaluate(() => [...document.querySelectorAll('.dgh')].map(b => ({ n: b.querySelector('b').textContent, open: b.getAttribute('aria-expanded') })));
    await p.click('.dgh >> nth=0'); await p.waitForTimeout(200);
    const g2y = await p.evaluate(() => ({ ex: [...document.querySelectorAll('.dgh')].map(b => b.getAttribute('aria-expanded')), cards: document.querySelectorAll('.dcard[data-id]').length }));
    await p.click('.dgh >> nth=0'); await p.waitForTimeout(200);
    check('K37 two friends -> two groups (both open after adding); header collapses / expands its cards', g2x.length === 2 && g2x.every(x => x.open === 'true') && g2y.ex[0] === 'false' && g2y.ex[1] === 'true' && g2y.cards < 3 && await p.evaluate(() => document.querySelectorAll('.dcard[data-id]').length) === 3, JSON.stringify([g2x, g2y]));
  }
  await p.evaluate(() => travellerPicker()); await p.waitForTimeout(500);
  await login(s, 'Nine'); await p.waitForTimeout(500); await p.click('[data-tab=docs]'); await p.waitForTimeout(1200);
  const nsg = await seg(p); await p.click('[data-seg=me]'); await p.waitForTimeout(300);
  const forMe = await p.evaluate(() => { const c = [...document.querySelectorAll('.dcard[data-id]')].find(x => /For Nine/.test(x.innerText)); return c && { t: c.innerText, more: !!c.querySelector('[data-more]') }; });
  check('K38 the owner (Nine) sees the doc Mew added: "เพิ่มโดย Mew" and "เห็นทั้งกลุ่ม"', nsg[0] === 'ของฉัน (2)' && forMe && /เพิ่มโดย Mew/.test(forMe.t) && /เห็นทั้งกลุ่ม/.test(forMe.t), nsg.join('|') + JSON.stringify(forMe));
  await p.click('.dcard[data-id]:has-text("For Nine") [data-more]'); await p.waitForSelector('[data-a=ren]'); await p.click('[data-a=ren]'); await p.fill('#rnT', 'For Nine ok'); await p.click('#rnOk'); await p.waitForTimeout(600);
  check('K39 the owner may rename a doc someone else uploaded for them', s.docs.some(d => d.title === 'For Nine ok'));
  s.flags.users = ['nine']; await p.evaluate(() => { dc.seg = 'friends'; }); await addDoc(p, { scope: 'other', owner: unames.find(n => n !== 'Nine'), file: png1 }); await p.click('#dfOk'); await p.waitForTimeout(800);
  check('K39a unknown owner (server -6) shows a clear Thai message', /ไม่พบสมาชิก/.test(await p.innerText('#dfErr'))); await p.click('#dfX'); await p.waitForTimeout(200); s.flags.users = null;
  await p.evaluate(() => travellerPicker()); await p.waitForTimeout(500); await login(s, 'Mew'); await p.waitForTimeout(500); await p.click('[data-tab=docs]'); await p.waitForTimeout(1200);
  /* the server does not know this name (null) -> message, stay put; transient errors -> retry panel */
  s.flags.nullDocs = true; await p.evaluate(() => docsRefresh(true)); await p.waitForTimeout(1500);
  check('K40 doc_list null (name unknown to the server): Thai message, name kept, no sign-out screen', await p.evaluate(() => !!me && !document.getElementById('login') && /ไม่รู้จักชื่อนี้/.test(document.getElementById('toast').textContent)));
  await s.b.close();
  s = await open(); p = s.p; await login(s, 'Nine'); await off(s, true); await docTab(p);
  check('K35 network error with nothing cached: inline retry, name kept', await p.evaluate(() => !!me && !!document.getElementById('dcRetry') && !document.getElementById('app').hidden));
  await off(s, false); await p.click('#dcRetry'); await p.waitForTimeout(1500);
  check('K36 retry succeeds once the network is back', await p.evaluate(() => !!document.getElementById('dcSeg')));
  await s.b.close();
  /* SQL not applied */
  s = await open(); p = s.p; s.flags.noDocsSql = true; await login(s, 'Nine'); await docTab(p);
  check('K37 SQL not applied: friendly "ยังไม่เปิดใช้งาน" message, no raw error, other tabs fine', /ฟีเจอร์เอกสารยังไม่เปิดใช้งาน — ผู้ดูแลต้องรัน docs\/supabase_docs\.sql/.test(await p.innerText('#tab-docs')) && !/Could not find/.test(await p.innerText('#tab-docs')) && await p.evaluate(() => document.getElementById('error').hidden));
  await p.click('[data-tab=money]'); await p.waitForTimeout(300);
  check('K38 other tabs still work when docs are not enabled', await p.evaluate(() => !document.getElementById('tab-money').hidden && document.getElementById('tab-money').innerText.length > 20));
  await s.b.close();
  /* quick info + taxi screen */
  s = await open(); p = s.p; await login(s, 'Nine'); await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2300); await docTab(p);
  check('K39 info card hidden when there is no stay / Info data', await p.evaluate(() => !document.getElementById('infoCard')));
  s.trips.macau.Stay = [['Key', 'Value'], ['name', 'Test Hotel'], ['address', '1 Test Road, Sample City'], ['lat', '22.19'], ['lng', '113.54']]; s.trips.macau.Info = [['Key', 'Value'], ['Police', '999'], ['Wi-Fi', 'guest1234']];
  await p.evaluate(() => load()); await p.waitForTimeout(2000);
  const ic = await p.evaluate(() => { const c = document.getElementById('infoCard'); return c && { t: c.innerText, open: !document.getElementById('infBody').hidden, copies: c.querySelectorAll('[data-icp]').length, nav: !!c.querySelector('a[href*="google.com/maps"]'), addr: parseFloat(getComputedStyle(c.querySelector('.inf-addr')).fontSize) }; });
  check('K40 info card: stay name + address (large), copy / navigate / taxi, Info rows with copy buttons, open by default', ic && /Test Hotel/.test(ic.t) && /1 Test Road/.test(ic.t) && /999/.test(ic.t) && ic.open && ic.copies === 2 && ic.nav && ic.addr >= 16 && /โชว์ให้คนขับแท็กซี่/.test(ic.t), JSON.stringify(ic));
  await p.click('#infTgl'); check('K41 info card collapses', await p.evaluate(() => document.getElementById('infBody').hidden)); await p.click('#infTgl');
  await p.click('#infTaxi'); await p.waitForTimeout(300);
  const tx = await p.evaluate(() => ({ open: dv.open, t: document.getElementById('docOv').innerText, fs: parseFloat(getComputedStyle(document.querySelector('.tx-a')).fontSize) }));
  check('K42 taxi screen: full-screen big-text address', tx.open && /Test Hotel/.test(tx.t) && /1 Test Road/.test(tx.t) && tx.fs >= 24, JSON.stringify(tx)); await p.keyboard.press('Escape');
  await s.b.close();
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
  check('N13 menu still reaches the avatar chooser ("สลับ") and avatars remain in the Menu', await p.evaluate(() => { renderMenu(); return !!document.getElementById('bSwitch') && !!document.querySelector('#tab-menu .profile .avatar'); }));
  await s.b.close();

  /* ---------- M. profile photos (central; anyone sets / removes anyone's photo) ---------- */
  console.log('\n[M] profile photos');
  for (const [w, h] of [[360, 640], [390, 844], [430, 932]]) {
    s = await open({ w, h, init: CLSK }); p = s.p; await login(s, 'Nine');
    const un = await p.evaluate(() => users().map(u => u.name)), other = un.find(n => n !== 'Nine'); s.flags.users = un.map(n => n.toLowerCase());
    const before = await p.evaluate(() => document.getElementById('btnCd').getBoundingClientRect().width);
    await p.click('[data-tab=menu]'); await p.waitForTimeout(700);
    check(`M1 ${w}: menu profile shows initials first (no photo, no img)`, await p.evaluate(() => document.querySelectorAll('.avatar img').length === 0 && /N/.test(document.querySelector('#tab-menu .profile .avatar').innerText)));
    const fc = p.waitForEvent('filechooser'); await p.click('#tab-menu .profile [data-avp]'); (await fc).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(900, 500) }); await p.waitForTimeout(1500);
    const put = s.rpc.filter(r => r.fn === 'avatar_put').pop();
    check(`M2 ${w}: upload is a square JPEG <= 256 px, <= 120k chars, sent to avatar_put for Nine`, !!put && put.a.p_mime === 'image/jpeg' && put.a.p_name === 'Nine' && put.a.p_data.length < 120000 && await p.evaluate(d => new Promise(ok => { const i = new Image(); i.onload = () => ok(i.naturalWidth === 256 && i.naturalHeight === 256); i.src = 'data:image/jpeg;base64,' + d; }), put.a.p_data));
    check(`M3 ${w}: photo appears in the Menu profile + members card (header holds the countdown chip, no avatar)`, await p.evaluate(() => document.querySelectorAll('#btnMe').length === 0 && document.querySelectorAll('#tab-menu .profile img').length === 1 && document.querySelectorAll('#tab-menu .row img').length === 1));
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
    check(`M7 ${w}: docs friend groups show the photo`, await p.evaluate(() => { dc.seg = 'friends'; renderDocs(); return true; }) && await p.evaluate(() => document.querySelectorAll('#tab-docs .dgh .avatar img, #tab-docs .avatar img').length >= 1));
    check(`M8 ${w}: photo cached in localStorage <= 300 KB and CLS <= 0.05, chip box fixed`, await p.evaluate(() => (localStorage.getItem('tt.av') || '').length) > 100 && await p.evaluate(() => localStorage.getItem('tt.av').length <= 300000) && await p.evaluate(() => window.__cls) <= 0.05 && Math.abs(before - await p.evaluate(() => document.getElementById('btnCd').getBoundingClientRect().width)) < 0.5);
    await p.reload(); await p.waitForTimeout(1500);
    check(`M9 ${w}: photo is there right after a reload (cache)`, await p.evaluate(() => document.querySelectorAll('#tab-menu .profile img').length === 1));
    if (w === 390) {
      await p.click('[data-tab=menu]'); await p.waitForTimeout(600);
      await p.click('#tab-menu .profile [data-avd]'); await p.waitForTimeout(1000);
      check('M10 remove returns to initials (menu + server + cache)', await p.evaluate(() => document.querySelectorAll('#tab-menu .profile img').length === 0 && /N/.test(document.querySelector('#tab-menu .profile .avatar').innerText) && !JSON.parse(localStorage.getItem('tt.av') || '{}').nine) && !s.avs.nine && !!s.avs[other.toLowerCase()]);
      await p.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
      const cr = await p.evaluate(() => { const a = document.querySelector('#tab-menu .row .avatar'), c = getComputedStyle(a); return { fg: c.color, bg: c.backgroundColor }; });
      check('M11 dark mode: initials stay white on the coloured circle', cr.fg === 'rgb(255, 255, 255)' && cr.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(cr));
      await p.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    }
    await s.b.close();
  }
  s = await open(); p = s.p; s.flags.noAvSql = true; await login(s, 'Nine');
  await p.click('[data-tab=menu]'); await p.waitForTimeout(700);
  check('M12 SQL not applied: initials only, app fine', await p.evaluate(() => document.querySelectorAll('.avatar img').length === 0 && document.querySelectorAll('#tab-menu .profile .avatar').length === 1));
  const fc3 = p.waitForEvent('filechooser'); await p.click('#tab-menu .profile [data-avp]'); (await fc3).setFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(300, 300) }); await p.waitForTimeout(1500);
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
