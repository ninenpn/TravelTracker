# Travel Tracker

เว็บแอปท่องเที่ยว (static, ไม่ต้องมี server) ดึงแผนจาก Google Sheet · คำนวณงบ/ค่าใช้จ่ายหลายคน · แชร์ตำแหน่ง

## Deploy (GitHub Pages)
Settings → Pages → Source: **GitHub Actions**, แล้ว merge เข้า `main` → https://ninenpn.github.io/TravelTracker/

## โครงสร้าง Google Sheet (แชร์: ทุกคนที่มีลิงก์ดูได้)
- **แท็บแผน** (ระบุด้วย gid): `Day, Start time, Start Location, Arrive time, Arrive Location, How to Travel, Note`
- **Users**: `Name, Budget`
- **Expenses**: `Date, Item, Category, Amount, Currency, PaidBy, Type, SplitWith`
  - `Type`: `shared` / ส่วนกลาง (หารเท่าทุกคน) · `personal` / ส่วนตัว · `split` / ออกให้ (หารเฉพาะคนใน `SplitWith` คั่นด้วย `,`)
- **Locations**: `Name, Lat, Lng, Label, Updated` (แอปมีปุ่ม "คัดลอกแถวตำแหน่ง" ให้วางลงชีต)
- แท็บประมาณการ (ไม่บังคับ) เช่น "ค่าใช้จ่าย"

สลับทริป: ⚙️ → "เพิ่มทริป/ชีตอื่น" แล้ววางลิงก์ชีต

ข้อมูลทั้งหมดอ่านจาก Google Sheet อย่างเดียว (ไม่มี backend อื่น) แอปไม่เขียนกลับชีต: ปุ่ม "สร้างแถว" จะคัดลอกแถวให้วางเอง แล้วกด ⟳
