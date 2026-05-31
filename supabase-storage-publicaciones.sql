-- Configuración de Supabase Storage para imágenes de publicaciones.
-- Ejecutar en Supabase SQL Editor después de crear la tabla publicaciones.
-- Crea un bucket público llamado 'publicaciones' y permite que usuarios autenticados suban JPG/PNG.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'publicaciones',
  'publicaciones',
  true,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "publicaciones_imagenes_lectura_publica" on storage.objects;
create policy "publicaciones_imagenes_lectura_publica"
on storage.objects
for select
using (bucket_id = 'publicaciones');

drop policy if exists "publicaciones_imagenes_subida_autenticada" on storage.objects;
create policy "publicaciones_imagenes_subida_autenticada"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'publicaciones'
  and lower((storage.foldername(name))[1]) = 'publicaciones'
);

drop policy if exists "publicaciones_imagenes_actualizacion_autenticada" on storage.objects;
create policy "publicaciones_imagenes_actualizacion_autenticada"
on storage.objects
for update
to authenticated
using (bucket_id = 'publicaciones')
with check (bucket_id = 'publicaciones');

drop policy if exists "publicaciones_imagenes_eliminacion_autenticada" on storage.objects;
create policy "publicaciones_imagenes_eliminacion_autenticada"
on storage.objects
for delete
to authenticated
using (bucket_id = 'publicaciones');
