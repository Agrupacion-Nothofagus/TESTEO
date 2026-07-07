(() => {
  if (window.__nothofagusNoHeaderCuotasLayoutLoader) return;
  window.__nothofagusNoHeaderCuotasLayoutLoader = true;

  if (!document.querySelector('link[data-admin-no-header-cuotas-layout]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'admin-no-header-cuotas-layout.css?v=20260707';
    css.dataset.adminNoHeaderCuotasLayout = 'true';
    document.head.appendChild(css);
  }

  if (!window.__nothofagusCuotasReorderLayoutModule) {
    window.__nothofagusCuotasReorderLayoutModule = true;
    import('./tesoreria-cuotas-reorder-layout.js?v=20260707').catch((error) => {
      console.error('No fue posible reordenar Registro de pagos:', error);
    });
  }

  if (!window.__nothofagusCuotasNominaModule) {
    window.__nothofagusCuotasNominaModule = true;
    import('./tesoreria-cuotas-nomina.js?v=20260707').catch((error) => {
      console.error('No fue posible cargar Nómina de cuotas:', error);
    });
  }
})();
