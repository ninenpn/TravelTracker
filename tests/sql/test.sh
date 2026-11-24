#!/bin/bash
# Validates docs/*.sql on a throw-away local Postgres (needs the postgres server binaries and root or the postgres user).
# Uses SYNTHETIC private data only. Usage: bash tests/sql/test.sh
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; D=$(mktemp -d /tmp/ttpg.XXXXXX); B=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
[ -n "$B" ] && [ -x "$B/initdb" ] || { echo "SKIP: postgres binaries not found"; exit 0; }
chown postgres:postgres "$D"; PORT=5496
su postgres -c "$B/initdb -D $D -A trust >/dev/null" && su postgres -c "$B/pg_ctl -D $D -o '-p $PORT -k /tmp' -l $D/log -w start >/dev/null" || { echo "FAIL: cannot start postgres"; exit 1; }
trap 'su postgres -c "$B/pg_ctl -D $D -m immediate stop >/dev/null" 2>/dev/null; rm -rf "$D"' EXIT
P="psql -h /tmp -p $PORT -U postgres -d postgres -q -t -A"
$P -v ON_ERROR_STOP=1 -c "create role anon nologin; create role authenticated nologin;" || exit 1
for f in supabase supabase_edit supabase_trips supabase_trips_v2 supabase_trips_v2; do          # v2 twice = must be idempotent
  $P -v ON_ERROR_STOP=1 -f "$ROOT/docs/$f.sql" 2>&1 | grep -v NOTICE
done
$P -c "select public.set_edit_code('secret1');" >/dev/null
$P -c "insert into private_rows values ('macau','plan',0,'[\"Day\",\"S\"]'),('macau','plan',1,'[\"1-ก.ค. 2026\",\"x\"]'),('macau','media:m1',0,'[\"AAAA\"]'),('macau','Expenses',0,'[\"h\"]');"
fail=0
ok()   { echo " PASS $1"; }
bad()  { echo " FAIL $1 ${2:-}"; fail=1; }
val()  { $P -c "$1" 2>&1 | grep -v '^SET$'; }                               # value of a query run as postgres
asanon() { $P -c "set role anon; $1" 2>&1 | grep -v '^SET$'; }               # value of a query run as the public (anon) role
eq()   { [ "$3" == "$2" ] && ok "$1" || bad "$1" "(expected '$2', got '$3')"; }
has()  { echo "$3" | grep -qi "$2" && ok "$1" || bad "$1" "(got '$3')"; }

eq  "PIN hashes are not left in public Users rows" 0 "$(val "select count(*) from sheet_rows where tab='Users' and row_no>0 and cells->>2 ~ '^[0-9a-f]{64}\$'")"
has "anon cannot read private_rows"  "permission denied" "$(asanon 'select count(*) from private_rows')"
has "anon cannot read member_pins"   "permission denied" "$(asanon 'select count(*) from member_pins')"
has "anon cannot read app_secrets"   "permission denied" "$(asanon 'select count(*) from app_secrets')"
has "anon cannot write sheet_rows"   "violates row-level\|denied" "$(asanon "insert into sheet_rows values ('x',0,'[]')")"
eq  "check_code accepts the right code" t "$(asanon "select public.check_code('secret1')")"
eq  "check_code rejects a wrong code"   f "$(asanon "select public.check_code('nope')")"
has "save_tab rejects a wrong code"     "wrong code" "$(asanon "select public.save_tab('plan','[[\"a\"],[\"b\"]]'::jsonb,'bad')")"
eq  "save_tab with the right code writes all rows" 2 "$(asanon "select public.save_tab('plan','[[\"Day\",\"S\"],[\"14\",\"z\"]]'::jsonb,'secret1')")"
eq  "save_tab kept a history snapshot" 1 "$(val "select count(*) from sheet_history")"
eq  "append_row / upsert_row work with the code" 1 "$(val "select count(*) from (select 1) x where public.append_row('Expenses','[\"d\",\"i\"]'::jsonb,'secret1') is not null and public.upsert_row('Places','Cafe','[\"Cafe\",\"1\"]'::jsonb,'secret1') is not null")"
asanon "select public.set_first_pin('Tu','hashTu')" >/dev/null
eq  "first PIN is stored and verifies" t "$(asanon "select public.verify_pin('Tu','hashTu')")"
has "a PIN cannot be overwritten by anon" "already set" "$(asanon "select public.set_first_pin('Tu','other')")"
eq  "a member (any name in Users) reads a private trip with the right PIN" 2 "$(asanon "select jsonb_array_length(public.get_private('macau','plan','Tu','hashTu'))")"
eq  "wrong PIN gets null"        t "$(asanon "select public.get_private('macau','plan','Tu','nope') is null")"
eq  "unknown name gets null"     t "$(asanon "select public.get_private('macau','plan','Stranger','hashTu') is null")"
eq  "stranger write returns -1" -1 "$(asanon "select public.private_write('macau','plan','save','[[\"a\"],[\"b\"]]'::jsonb,'Stranger','x')")"
eq  "member write appends"        1 "$(asanon "select public.private_write('macau','Expenses','append','[\"d\"]'::jsonb,'Tu','hashTu')")"
eq  "picture chunks readable by a member" 1 "$(asanon "select jsonb_array_length(public.get_private('macau','media:m1','Tu','hashTu'))")"
has "repeated wrong PINs are throttled" "too many" "$(asanon "do \$\$ declare i int; begin for i in 1..10 loop perform public.verify_pin('Tu','bad'||i); end loop; end \$\$;")"
eq  "usage_stats has db_bytes" t "$(asanon "select (public.usage_stats() ? 'db_bytes')")"
[ $fail -eq 0 ] && echo "SQL RESULT: all passed" || echo "SQL RESULT: FAILURES"
exit $fail
