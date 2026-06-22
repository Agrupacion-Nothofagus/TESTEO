// Agrupa Gestión de publicaciones y Agregar nueva publicación bajo un desplegable Publicaciones.
// Reutiliza los botones existentes para conservar listeners y lógica original.
if (!window.__nothofagusPublicacionesSidebarDropdown) {
  window.__nothofagusPublicacionesSidebarDropdown = true;

  cargarEstilosPublicacionesSidebar();
  instalarPublicacionesDropdown();
}

function cargarEstilosPublicacionesSidebar() {
  if (document.querySelector('link[href="publicaciones-sidebar-dropdown.css"]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'publicaciones-sidebar-dropdown.css';
  document.head.appendChild(link);
}

function instalarPublicacionesDropdown() {
  const nav = document.querySelector('.sidebar-nav');
  const gestionButton = document.querySelector('[data-admin-view="gestion-view"]');
  const nuevaButton = document.querySelector('[data-admin-view="nueva-view"]');

  if (!nav || !gestionButton || !nuevaButton || document.querySelector('[data-publicaciones-sidebar]')) return;

  const group = document.createElement('div');
  group.className = 'publicaciones-sidebar-group';
  group.dataset.publicacionesSidebar = 'true';
  group.innerHTML = `
    <button type="button" class="sidebar-link publicaciones-sidebar-toggle" data-publicaciones-toggle aria-expanded="false" aria-controls="publicaciones-sidebar-menu">
      <span>📚</span>
      Publicaciones
      <strong class="publicaciones-toggle-caret" aria-hidden="true">⌄</strong>
    </button>
    <div class="publicaciones-sidebar-menu is-collapsed" id="publicaciones-sidebar-menu" data-publicaciones-menu></div>
  `;

  nav.insertBefore(group, gestionButton);

  const menu = group.querySelector('[data-publicaciones-menu]');

  gestionButton.classList.add('publicaciones-sidebar-link');
  nuevaButton.classList.add('publicaciones-sidebar-link');

  menu.appendChild(nuevaButton);
  menu.appendChild(gestionButton);

  group.querySelector('[data-publicaciones-toggle]')?.addEventListener('click', alternarMenuPublicaciones);

  menu.querySelectorAll('[data-admin-view]').forEach((button) => {
    button.addEventListener('click', () => abrirMenuPublicaciones());
  });
}

function alternarMenuPublicaciones() {
  const menu = document.querySelector('[data-publicaciones-menu]');
  if (!menu) return;

  if (menu.classList.contains('is-collapsed')) {
    abrirMenuPublicaciones();
  } else {
    cerrarMenuPublicaciones();
  }
}

function abrirMenuPublicaciones() {
  const menu = document.querySelector('[data-publicaciones-menu]');
  const toggle = document.querySelector('[data-publicaciones-toggle]');
  if (!menu || !toggle) return;

  menu.classList.remove('is-collapsed');
  toggle.classList.add('is-open');
  toggle.setAttribute('aria-expanded', 'true');
}

function cerrarMenuPublicaciones() {
  const menu = document.querySelector('[data-publicaciones-menu]');
  const toggle = document.querySelector('[data-publicaciones-toggle]');
  if (!menu || !toggle) return;

  menu.classList.add('is-collapsed');
  toggle.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
}
