/* Design-system checks (Playwright): accessibility + layout rules of the redesigned UI. Run via `bash tests/run.sh` (or alone: BASE_URL=http://localhost:8123/ node tests/design.js). Synthetic data only. */
const { open, settle, check, finish } = require('./lib');
const fs = require('fs'), path = require('path');
const CSS = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

const tabs = ['plan', 'money', 'spots', 'docs', 'menu'];
const rows = (h, a) => [h, ...a];
async function seed(s) {          // a trip that shows every part of the UI: stay, quick info, expenses, a locked day, documents
  const T = s.trips.macau, p = s.p;
  T.Stay = rows(['Key', 'Value'], [['name', 'Test Hotel'], ['address', '1 Test Road'], ['checkin', '15.00'], ['booking', 'ABC123'], ['chat', 'https://example.com/chat']]);
  T.Info = rows(['Key', 'Value'], [['Emergency', '999']]);
  T.Expenses = rows(['Date', 'Item', 'Category', 'Amount', 'Currency', 'PaidBy', 'Type', 'SplitWith'], [['12 ก.ค.', 'ข้าวเย็น', 'อาหาร', '420', 'MOP', 'Nine', 'shared', ''], ['12 ก.ค.', 'แท็กซี่', 'เดินทาง', '95', 'MOP', 'Mew', 'shared', ''], ['11 ก.ค.', 'ค่าห้อง', 'ที่พัก', '697', 'USD', '', '', '']]);
  const lab = await p.evaluate(() => data.plan.days[2].label);
  T.Locks = rows(['Day', 'Locked', 'By', 'Time'], [[lab, '1', '', '2026-07-01T10:00:00Z']]);
  s.docs.push({ id: '00000000-0000-4000-8000-0000000000aa', scope: 'person', owner: 'nine', trip: '', title: 'Synthetic doc', kind: 'other', mime: 'image/png', size_bytes: 3, note: '', created_by: 'nine', created_at: new Date().toISOString(), chunks: 1, chunkData: ['QUJD'] });
  await p.evaluate(() => load()); await p.waitForTimeout(2200);
}
const go = async (p, t) => { await p.click(`[data-tab=${t}]`); await p.waitForTimeout(800); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(150); };

