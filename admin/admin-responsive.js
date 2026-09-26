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
  stylesheet.href ||= 'admin-responsive.css?v=20260921-2';
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
  window.addEventListener('nothofagus:admin-view', () => {
    setMenuOpen(false);
    syncActiveNavigation();
    if (mobileQuery.matches) window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  const activeObserver = new MutationObserver(syncActiveNavigation);
  activeObserver.observe(navigation, { subtree: true, attributes: true, attributeFilter: ['class'] });
  syncActiveNavigation();

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
