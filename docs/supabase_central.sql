-- Travel Tracker "central system" (รันใน Supabase SQL Editor ทีหลัง supabase_docs.sql และ supabase_open.sql — รันซ้ำได้)
--
-- !! การตัดสินใจของเจ้าของแอป !!  แอปนี้ไม่มี "ตัวตนผู้ใช้" อีกแล้ว: ทุกคนทำได้ทุกอย่างกับทุกชื่อ
-- แอปเรียก RPC ด้วยชื่อ API คงที่ชื่อเดียว (สมาชิกคนแรกของทริป) เสมอ จึงตรวจ "เจ้าของ/ผู้อัปโหลด" ไม่ได้อีก
-- => doc_rename / doc_delete: สมาชิกที่ผ่านการตรวจชื่อ (_doc_auth) คนไหนก็เปลี่ยนชื่อ/ลบเอกสาร "ทุกฉบับ" ได้
-- รหัสคืนค่าเหมือนเดิม: -1 = ชื่อไม่ผ่าน, -5 = ชื่อเรื่องไม่ถูกต้อง, 0 = ไม่พบเอกสาร, 1 = สำเร็จ
-- ไม่เปลี่ยน: ลายเซ็นฟังก์ชัน, GRANT, RLS, ตาราง (ฟังก์ชันอื่นไม่ได้จำกัดตามเจ้าของ/created_by อยู่แล้ว)

create or replace function public.doc_rename(p_name text, p_hash text, p_id uuid, p_title text) returns int
language plpgsql security definer set search_path = public as $$
declare t text := trim(coalesce(p_title, '')); n int;
begin
  if not public._doc_auth(p_name, p_hash) then return -1; end if;
  if t = '' or char_length(t) > 80 then return -5; end if;
  update public.member_docs set title = t where id = p_id;
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.doc_delete(p_name text, p_hash text, p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public._doc_auth(p_name, p_hash) then return -1; end if;
  delete from public.member_docs where id = p_id;
  get diagnostics n = row_count; return n;
end $$;

revoke all on function public.doc_rename(text, text, uuid, text), public.doc_delete(text, text, uuid) from public;
grant execute on function public.doc_rename(text, text, uuid, text), public.doc_delete(text, text, uuid) to anon, authenticated;
