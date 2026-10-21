-- A1b · lider_email siempre en minúsculas y sin espacios (para comparación exacta).
-- Idempotente.
create or replace function public.normalizar_lider_email()
returns trigger language plpgsql as $$
begin
  new.lider_email := nullif(lower(trim(new.lider_email)), '');
  return new;
end; $$;

drop trigger if exists grupos_conexion_normalizar_lider_email on public.grupos_conexion;
create trigger grupos_conexion_normalizar_lider_email
  before insert or update of lider_email on public.grupos_conexion
  for each row execute function public.normalizar_lider_email();

-- Corrige los datos existentes
update public.grupos_conexion
   set lider_email = nullif(lower(trim(lider_email)), '')
 where lider_email is distinct from nullif(lower(trim(lider_email)), '');

-- Verificación
select id, nombre, lider_email from public.grupos_conexion order by nombre;
