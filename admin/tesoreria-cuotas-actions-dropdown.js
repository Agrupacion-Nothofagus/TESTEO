(() => {
  if (window.__nothofagusCuotasActionsDropdown) return;
  window.__nothofagusCuotasActionsDropdown = true;

  loadStyles();
  scheduleEnhance();

  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('nothofagus:admin-view', scheduleEnhance);

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest?.('[data-cuotas-actions-toggle]');
    const menuButton = event.target.closest?.('.cuotas-actions-menu button');

    if (toggle) {
      event.preventDefault();
      event.stopPropagation();
      const actions = toggle.closest('.cuotas-actions');
      const willOpen = !actions?.classList.contains('is-open');
      closeAll(actions);
      actions?.classList.toggle('is-open', willOpen);
      toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      return;
    }

    if (menuButton) {
      window.setTimeout(() => closeAll(), 0);
      return;
    }

    if (!event.target.closest?.('.cuotas-actions')) {
      closeAll();
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAll();
  });

  function loadStyles() {
    if (document.querySelector('link[data-cuotas-actions-dropdown]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'tesoreria-cuotas-actions-dropdown.css?v=20260706';
    link.dataset.cuotasActionsDropdown = 'true';
    document.head.appendChild(link);
  }

  function scheduleEnhance() {
    window.requestAnimationFrame(enhanceActions);
  }

  function enhanceActions() {
    document.querySelectorAll('.cuotas-actions:not([data-cuotas-actions-enhanced])').forEach((actions) => {
      const buttons = Array.from(actions.querySelectorAll(':scope > button'));
      if (!buttons.length) return;

      actions.dataset.cuotasActionsEnhanced = 'true';

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'cuotas-actions-toggle';
      toggle.dataset.cuotasActionsToggle = 'true';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '<span class="cuotas-actions-toggle-icon" aria-hidden="true">☰</span><span>Acciones</span>';

      const menu = document.createElement('div');
      menu.className = 'cuotas-actions-menu';

      buttons.forEach((button) => menu.appendChild(button));
      actions.appendChild(toggle);
      actions.appendChild(menu);
    });
  }

  function closeAll(except = null) {
    document.querySelectorAll('.cuotas-actions.is-open').forEach((actions) => {
      if (except && actions === except) return;
      actions.classList.remove('is-open');
      actions.querySelector('[data-cuotas-actions-toggle]')?.setAttribute('aria-expanded', 'false');
    });
  }
})();
