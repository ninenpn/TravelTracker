-- Travel Tracker "open access" (รันใน Supabase SQL Editor ทีหลังไฟล์ supabase.sql / supabase_edit.sql / supabase_trips.sql / supabase_trips_v2.sql / supabase_docs.sql — รันซ้ำได้)
--
-- !! คำเตือน (เป็นการตัดสินใจของเจ้าของแอป) !!
-- ยกเลิกการล็อกอินด้วย PIN: ใครก็ตามที่รู้ "ชื่อ" สมาชิก (ซึ่งอ่านได้จากชีตสาธารณะ) เรียก RPC ได้เลยโดยไม่ต้องมี PIN
-- => ทริปส่วนตัว (Nine/Mew) และเอกสารของสมาชิก "อ่านได้โดยทุกคนที่มีลิงก์/รู้ชื่อ" — ไม่มีความลับอีกต่อไป
-- สิ่งที่ยังเหมือนเดิม: ลายเซ็นฟังก์ชัน, GRANT, RLS, ตาราง (anon อ่านตารางส่วนตัวตรง ๆ ไม่ได้),
-- (การเขียนทริปสาธารณะ Almaty ไม่ต้องใช้รหัสแก้ไขอีกต่อไปเมื่อรัน docs/supabase_nocode.sql)
-- ตัวเลข hash ที่แอปส่งมาถูกละเลย (แอปส่งค่าคงที่)

-- 1) ชื่อที่อยู่ในแท็บ Users ของทริปสาธารณะ ถือว่าผ่านโดยไม่ต้องมี PIN (ไม่จำกัดจำนวนครั้งอีกต่อไป)
create or replace function public._pin_ok(p_name text, p_hash text) returns boolean
language sql security definer set search_path = public as $$
  select length(trim(coalesce(p_name, ''))) > 0
     and exists (select 1 from public.sheet_rows where tab = 'Users' and row_no > 0 and lower(trim(cells ->> 0)) = lower(trim(p_name)));
$$;
revoke all on function public._pin_ok(text, text) from public, anon, authenticated;

-- 2) ทริปส่วนตัว: ต้องเป็นสมาชิกของทริปนั้น (trip_members) เท่านั้น — ไม่ตรวจ PIN
create or replace function public._member(p_trip text, p_name text, p_hash text) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from public.trip_members where trip = p_trip and name = lower(trim(coalesce(p_name, ''))));
$$;
revoke all on function public._member(text, text, text) from public, anon, authenticated;

-- 3) ทริปส่วนตัวมีสมาชิกแค่ Nine กับ Mew
delete from public.trip_members where name not in ('nine', 'mew');
insert into public.trip_members (trip, name)
  select t.trip, n.name from (select distinct trip from public.trip_members) t, (values ('nine'), ('mew')) n(name)
on conflict do nothing;
