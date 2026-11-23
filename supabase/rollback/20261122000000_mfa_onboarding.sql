begin;
drop function public.onboard_organisation(text, text);
drop policy audit_log_require_mfa on public.audit_log;
drop policy profiles_require_mfa on public.profiles;
drop policy memberships_require_mfa on public.memberships;
drop policy organisations_require_mfa on public.organisations;
commit;
