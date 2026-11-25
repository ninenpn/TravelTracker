-- Travel Tracker "no edit code" (รันใน Supabase SQL Editor ทีหลัง supabase_edit.sql / supabase_open.sql — รันซ้ำได้)
--
-- !! คำเตือน (เป็นการตัดสินใจของเจ้าของแอป) !!
-- ยกเลิก "รหัสแก้ไข" ของทริปสาธารณะ (Almaty): ใครก็ตามที่มีลิงก์/รู้ URL ของ Supabase + publishable key
-- เขียนทับแผน เพิ่มแถวค่าใช้จ่าย/สถานที่ได้ทันที ไม่ต้องใส่รหัสใด ๆ
-- สิ่งที่ยังเหมือนเดิม: ลายเซ็นฟังก์ชัน (พารามิเตอร์ `code` ยังอยู่แต่ถูกละเลย เพื่อให้ไคลเอนต์เก่า/เทสต์เดิมใช้ได้),
-- GRANT, RLS, ตาราง (anon เขียนตาราง sheet_rows / sheet_history ตรง ๆ ไม่ได้),
-- การสำรองแผนลง sheet_history (เก็บล่าสุด 30 ชุด ห่างกันอย่างน้อย 10 นาที) และการปฏิเสธแผนว่าง (< 2 แถว)
-- set_cell (ตั้งค่าเซลล์ตามชื่อคอลัมน์) ไม่ถูกแตะ — แอปไม่ได้เรียก และยังต้องใช้รหัสเดิม

-- รหัสไม่ต้องตรวจอีกต่อไป (ไคลเอนต์เก่าที่ยังเรียก check_code จะได้ true)
create or replace function public._chk(code text) returns boolean
language sql stable security definer set search_path = public as $$ select true; $$;
revoke all on function public._chk(text) from public, anon, authenticated;

create or replace function public.check_code(code text) returns boolean
language sql stable security definer set search_path = public as $$ select true; $$;

-- เขียนทับทั้งแท็บ (บันทึกแผน) ในทรานแซกชันเดียว + สำรองก่อนเขียนทับ
create or replace function public.save_tab(p_tab text, p_rows jsonb, code text default null) returns int
language plpgsql security definer set search_path = public as $$
begin
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

create or replace function public.append_row(p_tab text, p_cells jsonb, code text default null) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select coalesce(max(row_no), -1) + 1 into n from public.sheet_rows where tab = p_tab;
  insert into public.sheet_rows (tab, row_no, cells) values (p_tab, n, p_cells);
  return n;
end $$;

create or replace function public.upsert_row(p_tab text, p_key text, p_cells jsonb, code text default null) returns int
language plpgsql security definer set search_path = public as $$
declare rn int;
begin
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

grant execute on function public.check_code(text), public.save_tab(text, jsonb, text),
  public.append_row(text, jsonb, text), public.upsert_row(text, text, jsonb, text) to anon, authenticated;
