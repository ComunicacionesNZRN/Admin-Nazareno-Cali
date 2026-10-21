-- A2 · ROLLBACK: deja las políticas exactamente como estaban antes de a2-rls-limpieza.sql,
-- usando la copia guardada en public.a2_rls_backup.
do $$
declare p record;
begin
  if not exists (select 1 from public.a2_rls_backup) then
    raise exception 'No hay copia en a2_rls_backup; no se hace nada.';
  end if;
  -- quitar las políticas nuevas de A2
  for p in select tablename, policyname from pg_policies
            where schemaname = 'public' and policyname like 'a2 %'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
  -- recrear las originales
  for p in select * from public.a2_rls_backup loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
    execute format('create policy %I on public.%I as %s for %s to %s %s %s',
      p.policyname, p.tablename, p.permissive, p.cmd,
      (select string_agg(quote_ident(r), ', ') from unnest(p.roles) r),
      case when p.qual is not null then 'using (' || p.qual || ')' else '' end,
      case when p.with_check is not null then 'with check (' || p.with_check || ')' else '' end);
  end loop;
end $$;
notify pgrst, 'reload schema';
select tablename, policyname, cmd from pg_policies where schemaname='public' order by 1,3,2;
-- (Las funciones admin_* y ver_ticket_encuentro se dejan; no dan acceso por sí solas.)
