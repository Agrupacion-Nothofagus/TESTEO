(() => {
  if (window.__nothofagusAdminResponsive) return;
  window.__nothofagusAdminResponsive = true;

  const sidebar = document.querySelector('#admin-sidebar');
  const brand = sidebar?.querySelector('.sidebar-brand');
  const navigation = sidebar?.querySelector('.sidebar-nav');
  const mobileQuery = window.matchMedia('(max-width: 920px)');

  if (!sidebar || !brand || !navigation) return;

  const stylesheet = document.querySelector('link[data-admin-responsive]') || document.createElement('link');
  stylesheet.rel ||= 'stylesheet';
  stylesheet.href = 'admin-responsive.css?v=20260924-mobile-shell-1';
  stylesheet.dataset.adminResponsive = 'true';
  // Reinsert the already loaded stylesheet after module-specific styles.
  document.head.appendChild(stylesheet);

  navigation.id ||= 'admin-primary-navigation';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'admin-mobile-menu-toggle';
  toggle.setAttribute('aria-controls', navigation.id);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Abrir menú de administración');
  toggle.innerHTML = '<span aria-hidden="true"></span><strong>Menú</strong>';
  brand.appendChild(toggle);

  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'admin-mobile-backdrop';
  backdrop.setAttribute('aria-label', 'Cerrar menú de administración');
  backdrop.tabIndex = -1;
  document.body.appendChild(backdrop);

  // A restored browser tab can preserve the class that locks the document
  // even though the mobile menu itself is no longer open.
  setMenuOpen(false);

  toggle.addEventListener('click', () => setMenuOpen(!sidebar.classList.contains('is-mobile-open')));
  backdrop.addEventListener('click', () => setMenuOpen(false));

  sidebar.addEventListener('click', (event) => {
    if (!mobileQuery.matches) return;
    const target = event.target.closest('.sidebar-link, .sidebar-site-link, .sidebar-logout');
    if (target && !target.matches('[aria-expanded]')) setMenuOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && sidebar.classList.contains('is-mobile-open')) {
      setMenuOpen(false);
      toggle.focus();
    }
  });

  mobileQuery.addEventListener('change', () => setMenuOpen(false));
  window.addEventListener('pageshow', () => setMenuOpen(false));
  window.addEventListener('nothofagus:admin-view', () => {
    setMenuOpen(false);
    syncActiveNavigation();
    if (mobileQuery.matches) window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const activeObserver = new MutationObserver(syncActiveNavigation);
  activeObserver.observe(navigation, { subtree: true, attributes: true, attributeFilter: ['class'] });
  syncActiveNavigation();

  // Fixed sidebars and horizontally scrollable tables are separate scroll
  // containers. Forward a vertical wheel gesture to the page only when that
  // inner container cannot continue vertically.
  document.addEventListener('wheel', (event) => {
    if (event.ctrlKey || document.body.classList.contains('admin-mobile-menu-open')) return;
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    const scrollTrap = event.target.closest(
      '.sidebar-nav, .admin-sidebar, .cuotas-table-wrap, .table-responsive, .users-table-wrap, .admin-table-wrap, .tesoreria-table-wrap, .actas-table-wrap'
    );
    if (!scrollTrap) return;

    const canScrollUp = scrollTrap.scrollTop > 0;
    const canScrollDown = scrollTrap.scrollTop + scrollTrap.clientHeight < scrollTrap.scrollHeight - 1;
    if ((event.deltaY < 0 && canScrollUp) || (event.deltaY > 0 && canScrollDown)) return;

    const page = document.scrollingElement;
    if (!page || page.scrollHeight <= page.clientHeight) return;

    const previousTop = page.scrollTop;
    const deltaMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 40
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? window.innerHeight
        : 1;
    page.scrollTop += event.deltaY * deltaMultiplier;
    if (page.scrollTop !== previousTop) event.preventDefault();
  }, { passive: false });

  function setMenuOpen(open) {
    const enabled = Boolean(open && mobileQuery.matches);
    sidebar.classList.toggle('is-mobile-open', enabled);
    document.body.classList.toggle('admin-mobile-menu-open', enabled);
    toggle.setAttribute('aria-expanded', String(enabled));
    toggle.setAttribute('aria-label', enabled ? 'Cerrar menú de administración' : 'Abrir menú de administración');
  }

  function syncActiveNavigation() {
    navigation.querySelectorAll('.sidebar-link, [data-admin-view]').forEach((item) => {
      if (item.classList.contains('is-active')) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }
})();
