-- Run in Supabase SQL Editor (fixes uuid = text error when users.uid is text)

drop policy if exists "read users" on public.users;
drop policy if exists "authenticated read users" on public.users;
drop policy if exists "users_select" on public.users;
drop policy if exists "users_select_authenticated" on public.users;
drop policy if exists "insert own user" on public.users;
drop policy if exists "users_insert" on public.users;
drop policy if exists "users_insert_self" on public.users;
drop policy if exists "update own user" on public.users;
drop policy if exists "users_update" on public.users;
drop policy if exists "users_update_self" on public.users;

create policy "users_select"
on public.users
for select
using (auth.uid() is not null);

create policy "users_insert"
on public.users
for insert
with check (auth.uid()::text = uid::text);

create policy "users_update"
on public.users
for update
using (auth.uid()::text = uid::text);

-- Backfill null avatar fields
update public.users
set
  avatar_initials = upper(left(username, 2)),
  avatar_color = '#2c5f8a'
where
  avatar_initials is null
  or avatar_color is null
  or avatar_initials = ''
  or avatar_color = '';
