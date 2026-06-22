// Control de navegación única para el panel administrativo.
// Evita que se mantengan abiertas varias secciones del sidebar o varias vistas del contenido al mismo tiempo.
if (!window.__nothofagusAdminSingleView) {
  window.__nothofagusAdminSingleView = true;

  document.addEventListener('click', (event) => {
    const target = event.target;
    const publicacionesToggle = target.closest?.('[data-publicaciones-toggle]');
    const publicacionesLink = target.closest?.('[data-publicaciones-sidebar] [data-admin-view]');
    const memberToggle = target.closest?.('[data-members-toggle]');
    const actasToggle = target.closest?.('[data-actas-toggle]');
    const memberLink = target.closest?.('.member-sidebar-link[data-admin-view]');
    const actasLink = target.closest?.('[data-actas-open]');
    const staticAdminLink = target.closest?.('[data-admin-view]');

    if (publicacionesToggle) {
      closeMembersMenu();
      closeActasMenu();
      return;
    }

    if (publicacionesLink) {
      closeMembersMenu();
      closeActasMenu();
      requestAnimationFrame(() => enforceSingleView(publicacionesLink.dataset.adminView));
      return;
    }

    if (memberToggle) {
      closePublicacionesMenu();
      closeActasMenu();
      return;
    }

    if (actasToggle) {
      closePublicacionesMenu();
      closeMembersMenu();
      return;
    }

    if (memberLink) {
      closePublicacionesMenu();
      closeActasMenu();
      requestAnimationFrame(() => enforceSingleView(memberLink.dataset.adminView));
      return;
    }

    if (actasLink) {
      closePublicacionesMenu();
      closeMembersMenu();
      const targetView = actasLink.dataset.actasOpen === 'crear'
        ? 'crear-acta-view'
        : 'registro-actas-view';
      requestAnimationFrame(() => enforceSingleView(targetView));
      return;
    }

    if (
      staticAdminLink
      && !staticAdminLink.closest('[data-publicaciones-sidebar]')
      && !staticAdminLink.closest('[data-members-sidebar]')
      && !staticAdminLink.closest('[data-actas-sidebar]')
    ) {
      closePublicacionesMenu();
      closeMembersMenu();
      closeActasMenu();
      requestAnimationFrame(() => enforceSingleView(staticAdminLink.dataset.adminView));
    }
  }, true);

  window.addEventListener('nothofagus:members-view', (event) => {
    closePublicacionesMenu();
    closeActasMenu();
    requestAnimationFrame(() => enforceSingleView(event.detail?.viewId));
  });
}

function enforceSingleView(viewId) {
  if (!viewId) return;

  document.querySelectorAll('.admin-view').forEach((view) => {
    view.classList.toggle('is-active', view.id === viewId);
  });

  document.querySelectorAll('[data-admin-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.adminView === viewId);
  });

  document.querySelectorAll('[data-actas-open]').forEach((button) => {
    const shouldBeActive = (button.dataset.actasOpen === 'crear' && viewId === 'crear-acta-view')
      || (button.dataset.actasOpen === 'registro' && viewId === 'registro-actas-view');
    button.classList.toggle('is-active', shouldBeActive);
  });

  const esPublicaciones = viewId === 'gestion-view' || viewId === 'nueva-view';
  const esMiembros = String(viewId).startsWith('members-');
  const esActas = viewId === 'crear-acta-view' || viewId === 'registro-actas-view';

  document.querySelector('[data-publicaciones-toggle]')?.classList.toggle('is-active', esPublicaciones);
  document.querySelector('[data-members-toggle]')?.classList.toggle('is-active', esMiembros);
  document.querySelector('[data-actas-toggle]')?.classList.toggle('is-active', esActas);
}

function closePublicacionesMenu() {
  const menu = document.querySelector('[data-publicaciones-menu]');
  const toggle = document.querySelector('[data-publicaciones-toggle]');

  if (!menu || !toggle) return;

  menu.classList.add('is-collapsed');
  toggle.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
}

function closeMembersMenu() {
  const menu = document.querySelector('[data-members-menu]');
  const toggle = document.querySelector('[data-members-toggle]');

  if (!menu || !toggle) return;

  menu.classList.add('is-collapsed');
  toggle.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
}

function closeActasMenu() {
  const menu = document.querySelector('[data-actas-menu]');
  const toggle = document.querySelector('[data-actas-toggle]');

  if (!menu || !toggle) return;

  menu.classList.add('is-collapsed');
  toggle.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
}
