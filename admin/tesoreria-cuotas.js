import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const ROLES_READ = ['administrador', 'admin', 'tesorero', 'tesorera', 'secretario', 'secretaria', 'secretariado', 'miembro', 'socio', 'socia', 'member'];
const ROLES_WRITE = ['administrador', 'admin', 'tesorero', 'tesorera'];
const API_URL = '/api/cuotas-miembros';
const currentYear = new Date().getFullYear();
const monthNames = ['Pago anual', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const state = {
  user: null,
  role: '',
  permisos: { read: false, write: false, export: false, ownOnly: false },
  miembros: [],
  resumen: null,
  anio: currentYear,
  loaded: false,
  selectedMemberId: ''
};

if (!window.__nothofagusTesoreriaCuotas) {
  window.__nothofagusTesoreriaCuotas = true;
  initCuotasMiembros();
}

async function initCuotasMiembros() {
  cargarEstilosCuotas();
  state.user = await obtenerUsuarioActual();
  state.role = obtenerRol(state.user);

  if (!puedeVerLocal(state.role)) return;

  state.permisos = {
    read: true,
    write: ROLES_WRITE.includes(state.role),
    export: ROLES_WRITE.includes(state.role),
    ownOnly: ['miembro', 'socio', 'socia', 'member'].includes(state.role)
  };

  instalarVistaCuotas();
  instalarSidebarCuotas();
  instalarEventosCuotas();

  if (location.hash === '#tesoreria-cuotas') activarCuotasMiembros();
}

function cargarEstilosCuotas() {
  if (document.querySelector('link[href="tesoreria-cuotas.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'tesoreria-cuotas.css';
  document.head.appendChild(link);
}

async function obtenerUsuarioActual() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session?.user || null;
}

function obtenerRol(user) {
  return String(user?.user_metadata?.rol || user?.user_metadata?.role || user?.app_metadata?.rol || user?.app_metadata?.role || '').trim().toLowerCase();
}

function puedeVerLocal(role) {
  return ROLES_READ.includes(role);
}

function instalarSidebarCuotas() {
  const existingMenu = document.querySelector('[data-tesoreria-menu]');
  if (existingMenu) {
    appendCuotasButton(existingMenu);
    return;
  }

  if (!ROLES_WRITE.includes(state.role)) {
    crearSidebarTesoreriaSoloCuotas();
    return;
  }

  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;

  const observer = new MutationObserver(() => {
    const menu = document.querySelector('[data-tesoreria-menu]');
    if (!menu) return;
    appendCuotasButton(menu);
    observer.disconnect();
  });

  observer.observe(nav, { childList: true, subtree: true });

  window.setTimeout(() => {
    if (!document.querySelector('[data-tesoreria-open="cuotas"]') && !document.querySelector('[data-tesoreria-menu]')) {
      crearSidebarTesoreriaSoloCuotas();
    }
    observer.disconnect();
  }, 1800);
}

function appendCuotasButton(menu) {
  if (!menu || document.querySelector('[data-tesoreria-open="cuotas"]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sidebar-link tesoreria-sidebar-link';
  button.dataset.tesoreriaOpen = 'cuotas';
  button.innerHTML = '<span>🧾</span>Cuotas de miembros';
  menu.appendChild(button);
  button.addEventListener('click', activarCuotasMiembros);
}

function crearSidebarTesoreriaSoloCuotas() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || document.querySelector('[data-tesoreria-sidebar]')) return;

  const group = document.createElement('div');
  group.className = 'tesoreria-sidebar-group';
  group.dataset.tesoreriaSidebar = 'true';
  group.innerHTML = `
    <button type="button" class="sidebar-link tesoreria-sidebar-toggle" data-tesoreria-toggle aria-expanded="false" aria-controls="tesoreria-sidebar-menu">
      <span>💰</span>
      Tesorería
      <strong class="tesoreria-toggle-caret" aria-hidden="true">⌄</strong>
    </button>
    <div class="tesoreria-sidebar-menu is-collapsed" id="tesoreria-sidebar-menu" data-tesoreria-menu></div>
  `;
  nav.appendChild(group);
  appendCuotasButton(group.querySelector('[data-tesoreria-menu]'));
  group.querySelector('[data-tesoreria-toggle]')?.addEventListener('click', alternarMenuTesoreriaCuotas);
}

function instalarVistaCuotas() {
  const content = document.querySelector('.admin-content');
  if (!content || document.querySelector('#tesoreria-cuotas-view')) return;

  const section = document.createElement('section');
  section.className = 'admin-view tesoreria-view cuotas-view';
  section.id = 'tesoreria-cuotas-view';
  section.dataset.viewTitle = 'Cuotas de Miembros';
  section.dataset.viewDescription = 'Administración de cuotas mensuales, pagos anuales, saldos e historial financiero por miembro.';
  section.innerHTML = getCuotasTemplate();
  content.appendChild(section);
}

function getCuotasTemplate() {
  return `
    <div class="admin-panel tesoreria-panel cuotas-panel">
      <div class="tesoreria-topbar">
        <div>
          <p class="section-tag">Tesorería</p>
          <h3>Cuotas de Miembros</h3>
          <p>Control anual de cuotas mensuales, pagos registrados, comprobantes, saldos y estado de pago por integrante.</p>
        </div>
        <div class="tesoreria-actions-row">
          <button type="button" data-cuotas-add-member>Agregar miembro</button>
          <button type="button" data-cuotas-export>Exportar a Excel</button>
          <button type="button" data-cuotas-pdf>Generar reporte PDF</button>
        </div>
      </div>
      <p class="cuotas-own-note is-hidden" data-cuotas-own-note>Vista limitada: puedes revisar únicamente tu propio estado de cuota.</p>
      <div class="cuotas-summary-grid" data-cuotas-summary></div>
      <div class="cuotas-toolbar">
        <label>Buscar por nombre<input type="search" data-cuotas-filter="search" placeholder="Nombre completo"></label>
        <label>Estado del miembro<select data-cuotas-filter="estado"><option value="">Todos</option><option value="estudiante">Estudiante</option><option value="trabajador">Trabajador</option><option value="cesante">Cesante</option></select></label>
        <label>Estado de pago<select data-cuotas-filter="pago"><option value="">Todos</option><option value="al_dia">Al día</option><option value="atrasado">Atrasado</option><option value="parcial">Parcial</option><option value="pagada_anual">Pagada anual</option><option value="exento">Exento</option></select></label>
        <label>Año<select data-cuotas-year>${yearOptions()}</select></label>
        <button type="button" data-cuotas-apply-filter>Filtrar registros</button>
      </div>
      <p class="admin-status tesoreria-status" data-cuotas-status aria-live="polite"></p>
      <section class="cuotas-table-card">
        <div class="cuotas-table-wrap" data-cuotas-table></div>
      </section>
    </div>
    <div class="cuotas-modal-backdrop" data-cuotas-modal aria-hidden="true"></div>
  `;
}

function yearOptions() {
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  return years.map((year) => `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`).join('');
}

function instalarEventosCuotas() {
  document.querySelector('[data-tesoreria-open="cuotas"]')?.addEventListener('click', activarCuotasMiembros);
  document.querySelector('[data-cuotas-add-member]')?.addEventListener('click', () => openMemberModal());
  document.querySelector('[data-cuotas-export]')?.addEventListener('click', exportExcel);
  document.querySelector('[data-cuotas-pdf]')?.addEventListener('click', generatePdfReport);
  document.querySelector('[data-cuotas-apply-filter]')?.addEventListener('click', renderCuotas);
  document.querySelector('[data-cuotas-filter="search"]')?.addEventListener('input', renderCuotas);
  document.querySelector('[data-cuotas-filter="estado"]')?.addEventListener('change', renderCuotas);
  document.querySelector('[data-cuotas-filter="pago"]')?.addEventListener('change', renderCuotas);
  document.querySelector('[data-cuotas-year]')?.addEventListener('change', async (event) => {
    state.anio = Number(event.target.value || currentYear);
    await loadCuotas(true);
  });

  document.addEventListener('click', handleCuotasAction);
}

async function activarCuotasMiembros() {
  const view = document.querySelector('#tesoreria-cuotas-view');
  if (!view) return;

  abrirMenuTesoreriaCuotas();
  cerrarOtrosMenus();

  document.querySelectorAll('.admin-view').forEach((item) => item.classList.toggle('is-active', item.id === 'tesoreria-cuotas-view'));
  document.querySelectorAll('[data-admin-view]').forEach((button) => button.classList.remove('is-active'));
  document.querySelectorAll('[data-tesoreria-open]').forEach((button) => button.classList.toggle('is-active', button.dataset.tesoreriaOpen === 'cuotas'));
  document.querySelector('[data-tesoreria-toggle]')?.classList.add('is-active');

  const title = document.querySelector('#admin-view-title');
  const description = document.querySelector('#admin-view-description');
  if (title) title.textContent = view.dataset.viewTitle || 'Cuotas de Miembros';
  if (description) description.textContent = view.dataset.viewDescription || '';

  location.hash = 'tesoreria-cuotas';
  if (!state.loaded) await loadCuotas(true);
}

function alternarMenuTesoreriaCuotas() {
  const menu = document.querySelector('[data-tesoreria-menu]');
  if (!menu) return;
  menu.classList.contains('is-collapsed') ? abrirMenuTesoreriaCuotas() : cerrarMenuTesoreriaCuotas();
}

function abrirMenuTesoreriaCuotas() {
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

function cerrarMenuTesoreriaCuotas() {
  const menu = document.querySelector('[data-tesoreria-menu]');
  const toggle = document.querySelector('[data-tesoreria-toggle]');
  if (!menu || !toggle) return;
  menu.classList.add('is-collapsed');
  menu.style.maxHeight = '';
  menu.style.opacity = '';
  menu.style.pointerEvents = '';
  toggle.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
}

function cerrarOtrosMenus() {
  closeMenu('[data-publicaciones-menu]', '[data-publicaciones-toggle]');
  closeMenu('[data-members-menu]', '[data-members-toggle]');
  closeMenu('[data-actas-menu]', '[data-actas-toggle]');
}

function closeMenu(menuSelector, toggleSelector) {
  const menu = document.querySelector(menuSelector);
  const toggle = document.querySelector(toggleSelector);
  if (!menu || !toggle) return;
  menu.classList.add('is-collapsed');
  menu.style.maxHeight = '';
  menu.style.opacity = '';
  menu.style.pointerEvents = '';
  toggle.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
}

async function loadCuotas(force = false) {
  if (!force && state.loaded) return;
  setStatus('Cargando cuotas de miembros...', true);

  try {
    const data = await api(`${API_URL}?anio=${encodeURIComponent(state.anio)}`);
    state.miembros = data.miembros || [];
    state.resumen = data.resumen || null;
    state.permisos = data.permisos || state.permisos;
    state.loaded = true;
    applyPermissionsToUi();
    renderCuotas();
    setStatus('Cuotas actualizadas correctamente.', true);
  } catch (error) {
    state.loaded = false;
    renderEmpty(error.message || 'No fue posible cargar cuotas de miembros.');
    setStatus(error.message || 'No fue posible cargar cuotas de miembros.', false);
  }
}

function applyPermissionsToUi() {
  const write = Boolean(state.permisos.write);
  const canExport = Boolean(state.permisos.export);
  document.querySelector('[data-cuotas-add-member]')?.toggleAttribute('disabled', !write);
  document.querySelector('[data-cuotas-export]')?.toggleAttribute('disabled', !canExport);
  document.querySelector('[data-cuotas-pdf]')?.toggleAttribute('disabled', !canExport);
  document.querySelector('[data-cuotas-own-note]')?.classList.toggle('is-hidden', !state.permisos.ownOnly);
}

function renderCuotas() {
  renderSummary();
  renderTable(getFilteredMembers());
}

function renderSummary() {
  const box = document.querySelector('[data-cuotas-summary]');
  if (!box) return;
  const resumen = state.resumen || buildSummary(state.miembros);
  box.innerHTML = `
    ${summaryCard('Miembros registrados', resumen.totalMiembros || 0)}
    ${summaryCard('Miembros al día', resumen.alDia || 0)}
    ${summaryCard('Miembros atrasados', resumen.atrasados || 0)}
    ${summaryCard('Cuotas anuales pagadas', resumen.cuotasAnualesPagadas || 0)}
    ${summaryCard('Total recaudado en el año', formatCLP(resumen.totalRecaudado || 0))}
    ${summaryCard('Saldo pendiente total', formatCLP(resumen.saldoPendiente || 0))}
  `;
}

function summaryCard(label, value) {
  return `<article class="cuotas-summary-card"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></article>`;
}

function renderTable(items) {
  const box = document.querySelector('[data-cuotas-table]');
  if (!box) return;

  if (!items.length) {
    box.innerHTML = '<p class="cuotas-empty">No hay miembros que coincidan con los filtros aplicados.</p>';
    return;
  }

  box.innerHTML = `
    <table class="cuotas-table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Estado</th>
          <th>Cuota mensual</th>
          <th>Meses pagados</th>
          <th>Total pagado</th>
          <th>Saldo pendiente</th>
          <th>Estado cuota anual</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${items.map(renderRow).join('')}</tbody>
    </table>
  `;
}

function renderRow(member) {
  const write = Boolean(state.permisos.write);
  return `
    <tr>
      <td data-label="Nombre"><div class="cuotas-member-name"><strong>${escapeHTML(member.nombre)}</strong><small>${escapeHTML(member.correo || 'Sin correo')} · ${escapeHTML(member.rut || 'RUT opcional')}</small></div></td>
      <td data-label="Estado">${labelMemberState(member.estadoMiembro)}${member.estadoCuenta === 'inactivo' ? ' · Inactivo' : ''}</td>
      <td data-label="Cuota mensual">${formatCLP(member.cuotaMensual)}</td>
      <td data-label="Meses pagados">${Number(member.mesesPagados || 0)}/12</td>
      <td data-label="Total pagado">${formatCLP(member.totalPagado)}</td>
      <td data-label="Saldo pendiente">${formatCLP(member.saldoPendiente)}</td>
      <td data-label="Estado cuota anual">${badge(member.estadoPago)}</td>
      <td data-label="Acciones">
        <div class="cuotas-actions">
          <button type="button" class="secondary" data-cuotas-history="${escapeAttr(member.id)}">Historial</button>
          <button type="button" data-cuotas-edit="${escapeAttr(member.id)}">${write ? 'Editar' : 'Ver ficha'}</button>
          <button type="button" ${write ? '' : 'disabled'} data-cuotas-payment="${escapeAttr(member.id)}">Registrar pago</button>
          <button type="button" ${write ? '' : 'disabled'} data-cuotas-annual="${escapeAttr(member.id)}">Pago anual</button>
        </div>
      </td>
    </tr>
  `;
}

function getFilteredMembers() {
  const search = String(document.querySelector('[data-cuotas-filter="search"]')?.value || '').trim().toLowerCase();
  const estado = String(document.querySelector('[data-cuotas-filter="estado"]')?.value || '').trim();
  const pago = String(document.querySelector('[data-cuotas-filter="pago"]')?.value || '').trim();

  return state.miembros.filter((member) => {
    const searchOk = !search || String(member.nombre || '').toLowerCase().includes(search) || String(member.correo || '').toLowerCase().includes(search);
    const estadoOk = !estado || member.estadoMiembro === estado;
    const pagoOk = !pago || member.estadoPago === pago;
    return searchOk && estadoOk && pagoOk;
  });
}

function renderEmpty(message) {
  const box = document.querySelector('[data-cuotas-table]');
  if (box) box.innerHTML = `<p class="cuotas-empty">${escapeHTML(message)}</p>`;
  renderSummary();
}

function handleCuotasAction(event) {
  const edit = event.target.closest?.('[data-cuotas-edit]');
  const payment = event.target.closest?.('[data-cuotas-payment]');
  const history = event.target.closest?.('[data-cuotas-history]');
  const annual = event.target.closest?.('[data-cuotas-annual]');
  const close = event.target.closest?.('[data-cuotas-close]');
  const backdrop = event.target.matches?.('[data-cuotas-modal]');
  const deletePaymentButton = event.target.closest?.('[data-cuotas-delete-payment]');

  if (edit) openMemberModal(getMember(edit.dataset.cuotasEdit));
  if (payment && state.permisos.write) openPaymentModal(getMember(payment.dataset.cuotasPayment));
  if (history) openHistoryModal(getMember(history.dataset.cuotasHistory));
  if (annual && state.permisos.write) markAnnualPayment(getMember(annual.dataset.cuotasAnnual));
  if (close || backdrop) closeModal();
  if (deletePaymentButton && state.permisos.write) deletePayment(deletePaymentButton.dataset.cuotasDeletePayment);
}

function openMemberModal(member = null) {
  const write = Boolean(state.permisos.write);
  if (!write && !member) return;
  const isEdit = Boolean(member?.id);
  openModal(`
    <div class="cuotas-modal">
      <div class="cuotas-modal-header">
        <div><p class="section-tag">Ficha de miembro</p><h3>${isEdit ? (write ? 'Editar miembro' : 'Ficha de miembro') : 'Agregar miembro'}</h3><p>Datos personales, estado institucional, cuota mensual y observaciones administrativas.</p></div>
        <button type="button" class="cuotas-modal-close" data-cuotas-close>×</button>
      </div>
      <form class="cuotas-form" data-cuotas-member-form>
        <input type="hidden" name="id" value="${escapeAttr(member?.id || '')}">
        <div class="cuotas-form-grid">
          <label>Nombre completo<input name="nombre" value="${escapeAttr(member?.nombre || '')}" required ${write ? '' : 'disabled'}></label>
          <label>RUT opcional<input name="rut" value="${escapeAttr(member?.rut || '')}" ${write ? '' : 'disabled'}></label>
          <label>Correo<input name="correo" type="email" value="${escapeAttr(member?.correo || '')}" required ${write ? '' : 'disabled'}></label>
          <label>Teléfono<input name="telefono" value="${escapeAttr(member?.telefono || '')}" ${write ? '' : 'disabled'}></label>
          <label>Estado del miembro<select name="estado_miembro" ${write ? '' : 'disabled'}>${option('estudiante', member?.estadoMiembro, 'Estudiante')}${option('trabajador', member?.estadoMiembro, 'Trabajador')}${option('cesante', member?.estadoMiembro, 'Cesante')}</select></label>
          <label>Monto cuota mensual<input name="cuota_mensual" type="number" min="0" step="1" value="${escapeAttr(member?.cuotaMensual ?? 0)}" ${write ? '' : 'disabled'}></label>
          <label>Año correspondiente<input name="anio" type="number" min="2020" max="2100" value="${escapeAttr(member?.anio || state.anio)}" ${write ? '' : 'disabled'}></label>
          <label>Estado activo/inactivo<select name="estado_cuenta" ${write ? '' : 'disabled'}>${option('activo', member?.estadoCuenta, 'Activo')}${option('inactivo', member?.estadoCuenta, 'Inactivo')}</select></label>
          <label class="cuotas-checkline"><input name="exento" type="checkbox" ${member?.exento ? 'checked' : ''} ${write ? '' : 'disabled'}> Autorizado sin pago / exento</label>
          <label class="full">Observaciones<textarea name="observaciones" ${write ? '' : 'disabled'}>${escapeHTML(member?.observaciones || '')}</textarea></label>
        </div>
        <div class="cuotas-modal-actions">
          <button type="button" class="secondary" data-cuotas-close>Cerrar</button>
          ${write ? '<button type="submit">Guardar ficha</button>' : ''}
        </div>
      </form>
    </div>
  `);

  document.querySelector('[data-cuotas-member-form]')?.addEventListener('submit', saveMemberForm);
}

function openPaymentModal(member) {
  if (!member || !state.permisos.write) return;
  openModal(`
    <div class="cuotas-modal">
      <div class="cuotas-modal-header">
        <div><p class="section-tag">Historial de pagos</p><h3>Registrar pago</h3><p>${escapeHTML(member.nombre)} · saldo pendiente ${formatCLP(member.saldoPendiente)}</p></div>
        <button type="button" class="cuotas-modal-close" data-cuotas-close>×</button>
      </div>
      <form class="cuotas-form" data-cuotas-payment-form enctype="multipart/form-data">
        <input type="hidden" name="member_id" value="${escapeAttr(member.id)}">
        <input type="hidden" name="action" value="payment">
        <div class="cuotas-form-grid">
          <label>Tipo de pago<select name="tipo_pago"><option value="mensual">Pago mensual</option><option value="anual">Pago anual completo</option></select></label>
          <label>Mes<select name="mes">${monthOptions(new Date().getMonth() + 1)}</select></label>
          <label>Año<input name="anio" type="number" min="2020" max="2100" value="${escapeAttr(state.anio)}" required></label>
          <label>Monto<input name="monto" type="number" min="1" step="1" value="${escapeAttr(member.cuotaMensual || '')}" required></label>
          <label>Fecha de pago<input name="fecha_pago" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
          <label>Método de pago<select name="metodo_pago"><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="deposito">Depósito</option><option value="webpay">Webpay</option><option value="otro">Otro</option></select></label>
          <label class="full">Observación<textarea name="observacion" placeholder="Detalle, número de operación u observación administrativa"></textarea></label>
          <label class="full">Adjuntar comprobante<input name="comprobante" type="file" accept="application/pdf,image/jpeg,image/png"></label>
        </div>
        <div class="cuotas-modal-actions"><button type="button" class="secondary" data-cuotas-close>Cancelar</button><button type="submit">Guardar pago</button></div>
      </form>
    </div>
  `);

  const form = document.querySelector('[data-cuotas-payment-form]');
  form?.addEventListener('change', syncPaymentTypeAmount);
  form?.addEventListener('submit', savePaymentForm);
}

function openHistoryModal(member) {
  if (!member) return;
  const pagos = [...(member.pagos || [])].sort((a, b) => String(b.fechaPago || '').localeCompare(String(a.fechaPago || '')));
  openModal(`
    <div class="cuotas-modal">
      <div class="cuotas-modal-header">
        <div><p class="section-tag">Historial de pagos</p><h3>${escapeHTML(member.nombre)}</h3><p>Total pagado ${formatCLP(member.totalPagado)} · saldo ${formatCLP(member.saldoPendiente)}</p></div>
        <button type="button" class="cuotas-modal-close" data-cuotas-close>×</button>
      </div>
      <div class="cuotas-history">
        ${pagos.length ? pagos.map(renderHistoryRow).join('') : '<p class="cuotas-empty">No hay pagos registrados para el año seleccionado.</p>'}
      </div>
    </div>
  `);
}

function renderHistoryRow(payment) {
  const deleteButton = state.permisos.write ? `<button type="button" class="danger" data-cuotas-delete-payment="${escapeAttr(payment.id)}">Eliminar</button>` : '';
  const file = payment.comprobanteUrl ? `<a class="cuotas-file-link" href="${escapeAttr(payment.comprobanteUrl)}" target="_blank" rel="noopener">Comprobante</a>` : '<small>Sin comprobante</small>';
  return `
    <article class="cuotas-history-row">
      <strong>${escapeHTML(monthNames[Number(payment.mes || 0)] || 'Mes')}</strong>
      <span>${formatCLP(payment.monto)}</span>
      <small>${escapeHTML(payment.metodoPago || 'transferencia')} · ${escapeHTML(payment.observacion || 'Sin observación')}</small>
      <span>${formatDate(payment.fechaPago)}</span>
      <div class="cuotas-actions">${file}${deleteButton}</div>
    </article>
  `;
}

function openModal(html) {
  const backdrop = document.querySelector('[data-cuotas-modal]');
  if (!backdrop) return;
  backdrop.innerHTML = html;
  backdrop.classList.add('is-open');
  backdrop.setAttribute('aria-hidden', 'false');
}

function closeModal() {
  const backdrop = document.querySelector('[data-cuotas-modal]');
  if (!backdrop) return;
  backdrop.classList.remove('is-open');
  backdrop.setAttribute('aria-hidden', 'true');
  window.setTimeout(() => { backdrop.innerHTML = ''; }, 180);
}

async function saveMemberForm(event) {
  event.preventDefault();
  if (!state.permisos.write) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form).entries());
  data.exento = form.exento.checked;
  const id = String(data.id || '').trim();

  try {
    setStatus('Guardando ficha de miembro...', true);
    await api(API_URL, { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) });
    closeModal();
    await loadCuotas(true);
    setStatus('Ficha guardada correctamente.', true);
  } catch (error) {
    setStatus(error.message || 'No fue posible guardar la ficha.', false);
  }
}

