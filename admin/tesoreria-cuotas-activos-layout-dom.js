(() => {
  if (window.__nothofagusCuotasActivosLayoutDom) return;
  window.__nothofagusCuotasActivosLayoutDom = true;

  loadStyle();
  observe();
  normalize();
  document.addEventListener('DOMContentLoaded', normalize);
  window.addEventListener('hashchange', () => window.setTimeout(normalize, 120));
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-tesoreria-open="cuotas"], [data-cuotas-apply-filter], [data-cuotas-clear-filter], [data-cuotas-nomina]')) {
      window.setTimeout(normalize, 180);
      window.setTimeout(normalize, 600);
    }
  }, true);

  function observe() {
    const start = () => {
      if (!document.body || document.body.dataset.cuotasActivosLayoutDomObserved) return;
      document.body.dataset.cuotasActivosLayoutDomObserved = 'true';
      new MutationObserver(() => queue()).observe(document.body, { childList: true, subtree: true });
    };
    start();
    document.addEventListener('DOMContentLoaded', start);
  }

  function queue() {
    window.clearTimeout(queue.timer);
    queue.timer = window.setTimeout(normalize, 120);
  }

  function normalize() {
    const view = document.querySelector('#tesoreria-cuotas-view');
    const root = view?.querySelector('.cuotas-monthly-dashboard');
    if (!view || !root) return;

    const header = root.querySelector('.cuotas-dashboard-header');
    const ownNote = root.querySelector('[data-cuotas-own-note]');
    const summary = root.querySelector('[data-cuotas-summary]');
    const monthSummary = root.querySelector('[data-cuotas-month-summary]');
    const annualSummary = root.querySelector('[data-cuotas-annual-summary]');
    const recent = root.querySelector('[data-cuotas-recent-movements]');
    const nominaSlot = root.querySelector('[data-cuotas-nomina-slot]');
    const filters = root.querySelector('.cuotas-filter-panel');
    const status = root.querySelector('[data-cuotas-status]');
    const matrix = root.querySelector('.cuotas-monthly-matrix-card');

    if (!summary || !monthSummary || !annualSummary || !recent || !filters || !status || !matrix) return;

    root.classList.add('activos-reference-layout');

    const topGrid = ensureSection(root, 'activos-top-grid');
    const middleGrid = ensureSection(root, 'activos-middle-grid');

    moveAfter(header, ownNote || topGrid);
    moveAfter(ownNote || header, topGrid);
    appendIfNeeded(topGrid, summary);
    appendIfNeeded(topGrid, monthSummary);

    appendIfNeeded(middleGrid, annualSummary);
    appendIfNeeded(middleGrid, recent);
    if (nominaSlot) appendIfNeeded(middleGrid, nominaSlot);
    moveAfter(topGrid, middleGrid);

    moveAfter(middleGrid, filters);
    moveAfter(filters, status);
    moveAfter(status, matrix);

    root.querySelectorAll('[data-cuotas-annual-status], [data-cuotas-quick-actions]').forEach((item) => {
      item.classList.add('activos-layout-hidden');
    });
  }

  function ensureSection(root, className) {
    let section = root.querySelector(':scope > .' + className);
    if (!section) {
      section = document.createElement('section');
      section.className = className;
      root.appendChild(section);
    }
    return section;
  }

  function appendIfNeeded(parent, child) {
    if (child && child.parentElement !== parent) parent.appendChild(child);
  }

  function moveAfter(anchor, node) {
    if (!anchor || !node || anchor.nextElementSibling === node) return;
    anchor.insertAdjacentElement('afterend', node);
  }

  function loadStyle() {
    const href = 'tesoreria-cuotas-activos-layout-safe.css?v=20260710-activos-safe';
    const existing = document.querySelector('link[data-cuotas-activos-layout-safe]');
    if (existing) {
      existing.href = href;
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.cuotasActivosLayoutSafe = 'true';
    document.head.appendChild(link);
  }
})();
