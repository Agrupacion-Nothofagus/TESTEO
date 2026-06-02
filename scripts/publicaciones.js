import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_TABLE_PUBLICACIONES,
  supabaseConfigurado
} from './supabase-config.js';

const MAX_PUBLICACIONES_SLIDER = 10;

async function cargarPublicaciones() {
  const contenedor = document.querySelector('[data-publicaciones-slider]');
  const indicador = document.querySelector('[data-publicaciones-indicador]');
  const botonAnterior = document.querySelector('[data-publicaciones-prev]');
  const botonSiguiente = document.querySelector('[data-publicaciones-next]');

  if (!contenedor) return;

  try {
    const publicaciones = await obtenerPublicaciones();
    const visibles = normalizarPublicacionesSlider(publicaciones);

    if (!visibles.length) {
      contenedor.innerHTML = '<p class="slider-empty">No hay publicaciones disponibles por el momento.</p>';
      return;
    }

    let indiceActual = 0;

    function renderizarSlide(indice) {
      const publicacion = visibles[indice];
      const bajada = publicacion.bajada || publicacion.resumen || '';
      const imagen = publicacion.imagen_url || publicacion.imagen || '';
      const urlPublicacion = `publicacion/?id=${encodeURIComponent(publicacion.id)}`;
      const imagenHTML = imagen
        ? `<img src="${escaparAtributo(imagen)}" alt="${escaparAtributo(publicacion.titulo)}" class="publication-image">`
        : `<div class="publication-image publication-placeholder">Nothofagus</div>`;

      contenedor.innerHTML = `
        <a class="publication-slide publication-slide-link" href="${urlPublicacion}">
          ${imagenHTML}
          <div class="publication-content">
            <span class="publication-category">${escaparHTML(publicacion.categoria || 'Institución')}</span>
            <h3>${escaparHTML(publicacion.titulo)}</h3>
            <p>${escaparHTML(bajada)}</p>
          </div>
        </a>
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
        .order('fecha', { ascending: false })
        .limit(MAX_PUBLICACIONES_SLIDER);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.warn('Supabase no disponible. Se usará JSON local.', error);
    }
  }

  const respuesta = await fetch('content/publicaciones.json', { cache: 'no-store' });
  return await respuesta.json();
}

function normalizarPublicacionesSlider(publicaciones) {
  return (publicaciones || [])
    .filter((item) => item.estado === 'publicado')
    .sort((a, b) => fechaOrdenable(b.fecha) - fechaOrdenable(a.fecha))
    .slice(0, MAX_PUBLICACIONES_SLIDER);
}

function fechaOrdenable(fecha) {
  const valor = new Date(`${fecha || ''}T12:00:00`).getTime();
  return Number.isNaN(valor) ? 0 : valor;
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