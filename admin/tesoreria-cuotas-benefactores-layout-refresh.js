(() => {
  const href = 'tesoreria-cuotas-benefactores-layout.css?v=20260710-table-fit';
  const key = 'benefactorsLayoutRef';
  const existing = document.querySelector(`link[data-${key}]`);
  if (existing) {
    existing.href = href;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset[key] = 'true';
  document.head.appendChild(link);
})();
