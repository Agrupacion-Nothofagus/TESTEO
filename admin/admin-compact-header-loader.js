(() => {
  if (window.__nothofagusCompactHeaderLoader) return;
  window.__nothofagusCompactHeaderLoader = true;

  if (document.querySelector('link[data-admin-compact-header]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'admin-compact-header.css?v=20260707';
  link.dataset.adminCompactHeader = 'true';
  document.head.appendChild(link);
})();
