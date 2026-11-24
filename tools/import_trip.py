#!/usr/bin/env python3
"""Import a trip from an Excel file into Supabase `private_rows` (data + pictures).

Dry-run by default (parses and prints a report, writes JSON to ./private/). Add --write to push to the database.
The Supabase *secret* key is read ONLY from the environment variable SB_SECRET_KEY (never from a file, never commit it).

Examples
  python3 tools/import_trip.py --xlsx private/macao.xlsx --key macau --name "Macau Trip" \
      --map "Macau=plan,ค่าเสียหาย=Cost"                       # dry run
  SB_SECRET_KEY=... python3 tools/import_trip.py --xlsx private/macao.xlsx --key macau --name "Macau Trip" \
      --map "Macau=plan,ค่าเสียหาย=Cost" --media --members --write

--map  "<sheet title>=<app tab>,..."   the main plan sheet MUST map to `plan`; `Cost` = the cost table; any other name becomes an extra table.
Keep the .xlsx and the generated private/ folder OUT of git (they are in .gitignore).
"""
import argparse, base64, datetime, hashlib, io, json, os, re, sys, urllib.parse, urllib.request

TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
SB_URL = os.environ.get('SB_URL', 'https://vqelnacauxxprredxjda.supabase.co') + '/rest/v1'
MAXW, CHUNK = 1000, 150_000


def cell(v):
    """Excel value -> the text the app stores (dates carry the year; times are HH.MM; numbers have no trailing .0)."""
    if v is None: return ''
    if isinstance(v, datetime.datetime):
        return f"{v.day}-{TH_M[v.month - 1]} {v.year}" if (v.hour, v.minute) == (0, 0) else f"{v.hour:02d}.{v.minute:02d}"
    if isinstance(v, datetime.time): return f"{v.hour:02d}.{v.minute:02d}"
    if isinstance(v, float): return str(int(v)) if v == int(v) else repr(round(v, 4))
    return v.replace('\r', '').strip() if isinstance(v, str) else str(v)


def read_rows(ws):
    rows = []
    for r in ws.iter_rows():
        c = []
        for x in r:
            t = cell(x.value)
            if x.hyperlink is not None and x.hyperlink.target and x.hyperlink.target not in t:
                t = (t + ' ' + x.hyperlink.target).strip()          # keep links Excel hid behind the text
            c.append(t)
        while c and c[-1] == '': c.pop()
        rows.append(c)
    while rows and not rows[-1]: rows.pop()
    return rows


