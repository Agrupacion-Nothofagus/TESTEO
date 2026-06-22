// Convierte las tarjetas del Registro de actas en una barra horizontal compacta.
// Orden visible solicitado: Fecha → Título de acta → Tipo de reunión.
if (!window.__nothofagusActasRegistroBar) {
  window.__nothofagusActasRegistroBar = true;

  cargarEstiloBarraActas();
  transformarBarrasActas();

  const observer = new MutationObserver(() => transformarBarrasActas());
  const target = document.querySelector('.admin-content') || document.body;
  observer.observe(target, { childList: true, subtree: true });
}

function cargarEstiloBarraActas() {
  if (document.querySelector('link[href="actas-registro-bar.css"]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'actas-registro-bar.css';
  document.head.appendChild(link);
}

function transformarBarrasActas() {
  document.querySelectorAll('#registro-actas-view .acta-card:not(.acta-card-horizontal)').forEach((card) => {
    const title = card.querySelector('h4')?.textContent?.trim() || 'Acta sin título';
    const meta = card.querySelector('small')?.textContent?.trim() || '';
    const state = card.querySelector('.acta-state-pill');
    const actions = card.querySelector('.acta-card-actions');

    const { tipo, fecha } = separarMetaActa(meta);

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
