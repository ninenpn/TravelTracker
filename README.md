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
| Places | `Name, Lat, Lng, Note` (พิกัดสถานที่ในแผน) |

## บันทึกลงชีตอัตโนมัติ (ไม่บังคับ)
เมนู → เชื่อมต่อชีต: แอปมีขั้นตอนและโค้ดให้วางใน Apps Script (`apps-script/Code.gs`) ของชีต แล้ว Deploy เป็น Web app
เมื่อเชื่อมต่อแล้ว: แก้/ลากวางแผน, เพิ่มค่าใช้จ่าย, ตั้งพิกัดจากลิงก์ Google Maps, แชร์ตำแหน่ง จะบันทึกลงชีตอัตโนมัติ
(สคริปต์สำรองแผนเดิมไว้ที่แท็บซ่อน `_plan_backup` ก่อนเขียนทับทุกครั้ง)

## ตำแหน่ง
ขอสิทธิ์ตำแหน่งเฉพาะช่วงตั้งแต่เที่ยวบินแรกลงจอดจนถึงเที่ยวบินสุดท้ายออก (คำนวณจากแผนในชีต)
