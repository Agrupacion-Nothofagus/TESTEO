-- Tabla para solicitudes internas de ingreso desde el botón ÚNETE.
-- Ejecutar en Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.solicitudes_miembros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null,
  correo text not null,
  edad integer not null,
  comuna text not null,
  motivacion text not null,
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
  constraint solicitudes_miembros_edad_check check (edad between 12 and 120)
);

create index if not exists solicitudes_miembros_created_at_idx
on public.solicitudes_miembros (created_at desc);

create index if not exists solicitudes_miembros_estado_idx
on public.solicitudes_miembros (estado);

alter table public.solicitudes_miembros enable row level security;

-- El acceso público y administrativo se realiza por Cloudflare Functions usando SUPABASE_ADMIN_KEY.
-- Por eso no se agregan policies públicas directas en Supabase.
