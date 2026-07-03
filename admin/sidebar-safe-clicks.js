(() => {
  if (window.__sidebarSafeClicks) return;
  window.__sidebarSafeClicks = true;

  const pairs = {
    publicaciones: ['[data-publicaciones-menu]', '[data-publicaciones-toggle]'],
    miembros: ['[data-members-menu]', '[data-members-toggle]'],
    tesoreria: ['[data-tesoreria-menu]', '[data-tesoreria-toggle]'],
    actas: ['[data-actas-menu]', '[data-actas-toggle]']
  };

  document.addEventListener('click', (event) => {
    const el = event.target.closest?.('.sidebar-nav button');
    if (!el) return;

    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    if (el.matches('[data-publicaciones-toggle]')) {
      stop();
      toggle('publicaciones', ['miembros', 'tesoreria', 'actas']);
      return;
    }

    if (el.matches('[data-members-toggle]')) {
      stop();
      toggle('miembros', ['publicaciones', 'tesoreria', 'actas']);
      return;
    }

    if (el.matches('[data-tesoreria-toggle]')) {
      stop();
      toggle('tesoreria', ['publicaciones', 'miembros', 'actas']);
      return;
    }

    if (el.matches('[data-actas-toggle]')) {
      stop();
      toggle('actas', ['publicaciones', 'miembros', 'tesoreria']);
      return;
    }

    if (el.matches('[data-tesoreria-open]')) {
      stop();
      const tipo = el.dataset.tesoreriaOpen || 'general';
      openMenu('tesoreria');
      closeMany(['publicaciones', 'miembros', 'actas']);
      openView(`tesoreria-${tipo}-view`, el);
      return;
    }

    if (el.matches('[data-actas-open]')) {
      stop();
      const view = el.dataset.actasOpen === 'crear' ? 'crear-acta-view' : 'registro-actas-view';
      openMenu('actas');
      closeMany(['publicaciones', 'miembros', 'tesoreria']);
      openView(view, el);
      return;
    }

    if (el.matches('[data-admin-view]')) {
      stop();
      const view = el.dataset.adminView;
      if (el.closest('[data-publicaciones-sidebar]')) {
        openMenu('publicaciones');
        closeMany(['miembros', 'tesoreria', 'actas']);
      } else if (el.closest('[data-members-sidebar]')) {
        openMenu('miembros');
        closeMany(['publicaciones', 'tesoreria', 'actas']);
      } else {
        closeMany(['publicaciones', 'miembros', 'tesoreria', 'actas']);
      }
      openView(view, el);
    }
  }, true);

  function toggle(key, closeKeys) {
    const menu = document.querySelector(pairs[key]?.[0]);
    if (!menu) return;
    const shouldOpen = menu.classList.contains('is-collapsed');
    closeMany(closeKeys);
    shouldOpen ? openMenu(key) : closeMenu(key);
  }

  function openMenu(key) {
    const pair = pairs[key];
    if (!pair) return;
    const menu = document.querySelector(pair[0]);
    const toggleButton = document.querySelector(pair[1]);
    if (!menu || !toggleButton) return;
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

  function openView(viewId, button) {
    const view = document.getElementById(viewId);
    if (!view) return;

    document.querySelectorAll('.admin-view').forEach((item) => item.classList.toggle('is-active', item.id === viewId));
    view.querySelectorAll('.admin-panel, .list-card, .editor-card, .users-card').forEach((panel) => panel.classList.remove('is-hidden'));

    document.querySelectorAll('.sidebar-nav .is-active').forEach((item) => item.classList.remove('is-active'));
    button?.classList.add('is-active');

    const title = document.querySelector('#admin-view-title');
    const desc = document.querySelector('#admin-view-description');
    if (title) title.textContent = view.dataset.viewTitle || 'Panel administrativo';
    if (desc) desc.textContent = view.dataset.viewDescription || '';
  }
})();
