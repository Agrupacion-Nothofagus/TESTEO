(() => {
  if (window.__nothofagusFixedSidebarLoader) return;
  window.__nothofagusFixedSidebarLoader = true;

  if (document.querySelector('link[data-admin-fixed-sidebar]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'admin-fixed-sidebar.css?v=20260707';
  link.dataset.adminFixedSidebar = 'true';
  document.head.appendChild(link);
})();
