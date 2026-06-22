// Mantiene el apartado Actas colapsado al cargar el panel.
// El menú solo se despliega cuando el usuario presiona explícitamente el botón Actas.
if (!window.__nothofagusActasSidebarDefault) {
  window.__nothofagusActasSidebarDefault = true;

  window.setTimeout(() => {
    const menu = document.querySelector('[data-actas-menu]');
    const toggle = document.querySelector('[data-actas-toggle]');

    if (!menu || !toggle) return;

    menu.classList.add('is-collapsed');
    toggle.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
  }, 0);
}
