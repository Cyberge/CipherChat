-- Run once in Supabase SQL Editor.
-- Allows username + password sign-in before the user has a session (RLS blocks anon reads on public.users).

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
