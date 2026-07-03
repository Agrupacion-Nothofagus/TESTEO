// Orden fijo del sidebar administrativo.
// Mantiene los grupos desplegables existentes y deja Usuarios al final.
if (!window.__nothofagusSidebarOrder) {
  window.__nothofagusSidebarOrder = true;

  const ORDER = [
    'dashboard',
    'publicaciones',
    'miembros',
    'tesoreria',
    'actas',
    'usuarios'
  ];

  let ordering = false;
  let timer = null;

  scheduleSidebarOrder();
  [120, 350, 800, 1500, 2600].forEach((delay) => window.setTimeout(scheduleSidebarOrder, delay));

  const nav = document.querySelector('.sidebar-nav');
  if (nav) {
    const observer = new MutationObserver(() => scheduleSidebarOrder());
    observer.observe(nav, { childList: true, subtree: false });
  }

  function scheduleSidebarOrder() {
    window.clearTimeout(timer);
    timer = window.setTimeout(applySidebarOrder, 60);
  }

  function applySidebarOrder() {
    if (ordering) return;

    const nav = document.querySelector('.sidebar-nav');
    if (!nav) return;

    ordering = true;

    normalizeSidebarLabels();

    const items = {
      dashboard: findDashboardButton(),
      publicaciones: document.querySelector('[data-publicaciones-sidebar]'),
      miembros: document.querySelector('[data-members-sidebar]'),
      tesoreria: document.querySelector('[data-tesoreria-sidebar]'),
      actas: document.querySelector('[data-actas-sidebar]'),
      usuarios: document.querySelector('[data-admin-view="usuarios-view"]')
    };

    ORDER.forEach((key) => {
      const item = items[key];
      if (item && item.parentElement === nav) nav.appendChild(item);
    });

    ordering = false;
  }

  function normalizeSidebarLabels() {
    normalizeButton(findDashboardButton(), '🏠', 'Panel de control');
    normalizeButton(document.querySelector('[data-publicaciones-toggle]'), '📚', 'Publicaciones');
    normalizeButton(document.querySelector('[data-members-toggle]'), '🤝', 'Miembros');
    normalizeButton(document.querySelector('[data-tesoreria-toggle]'), '💰', 'Tesorería');
    normalizeButton(document.querySelector('[data-actas-toggle]'), '📝', 'Actas');
    normalizeButton(document.querySelector('[data-admin-view="usuarios-view"]'), '👤', 'Administrar usuarios');
  }

  function findDashboardButton() {
    return document.querySelector('[data-admin-view="dashboard-view"]');
  }

  function normalizeButton(button, icon, text) {
    if (!button) return;

    const caret = button.querySelector('.publicaciones-toggle-caret, .members-toggle-caret, .tesoreria-toggle-caret, .actas-toggle-caret');
    button.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) node.textContent = '';
    });

    let iconNode = button.querySelector(':scope > span');
    if (!iconNode) {
      iconNode = document.createElement('span');
      button.prepend(iconNode);
    }
    iconNode.textContent = icon;

    let labelNode = button.querySelector(':scope > .sidebar-label-text');
    if (!labelNode) {
      labelNode = document.createElement('span');
      labelNode.className = 'sidebar-label-text';
      iconNode.after(labelNode);
    }
    labelNode.textContent = text;

    if (caret && caret.parentElement === button) button.appendChild(caret);
  }
}
