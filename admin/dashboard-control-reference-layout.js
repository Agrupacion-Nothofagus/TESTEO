import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_TABLE_PUBLICACIONES, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusDashboardReferenceLayout) return;
  window.__nothofagusDashboardReferenceLayout = true;

  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  const currentYear = new Date().getFullYear();
  const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  loadStyles();
  mountWhenReady();
  document.addEventListener('DOMContentLoaded', mountWhenReady);
  window.setTimeout(mountWhenReady, 450);
  window.setTimeout(refreshDashboard, 1200);
  window.addEventListener('nothofagus:cuotas-manual-status-calculated', refreshDashboard);
  window.addEventListener('storage', refreshDashboard);

  function mountWhenReady() {
    const panel = document.querySelector('#dashboard-view .dashboard-panel');
    if (!panel || panel.dataset.referenceDashboard === 'true') return;
    panel.dataset.referenceDashboard = 'true';
    panel.innerHTML = templateShell();
    bindDashboardActions(panel);
    refreshDashboard();
  }

  async function refreshDashboard() {
    const panel = document.querySelector('#dashboard-view .dashboard-panel[data-reference-dashboard="true"]');
    if (!panel || !client) return;

    setText('[data-dashboard-current-date]', formatLongDate(new Date()));
    const status = panel.querySelector('[data-dashboard-status]');
    setStatus(status, 'Actualizando panel de control...', true);

    try {
      const session = await client.auth.getSession();
      const token = session.data?.session?.access_token;
      if (!token) throw new Error('Sesión no disponible.');

      const [posts, membersData, usersData, treasuryData, cuotasData] = await Promise.all([
        loadPosts(),
        fetchJson('/api/miembros', token),
        fetchJson('/api/users', token, true),
        fetchJson('/api/tesoreria', token, true),
        fetchJson('/api/cuotas-miembros?anio=' + encodeURIComponent(currentYear), token, true)
      ]);

      const members = Array.isArray(membersData.solicitudes) ? membersData.solicitudes : [];
      const users = Array.isArray(usersData.users) ? usersData.users : [];
      const movements = Array.isArray(treasuryData.movimientos) ? treasuryData.movimientos : [];
      const cuotas = cuotasData || {};

      const model = buildModel({ posts, members, users, movements, cuotas });
      renderModel(model);
      setStatus(status, 'Panel actualizado.', true);
    } catch (error) {
      setStatus(status, error.message || 'No fue posible actualizar el panel.', false);
    }
  }

  async function loadPosts() {
    const response = await client.from(SUPABASE_TABLE_PUBLICACIONES).select('titulo, estado, categoria, fecha').order('fecha', { ascending: false });
    return response.error ? [] : (response.data || []);
  }

  async function fetchJson(url, token, optional = false) {
    const response = await fetch(url, { headers: { authorization: 'Bearer ' + token } });
    if (!response.ok) {
      if (optional) return {};
      throw new Error('No fue posible cargar información del panel.');
    }
    return response.json().catch(() => ({}));
  }

  function buildModel({ posts, members, users, movements, cuotas }) {
    const activeMembers = members.filter((item) => item.estado === 'miembro' && normalizeText(item.estado_socio || 'activo') === 'activo');
    const inactiveMembers = members.filter((item) => item.estado === 'miembro' && ['inactivo', 'suspendido'].includes(normalizeText(item.estado_socio)));
    const pendingMembers = members.filter((item) => item.estado === 'pendiente' || item.estado === 'contactado');
    const activePosts = posts.filter((item) => item.estado === 'publicado');
    const draftPosts = posts.filter((item) => item.estado !== 'publicado');

    const activeMovements = movements.filter((item) => getYear(item.fecha) === currentYear && !item.eliminado);
    const incomeManual = sumByType(activeMovements, 'ingreso');
    const expenseManual = sumByType(activeMovements, 'egreso');
    const cuotasSummary = cuotas.resumen || {};
    const cuotaIncome = Number(cuotasSummary.totalRecaudado || cuotasSummary.totalPagado || cuotasSummary.recaudado || 0);
    const cuotaPending = Number(cuotasSummary.saldoPendiente || 0);
    const totalIncome = incomeManual + cuotaIncome;
    const balance = totalIncome - expenseManual;
    const monthly = buildMonthlySeries(activeMovements, cuotas);

    return {
      posts,
      members,
      users,
      activeMembers,
      inactiveMembers,
      pendingMembers,
      activePosts,
      draftPosts,
      activeMovements,
      incomeManual,
      expenseManual,
      cuotaIncome,
      cuotaPending,
      totalIncome,
      balance,
      monthly,
      activity: buildActivity(posts, members, movements, cuotas),
      pendingApprovals: pendingMembers.slice(0, 4),
      updatedAt: new Date()
    };
  }

  function buildMonthlySeries(movements, cuotas) {
    const series = Array.from({ length: 12 }, (_, index) => ({ label: monthLabels[index], ingresos: 0, egresos: 0 }));
    movements.forEach((item) => {
      const index = getMonth(item.fecha);
      if (index < 0 || index > 11) return;
      if (String(item.tipo || '').toLowerCase() === 'egreso') series[index].egresos += Number(item.monto || 0);
      else series[index].ingresos += Number(item.monto || 0);
    });

    const payments = Array.isArray(cuotas.pagosHistoricos) && cuotas.pagosHistoricos.length
      ? cuotas.pagosHistoricos
      : Array.isArray(cuotas.miembros)
        ? cuotas.miembros.flatMap((member) => member.pagos || [])
        : [];

    payments.forEach((payment) => {
      if (Number(payment.anio || currentYear) !== currentYear || payment.tipoPago === 'anual') return;
      const index = Number(payment.mes || 0) - 1;
      if (index >= 0 && index < 12) series[index].ingresos += Number(payment.monto || 0);
    });

    return series;
  }

  function buildActivity(posts, members, movements, cuotas) {
    const activities = [];
    posts.slice(0, 3).forEach((post) => activities.push({ icon: '📄', title: post.estado === 'publicado' ? 'Publicación activa' : 'Borrador de publicación', text: post.titulo || 'Sin título', date: post.fecha || '' }));
    members.filter((item) => item.estado === 'pendiente' || item.estado === 'contactado').slice(0, 3).forEach((item) => activities.push({ icon: '👥', title: 'Solicitud de ingreso', text: item.nombre || 'Solicitud sin nombre', date: item.created_at || item.fecha_ingreso || '' }));
    movements.filter((item) => !item.eliminado).slice(0, 3).forEach((item) => activities.push({ icon: item.tipo === 'egreso' ? '📤' : '💳', title: item.tipo === 'egreso' ? 'Egreso registrado' : 'Ingreso registrado', text: item.descripcion || 'Movimiento', amount: item.tipo === 'egreso' ? -Number(item.monto || 0) : Number(item.monto || 0), date: item.fecha || item.creadoEn || '' }));

    const payments = Array.isArray(cuotas.pagosHistoricos) ? cuotas.pagosHistoricos : [];
    payments.slice(0, 3).forEach((payment) => activities.push({ icon: '✅', title: payment.tipoPago === 'anual' ? 'Cuota anual registrada' : 'Cuota mensual registrada', text: payment.miembroNombre || payment.nombre || 'Integrante', amount: Number(payment.monto || 0), date: payment.fechaPago || '' }));

    return activities.sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 5);
  }

  function renderModel(model) {
    setText('[data-dashboard-total="miembros"]', model.activeMembers.length);
    setText('[data-dashboard-total="pendientes"]', model.pendingMembers.length);
    setText('[data-dashboard-total="publicaciones"]', model.activePosts.length);
    setText('[data-dashboard-total="publicadas"]', model.activePosts.length);
    setText('[data-dashboard-total="borradores"]', model.draftPosts.length);
    setText('[data-dashboard-total="tesoreria-ingresos"]', money(model.totalIncome));
    setText('[data-dashboard-total="tesoreria-egresos"]', money(model.expenseManual));
    setText('[data-dashboard-total="tesoreria-saldo"]', money(model.balance));
    setText('[data-dashboard-total="usuarios"]', model.users.length || '—');
    setText('[data-dashboard-pending-note]', `${model.pendingMembers.filter((item) => item.estado === 'pendiente').length} pendientes · ${model.pendingMembers.filter((item) => item.estado === 'contactado').length} contactadas`);
    setText('[data-dashboard-balance-note]', `Cuotas pendientes: ${money(model.cuotaPending)}`);
    setText('[data-dashboard-post-note]', `${model.draftPosts.length} borradores/archivo`);
    renderFinanceChart(model);
    renderMembershipStatus(model);
    renderRecentActivity(model.activity);
    renderPendingApprovals(model.pendingApprovals);
    renderMilestones();
    renderTreasurySummary(model);
    setText('[data-dashboard-last-update]', formatDateTime(model.updatedAt));
  }

  function renderFinanceChart(model) {
    const box = document.querySelector('[data-dashboard-finance-chart]');
    if (!box) return;
    const max = Math.max(...model.monthly.flatMap((item) => [item.ingresos, item.egresos]), 1);
    const width = 620;
    const height = 190;
    const pointsIncome = model.monthly.map((item, index) => point(index, item.ingresos, max, width, height));
    const pointsExpense = model.monthly.map((item, index) => point(index, item.egresos, max, width, height));
    box.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Resumen financiero ${currentYear}">
        ${[0, 1, 2, 3].map((level) => `<line x1="0" x2="${width}" y1="${35 + level * 38}" y2="${35 + level * 38}" />`).join('')}
        <polyline class="income" points="${pointsIncome.map((item) => `${item.x},${item.y}`).join(' ')}" />
        <polyline class="expense" points="${pointsExpense.map((item) => `${item.x},${item.y}`).join(' ')}" />
        ${pointsIncome.map((item) => `<circle class="income" cx="${item.x}" cy="${item.y}" r="4" />`).join('')}
        ${pointsExpense.map((item) => `<circle class="expense" cx="${item.x}" cy="${item.y}" r="4" />`).join('')}
      </svg>
      <div class="dashboard-reference-chart-months">${model.monthly.map((item) => `<span>${item.label}</span>`).join('')}</div>
      <aside class="dashboard-reference-finance-totals">
        <span>Total ingresos</span><strong class="positive">${money(model.totalIncome)}</strong>
        <span>Total egresos</span><strong class="negative">${money(model.expenseManual)}</strong>
        <span>Saldo disponible</span><strong>${money(model.balance)}</strong>
      </aside>
    `;
  }

  function point(index, value, max, width, height) {
    const x = 20 + index * ((width - 40) / 11);
    const y = height - 24 - (Number(value || 0) / max) * (height - 54);
    return { x: Math.round(x), y: Math.round(y) };
  }

  function renderMembershipStatus(model) {
    const box = document.querySelector('[data-dashboard-membership-status]');
    if (!box) return;
    const active = model.activeMembers.length;
    const pending = model.pendingMembers.length;
    const inactive = model.inactiveMembers.length;
    const total = Math.max(active + pending + inactive, 1);
    box.innerHTML = `
      <div class="dashboard-reference-statusbar" style="--active:${(active / total) * 100}%;--pending:${(pending / total) * 100}%;--inactive:${(inactive / total) * 100}%"></div>
      <div class="dashboard-reference-status-grid">
        ${statusItem('Activos', active, total, 'active')}
        ${statusItem('Pendientes', pending, total, 'pending')}
        ${statusItem('Inactivos', inactive, total, 'inactive')}
      </div>
      <footer><span>Total de miembros</span><strong>${active + inactive}</strong></footer>
    `;
  }

  function statusItem(label, value, total, tone) {
    return `<article><span class="dot ${tone}"></span><strong>${value}</strong><small>${Math.round((value / Math.max(total, 1)) * 100)}%</small><p>${label}</p></article>`;
  }

  function renderRecentActivity(items) {
    const box = document.querySelector('[data-dashboard-recent-activity]');
    if (!box) return;
    box.innerHTML = items.length ? items.map((item) => `
      <article class="dashboard-reference-row">
        <span class="dashboard-reference-icon">${esc(item.icon)}</span>
        <div><strong>${esc(item.title)}</strong><small>${esc(item.text)}</small></div>
        ${Number.isFinite(item.amount) && item.amount !== 0 ? `<em class="${item.amount < 0 ? 'negative' : 'positive'}">${item.amount < 0 ? '-' : '+'}${money(Math.abs(item.amount))}</em>` : `<time>${relativeDate(item.date)}</time>`}
      </article>
    `).join('') : '<p class="dashboard-empty">Sin actividad reciente.</p>';
  }

  function renderPendingApprovals(items) {
    const box = document.querySelector('[data-dashboard-pending-approvals]');
    if (!box) return;
    box.innerHTML = items.length ? items.map((item) => `
      <article class="dashboard-reference-approval-row">
        <span>${initials(item.nombre)}</span>
        <div><strong>${esc(item.nombre || 'Solicitud')}</strong><small>${esc(item.categoria_socio || 'Solicitud de ingreso')}</small></div>
        <time>${formatShortDate(item.created_at || item.fecha_ingreso || '')}</time>
        <button type="button" data-dashboard-open-view="members-pending-view">Revisar</button>
      </article>
    `).join('') : '<p class="dashboard-empty">No hay aprobaciones pendientes.</p>';
  }

  function renderMilestones() {
    const box = document.querySelector('[data-dashboard-milestones]');
    if (!box) return;
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 5);
    const annual = new Date(now.getFullYear(), 11, 31);
    const report = new Date(now.getFullYear(), now.getMonth(), Math.min(28, now.getDate() + 10));
    box.innerHTML = [
      { date: report, title: 'Revisión financiera', text: 'Ingresos, egresos y cuotas' },
      { date: nextMonth, title: 'Seguimiento de socios', text: 'Solicitudes y membresías' },
      { date: annual, title: 'Cierre cuota anual', text: 'Control de pagos del período' }
    ].map((item) => `
      <article class="dashboard-reference-milestone"><time><strong>${String(item.date.getDate()).padStart(2, '0')}</strong><span>${item.date.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')}</span></time><div><strong>${esc(item.title)}</strong><small>${esc(item.text)}</small></div></article>
    `).join('');
  }

  function renderTreasurySummary(model) {
    const box = document.querySelector('[data-dashboard-treasury-summary]');
    if (!box) return;
    box.innerHTML = `
      <div class="dashboard-treasury-grid">
        <article><span>Ingresos generales</span><strong>${money(model.incomeManual)}</strong></article>
        <article><span>Cuotas recaudadas</span><strong>${money(model.cuotaIncome)}</strong></article>
        <article><span>Total ingresos</span><strong>${money(model.totalIncome)}</strong></article>
        <article><span>Total egresos</span><strong>${money(model.expenseManual)}</strong></article>
        <article><span>Saldo disponible</span><strong>${money(model.balance)}</strong></article>
        <article><span>Cuotas pendientes</span><strong>${money(model.cuotaPending)}</strong></article>
      </div>
      <p class="dashboard-treasury-note">Datos enlazados con Tesorería General y matriz de cuotas de ${currentYear}.</p>
    `;
  }

  function bindDashboardActions(scope) {
    scope.addEventListener('click', (event) => {
      if (event.target.closest?.('[data-dashboard-refresh]')) return refreshDashboard();
      const target = event.target.closest?.('[data-dashboard-open-view]');
      if (!target) return;
      const view = target.dataset.dashboardOpenView;
      const direct = document.querySelector('[data-admin-view="' + view + '"]');
      if (direct) return direct.click();
      if (view === 'tesoreria-general-view') return document.querySelector('[data-tesoreria-open="general"]')?.click();
      if (view === 'tesoreria-cuotas-view') return document.querySelector('[data-tesoreria-open="cuotas"]')?.click();
      if (view === 'members-pending-view') return document.querySelector('[data-members-open="pending"]')?.click() || document.querySelector('[data-admin-view="members-pending-view"]')?.click();
      if (view === 'registro-actas-view') return document.querySelector('[data-actas-open="registro"]')?.click() || document.querySelector('[data-admin-view="registro-actas-view"]')?.click();
    });
  }

  function templateShell() {
    return `
      <section class="dashboard-reference" aria-label="Panel de control">
        <header class="dashboard-reference-welcome"><div><h3>¡Bienvenido de vuelta, Admin! 👋</h3><p>Aquí tienes lo más importante de Nothofagus hoy.</p></div><button type="button" class="dashboard-reference-date"><span>📅</span><strong data-dashboard-current-date>—</strong></button></header>
        <div class="dashboard-reference-kpis" aria-label="Indicadores principales">${kpiCard('👥', 'Miembros activos', 'miembros', 'Socios/as activos registrados')}${kpiCard('🧡', 'Solicitudes pendientes', 'pendientes', '', 'data-dashboard-pending-note')}${kpiCard('💳', 'Balance disponible', 'tesoreria-saldo', '', 'data-dashboard-balance-note')}${kpiCard('📄', 'Publicaciones activas', 'publicaciones', '', 'data-dashboard-post-note')}</div>
        <section class="dashboard-reference-grid">
          <article class="dashboard-reference-card dashboard-reference-finance"><div class="dashboard-reference-card-head"><h4>Resumen financiero ${currentYear}</h4><span><i></i>Ingresos</span><span class="expense"><i></i>Egresos</span></div><div data-dashboard-finance-chart></div></article>
          <article class="dashboard-reference-card"><div class="dashboard-reference-card-head"><h4>Estado de membresías</h4></div><div data-dashboard-membership-status></div></article>
          <article class="dashboard-reference-card"><div class="dashboard-reference-card-head"><h4>Actividad reciente</h4></div><div class="dashboard-reference-list" data-dashboard-recent-activity></div><button type="button" class="dashboard-reference-more" data-dashboard-open-view="tesoreria-general-view">Ver toda la actividad →</button></article>
          <article class="dashboard-reference-card"><div class="dashboard-reference-card-head"><h4>Aprobaciones pendientes</h4></div><div class="dashboard-reference-list" data-dashboard-pending-approvals></div><button type="button" class="dashboard-reference-more" data-dashboard-open-view="members-pending-view">Ver todas las pendientes →</button></article>
          <article class="dashboard-reference-card dashboard-reference-milestones-card"><div class="dashboard-reference-card-head"><h4>Próximos hitos</h4></div><div class="dashboard-reference-milestones" data-dashboard-milestones></div></article>
          <article class="dashboard-reference-card dashboard-reference-actions-card"><div class="dashboard-reference-card-head"><h4>Acciones rápidas</h4></div><div class="dashboard-reference-actions"><button type="button" data-dashboard-open-view="nueva-view"><span>📝</span><strong>Nueva publicación</strong></button><button type="button" data-dashboard-open-view="tesoreria-general-view"><span>💳</span><strong>Registrar pago</strong></button><button type="button" data-dashboard-open-view="members-pending-view"><span>👥</span><strong>Nuevo miembro</strong></button><button type="button" data-dashboard-open-view="registro-actas-view"><span>📋</span><strong>Crear acta</strong></button></div></article>
          <article class="dashboard-reference-card dashboard-reference-status-card"><span>🛡️</span><div><strong>Estado del sistema</strong><small>Todos los módulos administrativos cargados correctamente.</small></div><i></i></article><article class="dashboard-reference-card dashboard-reference-status-card"><span>🕒</span><div><strong>Última actualización</strong><small data-dashboard-last-update>—</small></div><button type="button" data-dashboard-refresh>↻</button></article>
        </section>
        <article class="dashboard-widget dashboard-treasury-widget is-hidden" aria-hidden="true"><div data-dashboard-treasury-summary></div></article><div class="dashboard-list is-hidden" data-dashboard-latest-posts></div><div class="dashboard-member-summary is-hidden" data-dashboard-member-summary></div><p class="admin-status dashboard-status" data-dashboard-status>Preparando panel de control...</p>
      </section>`;
  }

  function kpiCard(icon, label, metric, note = '', noteAttr = '') {
    const noteMarkup = noteAttr ? `<small ${noteAttr}>${esc(note || '—')}</small>` : `<small>${esc(note)}</small>`;
    return `<article class="dashboard-reference-kpi"><span>${icon}</span><div><p>${esc(label)}</p><strong data-dashboard-total="${esc(metric)}">—</strong>${noteMarkup}</div></article>`;
  }

  function loadStyles() {
    const href = 'dashboard-control-reference-layout.css?v=20260710-panel-ref';
    const existing = document.querySelector('link[data-dashboard-reference-layout]');
    if (existing) { existing.href = href; return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.dashboardReferenceLayout = 'true';
    document.head.appendChild(link);
  }

  function setText(selector, value) { document.querySelectorAll(selector).forEach((element) => { element.textContent = String(value ?? '—'); }); }
  function setStatus(element, message, ok) { if (!element) return; element.textContent = message; element.classList.toggle('success', Boolean(ok)); element.classList.toggle('error', !ok); }
  function sumByType(items, type) { return items.filter((item) => String(item.tipo || '').toLowerCase() === type).reduce((sum, item) => sum + Number(item.monto || 0), 0); }
  function getYear(value) { return Number(String(value || '').slice(0, 4)) || 0; }
  function getMonth(value) { return Number(String(value || '').slice(5, 7)) - 1; }
  function normalizeText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
  function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
  function formatLongDate(value) { return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }).format(value); }
  function formatShortDate(value) { return value ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(String(value).slice(0, 10) + 'T12:00:00')) : 'Sin fecha'; }
  function formatDateTime(value) { return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value); }
  function relativeDate(value) { return value ? formatShortDate(value) : 'Reciente'; }
  function initials(value) { return String(value || 'NA').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'NA'; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }
})();
