-- fix-system-logs.sql — Reparar el registro de auditoría (system_logs). Idempotente: se puede correr varias veces.
-- Supabase > SQL Editor > pegar todo > Run.
-- Mantiene: solo comunicaciones@nazarenocali.org lee; cada admin inserta solo a su nombre; el servidor pone usuario_id/usuario_email.

create extension if not exists pgcrypto;

-- 1) Tabla y columnas (por si nunca se creó o le faltan columnas)
create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  accion text not null,
  seccion text not null,
  estado text not null,
  created_at timestamptz not null default now()
);
alter table public.system_logs add column if not exists usuario_id uuid;
alter table public.system_logs add column if not exists usuario_email text;
alter table public.system_logs alter column id set default gen_random_uuid();
alter table public.system_logs alter column created_at set default now();
alter table public.system_logs alter column usuario_id set default auth.uid();
alter table public.system_logs alter column usuario_email set default (auth.jwt() ->> 'email');
alter table public.system_logs alter column usuario_id drop not null;
alter table public.system_logs alter column usuario_email drop not null;

-- 2) CHECK de estado: rehacerlo con los valores que usa el panel
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.system_logs'::regclass and contype = 'c'
  loop
    execute format('alter table public.system_logs drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.system_logs
  add constraint system_logs_estado_check check (estado in ('en_proceso', 'exito', 'error', 'pendiente'));

create index if not exists system_logs_created_at_idx on public.system_logs (created_at);

-- 3) Servidor llena quién hizo la acción (aunque el navegador mande otra cosa)
create or replace function public.system_logs_set_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.usuario_id := auth.uid();
    new.usuario_email := auth.jwt() ->> 'email';
  end if;
  return new;
end; $$;
drop trigger if exists system_logs_set_usuario on public.system_logs;
create trigger system_logs_set_usuario before insert on public.system_logs
  for each row execute function public.system_logs_set_usuario();

-- 4) RLS: borrar TODAS las políticas viejas y crear las dos correctas
alter table public.system_logs enable row level security;
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'system_logs'
  loop
    execute format('drop policy %I on public.system_logs', p.policyname);
  end loop;
end $$;

create policy "Solo cuenta madre lee system logs"
  on public.system_logs for select to authenticated
  using (lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = 'comunicaciones@nazarenocali.org');

create policy "Admins insertan sus propios logs"
  on public.system_logs for insert to authenticated
  with check (auth.uid() is not null and usuario_id = auth.uid());

revoke all on public.system_logs from anon;
grant select, insert on public.system_logs to authenticated;

-- 5) RPC de respaldo: el navegador puede registrar con rpc('registrar_log', ...) aunque falle el insert directo
create or replace function public.registrar_log(p_accion text, p_seccion text, p_estado text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida' using errcode = '42501';
  end if;
  insert into public.system_logs (accion, seccion, estado, usuario_id, usuario_email)
  values (left(coalesce(p_accion, 'Actividad sin descripción'), 500),
          left(coalesce(p_seccion, 'sistema'), 100),
          case when p_estado in ('en_proceso', 'exito', 'error', 'pendiente') then p_estado else 'error' end,
          auth.uid(), auth.jwt() ->> 'email');
end; $$;
revoke all on function public.registrar_log(text, text, text) from public, anon;
grant execute on function public.registrar_log(text, text, text) to authenticated;

-- 6) Realtime (lo usa el dashboard)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'system_logs') then
    execute 'alter publication supabase_realtime add table public.system_logs';
  end if;
end $$;

notify pgrst, 'reload schema';

-- 7) Verificación (no inserta nada). Esperado: 2 políticas, 2 triggers máx. (el nuestro + otros si existen), grants select/insert.
select 'politica' as tipo, policyname as nombre, cmd as detalle from pg_policies where tablename = 'system_logs'
union all
select 'trigger', tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.system_logs'::regclass and not tgisinternal
union all
select 'grant', grantee, string_agg(privilege_type, ',') from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'system_logs' and grantee in ('authenticated', 'anon') group by grantee
union all
select 'columna', column_name, coalesce(column_default, '') || case when is_nullable = 'NO' then ' NOT NULL' else '' end
 from information_schema.columns where table_schema = 'public' and table_name = 'system_logs'
union all
select 'filas', 'total', count(*)::text from public.system_logs;
