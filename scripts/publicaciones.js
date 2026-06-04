import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_TABLE_PUBLICACIONES,
  supabaseConfigurado
} from './supabase-config.js';

const MAX_PUBLICACIONES_SLIDER = 10;
const PUBLICACIONES_SLIDER_INTERVAL_MS = 7000;
const PUBLICACIONES_FADE_MS = 360;

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
    let sliderTimer = null;
    let enTransicion = false;

    function renderizarSlide(indice) {
      const publicacion = visibles[indice];
      const bajada = publicacion.bajada || publicacion.resumen || '';
      const imagen = publicacion.imagen_url || publicacion.imagen || '';
      const urlPublicacion = `publicacion/?id=${encodeURIComponent(publicacion.id)}`;
      const imagenHTML = imagen
        ? `<img src="${escaparAtributo(imagen)}" alt="${escaparAtributo(publicacion.titulo)}" class="publication-image">`
        : `<div class="publication-image publication-placeholder">Nothofagus</div>`;

      contenedor.innerHTML = `
        <a class="publication-slide publication-slide-link publication-slide-fade-in" href="${urlPublicacion}">
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

    function cambiarSlide(nuevoIndice) {
      if (enTransicion || nuevoIndice === indiceActual) return;

      const slideActual = contenedor.querySelector('.publication-slide');
      enTransicion = true;

      if (!slideActual) {
        indiceActual = nuevoIndice;
        renderizarSlide(indiceActual);
        enTransicion = false;
        return;
      }

      slideActual.classList.remove('publication-slide-fade-in');
      slideActual.classList.add('publication-slide-fade-out');

      setTimeout(() => {
        indiceActual = nuevoIndice;
        renderizarSlide(indiceActual);
        enTransicion = false;
      }, PUBLICACIONES_FADE_MS);
    }

    function avanzar() {
      cambiarSlide((indiceActual + 1) % visibles.length);
    }

    function retroceder() {
      cambiarSlide((indiceActual - 1 + visibles.length) % visibles.length);
    }

    function reiniciarTimer() {
      if (sliderTimer) clearInterval(sliderTimer);
      if (visibles.length > 1) {
        sliderTimer = setInterval(avanzar, PUBLICACIONES_SLIDER_INTERVAL_MS);
      }
    }

    if (botonSiguiente) {
      botonSiguiente.addEventListener('click', () => {
        avanzar();
        reiniciarTimer();
      });
    }

    if (botonAnterior) {
      botonAnterior.addEventListener('click', () => {
        retroceder();
        reiniciarTimer();
      });
    }

    renderizarSlide(indiceActual);
    reiniciarTimer();
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