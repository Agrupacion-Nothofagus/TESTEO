import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusCuotasBenefactores) return;
  window.__nothofagusCuotasBenefactores = true;

  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  const API_CUOTAS = '/api/cuotas-miembros';
  const API_MIEMBROS = '/api/miembros';
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const months = ['Pago anual', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const short = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const state = { year: currentYear, month: currentMonth, members: [], perms: { write: false }, loaded: false };

  loadStyles();
  mountView();
  mountMenu();
  bind();
  if (location.hash === '#tesoreria-benefactores') activate();

  function loadStyles() {
    [
      ['tesoreria-cuotas.css?v=20260706-base', 'cuotasBase'],
      ['tesoreria-cuotas-monthly-dashboard.css?v=20260706-monthly', 'cuotasMonthly'],
      ['tesoreria-cuotas-benefactores-layout.css?v=20260710-layout-ref', 'benefactorsLayoutRef']
    ].forEach(([href, key]) => {
      const existing = document.querySelector(`link[data-${key}]`);
      if (existing) {
        existing.href = href;
        return;
      }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset[key] = 'true';
      document.head.appendChild(link);
    });
  }

  function mountMenu() {
    const add = () => {
      const menu = document.querySelector('[data-tesoreria-menu]');
      if (!menu || document.querySelector('[data-tesoreria-open="benefactores"]')) return false;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'sidebar-link tesoreria-sidebar-link';
      button.dataset.tesoreriaOpen = 'benefactores';
      button.innerHTML = '<span>🌱</span>Cuotas benefactores';
      button.addEventListener('click', activate);
      menu.appendChild(button);
      return true;
    };
    if (add()) return;
    const observer = new MutationObserver(() => { if (add()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(add, 600);
    window.setTimeout(add, 1500);
  }

  function mountView() {
    const content = document.querySelector('.admin-content');
    if (!content || document.querySelector('#tesoreria-benefactores-view')) return;
    const section = document.createElement('section');
    section.className = 'admin-view tesoreria-view cuotas-view';
    section.id = 'tesoreria-benefactores-view';
    section.dataset.viewTitle = 'Cuotas de Socios Benefactores';
    section.dataset.viewDescription = 'Matriz mensual exclusiva para socios/as benefactores/as.';
    section.innerHTML = getTemplate();
    content.appendChild(section);
  }

  function getTemplate() {
    return `
      <div class="admin-panel cuotas-monthly-dashboard benefactors-reference-layout">
        <header class="cuotas-dashboard-header">
          <div>
            <p class="section-tag">Tesorería · Benefactores</p>
            <h3>Registro de Pagos Mensuales</h3>
            <p>Control y seguimiento de cuotas de socios/as benefactores/as.</p>
          </div>
          <div class="cuotas-header-actions">
            <label class="cuotas-year-pill"><span>📅</span><select data-b-year>${years()}</select></label>
            <button type="button" data-b-refresh>↻ Actualizar</button>
            <button type="button" data-b-nomina>＋ Nómina</button>
          </div>
        </header>

        <section class="benefactors-top-grid">
          <div class="benefactors-kpis" data-b-summary></div>
          <article class="cuotas-side-card benefactors-month-card" data-b-month-summary></article>
        </section>

        <section class="benefactors-middle-grid">
          <article class="cuotas-side-card cuotas-annual-summary-card" data-b-annual></article>
          <article class="cuotas-side-card cuotas-recent-card" data-b-recent></article>
          <article class="benefactors-nomina-card">
            <button type="button" class="benefactors-nomina-button" data-b-nomina>Nómina</button>
          </article>
        </section>

        <section class="benefactors-filter-row" aria-label="Filtros de benefactores">
          <label>Buscar<input type="search" data-b-search placeholder="Buscar benefactor/a..."></label>
          <label>Mes<select data-b-month>${monthOptions()}</select></label>
          <button type="button" class="secondary" data-b-clear>Limpiar filtros</button>
        </section>

        <p class="admin-status tesoreria-status" data-b-status aria-live="polite"></p>

        <section class="cuotas-table-card cuotas-monthly-matrix-card">
          <div class="cuotas-card-heading">
            <div>
              <h4>Matriz mensual de pagos por integrante</h4>
              <p>Estado mensual de cuotas: pagado, pendiente, atrasado o sin registro.</p>
            </div>
            <div class="cuotas-legend">
              <span><i class="status-dot pagado"></i>Pagado</span>
              <span><i class="status-dot pendiente"></i>Pendiente</span>
              <span><i class="status-dot atrasado"></i>Atrasado</span>
              <span><i class="status-dot sin_registro"></i>Sin registro</span>
            </div>
          </div>
          <div class="cuotas-table-wrap" data-b-table></div>
        </section>
      </div>
      <div class="cuotas-modal-backdrop" data-b-modal aria-hidden="true"></div>
    `;
  }

  function bind() {
    document.addEventListener('click', async (event) => {
      if (event.target.closest?.('[data-tesoreria-open="benefactores"]')) {
        event.preventDefault();
        await activate();
      }
      if (event.target.closest?.('[data-b-refresh]')) {
        event.preventDefault();
        await load(true);
      }
      if (event.target.closest?.('[data-b-clear]')) {
        event.preventDefault();
        const search = document.querySelector('[data-b-search]');
        if (search) search.value = '';
        render();
      }
      if (event.target.closest?.('[data-b-nomina]')) {
        event.preventDefault();
        openNomina();
      }
      if (event.target.matches?.('[data-b-modal]') || event.target.closest?.('[data-b-close]')) {
        event.preventDefault();
        closeModal();
      }
    }, true);

    document.addEventListener('input', (event) => {
      if (event.target.matches?.('[data-b-search]')) render();
    }, true);

    document.addEventListener('change', async (event) => {
      if (event.target.matches?.('[data-b-month]')) {
        state.month = Number(event.target.value || currentMonth);
        render();
      }
      if (event.target.matches?.('[data-b-year]')) {
        state.year = Number(event.target.value || currentYear);
        await load(true);
      }
    }, true);

    document.addEventListener('submit', async (event) => {
      const form = event.target.closest?.('[data-b-form]');
      if (!form) return;
      event.preventDefault();
      await saveNomina(form);
    }, true);
  }

  async function activate() {
    const view = document.querySelector('#tesoreria-benefactores-view');
    if (!view) return;
    openTreasury();
    document.querySelectorAll('.admin-view').forEach((item) => item.classList.toggle('is-active', item.id === 'tesoreria-benefactores-view'));
    document.querySelectorAll('.sidebar-nav .is-active').forEach((item) => item.classList.remove('is-active'));
    document.querySelector('[data-tesoreria-toggle]')?.classList.add('is-active');
    document.querySelector('[data-tesoreria-open="benefactores"]')?.classList.add('is-active');
    const title = document.querySelector('#admin-view-title');
    const description = document.querySelector('#admin-view-description');
    if (title) title.textContent = view.dataset.viewTitle;
    if (description) description.textContent = view.dataset.viewDescription;
    location.hash = 'tesoreria-benefactores';
    if (!state.loaded) await load(true);
  }

  async function load(force = false) {
    if (!force && state.loaded) return;
    setStatus('Cargando socios benefactores...', true);
    try {
      const [cuotas, miembros] = await Promise.all([api(`${API_CUOTAS}?anio=${encodeURIComponent(state.year)}`), api(API_MIEMBROS)]);
      state.perms = cuotas.permisos || state.perms;
      const emails = benefactorEmails(miembros.solicitudes || []);
      state.members = (cuotas.miembros || []).filter((member) => emails.has(email(member.correo)) && String(member.estadoCuenta || '').toLowerCase() !== 'inactivo');
      state.loaded = true;
      render();
      setStatus('Registro de pagos actualizado.', true);
    } catch (error) {
      state.loaded = false;
      setStatus(error.message || 'No fue posible cargar benefactores.', false);
      renderEmpty(error.message || 'No fue posible cargar benefactores.');
    }
  }

  function benefactorEmails(items) {
    const set = new Set();
    items.forEach((item) => {
      const itemEmail = email(item.correo);
      const estado = txt(item.estado);
      const estadoSocio = txt(item.estado_socio || item.estadoSocio || 'activo');
      const category = txt(item.categoria_socio || item.categoriaSocio || '');
      if (itemEmail && (estado === 'miembro' || estado === 'aceptado') && (!estadoSocio || estadoSocio === 'activo') && category.includes('benefactor')) set.add(itemEmail);
    });
    return set;
  }

  function render() {
    const items = filtered();
    const totals = summary(items);
    renderSummary(totals);
    renderTable(items);
    renderMonthSummary(totals);
    renderAnnual(totals);
    renderRecent(items);
  }

  function filtered() {
    const query = txt(document.querySelector('[data-b-search]')?.value || '');
    return state.members.filter((member) => !query || txt(`${member.nombre} ${member.correo} ${member.rut}`).includes(query));
  }

  function summary(items) {
    const cobrables = items.filter((member) => !member.exento);
    const esperado = cobrables.reduce((sum, member) => sum + Number(member.cuotaMensual || 0), 0);
    const recibido = items.reduce((sum, member) => sum + monthPayments(member, state.month).reduce((acc, payment) => acc + Number(payment.monto || 0), 0), 0);
    const total = items.reduce((sum, member) => sum + Number(member.totalPagado || 0), 0);
    const anual = cobrables.reduce((sum, member) => sum + Number(member.cuotaMensual || 0) * 12, 0);
    return { count: items.length, esperado, recibido, pendiente: Math.max(esperado - recibido, 0), total, anual, saldo: Math.max(anual - total, 0), pct: esperado ? Math.round((recibido / esperado) * 1000) / 10 : 0 };
  }

  function renderSummary(totals) {
    const box = document.querySelector('[data-b-summary]');
    if (!box) return;
    box.innerHTML = [
      kpi('Total integrantes activos', totals.count, 'Socios/as benefactores/as', '👥'),
      kpi('Ingresos mensuales esperados', money(totals.esperado), 'Según estado del mes', '💵'),
      kpi('Ingresos recibidos en el mes', money(totals.recibido), `${totals.pct}% del esperado`, '✅')
    ].join('');
  }

  function renderTable(items) {
    const box = document.querySelector('[data-b-table]');
    if (!box) return;
    if (!items.length) {
      box.innerHTML = '<p class="cuotas-empty">No hay socios/as benefactores/as para mostrar.</p>';
      return;
    }
    box.innerHTML = `
      <table class="cuotas-monthly-table">
        <thead><tr><th>Integrante</th><th>Estado</th><th>Cuota mensual</th>${short.map((label) => `<th>${label}</th>`).join('')}<th>Total pagado</th><th>Saldo pendiente</th></tr></thead>
        <tbody>${items.map(row).join('')}</tbody>
      </table>`;
  }

  function row(member) {
    return `<tr><td data-label="Integrante"><div class="cuotas-member-name"><span class="avatar-mini">${initials(member.nombre)}</span><div><strong>${esc(member.nombre)}</strong><small>${esc(member.correo || 'Sin correo')} · Socio/a benefactor/a</small></div></div></td><td data-label="Estado"><span class="cuotas-member-state">${memberState(member.estadoMiembro)}</span></td><td data-label="Cuota mensual"><strong>${money(member.cuotaMensual)}</strong></td>${Array.from({ length: 12 }, (_, index) => cell(member, index + 1)).join('')}<td data-label="Total pagado"><strong>${money(member.totalPagado)}</strong></td><td data-label="Saldo pendiente"><strong class="saldo-value">${money(member.saldoPendiente)}</strong></td></tr>`;
  }

  function cell(member, month) {
    const current = status(member, month);
    const payment = monthPayment(member, month);
    const title = `${months[month]} · ${monthState(current)}${payment ? ` · ${money(payment.monto)}` : ''}`;
    return `<td data-label="${short[month - 1]}" class="month-cell"><span class="payment-status-dot ${escAttr(current)}" title="${escAttr(title)}"></span></td>`;
  }

  function renderMonthSummary(totals) {
    const box = document.querySelector('[data-b-month-summary]');
    if (!box) return;
    box.innerHTML = `<h4>Resumen del mes</h4><p class="cuotas-side-date">📅 ${esc(months[state.month])} ${state.year}</p><dl class="cuotas-side-list"><div><dt>Esperado</dt><dd>${money(totals.esperado)}</dd></div><div><dt>Recibido</dt><dd class="positive">${money(totals.recibido)}</dd></div><div><dt>Pendiente</dt><dd class="warning">${money(totals.pendiente)}</dd></div><div><dt>% Cumplimiento</dt><dd>${totals.pct}%</dd></div></dl><div class="cuotas-progress"><span style="width:${Math.min(totals.pct, 100)}%"></span></div>`;
  }

  function renderAnnual(totals) {
    const box = document.querySelector('[data-b-annual]');
    if (!box) return;
    box.innerHTML = `<h4>Resumen anual</h4><div class="cuotas-chart-fake"><span style="height:78%"></span><span style="height:68%"></span><span style="height:72%"></span><span style="height:70%"></span><span style="height:76%"></span><span style="height:74%"></span></div><div class="cuotas-annual-bars"><div><span>Esperado anual</span><strong>${money(totals.anual)}</strong></div><div><span>Recaudado anual</span><strong>${money(totals.total)}</strong></div><div><span>Saldo pendiente anual</span><strong>${money(totals.saldo)}</strong></div></div>`;
  }

  function renderRecent(items) {
    const box = document.querySelector('[data-b-recent]');
    if (!box) return;
    const payments = items.flatMap((member) => (member.pagos || []).map((payment) => ({ ...payment, nombre: member.nombre }))).sort((a, b) => String(b.fechaPago || '').localeCompare(String(a.fechaPago || ''))).slice(0, 5);
    box.innerHTML = `<h4>Últimos movimientos</h4><div class="cuotas-recent-list">${payments.length ? payments.map((payment) => `<article><span class="recent-icon">↗</span><div><strong>${payment.tipoPago === 'anual' ? 'Cuota anual' : 'Pago mensual'} - ${esc(payment.nombre)}</strong><small>${esc(months[Number(payment.mes || 0)] || 'Pago')}</small></div><em>+${money(payment.monto)}</em></article>`).join('') : '<p class="cuotas-empty compact">No hay movimientos registrados.</p>'}</div>`;
  }

  function openNomina() {
    const modal = document.querySelector('[data-b-modal]');
    if (!modal) return;
    const disabled = state.perms.write ? '' : 'disabled';
    modal.innerHTML = `<section class="cuotas-modal cuotas-nomina-modal"><div class="cuotas-modal-header"><div><p class="section-tag">Tesorería · Benefactores</p><h3>Nómina de socios benefactores</h3><p>Edición separada para la categoría benefactor.</p></div><button type="button" class="cuotas-modal-close" data-b-close>×</button></div><form class="cuotas-nomina-form" data-b-form><div class="cuotas-nomina-table-wrap"><table class="cuotas-nomina-table"><thead><tr><th>Benefactor/a</th><th>Estado</th><th>Cuota mensual</th><th>Cuenta</th><th>Exento</th><th>Teléfono</th><th>Correo</th><th>Observaciones</th></tr></thead><tbody>${state.members.length ? state.members.map((member) => nominaRow(member, disabled)).join('') : '<tr><td colspan="8">No hay socios/as benefactores/as activos/as.</td></tr>'}</tbody></table></div><p class="cuotas-nomina-status" data-b-form-status></p><div class="cuotas-nomina-actions"><button type="button" class="secondary" data-b-close>Cerrar</button>${state.perms.write ? '<button type="submit">Guardar nómina</button>' : ''}</div></form></section>`;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function nominaRow(member, disabled) {
    return `<tr data-b-row="${escAttr(member.id)}"><td class="cuotas-nomina-persona"><strong>${esc(member.nombre)}</strong><small>Socio/a benefactor/a<input type="hidden" data-field="anio" value="${escAttr(member.anio || state.year)}"></small></td><td><select data-field="estado_miembro" ${disabled}>${option('estudiante', member.estadoMiembro, 'Estudiante')}${option('trabajador', member.estadoMiembro, 'Trabajador')}${option('cesante', member.estadoMiembro, 'Cesante')}</select></td><td><input type="number" min="0" step="1" data-field="cuota_mensual" value="${escAttr(member.cuotaMensual || 0)}" ${disabled}></td><td><select data-field="estado_cuenta" ${disabled}>${option('activo', member.estadoCuenta, 'Activo')}${option('inactivo', member.estadoCuenta, 'Inactivo')}</select></td><td><label class="cuotas-nomina-exento"><input type="checkbox" data-field="exento" ${member.exento ? 'checked' : ''} ${disabled}> Sí</label></td><td><input data-field="telefono" value="${escAttr(member.telefono || '')}" ${disabled}></td><td><input type="email" data-field="correo" value="${escAttr(member.correo || '')}" ${disabled}></td><td><input data-field="observaciones" value="${escAttr(member.observaciones || '')}" ${disabled}></td></tr>`;
  }

  async function saveNomina(form) {
    try {
      setFormStatus('Guardando nómina...', true);
      for (const rowElement of Array.from(form.querySelectorAll('[data-b-row]'))) await api(API_CUOTAS, { method: 'PATCH', body: JSON.stringify(payload(rowElement)) });
      setFormStatus('Nómina actualizada.', true);
      await load(true);
      window.setTimeout(closeModal, 650);
    } catch (error) {
      setFormStatus(error.message || 'No fue posible guardar.', false);
    }
  }

  function payload(rowElement) {
    const field = (name) => rowElement.querySelector(`[data-field="${name}"]`);
    return { id: rowElement.dataset.bRow, estado_miembro: field('estado_miembro')?.value || 'estudiante', estado_cuenta: field('estado_cuenta')?.value || 'activo', cuota_mensual: Number(field('cuota_mensual')?.value || 0), anio: Number(field('anio')?.value || state.year), telefono: field('telefono')?.value?.trim() || '', correo: field('correo')?.value?.trim() || '', observaciones: field('observaciones')?.value?.trim() || '', exento: Boolean(field('exento')?.checked) };
  }

  function closeModal() {
    const modal = document.querySelector('[data-b-modal]');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => { modal.innerHTML = ''; }, 160);
  }

  async function api(url, options = {}) {
    if (!client) throw new Error('Supabase no está configurado.');
    const session = await client.auth.getSession();
    const token = session.data?.session?.access_token;
    if (!token) throw new Error('Sesión no disponible.');
    const response = await fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Error de solicitud.');
    return data;
  }

  function status(member, month) { if (member.exento || member.estadoCuenta === 'inactivo') return 'sin_registro'; if ((member.pagos || []).some((payment) => payment.tipoPago === 'anual' || Number(payment.mes) === 0)) return 'pagado'; if (monthPayment(member, month)) return 'pagado'; if (state.year < currentYear) return 'atrasado'; if (state.year > currentYear) return 'pendiente'; return month < currentMonth ? 'atrasado' : 'pendiente'; }
  function monthPayment(member, month) { return (member.pagos || []).find((payment) => Number(payment.mes) === month && payment.tipoPago !== 'anual'); }
  function monthPayments(member, month) { return (member.pagos || []).filter((payment) => Number(payment.mes) === month && payment.tipoPago !== 'anual'); }
  function years() { return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((year) => `<option value="${year}" ${year === state.year ? 'selected' : ''}>${year}</option>`).join(''); }
  function monthOptions() { return months.slice(1).map((month, index) => `<option value="${index + 1}" ${index + 1 === state.month ? 'selected' : ''}>${month}</option>`).join(''); }
  function option(value, current, label) { return `<option value="${escAttr(value)}" ${String(current || '') === String(value) ? 'selected' : ''}>${esc(label)}</option>`; }
  function openTreasury() { const menu = document.querySelector('[data-tesoreria-menu]'); const toggle = document.querySelector('[data-tesoreria-toggle]'); if (menu) { menu.classList.remove('is-collapsed'); menu.style.maxHeight = '520px'; menu.style.opacity = '1'; menu.style.pointerEvents = 'auto'; } if (toggle) { toggle.classList.add('is-open'); toggle.setAttribute('aria-expanded', 'true'); } }
  function setStatus(message, ok) { const box = document.querySelector('[data-b-status]'); if (box) { box.textContent = message; box.classList.toggle('success', Boolean(ok)); box.classList.toggle('error', !ok); } }
  function setFormStatus(message, ok) { const box = document.querySelector('[data-b-form-status]'); if (box) { box.textContent = message; box.classList.toggle('success', Boolean(ok)); box.classList.toggle('error', !ok); } }
  function renderEmpty(message) { const box = document.querySelector('[data-b-table]'); if (box) box.innerHTML = `<p class="cuotas-empty">${esc(message)}</p>`; }
  function kpi(label, value, note, icon) { return `<article class="cuotas-kpi-card"><i>${esc(icon)}</i><div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div></article>`; }
  function memberState(value) { return { estudiante: 'Estudiante', trabajador: 'Trabajador', cesante: 'Cesante' }[value] || 'Estudiante'; }
  function monthState(value) { return { pagado: 'Pagado', pendiente: 'Pendiente', atrasado: 'Atrasado', sin_registro: 'Sin registro' }[value] || 'Sin registro'; }
  function initials(value = '') { return String(value).trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'B'; }
  function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
  function txt(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase(); }
  function email(value) { return String(value || '').trim().toLowerCase(); }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }
  function escAttr(value) { return esc(value); }
})();
