(() => {
  if (window.__nothofagusMembersActasRowLoader) return;
  window.__nothofagusMembersActasRowLoader = true;

  if (!document.querySelector('link[data-members-actas-row-style]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'admin-members-actas-row-style.css?v=20260707';
    css.dataset.membersActasRowStyle = 'true';
    document.head.appendChild(css);
  }

  if (!window.__nothofagusMembersActasRowInteractionsModule) {
    window.__nothofagusMembersActasRowInteractionsModule = true;
    import('./admin-members-actas-row-interactions.js?v=20260707').catch((error) => {
      console.error('No fue posible cargar filas desplegables de miembros:', error);
    });
  }
})();
