-- Agrega soporte para imágenes complementarias en publicaciones.
-- Ejecutar en Supabase SQL Editor.

alter table public.publicaciones
add column if not exists imagenes_complementarias text[] default array[]::text[];

update public.publicaciones
set imagenes_complementarias = array[]::text[]
where imagenes_complementarias is null;
