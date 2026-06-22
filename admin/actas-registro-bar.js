// Convierte las tarjetas del Registro de actas en un listado horizontal compacto.
// Orden visible solicitado: Fecha → Título de acta → Tipo de reunión.
// Además muestra una confirmación visible al guardar borrador o finalizar acta.
if (!window.__nothofagusActasRegistroBar) {
  window.__nothofagusActasRegistroBar = true;

  cargarEstiloBarraActas();
  instalarToastGuardadoActas();
  transformarListadoActas();

  const observer = new MutationObserver(() => {
    transformarListadoActas();
    detectarGuardadoActa();
  });

  const target = document.querySelector('.admin-content') || document.body;
  observer.observe(target, { childList: true, subtree: true, characterData: true });
}

let ultimoMensajeGuardado = '';
let timerToastActas = null;

function cargarEstiloBarraActas() {
  if (document.querySelector('link[href="actas-registro-bar.css"]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'actas-registro-bar.css';
  document.head.appendChild(link);
}

function transformarListadoActas() {
  document.querySelectorAll('#registro-actas-view .acta-card:not(.acta-card-horizontal)').forEach((card) => {
    const title = card.querySelector('h4')?.textContent?.trim() || 'Acta sin título';
    const meta = card.querySelector('small')?.textContent?.trim() || '';
    const state = card.querySelector('.acta-state-pill');
    const actions = card.querySelector('.acta-card-actions');
    const { tipo, fecha } = separarMetaActa(meta);

    prepararAcciones(actions);

    const strip = document.createElement('div');
    strip.className = 'acta-card-strip';
    strip.innerHTML = `
      <div class="acta-strip-cell">
        <span>Fecha</span>
        <strong>${escapeHTMLActasBar(fecha || 'Sin fecha')}</strong>
      </div>
      <div class="acta-strip-cell">
        <span>Título de acta</span>
        <strong>${escapeHTMLActasBar(title)}</strong>
      </div>
      <div class="acta-strip-cell">
        <span>Tipo de reunión</span>
        <strong>${escapeHTMLActasBar(tipo || 'Sin tipo')}</strong>
      </div>
    `;

    if (state) strip.appendChild(state);
    if (actions) strip.appendChild(actions);

    card.prepend(strip);
    card.classList.add('acta-card-horizontal');
  });
}

function prepararAcciones(actions) {
  if (!actions) return;

  actions.querySelectorAll('button').forEach((button) => {
    const text = button.textContent.trim().toLowerCase();

    if (text === 'generar pdf' || text === 'guardar pdf') {
      button.textContent = 'Descargar';
    }
  });
}

function instalarToastGuardadoActas() {
  if (document.querySelector('[data-actas-save-toast]')) return;

  const toast = document.createElement('div');
  toast.className = 'actas-save-toast';
  toast.dataset.actasSaveToast = 'true';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);
}

function detectarGuardadoActa() {
  const status = document.querySelector('[data-actas-status]');
  const message = status?.textContent?.trim() || '';

  if (!message || message === ultimoMensajeGuardado) return;

  if (message.toLowerCase().includes('acta guardada')) {
    ultimoMensajeGuardado = message;
    mostrarToastActa('Acta guardada correctamente.');
  }
}

function mostrarToastActa(message) {
  const toast = document.querySelector('[data-actas-save-toast]');
  if (!toast) return;

  window.clearTimeout(timerToastActas);
  toast.textContent = message;
  toast.classList.add('is-visible');

  timerToastActas = window.setTimeout(() => {
    toast.classList.remove('is-visible');
  }, 2800);
}

function separarMetaActa(meta) {
  const parts = String(meta || '').split('·').map((part) => part.trim()).filter(Boolean);
  return {
    tipo: parts[0] || '',
    fecha: parts[1] || ''
  };
}

function escapeHTMLActasBar(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