async function savePaymentForm(event) {
  event.preventDefault();
  if (!state.permisos.write) return;
  const form = event.currentTarget;
  const formData = new FormData(form);

  try {
    setStatus('Registrando pago...', true);
    await api(API_URL, { method: 'POST', body: formData, skipContentType: true });
    closeModal();
    await loadCuotas(true);
    setStatus('Pago registrado correctamente.', true);
  } catch (error) {
    setStatus(error.message || 'No fue posible registrar el pago.', false);
  }
}

function syncPaymentTypeAmount(event) {
  const form = event.currentTarget;
  if (event.target.name !== 'tipo_pago') return;
  const member = getMember(form.member_id.value);
  if (!member) return;
  if (form.tipo_pago.value === 'anual') {
    form.mes.value = '1';
    form.monto.value = Math.max(Number(member.saldoPendiente || 0), Number(member.cuotaAnualEsperada || 0));
  } else {
    form.monto.value = Number(member.cuotaMensual || 0);
  }
}

async function markAnnualPayment(member) {
  if (!member || !state.permisos.write) return;
  if (member.exento) {
    setStatus('El miembro está marcado como exento.', false);
    return;
  }

  const amount = Math.max(Number(member.saldoPendiente || 0), Number(member.cuotaAnualEsperada || 0));
  if (!amount) return;
  if (!confirm(`¿Registrar pago anual para ${member.nombre} por ${formatCLP(amount)}?`)) return;

  try {
    setStatus('Registrando pago anual...', true);
    await api(API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'payment', member_id: member.id, tipo_pago: 'anual', mes: 1, anio: state.anio, monto: amount, fecha_pago: new Date().toISOString().slice(0, 10), metodo_pago: 'transferencia', observacion: 'Pago anual completo registrado desde el panel.' })
    });
    await loadCuotas(true);
    setStatus('Pago anual registrado correctamente.', true);
  } catch (error) {
    setStatus(error.message || 'No fue posible registrar el pago anual.', false);
  }
}

