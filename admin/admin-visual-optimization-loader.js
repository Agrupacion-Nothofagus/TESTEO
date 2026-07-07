(() => {
  if (window.__nothofagusAdminVisualOptimization) return;
  window.__nothofagusAdminVisualOptimization = true;

  if (!document.querySelector('link[data-visual-font="plus-jakarta"]')) {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap';
    font.dataset.visualFont = 'plus-jakarta';
    document.head.appendChild(font);
  }

  if (!document.querySelector('link[data-visual-optimization]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '../visual-optimization.css?v=20260704-plus-jakarta-responsive';
    css.dataset.visualOptimization = 'true';
    document.head.appendChild(css);
  }

  if (!document.querySelector('link[data-visual-colors-restore]')) {
    const colors = document.createElement('link');
    colors.rel = 'stylesheet';
    colors.href = '../visual-colors-restore.css?v=20260706-logo';
    colors.dataset.visualColorsRestore = 'true';
    document.head.appendChild(colors);
  }

  if (!document.querySelector('link[data-admin-record-list]')) {
    const records = document.createElement('link');
    records.rel = 'stylesheet';
    records.href = 'admin-record-list.css?v=20260706-fase1';
    records.dataset.adminRecordList = 'true';
    document.head.appendChild(records);
  }

  if (!document.querySelector('link[data-admin-record-tesoreria]')) {
    const treasury = document.createElement('link');
    treasury.rel = 'stylesheet';
    treasury.href = 'admin-record-tesoreria.css?v=20260706-fase2';
    treasury.dataset.adminRecordTesoreria = 'true';
    document.head.appendChild(treasury);
  }

  if (!document.querySelector('link[data-dashboard-teurgia-style]')) {
    const dashboard = document.createElement('link');
    dashboard.rel = 'stylesheet';
    dashboard.href = 'dashboard-teurgia-style.css?v=20260706';
    dashboard.dataset.dashboardTeurgiaStyle = 'true';
    document.head.appendChild(dashboard);
  }

  if (!document.querySelector('link[data-admin-dashboard-system]')) {
    const system = document.createElement('link');
    system.rel = 'stylesheet';
    system.href = 'admin-dashboard-system.css?v=20260706-sidebar-clean';
    system.dataset.adminDashboardSystem = 'true';
    document.head.appendChild(system);
  }

  if (!document.querySelector('link[data-admin-soft-components]')) {
    const components = document.createElement('link');
    components.rel = 'stylesheet';
    components.href = 'admin-soft-components.css?v=20260706-clean-minimal';
    components.dataset.adminSoftComponents = 'true';
    document.head.appendChild(components);
  }

  if (!document.querySelector('link[data-admin-teurgia-exact-layout]')) {
    const teurgia = document.createElement('link');
    teurgia.rel = 'stylesheet';
    teurgia.href = 'admin-teurgia-exact-layout.css?v=20260706-exact';
    teurgia.dataset.adminTeurgiaExactLayout = 'true';
    document.head.appendChild(teurgia);
  }

  if (!document.querySelector('link[data-admin-teurgia-zoom-80]')) {
    const zoom = document.createElement('link');
    zoom.rel = 'stylesheet';
    zoom.href = 'admin-teurgia-zoom-80.css?v=20260706';
    zoom.dataset.adminTeurgiaZoom80 = 'true';
    document.head.appendChild(zoom);
  }

  if (!document.querySelector('link[data-admin-nothofagus-institutional-colors]')) {
    const institutional = document.createElement('link');
    institutional.rel = 'stylesheet';
    institutional.href = 'admin-nothofagus-institutional-colors.css?v=20260706';
    institutional.dataset.adminNothofagusInstitutionalColors = 'true';
    document.head.appendChild(institutional);
  }

  if (!document.querySelector('link[data-admin-dashboard-home-nothofagus]')) {
    const dashboardHome = document.createElement('link');
    dashboardHome.rel = 'stylesheet';
    dashboardHome.href = 'admin-dashboard-home-nothofagus.css?v=20260706';
    dashboardHome.dataset.adminDashboardHomeNothofagus = 'true';
    document.head.appendChild(dashboardHome);
  }

  if (!window.__nothofagusFormulariosAdminModule) {
    window.__nothofagusFormulariosAdminModule = true;
    import('./formularios-admin.js?v=20260706-roles').catch((error) => {
      console.error('No fue posible cargar Formularios:', error);
    });
  }

  if (!window.__nothofagusMiembrosQuickCreateModule) {
    window.__nothofagusMiembrosQuickCreateModule = true;
    import('./miembros-quick-create.js?v=20260706').catch((error) => {
      console.error('No fue posible cargar registro rápido de miembros:', error);
    });
  }

  if (!window.__nothofagusCuotasMonthlyHelpers) {
    window.__nothofagusCuotasMonthlyHelpers = true;
    import('./tesoreria-cuotas-monthly-helpers.js?v=20260706').catch((error) => {
      console.error('No fue posible cargar ayudas de cuotas mensuales:', error);
    });
  }
})();
