-- Seed the operator account with the admin role so the new requireAdmin
-- middleware authorises them (replaces the retired owner-token gate).
-- Idempotent: uses NOT EXISTS so it is safe to re-run and does not depend on a
-- unique constraint on (user_id, role). The account must already exist in
-- auth.users (i.e. the operator has signed in at least once with this email).
insert into public.user_roles (user_id, role)
select u.id, 'admin'::public.app_role
from auth.users u
where u.email = 'murray@murrayhc.com'
  and not exists (
    select 1
    from public.user_roles r
    where r.user_id = u.id
      and r.role = 'admin'::public.app_role
  );