async function deletePayment(paymentId) {
  if (!paymentId || !state.permisos.write) return;
  if (!confirm('¿Eliminar este pago? Esta acción no se puede deshacer.')) return;

  try {
    setStatus('Eliminando pago...', true);
    await api(`${API_URL}?payment_id=${encodeURIComponent(paymentId)}`, { method: 'DELETE' });
    closeModal();
    await loadCuotas(true);
    setStatus('Pago eliminado correctamente.', true);
  } catch (error) {
    setStatus(error.message || 'No fue posible eliminar el pago.', false);
  }
}

function exportExcel() {
  if (!state.permisos.export) return;
  const items = getFilteredMembers();
  const rows = items.map((member) => `
    <tr>
      <td>${escapeHTML(member.nombre)}</td><td>${escapeHTML(member.rut || '')}</td><td>${escapeHTML(member.correo || '')}</td><td>${escapeHTML(member.telefono || '')}</td>
      <td>${labelMemberState(member.estadoMiembro)}</td><td>${Number(member.cuotaMensual || 0)}</td><td>${Number(member.mesesPagados || 0)}</td><td>${Number(member.totalPagado || 0)}</td><td>${Number(member.saldoPendiente || 0)}</td><td>${labelPaymentStatus(member.estadoPago)}</td><td>${escapeHTML(member.observaciones || '')}</td>
    </tr>`).join('');
  const html = `<html><head><meta charset="UTF-8"></head><body><table><thead><tr><th>Nombre</th><th>RUT</th><th>Correo</th><th>Teléfono</th><th>Estado</th><th>Cuota mensual</th><th>Meses pagados</th><th>Total pagado</th><th>Saldo pendiente</th><th>Estado cuota anual</th><th>Observaciones</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
  downloadBlob(new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' }), `cuotas-miembros-${state.anio}.xls`);
}

async function generatePdfReport() {
  if (!state.permisos.export) return;
  try {
    await loadJsPDF();
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error('No fue posible cargar la librería PDF.');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const items = getFilteredMembers();
    const resumen = buildSummary(items);
    let y = 46;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Reporte de Cuotas de Miembros', 46, y);
    y += 20;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Agrupación Nothofagus · Año ${state.anio}`, 46, y);
    y += 28;
    const summaryLines = [`Miembros: ${resumen.totalMiembros}`, `Al día: ${resumen.alDia}`, `Atrasados: ${resumen.atrasados}`, `Anuales pagadas: ${resumen.cuotasAnualesPagadas}`, `Recaudado: ${formatCLP(resumen.totalRecaudado)}`, `Saldo pendiente: ${formatCLP(resumen.saldoPendiente)}`];
    summaryLines.forEach((line) => { doc.text(line, 46, y); y += 16; });
    y += 12;
    items.forEach((member) => {
      if (y > 760) { doc.addPage(); y = 46; }
      doc.setFont('helvetica', 'bold');
      doc.text(member.nombre || 'Sin nombre', 46, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`${labelMemberState(member.estadoMiembro)} · ${labelPaymentStatus(member.estadoPago)} · pagado ${formatCLP(member.totalPagado)} · saldo ${formatCLP(member.saldoPendiente)}`, 46, y + 14);
      y += 38;
    });
    doc.save(`reporte-cuotas-miembros-${state.anio}.pdf`);
  } catch (error) {
    setStatus(error.message || 'No fue posible generar el PDF.', false);
  }
}

