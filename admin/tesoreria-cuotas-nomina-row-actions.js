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
    row.remove();
    if (status) {
      status.textContent = 'Integrante retirado de esta vista.';
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
        th.textContent = 'Acción';
        head.appendChild(th);
      }
      table.querySelectorAll('tbody tr[data-nomina-row]').forEach((row) => {
        if (row.querySelector('[data-cuotas-nomina-remove]')) return;
        const td = document.createElement('td');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cuotas-nomina-delete';
        button.dataset.cuotasNominaRemove = 'true';
        button.textContent = 'Quitar';
        td.appendChild(button);
        row.appendChild(td);
      });
    });
  }

  function loadStyle() {
    if (document.querySelector('link[data-cuotas-nomina-ui-fix]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'tesoreria-cuotas-nomina-ui-fix.css?v=20260708';
    link.dataset.cuotasNominaUiFix = 'true';
    document.head.appendChild(link);
  }
})();
