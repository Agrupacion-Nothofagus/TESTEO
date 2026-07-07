import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const ROLES_READ = ['administrador', 'admin', 'tesorero', 'tesorera', 'secretario', 'secretaria', 'secretariado', 'miembro', 'socio', 'socia', 'member'];
const ROLES_WRITE = ['administrador', 'admin', 'tesorero', 'tesorera'];
const MEMBER_ROLES = ['miembro', 'socio', 'socia', 'member'];
const API_URL = '/api/cuotas-miembros';
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const monthNames = ['Pago anual', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const monthShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const state = {
  user: null,
  role: '',
  permisos: { read: false, write: false, export: false, ownOnly: false },
  miembros: [],
  resumen: null,
  anio: currentYear,
  mes: currentMonth,
  loaded: false
};

if (!window.__nothofagusTesoreriaCuotas) {
  window.__nothofagusTesoreriaCuotas = true;
  initCuotasMiembros();
}

async function initCuotasMiembros() {
  cargarEstilosCuotas();
  state.user = await obtenerUsuarioActual();
  state.role = obtenerRol(state.user);
  if (!ROLES_READ.includes(state.role)) return;
  state.permisos = { read: true, write: ROLES_WRITE.includes(state.role), export: ROLES_WRITE.includes(state.role), ownOnly: MEMBER_ROLES.includes(state.role) };
  instalarVistaCuotas();
  instalarSidebarCuotas();
  instalarEventosCuotas();
  if (location.hash === '#tesoreria-cuotas') activarCuotasMiembros();
}

function cargarEstilosCuotas() {
  const styles = [
    ['tesoreria-cuotas.css?v=20260706-base', 'cuotasBase'],
    ['tesoreria-cuotas-monthly-dashboard.css?v=20260706-monthly', 'cuotasMonthly']
  ];
  styles.forEach(([href, key]) => {
    if (document.querySelector(`link[data-${key}]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset[key] = 'true';
    document.head.appendChild(link);
  });
}

async function obtenerUsuarioActual() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session?.user || null;
}

function obtenerRol(user) {
  return String(user?.user_metadata?.rol || user?.user_metadata?.role || user?.app_metadata?.rol || user?.app_metadata?.role || '').trim().toLowerCase();
}

function instalarSidebarCuotas() {
  const menu = document.querySelector('[data-tesoreria-menu]');
  if (menu) return appendCuotasButton(menu);
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  const observer = new MutationObserver(() => {
    const currentMenu = document.querySelector('[data-tesoreria-menu]');
    if (!currentMenu) return;
    appendCuotasButton(currentMenu);
    observer.disconnect();
  });
  observer.observe(nav, { childList: true, subtree: true });
}

function appendCuotasButton(menu) {
  if (!menu || document.querySelector('[data-tesoreria-open="cuotas"]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sidebar-link tesoreria-sidebar-link';
  button.dataset.tesoreriaOpen = 'cuotas';
  button.innerHTML = '<span>🧾</span>Registro de pagos';
  menu.appendChild(button);
  button.addEventListener('click', activarCuotasMiembros);
}

function instalarVistaCuotas() {
  const content = document.querySelector('.admin-content');
  if (!content) return;
  let section = document.querySelector('#tesoreria-cuotas-view');
  if (!section) {
    section = document.createElement('section');
    section.className = 'admin-view tesoreria-view cuotas-view';
    section.id = 'tesoreria-cuotas-view';
    content.appendChild(section);
  }
  section.dataset.viewTitle = 'Registro de Pagos Mensuales';
  section.dataset.viewDescription = 'Control y seguimiento de cuotas mensuales por integrante.';
  section.innerHTML = getCuotasTemplate();
}

function getCuotasTemplate() {
  return `
    <div class="admin-panel cuotas-monthly-dashboard">
      <header class="cuotas-dashboard-header">
        <div>
          <p class="section-tag">Tesorería · Cuotas</p>
          <h3>Registro de Pagos Mensuales</h3>
          <p>Control y seguimiento de cuotas mensuales por integrante</p>
        </div>
        <div class="cuotas-header-actions">
          <label class="cuotas-year-pill"><span>📅</span><select data-cuotas-year>${yearOptions()}</select></label>
          <button type="button" data-cuotas-export>⇩ Exportar</button>
          <button type="button" data-cuotas-register-payment>＋ Registrar pago</button>
        </div>
      </header>
      <p class="cuotas-own-note is-hidden" data-cuotas-own-note>Vista limitada: puedes revisar únicamente tu propio estado de cuota.</p>
      <section class="cuotas-kpi-grid" data-cuotas-summary></section>
      <section class="cuotas-dashboard-layout">
        <main class="cuotas-main-column">
          <section class="cuotas-filter-panel">
            <label>Buscar por nombre<input type="search" data-cuotas-filter="search" placeholder="Buscar integrante..."></label>
            <label>Estado del miembro<select data-cuotas-filter="estado"><option value="">Todos</option><option value="estudiante">Estudiante</option><option value="trabajador">Trabajador</option><option value="cesante">Cesante</option></select></label>
            <label>Estado de pago<select data-cuotas-filter="pago"><option value="">Todos</option><option value="pagado">Pagado</option><option value="pendiente">Pendiente</option><option value="atrasado">Atrasado</option><option value="al_dia">Al día</option><option value="parcial">Parcial</option><option value="pagada_anual">Pagada anual</option><option value="exento">Exento</option></select></label>
            <label>Mes<select data-cuotas-month>${monthOptions(state.mes)}</select></label>
            <label>Año<select data-cuotas-filter-year>${yearOptions()}</select></label>
            <button type="button" data-cuotas-apply-filter>Filtrar registros</button>
            <button type="button" class="secondary" data-cuotas-clear-filter>Limpiar filtros</button>
          </section>
          <p class="admin-status tesoreria-status" data-cuotas-status aria-live="polite"></p>
          <section class="cuotas-table-card cuotas-monthly-matrix-card">
            <div class="cuotas-card-heading">
              <div><h4>Matriz mensual de pagos por integrante</h4><p>Estado mensual de cuotas: pagado, pendiente, atrasado o sin registro.</p></div>
              <div class="cuotas-legend"><span><i class="status-dot pagado"></i>Pagado</span><span><i class="status-dot pendiente"></i>Pendiente</span><span><i class="status-dot atrasado"></i>Atrasado</span><span><i class="status-dot sin_registro"></i>Sin registro</span></div>
            </div>
            <div class="cuotas-table-wrap" data-cuotas-table></div>
          </section>
          <section class="cuotas-secondary-grid">
            <article class="cuotas-side-card cuotas-annual-summary-card" data-cuotas-annual-summary></article>
            <article class="cuotas-side-card cuotas-recent-card" data-cuotas-recent-movements></article>
          </section>
        </main>
        <aside class="cuotas-side-panel">
          <article class="cuotas-side-card" data-cuotas-month-summary></article>
          <article class="cuotas-side-card" data-cuotas-annual-status></article>
          <article class="cuotas-side-card" data-cuotas-quick-actions></article>
        </aside>
      </section>
    </div>
    <div class="cuotas-modal-backdrop" data-cuotas-modal aria-hidden="true"></div>
  `;
}

function yearOptions() {
  return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((year) => `<option value="${year}" ${year === Number(state.anio) ? 'selected' : ''}>${year}</option>`).join('');
}

function monthOptions(selected) {
  return monthNames.slice(1).map((month, index) => `<option value="${index + 1}" ${Number(selected) === index + 1 ? 'selected' : ''}>${month}</option>`).join('');
}

function instalarEventosCuotas() {
  document.querySelector('[data-tesoreria-open="cuotas"]')?.addEventListener('click', activarCuotasMiembros);
  document.addEventListener('click', handleCuotasAction);
  document.addEventListener('input', (event) => {
    if (event.target.matches?.('[data-cuotas-filter="search"]')) renderCuotas();
  });
  document.addEventListener('change', async (event) => {
    if (event.target.matches?.('[data-cuotas-filter="estado"], [data-cuotas-filter="pago"]')) renderCuotas();
    if (event.target.matches?.('[data-cuotas-month]')) { state.mes = Number(event.target.value || currentMonth); renderCuotas(); }
    if (event.target.matches?.('[data-cuotas-year], [data-cuotas-filter-year]')) await updateYear(event.target.value);
  });
}

async function updateYear(value) {
  state.anio = Number(value || currentYear);
  document.querySelectorAll('[data-cuotas-year], [data-cuotas-filter-year]').forEach((select) => { select.value = String(state.anio); });
  await loadCuotas(true);
}

async function activarCuotasMiembros() {
  const view = document.querySelector('#tesoreria-cuotas-view');
  if (!view) return;
  abrirMenuTesoreria();
  cerrarOtrosMenus();
  document.querySelectorAll('.admin-view').forEach((item) => item.classList.toggle('is-active', item.id === 'tesoreria-cuotas-view'));
  document.querySelectorAll('.sidebar-nav .is-active').forEach((item) => item.classList.remove('is-active'));
  document.querySelector('[data-tesoreria-toggle]')?.classList.add('is-active');
  document.querySelector('[data-tesoreria-open="cuotas"]')?.classList.add('is-active');
  const title = document.querySelector('#admin-view-title');
  const desc = document.querySelector('#admin-view-description');
  if (title) title.textContent = view.dataset.viewTitle;
  if (desc) desc.textContent = view.dataset.viewDescription;
  location.hash = 'tesoreria-cuotas';
  if (!state.loaded) await loadCuotas(true);
}

function abrirMenuTesoreria() {
  const menu = document.querySelector('[data-tesoreria-menu]');
  const toggle = document.querySelector('[data-tesoreria-toggle]');
  if (!menu || !toggle) return;
  menu.classList.remove('is-collapsed');
  menu.style.maxHeight = '520px';
  menu.style.opacity = '1';
  menu.style.pointerEvents = 'auto';
  toggle.classList.add('is-open');
  toggle.setAttribute('aria-expanded', 'true');
}

function cerrarOtrosMenus() {
  [['[data-publicaciones-menu]', '[data-publicaciones-toggle]'], ['[data-members-menu]', '[data-members-toggle]'], ['[data-actas-menu]', '[data-actas-toggle]']].forEach(([menuSel, toggleSel]) => {
    const menu = document.querySelector(menuSel);
    const toggle = document.querySelector(toggleSel);
    if (!menu || !toggle) return;
    menu.classList.add('is-collapsed');
    menu.style.maxHeight = '';
    menu.style.opacity = '';
    menu.style.pointerEvents = '';
    toggle.classList.remove('is-open', 'is-active');
    toggle.setAttribute('aria-expanded', 'false');
  });
}

async function loadCuotas(force = false) {
  if (!force && state.loaded) return;
  setStatus('Cargando registro de pagos mensuales...', true);
  try {
    const data = await api(`${API_URL}?anio=${encodeURIComponent(state.anio)}`);
    state.miembros = data.miembros || [];
    state.resumen = data.resumen || null;
    state.permisos = data.permisos || state.permisos;
    state.loaded = true;
    applyPermissionsToUi();
    renderCuotas();
    setStatus('Registro de pagos actualizado.', true);
  } catch (error) {
    state.loaded = false;
    renderEmpty(error.message || 'No fue posible cargar cuotas de miembros.');
    setStatus(error.message || 'No fue posible cargar cuotas de miembros.', false);
  }
}

function applyPermissionsToUi() {
  const write = Boolean(state.permisos.write);
  const canExport = Boolean(state.permisos.export);
  document.querySelectorAll('[data-cuotas-register-payment], [data-cuotas-add-member]').forEach((item) => item.toggleAttribute('disabled', !write));
  document.querySelectorAll('[data-cuotas-export], [data-cuotas-pdf]').forEach((item) => item.toggleAttribute('disabled', !canExport));
  document.querySelector('[data-cuotas-own-note]')?.classList.toggle('is-hidden', !state.permisos.ownOnly);
}

function renderCuotas() {
  const items = getFilteredMembers();
  const resumen = buildDashboardSummary(items);
  renderSummary(resumen);
  renderTable(items);
  renderMonthSummary(resumen);
  renderAnnualStatus(items, resumen);
  renderQuickActions();
  renderRecentMovements(items);
  renderAnnualSummary(resumen);
}

function renderSummary(resumen) {
  const box = document.querySelector('[data-cuotas-summary]');
  if (!box) return;
  box.innerHTML = [
    kpi('Total integrantes activos', resumen.integrantesActivos, 'Activos este año', '👥'),
    kpi('Ingresos mensuales esperados', formatCLP(resumen.esperadoMes), 'Suma de cuotas', '💵'),
    kpi('Ingresos recibidos en el mes', formatCLP(resumen.recibidoMes), `${resumen.porcentajeMes}% del esperado`, '✅'),
    kpi('Pendiente por cobrar', formatCLP(resumen.pendienteMes), 'Del mes seleccionado', '🕘'),
    kpi('Total recaudado en el año', formatCLP(resumen.totalRecaudado), 'Suma de pagos', '📈'),
    kpi('Saldo pendiente anual', formatCLP(resumen.saldoPendiente), 'Pendiente por cobrar', '⚠️')
  ].join('');
}

function kpi(label, value, note, icon) {
  return `<article class="cuotas-kpi-card"><i aria-hidden="true">${escapeHTML(icon)}</i><div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong><small>${escapeHTML(note || '')}</small></div></article>`;
}

function renderTable(items) {
  const box = document.querySelector('[data-cuotas-table]');
  if (!box) return;
  if (!items.length) {
    box.innerHTML = '<p class="cuotas-empty">No hay miembros que coincidan con los filtros aplicados.</p>';
    return;
  }
  box.innerHTML = `
    <table class="cuotas-monthly-table">
      <thead><tr><th>Integrante</th><th>Estado</th><th>Cuota mensual</th>${monthShort.map((m) => `<th>${m}</th>`).join('')}<th>Total pagado</th><th>Saldo pendiente</th><th>Acciones</th></tr></thead>
      <tbody>${items.map(renderRow).join('')}</tbody>
    </table>`;
}

function renderRow(member) {
  const write = Boolean(state.permisos.write);
  return `<tr>
    <td data-label="Integrante"><div class="cuotas-member-name"><span class="avatar-mini">${initials(member.nombre)}</span><div><strong>${escapeHTML(member.nombre)}</strong><small>${escapeHTML(member.correo || 'Sin correo')} · ${escapeHTML(member.rut || 'RUT opcional')}</small></div></div></td>
    <td data-label="Estado"><span class="cuotas-member-state">${labelMemberState(member.estadoMiembro)}</span></td>
    <td data-label="Cuota mensual"><strong>${formatCLP(member.cuotaMensual)}</strong></td>
    ${Array.from({ length: 12 }, (_, index) => renderMonthCell(member, index + 1)).join('')}
    <td data-label="Total pagado"><strong>${formatCLP(member.totalPagado)}</strong></td>
    <td data-label="Saldo pendiente"><strong class="saldo-value">${formatCLP(member.saldoPendiente)}</strong></td>
    <td data-label="Acciones">${renderActions(member, write)}</td>
  </tr>`;
}

function renderMonthCell(member, month) {
  const status = getMonthStatus(member, month);
  const payment = getMonthPayment(member, month);
  const title = `${monthNames[month]} · ${labelMonthStatus(status)}${payment ? ` · ${formatCLP(payment.monto)} · ${formatDate(payment.fechaPago)}${payment.comprobanteUrl ? ' · Con comprobante' : ''}` : ''}`;
  return `<td data-label="${monthShort[month - 1]}" class="month-cell"><button type="button" class="payment-status-dot ${escapeAttr(status)}" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}" ${state.permisos.write ? `data-cuotas-payment-month="${escapeAttr(member.id)}" data-month="${month}"` : ''}></button></td>`;
}

function renderActions(member, write) {
  return `<div class="payment-actions" data-payment-actions><button type="button" class="payment-actions-toggle" data-payment-actions-toggle><span>☰</span> Acciones</button><div class="payment-actions-menu">
    <button type="button" data-cuotas-history="${escapeAttr(member.id)}">Ver historial de pagos</button>
    <button type="button" data-cuotas-edit="${escapeAttr(member.id)}">${write ? 'Editar cuota mensual' : 'Ver ficha'}</button>
    <button type="button" ${write ? '' : 'disabled'} data-cuotas-payment="${escapeAttr(member.id)}">Registrar pago mensual</button>
    <button type="button" ${write ? '' : 'disabled'} data-cuotas-annual="${escapeAttr(member.id)}">Registrar cuota anual</button>
    <button type="button" ${write ? '' : 'disabled'} data-cuotas-payment="${escapeAttr(member.id)}">Adjuntar comprobante</button>
    <button type="button" ${write ? '' : 'disabled'} data-cuotas-inactive="${escapeAttr(member.id)}">Marcar como inactivo</button>
  </div></div>`;
}

function renderMonthSummary(resumen) {
  const box = document.querySelector('[data-cuotas-month-summary]');
  if (!box) return;
  box.innerHTML = `<h4>Resumen del mes</h4><p class="cuotas-side-date">📅 ${escapeHTML(monthNames[state.mes])} ${state.anio}</p><dl class="cuotas-side-list"><div><dt>Esperado</dt><dd>${formatCLP(resumen.esperadoMes)}</dd></div><div><dt>Recibido</dt><dd class="positive">${formatCLP(resumen.recibidoMes)}</dd></div><div><dt>Pendiente</dt><dd class="warning">${formatCLP(resumen.pendienteMes)}</dd></div><div><dt>% Cumplimiento</dt><dd>${resumen.porcentajeMes}%</dd></div></dl><div class="cuotas-progress"><span style="width:${Math.min(resumen.porcentajeMes, 100)}%"></span></div>`;
}

function renderAnnualStatus(items, resumen) {
  const box = document.querySelector('[data-cuotas-annual-status]');
  if (!box) return;
  const sinPagos = items.filter((item) => Number(item.totalPagado || 0) <= 0 && !item.exento).length;
  const total = Math.max(items.length, 1);
  box.innerHTML = `<h4>Estado anual de pagos</h4><div class="cuotas-donut-card"><div class="cuotas-donut" style="--paid:${Math.round((resumen.alDia / total) * 100)};--late:${Math.round((resumen.atrasados / total) * 100)}"><strong>${items.length}</strong><span>Integrantes</span></div><dl class="cuotas-side-list compact"><div><dt>Al día</dt><dd>${resumen.alDia}</dd></div><div><dt>Atrasados</dt><dd>${resumen.atrasados}</dd></div><div><dt>Sin pagos</dt><dd>${sinPagos}</dd></div></dl></div>`;
}

function renderQuickActions() {
  const box = document.querySelector('[data-cuotas-quick-actions]');
  if (!box) return;
  const disabled = state.permisos.write ? '' : 'disabled';
  box.innerHTML = `<h4>Acciones rápidas</h4><div class="cuotas-quick-buttons"><button type="button" ${disabled} data-cuotas-register-payment>Registrar pago mensual <span>›</span></button><button type="button" ${disabled} data-cuotas-add-member>Registrar cuota anual <span>›</span></button><button type="button" ${disabled} data-cuotas-add-member>Editar cuotas de miembros <span>›</span></button><button type="button" data-cuotas-export>Ver historial de pagos <span>›</span></button></div>`;
}

function renderRecentMovements(items) {
  const box = document.querySelector('[data-cuotas-recent-movements]');
  if (!box) return;
  const payments = items.flatMap((member) => (member.pagos || []).map((payment) => ({ ...payment, nombre: member.nombre }))).sort((a, b) => String(b.fechaPago || '').localeCompare(String(a.fechaPago || ''))).slice(0, 5);
  box.innerHTML = `<h4>Últimos movimientos</h4><div class="cuotas-recent-list">${payments.length ? payments.map((payment) => `<article><span class="recent-icon">↗</span><div><strong>${payment.tipoPago === 'anual' ? 'Cuota anual' : 'Pago mensual'} - ${escapeHTML(payment.nombre)}</strong><small>${escapeHTML(monthNames[Number(payment.mes || 0)] || 'Pago')} · ${formatDate(payment.fechaPago)}</small></div><em>+${formatCLP(payment.monto)}</em></article>`).join('') : '<p class="cuotas-empty compact">No hay movimientos registrados.</p>'}</div>`;
}

function renderAnnualSummary(resumen) {
  const box = document.querySelector('[data-cuotas-annual-summary]');
  if (!box) return;
  box.innerHTML = `<h4>Resumen anual</h4><div class="cuotas-chart-fake"><span style="height:78%"></span><span style="height:68%"></span><span style="height:72%"></span><span style="height:70%"></span><span style="height:76%"></span><span style="height:74%"></span></div><div class="cuotas-annual-bars"><div><span>Esperado anual</span><strong>${formatCLP(resumen.esperadoAnual)}</strong></div><div><span>Recaudado anual</span><strong>${formatCLP(resumen.totalRecaudado)}</strong></div><div><span>Saldo pendiente anual</span><strong>${formatCLP(resumen.saldoPendiente)}</strong></div></div>`;
}

function buildDashboardSummary(items) {
  const activos = items.filter((item) => item.estadoCuenta !== 'inactivo');
  const cobrables = activos.filter((item) => !item.exento);
  const esperadoMes = cobrables.reduce((sum, item) => sum + Number(item.cuotaMensual || 0), 0);
  const recibidoMes = items.reduce((sum, item) => sum + getPaymentsForMonth(item, state.mes).reduce((acc, payment) => acc + Number(payment.monto || 0), 0), 0);
  const totalRecaudado = items.reduce((sum, item) => sum + Number(item.totalPagado || 0), 0);
  const esperadoAnual = cobrables.reduce((sum, item) => sum + Number(item.cuotaMensual || 0) * 12, 0);
  const saldoPendiente = Math.max(esperadoAnual - totalRecaudado, 0);
  return { integrantesActivos: activos.length, esperadoMes, recibidoMes, pendienteMes: Math.max(esperadoMes - recibidoMes, 0), totalRecaudado, esperadoAnual, saldoPendiente, porcentajeMes: esperadoMes > 0 ? Math.round((recibidoMes / esperadoMes) * 1000) / 10 : 0, alDia: items.filter((item) => ['al_dia', 'pagada_anual', 'exento'].includes(item.estadoPago)).length, atrasados: items.filter((item) => item.estadoPago === 'atrasado').length };
}

function getFilteredMembers() {
  const search = String(document.querySelector('[data-cuotas-filter="search"]')?.value || '').trim().toLowerCase();
  const estado = String(document.querySelector('[data-cuotas-filter="estado"]')?.value || '').trim();
  const pago = String(document.querySelector('[data-cuotas-filter="pago"]')?.value || '').trim();
  return state.miembros.filter((member) => {
    const monthStatus = getMonthStatus(member, state.mes);
    return (!search || [member.nombre, member.correo, member.rut].join(' ').toLowerCase().includes(search)) && (!estado || member.estadoMiembro === estado) && (!pago || member.estadoPago === pago || monthStatus === pago);
  });
}

function handleCuotasAction(event) {
  const toggle = event.target.closest?.('[data-payment-actions-toggle]');
  if (toggle) { event.preventDefault(); const menu = toggle.closest('[data-payment-actions]'); const open = !menu.classList.contains('is-open'); closeActionMenus(menu); menu.classList.toggle('is-open', open); return; }
  if (!event.target.closest?.('[data-payment-actions]')) closeActionMenus();
  const edit = event.target.closest?.('[data-cuotas-edit]');
  const payment = event.target.closest?.('[data-cuotas-payment]');
  const paymentMonth = event.target.closest?.('[data-cuotas-payment-month]');
  const history = event.target.closest?.('[data-cuotas-history]');
  const annual = event.target.closest?.('[data-cuotas-annual]');
  const inactive = event.target.closest?.('[data-cuotas-inactive]');
  const addMember = event.target.closest?.('[data-cuotas-add-member]');
  const registerPayment = event.target.closest?.('[data-cuotas-register-payment]');
  const exportButton = event.target.closest?.('[data-cuotas-export]');
  const pdfButton = event.target.closest?.('[data-cuotas-pdf]');
  const close = event.target.closest?.('[data-cuotas-close]');
  const backdrop = event.target.matches?.('[data-cuotas-modal]');
  const deletePaymentButton = event.target.closest?.('[data-cuotas-delete-payment]');
  if (edit) openMemberModal(getMember(edit.dataset.cuotasEdit));
  if (payment && state.permisos.write) openPaymentModal(getMember(payment.dataset.cuotasPayment), state.mes);
  if (paymentMonth && state.permisos.write) openPaymentModal(getMember(paymentMonth.dataset.cuotasPaymentMonth), Number(paymentMonth.dataset.month || state.mes));
  if (history) openHistoryModal(getMember(history.dataset.cuotasHistory));
  if (annual && state.permisos.write) markAnnualPayment(getMember(annual.dataset.cuotasAnnual));
  if (inactive && state.permisos.write) markInactive(getMember(inactive.dataset.cuotasInactive));
  if (addMember && state.permisos.write) openMemberModal();
  if (registerPayment && state.permisos.write) openPaymentModal(state.miembros[0] || null, state.mes);
  if (exportButton && state.permisos.export) exportExcel();
  if (pdfButton && state.permisos.export) generatePdfReport();
  if (close || backdrop) closeModal();
  if (deletePaymentButton && state.permisos.write) deletePayment(deletePaymentButton.dataset.cuotasDeletePayment);
}

function closeActionMenus(except = null) { document.querySelectorAll('[data-payment-actions].is-open').forEach((menu) => { if (except && menu === except) return; menu.classList.remove('is-open'); }); }

function openMemberModal(member = null) {
  const write = Boolean(state.permisos.write);
  if (!write && !member) return;
  const isEdit = Boolean(member?.id);
  openModal(`<div class="cuotas-modal"><div class="cuotas-modal-header"><div><p class="section-tag">Ficha de integrante</p><h3>${isEdit ? (write ? 'Editar integrante' : 'Ficha de integrante') : 'Agregar integrante'}</h3><p>Datos personales, estado institucional, cuota mensual y observaciones.</p></div><button type="button" class="cuotas-modal-close" data-cuotas-close>×</button></div><form class="cuotas-form" data-cuotas-member-form><input type="hidden" name="id" value="${escapeAttr(member?.id || '')}"><div class="cuotas-form-grid"><label>Nombre completo<input name="nombre" value="${escapeAttr(member?.nombre || '')}" required ${write ? '' : 'disabled'}></label><label>RUT opcional<input name="rut" value="${escapeAttr(member?.rut || '')}" ${write ? '' : 'disabled'}></label><label>Correo<input name="correo" type="email" value="${escapeAttr(member?.correo || '')}" required ${write ? '' : 'disabled'}></label><label>Teléfono<input name="telefono" value="${escapeAttr(member?.telefono || '')}" ${write ? '' : 'disabled'}></label><label>Estado del miembro<select name="estado_miembro" ${write ? '' : 'disabled'}>${option('estudiante', member?.estadoMiembro, 'Estudiante')}${option('trabajador', member?.estadoMiembro, 'Trabajador')}${option('cesante', member?.estadoMiembro, 'Cesante')}</select></label><label>Monto cuota mensual<input name="cuota_mensual" type="number" min="0" step="1" value="${escapeAttr(member?.cuotaMensual ?? 0)}" ${write ? '' : 'disabled'}></label><label>Año<input name="anio" type="number" min="2020" max="2100" value="${escapeAttr(member?.anio || state.anio)}" ${write ? '' : 'disabled'}></label><label>Estado cuenta<select name="estado_cuenta" ${write ? '' : 'disabled'}>${option('activo', member?.estadoCuenta, 'Activo')}${option('inactivo', member?.estadoCuenta, 'Inactivo')}</select></label><label class="cuotas-checkline"><input name="exento" type="checkbox" ${member?.exento ? 'checked' : ''} ${write ? '' : 'disabled'}> Exento</label><label class="full">Observaciones<textarea name="observaciones" ${write ? '' : 'disabled'}>${escapeHTML(member?.observaciones || '')}</textarea></label></div><div class="cuotas-modal-actions"><button type="button" class="secondary" data-cuotas-close>Cerrar</button>${write ? '<button type="submit">Guardar ficha</button>' : ''}</div></form></div>`);
  document.querySelector('[data-cuotas-member-form]')?.addEventListener('submit', saveMemberForm);
}

function openPaymentModal(member = null, month = state.mes) {
  if (!state.permisos.write) return;
  const selected = member || state.miembros[0];
  if (!selected) return openMemberModal();
  openModal(`<div class="cuotas-modal"><div class="cuotas-modal-header"><div><p class="section-tag">Registro de pago</p><h3>Registrar pago</h3><p>${escapeHTML(selected.nombre)} · saldo pendiente ${formatCLP(selected.saldoPendiente)}</p></div><button type="button" class="cuotas-modal-close" data-cuotas-close>×</button></div><form class="cuotas-form" data-cuotas-payment-form enctype="multipart/form-data"><input type="hidden" name="action" value="payment"><div class="cuotas-form-grid"><label>Integrante<select name="member_id" required>${state.miembros.map((item) => `<option value="${escapeAttr(item.id)}" ${String(item.id) === String(selected.id) ? 'selected' : ''}>${escapeHTML(item.nombre)}</option>`).join('')}</select></label><label>Tipo de pago<select name="tipo_pago"><option value="mensual">Cuota mensual</option><option value="anual">Cuota anual</option></select></label><label>Mes<select name="mes">${monthOptions(month)}</select></label><label>Año<input name="anio" type="number" min="2020" max="2100" value="${escapeAttr(state.anio)}" required></label><label>Monto<input name="monto" type="number" min="1" step="1" value="${escapeAttr(selected.cuotaMensual || '')}" required></label><label>Fecha de pago<input name="fecha_pago" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Método de pago<select name="metodo_pago"><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="deposito">Depósito</option><option value="webpay">Webpay</option><option value="otro">Otro</option></select></label><label class="full">Observación<textarea name="observacion"></textarea></label><label class="full">Adjuntar comprobante<input name="comprobante" type="file" accept="application/pdf,image/jpeg,image/png"></label></div><div class="cuotas-modal-actions"><button type="button" class="secondary" data-cuotas-close>Cancelar</button><button type="submit">Guardar pago</button></div></form></div>`);
  const form = document.querySelector('[data-cuotas-payment-form]');
  form?.addEventListener('change', syncPaymentTypeAmount);
  form?.addEventListener('submit', savePaymentForm);
}

function openHistoryModal(member) {
  if (!member) return;
  const pagos = [...(member.pagos || [])].sort((a, b) => String(b.fechaPago || '').localeCompare(String(a.fechaPago || '')));
  openModal(`<div class="cuotas-modal"><div class="cuotas-modal-header"><div><p class="section-tag">Historial de pagos</p><h3>${escapeHTML(member.nombre)}</h3><p>Total pagado ${formatCLP(member.totalPagado)} · saldo ${formatCLP(member.saldoPendiente)}</p></div><button type="button" class="cuotas-modal-close" data-cuotas-close>×</button></div><div class="cuotas-history">${pagos.length ? pagos.map(renderHistoryRow).join('') : '<p class="cuotas-empty">No hay pagos registrados para el año seleccionado.</p>'}</div></div>`);
}

function renderHistoryRow(payment) {
  const file = payment.comprobanteUrl ? `<a class="cuotas-file-link" href="${escapeAttr(payment.comprobanteUrl)}" target="_blank" rel="noopener">Comprobante</a>` : '<small>Sin comprobante</small>';
  const del = state.permisos.write ? `<button type="button" class="danger" data-cuotas-delete-payment="${escapeAttr(payment.id)}">Eliminar</button>` : '';
  return `<article class="cuotas-history-row"><strong>${escapeHTML(monthNames[Number(payment.mes || 0)] || 'Mes')}</strong><span>${formatCLP(payment.monto)}</span><small>${escapeHTML(payment.metodoPago || 'transferencia')} · ${escapeHTML(payment.observacion || 'Sin observación')}</small><span>${formatDate(payment.fechaPago)}</span><div class="cuotas-history-actions">${file}${del}</div></article>`;
}

function openModal(html) { const backdrop = document.querySelector('[data-cuotas-modal]'); if (!backdrop) return; backdrop.innerHTML = html; backdrop.classList.add('is-open'); backdrop.setAttribute('aria-hidden', 'false'); }
function closeModal() { const backdrop = document.querySelector('[data-cuotas-modal]'); if (!backdrop) return; backdrop.classList.remove('is-open'); backdrop.setAttribute('aria-hidden', 'true'); window.setTimeout(() => { backdrop.innerHTML = ''; }, 160); }

async function saveMemberForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  data.exento = form.exento.checked;
  try { setStatus('Guardando integrante...', true); await api(API_URL, { method: data.id ? 'PATCH' : 'POST', body: JSON.stringify(data) }); closeModal(); await loadCuotas(true); setStatus('Ficha guardada correctamente.', true); } catch (error) { setStatus(error.message || 'No fue posible guardar la ficha.', false); }
}

async function savePaymentForm(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  try { setStatus('Registrando pago...', true); await api(API_URL, { method: 'POST', body: formData, skipContentType: true }); closeModal(); await loadCuotas(true); setStatus('Pago registrado correctamente.', true); } catch (error) { setStatus(error.message || 'No fue posible registrar el pago.', false); }
}

function syncPaymentTypeAmount(event) {
  const form = event.currentTarget;
  if (!['tipo_pago', 'member_id'].includes(event.target.name)) return;
  const member = getMember(form.member_id.value);
  if (!member) return;
  form.monto.value = form.tipo_pago.value === 'anual' ? Math.max(Number(member.saldoPendiente || 0), Number(member.cuotaAnualEsperada || 0)) : Number(member.cuotaMensual || 0);
}

async function markAnnualPayment(member) {
  if (!member || !confirm(`¿Registrar cuota anual para ${member.nombre}?`)) return;
  try { await api(API_URL, { method: 'POST', body: JSON.stringify({ action: 'payment', member_id: member.id, tipo_pago: 'anual', mes: 1, anio: state.anio, monto: Math.max(Number(member.saldoPendiente || 0), Number(member.cuotaAnualEsperada || 0)), fecha_pago: new Date().toISOString().slice(0, 10), metodo_pago: 'transferencia', observacion: 'Cuota anual registrada desde el panel.' }) }); await loadCuotas(true); setStatus('Cuota anual registrada correctamente.', true); } catch (error) { setStatus(error.message || 'No fue posible registrar cuota anual.', false); }
}

async function markInactive(member) {
  if (!member || !confirm(`¿Marcar como inactivo a ${member.nombre}?`)) return;
  try { await api(API_URL, { method: 'PATCH', body: JSON.stringify({ id: member.id, nombre: member.nombre, correo: member.correo, rut: member.rut, telefono: member.telefono, estado_miembro: member.estadoMiembro, estado_cuenta: 'inactivo', cuota_mensual: member.cuotaMensual, anio: member.anio || state.anio, observaciones: member.observaciones, exento: member.exento }) }); await loadCuotas(true); setStatus('Integrante marcado como inactivo.', true); } catch (error) { setStatus(error.message || 'No fue posible actualizar integrante.', false); }
}

async function deletePayment(id) { if (!id || !confirm('¿Eliminar este pago?')) return; try { await api(`${API_URL}?payment_id=${encodeURIComponent(id)}`, { method: 'DELETE' }); closeModal(); await loadCuotas(true); setStatus('Pago eliminado correctamente.', true); } catch (error) { setStatus(error.message || 'No fue posible eliminar el pago.', false); } }

function exportExcel() {
  const items = getFilteredMembers();
  const rows = items.map((m) => `<tr><td>${escapeHTML(m.nombre)}</td><td>${escapeHTML(m.correo || '')}</td><td>${labelMemberState(m.estadoMiembro)}</td><td>${Number(m.cuotaMensual || 0)}</td>${Array.from({ length: 12 }, (_, i) => `<td>${labelMonthStatus(getMonthStatus(m, i + 1))}</td>`).join('')}<td>${Number(m.totalPagado || 0)}</td><td>${Number(m.saldoPendiente || 0)}</td></tr>`).join('');
  downloadBlob(new Blob([`<table><thead><tr><th>Nombre</th><th>Correo</th><th>Estado</th><th>Cuota mensual</th>${monthShort.map((m) => `<th>${m}</th>`).join('')}<th>Total pagado</th><th>Saldo pendiente</th></tr></thead><tbody>${rows}</tbody></table>`], { type: 'application/vnd.ms-excel;charset=utf-8' }), `registro-pagos-mensuales-${state.anio}.xls`);
}

function generatePdfReport() { exportExcel(); }
function renderEmpty(message) { document.querySelector('[data-cuotas-table]') && (document.querySelector('[data-cuotas-table]').innerHTML = `<p class="cuotas-empty">${escapeHTML(message)}</p>`); renderSummary(buildDashboardSummary([])); }
function getMonthStatus(member, month) { if (member.exento || member.estadoCuenta === 'inactivo') return 'sin_registro'; if (hasAnnualPayment(member)) return 'pagado'; if (getMonthPayment(member, month)) return 'pagado'; if (Number(state.anio) < currentYear) return 'atrasado'; if (Number(state.anio) > currentYear) return 'pendiente'; return month < currentMonth ? 'atrasado' : 'pendiente'; }
function getMonthPayment(member, month) { return (member.pagos || []).find((p) => Number(p.mes) === Number(month) && p.tipoPago !== 'anual'); }
function getPaymentsForMonth(member, month) { return (member.pagos || []).filter((p) => Number(p.mes) === Number(month) && p.tipoPago !== 'anual'); }
function hasAnnualPayment(member) { return (member.pagos || []).some((p) => p.tipoPago === 'anual' || Number(p.mes) === 0); }
async function api(url, options = {}) { if (!client) throw new Error('Supabase no está configurado.'); const session = await client.auth.getSession(); const token = session.data?.session?.access_token; if (!token) throw new Error('Sesión no disponible.'); const response = await fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, ...(options.skipContentType ? {} : { 'content-type': 'application/json; charset=utf-8' }), ...(options.headers || {}) } }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'Error de solicitud.'); return data; }
function getMember(id) { return state.miembros.find((m) => String(m.id) === String(id)); }
function option(value, current, label) { return `<option value="${value}" ${String(current || '') === value ? 'selected' : ''}>${label}</option>`; }
function initials(name = '') { const parts = String(name).trim().split(/\s+/).slice(0, 2); return parts.map((p) => p[0] || '').join('').toUpperCase() || 'N'; }
function labelPaymentStatus(status) { return { al_dia: 'Al día', atrasado: 'Atrasado', parcial: 'Parcial', pagada_anual: 'Pagada anual', exento: 'Exento' }[status] || 'Parcial'; }
function labelMonthStatus(status) { return { pagado: 'Pagado', pendiente: 'Pendiente', atrasado: 'Atrasado', sin_registro: 'Sin registro' }[status] || 'Sin registro'; }
function labelMemberState(status) { return { estudiante: 'Estudiante', trabajador: 'Trabajador', cesante: 'Cesante' }[status] || 'Estudiante'; }
function setStatus(message, ok) { const box = document.querySelector('[data-cuotas-status]'); if (!box) return; box.textContent = message; box.classList.toggle('success', Boolean(ok)); box.classList.toggle('error', !ok); }
function formatCLP(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function formatDate(value) { if (!value) return 'Sin fecha'; const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? 'Sin fecha' : new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(date); }
function downloadBlob(blob, filename) { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); }
function escapeHTML(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function escapeAttr(value) { return escapeHTML(value); }
