-- Permisos de administración inicial para el gestor de publicaciones.
-- Ejecutar este archivo después de supabase-publicaciones.sql.
-- Este esquema permite administrar publicaciones solo a usuarios autenticados.

alter table public.publicaciones enable row level security;

drop policy if exists "usuarios_autenticados_leen_publicaciones" on public.publicaciones;
create policy "usuarios_autenticados_leen_publicaciones"
on public.publicaciones
for select
to authenticated
using (true);

drop policy if exists "usuarios_autenticados_crean_publicaciones" on public.publicaciones;
create policy "usuarios_autenticados_crean_publicaciones"
on public.publicaciones
for insert
to authenticated
with check (true);

drop policy if exists "usuarios_autenticados_actualizan_publicaciones" on public.publicaciones;
create policy "usuarios_autenticados_actualizan_publicaciones"
on public.publicaciones
for update
to authenticated
using (true)
with check (true);

drop policy if exists "usuarios_autenticados_eliminan_publicaciones" on public.publicaciones;
create policy "usuarios_autenticados_eliminan_publicaciones"
on public.publicaciones
for delete
to authenticated
using (true);
