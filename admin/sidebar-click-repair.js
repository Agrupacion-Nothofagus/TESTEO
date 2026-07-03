// Reparación centralizada de navegación del sidebar.
// Restaura despliegues y apertura de vistas aunque otros listeners fallen o se dupliquen.
if (!window.__nothofagusSidebarClickRepair) {
  window.__nothofagusSidebarClickRepair = true;

  document.addEventListener('click', handleSidebarClick, true);
}

function handleSidebarClick(event) {
  const target = event.target;
  const nav = target.closest?.('.sidebar-nav');
  if (!nav) return;

  const publicacionesToggle = target.closest('[data-publicaciones-toggle]');
  const miembrosToggle = target.closest('[data-members-toggle]');
  const tesoreriaToggle = target.closest('[data-tesoreria-toggle]');
  const actasToggle = target.closest('[data-actas-toggle]');
  const tesoreriaLink = target.closest('[data-tesoreria-open]');
  const actasLink = target.closest('[data-actas-open]');
  const adminViewButton = target.closest('[data-admin-view]');

  if (publicacionesToggle) {
    event.preventDefault();
    event.stopPropagation();
    toggleMenu('[data-publicaciones-menu]', '[data-publicaciones-toggle]', ['members', 'tesoreria', 'actas']);
    return;
  }

  if (miembrosToggle) {
    event.preventDefault();
    event.stopPropagation();
    toggleMenu('[data-members-menu]', '[data-members-toggle]', ['publicaciones', 'tesoreria', 'actas']);
    return;
  }

  if (tesoreriaToggle) {
    event.preventDefault();
    event.stopPropagation();
    toggleMenu('[data-tesoreria-menu]', '[data-tesoreria-toggle]', ['publicaciones', 'members', 'actas']);
    return;
  }

  if (actasToggle) {
    event.preventDefault();
    event.stopPropagation();
    toggleMenu('[data-actas-menu]', '[data-actas-toggle]', ['publicaciones', 'members', 'tesoreria']);
    return;
  }

  if (tesoreriaLink) {
    event.preventDefault();
    event.stopPropagation();
    const tipo = tesoreriaLink.dataset.tesoreriaOpen || 'general';
    openMenu('[data-tesoreria-menu]', '[data-tesoreria-toggle]');
    closeMenus(['publicaciones', 'members', 'actas']);
    openView(`tesoreria-${tipo}-view`, tesoreriaLink);
    updateHash(tipo === 'general' ? 'tesoreria' : `tesoreria-${tipo}`);
    return;
  }

  if (actasLink) {
    event.preventDefault();
    event.stopPropagation();
    const tipo = actasLink.dataset.actasOpen || 'registro';
    const viewId = tipo === 'crear' ? 'crear-acta-view' : 'registro-actas-view';
    openMenu('[data-actas-menu]', '[data-actas-toggle]');
    closeMenus(['publicaciones', 'members', 'tesoreria']);
    openView(viewId, actasLink);
    updateHash(tipo === 'crear' ? 'crear-acta' : 'registro-actas');
    if (tipo === 'crear') window.setTimeout(() => document.querySelector('[data-acta-nueva]')?.click(), 80);
    return;
  }

  if (adminViewButton) {
    const viewId = adminViewButton.dataset.adminView;
    if (!viewId) return;

    event.preventDefault();
    event.stopPropagation();

    if (adminViewButton.closest('[data-publicaciones-sidebar]')) {
      openMenu('[data-publicaciones-menu]', '[data-publicaciones-toggle]');
      closeMenus(['members', 'tesoreria', 'actas']);
    } else if (adminViewButton.closest('[data-members-sidebar]')) {
      openMenu('[data-members-menu]', '[data-members-toggle]');
      closeMenus(['publicaciones', 'tesoreria', 'actas']);
    } else {
      closeMenus(['publicaciones', 'members', 'tesoreria', 'actas']);
    }

    openView(viewId, adminViewButton);
  }
}

function openView(viewId, sourceButton = null) {
  const view = document.getElementById(viewId);
  if (!view) return;

  document.querySelectorAll('.admin-view').forEach((item) => {
    item.classList.toggle('is-active', item.id === viewId);
  });

  view.querySelectorAll('.admin-panel, .list-card, .editor-card, .users-card').forEach((panel) => {
    panel.classList.remove('is-hidden');
  });

  document.querySelectorAll('.sidebar-nav [data-admin-view], .sidebar-nav [data-actas-open], .sidebar-nav [data-tesoreria-open]').forEach((button) => {
    const active = button === sourceButton || button.dataset.adminView === viewId;
    button.classList.toggle('is-active', active);
  });

  document.querySelector('[data-publicaciones-toggle]')?.classList.toggle('is-active', viewId === 'gestion-view' || viewId === 'nueva-view');
  document.querySelector('[data-members-toggle]')?.classList.toggle('is-active', viewId.startsWith('members-'));
  document.querySelector('[data-tesoreria-toggle]')?.classList.toggle('is-active', viewId.startsWith('tesoreria-'));
  document.querySelector('[data-actas-toggle]')?.classList.toggle('is-active', viewId === 'crear-acta-view' || viewId === 'registro-actas-view');

  const title = document.querySelector('#admin-view-title');
  const description = document.querySelector('#admin-view-description');
  if (title) title.textContent = view.dataset.viewTitle || 'Panel administrativo';
  if (description) description.textContent = view.dataset.viewDescription || '';
}

function toggleMenu(menuSelector, toggleSelector, closeKeys = []) {
  const menu = document.querySelector(menuSelector);
  const toggle = document.querySelector(toggleSelector);
  if (!menu || !toggle) return;

  const shouldOpen = menu.classList.contains('is-collapsed');
  closeMenus(closeKeys);

  if (shouldOpen) openMenu(menuSelector, toggleSelector);
  else closeMenu(menuSelector, toggleSelector);
}

function openMenu(menuSelector, toggleSelector) {
  const menu = document.querySelector(menuSelector);
  const toggle = document.querySelector(toggleSelector);
  if (!menu || !toggle) return;

  menu.classList.remove('is-collapsed');
  toggle.classList.add('is-open');
  toggle.setAttribute('aria-expanded', 'true');
}

function closeMenu(menuSelector, toggleSelector) {
  const menu = document.querySelector(menuSelector);
  const toggle = document.querySelector(toggleSelector);
  if (!menu || !toggle) return;

  menu.classList.add('is-collapsed');
  toggle.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
}

function closeMenus(keys) {
  const map = {
    publicaciones: ['[data-publicaciones-menu]', '[data-publicaciones-toggle]'],
    members: ['[data-members-menu]', '[data-members-toggle]'],
    tesoreria: ['[data-tesoreria-menu]', '[data-tesoreria-toggle]'],
    actas: ['[data-actas-menu]', '[data-actas-toggle]']
  };

  keys.forEach((key) => {
    const pair = map[key];
    if (pair) closeMenu(pair[0], pair[1]);
  });
}

function updateHash(hash) {
  if (!hash) return;
  try {
    history.replaceState(null, '', `#${hash}`);
  } catch {
    location.hash = hash;
  }
}
