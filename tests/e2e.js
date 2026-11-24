/* End-to-end system check (Playwright). Run via `bash tests/run.sh`. Real Supabase for public reads; private/write RPCs mocked with synthetic data. */
const { open, login, check, finish, FAKE } = require('./lib');

(async () => {
  /* ---------- A. public data (real Supabase) ---------- */
  console.log('\n[A] public data load');
  let s = await open(), p = s.p;
  check('A1 login screen shown', await p.evaluate(() => !document.getElementById('login').hidden));
  check('A2 members listed', await p.evaluate(() => document.querySelectorAll('#loginUsers [data-u]').length) >= 2);
  check('A3 Almaty plan loaded (>= 1 day)', await p.evaluate(() => data.plan && data.plan.days.length) >= 1);
  check('A4 data comes from Supabase, not the Google Sheet', s.reqs.includes('SB') && !s.reqs.includes('SHEET'));
  check('A5 PIN hashes are not exposed in public Users rows', await p.evaluate(() => users().every(u => !u.pin)));
  await s.b.close();

  /* ---------- B. login / PIN ---------- */
  console.log('\n[B] login & PIN');
  s = await open({ goodHash: '__nobody__' }); p = s.p;
  const names = await p.evaluate(() => [...document.querySelectorAll('#loginUsers [data-u]')].map(x => x.dataset.u));
  const withPin = 'Nine', fresh = names.find(n => n !== withPin);
  await p.click(`#loginUsers [data-u=${withPin}]`); await p.waitForTimeout(250);
  check('B1 name with a PIN asks for it', /ใส่ PIN/.test(await p.innerText('#loginPin')));
  for (const k of '9999') await p.click(`#loginPin [data-k="${k}"]`); await p.waitForTimeout(700);
  check('B2 wrong PIN rejected', /ไม่ถูกต้อง/.test(await p.innerText('#loginPin')) && !(await p.evaluate(() => me)));
  await p.click('#loginPin [data-a=back]'); await p.waitForTimeout(200);
  await p.click(`#loginUsers [data-u=${fresh}]`); await p.waitForTimeout(250);
  check('B3 name without a PIN offers to create one', /ตั้ง PIN/.test(await p.innerText('#loginPin')));
  for (const k of '1234') await p.click(`#loginPin [data-k="${k}"]`); await p.waitForTimeout(250);
  for (const k of '4321') await p.click(`#loginPin [data-k="${k}"]`); await p.waitForTimeout(600);
  check('B4 mismatching confirmation refused', /ไม่ตรงกัน/.test(await p.innerText('#loginPin')));
  for (const k of '1234') await p.click(`#loginPin [data-k="${k}"]`); await p.waitForTimeout(250);
  for (const k of '1234') await p.click(`#loginPin [data-k="${k}"]`); await p.waitForTimeout(1800);
  check('B5 PIN created -> signed in', await p.evaluate(() => me) === fresh);
  check('B6 PIN stored server-side as a SHA-256 hash', s.rpc.some(r => r.fn === 'set_first_pin' && /^[0-9a-f]{64}$/.test(r.a.p_hash)));
  check('B7 session hash only in sessionStorage', await p.evaluate(() => !!sessionStorage.getItem('tt.ph') && !localStorage.getItem('tt.ph') && !JSON.stringify(cfg).includes(sessionStorage.getItem('tt.ph'))));
  await s.b.close();

  /* ---------- C. trips ---------- */
  console.log('\n[C] trips, status, access');
  s = await open(); p = s.p; await login(s, 'Mew'); const keys = Object.keys(FAKE);
  check('C1 signed-in member sees all trips', await p.evaluate(() => visibleTrips().length) === 1 + keys.length);
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
  check('C8 logged out: private trip is never requested, falls back to the public trip', await p.evaluate(() => trip().priv) === undefined && !s.rpc.some(r => r.fn === 'get_private'));
  await s.b.close();

  /* ---------- D. plan editing (deterministic synthetic trip) ---------- */
  console.log('\n[D] plan view & editing');
  s = await open(); p = s.p; await login(s, 'Nine');
  await p.evaluate(() => switchTrip('priv:macau')); await p.waitForTimeout(2300);
  check('D1 day bar has one pill per day', await p.evaluate(() => document.querySelectorAll('#homeDays .pill[data-day]').length) === FAKE.macau.days);
  check('D2 cards show travel + stay durations', await p.evaluate(() => /เดินทาง 30 นาที/.test(document.getElementById('tl').innerText) && /อยู่ที่นั่น 1 ชม\. 30 น\./.test(document.getElementById('tl').innerText)));
  await p.click('#editBtn'); await p.waitForTimeout(400);
  check('D3 private trip: edit mode needs no edit code (PIN session)', await p.evaluate(() => ui.edit));
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
  s = await open({ editCode: 'bad' }); p = s.p; await login(s, 'Nine');
  await p.evaluate(() => { ui.day = 0; ui.edit = true; renderPlan(); stepDialog(0); }); await p.waitForTimeout(300);
  await p.fill('[name=note]', 'x'); await p.click('#dlg button[value=ok]'); await p.waitForTimeout(2500);
  check('D11 public trip: wrong edit code -> refused with a message, code forgotten', await p.evaluate(() => !cfg.editCode) && /ไม่ถูกต้อง|ไม่สำเร็จ/.test(await p.evaluate(() => document.getElementById('toast').innerText + document.getElementById('tripSub').innerText)));
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
  s = await open({ editCode: 'good' }); p = s.p; await login(s, 'Nine');
  await p.click('[data-tab=spots]'); await p.waitForTimeout(700);
  check('F1 places tab renders segments', await p.evaluate(() => document.querySelectorAll('#tab-spots .seg button').length) >= 2);
  await p.evaluate(() => { ui.spotView = 'tips'; renderSpots(); }); await p.waitForTimeout(300);
  check('F2 tips: food items link to Maps / TikTok / Facebook', await p.evaluate(() => { const l = [...document.querySelectorAll('#tab-spots a')].map(a => a.href); return l.some(x => /google\.com\/maps/.test(x)) && l.some(x => /tiktok\.com\/search/.test(x)) && l.some(x => /facebook\.com\/search/.test(x)); }));
  await p.click('[data-tab=map]'); await p.waitForTimeout(1300);
  check('F3 map renders', await p.evaluate(() => !!document.querySelector('.leaflet-container')));
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
    for (const t of ['plan', 'money', 'spots', 'map', 'menu']) { await p.click(`[data-tab=${t}]`); await p.waitForTimeout(500); const o = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (o > 1) bad.push(t + '+' + o); }
    check(`H1 ${w}x${h}: no horizontal scroll on any tab`, !bad.length, bad.join());
    await p.click('[data-tab=plan]'); await p.waitForTimeout(400);
    const m = await p.evaluate(async () => {
      const rect = () => { const d = document.getElementById('homeDock').getBoundingClientRect(), n = document.querySelector('nav').getBoundingClientRect(); return { dockBottom: d.bottom, navTop: n.top }; };
      window.scrollTo(0, 600); await new Promise(r => setTimeout(r, 450)); const down = rect(), away = document.getElementById('homeDock').classList.contains('away');
      window.scrollTo(0, 450); await new Promise(r => setTimeout(r, 450)); const peek = document.getElementById('homeDock').classList.contains('peek');
      window.scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 450));
      const st = [...document.querySelectorAll('#tl .step')], l = st[st.length - 1].getBoundingClientRect(), n = document.querySelector('nav').getBoundingClientRect();
      return { away, peek, hiddenAbove: down.dockBottom <= 0, lastClear: l.bottom <= n.top + 1 };
    });
    check(`H2 ${w}x${h}: map slides away on scroll down, only the day bar returns on scroll up`, m.away && m.hiddenAbove && m.peek, JSON.stringify(m));
    check(`H3 ${w}x${h}: last card not covered by the bottom bar`, m.lastClear);
    await s.b.close();
  }
  finish();
})();
