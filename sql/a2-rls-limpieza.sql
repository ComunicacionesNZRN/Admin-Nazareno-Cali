-- A2 · Limpieza de permisos (RLS) del panel admin.
-- Idempotente. Correr DESPUÉS de sql/a1-mi-grupo.sql (usa puede_gestionar_grupo).
-- Antes de cambiar nada guarda una copia exacta de las políticas actuales en
-- public.a2_rls_backup; sql/a2-rls-rollback.sql las restaura desde ahí.

-- 0. Copia de seguridad (solo la primera vez: no se sobrescribe al re-ejecutar)
create table if not exists public.a2_rls_backup (
  tablename text, policyname text, permissive text, roles name[], cmd text,
  qual text, with_check text, guardado_at timestamptz default now()
);
alter table public.a2_rls_backup enable row level security;  -- sin políticas: nadie la lee por la API
insert into public.a2_rls_backup (tablename, policyname, permissive, roles, cmd, qual, with_check)
select tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename in ('devocionales','encuentros_config','encuentros_inscripciones','grupos_conexion',
                     'grupos_integrantes','grupos_reportes','guias_biblicas','nosotros_equipo',
                     'plan_maestro_manuales','redes_12')
   and not exists (select 1 from public.a2_rls_backup);

-- 1. Funciones de permiso (reflejan hasPermission() de admin-auth.js)
create or replace function public.admin_es_principal()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email','')) = 'comunicaciones@nazarenocali.org'
      or exists (select 1 from public.admin_perfiles ap
                  where ap.usuario_id = auth.uid() and coalesce(ap.activo, true)
                    and lower(trim(coalesce(ap.rol,''))) in ('principal','admin','superadmin','super admin','administrador principal'));
$$;

create or replace function public.admin_es_miembro()
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_es_principal()
      or exists (select 1 from public.admin_perfiles ap
                  where ap.usuario_id = auth.uid() and coalesce(ap.activo, true));
$$;

