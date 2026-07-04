import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const API_TESORERIA = '/api/tesoreria';
const API_CUOTAS = '/api/cuotas-miembros';
const CURRENT_YEAR = new Date().getFullYear();
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const state = {
  year: CURRENT_YEAR,
  loading: false,
  movimientos: [],
  cuotas: emptyCuotas()
};

if (!window.__nothofagusTesoreriaGeneralIntegrado) {
  window.__nothofagusTesoreriaGeneralIntegrado = true;
  initIntegratedFinance();
}

function initIntegratedFinance() {
  loadStylesheet('tesoreria-general-integrado.css');
  waitForGeneralView().then(() => {
    setupGeneralView();
    refreshIntegratedFinance();
  });
}

function loadStylesheet(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function waitForGeneralView() {
  return new Promise((resolve) => {
    const view = document.querySelector('#tesoreria-general-view');
    if (view) return resolve(view);

    const observer = new MutationObserver(() => {
      const created = document.querySelector('#tesoreria-general-view');
      if (!created) return;
      observer.disconnect();
      resolve(created);
    });

    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function setupGeneralView() {
  const view = document.querySelector('#tesoreria-general-view');
  if (!view || view.dataset.integratedFinanceReady === 'true') return;
  view.dataset.integratedFinanceReady = 'true';

  const actions = view.querySelector('.tesoreria-actions-row');
  if (actions) {
    actions.classList.add('integrated-finance-actions');
    if (!actions.querySelector('[data-finance-year]')) {
      actions.insertAdjacentHTML('afterbegin', `
        <label class="integrated-finance-year">Año financiero
          <select data-finance-year>${yearOptions()}</select>
        </label>
      `);
    }
    if (!actions.querySelector('[data-finance-open-cuotas]')) {
      actions.insertAdjacentHTML('beforeend', '<button type="button" data-finance-open-cuotas>Ver cuotas</button>');
    }
    if (!actions.querySelector('[data-finance-refresh]')) {
      actions.insertAdjacentHTML('beforeend', '<button type="button" data-finance-refresh>Actualizar estado</button>');
    }
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
  if (firstListCard && !view.querySelector('[data-finance-cuotas-breakdown]')) {
    firstListCard.insertAdjacentHTML('beforebegin', `
      <p class="integrated-finance-note" data-finance-note>El saldo disponible se calcula integrando ingresos generales, cuotas de miembros y egresos.</p>
      <section class="tesoreria-list-card">
        <h4>Estado de cuotas de miembros</h4>
        <div class="integrated-finance-breakdown" data-finance-cuotas-breakdown></div>
      </section>
    `);
    firstListCard.querySelector('h4').textContent = 'Últimos movimientos generales';
  }

  view.querySelector('[data-finance-year]')?.addEventListener('change', (event) => {
    state.year = Number(event.target.value || CURRENT_YEAR);
    refreshIntegratedFinance();
  });

  view.querySelector('[data-finance-open-cuotas]')?.addEventListener('click', () => {
    document.querySelector('[data-tesoreria-open="cuotas"]')?.click();
  });

  view.querySelector('[data-finance-refresh]')?.addEventListener('click', () => refreshIntegratedFinance());

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-tesoreria-open="general"], [data-tesoreria-go="general"]')) {
      window.setTimeout(refreshIntegratedFinance, 180);
    }
  }, true);

  window.addEventListener('nothofagus:cuotas-updated', (event) => {
    const detail = event.detail || {};
    if (Number(detail.anio || state.year) !== Number(state.year)) return;
    state.cuotas = normalizeCuotas(detail.resumen || {});
    renderIntegratedFinance();
  });
}

function yearOptions() {
  return [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]
    .map((year) => `<option value="${year}" ${year === state.year ? 'selected' : ''}>${year}</option>`)
    .join('');
}

async function refreshIntegratedFinance() {
  if (state.loading) return;
  state.loading = true;
  setIntegratedNote('Actualizando estado financiero integrado...', false);

  try {
    const [tesoreriaData, cuotasData] = await Promise.all([
      api(API_TESORERIA),
      api(`${API_CUOTAS}?anio=${encodeURIComponent(state.year)}`)
    ]);

    state.movimientos = Array.isArray(tesoreriaData.movimientos) ? tesoreriaData.movimientos.filter(Boolean) : [];
    state.cuotas = normalizeCuotas(cuotasData.resumen || {});
    renderIntegratedFinance();
    setIntegratedNote(buildPrecisionNote(), hasPossibleDuplicateDues());
  } catch (error) {
    setIntegratedNote(error.message || 'No fue posible actualizar el estado financiero integrado.', true);
  } finally {
    state.loading = false;
  }
}

async function api(path) {
  if (!client) throw new Error('Supabase no está configurado.');
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sesión no disponible. Vuelve a iniciar sesión.');

  const response = await fetch(path, {
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8'
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Error al consultar Tesorería.');
  return payload;
}

function renderIntegratedFinance() {
  const summary = buildIntegratedSummary();

  setText('[data-finance-total="ingresos-manuales"]', formatCLP(summary.ingresosManuales));
  setText('[data-finance-total="cuotas-recaudadas"]', formatCLP(summary.cuotasRecaudadas));
  setText('[data-finance-total="ingresos-total"]', formatCLP(summary.ingresosTotal));
  setText('[data-finance-total="egresos"]', formatCLP(summary.egresos));
  setText('[data-finance-total="saldo"]', formatCLP(summary.saldo));
  setText('[data-finance-total="cuotas-pendientes"]', formatCLP(summary.cuotasPendientes));
  document.querySelector('[data-finance-saldo-card]')?.classList.toggle('negative', summary.saldo < 0);

  renderCuotasBreakdown();
  renderIntegratedMovements();
}

function buildIntegratedSummary() {
  const ingresosManuales = state.movimientos
    .filter((item) => item.tipo === 'ingreso')
    .reduce((sum, item) => sum + Number(item.monto || 0), 0);
  const egresos = state.movimientos
    .filter((item) => item.tipo === 'egreso')
    .reduce((sum, item) => sum + Number(item.monto || 0), 0);
  const cuotasRecaudadas = Number(state.cuotas.totalRecaudado || 0);
  const ingresosTotal = ingresosManuales + cuotasRecaudadas;
  const saldo = ingresosTotal - egresos;

  return {
    ingresosManuales,
    egresos,
    cuotasRecaudadas,
    ingresosTotal,
    saldo,
    cuotasPendientes: Number(state.cuotas.saldoPendiente || 0)
  };
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

function renderIntegratedMovements() {
  const list = document.querySelector('#tesoreria-general-view [data-tesoreria-list="general"]');
  if (!list) return;

  const items = state.movimientos
    .slice()
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
    .slice(0, 8);

  if (!items.length) {
    list.innerHTML = '<p class="tesoreria-empty">No hay movimientos generales registrados.</p>';
    return;
  }

  list.innerHTML = items.map((item) => `
    <article class="integrated-finance-movement ${escapeAttr(item.tipo)}">
      <small>${formatDate(item.fecha)}</small>
      <strong>${escapeHTML(item.descripcion || 'Movimiento sin descripción')}</strong>
      <em>${item.tipo === 'egreso' ? '-' : '+'}${formatCLP(item.monto)}</em>
      <span class="integrated-finance-pill">${item.tipo === 'egreso' ? 'Egreso' : 'Ingreso general'}</span>
    </article>
  `).join('');
}

function buildPrecisionNote() {
  const duplicateAmount = possibleDuplicateDuesAmount();
  if (duplicateAmount > 0) {
    return `Estado integrado actualizado. Advertencia: se detectaron ${formatCLP(duplicateAmount)} en ingresos manuales que parecen cuotas. Revísalos para no duplicar la recaudación registrada en “Cuotas de miembros”.`;
  }
  return 'Estado integrado actualizado. El saldo disponible se calcula como ingresos generales + cuotas recaudadas - egresos.';
}

function hasPossibleDuplicateDues() {
  return possibleDuplicateDuesAmount() > 0;
}

function possibleDuplicateDuesAmount() {
  return state.movimientos
    .filter((item) => item.tipo === 'ingreso' && looksLikeManualDue(item.descripcion))
    .reduce((sum, item) => sum + Number(item.monto || 0), 0);
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

function setIntegratedNote(message, warning) {
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
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function escapeHTML(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}