function buildSummary(items) {
  return items.reduce((acc, item) => {
    acc.totalMiembros += 1;
    if (item.estadoPago === 'al_dia') acc.alDia += 1;
    if (item.estadoPago === 'atrasado') acc.atrasados += 1;
    if (item.estadoPago === 'pagada_anual') acc.cuotasAnualesPagadas += 1;
    acc.totalRecaudado += Number(item.totalPagado || 0);
    acc.saldoPendiente += Number(item.saldoPendiente || 0);
    return acc;
  }, { totalMiembros: 0, alDia: 0, atrasados: 0, cuotasAnualesPagadas: 0, totalRecaudado: 0, saldoPendiente: 0 });
}

async function api(url, options = {}) {
  if (!client) throw new Error('Supabase no está configurado.');
  const session = await client.auth.getSession();
  const token = session.data?.session?.access_token;
  if (!token) throw new Error('Sesión no disponible. Vuelve a iniciar sesión.');

  const response = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.skipContentType ? {} : { 'content-type': 'application/json; charset=utf-8' }),
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error de solicitud.');
  return data;
}

function getMember(id) {
  return state.miembros.find((member) => String(member.id) === String(id));
}

function option(value, current, label) {
  return `<option value="${value}" ${String(current || '') === value ? 'selected' : ''}>${label}</option>`;
}

