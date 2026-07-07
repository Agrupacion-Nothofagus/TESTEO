-- Auditoría de eliminación lógica para Tesorería.
-- Ejecutar una vez en Supabase SQL Editor.

alter table public.tesoreria_movimientos
  add column if not exists eliminado boolean not null default false,
  add column if not exists eliminado_por text,
  add column if not exists eliminado_email text,
  add column if not exists eliminado_en timestamptz;

create index if not exists tesoreria_movimientos_eliminado_idx
on public.tesoreria_movimientos (eliminado);

create index if not exists tesoreria_movimientos_eliminado_en_idx
on public.tesoreria_movimientos (eliminado_en);
