-- Travel Tracker รูปโปรไฟล์ (รันใน Supabase SQL Editor ทีหลัง supabase_open.sql — รันซ้ำได้)
-- รูปเป็นของส่วนกลาง: ใครที่ใช้แอป (ชื่ออยู่ในแท็บ Users) เพิ่ม/เปลี่ยน/ลบรูปของ "สมาชิกคนไหนก็ได้" (เจ้าของแอปตัดสินใจแล้ว)
-- p_name = ชื่อสมาชิกที่เป็นเจ้าของรูป ต้องอยู่ในแท็บ Users (ตรวจด้วย _pin_ok เหมือน RPC อื่น; p_hash ถูกละเลย)
-- ตารางไม่มี grant: anon อ่าน/เขียนตรง ๆ ไม่ได้ ต้องผ่านฟังก์ชันเท่านั้น
create table if not exists public.member_avatars (
  name text primary key, mime text not null, data text not null, updated_at timestamptz not null default now()
);
alter table public.member_avatars enable row level security;
revoke all on public.member_avatars from anon, authenticated;

-- ทุกคน: {"ชื่อตัวพิมพ์เล็ก": {"m": "image/jpeg", "d": "<base64>"}} (รูปเล็ก <= 120k ตัวอักษรต่อรูป)
create or replace function public.avatar_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(name, jsonb_build_object('m', mime, 'd', data)), '{}'::jsonb) from public.member_avatars;
$$;

-- คืน 1 = สำเร็จ, -1 = ไม่รู้จักชื่อ, -2 = ชนิดไฟล์ไม่รองรับ, -3 = ใหญ่เกิน/ว่าง
create or replace function public.avatar_put(p_name text, p_hash text, p_mime text, p_data text) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public._pin_ok(p_name, p_hash) then return -1; end if;
  if p_mime is null or p_mime not in ('image/jpeg', 'image/png', 'image/webp') then return -2; end if;
  if p_data is null or length(p_data) = 0 or length(p_data) > 120000 or p_data !~ '^[A-Za-z0-9+/=]+$' then return -3; end if;
  insert into public.member_avatars (name, mime, data, updated_at) values (lower(trim(p_name)), p_mime, p_data, now())
  on conflict (name) do update set mime = excluded.mime, data = excluded.data, updated_at = now();
  return 1;
end $$;

-- คืน 1 = ลบแล้ว, 0 = ไม่มีรูป, -1 = ไม่รู้จักชื่อ
create or replace function public.avatar_delete(p_name text, p_hash text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public._pin_ok(p_name, p_hash) then return -1; end if;
  delete from public.member_avatars where name = lower(trim(p_name));
  get diagnostics n = row_count; return n;
end $$;

grant execute on function public.avatar_list(), public.avatar_put(text, text, text, text), public.avatar_delete(text, text) to anon, authenticated;
