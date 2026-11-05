-- Rolle eines Mitglieds ändern (nur Admins)
create or replace function public.set_user_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.app_role;
begin
  if coalesce(public.get_my_role()::text, '') <> 'admin' then
    raise exception 'Keine Berechtigung';
  end if;

  select role into v_current from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Benutzer nicht gefunden';
  end if;
  if v_current = p_role then
    return;
  end if;

  -- Es muss immer mindestens ein Admin übrig bleiben
  if v_current = 'admin'
     and (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'Der letzte Admin kann nicht herabgestuft werden';
  end if;

  update public.profiles set role = p_role where id = p_user_id;
end;
$$;

revoke all on function public.set_user_role(uuid, public.app_role) from public, anon;
grant execute on function public.set_user_role(uuid, public.app_role) to authenticated;
