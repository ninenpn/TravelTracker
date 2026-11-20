-- Optional: run in a Supabase project to share expenses/locations across devices.
-- Use a DEDICATED project; anon access is open (trip_id acts as a soft key). Don't store anything sensitive.
create table if not exists tt_expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null, date text, item text not null, category text,
  amount numeric not null, currency text default 'THB', payer text not null,
  type text not null default 'shared', split_with text[] default '{}',
  created_at timestamptz default now()
);
create table if not exists tt_locations (
  trip_id text not null, user_name text not null, lat double precision, lng double precision,
  label text, updated_at timestamptz default now(), primary key (trip_id, user_name)
);
alter table tt_expenses enable row level security;
alter table tt_locations enable row level security;
create policy tt_exp_all on tt_expenses for all to anon using (true) with check (true);
create policy tt_loc_all on tt_locations for all to anon using (true) with check (true);
