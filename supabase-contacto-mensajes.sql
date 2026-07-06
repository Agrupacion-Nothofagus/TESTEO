-- Tabla para almacenar respuestas del formulario de contacto público.
-- Ejecutar en Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.contacto_mensajes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  respondido_at timestamptz,

  nombre text not null,
  telefono text not null,
  correo text not null,
  asunto text not null,
  mensaje text not null,

  estado text not null default 'nuevo' check (estado in ('nuevo', 'leido', 'respondido', 'archivado')),
  observaciones text not null default '',
  origen text not null default 'formulario_contacto'
);

create index if not exists contacto_mensajes_created_at_idx
  on public.contacto_mensajes (created_at desc);

create index if not exists contacto_mensajes_estado_idx
  on public.contacto_mensajes (estado);

create index if not exists contacto_mensajes_correo_idx
  on public.contacto_mensajes (correo);

create or replace function public.set_contacto_mensajes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_contacto_mensajes_updated_at on public.contacto_mensajes;
create trigger set_contacto_mensajes_updated_at
before update on public.contacto_mensajes
for each row
execute function public.set_contacto_mensajes_updated_at();

alter table public.contacto_mensajes enable row level security;

drop policy if exists "contacto_mensajes_service_role_all" on public.contacto_mensajes;
create policy "contacto_mensajes_service_role_all"
on public.contacto_mensajes
for all
to service_role
using (true)
with check (true);
