(() => {
  if (window.__nothofagusCuotasActivosLayoutLoader) return;
  window.__nothofagusCuotasActivosLayoutLoader = true;

  const href = 'tesoreria-cuotas-activos-layout-ref.css?v=20260710-activos-layout-ref';
  const existing = document.querySelector('link[data-cuotas-activos-layout-ref]');
  if (existing) {
    existing.href = href;
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.cuotasActivosLayoutRef = 'true';
  document.head.appendChild(link);
})();
