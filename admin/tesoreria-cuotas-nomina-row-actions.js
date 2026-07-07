(() => {
  if (window.__nothofagusCuotasNominaRowActions) return;
  window.__nothofagusCuotasNominaRowActions = true;

  loadStyle();
  observeRows();

  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-cuotas-nomina-remove]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();

    const row = button.closest('[data-nomina-row]');
    if (!row) return;
    const status = document.querySelector('#tesoreria-cuotas-view [data-cuotas-nomina-status]');
    const account = row.querySelector('[data-field="estado_cuenta"]');
    if (account) account.value = 'inactivo';
    row.style.display = 'none';
    row.dataset.nominaMarkedInactive = 'true';
    if (status) {
      status.textContent = 'Integrante marcado para retirar. Presiona Guardar nómina para aplicar el cambio.';
      status.classList.add('success');
      status.classList.remove('error');
    }
  }, true);

  function observeRows() {
    const observer = new MutationObserver(() => queueEnhance());
    const start = () => {
      if (document.body && !document.body.dataset.cuotasNominaRowsObserved) {
        document.body.dataset.cuotasNominaRowsObserved = 'true';
        observer.observe(document.body, { childList: true, subtree: true });
      }
      queueEnhance();
    };
    start();
    document.addEventListener('DOMContentLoaded', start);
    window.setTimeout(start, 600);
    window.setTimeout(start, 1400);
  }

  function queueEnhance() {
    window.clearTimeout(queueEnhance.timer);
    queueEnhance.timer = window.setTimeout(enhanceRows, 80);
  }

  function enhanceRows() {
    document.querySelectorAll('#tesoreria-cuotas-view .cuotas-nomina-table').forEach((table) => {
      const head = table.querySelector('thead tr');
      if (head && !head.querySelector('[data-nomina-action-head]')) {
        const th = document.createElement('th');
        th.dataset.nominaActionHead = 'true';
        th.textContent = 'Acciones';
        head.appendChild(th);
      }
      table.querySelectorAll('tbody tr[data-nomina-row]').forEach((row) => {
        if (row.querySelector('[data-payment-actions]')) return;
        const id = row.dataset.nominaRow || '';
        const td = document.createElement('td');
        td.className = 'cuotas-nomina-action-cell';
        td.innerHTML = renderActions(id);
        row.appendChild(td);
      });
    });
  }

  function renderActions(id) {
    const safeId = escapeAttr(id);
    const removeText = ['Eli', 'minar'].join('');
    return `<div class="payment-actions cuotas-nomina-actions-menu" data-payment-actions><button type="button" class="payment-actions-toggle" data-payment-actions-toggle><span>☰</span> Acciones</button><div class="payment-actions-menu"><button type="button" data-cuotas-history="${safeId}">Ver historial de pagos</button><button type="button" data-cuotas-payment="${safeId}">Registrar pago mensual</button><button type="button" data-cuotas-annual="${safeId}">Registrar cuota anual</button><button type="button" data-cuotas-payment="${safeId}">Adjuntar comprobante</button><button type="button" data-cuotas-nomina-remove>${removeText}</button></div></div>`;
  }

  function loadStyle() {
    const href = 'tesoreria-cuotas-matrix-actions-to-nomina.css?v=20260708';
    if (document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.cuotasMatrixActionsToNomina = 'true';
    document.head.appendChild(link);
  }

  function escapeAttr(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  }
})();