def read_media(ws, key, tab):
    from PIL import Image
    idx, data = [], {}
    for im in getattr(ws, '_images', []):
        a = im.anchor._from; row, col = a.row + 1, a.col + 1; raw = im._data()
        iid = f"{key}-{hashlib.sha1(raw + tab.encode() + bytes([row % 256, col % 256])).hexdigest()[:10]}"
        txt = [str(c.value).strip() for c in ws[row] if c.value not in (None, '')]
        cap = re.sub(r'\s+', ' ', re.sub(r'\d{4}-\d{2}-\d{2} 00:00:00 · ?', '', ' · '.join(txt))).strip()[:80]
        if not cap:
            for r in range(row - 1, max(0, row - 40), -1):
                t = [str(c.value).strip() for c in ws[r][:3] if c.value not in (None, '')]
                if t: cap = re.sub(r'\s+', ' ', ' · '.join(t)).strip()[:80]; break
        img = Image.open(io.BytesIO(raw))
        if img.mode in ('RGBA', 'LA', 'P'):
            bg = Image.new('RGB', img.size, (255, 255, 255)); img = img.convert('RGBA'); bg.paste(img, mask=img.split()[-1]); img = bg
        else: img = img.convert('RGB')
        if max(img.size) > MAXW:
            k = MAXW / max(img.size); img = img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)
        buf = io.BytesIO(); img.save(buf, 'JPEG', quality=72, optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode(); chunks = [b64[i:i + CHUNK] for i in range(0, len(b64), CHUNK)]
        data['media:' + iid] = chunks
        idx.append([iid, tab, str(row), str(col), cap, 'image/jpeg', str(img.width), str(img.height), str(len(chunks))])
    return idx, data


def api(method, path, key, body=None, extra=None, rng=None):
    h = {'apikey': key, 'Content-Type': 'application/json'}; h.update(extra or {})
    if rng: h['Range'] = rng
    req = urllib.request.Request(SB_URL + path, data=None if body is None else json.dumps(body).encode(), headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r: return r.status, r.read().decode()
    except urllib.error.HTTPError as e: return e.code, e.read().decode()[:300]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--xlsx', required=True); ap.add_argument('--key', required=True, help='short trip key, e.g. macau (also used in app.js PRIV_TRIPS)')
    ap.add_argument('--name', default=''); ap.add_argument('--map', required=True); ap.add_argument('--media', action='store_true')
    ap.add_argument('--members', action='store_true', help='also grant every member listed in the public Users tab (needed only if docs/supabase_trips_v2.sql is not applied)')
    ap.add_argument('--write', action='store_true'); ap.add_argument('--out', default='private')
    a = ap.parse_args()
    import openpyxl
    wb = openpyxl.load_workbook(a.xlsx, data_only=True)
    mapping = dict(x.split('=', 1) for x in a.map.split(','))
    if 'plan' not in mapping.values(): sys.exit('--map must map one sheet to "plan"')
    tabs, media_idx, media_data = {}, [['id', 'tab', 'row', 'col', 'caption', 'mime', 'w', 'h', 'chunks']], {}
    for title, tab in mapping.items():
        if title not in wb.sheetnames: sys.exit(f'sheet {title!r} not in workbook: {wb.sheetnames}')
        tabs[tab] = read_rows(wb[title]); print(f'  {title!r} -> {tab}: {len(tabs[tab])} rows')
        if a.media:
            i, d = read_media(wb[title], a.key, tab); media_idx += i; media_data.update(d)
    skipped = [t for t in wb.sheetnames if t not in mapping]
    if skipped: print('  NOT imported (not in --map):', skipped)
    # date range for app.js PRIV_TRIPS (start/end drive the Current / Upcoming / Past badge)
    ym = {m: i + 1 for i, m in enumerate(TH_M)}; ds = []
    for r in tabs['plan'][1:]:
        m = re.match(r'(\d{1,2})-(\S+) (\d{4})', r[0] if r else '')
        if m and m.group(2) in ym: ds.append(datetime.date(int(m.group(3)), ym[m.group(2)], int(m.group(1))))
    if ds: print(f"  trip dates: {min(ds)} .. {max(ds)}")
    extra = [t for t in tabs if t not in ('plan', 'Cost')]
    print("\nAdd to PRIV_TRIPS in app.js:\n  { ...PRIV, id: 'priv:%s', key: '%s', name: %s, extraTabs: %s%s }" % (
        a.key, a.key, json.dumps(a.name or a.key.title() + ' Trip', ensure_ascii=False), json.dumps(','.join(extra), ensure_ascii=False),
        (", start: '%s', end: '%s'" % (min(ds), max(ds))) if ds else ''))
    rows = [{'trip': a.key, 'tab': t, 'row_no': i, 'cells': r} for t, rs in tabs.items() for i, r in enumerate(rs)]
    if a.media:
        rows += [{'trip': a.key, 'tab': 'media', 'row_no': i, 'cells': r} for i, r in enumerate(media_idx)]
        rows += [{'trip': a.key, 'tab': t, 'row_no': i, 'cells': [c]} for t, cs in media_data.items() for i, c in enumerate(cs)]
    os.makedirs(a.out, exist_ok=True); path = os.path.join(a.out, f'{a.key}.rows.json'); json.dump(rows, open(path, 'w'), ensure_ascii=False)
    print(f'\n{len(rows)} rows ({len(media_data)} pictures) -> {path}  (gitignored)')
    if not a.write: print('Dry run only. Re-run with SB_SECRET_KEY=... and --write to push.'); return
    key = os.environ.get('SB_SECRET_KEY') or sys.exit('SB_SECRET_KEY is not set')
    print('delete old rows:', api('DELETE', f'/private_rows?trip=eq.{a.key}', key)[0])
    batch, size = [], 0
    for r in rows:
        s = len(json.dumps(r))
        if batch and size + s > 900_000:
            st, b = api('POST', '/private_rows', key, batch, {'Prefer': 'return=minimal'}); assert st == 201, (st, b); batch, size = [], 0
        batch.append(r); size += s
    if batch: st, b = api('POST', '/private_rows', key, batch, {'Prefer': 'return=minimal'}); assert st == 201, (st, b)
    if a.members:
        st, body = api('GET', '/sheet_rows?tab=eq.Users&row_no=gt.0&select=cells&order=row_no', key)
        names = [x['cells'][0].strip().lower() for x in json.loads(body)]
        print('grant members:', api('POST', '/trip_members?on_conflict=trip,name', key, [{'trip': a.key, 'name': n} for n in names], {'Prefer': 'resolution=ignore-duplicates,return=minimal'})[0], names)
    st, body = api('GET', f'/private_rows?trip=eq.{a.key}&select=tab,row_no,cells&order=tab,row_no', key, rng='0-9999'); back = {(r['tab'], r['row_no']): r['cells'] for r in json.loads(body)}
    bad = [k for k in ((r['tab'], r['row_no']) for r in rows) if back.get(k) != next(x['cells'] for x in rows if (x['tab'], x['row_no']) == k)] if len(back) != len(rows) else \
          [(r['tab'], r['row_no']) for r in rows if back.get((r['tab'], r['row_no'])) != r['cells']]
    print(f'verified read-back: {len(back)}/{len(rows)} rows, mismatches: {len(bad)}'); sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
