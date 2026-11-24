-- Travel Tracker v2 (รันใน Supabase SQL Editor หลังไฟล์ supabase_trips.sql — รันซ้ำได้)
-- 1) ผู้ใช้ทุกคนในระบบ (ที่ยืนยัน PIN ผ่านแล้ว) เปิดดู/แก้ได้ทุกทริป — ไม่จำกัดเฉพาะ Mew/Nine อีกต่อไป
--    คนที่ยังไม่ได้ล็อกอิน (ไม่มีชื่อ+PIN) ยังอ่านทริปส่วนตัวไม่ได้ และยังจำกัดการเดา PIN ผิดไม่เกิน 8 ครั้ง/10 นาที
-- 2) เพิ่มแท็บ "ค่าใช้จ่าย" (ตารางประมาณการของ Almaty) ที่ยังไม่เคยย้ายเข้า Supabase

create or replace function public._member(p_trip text, p_name text, p_hash text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.sheet_rows where tab = 'Users' and row_no > 0 and lower(trim(cells ->> 0)) = lower(trim(p_name))) then
    return false;                                   -- ไม่ใช่สมาชิกในระบบ
  end if;
  return public._pin_ok(p_name, p_hash);            -- ต้องใส่ PIN ถูก (มีตัวจำกัดการเดา)
end $$;
revoke all on function public._member(text, text, text) from public, anon, authenticated;

delete from public.sheet_rows where tab = 'ค่าใช้จ่าย';
insert into public.sheet_rows (tab, row_no, cells) values
('ค่าใช้จ่าย', 0, '["รายการ (ต่อคน)", "ค่าใช้จ่าย (บาท/คน)", "รายการ (บางคน)", "ค่าใช้จ่าย (รวม)"]'::jsonb),
('ค่าใช้จ่าย', 1, '["ตั๋วเครื่องบิน BKK - ALA", "11900 - 12851.53", "กระเป๋าโหลด (4 ใบ) BKK - ALA", "6120"]'::jsonb),
('ค่าใช้จ่าย', 2, '["ตั๋วเครื่องบิน ALA - DMK", "7540", "กระเป๋าโหลด (4 ใบ) ALA - DMK"]'::jsonb),
('ค่าใช้จ่าย', 3, '["รวม", "19440 - 20391.53", "รวม", "6120"]'::jsonb);
