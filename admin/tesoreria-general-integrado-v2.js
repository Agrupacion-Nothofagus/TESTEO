import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const currentYear = new Date().getFullYear();
const state = { year: currentYear, loading: false, movimientos: [], cuotas: emptyCuotas() };

if (!window.__nothofagusTesoreriaGeneralIntegradoV2) {
  window.__nothofagusTesoreriaGeneralIntegradoV2 = true;
  initFinanceDashboard();
}

function initFinanceDashboard() {
  loadStyle('tesoreria-general-integrado.css');
  waitFor('#tesoreria-general-view').then(() => {
    installIntegratedUi();
    refreshFinanceDashboard();
  });
}

function loadStyle(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function waitFor(selector) {
  return new Promise((resolve) => {
    const current = document.querySelector(selector);
    if (current) return resolve(current);
    const observer = new MutationObserver(() => {
      const next = document.querySelector(selector);
      if (!next) return;
      observer.disconnect();
      resolve(next);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function installIntegratedUi() {
  const view = document.querySelector('#tesoreria-general-view');
  if (!view || view.dataset.integratedFinanceV2 === 'true') return;
  view.dataset.integratedFinanceV2 = 'true';

  const actions = view.querySelector('.tesoreria-actions-row');
  if (actions) {
    actions.classList.add('integrated-finance-actions');
    actions.insertAdjacentHTML('afterbegin', `
      <label class="integrated-finance-year">Año financiero
        <select data-finance-year>${yearOptions()}</select>
      </label>
    `);
    actions.insertAdjacentHTML('beforeend', '<button type="button" data-finance-open-cuotas>Ver cuotas</button>');
    actions.insertAdjacentHTML('beforeend', '<button type="button" data-finance-refresh>Actualizar estado</button>');
  }

  const grid = view.querySelector('.tesoreria-summary-grid');
  if (grid) {
    grid.classList.add('integrated-finance-grid');
    grid.innerHTML = `
      <article class="tesoreria-summary-card ingresos integrated-finance-card"><span>Ingresos generales</span><strong data-finance-total="ingresos-manuales">$0</strong></article>
      <article class="tesoreria-summary-card ingresos integrated-finance-card"><span>Cuotas recaudadas</span><strong data-finance-total="cuotas-recaudadas">$0</strong></article>
      <article class="tesoreria-summary-card ingresos integrated-finance-card"><span>Total ingresos</span><strong data-finance-total="ingresos-total">$0</strong></article>
      <article class="tesoreria-summary-card egresos integrated-finance-card"><span>Total egresos</span><strong data-finance-total="egresos">$0</strong></article>
      <article class="tesoreria-summary-card saldo integrated-finance-card" data-finance-saldo-card><span>Saldo disponible</span><strong data-finance-total="saldo">$0</strong></article>
      <article class="tesoreria-summary-card saldo integrated-finance-card"><span>Saldo cuotas pendiente</span><strong data-finance-total="cuotas-pendientes">$0</strong></article>
    `;
  }

  const firstListCard = view.querySelector('.tesoreria-list-card');
  if (firstListCard) {
    firstListCard.insertAdjacentHTML('beforebegin', `
      <p class="integrated-finance-note" data-finance-note>El saldo disponible se calcula integrando ingresos generales, cuotas de miembros y egresos del año seleccionado.</p>
      <section class="tesoreria-list-card">
        <h4>Estado de cuotas de miembros</h4>
        <div class="integrated-finance-breakdown" data-finance-cuotas-breakdown></div>
      </section>
    `);
    const title = firstListCard.querySelector('h4');
    if (title) title.textContent = 'Últimos movimientos generales del año';
  }

  view.querySelector('[data-finance-year]')?.addEventListener('change', (event) => {
    state.year = Number(event.target.value || currentYear);
    refreshFinanceDashboard();
  });
  view.querySelector('[data-finance-open-cuotas]')?.addEventListener('click', () => document.querySelector('[data-tesoreria-open="cuotas"]')?.click());
  view.querySelector('[data-finance-refresh]')?.addEventListener('click', refreshFinanceDashboard);

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-tesoreria-open="general"], [data-tesoreria-go="general"]')) window.setTimeout(refreshFinanceDashboard, 180);
  }, true);
}

function yearOptions() {
  return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]
    .map((year) => `<option value="${year}" ${year === state.year ? 'selected' : ''}>${year}</option>`)
    .join('');
}

async function refreshFinanceDashboard() {
  if (state.loading) return;
  state.loading = true;
  setNote('Actualizando estado financiero integrado...', false);
  try {
    const [tesoreria, cuotas] = await Promise.all([
      request('/api/tesoreria'),
      request(`/api/cuotas-miembros?anio=${encodeURIComponent(state.year)}`)
    ]);
    state.movimientos = Array.isArray(tesoreria.movimientos) ? tesoreria.movimientos.filter(Boolean) : [];
    state.cuotas = normalizeCuotas(cuotas.resumen || {});
    renderFinanceDashboard();
    setNote(buildNote(), possibleDuplicateDuesAmount() > 0);
  } catch (error) {
    setNote(error.message || 'No fue posible actualizar el estado financiero integrado.', true);
  } finally {
    state.loading = false;
  }
}

async function request(path) {
  if (!client) throw new Error('Supabase no está configurado.');
  const session = await client.auth.getSession();
  const token = session.data?.session?.access_token;
  if (!token) throw new Error('Sesión no disponible. Vuelve a iniciar sesión.');
  const response = await fetch(path, { headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error al consultar Tesorería.');
  return data;
}

function renderFinanceDashboard() {
  const items = movementsForSelectedYear();
  const ingresosGenerales = sum(items.filter((item) => item.tipo === 'ingreso'));
  const egresos = sum(items.filter((item) => item.tipo === 'egreso'));
  const cuotasRecaudadas = Number(state.cuotas.totalRecaudado || 0);
  const totalIngresos = ingresosGenerales + cuotasRecaudadas;
  const saldo = totalIngresos - egresos;

  setText('[data-finance-total="ingresos-manuales"]', formatCLP(ingresosGenerales));
  setText('[data-finance-total="cuotas-recaudadas"]', formatCLP(cuotasRecaudadas));
  setText('[data-finance-total="ingresos-total"]', formatCLP(totalIngresos));
  setText('[data-finance-total="egresos"]', formatCLP(egresos));
  setText('[data-finance-total="saldo"]', formatCLP(saldo));
  setText('[data-finance-total="cuotas-pendientes"]', formatCLP(state.cuotas.saldoPendiente || 0));
  document.querySelector('[data-finance-saldo-card]')?.classList.toggle('negative', saldo < 0);

  renderCuotasBreakdown();
  renderMovements(items);
}

function renderCuotasBreakdown() {
  const box = document.querySelector('[data-finance-cuotas-breakdown]');
  if (!box) return;
  box.innerHTML = `
    <article><strong>${Number(state.cuotas.totalMiembros || 0)}</strong><span>Miembros registrados</span></article>
    <article><strong>${Number(state.cuotas.alDia || 0)}</strong><span>Al día</span></article>
    <article><strong>${Number(state.cuotas.atrasados || 0)}</strong><span>Atrasados</span></article>
    <article><strong>${Number(state.cuotas.cuotasAnualesPagadas || 0)}</strong><span>Cuotas anuales pagadas</span></article>
    <article><strong>${formatCLP(state.cuotas.totalRecaudado || 0)}</strong><span>Recaudado por cuotas</span></article>
    <article><strong>${formatCLP(state.cuotas.saldoPendiente || 0)}</strong><span>Saldo pendiente</span></article>
  `;
}

function renderMovements(items) {
  const list = document.querySelector('#tesoreria-general-view [data-tesoreria-list="general"]');
  if (!list) return;
  const latest = items.slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))).slice(0, 8);
  if (!latest.length) {
    list.innerHTML = '<p class="tesoreria-empty">No hay movimientos generales registrados para el año seleccionado.</p>';
    return;
  }
  list.innerHTML = latest.map((item) => `
    <article class="integrated-finance-movement ${escapeAttr(item.tipo)}">
      <small>${formatDate(item.fecha)}</small>
      <strong>${escapeHTML(item.descripcion || 'Movimiento sin descripción')}</strong>
      <em>${item.tipo === 'egreso' ? '-' : '+'}${formatCLP(item.monto)}</em>
      <span class="integrated-finance-pill">${item.tipo === 'egreso' ? 'Egreso' : 'Ingreso general'}</span>
    </article>
  `).join('');
}

function movementsForSelectedYear() {
  return state.movimientos.filter((item) => Number(getYearFromDate(item.fecha)) === Number(state.year));
}

function getYearFromDate(value) {
  if (!value) return currentYear;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? currentYear : date.getFullYear();
}

function sum(items) {
  return items.reduce((total, item) => total + Number(item.monto || 0), 0);
}

function buildNote() {
  const duplicate = possibleDuplicateDuesAmount();
  if (duplicate > 0) return `Estado integrado actualizado para ${state.year}. Advertencia: se detectaron ${formatCLP(duplicate)} en ingresos generales que parecen cuotas. Revísalos para evitar duplicar la recaudación de “Cuotas de miembros”.`;
  return `Estado integrado actualizado para ${state.year}. Fórmula: ingresos generales + cuotas recaudadas - egresos.`;
}

function possibleDuplicateDuesAmount() {
  return movementsForSelectedYear()
    .filter((item) => item.tipo === 'ingreso' && looksLikeManualDue(item.descripcion))
    .reduce((total, item) => total + Number(item.monto || 0), 0);
}

function looksLikeManualDue(description) {
  const text = normalizeText(description);
  return ['cuota', 'cuotas', 'socio', 'socia', 'socios', 'mensualidad', 'pago mensual', 'pago anual'].some((token) => text.includes(token));
}

function normalizeCuotas(resumen = {}) {
  return {
    totalMiembros: Number(resumen.totalMiembros || 0),
    alDia: Number(resumen.alDia || 0),
    atrasados: Number(resumen.atrasados || 0),
    cuotasAnualesPagadas: Number(resumen.cuotasAnualesPagadas || 0),
    totalRecaudado: Number(resumen.totalRecaudado || 0),
    saldoPendiente: Number(resumen.saldoPendiente || 0)
  };
}

function emptyCuotas() {
  return { totalMiembros: 0, alDia: 0, atrasados: 0, cuotasAnualesPagadas: 0, totalRecaudado: 0, saldoPendiente: 0 };
}

function setNote(message, warning) {
  const note = document.querySelector('[data-finance-note]');
  if (!note) return;
  note.textContent = message;
  note.classList.toggle('warning', Boolean(warning));
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
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

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeHTML(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}
