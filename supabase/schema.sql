create extension if not exists pgcrypto;

create table if not exists public.users (
  uid uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  email text,
  phone text,
  avatar_initials text not null,
  avatar_color text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists users_username_unique on public.users (username);
create unique index if not exists users_email_unique on public.users (email) where email is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  resolved_username text;
begin
  base_username := lower(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'user'
    )
  );

  resolved_username := left(regexp_replace(base_username, '[^a-z0-9_]+', '', 'g'), 20);
  if resolved_username = '' then
    resolved_username := 'user';
  end if;

  insert into public.users (uid, username, email, phone, avatar_initials, avatar_color)
  values (
    new.id,
    resolved_username,
    new.email,
    new.phone,
    upper(left(resolved_username, 2)),
    format('hsl(%s, 70%%, 50%%)', ascii(left(resolved_username, 1)) % 360)
  )
  on conflict (uid) do update
  set
    username = excluded.username,
    email = excluded.email,
    phone = excluded.phone;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  dm_id text not null,
  from_uid uuid not null references public.users (uid) on delete cascade,
  to_uid uuid not null references public.users (uid) on delete cascade,
  ciphertext text not null,
  cipher_type text,
  message_key text,
  timestamp bigint not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists direct_messages_dm_id_idx on public.direct_messages (dm_id, timestamp desc);
create index if not exists direct_messages_participants_idx on public.direct_messages (from_uid, to_uid, timestamp desc);

create table if not exists public.groups (
  group_id uuid primary key default gen_random_uuid(),
  name text not null,
  creator_uid uuid not null references public.users (uid) on delete cascade,
  members uuid[] not null,
  avatar_initials text not null,
  avatar_color text not null,
  created_at timestamptz not null default now()
);

create index if not exists groups_members_gin_idx on public.groups using gin (members);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (group_id) on delete cascade,
  from_uid uuid not null references public.users (uid) on delete cascade,
  ciphertext text not null,
  cipher_type text,
  key_envelopes jsonb not null default '{}'::jsonb,
  timestamp bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists group_messages_group_id_idx on public.group_messages (group_id, timestamp desc);

alter table public.users enable row level security;
alter table public.direct_messages enable row level security;
alter table public.groups enable row level security;
alter table public.group_messages enable row level security;

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

-- Username sign-in: resolve email before auth.uid() exists (anon cannot select public.users).
create or replace function public.get_login_email_for_username(p_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select coalesce(nullif(trim(u.email), ''), au.email)
  into v_email
  from public.users u
  inner join auth.users au on au.id = u.uid
  where u.username = lower(trim(p_username))
  limit 1;

  return v_email;
end;
$$;

revoke all on function public.get_login_email_for_username(text) from public;
grant execute on function public.get_login_email_for_username(text) to anon, authenticated;

drop policy if exists "direct_messages_select_participants" on public.direct_messages;
create policy "direct_messages_select_participants"
on public.direct_messages
for select
to authenticated
using (auth.uid() = from_uid or auth.uid() = to_uid);

drop policy if exists "direct_messages_insert_sender" on public.direct_messages;
create policy "direct_messages_insert_sender"
on public.direct_messages
for insert
to authenticated
with check (auth.uid() = from_uid);

drop policy if exists "groups_select_members" on public.groups;
create policy "groups_select_members"
on public.groups
for select
to authenticated
using (auth.uid() = any(members));

drop policy if exists "groups_insert_creator" on public.groups;
create policy "groups_insert_creator"
on public.groups
for insert
to authenticated
with check (auth.uid() = creator_uid and auth.uid() = any(members));

drop policy if exists "groups_update_creator" on public.groups;
create policy "groups_update_creator"
on public.groups
for update
to authenticated
using (auth.uid() = creator_uid)
with check (auth.uid() = creator_uid);

drop policy if exists "group_messages_select_group_members" on public.group_messages;
create policy "group_messages_select_group_members"
on public.group_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.groups g
    where g.group_id = group_messages.group_id
      and auth.uid() = any(g.members)
  )
);

drop policy if exists "group_messages_insert_group_members" on public.group_messages;
create policy "group_messages_insert_group_members"
on public.group_messages
for insert
to authenticated
with check (
  auth.uid() = from_uid
  and exists (
    select 1
    from public.groups g
    where g.group_id = group_messages.group_id
      and auth.uid() = any(g.members)
  )
);