function monthOptions(current) {
  return monthNames.slice(1).map((name, index) => `<option value="${index + 1}" ${index + 1 === Number(current) ? 'selected' : ''}>${name}</option>`).join('');
}

function badge(status) {
  return `<span class="cuotas-badge ${escapeAttr(status)}">${escapeHTML(labelPaymentStatus(status))}</span>`;
}

function labelPaymentStatus(status) {
  return { al_dia: 'Al día', atrasado: 'Atrasado', parcial: 'Parcial', pagada_anual: 'Pagada anual', exento: 'Exento' }[status] || 'Parcial';
}

function labelMemberState(status) {
  return { estudiante: 'Estudiante', trabajador: 'Trabajador', cesante: 'Cesante' }[status] || 'Estudiante';
}

function setStatus(message, ok) {
  const box = document.querySelector('[data-cuotas-status]');
  if (!box) return;
  box.textContent = message;
  box.classList.toggle('success', Boolean(ok));
  box.classList.toggle('error', !ok);
}

function formatCLP(value) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function loadJsPDF() {
  if (window.jspdf?.jsPDF) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-jspdf-loader]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
    script.defer = true;
    script.dataset.jspdfLoader = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('No fue posible cargar jsPDF.'));
    document.head.appendChild(script);
  });
}

function escapeHTML(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}
