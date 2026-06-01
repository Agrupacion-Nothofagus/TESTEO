import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_TABLE_PUBLICACIONES, supabaseConfigurado } from '../scripts/supabase-config.js';

const shell = document.querySelector('#article-shell');
const params = new URLSearchParams(window.location.search);
const id = params.get('id');

cargarPublicacion();

async function cargarPublicacion() {
  if (!id) {
    shell.innerHTML = '<p class="article-error">No se indicó una publicación.</p>';
    return;
  }

  try {
    const publicacion = await obtenerPublicacion(id);
    if (!publicacion) {
      shell.innerHTML = '<p class="article-error">No fue posible encontrar esta publicación.</p>';
      return;
    }

    document.title = `${publicacion.titulo} | Agrupación Nothofagus`;
    shell.innerHTML = renderizarPublicacion(publicacion);
  } catch (error) {
    console.error(error);
    shell.innerHTML = '<p class="article-error">No fue posible cargar la publicación.</p>';
  }
}

async function obtenerPublicacion(id) {
  if (supabaseConfigurado()) {
    const cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const respuesta = await cliente
      .from(SUPABASE_TABLE_PUBLICACIONES)
      .select('*')
      .eq('id', id)
      .eq('estado', 'publicado')
      .single();

    if (respuesta.error) throw respuesta.error;
    return respuesta.data;
  }

  const respuestaLocal = await fetch('../content/publicaciones.json', { cache: 'no-store' });
  const publicaciones = await respuestaLocal.json();
  return publicaciones.find((item) => String(item.id) === String(id) && item.estado === 'publicado');
}

function renderizarPublicacion(publicacion) {
  const imagen = publicacion.imagen_url || publicacion.imagen || '';
  const bajada = publicacion.bajada || publicacion.resumen || '';
  const fuentes = publicacion.fuentes_referencias || 'Sin fuentes o referencias declaradas.';
  const imagenHTML = imagen
    ? `<img class="article-image" src="${escaparAtributo(imagen)}" alt="${escaparAtributo(publicacion.titulo)}">`
    : '<div class="article-placeholder">Nothofagus</div>';

  return `
    <article class="article-card">
      ${imagenHTML}
      <div class="article-body">
        <span class="article-category">${escaparHTML(publicacion.categoria || 'Institución')}</span>
        <h1>${escaparHTML(publicacion.titulo)}</h1>
        <p class="article-subtitle">${escaparHTML(bajada)}</p>
        <p class="article-meta">${formatearFecha(publicacion.fecha)}</p>
        <div class="article-content">${escaparHTML(publicacion.contenido || '')}</div>
        <section class="article-references">
          <h2>Fuentes y referencias</h2>
          <div>${escaparHTML(fuentes)}</div>
        </section>
      </div>
    </article>
  `;
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return '';
  const fecha = new Date(`${fechaISO}T12:00:00`);
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }).format(fecha);
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
