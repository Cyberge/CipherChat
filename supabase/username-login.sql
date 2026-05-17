-- Run once in Supabase SQL Editor (re-run if you already applied an older version).
-- Allows username + password sign-in before the user has a session (RLS blocks anon reads on public.users).

create or replace function public.get_login_email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select nullif(trim(email), '')
  from public.users
  where username = lower(trim(p_username))
  limit 1;
$$;

revoke all on function public.get_login_email_for_username(text) from public;
grant execute on function public.get_login_email_for_username(text) to anon, authenticated;
