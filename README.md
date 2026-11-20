# Travel Tracker

เว็บแอปท่องเที่ยวสำหรับมือถือ (static, deploy บน GitHub Pages) — แผนเที่ยว งบ/ค่าใช้จ่ายหลายสกุลเงิน และแผนที่ ข้อมูลทั้งหมดอยู่ใน Google Sheet

https://ninenpn.github.io/TravelTracker/

## Google Sheet (แชร์: ทุกคนที่มีลิงก์ดูได้)
| แท็บ | คอลัมน์ |
|---|---|
| แผน (ระบุด้วย gid) | `Day, Start time, Start Location, Arrive time, Arrive Location, How to Travel, Note` |
| Users | `Name, Budget` (หลายสกุล: `Budget KZT`, `Budget USD`) |
| Expenses | `Date, Item, Category, Amount, Currency, PaidBy, Type, SplitWith` — Type: `shared` / `personal` / `split` |
| Locations | `Name, Lat, Lng, Label, Updated` |
| Places | `Name, Lat, Lng, Note, Type, Meal, Cuisine` — `Type` ว่าง = ใช้เป็นพิกัดของสถานที่ในแผนเท่านั้น; `Type` = `food` / `sight` / `other` = แสดงในแท็บสถานที่และฟิลเตอร์บนแผนที่ (`Meal`: เช้า/กลางวัน/เย็น/คาเฟ่/ของหวาน/ดึก) |

## แก้ไขและบันทึกลงชีต (เข้าสู่ระบบด้วย Google)
ไม่ใช้ Apps Script — ผู้ใช้เข้าสู่ระบบด้วยบัญชี Google (เมนู → บัญชี Google) แล้วแอปเรียก Google Sheets API ด้วยสิทธิ์ของบัญชีนั้นโดยตรง
ใครมีสิทธิ์ “ผู้แก้ไข” ในชีตอยู่แล้วก็แก้ผ่านแอปได้ ใครไม่มีสิทธิ์ Google จะไม่อนุญาต
ทำได้: แก้/ลากวางแผน, เพิ่มค่าใช้จ่าย, บันทึกสถานที่/พิกัดจากลิงก์ Google Maps, แชร์ตำแหน่ง (ก่อนเขียนทับแผนจะสำรองไว้ที่แท็บซ่อน `_plan_backup`)

**ตั้งค่าครั้งเดียวโดยเจ้าของแอป** — สร้าง OAuth Client ID แล้วใส่ใน `config.js` (`googleClientId`):
1. console.cloud.google.com → สร้างโปรเจกต์ → เปิดใช้ **Google Sheets API**
2. OAuth consent screen → External → เพิ่มอีเมลเพื่อนๆ ใน **Test users** (สถานะ Testing)
3. Credentials → OAuth client ID → **Web application** → Authorized JavaScript origins: `https://ninenpn.github.io`
4. คัดลอก Client ID (ลงท้าย `.apps.googleusercontent.com`) ไปใส่ `config.js` — ไม่ใช่ความลับ ใส่ใน repo ได้

## ตำแหน่ง
ขอสิทธิ์ตำแหน่งเฉพาะช่วงตั้งแต่เที่ยวบินแรกลงจอดจนถึงเที่ยวบินสุดท้ายออก (คำนวณจากแผนในชีต)

## สถานที่ & แนะนำใกล้ๆ
- แท็บ **สถานที่**: ลิสร้านอาหาร/ที่เที่ยว/อื่นๆ — วางลิงก์ Google Maps แล้วแอปดึงพิกัดและชื่อให้ (ลิงก์สั้นต้องเชื่อมต่อชีต)
- **แนะนำใกล้ๆ**: ค้นร้านอาหาร/คาเฟ่/ที่เที่ยวรอบตำแหน่งของคุณหรือรอบจุดในแผน ตามช่วงเวลาตอนนี้ (ข้อมูลจาก OpenStreetMap ผ่าน Nominatim พร้อมเวลาเปิดถ้ามี)
- **แผนที่**: ฟิลเตอร์ แผน / ร้านอาหาร / ที่เที่ยว / อื่นๆ / เพื่อน และเส้นทางตามลำดับด้วยเส้นประพร้อมลูกศร
