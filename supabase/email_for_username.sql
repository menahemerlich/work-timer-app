-- OPTIONAL — only needed to log in by username on a brand-new device.
--
-- The app already remembers the username→email link locally after you sign in
-- (or up) once on a device, so username login works there without any setup.
-- This function extends that to fresh installs that have never logged in.
--
-- The app stores the chosen username in auth.users.raw_user_meta_data->>'username'
-- at sign-up time. Supabase's signInWithPassword only accepts an email, so the
-- desktop app first calls this function to translate a username into its email.
--
-- Run this once in the Supabase project: Dashboard → SQL Editor → New query → Run.

create or replace function public.email_for_username(p_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select u.email
  from auth.users u
  where u.raw_user_meta_data->>'username' = p_username
  limit 1;
$$;

-- Allow the app (anonymous + logged-in clients) to call the lookup.
grant execute on function public.email_for_username(text) to anon, authenticated;
