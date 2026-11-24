-- Travel Tracker: ทริปส่วนตัว (ต้องล็อกอินด้วย PIN) + PIN เก็บฝั่งเซิร์ฟเวอร์
-- รันทั้งไฟล์ใน Supabase SQL Editor (หลังรัน supabase.sql และ supabase_edit.sql แล้ว) รันซ้ำได้
-- ทำอะไรบ้าง:
--   1) ย้าย PIN (แฮช) ออกจากตารางสาธารณะ ไปตารางลับ member_pins (anon อ่านไม่ได้)
--   2) สร้างตารางส่วนตัว private_rows / trip_members (anon อ่านไม่ได้)
--   3) ฟังก์ชันตรวจสิทธิ์: ทริปส่วนตัวอ่าน/เขียนได้เฉพาะสมาชิกที่ยืนยัน PIN ผ่านแล้ว (จำกัดการเดาผิดไม่เกิน 8 ครั้ง/10 นาที)
--      (ไฟล์ supabase_trips_v2.sql ปรับให้สมาชิกทุกคนในแท็บ Users เปิดได้ทุกทริป)
--   4) (แยกไฟล์ trips_data.sql) ข้อมูล 4 ทริป: Macau, Nagoya-Osaka, Kunming-Lijiang, Xi'an (ทุกคนที่ล็อกอินด้วย PIN เข้าถึงได้)
--   Almaty Trip ยังเป็นสาธารณะเหมือนเดิม

create table if not exists public.private_rows (
  trip text not null, tab text not null, row_no int not null, cells jsonb not null default '[]'::jsonb,
  primary key (trip, tab, row_no));
create table if not exists public.trip_members (trip text not null, name text not null, primary key (trip, name));
create table if not exists public.member_pins (name text primary key, hash text not null);
create table if not exists public.pin_fail (name text not null, at timestamptz not null default now());
create index if not exists pin_fail_name_at on public.pin_fail (name, at);
alter table public.private_rows enable row level security;
alter table public.trip_members enable row level security;
alter table public.member_pins enable row level security;
alter table public.pin_fail enable row level security;
revoke all on public.private_rows, public.trip_members, public.member_pins, public.pin_fail from anon, authenticated;

-- 1) ย้าย PIN ออกจากแท็บ Users สาธารณะ
do $$
declare ci int;
begin
  select (ord - 1)::int into ci from public.sheet_rows s, jsonb_array_elements_text(s.cells) with ordinality as t(v, ord)
    where s.tab = 'Users' and s.row_no = 0 and lower(trim(v)) = 'pin' limit 1;
  if ci is not null then
    insert into public.member_pins (name, hash)
      select lower(trim(r.cells ->> 0)), trim(r.cells ->> ci) from public.sheet_rows r
      where r.tab = 'Users' and r.row_no > 0 and coalesce(trim(r.cells ->> ci), '') <> ''
      on conflict (name) do nothing;
    update public.sheet_rows set cells = jsonb_set(cells, array[ci::text], '""'::jsonb)
      where tab = 'Users' and row_no > 0 and jsonb_array_length(cells) > ci;
  end if;
end $$;

-- 2) สมาชิกทริปส่วนตัว
insert into public.trip_members (trip, name) values
  ('macau', 'mew'), ('macau', 'nine'), ('nagoya', 'mew'), ('nagoya', 'nine'),
  ('kunming', 'mew'), ('kunming', 'nine'), ('xian', 'mew'), ('xian', 'nine')
on conflict do nothing;

-- 3) ฟังก์ชัน
create or replace function public._throttle(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.pin_fail where name = lower(trim(p_name)) and at > now() - interval '10 minutes') >= 8 then
    raise exception 'too many attempts';
  end if;
end $$;
revoke all on function public._throttle(text) from public, anon, authenticated;

create or replace function public._pin_ok(p_name text, p_hash text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform public._throttle(p_name);
  if exists (select 1 from public.member_pins where name = lower(trim(p_name)) and hash = p_hash) then return true; end if;
  insert into public.pin_fail (name) values (lower(trim(p_name)));
  delete from public.pin_fail where at < now() - interval '1 day';
  return false;
end $$;
revoke all on function public._pin_ok(text, text) from public, anon, authenticated;

create or replace function public._member(p_trip text, p_name text, p_hash text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.trip_members where trip = p_trip and name = lower(trim(p_name))) then return false; end if;
  return public._pin_ok(p_name, p_hash);
end $$;
revoke all on function public._member(text, text, text) from public, anon, authenticated;

create or replace function public.pin_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(name order by name), '[]'::jsonb) from public.member_pins;
$$;

create or replace function public.verify_pin(p_name text, p_hash text) returns boolean
language sql security definer set search_path = public as $$ select public._pin_ok(p_name, p_hash); $$;

