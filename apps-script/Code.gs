/**
 * Travel Tracker — ตัวรับข้อมูลฝั่ง Google Sheet
 * วางใน: ชีตของคุณ → ส่วนขยาย (Extensions) → Apps Script
 * แล้วกด Deploy → New deployment → Web app
 *   Execute as: Me   |   Who has access: Anyone
 * จากนั้นคัดลอก Web app URL ไปวางในแอป (ตั้งค่า → การบันทึกลงชีต)
 */
const TOKEN = '__TOKEN__'; // รหัสลับ — ต้องตรงกับที่ตั้งในแอป (แอปสร้างให้อัตโนมัติ)

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const req = JSON.parse(e.postData.contents);
    if (req.token !== TOKEN) return out({ ok: false, error: 'รหัสลับไม่ถูกต้อง' });
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    switch (req.action) {
      case 'ping': return out({ ok: true, sheets: ss.getSheets().map(function (s) { return s.getName(); }) });
      case 'append': {
        const sh = getTab(ss, req, true);
        sh.appendRow(req.values);
        return out({ ok: true });
      }
      case 'upsert': {
        const sh = getTab(ss, req, true);
        const col = req.keyCol || 0, key = String(req.key).trim().toLowerCase();
        const last = sh.getLastRow();
        const keys = last > 1 ? sh.getRange(2, col + 1, last - 1, 1).getValues() : [];
        for (var i = 0; i < keys.length; i++) {
          if (String(keys[i][0]).trim().toLowerCase() === key) {
            sh.getRange(i + 2, 1, 1, req.values.length).setValues([req.values]);
            return out({ ok: true, updated: true });
          }
        }
        sh.appendRow(req.values);
        return out({ ok: true, updated: false });
      }
      case 'savePlan': {
        const sh = getTab(ss, req, false);
        const rows = req.rows;
        if (!rows || !rows.length) return out({ ok: false, error: 'ไม่มีข้อมูล' });
        // สำรองแผนเดิมไว้ 1 ชุดก่อนเขียนทับ (ชีตซ่อน _plan_backup)
        const old = ss.getSheetByName('_plan_backup');
        if (old) ss.deleteSheet(old);
        const bak = sh.copyTo(ss).setName('_plan_backup');
        bak.hideSheet();
        const width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
        const norm = rows.map(function (r) { const x = r.slice(); while (x.length < width) x.push(''); return x; });
        const last = sh.getLastRow();
        if (last > norm.length) sh.getRange(norm.length + 1, 1, last - norm.length, sh.getLastColumn()).clearContent();
        const rg = sh.getRange(1, 1, norm.length, width);
        rg.setNumberFormat('@');
        rg.setValues(norm);
        return out({ ok: true, rows: norm.length });
      }
      case 'resolve': {
        var url = String(req.url);
        for (var n = 0; n < 6; n++) {
          if (!/^https:\/\/(maps\.app\.goo\.gl|goo\.gl|www\.google\.[a-z.]+|maps\.google\.[a-z.]+)\//i.test(url)) break;
          const r = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
          const loc = r.getHeaders()['Location'] || r.getHeaders()['location'];
          if (!loc) break;
          url = loc;
        }
        return out({ ok: true, url: url });
      }
      default: return out({ ok: false, error: 'unknown action' });
    }
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) { }
  }
}

function getTab(ss, req, create) {
  if (req.gid) {
    const all = ss.getSheets();
    for (var i = 0; i < all.length; i++) if (String(all[i].getSheetId()) === String(req.gid)) return all[i];
  }
  if (req.tab) {
    var sh = ss.getSheetByName(req.tab);
    if (!sh && create) {
      sh = ss.insertSheet(req.tab);
      if (req.header) sh.appendRow(req.header);
    }
    if (sh) return sh;
  }
  return ss.getSheets()[0];
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
