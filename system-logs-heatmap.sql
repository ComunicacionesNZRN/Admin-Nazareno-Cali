alter table public.system_logs
  add column if not exists usuario_id uuid default auth.uid(),
  add column if not exists usuario_email text default (auth.jwt() ->> 'email');

create index if not exists system_logs_created_at_idx
  on public.system_logs (created_at);

drop policy if exists "Authenticated users can read system logs" on public.system_logs;
drop policy if exists "Authenticated users can write system logs" on public.system_logs;
drop policy if exists "Only communications can read system logs" on public.system_logs;
drop policy if exists "Users can write their own system logs" on public.system_logs;

create policy "Only communications can read system logs"
  on public.system_logs for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'comunicaciones@nazarenocali.org');

create policy "Users can write their own system logs"
  on public.system_logs for insert to authenticated
  with check (
    usuario_id = auth.uid()
    and usuario_email = auth.jwt() ->> 'email'
  );

create or replace function public.actividad_por_dia(
  dias int default 371,
  tz text default 'America/Bogota'
)
returns table (dia date, total bigint)
language sql
stable
security invoker
as $$
  with local_bounds as (
    select
      (current_timestamp at time zone tz)::date as hoy,
      (
        date_trunc('week', (current_timestamp at time zone tz)::date::timestamp)
        - (ceil(greatest(dias, 1) / 7.0)::int - 1) * interval '1 week'
      )::date as desde
  ), activity as (
    select
      (logs.created_at at time zone tz)::date as activity_day,
      count(*) as activity_total
    from public.system_logs as logs
    cross join local_bounds as bounds
    where logs.created_at >= (bounds.desde::timestamp at time zone tz)
      and logs.created_at < ((bounds.hoy + 1)::timestamp at time zone tz)
      and logs.estado in ('exito', 'error')
    group by (logs.created_at at time zone tz)::date
  )
  select days.dia::date, coalesce(activity.activity_total, 0)::bigint
  from local_bounds as bounds
  cross join lateral generate_series(
    bounds.desde::timestamp,
    bounds.hoy::timestamp,
    interval '1 day'
  ) as days(dia)
  left join activity on activity.activity_day = days.dia::date
  order by days.dia;
$$;

revoke all on function public.actividad_por_dia(int, text) from public, anon;
grant execute on function public.actividad_por_dia(int, text) to authenticated;

grant select, insert on public.system_logs to authenticated;