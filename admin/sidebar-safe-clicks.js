(() => {
  if (window.__sidebarSafeClicks) return;
  window.__sidebarSafeClicks = true;

  const pairs = {
    publicaciones: ['[data-publicaciones-menu]', '[data-publicaciones-toggle]'],
    miembros: ['[data-members-menu]', '[data-members-toggle]'],
    tesoreria: ['[data-tesoreria-menu]', '[data-tesoreria-toggle]'],
    actas: ['[data-actas-menu]', '[data-actas-toggle]']
  };

  window.nothofagusAdminOpenView = routeToView;

  document.addEventListener('click', handleDashboardShortcut, true);
  document.addEventListener('click', handleSidebarClick, true);

  function handleDashboardShortcut(event) {
    const button = event.target.closest?.('[data-dashboard-open-view]');
    if (!button) return;

    const viewId = button.dataset.dashboardOpenView;
    window.requestAnimationFrame(() => routeToView(viewId));
  }

  function handleSidebarClick(event) {
    const el = event.target.closest?.('.sidebar-nav button');
    if (!el) return;

    if (el.matches('[data-publicaciones-toggle]')) {
      closeMany(['miembros', 'tesoreria', 'actas']);
      return;
    }

    if (el.matches('[data-members-toggle]')) {
      closeMany(['publicaciones', 'tesoreria', 'actas']);
      return;
    }

    if (el.matches('[data-tesoreria-toggle]')) {
      closeMany(['publicaciones', 'miembros', 'actas']);
      return;
    }

    if (el.matches('[data-actas-toggle]')) {
      closeMany(['publicaciones', 'miembros', 'tesoreria']);
      return;
    }

    if (el.matches('[data-tesoreria-open]')) {
      closeMany(['publicaciones', 'miembros', 'actas']);
      const viewId = getTesoreriaViewId(el.dataset.tesoreriaOpen);
      window.requestAnimationFrame(() => routeToView(viewId, el));
      return;
    }

    if (el.matches('[data-actas-open]')) {
      closeMany(['publicaciones', 'miembros', 'tesoreria']);
      const viewId = el.dataset.actasOpen === 'crear' ? 'crear-acta-view' : 'registro-actas-view';
      window.requestAnimationFrame(() => routeToView(viewId, el));
      return;
    }

    if (el.matches('[data-admin-view]')) {
      const viewId = el.dataset.adminView;
      syncMenusForView(viewId);
      window.requestAnimationFrame(() => routeToView(viewId, el));
    }
  }

  function routeToView(viewId, sourceButton = null) {
    if (!viewId) return false;

    const trigger = sourceButton || document.querySelector(`.sidebar-nav [data-admin-view="${cssEscape(viewId)}"]`);
    return openView(viewId, trigger);
  }

  function getTesoreriaViewId(tipo) {
    const normalized = String(tipo || 'general').trim();
    if (normalized === 'ingresos') return 'tesoreria-ingresos-view';
    if (normalized === 'egresos') return 'tesoreria-egresos-view';
    if (normalized === 'cuotas') return 'tesoreria-cuotas-view';
    return 'tesoreria-general-view';
  }

  function syncMenusForView(viewId) {
    if (viewId === 'gestion-view' || viewId === 'nueva-view') {
      openMenu('publicaciones');
      closeMany(['miembros', 'tesoreria', 'actas']);
      return;
    }

    if (String(viewId).startsWith('members-')) {
      openMenu('miembros');
      closeMany(['publicaciones', 'tesoreria', 'actas']);
      return;
    }

    if (String(viewId).startsWith('tesoreria-')) {
      openMenu('tesoreria');
      closeMany(['publicaciones', 'miembros', 'actas']);
      return;
    }

    if (viewId === 'crear-acta-view' || viewId === 'registro-actas-view') {
      openMenu('actas');
      closeMany(['publicaciones', 'miembros', 'tesoreria']);
      return;
    }

    closeMany(['publicaciones', 'miembros', 'tesoreria', 'actas']);
  }

  function openMenu(key) {
    const pair = pairs[key];
    if (!pair) return;
    const menu = document.querySelector(pair[0]);
    const toggleButton = document.querySelector(pair[1]);
    if (!menu || !toggleButton || menu.classList.contains('is-hidden')) return;
    menu.classList.remove('is-collapsed');
    menu.style.maxHeight = '520px';
    menu.style.opacity = '1';
    menu.style.pointerEvents = 'auto';
    toggleButton.classList.add('is-open');
    toggleButton.setAttribute('aria-expanded', 'true');
  }

  function closeMenu(key) {
    const pair = pairs[key];
    if (!pair) return;
    const menu = document.querySelector(pair[0]);
    const toggleButton = document.querySelector(pair[1]);
    if (!menu || !toggleButton) return;
    menu.classList.add('is-collapsed');
    menu.style.maxHeight = '';
    menu.style.opacity = '';
    menu.style.pointerEvents = '';
    toggleButton.classList.remove('is-open');
    toggleButton.setAttribute('aria-expanded', 'false');
  }

  function closeMany(keys) {
    keys.forEach(closeMenu);
  }

  function openView(viewId, trigger) {
    const view = document.getElementById(viewId);
    if (!view || view.classList.contains('is-hidden')) return false;
    if (trigger && trigger.classList.contains('is-hidden')) return false;

    document.querySelectorAll('.admin-view').forEach((item) => {
      item.classList.toggle('is-active', item.id === viewId);
    });

    view.querySelectorAll('.admin-panel, .list-card, .editor-card, .users-card').forEach((panel) => {
      panel.classList.remove('is-hidden');
    });

    setActiveSidebarState(viewId, trigger);
    updateHeader(view);
    dispatchViewEvents(viewId);

    return true;
  }

  function setActiveSidebarState(viewId, trigger = null) {
    const isPublicaciones = viewId === 'gestion-view' || viewId === 'nueva-view';
    const isMiembros = String(viewId).startsWith('members-');
    const isTesoreria = String(viewId).startsWith('tesoreria-');
    const isActas = viewId === 'crear-acta-view' || viewId === 'registro-actas-view';

    document.querySelectorAll('.sidebar-nav .is-active').forEach((item) => item.classList.remove('is-active'));

    document.querySelectorAll('.sidebar-nav [data-admin-view]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.adminView === viewId);
    });

    document.querySelectorAll('.sidebar-nav [data-tesoreria-open]').forEach((button) => {
      const targetView = getTesoreriaViewId(button.dataset.tesoreriaOpen);
      button.classList.toggle('is-active', targetView === viewId || button === trigger);
    });

    document.querySelectorAll('.sidebar-nav [data-actas-open]').forEach((button) => {
      const targetView = button.dataset.actasOpen === 'crear' ? 'crear-acta-view' : 'registro-actas-view';
      button.classList.toggle('is-active', targetView === viewId || button === trigger);
    });

    document.querySelector('[data-publicaciones-toggle]')?.classList.toggle('is-active', isPublicaciones);
    document.querySelector('[data-members-toggle]')?.classList.toggle('is-active', isMiembros);
    document.querySelector('[data-tesoreria-toggle]')?.classList.toggle('is-active', isTesoreria);
    document.querySelector('[data-actas-toggle]')?.classList.toggle('is-active', isActas);
  }

  function updateHeader(view) {
    const title = document.querySelector('#admin-view-title');
    const desc = document.querySelector('#admin-view-description');
    if (title) title.textContent = view.dataset.viewTitle || 'Panel administrativo';
    if (desc) desc.textContent = view.dataset.viewDescription || '';
  }

  function dispatchViewEvents(viewId) {
    window.dispatchEvent(new CustomEvent('nothofagus:admin-view', { detail: { viewId } }));
    if (String(viewId).startsWith('members-')) {
      window.dispatchEvent(new CustomEvent('nothofagus:members-view', { detail: { viewId } }));
    }
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replaceAll('"', '\\"');
  }
})();
