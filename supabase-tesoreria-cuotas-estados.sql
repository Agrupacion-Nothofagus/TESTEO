-- Historial auditable de cambios manuales en la matriz mensual de cuotas.
-- Ejecutar una vez en el SQL editor de Supabase.

create extension if not exists pgcrypto;

create table if not exists public.tesoreria_cuotas_estados (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.tesoreria_cuotas_miembros(id) on delete cascade,
  member_nombre text not null,
  anio integer not null check (anio between 2020 and 2100),
  mes integer not null check (mes between 1 and 12),
  fecha date not null default current_date,
  estado_anterior text not null check (estado_anterior in ('pagado', 'pendiente', 'atrasado', 'sin_registro')),
  estado_nuevo text not null check (estado_nuevo in ('pagado', 'pendiente', 'atrasado', 'sin_registro')),
  observacion text not null default '',
  eliminado boolean not null default false,
  eliminado_por text,
  eliminado_email text,
  eliminado_en timestamptz,
  creado_por text,
  creado_email text,
  actualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tesoreria_cuotas_estados_periodo_idx
  on public.tesoreria_cuotas_estados (anio, member_id, mes, created_at desc);

create index if not exists tesoreria_cuotas_estados_eliminado_idx
  on public.tesoreria_cuotas_estados (eliminado, anio);

alter table public.tesoreria_cuotas_estados enable row level security;

do $$ begin
  create policy "tesoreria_cuotas_estados_read_authenticated"
    on public.tesoreria_cuotas_estados for select
    to authenticated
    using (true);
exception when duplicate_object then null;
end $$;

