create extension if not exists pgcrypto;

alter table public.solicitudes_miembros add column if not exists observacion_rechazo text default '';
alter table public.solicitudes_miembros add column if not exists observaciones_internas text default '';
alter table public.solicitudes_miembros add column if not exists estado_socio text not null default 'activo';
alter table public.solicitudes_miembros add column if not exists fecha_ingreso timestamptz;

update public.solicitudes_miembros
set estado = 'miembro',
    fecha_ingreso = coalesce(fecha_ingreso, updated_at, created_at)
where estado = 'aceptado';

alter table public.solicitudes_miembros drop constraint if exists solicitudes_miembros_estado_check;
alter table public.solicitudes_miembros add constraint solicitudes_miembros_estado_check check (estado in (
  'pendiente',
  'contactado',
  'rechazado',
  'miembro',
  'archivado'
));

alter table public.solicitudes_miembros drop constraint if exists solicitudes_miembros_estado_socio_check;
alter table public.solicitudes_miembros add constraint solicitudes_miembros_estado_socio_check check (estado_socio in (
  'activo',
  'inactivo',
  'suspendido'
));

create index if not exists solicitudes_miembros_estado_socio_idx on public.solicitudes_miembros (estado_socio);
create index if not exists solicitudes_miembros_fecha_ingreso_idx on public.solicitudes_miembros (fecha_ingreso desc);