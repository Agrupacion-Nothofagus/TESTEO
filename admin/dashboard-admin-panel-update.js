(() => {
  if (window.__nothofagusDashboardPanelUpdate) return;
  window.__nothofagusDashboardPanelUpdate = true;

  const ACTAS_STORAGE_KEY = 'nothofagus_registro_actas_v1';
  const ACTIONS = [
    ['Publicaciones', 'Listado editorial', 'gestion-view'],
    ['Nueva publicación', 'Crear contenido', 'nueva-view'],
    ['Miembros', 'Nómina institucional', 'members-list-view'],
    ['Pendientes', 'Solicitudes nuevas', 'members-pending-view'],
    ['Contactados', 'Seguimiento', 'members-contacted-view'],
    ['Rechazados', 'Con observación', 'members-rejected-view'],
    ['Tesorería general', 'Ingresos y egresos', 'tesoreria:general'],
    ['Registro de pagos', 'Cuotas mensuales', 'tesoreria:cuotas'],
    ['Ingresos', 'Registrar entrada', 'tesoreria:ingresos'],
    ['Egresos', 'Registrar salida', 'tesoreria:egresos'],
    ['Crear acta', 'Documento interno', 'actas:crear'],
    ['Registro de actas', 'Archivo interno', 'actas:registro'],
    ['Usuarios', 'Roles y accesos', 'usuarios-view']
  ];

  loadStyles();
  installNavigation();
  scheduleApply();

  document.addEventListener('DOMContentLoaded', scheduleApply);
  window.addEventListener('hashchange', scheduleApply);
  window.setTimeout(scheduleApply, 600);
  window.setTimeout(scheduleApply, 1600);

  function scheduleApply() {
    window.clearTimeout(scheduleApply.timer);
    scheduleApply.timer = window.setTimeout(applyDashboard, 80);
  }

  function applyDashboard() {
    const panel = document.querySelector('#dashboard-view .dashboard-panel');
    const hero = document.querySelector('#dashboard-view .dashboard-hero');
    const stats = document.querySelector('#dashboard-view .dashboard-stats-grid');
    const widgets = document.querySelector('#dashboard-view .dashboard-content-grid');
    if (!panel || !hero || !stats || !widgets) return;

    panel.classList.add('dashboard-admin-overview');
    installHero(hero);
    installActions(hero);
    ensureStatCards(stats);
    ensureWidgets(widgets);
    updateActasMetric();
  }

  function installHero(hero) {
    hero.classList.remove('dashboard-hero-compact');
    if (hero.querySelector('[data-dashboard-control-hero]')) return;

    const card = document.createElement('article');
    card.className = 'dashboard-hero-card dashboard-control-hero';
    card.dataset.dashboardControlHero = 'true';
    card.innerHTML = `
      <p class="dashboard-hero-kicker">Panel institucional</p>
      <h3>Panel de control</h3>
      <p>Vista general del estado operativo del admin: publicaciones, solicitudes, miembros, tesorería, cuotas, actas y usuarios internos.</p>
      <div class="dashboard-hero-meta">
        <span>Año ${new Date().getFullYear()}</span>
        <span>Administración integral</span>
        <span data-dashboard-last-update>Actualizado</span>
      </div>
    `;
    hero.prepend(card);
  }

  function installActions(hero) {
    const quickCard = hero.querySelector('.dashboard-quick-card');
    if (!quickCard) return;
    quickCard.classList.add('dashboard-admin-map');
    quickCard.innerHTML = `
      <strong>Accesos del panel admin</strong>
      <p>Entrada rápida a las áreas principales del sistema.</p>
      <div class="dashboard-quick-actions dashboard-module-actions" data-dashboard-actions>
        ${ACTIONS.map(([label, note, target]) => `<button type="button" class="dashboard-action-button dashboard-module-button" data-dashboard-target="${escapeAttr(target)}">${escapeHTML(label)}<span>${escapeHTML(note)}</span></button>`).join('')}
      </div>
    `;
  }

  function ensureStatCards(stats) {
    ensureStat(stats, 'actas-total', 'Actas registradas', 'Borradores, finalizadas y aprobadas.');
    ensureStat(stats, 'tesoreria-ingresos', 'Ingresos anuales', 'Incluye movimientos generales y cuotas.');
    ensureStat(stats, 'tesoreria-egresos', 'Egresos anuales', 'Salidas registradas por tesorería.');
    ensureStat(stats, 'tesoreria-saldo', 'Saldo disponible', 'Ingresos menos egresos.');
  }

  function ensureStat(stats, key, label, note) {
    if (stats.querySelector(`[data-dashboard-total="${key}"]`)) return;
    const card = document.createElement('article');
    card.className = 'dashboard-stat-card dashboard-health-card';
    card.innerHTML = `<span>${escapeHTML(label)}</span><strong data-dashboard-total="${escapeAttr(key)}">—</strong><small>${escapeHTML(note)}</small>`;
    stats.appendChild(card);
  }

  function ensureWidgets(widgets) {
    widgets.classList.add('dashboard-admin-widgets');
    if (!widgets.querySelector('[data-dashboard-actas-summary]')) {
      const card = document.createElement('article');
      card.className = 'dashboard-widget dashboard-wide-widget';
      card.innerHTML = `<div class="dashboard-widget-heading"><h4>Actas institucionales</h4><span>Registro</span></div><div class="dashboard-member-summary" data-dashboard-actas-summary></div>`;
      widgets.appendChild(card);
    }

    if (!widgets.querySelector('[data-dashboard-module-status]')) {
      const card = document.createElement('article');
      card.className = 'dashboard-widget dashboard-full-widget';
      card.innerHTML = `<div class="dashboard-widget-heading"><h4>Estado de módulos</h4><span>Admin</span></div><div class="dashboard-module-status-grid" data-dashboard-module-status>${moduleCards()}</div>`;
      widgets.appendChild(card);
    }
  }

  function moduleCards() {
    const modules = [
      ['Publicaciones', 'Gestión editorial, creación y actualización de contenidos.', 'gestion-view'],
      ['Solicitudes', 'Postulaciones pendientes, contactadas y rechazadas.', 'members-pending-view'],
      ['Miembros', 'Nómina de socios/as y antecedentes principales.', 'members-list-view'],
      ['Tesorería', 'Ingresos, egresos y resumen financiero.', 'tesoreria:general'],
      ['Registro de pagos', 'Matriz mensual de cuotas y nómina de cuotas.', 'tesoreria:cuotas'],
      ['Actas', 'Creación y archivo de actas institucionales.', 'actas:registro'],
      ['Usuarios', 'Administración de roles y accesos internos.', 'usuarios-view']
    ];
    return modules.map(([title, note, target]) => `<article class="dashboard-module-status-card"><strong>${escapeHTML(title)}</strong><span>${escapeHTML(note)}</span><button type="button" data-dashboard-target="${escapeAttr(target)}">Abrir</button></article>`).join('');
  }

  function updateActasMetric() {
    const actas = readActas();
    const total = actas.length;
    const borrador = actas.filter((item) => item.estado === 'borrador').length;
    const finalizada = actas.filter((item) => item.estado === 'finalizada').length;
    const aprobada = actas.filter((item) => item.estado === 'aprobada').length;
    document.querySelectorAll('[data-dashboard-total="actas-total"]').forEach((el) => { el.textContent = String(total); });
    const box = document.querySelector('[data-dashboard-actas-summary]');
    if (box) box.innerHTML = `<article><strong>${total}</strong><span>Total</span></article><article><strong>${borrador}</strong><span>Borrador</span></article><article><strong>${finalizada}</strong><span>Finalizadas</span></article><article><strong>${aprobada}</strong><span>Aprobadas</span></article>`;
  }

  function installNavigation() {
    document.addEventListener('click', (event) => {
      const target = event.target.closest?.('[data-dashboard-target]');
      if (!target) return;
      event.preventDefault();
      openTarget(target.dataset.dashboardTarget);
    });
  }

  function openTarget(target) {
    if (!target) return;
    if (target.startsWith('tesoreria:')) {
      const key = target.split(':')[1];
      const button = document.querySelector(`[data-tesoreria-open="${key}"]`);
      if (button) return button.click();
      return activateFallback(key === 'cuotas' ? 'tesoreria-cuotas-view' : `tesoreria-${key}-view`);
    }

    if (target.startsWith('actas:')) {
      const key = target.split(':')[1];
      const button = document.querySelector(`[data-actas-open="${key}"]`);
      if (button) return button.click();
      return activateFallback(key === 'crear' ? 'crear-acta-view' : 'registro-actas-view');
    }

    const button = document.querySelector(`[data-admin-view="${target}"]`);
    if (button && !button.classList.contains('is-hidden')) return button.click();
    activateFallback(target);
  }

  function activateFallback(viewId) {
    const view = document.getElementById(viewId);
    if (!view) return;
    document.querySelectorAll('.admin-view').forEach((item) => item.classList.toggle('is-active', item.id === viewId));
    document.querySelector('#admin-view-title')?.replaceChildren(document.createTextNode(view.dataset.viewTitle || 'Panel administrativo'));
    document.querySelector('#admin-view-description')?.replaceChildren(document.createTextNode(view.dataset.viewDescription || ''));
    if (String(viewId).startsWith('members-')) window.dispatchEvent(new CustomEvent('nothofagus:members-view', { detail: { viewId } }));
  }

  function readActas() {
    try {
      const parsed = JSON.parse(localStorage.getItem(ACTAS_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function loadStyles() {
    if (document.querySelector('link[data-dashboard-admin-overview]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'dashboard-admin-overview.css?v=20260709';
    link.dataset.dashboardAdminOverview = 'true';
    document.head.appendChild(link);
  }

  function escapeHTML(value) {
    return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  }

  function escapeAttr(value) {
    return escapeHTML(value);
  }
})();
