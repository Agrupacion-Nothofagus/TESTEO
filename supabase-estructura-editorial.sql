-- Migración editorial para publicaciones de Agrupación Nothofagus.
-- Ejecutar en Supabase SQL Editor después de supabase-publicaciones.sql.
-- Agrega bajada/subtítulo, fuentes/referencias y normaliza categorías editoriales.

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
   or categoria not in ('Institución', 'Labor social', 'Actualidad', 'Ensayo', 'Columna de opinión');

update public.publicaciones
set fuentes_referencias = ''
where fuentes_referencias is null;

alter table public.publicaciones
alter column bajada set default '';

alter table public.publicaciones
alter column fuentes_referencias set default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'publicaciones_categoria_editorial_check'
  ) then
    alter table public.publicaciones
    add constraint publicaciones_categoria_editorial_check
    check (categoria in ('Institución', 'Labor social', 'Actualidad', 'Ensayo', 'Columna de opinión'));
  end if;
end $$;
