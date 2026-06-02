-- Migración editorial para publicaciones de Agrupación Nothofagus.
-- Ejecutar en Supabase SQL Editor después de supabase-publicaciones.sql.
-- Agrega bajada/subtítulo, fuentes/referencias y normaliza categorías editoriales.
-- Actualiza la restricción de categorías para incluir Memoria institucional.

alter table public.publicaciones
add column if not exists bajada text;

alter table public.publicaciones
add column if not exists fuentes_referencias text default '';

update public.publicaciones
set bajada = resumen
where bajada is null or trim(bajada) = '';

update public.publicaciones
set categoria = 'Institución'
where categoria is null
   or trim(categoria) = ''
   or categoria = 'Institucional'
   or categoria not in (
      'Institución',
      'Labor social',
      'Actualidad',
      'Ensayo',
      'Columna de opinión',
      'Memoria institucional'
   );

update public.publicaciones
set fuentes_referencias = ''
where fuentes_referencias is null;

alter table public.publicaciones
alter column bajada set default '';

alter table public.publicaciones
alter column fuentes_referencias set default '';

alter table public.publicaciones
drop constraint if exists publicaciones_categoria_editorial_check;

alter table public.publicaciones
add constraint publicaciones_categoria_editorial_check
check (categoria in (
  'Institución',
  'Labor social',
  'Actualidad',
  'Ensayo',
  'Columna de opinión',
  'Memoria institucional'
));
