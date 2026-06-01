import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_TABLE_PUBLICACIONES, supabaseConfigurado } from '../scripts/supabase-config.js';

const contenedor = document.querySelector('#publicaciones-list');
const contador = document.querySelector('#publicaciones-count');

cargarPublicaciones();

async function cargarPublicaciones() {
  try {
    const publicaciones = await obtenerPublicaciones();
    const visibles = publicaciones.filter((item) => item.estado === 'publicado');

    contador.textContent = `${visibles.length} publicación${visibles.length === 1 ? '' : 'es'} disponible${visibles.length === 1 ? '' : 's'}.`;

    if (!visibles.length) {
      contenedor.innerHTML = '<p class="publicaciones-empty">No hay publicaciones disponibles por el momento.</p>';
      return;
    }

    contenedor.innerHTML = visibles.map(renderizarPublicacion).join('');
  } catch (error) {
    console.error(error);
    contador.textContent = 'No fue posible cargar las publicaciones.';
    contenedor.innerHTML = '<p class="publicaciones-empty">No fue posible cargar las publicaciones.</p>';
  }
}

async function obtenerPublicaciones() {
  if (supabaseConfigurado()) {
    try {
      const cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const respuesta = await cliente
        .from(SUPABASE_TABLE_PUBLICACIONES)
        .select('*')
        .eq('estado', 'publicado')
        .order('fecha', { ascending: false });

      if (respuesta.error) throw respuesta.error;
      return respuesta.data || [];
    } catch (error) {
      console.warn('Supabase no disponible. Se usara JSON local.', error);
    }
  }

  const respuestaLocal = await fetch('../content/publicaciones.json', { cache: 'no-store' });
  return await respuestaLocal.json();
}

function renderizarPublicacion(publicacion) {
  const imagen = publicacion.imagen_url || publicacion.imagen || '';
  const bajada = publicacion.bajada || publicacion.resumen || '';
  const url = `../publicacion/?id=${encodeURIComponent(publicacion.id)}`;
  const imagenHTML = imagen
    ? `<img src="${escaparAtributo(imagen)}" alt="${escaparAtributo(publicacion.titulo)}" class="publicacion-card-image">`
    : '<div class="publicacion-card-placeholder">Nothofagus</div>';

  return `
    <a class="publicacion-card publicacion-card-link" href="${url}">
      ${imagenHTML}
      <div class="publicacion-card-body">
        <span class="publicacion-category">${escaparHTML(publicacion.categoria || 'Institución')}</span>
        <h3>${escaparHTML(publicacion.titulo)}</h3>
        <p>${escaparHTML(bajada)}</p>
      </div>
    </a>
  `;
}

function escaparHTML(valor) {
  return String(valor || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escaparAtributo(valor) {
  return escaparHTML(valor);
}
