-- Tabla para solicitudes internas de ingreso desde el botón ÚNETE.
-- Ejecutar en Supabase SQL Editor.
-- Esta versión incluye el formulario completo de Solicitud de ingreso como socio/a.

create extension if not exists pgcrypto;

create table if not exists public.solicitudes_miembros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rut_documento text default '',
  fecha_nacimiento date,
  edad integer not null,
  menor_edad boolean not null default false,
  domicilio text default '',
  comuna text not null,
  telefono text not null,
  correo text not null,
  ocupacion text default '',
  adulto_nombre text default '',
  adulto_rut text default '',
  adulto_vinculo text default '',
  adulto_telefono text default '',
  adulto_correo text default '',
  adulto_declaracion boolean not null default false,
  categoria_socio text default '',
  vinculo_organizacion text default '',
  motivacion text not null,
  areas_participacion text[] not null default '{}',
  otro_area text default '',
  aporte text default '',
  experiencia_previa boolean not null default false,
  experiencia_descripcion text default '',
  declaracion_final boolean not null default false,
  intereses text default '',
  estado text not null default 'pendiente',
  observaciones text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint solicitudes_miembros_estado_check check (estado in (
    'pendiente',
    'contactado',
    'aceptado',
    'rechazado',
    'archivado'
  )),
  constraint solicitudes_miembros_categoria_check check (
    categoria_socio = '' or categoria_socio in (
      'Socio/a activo/a',
      'Socio/a colaborador/a',
      'Socio/a benefactor/a'
    )
  ),
  constraint solicitudes_miembros_edad_check check (edad between 12 and 120)
);

alter table public.solicitudes_miembros
add column if not exists rut_documento text default '';

alter table public.solicitudes_miembros
add column if not exists fecha_nacimiento date;

alter table public.solicitudes_miembros
add column if not exists menor_edad boolean not null default false;

alter table public.solicitudes_miembros
add column if not exists domicilio text default '';

alter table public.solicitudes_miembros
add column if not exists ocupacion text default '';

alter table public.solicitudes_miembros
add column if not exists adulto_nombre text default '';

alter table public.solicitudes_miembros
add column if not exists adulto_rut text default '';

alter table public.solicitudes_miembros
add column if not exists adulto_vinculo text default '';

alter table public.solicitudes_miembros
add column if not exists adulto_telefono text default '';

alter table public.solicitudes_miembros
add column if not exists adulto_correo text default '';

alter table public.solicitudes_miembros
add column if not exists adulto_declaracion boolean not null default false;

alter table public.solicitudes_miembros
add column if not exists categoria_socio text default '';

alter table public.solicitudes_miembros
add column if not exists vinculo_organizacion text default '';

alter table public.solicitudes_miembros
add column if not exists areas_participacion text[] not null default '{}';

alter table public.solicitudes_miembros
add column if not exists otro_area text default '';

alter table public.solicitudes_miembros
add column if not exists aporte text default '';

alter table public.solicitudes_miembros
add column if not exists experiencia_previa boolean not null default false;

alter table public.solicitudes_miembros
add column if not exists experiencia_descripcion text default '';

alter table public.solicitudes_miembros
add column if not exists declaracion_final boolean not null default false;

alter table public.solicitudes_miembros
drop constraint if exists solicitudes_miembros_categoria_check;

alter table public.solicitudes_miembros
add constraint solicitudes_miembros_categoria_check check (
  categoria_socio = '' or categoria_socio in (
    'Socio/a activo/a',
    'Socio/a colaborador/a',
    'Socio/a benefactor/a'
  )
);

create index if not exists solicitudes_miembros_created_at_idx
on public.solicitudes_miembros (created_at desc);

create index if not exists solicitudes_miembros_estado_idx
on public.solicitudes_miembros (estado);

create index if not exists solicitudes_miembros_categoria_idx
on public.solicitudes_miembros (categoria_socio);

alter table public.solicitudes_miembros enable row level security;

-- El acceso público y administrativo se realiza por Cloudflare Functions usando SUPABASE_ADMIN_KEY.
-- Por eso no se agregan policies públicas directas en Supabase.