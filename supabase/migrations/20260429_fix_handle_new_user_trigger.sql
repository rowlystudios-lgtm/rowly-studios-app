-- =================================================================
-- 20260429_fix_handle_new_user_trigger.sql
--
-- The trigger that runs on auth.users insert was hardcoding
-- profiles.role to 'talent' and dropping full_name entirely. This
-- caused client invite links to produce talent accounts, since the
-- role was passed in user_metadata but never read by the trigger.
--
-- New behaviour: read role and full_name from raw_user_meta_data,
-- with a safe-list fallback to 'talent' if the role is missing or
-- not one of the allowed enum values.
-- =================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  meta_role text := coalesce(new.raw_user_meta_data->>'role', 'talent');
  safe_role text := case
    when meta_role in ('talent', 'client', 'admin') then meta_role
    else 'talent'
  end;
  meta_full_name text := coalesce(new.raw_user_meta_data->>'full_name', '');
begin
  insert into public.profiles (id, email, role, full_name)
  values (new.id, new.email, safe_role, meta_full_name)
  on conflict (id) do nothing;
  return new;
end;
$function$;
