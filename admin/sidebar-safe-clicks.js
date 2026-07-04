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
    const handled = routeToView(button.dataset.dashboardOpenView);
    if (handled) stop(event);
  }

  function handleSidebarClick(event) {
    const el = event.target.closest?.('.sidebar-nav button');
    if (!el) return;

    if (el.matches('[data-publicaciones-toggle]')) {
      stop(event);
      toggle('publicaciones', ['miembros', 'tesoreria', 'actas']);
      return;
    }

    if (el.matches('[data-members-toggle]')) {
      stop(event);
      toggle('miembros', ['publicaciones', 'tesoreria', 'actas']);
      return;
    }

    if (el.matches('[data-tesoreria-toggle]')) {
      stop(event);
      toggle('tesoreria', ['publicaciones', 'miembros', 'actas']);
      return;
    }

    if (el.matches('[data-actas-toggle]')) {
      stop(event);
      toggle('actas', ['publicaciones', 'miembros', 'tesoreria']);
      return;
    }

    if (el.matches('[data-tesoreria-open]')) {
      closeMany(['publicaciones', 'miembros', 'actas']);
      return;
    }

    if (el.matches('[data-actas-open]')) {
      closeMany(['publicaciones', 'miembros', 'tesoreria']);
      return;
    }

    if (el.matches('[data-admin-view]')) {
      const handled = routeToView(el.dataset.adminView, el);
      if (handled) stop(event);
    }
  }

  function routeToView(viewId, sourceButton = null) {
    if (!viewId) return false;

    const delegatedButton = getDelegatedModuleButton(viewId);
    if (delegatedButton) {
      delegatedButton.click();
      return true;
    }

    const trigger = sourceButton || document.querySelector(`.sidebar-nav [data-admin-view="${cssEscape(viewId)}"]`);
    return openView(viewId, trigger);
  }

  function getDelegatedModuleButton(viewId) {
    const selectors = {
      'crear-acta-view': '[data-actas-open="crear"]',
      'registro-actas-view': '[data-actas-open="registro"]',
      'tesoreria-general-view': '[data-tesoreria-open="general"]',
      'tesoreria-ingresos-view': '[data-tesoreria-open="ingresos"]',
      'tesoreria-egresos-view': '[data-tesoreria-open="egresos"]',
      'tesoreria-cuotas-view': '[data-tesoreria-open="cuotas"]'
    };

    const selector = selectors[viewId];
    if (!selector) return null;
    const button = document.querySelector(selector);
    if (!button || button.classList.contains('is-hidden')) return null;
    return button;
  }

  function stop(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  }

  function toggle(key, closeKeys) {
    const menu = document.querySelector(pairs[key]?.[0]);
    if (!menu) return;
    const shouldOpen = menu.classList.contains('is-collapsed');
    closeMany(closeKeys);
    shouldOpen ? openMenu(key) : closeMenu(key);
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

    syncMenusForView(viewId);

    document.querySelectorAll('.admin-view').forEach((item) => {
      item.classList.toggle('is-active', item.id === viewId);
    });

    view.querySelectorAll('.admin-panel, .list-card, .editor-card, .users-card').forEach((panel) => {
      panel.classList.remove('is-hidden');
    });

    setActiveSidebarState(viewId);
    updateHeader(view);
    dispatchViewEvents(viewId);

    return true;
  }

  function setActiveSidebarState(viewId) {
    const isPublicaciones = viewId === 'gestion-view' || viewId === 'nueva-view';
    const isMiembros = String(viewId).startsWith('members-');
    const isTesoreria = String(viewId).startsWith('tesoreria-');
    const isActas = viewId === 'crear-acta-view' || viewId === 'registro-actas-view';

    document.querySelectorAll('.sidebar-nav .is-active').forEach((item) => item.classList.remove('is-active'));

    document.querySelectorAll('.sidebar-nav [data-admin-view]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.adminView === viewId);
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