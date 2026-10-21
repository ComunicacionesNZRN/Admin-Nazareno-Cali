-- A1 · Mi grupo: cada líder ve y reporta solo su propio grupo.
-- Idempotente: se puede correr varias veces sin problema.

-- 1. Vínculo líder ↔ grupo: correo de la cuenta del panel del líder.
alter table public.grupos_conexion add column if not exists lider_email text;
create index if not exists grupos_conexion_lider_email_idx
  on public.grupos_conexion (lower(lider_email));

-- 2. Un informe nunca puede quedar sin grupo.
--    NOT VALID: no falla por informes viejos con grupo_id null, pero bloquea los nuevos.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.grupos_reportes'::regclass
                   and conname = 'grupos_reportes_grupo_id_requerido') then
    alter table public.grupos_reportes
      add constraint grupos_reportes_grupo_id_requerido check (grupo_id is not null) not valid;
  end if;
end $$;

-- 3. ¿Quién puede enviar el informe de un grupo?
create or replace function public.puede_gestionar_grupo(p_grupo_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) = 'comunicaciones@nazarenocali.org'
    or exists (select 1 from public.admin_perfiles ap
               where ap.usuario_id = auth.uid()
                 and lower(trim(coalesce(ap.rol, ''))) = 'director plan del maestro')
    or exists (select 1 from public.grupos_conexion g
               where g.id::text = p_grupo_id
                 and lower(trim(g.lider_email)) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.puede_gestionar_grupo(text) from public, anon;
grant execute on function public.puede_gestionar_grupo(text) to authenticated;

-- 4. RLS de informes. Si la tabla no tenía RLS, se activa conservando el acceso
--    actual de usuarios autenticados, y se agrega una regla RESTRICTIVA para insertar.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.grupos_reportes'::regclass) then
    alter table public.grupos_reportes enable row level security;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='grupos_reportes'
                   and policyname='Autenticados usan informes') then
      create policy "Autenticados usan informes" on public.grupos_reportes
        for all to authenticated using (true) with check (true);
    end if;
  end if;
end $$;

drop policy if exists "Lider inserta informes de su grupo" on public.grupos_reportes;
create policy "Lider inserta informes de su grupo" on public.grupos_reportes
  as restrictive for insert to authenticated
  with check (grupo_id is not null and public.puede_gestionar_grupo(grupo_id::text));

notify pgrst, 'reload schema';

-- Verificación
select id, nombre, lider, lider_email from public.grupos_conexion order by nombre;
select policyname, permissive, cmd from pg_policies where tablename = 'grupos_reportes';
