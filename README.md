# Travel Tracker

เว็บแอปท่องเที่ยวสำหรับมือถือ (static, deploy บน GitHub Pages) ใช้ Supabase เป็นฐานข้อมูล — แผนเที่ยว, ค่าใช้จ่าย/หนี้, แผนที่ + เวลาเดินทาง, ที่พัก, สถานที่แนะนำ, นับถอยหลัง/แจ้งเตือน

https://ninenpn.github.io/TravelTracker/

## เอกสารและเครื่องมือสำหรับทำงานต่อ
- `CLAUDE.md` กฎและภาพรวมของโปรเจกต์ · `docs/ARCHITECTURE.md` · `docs/QA.md` · `docs/RUNBOOK.md` · `docs/AGENTS.md`
- ทดสอบทั้งหมด: `bash tests/run.sh --sql --live`
- Claude: agent `developer` + `qa`, สกิล `/dev-qa-loop` (Developer → QA → แก้ → QA … จน PASS), `run-qa`, `deploy-and-verify`, `supabase-ops`, `import-trip` ใน `.claude/`

## โครงสร้าง
- หน้าเว็บอ่านข้อมูลผ่าน REST ของ Supabase ด้วย **publishable key** (ใส่ใน `config.js` ได้ ไม่ใช่ความลับ) — **ห้ามใส่ secret key (`sb_secret_…`) ในรีโปนี้**
- ข้อมูลเก็บเป็นแถว/เซลล์ เหมือนชีต: ตาราง `sheet_rows (tab, row_no, cells)` สำหรับทริปสาธารณะ (Almaty) และ `private_rows (trip, tab, row_no, cells)` สำหรับทริปอื่น
- ถ้า Supabase เข้าไม่ได้/ยังไม่มีตาราง แอปถอยไปอ่านจาก Google Sheet (ทริป Almaty) ให้อัตโนมัติ

## ตั้งค่า Supabase (รันใน SQL Editor ตามลำดับ)
1. `docs/supabase.sql` — ตาราง `sheet_rows` + ข้อมูลตั้งต้นของ Almaty (อ่านได้อย่างเดียว)
2. `docs/supabase_edit.sql` — ฟังก์ชันเขียนข้อมูล (ตรวจ "รหัสแก้ไข"), ประวัติแผน, ตัววัดโควตา แล้วตั้งรหัส: `select public.set_edit_code('รหัสของคุณ');`
3. `docs/supabase_trips.sql` — ตารางส่วนตัว, PIN แบบเก็บฝั่งเซิร์ฟเวอร์ (anon อ่านไม่ได้), ฟังก์ชันตรวจสิทธิ์
4. `docs/supabase_trips_v2.sql` — ให้สมาชิกที่ยืนยัน PIN ทุกคนเปิดได้ทุกทริป + เพิ่มแท็บ "ค่าใช้จ่าย"
5. ข้อมูลทริปส่วนตัว (`trips_data.sql`) **ไม่เก็บใน GitHub** (รีโปเป็นสาธารณะ) — รันแยกใน SQL Editor

## การเข้าถึง
- เลือกชื่อ + PIN 4 หลัก (ตั้งครั้งแรกเอง; ตรวจที่เซิร์ฟเวอร์ เดาผิดเกิน 8 ครั้ง/10 นาทีจะถูกล็อกชั่วคราว)
- ผู้ที่ล็อกอินแล้วเห็นทุกทริป มีป้าย **Current / Upcoming / Past** ตามวันที่ของทริป ค่าเริ่มต้นแสดงเฉพาะ Current + Upcoming
- Almaty (สาธารณะ): แก้ไขด้วย "รหัสแก้ไข" · ทริปอื่น: แก้ไขด้วย PIN ของผู้ใช้
- ทุกการเขียนผ่านฟังก์ชัน RPC เท่านั้น (ตารางเขียนตรงๆ ไม่ได้)

## รูปภาพของทริป
รูปจากไฟล์ Excel (เช่น วลีภาษาจีน, ตั๋ว) ย่อเป็น JPEG ≤1000px แล้วเก็บเป็นชิ้น base64 ใน `private_rows` (แท็บ `media` = ดัชนี, `media:<id>` = ข้อมูลรูป) แอปโหลดทีละรูปตอนเปิด "รูปภาพของทริป" (เมนู หรือท้ายหน้าแผน)

## รูปแบบข้อมูลของแผน
`Day, Start time, Start Location, Arrive time, Arrive Location, How to Travel, Note` (+ `Notice`, `Tickets`, `Location` ได้)
- วันที่ใส่ปีได้ เช่น `5-ธ.ค. 2025` (ไม่ใส่ปี = ปีที่ใกล้ที่สุด)
- เวลาเดินทาง = เวลาออก → เวลาถึง · เวลาที่ใช้ที่จุดหมาย = เวลาถึง → เวลาออกของรายการถัดไป (แอปคำนวณและแสดงให้)

## แท็บอื่นๆ (`sheet_rows.tab`)
`Users` (`Name, Budget …`) · `Expenses` (`Date, Item, Category, Amount, Currency, PaidBy, Type, SplitWith`; Type = shared/personal/split) · `Locations` · `Stay` (`Key, Value`) · `Places` · `Tips` (`Type, Name, Detail, BestTime, Source`) · `ค่าใช้จ่าย` (ตารางประมาณการ)

## ตำแหน่ง
ขอสิทธิ์ตำแหน่งเฉพาะช่วงตั้งแต่เที่ยวบินแรกลงจอดจนถึงเที่ยวบินสุดท้ายออก

## โควตาฟรีของ Supabase
เมนู → การ์ด "โควตาฟรี Supabase" แสดงขนาดฐานข้อมูลจริงเทียบ 500 MB (ทราฟฟิกนับเฉพาะเครื่องที่เปิดดู)

## พัฒนา
ไม่มี build step: `python3 -m http.server` แล้วเปิด `index.html` — workflow ใน `.github/workflows/pages.yml` ใส่เลข build ลง `index.html` ตอน deploy
