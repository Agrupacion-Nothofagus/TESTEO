(() => {
  if (window.__nothofagusCuotasReorderLayout) return;
  window.__nothofagusCuotasReorderLayout = true;

  const targetSelector = '#tesoreria-cuotas-view';

  function reorderCuotasLayout() {
    const view = document.querySelector(targetSelector);
    if (!view) return;

    const dashboard = view.querySelector('.cuotas-monthly-dashboard');
    const header = view.querySelector('.cuotas-dashboard-header');
    const summary = view.querySelector('[data-cuotas-summary]');
    const monthSummary = view.querySelector('[data-cuotas-month-summary]');
    const secondary = view.querySelector('.cuotas-secondary-grid');
    const layout = view.querySelector('.cuotas-dashboard-layout');
    const main = view.querySelector('.cuotas-main-column');
    const table = view.querySelector('.cuotas-monthly-matrix-card');
    const status = view.querySelector('[data-cuotas-status]');
    const side = view.querySelector('.cuotas-side-panel');

    if (!dashboard || !header || !summary || !monthSummary || !secondary || !layout || !main || !table) return;

    let overview = view.querySelector('.cuotas-overview-grid');
    let overviewMain = view.querySelector('.cuotas-overview-main');
    let overviewSide = view.querySelector('.cuotas-overview-side');

    if (!overview) {
      overview = document.createElement('section');
      overview.className = 'cuotas-overview-grid';
      overviewMain = document.createElement('div');
      overviewMain.className = 'cuotas-overview-main';
      overviewSide = document.createElement('aside');
      overviewSide.className = 'cuotas-overview-side';
      overview.append(overviewMain, overviewSide);
      header.after(overview);
    }

    if (summary.parentElement !== overviewMain) overviewMain.appendChild(summary);
    if (secondary.parentElement !== overviewMain) overviewMain.appendChild(secondary);
    if (monthSummary.parentElement !== overviewSide) overviewSide.appendChild(monthSummary);

    if (table.parentElement !== main) main.appendChild(table);
    if (status && status.parentElement !== main) main.insertBefore(status, table);

    const annualStatus = view.querySelector('[data-cuotas-annual-status]');
    const quickActions = view.querySelector('[data-cuotas-quick-actions]');
    annualStatus?.remove();
    quickActions?.remove();

    if (side && !side.children.length) side.classList.add('is-empty');
    if (layout.previousElementSibling !== overview) overview.after(layout);
  }

  const observer = new MutationObserver(() => reorderCuotasLayout());

  function start() {
    reorderCuotasLayout();
    const view = document.querySelector(targetSelector);
    if (view && !view.dataset.reorderObserved) {
      view.dataset.reorderObserved = 'true';
      observer.observe(view, { childList: true, subtree: true });
    }
  }

  document.addEventListener('DOMContentLoaded', start);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-tesoreria-open="cuotas"]')) {
      window.setTimeout(start, 80);
      window.setTimeout(start, 400);
    }
  });
  window.addEventListener('hashchange', start);
  window.setTimeout(start, 300);
  window.setTimeout(start, 1000);
})();
