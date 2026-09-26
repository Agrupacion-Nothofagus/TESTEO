import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_TABLE_PUBLICACIONES, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusDashboardReferenceLayout) return;
  window.__nothofagusDashboardReferenceLayout = true;

  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  const currentYear = new Date().getFullYear();
  const monthLabels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const refreshEvents = [
    'nothofagus:cuotas-manual-status-calculated',
    'nothofagus:cuotas-payment-changed',
    'nothofagus:tesoreria-updated',
    'nothofagus:user-created',
    'nothofagus:actas-updated'
  ];
  let refreshTimer = null;
  let refreshInFlight = false;
  let refreshQueued = false;

  loadStyles();
  mountWhenReady();
  document.addEventListener('DOMContentLoaded', mountWhenReady);
  window.setTimeout(mountWhenReady, 450);
  window.setTimeout(() => queueRefresh(0), 1200);
  refreshEvents.forEach((eventName) => window.addEventListener(eventName, () => queueRefresh(180)));
  window.addEventListener('storage', () => queueRefresh(180));
  window.addEventListener('nothofagus:admin-view', (event) => {
    if (event.detail?.viewId === 'dashboard-view') queueRefresh(80);
  });

  function mountWhenReady() {
    const panel = document.querySelector('#dashboard-view .dashboard-panel');
    if (!panel || panel.dataset.referenceDashboard === 'true') return;
    panel.dataset.referenceDashboard = 'true';
    panel.innerHTML = templateShell();
    bindDashboardActions(panel);
    queueRefresh(0);
  }

  function queueRefresh(delay = 0) {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refreshDashboard, delay);
  }

  async function refreshDashboard() {
    const panel = document.querySelector('#dashboard-view .dashboard-panel[data-reference-dashboard="true"]');
    if (!panel || !client) return;
    if (refreshInFlight) {
      refreshQueued = true;
      return;
    }

    refreshInFlight = true;
    panel.setAttribute('aria-busy', 'true');
    setText('[data-dashboard-current-date]', formatLongDate(new Date()));
    const status = panel.querySelector('[data-dashboard-status]');
    const refreshButton = panel.querySelector('[data-dashboard-refresh]');
    if (refreshButton) refreshButton.disabled = true;
    setStatus(status, 'Actualizando panel de control...', true);

    try {
      const session = await client.auth.getSession();
      const token = session.data?.session?.access_token;
      if (!token) throw new Error('Sesión no disponible.');

      const sources = await loadDashboardSources(token);
      const model = buildModel({
        user: session.data?.session?.user || null,
        posts: sources.posts.data,
        members: sources.members.data.solicitudes,
        users: sources.users.data.users,
        movements: sources.treasury.data.movimientos,
        cuotas: sources.cuotas.data,
        actas: sources.actas.data.actas,
        sourceStatus: sources
      });
      renderModel(model);
      const failures = Object.values(sources).filter((source) => !source.available);
      const rosterMismatch = sources.members.available && sources.cuotas.available && model.activeMembers.length !== model.quotaAccounts;
      setStatus(
        status,
        failures.length ? `Panel actualizado con ${failures.length} ${failures.length === 1 ? 'fuente pendiente' : 'fuentes pendientes'}.` : rosterMismatch ? 'Panel actualizado. Revisa la diferencia entre nóminas.' : 'Panel actualizado y conciliado.',
        failures.length === 0
      );
    } catch (error) {
      setStatus(status, error.message || 'No fue posible actualizar el panel.', false);
    } finally {
      refreshInFlight = false;
      panel.removeAttribute('aria-busy');
      if (refreshButton?.isConnected) refreshButton.disabled = false;
      if (refreshQueued) {
        refreshQueued = false;
        queueRefresh(120);
      }
    }
  }

  async function loadDashboardSources(token) {
    const definitions = [
      ['posts', loadPosts, []],
      ['members', () => fetchJson('/api/miembros', token), { solicitudes: [] }],
      ['users', () => fetchJson('/api/users', token), { users: [] }],
      ['treasury', () => fetchJson('/api/tesoreria?include_files=0', token), { movimientos: [] }],
      ['cuotas', () => fetchJson(`/api/cuotas-miembros?anio=${encodeURIComponent(currentYear)}&include_files=0&sync=0`, token), { miembros: [], resumen: {} }],
      ['actas', () => fetchJson('/api/actas', token), { actas: [] }]
    ];
    const results = await Promise.allSettled(definitions.map(([, loader]) => loader()));
    const sources = {};

    results.forEach((result, index) => {
      const [key, , fallback] = definitions[index];
      sources[key] = result.status === 'fulfilled'
        ? { available: true, data: result.value || fallback, error: '' }
        : { available: false, data: fallback, error: result.reason?.message || 'No disponible' };
    });

    if (!Object.values(sources).some((source) => source.available)) {
      throw new Error('No fue posible consultar las fuentes del panel.');
    }
    return sources;
  }

  async function loadPosts() {
    const response = await client.from(SUPABASE_TABLE_PUBLICACIONES).select('titulo, estado, categoria, fecha').order('fecha', { ascending: false });
    if (response.error) throw new Error('No fue posible cargar publicaciones.');
    return response.data || [];
  }

  async function fetchJson(url, token) {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { authorization: 'Bearer ' + token, 'cache-control': 'no-cache', pragma: 'no-cache' }
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'No fue posible cargar información del panel.');
    }
    return response.json().catch(() => ({}));
  }

  function buildModel({ user, posts, members, users, movements, cuotas, actas, sourceStatus }) {
    const registeredMembers = members.filter((item) => normalizeText(item.estado) === 'miembro');
    const inactiveMembers = registeredMembers.filter((item) => ['inactivo', 'suspendido'].includes(normalizeText(item.estado_socio)));
    const inactiveIds = new Set(inactiveMembers.map((item) => String(item.id || '')));
    const activeMembers = registeredMembers.filter((item) => !inactiveIds.has(String(item.id || '')));
    const pendingMembers = members
      .filter((item) => ['pendiente', 'contactado'].includes(normalizeText(item.estado)))
      .sort((a, b) => activityTimestamp(b.created_at || b.fecha_ingreso) - activityTimestamp(a.created_at || a.fecha_ingreso));
    const activePosts = posts.filter((item) => normalizeText(item.estado) === 'publicado');
    const draftPosts = posts.filter((item) => normalizeText(item.estado) !== 'publicado');
    const approvedMinutes = actas.filter((item) => normalizeText(item.estado) === 'aprobada');
    const finishedMinutes = actas.filter((item) => normalizeText(item.estado) === 'finalizada');
    const draftMinutes = actas.filter((item) => normalizeText(item.estado) === 'borrador');

    const activeMovements = movements.filter((item) => getYear(item.fecha) === currentYear && !item.eliminado);
    const incomeManual = sumByType(activeMovements, 'ingreso');
    const expenseManual = sumByType(activeMovements, 'egreso');
    const cuotasSummary = cuotas.resumen || {};
    const quotaPayments = getQuotaPayments(cuotas);
    const cuotaIncome = quotaPayments.reduce((sum, payment) => sum + Number(payment.monto || 0), 0);
    const cuotaPending = Number(cuotasSummary.saldoPendiente || 0);
    const quotaAccounts = Number(cuotasSummary.totalMiembros ?? (cuotas.miembros || []).filter((member) => normalizeText(member.estadoCuenta || member.estado_cuenta) !== 'inactivo').length);
    const totalIncome = incomeManual + cuotaIncome;
    const balance = totalIncome - expenseManual;
    const monthly = buildMonthlySeries(activeMovements, quotaPayments);
    const roleCounts = users.reduce((acc, item) => {
      const role = normalizeText(item.rol || 'sin rol').replaceAll(' ', '_');
      acc[role] = (acc[role] || 0) + 1;
      return acc;
    }, {});

    return {
      user,
      posts,
      members,
      users,
      actas,
      registeredMembers,
      activeMembers,
      inactiveMembers,
      pendingMembers,
      activePosts,
      draftPosts,
      approvedMinutes,
      finishedMinutes,
      draftMinutes,
      activeMovements,
      quotaPayments,
      incomeManual,
      expenseManual,
      cuotaIncome,
      cuotaPending,
      quotaAccounts,
      totalIncome,
      balance,
      monthly,
      roleCounts,
      sourceStatus,
      activity: buildActivity(posts, members, activeMovements, quotaPayments, actas, users),
      pendingApprovals: pendingMembers.slice(0, 4),
      updatedAt: new Date()
    };
  }

  function getQuotaPayments(cuotas) {
    const historic = Array.isArray(cuotas.pagosHistoricos) ? cuotas.pagosHistoricos : [];
    const nested = Array.isArray(cuotas.miembros)
      ? cuotas.miembros.flatMap((member) => (member.pagos || []).map((payment) => ({
        ...payment,
        miembroNombre: payment.miembroNombre || member.nombre || '',
        memberId: payment.memberId || payment.member_id || member.id || ''
      })))
      : [];
    const source = historic.length ? historic : nested;
    const unique = new Map();

    source.forEach((payment) => {
      const key = String(payment.id || [payment.memberId || payment.member_id, payment.anio, payment.mes, payment.monto, payment.fechaPago || payment.fecha_pago].join(':'));
      if (Number(payment.anio || currentYear) === currentYear && Number(payment.monto || 0) > 0 && !unique.has(key)) unique.set(key, payment);
    });
    return Array.from(unique.values());
  }

  function buildMonthlySeries(movements, payments) {
    const series = Array.from({ length: 12 }, (_, index) => ({ label: monthLabels[index], ingresos: 0, egresos: 0 }));
    movements.forEach((item) => {
      const index = getMonth(item.fecha);
      if (index < 0 || index > 11) return;
      if (String(item.tipo || '').toLowerCase() === 'egreso') series[index].egresos += Number(item.monto || 0);
      else series[index].ingresos += Number(item.monto || 0);
    });

    payments.forEach((payment) => {
      const paymentDate = payment.fechaPago || payment.fecha_pago || '';
      const index = getYear(paymentDate) === currentYear && getMonth(paymentDate) >= 0 ? getMonth(paymentDate) : Number(payment.mes || 0) - 1;
      if (index >= 0 && index < 12) series[index].ingresos += Number(payment.monto || 0);
    });

    return series;
  }

  function buildActivity(posts, members, movements, payments, actas, users) {
    const activities = [];
    posts.slice(0, 4).forEach((post) => activities.push({ icon: '📄', title: normalizeText(post.estado) === 'publicado' ? 'Publicación activa' : 'Publicación en edición', text: post.titulo || 'Sin título', date: post.fecha || '', module: 'Publicaciones' }));
    members.filter((item) => ['pendiente', 'contactado'].includes(normalizeText(item.estado))).slice(0, 4).forEach((item) => activities.push({ icon: '🤝', title: 'Respuesta de Súmate', text: item.nombre || 'Solicitud sin nombre', date: item.created_at || item.fecha_ingreso || '', module: 'Miembros' }));
    movements.slice(0, 5).forEach((item) => activities.push({ icon: item.tipo === 'egreso' ? '↘' : '↗', title: item.tipo === 'egreso' ? 'Egreso registrado' : 'Ingreso registrado', text: item.descripcion || 'Movimiento', amount: item.tipo === 'egreso' ? -Number(item.monto || 0) : Number(item.monto || 0), date: item.fecha || item.creadoEn || '', module: 'Tesorería' }));
    payments.slice(0, 5).forEach((payment) => activities.push({ icon: '✓', title: normalizeText(payment.tipoPago || payment.tipo_pago) === 'anual' ? 'Cuota anual registrada' : 'Cuota mensual registrada', text: payment.miembroNombre || payment.nombre || 'Integrante', amount: Number(payment.monto || 0), date: payment.fechaPago || payment.fecha_pago || '', module: 'Cuotas' }));
    actas.slice(0, 4).forEach((acta) => activities.push({ icon: '🗒️', title: `Acta ${labelMinuteStatus(acta.estado)}`, text: acta.titulo || 'Acta sin título', date: acta.actualizadoEn || acta.fecha || acta.creadoEn || '', module: 'Actas' }));
    users.slice(0, 3).forEach((item) => activities.push({ icon: '👤', title: 'Usuario interno', text: item.nombre || item.email || 'Usuario', date: item.created_at || '', module: 'Usuarios' }));

    return activities.sort((a, b) => activityTimestamp(b.date) - activityTimestamp(a.date)).slice(0, 6);
  }

  function renderModel(model) {
    const source = model.sourceStatus;
    setText('[data-dashboard-user-name]', getDisplayName(model.user));
    setText('[data-dashboard-user-role]', labelRole(getUserRole(model.user)));
    setText('[data-dashboard-total="miembros"]', source.members.available ? model.activeMembers.length : '—');
    setText('[data-dashboard-total="pendientes"]', source.members.available ? model.pendingMembers.length : '—');
    setText('[data-dashboard-total="publicaciones"]', source.posts.available ? model.activePosts.length : '—');
    setText('[data-dashboard-total="publicadas"]', source.posts.available ? model.activePosts.length : '—');
    setText('[data-dashboard-total="borradores"]', source.posts.available ? model.draftPosts.length : '—');
    setText('[data-dashboard-total="actas"]', source.actas.available ? model.actas.length : '—');
    setText('[data-dashboard-total="tesoreria-ingresos"]', source.treasury.available && source.cuotas.available ? money(model.totalIncome) : '—');
    setText('[data-dashboard-total="tesoreria-egresos"]', source.treasury.available ? money(model.expenseManual) : '—');
    setText('[data-dashboard-total="tesoreria-saldo"]', source.treasury.available && source.cuotas.available ? money(model.balance) : '—');
    setText('[data-dashboard-total="usuarios"]', source.users.available ? model.users.length : '—');
    setText('[data-dashboard-pending-note]', source.members.available ? `${model.pendingMembers.length} respuestas del formulario por revisar` : 'Fuente no disponible');
    setText('[data-dashboard-balance-note]', source.cuotas.available ? `Cuotas pendientes: ${money(model.cuotaPending)}` : 'Cuotas no disponibles');
    setText('[data-dashboard-post-note]', source.posts.available ? `${model.draftPosts.length} en borrador o archivo` : 'Fuente no disponible');
    setText('[data-dashboard-actas-note]', source.actas.available ? `${model.approvedMinutes.length} aprobadas · ${model.draftMinutes.length} borradores` : 'Fuente no disponible');
    setText('[data-dashboard-users-note]', source.users.available ? `${adminUserCount(model)} administradores` : 'Fuente no disponible');
    renderFinanceChart(model);
    renderMembershipStatus(model);
    renderRecentActivity(model.activity);
    renderPendingApprovals(model.pendingApprovals);
    renderAdminOverview(model);
    renderTreasurySummary(model);
    renderSystemStatus(model);
    setText('[data-dashboard-last-update]', formatDateTime(model.updatedAt));
  }

  function renderFinanceChart(model) {
    const box = document.querySelector('[data-dashboard-finance-chart]');
    if (!box) return;
    if (!model.sourceStatus.treasury.available || !model.sourceStatus.cuotas.available) {
      box.innerHTML = '<div class="dashboard-reference-unavailable"><strong>Resumen financiero incompleto</strong><span>Actualiza el panel cuando Tesorería y Cuotas estén disponibles.</span></div>';
      return;
    }
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
        <span>Ingresos generales</span><strong class="positive">${money(model.incomeManual)}</strong>
        <span>Cuotas reales</span><strong class="positive">${money(model.cuotaIncome)}</strong>
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
    if (!model.sourceStatus.members.available) {
      box.innerHTML = '<div class="dashboard-reference-unavailable"><strong>Membresía no disponible</strong><span>No se pudieron consultar los registros de miembros.</span></div>';
      return;
    }
    const active = model.activeMembers.length;
    const pending = model.pendingMembers.length;
    const inactive = model.inactiveMembers.length;
    const totalMembers = active + inactive;
    const percentageBase = Math.max(totalMembers, 1);
    box.innerHTML = `
      <div class="dashboard-reference-statusbar" style="--active:${(active / percentageBase) * 100}%;--inactive:${(inactive / percentageBase) * 100}%"></div>
      <div class="dashboard-reference-status-grid">
        ${statusItem('Activos', active, percentageBase, 'active')}
        ${statusItem('Inactivos / suspendidos', inactive, percentageBase, 'inactive')}
        ${statusItem('Respuestas Súmate', pending, null, 'pending')}
      </div>
      <footer><span>Total de miembros registrados</span><strong>${totalMembers}</strong></footer>
    `;
  }

  function statusItem(label, value, total, tone) {
    const detail = total ? `${Math.round((value / Math.max(total, 1)) * 100)}% de la nómina` : 'Pendientes de gestión';
    return `<article><span class="dot ${tone}"></span><strong>${value}</strong><small>${detail}</small><p>${label}</p></article>`;
  }

  function renderRecentActivity(items) {
    const box = document.querySelector('[data-dashboard-recent-activity]');
    if (!box) return;
    box.innerHTML = items.length ? items.map((item) => `
      <article class="dashboard-reference-row">
        <span class="dashboard-reference-icon">${esc(item.icon)}</span>
        <div><strong>${esc(item.title)}</strong><small>${esc(item.text)}</small><b>${esc(item.module || '')} · ${relativeDate(item.date)}</b></div>
        ${Number.isFinite(item.amount) && item.amount !== 0 ? `<em class="${item.amount < 0 ? 'negative' : 'positive'}">${item.amount < 0 ? '-' : '+'}${money(Math.abs(item.amount))}</em>` : ''}
      </article>
    `).join('') : '<p class="dashboard-empty">Sin actividad reciente.</p>';
  }

  function renderPendingApprovals(items) {
    const box = document.querySelector('[data-dashboard-pending-approvals]');
    if (!box) return;
    box.innerHTML = items.length ? items.map((item) => `
      <article class="dashboard-reference-approval-row">
        <span>${initials(item.nombre)}</span>
        <div><strong>${esc(item.nombre || 'Solicitud')}</strong><small>${normalizeText(item.estado) === 'contactado' ? 'En seguimiento' : 'Sin revisar'} · ${esc(item.categoria_socio || 'Formulario Súmate')}</small></div>
        <time>${formatShortDate(item.created_at || item.fecha_ingreso || '')}</time>
        <button type="button" data-dashboard-open-view="members-contacted-view">Ver pendientes</button>
      </article>
    `).join('') : '<p class="dashboard-empty">No hay solicitudes por revisar.</p>';
  }

  function renderAdminOverview(model) {
    const box = document.querySelector('#dashboard-view .dashboard-reference [data-dashboard-admin-overview]');
    if (!box) return;
    const sources = model.sourceStatus;
    const rows = [
      { icon: '🤝', label: 'Nómina de miembros', value: sources.members.available ? model.activeMembers.length : '—', detail: sources.members.available ? `${model.pendingMembers.length} respuestas pendientes` : 'No disponible', view: 'members-list-view' },
      { icon: '💰', label: 'Tesorería', value: sources.treasury.available && sources.cuotas.available ? money(model.balance) : '—', detail: `${model.activeMovements.length} movimientos · ${model.quotaPayments.length} pagos`, view: 'tesoreria-general-view' },
      { icon: '🧾', label: 'Cuentas de cuotas', value: sources.cuotas.available ? model.quotaAccounts : '—', detail: sources.cuotas.available ? `${money(model.cuotaIncome)} recaudados · ${money(model.cuotaPending)} pendientes` : 'No disponible', view: 'tesoreria-cuotas-view' },
      { icon: '🗒️', label: 'Actas', value: sources.actas.available ? model.actas.length : '—', detail: sources.actas.available ? `${model.approvedMinutes.length} aprobadas · ${model.finishedMinutes.length} finalizadas` : 'No disponible', view: 'registro-actas-view' },
      { icon: '📚', label: 'Publicaciones', value: sources.posts.available ? model.posts.length : '—', detail: sources.posts.available ? `${model.activePosts.length} publicadas · ${model.draftPosts.length} en edición` : 'No disponible', view: 'gestion-view' },
      { icon: '👤', label: 'Usuarios', value: sources.users.available ? model.users.length : '—', detail: sources.users.available ? `${adminUserCount(model)} administradores` : 'No disponible', view: 'usuarios-view' }
    ];
    box.innerHTML = rows.map((item) => `
      <button type="button" class="dashboard-reference-overview-row" data-dashboard-open-view="${esc(item.view)}">
        <span>${item.icon}</span><div><strong>${esc(item.label)}</strong><small>${esc(item.detail)}</small></div><em>${esc(item.value)}</em><i aria-hidden="true">›</i>
      </button>
    `).join('');
  }

  function renderSystemStatus(model) {
    const sources = Object.entries(model.sourceStatus);
    const available = sources.filter(([, value]) => value.available).length;
    const total = sources.length;
    const complete = available === total;
    const rosterMismatch = model.sourceStatus.members.available && model.sourceStatus.cuotas.available && model.activeMembers.length !== model.quotaAccounts;
    setText('[data-dashboard-system-title]', !complete ? 'Sincronización parcial' : rosterMismatch ? 'Nóminas por conciliar' : 'Información sincronizada');
    setText('[data-dashboard-system-detail]', !complete ? `${available} de ${total} fuentes disponibles. Usa actualizar para reintentar.` : rosterMismatch ? `${model.activeMembers.length} miembros activos · ${model.quotaAccounts} cuentas activas de cuotas.` : `${total} de ${total} fuentes administrativas disponibles.`);
    document.querySelectorAll('[data-dashboard-system-indicator]').forEach((element) => {
      element.classList.toggle('is-warning', !complete || rosterMismatch);
    });
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
      if (event.target.closest?.('[data-dashboard-refresh]')) return queueRefresh(0);
      const action = event.target.closest?.('[data-dashboard-action]')?.dataset.dashboardAction;
      if (action === 'register-payment') {
        document.querySelector('[data-tesoreria-open="cuotas"]')?.click();
        window.setTimeout(() => document.querySelector('#tesoreria-cuotas-view [data-cuotas-register-payment]')?.click(), 320);
        return;
      }
      if (action === 'add-member') {
        document.querySelector('[data-admin-view="members-list-view"]')?.click();
        window.setTimeout(() => document.querySelector('#members-list-view [data-open-member-quick-create]')?.click(), 180);
        return;
      }
      const target = event.target.closest?.('[data-dashboard-open-view]');
      if (!target) return;
      const view = target.dataset.dashboardOpenView;
      const direct = document.querySelector('[data-admin-view="' + view + '"]');
      if (direct) return direct.click();
      if (view === 'tesoreria-general-view') return document.querySelector('[data-tesoreria-open="general"]')?.click();
      if (view === 'tesoreria-cuotas-view') return document.querySelector('[data-tesoreria-open="cuotas"]')?.click();
      if (view === 'members-pending-view' || view === 'members-rejected-view') return document.querySelector('[data-admin-view="members-contacted-view"]')?.click();
      if (view === 'crear-acta-view') return document.querySelector('[data-actas-open="crear"]')?.click();
      if (view === 'registro-actas-view') return document.querySelector('[data-actas-open="registro"]')?.click() || document.querySelector('[data-admin-view="registro-actas-view"]')?.click();
    });
  }

  function templateShell() {
    return `
      <section class="dashboard-reference" aria-label="Panel de control">
        <header class="dashboard-reference-welcome"><div><span class="dashboard-reference-eyebrow">Resumen institucional</span><h3>¡Bienvenido/a, <span data-dashboard-user-name>Administrador/a</span>!</h3><p>Información de todos los módulos administrativos.</p></div><div class="dashboard-reference-context"><span data-dashboard-user-role>Administrador/a</span><time><b>📅</b><strong data-dashboard-current-date>—</strong></time></div></header>
        <div class="dashboard-reference-kpis" aria-label="Indicadores principales">${kpiCard('🤝', 'Miembros activos', 'miembros', 'Nómina con participación vigente', '', 'members-list-view')}${kpiCard('🧡', 'Pendientes', 'pendientes', '', 'data-dashboard-pending-note', 'members-contacted-view')}${kpiCard('💳', 'Balance disponible', 'tesoreria-saldo', '', 'data-dashboard-balance-note', 'tesoreria-general-view')}${kpiCard('📚', 'Publicaciones activas', 'publicaciones', '', 'data-dashboard-post-note', 'gestion-view')}${kpiCard('🗒️', 'Actas registradas', 'actas', '', 'data-dashboard-actas-note', 'registro-actas-view')}${kpiCard('👤', 'Usuarios internos', 'usuarios', '', 'data-dashboard-users-note', 'usuarios-view')}</div>
        <section class="dashboard-reference-columns">
          <div class="dashboard-reference-column">
            <article class="dashboard-reference-card dashboard-reference-finance"><div class="dashboard-reference-card-head"><div><span>TESORERÍA</span><h4>Flujo financiero ${currentYear}</h4></div><aside><span><i></i>Ingresos</span><span class="expense"><i></i>Egresos</span></aside></div><div data-dashboard-finance-chart></div></article>
            <article class="dashboard-reference-card"><div class="dashboard-reference-card-head"><div><span>ACTIVIDAD</span><h4>Últimos cambios registrados</h4></div></div><div class="dashboard-reference-list" data-dashboard-recent-activity></div></article>
            <article class="dashboard-reference-card dashboard-reference-overview-card"><div class="dashboard-reference-card-head"><div><span>COBERTURA</span><h4>Resumen de todos los módulos</h4></div></div><div class="dashboard-reference-overview" data-dashboard-admin-overview></div></article>
          </div>
          <div class="dashboard-reference-column">
            <article class="dashboard-reference-card"><div class="dashboard-reference-card-head"><div><span>MIEMBROS</span><h4>Estado de la nómina</h4></div></div><div data-dashboard-membership-status></div></article>
            <article class="dashboard-reference-card dashboard-reference-pending-card"><div class="dashboard-reference-card-head"><div><span>FORMULARIO SÚMATE</span><h4>Respuestas por revisar</h4></div></div><div class="dashboard-reference-list" data-dashboard-pending-approvals></div><button type="button" class="dashboard-reference-more" data-dashboard-open-view="members-contacted-view">Abrir pendientes →</button></article>
            <article class="dashboard-reference-card dashboard-reference-actions-card"><div class="dashboard-reference-card-head"><div><span>ACCESOS DIRECTOS</span><h4>Acciones rápidas</h4></div></div><div class="dashboard-reference-actions"><button type="button" data-dashboard-open-view="nueva-view"><span>📝</span><strong>Nueva publicación</strong></button><button type="button" data-dashboard-action="register-payment"><span>💳</span><strong>Registrar pago</strong></button><button type="button" data-dashboard-action="add-member"><span>🤝</span><strong>Agregar miembro</strong></button><button type="button" data-dashboard-open-view="crear-acta-view"><span>🗒️</span><strong>Crear acta</strong></button><button type="button" data-dashboard-open-view="usuarios-view"><span>👤</span><strong>Usuarios</strong></button></div></article>
          </div>
        </section>
        <section class="dashboard-reference-footer-grid"><article class="dashboard-reference-card dashboard-reference-status-card"><span>🛡️</span><div><strong data-dashboard-system-title>Comprobando información</strong><small data-dashboard-system-detail>Consultando módulos administrativos...</small></div><i data-dashboard-system-indicator></i></article><article class="dashboard-reference-card dashboard-reference-status-card"><span>🕒</span><div><strong>Última actualización</strong><small data-dashboard-last-update>—</small></div><button type="button" data-dashboard-refresh aria-label="Actualizar panel" title="Actualizar panel">↻</button></article></section>
        <article class="dashboard-widget dashboard-treasury-widget is-hidden" aria-hidden="true"><div data-dashboard-treasury-summary></div></article><div class="dashboard-list is-hidden" data-dashboard-latest-posts></div><div class="dashboard-member-summary is-hidden" data-dashboard-member-summary></div><p class="admin-status dashboard-status" data-dashboard-status>Preparando panel de control...</p>
      </section>`;
  }

  function kpiCard(icon, label, metric, note = '', noteAttr = '', view = '') {
    const noteMarkup = noteAttr ? `<small ${noteAttr}>${esc(note || '—')}</small>` : `<small>${esc(note)}</small>`;
    return `<button type="button" class="dashboard-reference-kpi" data-dashboard-open-view="${esc(view)}"><span>${icon}</span><div><p>${esc(label)}</p><strong data-dashboard-total="${esc(metric)}">—</strong>${noteMarkup}</div><i aria-hidden="true">›</i></button>`;
  }

  function loadStyles() {
    const href = 'dashboard-control-reference-layout.css?v=20260924-integrated-dashboard-1';
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
  function adminUserCount(model) { return Number(model.roleCounts.administrador || 0) + Number(model.roleCounts.admin || 0); }
  function getYear(value) { return Number(String(value || '').slice(0, 4)) || 0; }
  function getMonth(value) { return Number(String(value || '').slice(5, 7)) - 1; }
  function normalizeText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
  function activityTimestamp(value) { const parsed = Date.parse(String(value || '')); return Number.isFinite(parsed) ? parsed : 0; }
  function getDisplayName(user) { return user?.user_metadata?.nombre || user?.user_metadata?.name || user?.user_metadata?.full_name || String(user?.email || 'Administrador/a').split('@')[0]; }
  function getUserRole(user) { return normalizeText(user?.user_metadata?.rol || user?.user_metadata?.role || user?.app_metadata?.rol || user?.app_metadata?.role || 'administrador'); }
  function labelRole(role) { return ({ administrador: 'Administrador/a', admin: 'Administrador/a', editor: 'Editor/a', lector: 'Lectura', gestor_miembros: 'Secretariado', secretariado: 'Secretariado', tesorero: 'Tesorería', tesorera: 'Tesorería' })[role] || 'Usuario interno'; }
  function labelMinuteStatus(value) { return ({ aprobada: 'aprobada', finalizada: 'finalizada', borrador: 'en borrador' })[normalizeText(value)] || 'actualizada'; }
  function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
  function formatLongDate(value) { return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }).format(value); }
  function formatShortDate(value) { return value ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(String(value).slice(0, 10) + 'T12:00:00')) : 'Sin fecha'; }
  function formatDateTime(value) { return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value); }
  function relativeDate(value) { return value ? formatShortDate(value) : 'Reciente'; }
  function initials(value) { return String(value || 'NA').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'NA'; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }
})();
