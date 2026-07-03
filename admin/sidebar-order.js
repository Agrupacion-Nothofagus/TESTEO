// Orden fijo del sidebar administrativo.
// Mantiene grupos desplegables y evita que el texto herede estilo de ícono.
if (!window.__nothofagusSidebarOrder) {
  window.__nothofagusSidebarOrder = true;

  const ORDER = ['dashboard', 'publicaciones', 'miembros', 'tesoreria', 'actas', 'usuarios'];

  let ordering = false;
  let timer = null;

  loadSidebarOrderStyles();
  scheduleSidebarOrder();
  [120, 350, 800, 1500, 2600].forEach((delay) => window.setTimeout(scheduleSidebarOrder, delay));

  const nav = document.querySelector('.sidebar-nav');
  if (nav) {
    const observer = new MutationObserver(() => scheduleSidebarOrder());
    observer.observe(nav, { childList: true, subtree: false });
  }

  function loadSidebarOrderStyles() {
    if (document.querySelector('link[href="sidebar-order-fix.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'sidebar-order-fix.css';
    document.head.appendChild(link);
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
      dashboard: document.querySelector('[data-admin-view="dashboard-view"]'),
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
    normalizeButton(document.querySelector('[data-admin-view="dashboard-view"]'), '🏠', 'Panel de control');
    normalizeButton(document.querySelector('[data-publicaciones-toggle]'), '📚', 'Publicaciones');
    normalizeButton(document.querySelector('[data-members-toggle]'), '🤝', 'Miembros');
    normalizeButton(document.querySelector('[data-tesoreria-toggle]'), '💰', 'Tesorería');
    normalizeButton(document.querySelector('[data-actas-toggle]'), '📝', 'Actas');
    normalizeButton(document.querySelector('[data-admin-view="usuarios-view"]'), '👤', 'Administrar usuarios');
  }

  function normalizeButton(button, icon, text) {
    if (!button) return;

    const caret = button.querySelector('.publicaciones-toggle-caret, .members-toggle-caret, .tesoreria-toggle-caret, .actas-toggle-caret');
    const hiddenChildren = Array.from(button.children).filter((child) => child.classList?.contains('sidebar-label-text'));
    hiddenChildren.forEach((child) => child.remove());

    button.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) node.remove();
    });

    let iconNode = button.querySelector(':scope > .sidebar-icon-fixed');
    const firstSpan = button.querySelector(':scope > span:not(.sidebar-text-fixed):not(.publicaciones-toggle-caret):not(.members-toggle-caret):not(.tesoreria-toggle-caret):not(.actas-toggle-caret)');

    if (!iconNode && firstSpan) {
      iconNode = firstSpan;
      iconNode.classList.add('sidebar-icon-fixed');
    }

    if (!iconNode) {
      iconNode = document.createElement('span');
      iconNode.className = 'sidebar-icon-fixed';
      button.prepend(iconNode);
    }

    iconNode.textContent = icon;

    let labelNode = button.querySelector(':scope > .sidebar-text-fixed');
    if (!labelNode) {
      labelNode = document.createElement('strong');
      labelNode.className = 'sidebar-text-fixed';
      iconNode.after(labelNode);
    }

    labelNode.textContent = text;

    if (caret && caret.parentElement === button) button.appendChild(caret);
  }
}
