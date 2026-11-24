-- Travel Tracker: เอกสาร (ส่วนตัว + ส่วนกลาง) — รันใน Supabase SQL Editor หลังไฟล์ supabase_trips_v2.sql (รันซ้ำได้)
-- ตาราง member_docs / member_doc_chunks ปิดด้วย RLS และไม่ให้สิทธิ์ anon/authenticated — เข้าถึงผ่านฟังก์ชันที่ตรวจชื่อ+PIN เท่านั้น
-- เอกสารส่วนตัว: เจ้าของเท่านั้นที่เห็น/แก้/ลบ (บังคับที่ฝั่งเซิร์ฟเวอร์) · ส่วนกลาง: สมาชิกที่ล็อกอินทุกคนเห็น, ผู้สร้างเท่านั้นที่ลบ/เปลี่ยนชื่อ
-- รหัสผลลัพธ์: doc_list/doc_get = null เมื่อไม่มีสิทธิ์ · doc_put = id หรือ '-1' ไม่มีสิทธิ์, '-2' ชนิดไฟล์ไม่รองรับ, '-3' ไฟล์ใหญ่เกิน 6 MB,
--   '-4' เกินจำนวนที่เก็บได้, '-5' ข้อมูลไม่ถูกต้อง (ชื่อ/ขอบเขต/chunks) · doc_rename/doc_delete = 1 สำเร็จ, 0 ไม่พบ/ไม่มีสิทธิ์กับเอกสารนั้น, -1 ไม่มีสิทธิ์
-- หมายเหตุ: เป็นข้อมูลอ่อนไหว — Supabase เข้ารหัสข้อมูลขณะจัดเก็บ (at rest) แต่ไม่มีการเข้ารหัสฝั่งไคลเอนต์เพิ่มเติม

create table if not exists public.member_docs (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('person','shared')),
  owner text not null default '',
  trip text not null default '',
  title text not null, kind text not null default 'other', mime text not null,
  size_bytes int not null default 0, note text not null default '',
  created_by text not null, created_at timestamptz not null default now(),
  chunks int not null default 0);
create table if not exists public.member_doc_chunks (
  doc_id uuid not null references public.member_docs(id) on delete cascade,
  i int not null, data text not null, primary key (doc_id, i));
create index if not exists member_docs_owner on public.member_docs (scope, owner);
alter table public.member_docs enable row level security;
alter table public.member_doc_chunks enable row level security;
revoke all on public.member_docs, public.member_doc_chunks from anon, authenticated;

create or replace function public._doc_auth(p_name text, p_hash text) returns boolean
language sql security definer set search_path = public as $$ select public._member('', p_name, p_hash); $$;
revoke all on function public._doc_auth(text, text) from public, anon, authenticated;

create or replace function public.doc_list(p_name text, p_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public._doc_auth(p_name, p_hash) then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'scope', scope, 'owner', owner, 'trip', trip, 'title', title, 'kind', kind,
      'mime', mime, 'size_bytes', size_bytes, 'note', note, 'created_by', created_by, 'created_at', created_at, 'chunks', chunks) order by created_at, id)
    from public.member_docs where scope = 'shared' or (scope = 'person' and owner = lower(trim(p_name)))), '[]'::jsonb);
end $$;

create or replace function public.doc_get(p_name text, p_hash text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d public.member_docs;
begin
  if not public._doc_auth(p_name, p_hash) then return null; end if;
  select * into d from public.member_docs where id = p_id and (scope = 'shared' or owner = lower(trim(p_name)));
  if not found then return null; end if;
  return jsonb_build_object('id', d.id, 'scope', d.scope, 'owner', d.owner, 'title', d.title, 'kind', d.kind, 'mime', d.mime, 'note', d.note,
    'chunks', coalesce((select jsonb_agg(data order by i) from public.member_doc_chunks where doc_id = d.id), '[]'::jsonb));
end $$;

create or replace function public.doc_put(p_name text, p_hash text, p_scope text, p_trip text, p_title text, p_kind text, p_mime text, p_note text, p_chunks jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare me text := lower(trim(p_name)); n int; tot bigint; nid uuid; t text := trim(coalesce(p_title, ''));
begin
  if not public._doc_auth(p_name, p_hash) then return '-1'; end if;
  if p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp','application/pdf') then return '-2'; end if;
  if p_scope not in ('person','shared') or t = '' or char_length(t) > 80 or char_length(coalesce(p_note, '')) > 300
     or p_chunks is null or jsonb_typeof(p_chunks) <> 'array' or jsonb_array_length(p_chunks) = 0
     or exists (select 1 from jsonb_array_elements(p_chunks) e where jsonb_typeof(e) <> 'string') then return '-5'; end if;
  select coalesce(sum(length(e #>> '{}')), 0) into tot from jsonb_array_elements(p_chunks) e;
  if tot > 6000000 then return '-3'; end if;
  if p_scope = 'person' then select count(*) into n from public.member_docs where scope = 'person' and owner = me; if n >= 40 then return '-4'; end if;
  else select count(*) into n from public.member_docs where scope = 'shared'; if n >= 60 then return '-4'; end if; end if;
  insert into public.member_docs (scope, owner, trip, title, kind, mime, size_bytes, note, created_by, chunks)
    values (p_scope, case when p_scope = 'person' then me else '' end, coalesce(p_trip, ''), t, coalesce(nullif(trim(p_kind), ''), 'other'), p_mime,
            (tot * 3 / 4)::int, coalesce(p_note, ''), me, jsonb_array_length(p_chunks)) returning id into nid;
  insert into public.member_doc_chunks (doc_id, i, data) select nid, (ord - 1)::int, e #>> '{}' from jsonb_array_elements(p_chunks) with ordinality as x(e, ord);
  return nid::text;
end $$;

create or replace function public.doc_rename(p_name text, p_hash text, p_id uuid, p_title text) returns int
language plpgsql security definer set search_path = public as $$
declare t text := trim(coalesce(p_title, '')); n int;
begin
  if not public._doc_auth(p_name, p_hash) then return -1; end if;
  if t = '' or char_length(t) > 80 then return -5; end if;
  update public.member_docs set title = t where id = p_id and created_by = lower(trim(p_name)) and (scope = 'shared' or owner = lower(trim(p_name)));
  get diagnostics n = row_count; return n;
end $$;

create or replace function public.doc_delete(p_name text, p_hash text, p_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public._doc_auth(p_name, p_hash) then return -1; end if;
  delete from public.member_docs where id = p_id and created_by = lower(trim(p_name)) and (scope = 'shared' or owner = lower(trim(p_name)));
  get diagnostics n = row_count; return n;
end $$;

revoke all on function public.doc_list(text, text), public.doc_get(text, text, uuid),
  public.doc_put(text, text, text, text, text, text, text, text, jsonb), public.doc_rename(text, text, uuid, text), public.doc_delete(text, text, uuid) from public;
grant execute on function public.doc_list(text, text), public.doc_get(text, text, uuid),
  public.doc_put(text, text, text, text, text, text, text, text, jsonb), public.doc_rename(text, text, uuid, text), public.doc_delete(text, text, uuid) to anon, authenticated;
