
revoke all on function public.owns_vendor(uuid, uuid) from public, anon;
revoke all on function public.can_access_dispute(uuid, uuid) from public, anon;
grant execute on function public.owns_vendor(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_access_dispute(uuid, uuid) to authenticated, service_role;
