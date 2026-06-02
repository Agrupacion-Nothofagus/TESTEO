import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_TABLE_PUBLICACIONES, supabaseConfigurado } from '../scripts/supabase-config.js';

const shell = document.querySelector('#article-shell');
const params = new URLSearchParams(window.location.search);
const id = params.get('id');

const ALLOWED_RICH_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'H1', 'H2', 'H3', 'H4']);

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
  const contenido = renderizarContenido(publicacion.contenido || '');
  const imagenHTML = imagen
    ? `<img class="article-image" src="${escaparAtributo(imagen)}" alt="Imagen de portada">`
    : '<div class="article-placeholder">Nothofagus</div>';

  return `
    <article class="article-card">
      ${imagenHTML}
      <div class="article-body">
        <span class="article-category">${escaparHTML(publicacion.categoria || 'Institución')}</span>
        <h1>${escaparHTML(publicacion.titulo)}</h1>
        <p class="article-subtitle">${escaparHTML(bajada)}</p>
        <p class="article-meta">${formatearFecha(publicacion.fecha)}</p>
        <div class="article-content">${contenido}</div>
        ${renderizarGaleria(publicacion.imagenes_complementarias)}
        <section class="article-references">
          <h2>Fuentes y referencias</h2>
          <div>${escaparHTML(fuentes)}</div>
        </section>
      </div>
    </article>
  `;
}

function renderizarContenido(contenido) {
  const valor = String(contenido || '').trim();
  if (!valor) return '';

  if (!looksLikeHTML(valor)) {
    return escaparHTML(valor).replaceAll('\n', '<br>');
  }

  return sanitizeHTML(valor);
}

function sanitizeHTML(html) {
  const parser = new DOMParser();
  const documentHTML = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = documentHTML.body.firstElementChild;

  cleanNode(container);
  return container.innerHTML;
}

function cleanNode(node) {
  Array.from(node.children || []).forEach((child) => {
    if (!ALLOWED_RICH_TAGS.has(child.tagName)) {
      child.replaceWith(...Array.from(child.childNodes));
      return;
    }

    Array.from(child.attributes).forEach((attribute) => child.removeAttribute(attribute.name));

    if (child.tagName === 'A') {
      const href = child.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href) || /^mailto:/i.test(href)) {
        child.setAttribute('href', href);
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }
    }

    cleanNode(child);
  });
}

function looksLikeHTML(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function renderizarGaleria(lista) {
  if (!Array.isArray(lista) || !lista.length) return '';
  const imagenes = lista
    .filter(Boolean)
    .map((url) => `<img src="${escaparAtributo(url)}" alt="Imagen complementaria">`)
    .join('');
  if (!imagenes) return '';
  return `<section class="article-gallery"><h2>Imágenes complementarias</h2><div class="article-gallery-grid">${imagenes}</div></section>`;
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
