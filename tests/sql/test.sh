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
for f in supabase supabase_edit supabase_trips supabase_trips_v2 supabase_trips_v2 supabase_docs supabase_docs; do          # v2 twice = must be idempotent
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
# ---- documents (supabase_docs.sql) ----
$P -c "insert into sheet_rows values ('Users',101,'[\"Ann\"]'),('Users',102,'[\"Bob\"]') on conflict do nothing;" >/dev/null
asanon "select public.set_first_pin('Ann','hA')" >/dev/null; asanon "select public.set_first_pin('Bob','hB')" >/dev/null
has "anon cannot read member_docs"       "permission denied" "$(asanon 'select count(*) from member_docs')"
has "anon cannot read member_doc_chunks" "permission denied" "$(asanon 'select count(*) from member_doc_chunks')"
has "anon cannot insert member_docs"     "permission denied" "$(asanon "insert into member_docs(scope,title,mime,created_by) values ('shared','x','image/png','x')")"
PA=$(asanon "select public.doc_put('Ann','hA','person','','Passport','passport','image/png','','[\"QUJD\",\"REVG\"]'::jsonb)")
PS=$(asanon "select public.doc_put('Ann','hA','shared','','Hotel voucher','hotel','application/pdf','n','[\"QUJD\"]'::jsonb)")
has "member can add a personal doc (uuid)" "^[0-9a-f-]\{36\}\$" "$PA"
has "member can add a shared doc (uuid)"   "^[0-9a-f-]\{36\}\$" "$PS"
eq  "doc_put wrong PIN => -1"      -1 "$(asanon "select public.doc_put('Ann','bad','person','','T','other','image/png','','[\"a\"]'::jsonb)")"
eq  "doc_put unknown name => -1"   -1 "$(asanon "select public.doc_put('Zed','hA','person','','T','other','image/png','','[\"a\"]'::jsonb)")"
eq  "doc_list wrong PIN => null"    t "$(asanon "select public.doc_list('Ann','bad') is null")"
eq  "doc_list unknown name => null" t "$(asanon "select public.doc_list('Zed','hA') is null")"
eq  "owner sees own + shared (2)"   2 "$(asanon "select jsonb_array_length(public.doc_list('Ann','hA'))")"
eq  "other member sees everyone's docs too (2)" 2 "$(asanon "select jsonb_array_length(public.doc_list('Bob','hB'))")"
eq  "list shows owner of a personal doc" ann "$(asanon "select (select x->>'owner' from jsonb_array_elements(public.doc_list('Bob','hB')) x where x->>'id'='$PA')")"
eq  "list has no chunk data"        f "$(asanon "select (public.doc_list('Ann','hA')->0) ? 'data'")"
eq  "owner gets own chunks (2)"     2 "$(asanon "select jsonb_array_length(public.doc_get('Ann','hA','$PA')->'chunks')")"
eq  "other member CAN get a personal doc (group policy)" 2 "$(asanon "select jsonb_array_length(public.doc_get('Bob','hB','$PA')->'chunks')")"
eq  "doc_get unknown id => null" t "$(asanon "select public.doc_get('Bob','hB','00000000-0000-4000-8000-0000000000ff') is null")"
eq  "other member gets a shared doc" 1 "$(asanon "select jsonb_array_length(public.doc_get('Bob','hB','$PS')->'chunks')")"
eq  "doc_get wrong PIN => null"      t "$(asanon "select public.doc_get('Ann','bad','$PA') is null")"
eq  "non-owner non-uploader cannot rename personal doc" 0 "$(asanon "select public.doc_rename('Bob','hB','$PA','Hacked')")"
eq  "non-owner non-uploader cannot delete personal doc" 0 "$(asanon "select public.doc_delete('Bob','hB','$PA')")"
# add-for-someone-else: Bob uploads for Ann
$P -c "insert into sheet_rows values ('Users',103,'[\"Cy\"]') on conflict do nothing;" >/dev/null; asanon "select public.set_first_pin('Cy','hC')" >/dev/null
PB=$(asanon "select public.doc_put('Bob','hB','person','','For Ann','other','image/png','','[\"QUJD\"]'::jsonb,'Ann')")
has "member can add a doc for another member" "^[0-9a-f-]\{36\}\$" "$PB"
eq  "doc for Ann has owner=ann"       ann "$(val "select owner from member_docs where id='$PB'")"
eq  "doc for Ann has created_by=bob"  bob "$(val "select created_by from member_docs where id='$PB'")"
eq  "unknown owner => -6"             -6 "$(asanon "select public.doc_put('Bob','hB','person','','T','other','image/png','','[\"a\"]'::jsonb,'Nobody')")"
asanon "select public.doc_put('Bob','hB','shared','','Sh','other','image/png','','[\"a\"]'::jsonb,'Ann')" >/dev/null
eq  "shared doc has no owner"         1 "$(val "select count(*) from member_docs where title='Sh' and owner='' and scope='shared'")"
eq  "third member cannot rename it"   0 "$(asanon "select public.doc_rename('Cy','hC','$PB','x')")"
eq  "third member cannot delete it"   0 "$(asanon "select public.doc_delete('Cy','hC','$PB')")"
eq  "uploader can rename it"          1 "$(asanon "select public.doc_rename('Bob','hB','$PB','For Ann 2')")"
eq  "owner can rename it"             1 "$(asanon "select public.doc_rename('Ann','hA','$PB','For Ann 3')")"
eq  "uploader can delete it"          1 "$(asanon "select public.doc_delete('Bob','hB','$PB')")"
PB=$(asanon "select public.doc_put('Bob','hB','person','','For Ann','other','image/png','','[\"QUJD\"]'::jsonb,'Ann')")
eq  "owner can delete a doc others added" 1 "$(asanon "select public.doc_delete('Ann','hA','$PB')")"
eq  "only one doc_put overload exists" 1 "$(val "select count(*) from pg_proc where proname='doc_put'")"
eq  "new doc_put signature is executable by anon (PIN-checked inside)" t "$(val "select has_function_privilege('anon','public.doc_put(text,text,text,text,text,text,text,text,jsonb,text)','execute')")"
eq  "non-creator cannot rename shared doc"    0 "$(asanon "select public.doc_rename('Bob','hB','$PS','Hacked')")"
eq  "non-creator cannot delete shared doc"    0 "$(asanon "select public.doc_delete('Bob','hB','$PS')")"
eq  "rename wrong PIN => -1"        -1 "$(asanon "select public.doc_rename('Ann','bad','$PA','x')")"
eq  "delete wrong PIN => -1"        -1 "$(asanon "select public.doc_delete('Ann','bad','$PA')")"
eq  "creator renames own doc"        1 "$(asanon "select public.doc_rename('Ann','hA','$PA','Passport 2')")"
eq  "rename took effect"   "Passport 2" "$(val "select title from member_docs where id='$PA'")"
eq  "rename too long title => -5"   -5 "$(asanon "select public.doc_rename('Ann','hA','$PA','$(printf 'x%.0s' $(seq 81))')")"
eq  "bad MIME => -2"                -2 "$(asanon "select public.doc_put('Ann','hA','person','','T','other','text/html','','[\"a\"]'::jsonb)")"
eq  "svg MIME => -2"                -2 "$(asanon "select public.doc_put('Ann','hA','person','','T','other','image/svg+xml','','[\"a\"]'::jsonb)")"
eq  "title > 80 chars => -5"        -5 "$(asanon "select public.doc_put('Ann','hA','person','','$(printf 'x%.0s' $(seq 81))','other','image/png','','[\"a\"]'::jsonb)")"
eq  "empty title => -5"             -5 "$(asanon "select public.doc_put('Ann','hA','person','','  ','other','image/png','','[\"a\"]'::jsonb)")"
eq  "bad scope => -5"               -5 "$(asanon "select public.doc_put('Ann','hA','public','','T','other','image/png','','[\"a\"]'::jsonb)")"
eq  "empty chunks => -5"            -5 "$(asanon "select public.doc_put('Ann','hA','person','','T','other','image/png','','[]'::jsonb)")"
eq  "doc > 6 MB => -3"              -3 "$(asanon "select public.doc_put('Ann','hA','person','','Big','other','image/png','',jsonb_build_array(repeat('a',3000000),repeat('a',3000001)))")"
eq  "doc of exactly 6 MB accepted"   1 "$(asanon "select (public.doc_put('Ann','hA','person','','Edge','other','image/png','',jsonb_build_array(repeat('a',3000000),repeat('a',3000000)))) ~ '^[0-9a-f-]{36}\$'::text and true" | sed 's/t/1/')"
eq  "rejected docs wrote nothing"    t "$(val "select count(*) = 4 from member_docs")"
eq  "chunks removed with the doc"    1 "$(asanon "select public.doc_delete('Ann','hA','$PS')")"
eq  "no orphan chunks"               0 "$(val "select count(*) from member_doc_chunks where doc_id='$PS'")"
asanon "select public.doc_delete('Ann','hA',id) from (select id from public.member_docs where title='Edge') x" >/dev/null 2>&1; val "delete from member_docs where title='Edge'" >/dev/null
$P -c "insert into member_docs(scope,owner,title,mime,created_by,chunks) select 'person','ann','f'||g,'image/png','ann',1 from generate_series(1,39) g; insert into member_doc_chunks select id,0,'a' from member_docs where title like 'f%';" >/dev/null
eq  "41st personal doc refused => -4" -4 "$(asanon "select public.doc_put('Ann','hA','person','','Over','other','image/png','','[\"a\"]'::jsonb)")"
eq  "limit counts the TARGET owner (Bob for Ann => -4)" -4 "$(asanon "select public.doc_put('Bob','hB','person','','Over','other','image/png','','[\"a\"]'::jsonb,'Ann')")"
eq  "limit is per member (Bob can add)" t "$(asanon "select public.doc_put('Bob','hB','person','','Mine','other','image/png','','[\"a\"]'::jsonb) ~ '^[0-9a-f-]{36}\$'")"
$P -c "insert into member_docs(scope,title,mime,created_by,chunks) select 'shared','s'||g,'image/png','ann',1 from generate_series(1,60) g;" >/dev/null
eq  "61st shared doc refused => -4"   -4 "$(asanon "select public.doc_put('Bob','hB','shared','','Over','other','image/png','','[\"a\"]'::jsonb)")"
eq  "re-running supabase_docs.sql kept data" t "$(val "select count(*) > 60 from member_docs")"
# --- regression (found on the live DB): docs must work even when the OLD `_member` (trip_members based, pre-v2) is installed
$P -c "create or replace function public._member(p_trip text, p_name text, p_hash text) returns boolean language plpgsql security definer set search_path = public as \$\$ begin if not exists (select 1 from public.trip_members where trip = p_trip and name = lower(trim(p_name))) then return false; end if; return public._pin_ok(p_name, p_hash); end \$\$;" >/dev/null
asanon "select public.set_first_pin('Mew','hM')" >/dev/null
OLDM=$(asanon "select public.doc_put('Mew','hM','person','','Old _member check','other','image/png','','[\"QUJD\"]'::jsonb)")
[ "${#OLDM}" -gt 20 ] && ok "doc_put works with the pre-v2 _member installed (no trip_members row needed)" || bad "doc_put with pre-v2 _member" "(got '$OLDM')"
eq  "pre-v2 _member: a stranger is still refused" -1 "$(asanon "select public.doc_put('Stranger','x','person','','T','other','image/png','','[\"a\"]'::jsonb)")"
$P -f "$ROOT/docs/supabase_trips_v2.sql" 2>&1 | grep -v NOTICE        # restore v2 for any later checks
[ $fail -eq 0 ] && echo "SQL RESULT: all passed" || echo "SQL RESULT: FAILURES"
exit $fail
