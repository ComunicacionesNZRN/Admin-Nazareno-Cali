alter table public.admin_perfiles
  add column if not exists last_seen_at timestamptz;

alter table public.admin_perfiles enable row level security;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_perfiles'
  loop
    execute format('drop policy %I on public.admin_perfiles', existing_policy.policyname);
  end loop;
end;
$$;

create policy "Members can read own profile"
  on public.admin_perfiles for select to authenticated
  using (usuario_id = auth.uid());

create policy "Owner can read all profiles"
  on public.admin_perfiles for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'comunicaciones@nazarenocali.org');

create policy "Members can update own profile"
  on public.admin_perfiles for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

create policy "Owner can update all profiles"
  on public.admin_perfiles for update to authenticated
  using (lower(auth.jwt() ->> 'email') = 'comunicaciones@nazarenocali.org')
  with check (lower(auth.jwt() ->> 'email') = 'comunicaciones@nazarenocali.org');

create policy "Owner can create profiles"
  on public.admin_perfiles for insert to authenticated
  with check (lower(auth.jwt() ->> 'email') = 'comunicaciones@nazarenocali.org');

revoke all on public.admin_perfiles from anon;
revoke delete on public.admin_perfiles from authenticated;
grant select, insert, update on public.admin_perfiles to authenticated;

create or replace function public.proteger_campos_admin_perfil()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'comunicaciones@nazarenocali.org'
    and (
      new.rol is distinct from old.rol
      or new.permisos is distinct from old.permisos
      or new.activo is distinct from old.activo
      or new.correo is distinct from old.correo
    ) then
    raise exception 'Solo la cuenta administradora puede modificar rol, permisos, estado o correo.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_campos_admin_perfil on public.admin_perfiles;
create trigger proteger_campos_admin_perfil
  before update on public.admin_perfiles
  for each row execute function public.proteger_campos_admin_perfil();

create or replace function public.marcar_conexion()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.admin_perfiles
  set last_seen_at = now()
  where usuario_id = auth.uid();
$$;

revoke all on function public.marcar_conexion() from public, anon;
grant execute on function public.marcar_conexion() to authenticated;

create or replace function public.listar_miembros()
returns setof jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if lower(coalesce(auth.jwt() ->> 'email', '')) <> 'comunicaciones@nazarenocali.org' then
    raise exception 'Solo la cuenta administradora puede consultar los miembros.'
      using errcode = '42501';
  end if;

  return query
  select to_jsonb(member) || jsonb_build_object(
    'last_sign_in_at', auth_user.last_sign_in_at,
    'email_confirmed_at', auth_user.email_confirmed_at
  )
  from public.admin_perfiles as member
  left join auth.users as auth_user on auth_user.id = member.usuario_id
  order by member.created_at desc nulls last, member.correo;
end;
$$;

revoke all on function public.listar_miembros() from public, anon;
grant execute on function public.listar_miembros() to authenticated;