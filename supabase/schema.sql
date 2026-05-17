-- Run in Supabase SQL Editor

create table users (
  uid              text primary key,
  username         text unique not null,
  email            text,
  phone            text,
  avatar_initials  text,
  avatar_color     text,
  created_at       timestamptz default now()
);

create table groups (
  group_id        text primary key,
  name            text not null,
  creator_uid     text not null,
  members         text[] not null default '{}',
  avatar_initials text,
  avatar_color    text,
  created_at      timestamptz default now()
);

create table direct_messages (
  id           text primary key,
  dm_id        text not null,
  from_uid     text not null,
  to_uid       text not null,
  ciphertext   text not null,
  cipher_type  text,
  key          text,
  timestamp    bigint not null
);
create index on direct_messages (dm_id);
create index on direct_messages (from_uid);
create index on direct_messages (to_uid);

create table group_messages (
  id            text primary key,
  group_id      text not null,
  from_uid      text not null,
  ciphertext    text not null,
  cipher_type   text,
  key_envelopes jsonb default '{}',
  timestamp     bigint not null
);
create index on group_messages (group_id);

alter publication supabase_realtime add table direct_messages;
alter publication supabase_realtime add table group_messages;

alter table users enable row level security;
alter table groups enable row level security;
alter table direct_messages enable row level security;
alter table group_messages enable row level security;

create policy "authenticated read users"
  on users for select using (auth.role() = 'authenticated');
create policy "insert own user"
  on users for insert with check (auth.uid()::text = uid);
create policy "update own user"
  on users for update using (auth.uid()::text = uid);

create policy "read own dms"
  on direct_messages for select
  using (auth.uid()::text = from_uid or auth.uid()::text = to_uid);
create policy "insert own dm"
  on direct_messages for insert
  with check (auth.uid()::text = from_uid);

create policy "read group messages"
  on group_messages for select
  using (
    exists (
      select 1 from groups
      where group_id = group_messages.group_id
        and auth.uid()::text = any(members)
    )
  );
create policy "insert group message"
  on group_messages for insert
  with check (auth.uid()::text = from_uid);

create policy "read groups"
  on groups for select
  using (auth.uid()::text = any(members));
create policy "create group"
  on groups for insert
  with check (auth.uid()::text = creator_uid);
create policy "update group"
  on groups for update
  using (auth.uid()::text = any(members));
