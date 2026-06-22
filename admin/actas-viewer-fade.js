// Añade apertura/cierre con fade para la vista de lectura de actas.
// No reemplaza la lógica principal de actas; solo suaviza Ver/Cerrar.
if (!window.__nothofagusActasViewerFade) {
  window.__nothofagusActasViewerFade = true;

  document.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-acta-ver]');
    if (openButton) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => abrirViewerConFade());
      });
      return;
    }

    const closeButton = event.target.closest('[data-acta-view-cerrar]');
    if (closeButton) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      cerrarViewerConFade();
    }
  }, true);
}

function abrirViewerConFade() {
  const viewer = document.querySelector('#registro-actas-view [data-actas-viewer]');
  if (!viewer) return;

  viewer.classList.remove('actas-hidden');
  viewer.setAttribute('aria-hidden', 'false');

  window.requestAnimationFrame(() => {
    viewer.classList.add('is-visible');
  });
}

function cerrarViewerConFade() {
  const viewer = document.querySelector('#registro-actas-view [data-actas-viewer]');
  if (!viewer) return;

  viewer.classList.remove('is-visible');
  viewer.setAttribute('aria-hidden', 'true');

  window.setTimeout(() => {
    viewer.classList.add('actas-hidden');
  }, 260);
}
