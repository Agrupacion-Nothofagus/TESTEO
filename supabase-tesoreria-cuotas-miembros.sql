-- Supabase schema para la subsección Tesorería > Cuotas de Miembros.
-- Ejecutar una vez en el SQL editor de Supabase antes de usar /api/cuotas-miembros.

create extension if not exists pgcrypto;

create table if not exists public.tesoreria_cuotas_miembros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rut text,
  correo text not null,
  telefono text,
  estado_miembro text not null default 'estudiante' check (estado_miembro in ('estudiante', 'trabajador', 'cesante')),
  cuota_mensual numeric(12,0) not null default 0 check (cuota_mensual >= 0),
  anio integer not null default extract(year from now())::integer,
  observaciones text,
  estado_cuenta text not null default 'activo' check (estado_cuenta in ('activo', 'inactivo')),
  exento boolean not null default false,
  creado_por text,
  actualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tesoreria_cuotas_pagos (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.tesoreria_cuotas_miembros(id) on delete cascade,
  mes integer not null default 0 check (mes between 0 and 12),
  anio integer not null default extract(year from now())::integer,
  monto numeric(12,0) not null check (monto > 0),
  fecha_pago date not null default current_date,
  metodo_pago text not null default 'transferencia' check (metodo_pago in ('transferencia', 'efectivo', 'deposito', 'webpay', 'otro')),
  observacion text,
  tipo_pago text not null default 'mensual' check (tipo_pago in ('mensual', 'anual')),
  comprobante_path text,
  comprobante_nombre text,
  comprobante_tipo text,
  comprobante_tamano integer,
  creado_por text,
  actualizado_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tesoreria_cuotas_miembros_correo_idx on public.tesoreria_cuotas_miembros (lower(correo));
create index if not exists tesoreria_cuotas_miembros_anio_idx on public.tesoreria_cuotas_miembros (anio);
create index if not exists tesoreria_cuotas_pagos_member_idx on public.tesoreria_cuotas_pagos (member_id);
create index if not exists tesoreria_cuotas_pagos_anio_idx on public.tesoreria_cuotas_pagos (anio);

alter table public.tesoreria_cuotas_miembros enable row level security;
alter table public.tesoreria_cuotas_pagos enable row level security;

-- La API Cloudflare usa SUPABASE_ADMIN_KEY. Estas políticas permiten lectura básica si luego se usa el cliente Supabase directo.
do $$ begin
  create policy "tesoreria_cuotas_miembros_read_authenticated"
    on public.tesoreria_cuotas_miembros for select
    to authenticated
    using (true);
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "tesoreria_cuotas_pagos_read_authenticated"
    on public.tesoreria_cuotas_pagos for select
    to authenticated
    using (true);
exception when duplicate_object then null;
end $$;