create or replace function public.admin_tiene_modulo(p_modulo text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.admin_es_principal()
      or exists (
        select 1 from public.admin_perfiles ap
         where ap.usuario_id = auth.uid() and coalesce(ap.activo, true)
           and ( coalesce((ap.permisos ->> p_modulo)::boolean, false)
              or (lower(trim(coalesce(ap.rol,''))) = 'director creativo'
                  and p_modulo in ('carrusel','eventos','devocionales'))
              or (lower(trim(coalesce(ap.rol,''))) = 'director plan del maestro'
                  and p_modulo in ('grupos','devocionales','plan_maestro','encuentros','equipo','bautismos')) ));
$$;
revoke all on function public.admin_es_principal(), public.admin_es_miembro(), public.admin_tiene_modulo(text) from public, anon;
grant execute on function public.admin_es_principal(), public.admin_es_miembro(), public.admin_tiene_modulo(text) to authenticated;

-- 2. Borrar las políticas abiertas (por nombre exacto del dump del 21-oct)
drop policy if exists "Escritura admin devocionales"      on public.devocionales;
drop policy if exists "devocionales eliminar admin"       on public.devocionales;
drop policy if exists "devocionales insertar admin"       on public.devocionales;
drop policy if exists "devocionales lectura admin"        on public.devocionales;
drop policy if exists "devocionales actualizar admin"     on public.devocionales;
drop policy if exists "Lectura publica devocionales"      on public.devocionales;
drop policy if exists "Escritura admin config encuentros" on public.encuentros_config;
drop policy if exists "Admin gestion inscripciones"       on public.encuentros_inscripciones;
drop policy if exists "Lectura propia o admin inscripciones" on public.encuentros_inscripciones;
drop policy if exists "Escritura admin grupos"            on public.grupos_conexion;
drop policy if exists "Acceso autenticados integrantes"   on public.grupos_integrantes;
drop policy if exists "Acceso autenticados reportes"      on public.grupos_reportes;
drop policy if exists "Autenticados usan informes"        on public.grupos_reportes;
drop policy if exists "Authenticated users can read all guides" on public.guias_biblicas;
drop policy if exists "Gestion del equipo para administradores" on public.nosotros_equipo;

-- guias_biblicas, plan_maestro_manuales y redes_12: el resumen del dump no trae los nombres
-- exactos de las políticas 'true'; se borran las que sean permisivas con condición 'true'
-- (o sin condición). Quedan guardadas en a2_rls_backup.
do $$
declare p record;
begin
  for p in select tablename, policyname from pg_policies
            where schemaname = 'public'
              and tablename in ('guias_biblicas','plan_maestro_manuales','redes_12')
              and permissive = 'PERMISSIVE'
              and policyname not like 'a2 %'
              and coalesce(qual,'true') = 'true' and coalesce(with_check,'true') = 'true'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- 3. Políticas nuevas (prefijo "a2 ")
-- devocionales: público solo ve publicados; admins con módulo gestionan; cualquier admin lee (dashboard)
drop policy if exists "a2 publico lee devocionales publicados" on public.devocionales;
create policy "a2 publico lee devocionales publicados" on public.devocionales for select to anon, authenticated
  using (publicado = true and (publicar_at is null or publicar_at <= now()));
drop policy if exists "a2 admins leen devocionales" on public.devocionales;
create policy "a2 admins leen devocionales" on public.devocionales for select to authenticated
  using (public.admin_es_miembro());
drop policy if exists "a2 modulo devocionales escribe" on public.devocionales;
create policy "a2 modulo devocionales escribe" on public.devocionales for all to authenticated
  using (public.admin_tiene_modulo('devocionales')) with check (public.admin_tiene_modulo('devocionales'));

-- guias_biblicas (se editan en devocionales.html; la web pública lee la guía activa)
drop policy if exists "a2 publico lee guia activa" on public.guias_biblicas;
create policy "a2 publico lee guia activa" on public.guias_biblicas for select to anon, authenticated
  using (activa = true);
drop policy if exists "a2 admins leen guias" on public.guias_biblicas;
create policy "a2 admins leen guias" on public.guias_biblicas for select to authenticated
  using (public.admin_es_miembro());
drop policy if exists "a2 modulo devocionales escribe guias" on public.guias_biblicas;
create policy "a2 modulo devocionales escribe guias" on public.guias_biblicas for all to authenticated
  using (public.admin_tiene_modulo('devocionales')) with check (public.admin_tiene_modulo('devocionales'));

-- encuentros_config (la web pública la lee)
drop policy if exists "a2 publico lee config encuentros" on public.encuentros_config;
create policy "a2 publico lee config encuentros" on public.encuentros_config for select to anon, authenticated using (true);
drop policy if exists "a2 modulo encuentros escribe config" on public.encuentros_config;
create policy "a2 modulo encuentros escribe config" on public.encuentros_config for all to authenticated
  using (public.admin_tiene_modulo('encuentros')) with check (public.admin_tiene_modulo('encuentros'));

-- encuentros_inscripciones: la inscripción pública (INSERT anon) NO se toca.
drop policy if exists "a2 modulo encuentros gestiona inscripciones" on public.encuentros_inscripciones;
create policy "a2 modulo encuentros gestiona inscripciones" on public.encuentros_inscripciones for all to authenticated
  using (public.admin_tiene_modulo('encuentros')) with check (public.admin_tiene_modulo('encuentros'));
-- Ticket público sin exponer la tabla: solo devuelve una fila por código exacto.
create or replace function public.ver_ticket_encuentro(p_codigo text)
returns table (codigo_ticket text, tipo_encuentro text, nombres text, apellidos text, valor_pagado numeric)
language sql stable security definer set search_path = public as $$
  select i.codigo_ticket::text, i.tipo_encuentro::text, i.nombres::text, i.apellidos::text, i.valor_pagado::numeric
    from public.encuentros_inscripciones i
   where p_codigo is not null and length(p_codigo) >= 6 and i.codigo_ticket::text = p_codigo
   limit 1;
$$;
grant execute on function public.ver_ticket_encuentro(text) to anon, authenticated;

-- grupos_conexion (las lecturas públicas existentes no se tocan)
drop policy if exists "a2 modulo grupos escribe" on public.grupos_conexion;
create policy "a2 modulo grupos escribe" on public.grupos_conexion for all to authenticated
  using (public.admin_tiene_modulo('grupos')) with check (public.admin_tiene_modulo('grupos'));
drop policy if exists "a2 admins leen grupos" on public.grupos_conexion;
create policy "a2 admins leen grupos" on public.grupos_conexion for select to authenticated
  using (public.admin_es_miembro());

-- grupos_integrantes y grupos_reportes: líder del grupo + admins de grupos / plan maestro
drop policy if exists "a2 lider o admin gestiona integrantes" on public.grupos_integrantes;
create policy "a2 lider o admin gestiona integrantes" on public.grupos_integrantes for all to authenticated
  using (public.puede_gestionar_grupo(grupo_id::text) or public.admin_tiene_modulo('grupos') or public.admin_tiene_modulo('plan_maestro'))
  with check (public.puede_gestionar_grupo(grupo_id::text) or public.admin_tiene_modulo('grupos') or public.admin_tiene_modulo('plan_maestro'));
drop policy if exists "a2 lider o admin gestiona informes" on public.grupos_reportes;
create policy "a2 lider o admin gestiona informes" on public.grupos_reportes for all to authenticated
  using (public.puede_gestionar_grupo(grupo_id::text) or public.admin_tiene_modulo('grupos') or public.admin_tiene_modulo('plan_maestro'))
  with check (public.puede_gestionar_grupo(grupo_id::text) or public.admin_tiene_modulo('grupos') or public.admin_tiene_modulo('plan_maestro'));
-- (la restrictiva "Lider inserta informes de su grupo" de A1 se mantiene)

-- nosotros_equipo (página Nosotros pública)
drop policy if exists "a2 publico lee equipo" on public.nosotros_equipo;
create policy "a2 publico lee equipo" on public.nosotros_equipo for select to anon, authenticated using (true);
drop policy if exists "a2 modulo equipo escribe" on public.nosotros_equipo;
create policy "a2 modulo equipo escribe" on public.nosotros_equipo for all to authenticated
  using (public.admin_tiene_modulo('equipo')) with check (public.admin_tiene_modulo('equipo'));

-- plan_maestro_manuales: todo admin (incl. líderes) lee; plan_maestro escribe
drop policy if exists "a2 admins leen manuales" on public.plan_maestro_manuales;
create policy "a2 admins leen manuales" on public.plan_maestro_manuales for select to authenticated
  using (public.admin_es_miembro());
drop policy if exists "a2 modulo plan maestro escribe manuales" on public.plan_maestro_manuales;
create policy "a2 modulo plan maestro escribe manuales" on public.plan_maestro_manuales for all to authenticated
  using (public.admin_tiene_modulo('plan_maestro')) with check (public.admin_tiene_modulo('plan_maestro'));

-- redes_12: solo plan_maestro
drop policy if exists "a2 modulo plan maestro redes" on public.redes_12;
create policy "a2 modulo plan maestro redes" on public.redes_12 for all to authenticated
  using (public.admin_tiene_modulo('plan_maestro')) with check (public.admin_tiene_modulo('plan_maestro'));

notify pgrst, 'reload schema';

-- Verificación: no debería quedar ninguna escritura permisiva con 'true'
select tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public'
   and tablename in ('devocionales','encuentros_config','encuentros_inscripciones','grupos_conexion',
                     'grupos_integrantes','grupos_reportes','guias_biblicas','nosotros_equipo',
                     'plan_maestro_manuales','redes_12')
 order by tablename, cmd, policyname;
