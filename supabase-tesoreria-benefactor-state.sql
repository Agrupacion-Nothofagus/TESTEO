-- Añade el estado institucional "benefactor" a Tesorería > Cuotas.
-- Ejecutar una vez en el SQL Editor de Supabase si la tabla ya existe.

alter table public.tesoreria_cuotas_miembros
  drop constraint if exists tesoreria_cuotas_miembros_estado_miembro_check;

alter table public.tesoreria_cuotas_miembros
  add constraint tesoreria_cuotas_miembros_estado_miembro_check
  check (estado_miembro in ('estudiante', 'trabajador', 'cesante', 'benefactor'));