/* ---- in-page probes (serialised into the page) ---- */
const PROBE = {
  overflow: () => {
    const W = innerWidth, bad = [];
    const scrolls = e => { for (let n = e; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if ((o === 'auto' || o === 'scroll') && n !== document.documentElement) return true; if (n.classList && n.classList.contains('leaflet-container')) return true; } return false; };
    document.querySelectorAll('body *').forEach(e => { const r = e.getBoundingClientRect(); if (!r.width || !r.height) return; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') return; if (e.closest('[hidden],#mapOv,#docOv,.toast')) return; if ((r.right > W + 1 || r.left < -1) && !scrolls(e.parentElement || e)) bad.push((e.id || e.className || e.tagName).toString().slice(0, 30) + ':' + Math.round(r.left) + '-' + Math.round(r.right)); });
    return { sw: document.documentElement.scrollWidth - W, bad: bad.slice(0, 5) };
  },
  iconButtons: () => {
    const out = [];
    document.querySelectorAll('button, a[href], [role=button]').forEach(e => {
      const r = e.getBoundingClientRect(), cs = getComputedStyle(e); if (!r.width || !r.height || cs.visibility === 'hidden' || e.closest('[hidden]')) return;
      if ((e.innerText || '').trim()) return;          // has a visible text label -> not icon-only
      out.push({ n: (e.id || e.className || e.tagName).toString().slice(0, 28), label: !!(e.getAttribute('aria-label') || '').trim(), w: Math.round(r.width), h: Math.round(r.height) });
    });
    return out;
  },
  fonts: () => {
    const out = []; document.querySelectorAll('body *').forEach(e => {
      if (e.closest('.leaflet-container,[hidden],.dov') || getComputedStyle(e).visibility === 'hidden') return;
      const own = [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()); if (!own) return;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
      out.push({ n: (e.id || e.className || e.tagName).toString().slice(0, 28), fs: parseFloat(getComputedStyle(e).fontSize) });
    }); return out;
  },
  contrast: () => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
    const rgba = v => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = v; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
    const over = (f, b) => { const a = f[3]; return [f[0] * a + b[0] * (1 - a), f[1] * a + b[1] * (1 - a), f[2] * a + b[2] * (1 - a), 1]; };
    const lum = c => { const f = x => { x /= 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
    const bgOf = e => {          // list of possible opaque backgrounds (gradients -> every stop)
      let layers = []; for (let n = e; n; n = n.parentElement) {
        const cs = getComputedStyle(n), bi = cs.backgroundImage;
        if (bi && bi.includes('gradient')) { const st = bi.match(/(rgba?\([^)]*\)|color\([^)]*\))/g) || []; layers.push({ g: st.map(rgba) }); break; }
        const c = rgba(cs.backgroundColor); if (c[3] > 0) { layers.push({ c }); if (c[3] >= .999) break; }
      }
      let bases = [rgba(getComputedStyle(document.body).backgroundColor)]; if (bases[0][3] < 1) bases = [[255, 255, 255, 1]];
      for (const l of layers.reverse()) bases = l.g ? l.g.map(g => over(g, bases[0])) : bases.map(b => over(l.c, b));
      return bases;
    };
    const worst = [];
    document.querySelectorAll('body *').forEach(e => {
      if (e.closest('.leaflet-container,[hidden],.dov,#docOv')) return;
      const own = [...e.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()); if (!own) return;
      const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
      const cs = getComputedStyle(e); if (cs.visibility === 'hidden') return;
      for (let n = e; n; n = n.parentElement) { if (parseFloat(getComputedStyle(n).opacity) < 1 || n.disabled || n.getAttribute('aria-disabled') === 'true') return; }          // disabled / faded things are muted on purpose
      const fg = rgba(cs.color), fs = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700, large = fs >= 24 || (fs >= 18.66 && bold), min = large ? 3 : 4.5;
      let low = 99; for (const b of bgOf(e)) low = Math.min(low, ratio(over(fg, b), b));
      if (low < min) worst.push({ n: (e.id || e.className || e.tagName).toString().slice(0, 30), t: e.innerText.trim().slice(0, 18), r: +low.toFixed(2) });
    });
    return worst.slice(0, 8);
  }
};

(async () => {
  /* ---------- tokens + static rules ---------- */
  console.log('\n[Q] design system');
  const tok = ['--pri', '--bg', '--card', '--ink', '--mut', '--ok', '--warn', '--bad', '--s1', '--s2', '--s3', '--s4', '--s5', '--t1', '--t2', '--t3', '--t4', '--t5', '--r-s', '--r-l', '--e1', '--e2', '--nav', '--tap'];
  check('Q1 tokens on :root (accent, surfaces, semantic colours, 4/8 spacing, 5 type steps, 2 radii, 2 elevations)', tok.every(t => new RegExp('(^|[;{\\s])' + t + ':').test(CSS)), tok.filter(t => !new RegExp('(^|[;{\\s])' + t + ':').test(CSS)).join(','));
  check('Q2 dark theme overrides the surfaces and the accent text colour', /:root\[data-theme=dark\]\{[^}]*--bg:[^}]*--card:[^}]*--ink:[^}]*--priInk:/.test(CSS));
  const px = [...CSS.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => +m[1]);
  check('Q3 no font-size below 13px in style.css (12px floor, 13px for secondary)', px.every(v => v >= 13), px.filter(v => v < 13).join(','));
  const lay = [...CSS.matchAll(/(?:^|[;{\s])transition:\s*([^;}]*)/g)].map(m => m[1]).filter(v => /\b(width|height|margin|padding|top|left|right|bottom|all)\b/.test(v) && !/^width \.2s$/.test(v.trim()));
  check('Q4 transitions never animate layout properties (only transform / opacity / colours; the progress bar width is the one exception)', lay.length === 0, lay.join(' | '));
  check('Q5 reduced motion switches animations + transitions off', /prefers-reduced-motion:reduce\)\{\*,\*::before,\*::after\{animation:none!important;transition:none!important/.test(CSS));
  check('Q6 focus-visible ring + pressed states exist for buttons, chips, pills, rows', /:focus-visible\{outline:2px/.test(CSS) && /\.btn:active/.test(CSS) && /\.tag:active/.test(CSS) && /\.li:active/.test(CSS));

  /* ---------- per width ---------- */
  for (const [w, h] of [[360, 640], [390, 844], [430, 932]]) {
    const s = await open({ w, h, clock: '2026-07-12T10:30:00', active: 'priv:macau' }), p = s.p; await settle(s); await seed(s);
    const res = {};
    for (const t of tabs) {
      await go(p, t);
      res[t] = { ov: await p.evaluate(PROBE.overflow), ic: await p.evaluate(PROBE.iconButtons) };
    }
    check(`Q7 ${w}: no horizontal scroll and nothing wider than the viewport on any tab`, tabs.every(t => res[t].ov.sw <= 1 && !res[t].ov.bad.length), JSON.stringify(tabs.map(t => [t, res[t].ov])).slice(0, 400));
    const ic = tabs.flatMap(t => res[t].ic.map(x => ({ ...x, t })));
    check(`Q8 ${w}: every icon-only button/link has an aria-label and a >= 44 px target (${ic.length} checked)`, ic.length >= 8 && ic.every(x => x.label && x.w >= 43.5 && x.h >= 43.5), JSON.stringify(ic.filter(x => !x.label || x.w < 43.5 || x.h < 43.5)).slice(0, 400));
    /* plan edit mode + a dialog + the map overlay: same rule */
    await go(p, 'plan'); await p.click('#editBtn'); await p.waitForTimeout(500);
    const e1 = await p.evaluate(PROBE.iconButtons), e2 = await p.evaluate(PROBE.overflow);
    await p.click('#editDone'); await p.waitForTimeout(300);
    await p.click('#stayBtn'); await p.waitForTimeout(400); const e3 = await p.evaluate(PROBE.iconButtons), e4 = await p.evaluate(PROBE.overflow); await p.evaluate(() => document.getElementById('dlg').close());
    await p.click('#dockFull'); await p.waitForTimeout(1200); const e5 = await p.evaluate(PROBE.iconButtons); await p.click('#ovClose'); await p.waitForTimeout(300);
    check(`Q9 ${w}: edit mode, stay sheet and map overlay: icon-only buttons labelled + >= 44 px, no overflow`, [...e1, ...e3, ...e5].every(x => x.label && x.w >= 43.5 && x.h >= 43.5) && e2.sw <= 1 && e4.sw <= 1, JSON.stringify([...e1, ...e3, ...e5].filter(x => !x.label || x.w < 43.5 || x.h < 43.5)).slice(0, 300));
    if (h === 640) {          // the shortest screen: the primary action of every tab is visible without scrolling
      const vis = {};
      for (const [t, sel] of [['plan', '#editBtn'], ['money', '#addExp'], ['spots', '#linkGo'], ['docs', '#dcAdd'], ['menu', '#tab-menu .card']]) {
        await go(p, t);
        vis[t] = await p.evaluate(q => { const e = document.querySelector(q); if (!e) return 'missing'; const r = e.getBoundingClientRect(), top = document.querySelector('.top').getBoundingClientRect().bottom, nav = document.querySelector('nav').getBoundingClientRect().top; return r.top >= top - 1 && r.bottom <= nav + 1 && scrollY === 0 ? 'ok' : `y ${Math.round(r.top)}-${Math.round(r.bottom)} (top ${Math.round(top)}, nav ${Math.round(nav)})`; }, sel);
      }
      check(`Q10 ${w}x${h}: primary action visible on every tab without scrolling (plan edit, money add, places add box, documents add, menu first card)`, Object.values(vis).every(v => v === 'ok'), JSON.stringify(vis));
      await go(p, 'plan');
      const first = await p.evaluate(() => { const st = document.querySelector('#tl .step').getBoundingClientRect(), nav = document.querySelector('nav').getBoundingClientRect().top; return st.top < nav - 40; });
      check(`Q11 ${w}x${h}: the first plan step starts above the bottom nav (chrome above it is slim)`, first);
    }
    /* nav */
    await go(p, 'money');
    const nv = await p.evaluate(() => { const b = [...document.querySelectorAll('#tabs button')], on = b.filter(x => x.classList.contains('on')); return { n: b.length, minH: Math.min(...b.map(x => x.getBoundingClientRect().height)), minW: Math.min(...b.map(x => x.getBoundingClientRect().width)), on: on.length, fill: on[0] && getComputedStyle(on[0].querySelector('svg')).fill, off: getComputedStyle(b[0].querySelector('svg')).fill, label: on[0] && parseFloat(getComputedStyle(on[0].querySelector('span')).fontSize), lab2: b.every(x => x.querySelector('span').innerText.trim()) }; });
    check(`Q12 ${w}: bottom nav = 5 tabs, >= 44 px high, active tab has a filled icon + label (and the others do not)`, nv.n === 5 && nv.minH >= 44 && nv.minW >= 60 && nv.on === 1 && nv.fill !== 'none' && nv.off === 'none' && nv.label >= 13 && nv.lab2, JSON.stringify(nv));
    /* toast does not cover the nav; sheets have a grabber */
    await p.evaluate(() => toast('ทดสอบ toast', 4000)); await p.waitForTimeout(250);
    const ts = await p.evaluate(() => { const t = document.getElementById('toast').getBoundingClientRect(), n = document.querySelector('nav').getBoundingClientRect(); return { gap: Math.round(n.top - t.bottom), left: Math.round(t.left), right: Math.round(innerWidth - t.right) }; });
    check(`Q13 ${w}: toast sits above the nav (no overlap) and inside the screen`, ts.gap >= 0 && ts.left >= 0 && ts.right >= 0, JSON.stringify(ts));
    const gb = await p.evaluate(() => { openDlg('<h3>x</h3>'); const c = getComputedStyle(document.getElementById('dlg'), '::before'); const o = { w: c.width, h: c.height, r: getComputedStyle(document.getElementById('dlg')).borderTopLeftRadius }; document.getElementById('dlg').close(); return o; });
    check(`Q14 ${w}: bottom sheets show a grabber handle and a large top radius`, gb.w === '40px' && gb.h === '4px' && parseFloat(gb.r) >= 20, JSON.stringify(gb));
    await s.b.close();
  }

  /* ---------- light + dark at 390: text size, contrast, scale ---------- */
  for (const theme of ['light', 'dark']) {
    const s = await open({ w: 390, h: 844, clock: '2026-07-12T10:30:00', active: 'priv:macau' }), p = s.p; await settle(s); await seed(s);
    if (theme === 'dark') await p.evaluate(() => { cfg.theme = 'dark'; saveCfg(); applyTheme(); });
    const fonts = [], low = [];
    const sweep = async name => { fonts.push(...(await p.evaluate(PROBE.fonts)).map(x => ({ ...x, name }))); low.push(...(await p.evaluate(PROBE.contrast)).map(x => ({ ...x, name }))); };
    for (const t of tabs) { await go(p, t); await sweep(t); }
    await go(p, 'plan'); await p.click('#editBtn'); await p.waitForTimeout(400); await sweep('plan-edit'); await p.click('#editDone'); await p.waitForTimeout(300);
    await p.click('#stayBtn'); await p.waitForTimeout(400); await sweep('stay-sheet'); await p.evaluate(() => document.getElementById('dlg').close());
    await p.click('#btnCd'); await p.waitForTimeout(400); await sweep('countdown'); await p.evaluate(() => document.getElementById('dlg').close());
    await go(p, 'money'); await p.click('#addExp'); await p.waitForTimeout(400); await sweep('expense-form'); await p.evaluate(() => document.getElementById('dlg').close());
    await go(p, 'docs'); await p.click('#dcAdd'); await p.waitForTimeout(400); await sweep('doc-form'); await p.evaluate(() => document.getElementById('dlg').close());
    const small = fonts.filter(x => x.fs < 12), mid = fonts.filter(x => x.fs < 13), sizes = [...new Set(fonts.map(x => x.fs))].sort((a, b) => a - b);
    check(`Q15 ${theme}: no text smaller than 12 px on any screen / sheet (${fonts.length} text nodes)`, small.length === 0, JSON.stringify(small.slice(0, 5)));
    check(`Q16 ${theme}: secondary text is >= 13 px`, mid.length === 0, JSON.stringify(mid.slice(0, 5)));
    check(`Q17 ${theme}: font sizes come from the 5-step scale (+16 px form fields): ${sizes.join('/')}`, sizes.every(v => [13, 15, 16, 17, 21, 28].includes(v)), sizes.join(','));
    check(`Q18 ${theme}: text contrast >= 4.5:1 (3:1 for large text) on every screen / sheet`, low.length === 0, JSON.stringify(low.slice(0, 6)));
    if (theme === 'light') {
      /* affordance: tappable rows have a chevron, filters differ from static tags, static info is not button-styled, focus ring */
      await go(p, 'menu');
      const af = await p.evaluate(() => { const li = document.querySelector('#tab-menu .li'), ch = li && getComputedStyle(li, '::after').content, sw = document.querySelector('#bTheme'), sr = sw && sw.getBoundingClientRect(), chip = [...document.querySelectorAll('#tab-menu .chip')].find(c => !c.closest('button,a')); return { li: ch, swH: sr && Math.round(sr.height), chipRadius: chip && getComputedStyle(chip).borderRadius, tagRadius: getComputedStyle(document.querySelector('#tab-menu .tag')).borderRadius, chipCursor: chip && getComputedStyle(chip).cursor }; });
      check('Q19 tappable trip rows show a trailing chevron; switches are >= 44 px; filter chips are pills while static chips are small rounded labels', af.li && af.li !== 'none' && af.li !== 'normal' && af.swH >= 44 && parseFloat(af.tagRadius) > parseFloat(af.chipRadius) && af.chipCursor !== 'pointer', JSON.stringify(af));
      await p.keyboard.press('Tab'); await p.keyboard.press('Tab');
      const fr = await p.evaluate(() => { const a = document.activeElement, cs = getComputedStyle(a); return { tag: a.tagName, st: cs.outlineStyle, w: parseFloat(cs.outlineWidth) }; });
      check('Q20 keyboard focus shows a visible ring (focus-visible)', fr.st !== 'none' && fr.w >= 2, JSON.stringify(fr));
      await go(p, 'plan');
      const hero = await p.evaluate(() => { const g = [...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).backgroundImage.includes('gradient') && e.getBoundingClientRect().height && !e.closest('[hidden]')).map(e => (e.id || e.className).toString()); return g; });
      check('Q21 gradients only on the plan-day hero (next-stop card): no other element on the plan screen uses one', hero.every(x => /(^|\s)cd(\s|$)/.test(x)) && hero.length <= 1, JSON.stringify(hero));
      const lock = await p.evaluate(() => { const b = document.getElementById('lockBtn'), e = document.getElementById('editBtn'); return { l: b.getBoundingClientRect().height, e: e.getBoundingClientRect().height, lt: b.innerText.trim(), et: e.innerText.trim() }; });
      check('Q22 day actions: lock + edit are labelled text buttons >= 44 px (not bare icons)', lock.l >= 44 && lock.e >= 44 && lock.lt && lock.et, JSON.stringify(lock));
    }
    await s.b.close();
  }
  finish();
})();