create or replace function public.set_first_pin(p_name text, p_hash text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_hash, '') = '' then raise exception 'empty'; end if;
  if exists (select 1 from public.member_pins where name = lower(trim(p_name))) then raise exception 'already set'; end if;
  if not exists (select 1 from public.sheet_rows where tab = 'Users' and row_no > 0 and lower(trim(cells ->> 0)) = lower(trim(p_name))) then
    raise exception 'unknown member';
  end if;
  insert into public.member_pins (name, hash) values (lower(trim(p_name)), p_hash);
end $$;

create or replace function public.reset_pin(p_name text, code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._chk(code) then raise exception 'wrong code'; end if;
  delete from public.member_pins where name = lower(trim(p_name));
end $$;

create or replace function public.get_private(p_trip text, p_tab text, p_name text, p_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public._member(p_trip, p_name, p_hash) then return null; end if;           -- null = ไม่มีสิทธิ์ (ไม่ raise เพื่อให้บันทึกความพยายามเดาไว้ได้)
  return coalesce((select jsonb_agg(cells order by row_no) from public.private_rows where trip = p_trip and tab = p_tab), '[]'::jsonb);
end $$;

-- เขียนทริปส่วนตัว: p_op = 'save' (payload = แถวทั้งหมด) | 'append' (payload = เซลล์) | 'upsert' (payload = {"key":..., "cells":[...]})
create or replace function public.private_write(p_trip text, p_tab text, p_op text, p_payload jsonb, p_name text, p_hash text) returns int
language plpgsql security definer set search_path = public as $$
declare n int; k text;
begin
  if not public._member(p_trip, p_name, p_hash) then return -1; end if;              -- -1 = ไม่มีสิทธิ์
  if p_op = 'save' then
    if jsonb_typeof(p_payload) <> 'array' or jsonb_array_length(p_payload) < 2 then raise exception 'empty rows'; end if;
    if not exists (select 1 from public.sheet_history where tab = p_trip || '/' || p_tab and saved_at > now() - interval '10 minutes') then
      insert into public.sheet_history (tab, rows)
        select p_trip || '/' || p_tab, coalesce(jsonb_agg(cells order by row_no), '[]'::jsonb) from public.private_rows where trip = p_trip and tab = p_tab;
      delete from public.sheet_history where tab = p_trip || '/' || p_tab and id not in
        (select id from public.sheet_history where tab = p_trip || '/' || p_tab order by id desc limit 30);
    end if;
    delete from public.private_rows where trip = p_trip and tab = p_tab;
    insert into public.private_rows (trip, tab, row_no, cells)
      select p_trip, p_tab, (o - 1)::int, e from jsonb_array_elements(p_payload) with ordinality as t(e, o);
    return jsonb_array_length(p_payload);
  elsif p_op = 'append' then
    select coalesce(max(row_no), -1) + 1 into n from public.private_rows where trip = p_trip and tab = p_tab;
    insert into public.private_rows (trip, tab, row_no, cells) values (p_trip, p_tab, n, p_payload);
    return n;
  elsif p_op = 'upsert' then
    k := p_payload ->> 'key';
    select row_no into n from public.private_rows
      where trip = p_trip and tab = p_tab and row_no > 0 and lower(trim(cells ->> 0)) = lower(trim(k)) limit 1;
    if n is null then
      select coalesce(max(row_no), 0) + 1 into n from public.private_rows where trip = p_trip and tab = p_tab;
      insert into public.private_rows (trip, tab, row_no, cells) values (p_trip, p_tab, n, p_payload -> 'cells');
    else
      update public.private_rows set cells = p_payload -> 'cells' where trip = p_trip and tab = p_tab and row_no = n;
    end if;
    return n;
  end if;
  raise exception 'bad op';
end $$;

create or replace function public.usage_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'total_rows', (select count(*) from public.sheet_rows) + (select count(*) from public.private_rows),
    'tables', coalesce((select jsonb_object_agg(tab, n) from (select tab, count(*) n from public.sheet_rows group by tab) x), '{}'::jsonb)
      || jsonb_build_object('(ทริปส่วนตัว)', (select count(*) from public.private_rows)));
$$;

grant execute on function public.pin_status(), public.verify_pin(text, text), public.set_first_pin(text, text),
  public.reset_pin(text, text), public.get_private(text, text, text, text), public.private_write(text, text, text, jsonb, text, text),
  public.usage_stats() to anon, authenticated;

-- 4) ข้อมูลทริป (ข้อมูลส่วนตัว ไม่เก็บใน GitHub): รันไฟล์ trips_data.sql ที่ผู้ช่วยส่งให้แยกต่างหากหลังจากไฟล์นี้
