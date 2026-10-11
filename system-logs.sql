create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  accion text not null,
  seccion text not null,
  estado text not null check (estado in ('en_proceso', 'exito', 'error', 'pendiente')),
  created_at timestamptz not null default now()
);

alter table public.system_logs enable row level security;

drop policy if exists "Authenticated users can read system logs" on public.system_logs;
create policy "Authenticated users can read system logs"
  on public.system_logs for select to authenticated
  using (auth.uid() is not null);

drop policy if exists "Authenticated users can write system logs" on public.system_logs;
create policy "Authenticated users can write system logs"
  on public.system_logs for insert to authenticated
  with check (auth.uid() is not null);

grant select, insert on public.system_logs to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'system_logs'
    ) then
    execute 'alter publication supabase_realtime add table public.system_logs';
  end if;
end;
$$;
