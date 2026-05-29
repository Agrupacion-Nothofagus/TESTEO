import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_TABLE_PUBLICACIONES,
  supabaseConfigurado
} from './supabase-config.js';

async function cargarPublicaciones() {
  const contenedor = document.querySelector('[data-publicaciones-slider]');
  const indicador = document.querySelector('[data-publicaciones-indicador]');
  const botonAnterior = document.querySelector('[data-publicaciones-prev]');
  const botonSiguiente = document.querySelector('[data-publicaciones-next]');

  if (!contenedor) return;

  try {
    const publicaciones = await obtenerPublicaciones();
    const visibles = publicaciones.filter((item) => item.estado === 'publicado');

    if (!visibles.length) {
      contenedor.innerHTML = '<p class="slider-empty">No hay publicaciones disponibles por el momento.</p>';
      return;
    }

    let indiceActual = 0;

    function renderizarSlide(indice) {
      const publicacion = visibles[indice];
      const imagen = publicacion.imagen_url || publicacion.imagen || '';
      const imagenHTML = imagen
        ? `<img src="${escaparAtributo(imagen)}" alt="${escaparAtributo(publicacion.titulo)}" class="publication-image">`
        : `<div class="publication-image publication-placeholder">Nothofagus</div>`;

      contenedor.innerHTML = `
        <article class="publication-slide">
          ${imagenHTML}
          <div class="publication-content">
            <span class="publication-category">${escaparHTML(publicacion.categoria || 'Institucional')}</span>
            <h3>${escaparHTML(publicacion.titulo)}</h3>
            <p>${escaparHTML(publicacion.resumen)}</p>
            <div class="publication-meta">
              <time datetime="${escaparAtributo(publicacion.fecha)}">${formatearFecha(publicacion.fecha)}</time>
              ${publicacion.enlace && publicacion.enlace !== '#' ? `<a href="${escaparAtributo(publicacion.enlace)}" target="_blank" rel="noopener noreferrer">Ver más</a>` : ''}
            </div>
          </div>
        </article>
      `;

      if (indicador) {
        indicador.textContent = `${indice + 1} / ${visibles.length}`;
      }
    }

    function avanzar() {
      indiceActual = (indiceActual + 1) % visibles.length;
      renderizarSlide(indiceActual);
    }

    function retroceder() {
      indiceActual = (indiceActual - 1 + visibles.length) % visibles.length;
      renderizarSlide(indiceActual);
    }

    if (botonSiguiente) botonSiguiente.addEventListener('click', avanzar);
    if (botonAnterior) botonAnterior.addEventListener('click', retroceder);

    renderizarSlide(indiceActual);

    if (visibles.length > 1) {
      setInterval(avanzar, 7000);
    }
  } catch (error) {
    contenedor.innerHTML = '<p class="slider-empty">No fue posible cargar las publicaciones.</p>';
    console.error('Error al cargar publicaciones:', error);
  }
}

async function obtenerPublicaciones() {
  if (supabaseConfigurado()) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await supabase
        .from(SUPABASE_TABLE_PUBLICACIONES)
        .select('*')
        .eq('estado', 'publicado')
        .order('fecha', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.warn('Supabase no disponible. Se usará JSON local.', error);
    }
  }

  const respuesta = await fetch('content/publicaciones.json', { cache: 'no-store' });
  return await respuesta.json();
}

function formatearFecha(fechaISO) {
  const fecha = new Date(`${fechaISO}T12:00:00`);
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(fecha);
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

cargarPublicaciones();
