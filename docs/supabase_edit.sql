-- Travel Tracker -> Supabase : เปิดการแก้ไข (ทำหลังรัน docs/supabase.sql แล้ว)
-- รันทั้งไฟล์ใน Supabase Dashboard > SQL Editor แล้วท้ายสุดรัน set_edit_code (ดูด้านล่าง)
--
-- ความปลอดภัย: anon เขียนตาราง sheet_rows ตรงๆ ไม่ได้ (RLS) ทุกการเขียนต้องผ่านฟังก์ชันด้านล่าง
-- ซึ่งตรวจ "รหัสแก้ไข" (เก็บแบบ SHA-256 ในตารางที่ anon อ่านไม่ได้) ก่อนเสมอ

-- ตารางลับ: เก็บรหัสแก้ไข (ไม่มี policy = anon มองไม่เห็น)
create table if not exists public.app_secrets (k text primary key, v text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- ประวัติแผน: สำรองก่อนเขียนทับ (อย่างน้อยห่างกัน 10 นาที เก็บล่าสุด 30 ชุด)
create table if not exists public.sheet_history (
  id bigserial primary key, tab text not null, saved_at timestamptz not null default now(), rows jsonb not null
);
alter table public.sheet_history enable row level security;
revoke all on public.sheet_history from anon, authenticated;

create or replace function public._chk(code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_secrets
                 where k = 'edit_code' and v = encode(sha256(convert_to(coalesce(code, ''), 'utf8')), 'hex'));
$$;
revoke all on function public._chk(text) from public, anon, authenticated;

-- ตั้ง/เปลี่ยนรหัส: เรียกได้เฉพาะจาก SQL Editor (anon เรียกไม่ได้)
create or replace function public.set_edit_code(new_code text) returns void
language sql security definer set search_path = public as $$
  insert into public.app_secrets (k, v) values ('edit_code', encode(sha256(convert_to(new_code, 'utf8')), 'hex'))
  on conflict (k) do update set v = excluded.v;
$$;
revoke all on function public.set_edit_code(text) from public, anon, authenticated;

create or replace function public.check_code(code text) returns boolean
language sql stable security definer set search_path = public as $$ select public._chk(code); $$;

-- เขียนทับทั้งแท็บ (ใช้บันทึกแผน) ในทรานแซกชันเดียว: ถ้าพลาดข้อมูลเดิมยังอยู่
create or replace function public.save_tab(p_tab text, p_rows jsonb, code text) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public._chk(code) then raise exception 'wrong code'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 2 then raise exception 'empty rows'; end if;
  if not exists (select 1 from public.sheet_history where tab = p_tab and saved_at > now() - interval '10 minutes') then
    insert into public.sheet_history (tab, rows)
      select p_tab, coalesce(jsonb_agg(cells order by row_no), '[]'::jsonb) from public.sheet_rows where tab = p_tab;
    delete from public.sheet_history where tab = p_tab and id not in
      (select id from public.sheet_history where tab = p_tab order by id desc limit 30);
  end if;
  delete from public.sheet_rows where tab = p_tab;
  insert into public.sheet_rows (tab, row_no, cells)
    select p_tab, (o - 1)::int, e from jsonb_array_elements(p_rows) with ordinality as t(e, o);
  return jsonb_array_length(p_rows);
end $$;

-- เพิ่มแถวท้ายแท็บ (ใช้เพิ่มค่าใช้จ่าย)
create or replace function public.append_row(p_tab text, p_cells jsonb, code text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public._chk(code) then raise exception 'wrong code'; end if;
  select coalesce(max(row_no), -1) + 1 into n from public.sheet_rows where tab = p_tab;
  insert into public.sheet_rows (tab, row_no, cells) values (p_tab, n, p_cells);
  return n;
end $$;

-- แก้แถวที่คอลัมน์แรก = p_key ถ้าไม่มีให้เพิ่มใหม่ (ใช้กับสถานที่/ตำแหน่ง)
create or replace function public.upsert_row(p_tab text, p_key text, p_cells jsonb, code text) returns int
language plpgsql security definer set search_path = public as $$
declare rn int;
begin
  if not public._chk(code) then raise exception 'wrong code'; end if;
  select row_no into rn from public.sheet_rows
    where tab = p_tab and row_no > 0 and lower(trim(cells ->> 0)) = lower(trim(p_key)) limit 1;
  if rn is null then
    select coalesce(max(row_no), 0) + 1 into rn from public.sheet_rows where tab = p_tab;
    insert into public.sheet_rows (tab, row_no, cells) values (p_tab, rn, p_cells);
  else
    update public.sheet_rows set cells = p_cells where tab = p_tab and row_no = rn;
  end if;
  return rn;
end $$;

-- ตั้งค่าเซลล์เดียว (คอลัมน์ตามชื่อหัว สร้างให้ถ้ายังไม่มี) ใช้กับ PIN
create or replace function public._set_cell(p_tab text, p_key text, p_col text, p_val text, p_only_if_empty boolean) returns void
language plpgsql security definer set search_path = public as $$
declare hdr jsonb; ci int; rn int; rowc jsonb;
begin
  select cells into hdr from public.sheet_rows where tab = p_tab and row_no = 0;
  if hdr is null then raise exception 'no tab %', p_tab; end if;
  select (ord - 1)::int into ci from jsonb_array_elements_text(hdr) with ordinality as t(v, ord)
    where lower(trim(v)) = lower(trim(p_col)) limit 1;
  if ci is null then
    ci := jsonb_array_length(hdr); hdr := hdr || to_jsonb(p_col);
    update public.sheet_rows set cells = hdr where tab = p_tab and row_no = 0;
  end if;
  select row_no, cells into rn, rowc from public.sheet_rows
    where tab = p_tab and row_no > 0 and lower(trim(cells ->> 0)) = lower(trim(p_key)) limit 1;
  if rn is null then raise exception 'row not found'; end if;
  if p_only_if_empty and coalesce(trim(rowc ->> ci), '') <> '' then raise exception 'already set'; end if;
  while jsonb_array_length(rowc) <= ci loop rowc := rowc || '""'::jsonb; end loop;
  rowc := jsonb_set(rowc, array[ci::text], to_jsonb(coalesce(p_val, '')));
  update public.sheet_rows set cells = rowc where tab = p_tab and row_no = rn;
end $$;
revoke all on function public._set_cell(text, text, text, text, boolean) from public, anon, authenticated;

create or replace function public.set_cell(p_tab text, p_key text, p_col text, p_val text, code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public._chk(code) then raise exception 'wrong code'; end if;
  perform public._set_cell(p_tab, p_key, p_col, p_val, false);
end $$;

-- ตั้ง PIN ครั้งแรกของสมาชิก (ไม่ต้องใช้รหัสแก้ไข แต่ทำได้เฉพาะตอนที่ยังไม่มี PIN)
create or replace function public.set_first_pin(p_name text, p_hash text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_hash, '') = '' then raise exception 'empty'; end if;
  perform public._set_cell('Users', p_name, 'PIN', p_hash, true);
end $$;

-- โควตา: ขนาดฐานข้อมูลจริง + จำนวนแถว (ไม่มีข้อมูลลับ)
create or replace function public.usage_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'total_rows', (select count(*) from public.sheet_rows),
    'tables', coalesce((select jsonb_object_agg(tab, n) from (select tab, count(*) n from public.sheet_rows group by tab) x), '{}'::jsonb));
$$;

grant execute on function public.check_code(text), public.save_tab(text, jsonb, text),
  public.append_row(text, jsonb, text), public.upsert_row(text, text, jsonb, text),
  public.set_cell(text, text, text, text, text), public.set_first_pin(text, text),
  public.usage_stats() to anon, authenticated;

-- ===== สุดท้าย: ตั้งรหัสแก้ไขของคุณ (แก้ข้อความในวงเล็บ แล้วรันบรรทัดนี้) =====
-- select public.set_edit_code('ใส่รหัสของคุณที่นี่');
