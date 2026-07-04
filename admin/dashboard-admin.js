import './sidebar-safe-clicks.js?v=20260703-safe-clicks';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_TABLE_PUBLICACIONES, supabaseConfigurado } from '../scripts/supabase-config.js';

const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const CURRENT_YEAR = new Date().getFullYear();

initSafeDashboard();

function initSafeDashboard() {
  const hero = document.querySelector('#dashboard-view .dashboard-hero-card');
  if (hero) {
    hero.remove();
  }

  const heroWrap = document.querySelector('#dashboard-view .dashboard-hero');
  if (heroWrap) {
    heroWrap.classList.add('dashboard-hero-compact');
  }

  ensureTreasuryDashboardBlocks();

  document.querySelectorAll('[data-dashboard-open-view]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelector('[data-admin-view="' + button.dataset.dashboardOpenView + '"]')?.click();
    });
  });

  loadDashboardData();
}

function ensureTreasuryDashboardBlocks() {
  ensureTreasuryQuickActions();
  ensureTreasuryStats();
  ensureTreasuryWidget();
}

function ensureTreasuryQuickActions() {
  const quickActions = document.querySelector('#dashboard-view .dashboard-quick-actions');
  if (!quickActions || quickActions.querySelector('[data-dashboard-open-view="tesoreria-general-view"]')) return;

  quickActions.insertAdjacentHTML('beforeend', `
    <button type="button" class="dashboard-action-button" data-dashboard-open-view="tesoreria-general-view">Tesorería general</button>
    <button type="button" class="dashboard-action-button" data-dashboard-open-view="tesoreria-cuotas-view">Cuotas de miembros</button>
  `);
}

function ensureTreasuryStats() {
  const grid = document.querySelector('#dashboard-view .dashboard-stats-grid');
  if (!grid || grid.querySelector('[data-dashboard-total="tesoreria-saldo"]')) return;

  grid.insertAdjacentHTML('beforeend', `
    <article class="dashboard-stat-card dashboard-treasury-stat">
      <span>Ingresos</span>
      <strong data-dashboard-total="tesoreria-ingresos">—</strong>
      <small>Ingresos generales del año ${CURRENT_YEAR}.</small>
    </article>
    <article class="dashboard-stat-card dashboard-treasury-stat">
      <span>Egresos</span>
      <strong data-dashboard-total="tesoreria-egresos">—</strong>
      <small>Egresos generales del año ${CURRENT_YEAR}.</small>
    </article>
    <article class="dashboard-stat-card dashboard-treasury-stat">
      <span>Saldo</span>
      <strong data-dashboard-total="tesoreria-saldo">—</strong>
      <small>Ingresos menos egresos, incluyendo cuotas registradas.</small>
    </article>
  `);
}

function ensureTreasuryWidget() {
  const grid = document.querySelector('#dashboard-view .dashboard-content-grid');
  if (!grid || grid.querySelector('[data-dashboard-treasury-summary]')) return;

  grid.insertAdjacentHTML('beforeend', `
    <article class="dashboard-widget dashboard-treasury-widget">
      <div class="dashboard-widget-heading">
        <h4>Tesorería</h4>
        <span>${CURRENT_YEAR}</span>
      </div>
      <div class="dashboard-treasury-summary" data-dashboard-treasury-summary>
        <p class="dashboard-empty">Cargando resumen de tesorería...</p>
      </div>
    </article>
  `);
}

async function loadDashboardData() {
  const status = document.querySelector('[data-dashboard-status]');
  setStatus(status, 'Cargando panel de control...', true);

  if (!client) {
    setStatus(status, 'Supabase no está configurado.', false);
    return;
  }

  const session = await client.auth.getSession();
  const token = session.data?.session?.access_token;

  if (!token) {
    setStatus(status, 'Sesión no disponible. Inicia sesión nuevamente.', false);
    return;
  }

  await Promise.allSettled([
    loadPublications(),
    loadMembers(token),
    loadUsers(token),
    loadTreasury(token)
  ]);

  setMetric('visitas', '—');
  setStatus(status, 'Panel de control actualizado.', true);
}

async function loadPublications() {
  const response = await client.from(SUPABASE_TABLE_PUBLICACIONES).select('titulo, estado, categoria, fecha').order('fecha', { ascending: false });
  if (response.error) return;

  const posts = response.data || [];
  const publicadas = posts.filter((item) => item.estado === 'publicado').length;
  const borradores = posts.filter((item) => item.estado !== 'publicado').length;

  setMetric('publicaciones', posts.length);
  setMetric('publicadas', publicadas);
  setMetric('borradores', borradores);
  renderLatest(posts.slice(0, 4));
}

async function loadMembers(token) {
  const response = await fetch('/api/miembros', { headers: { authorization: 'Bearer ' + token } });
  if (!response.ok) return;

  const data = await response.json().catch(() => ({}));
  const items = data.solicitudes || [];
  const miembro = items.filter((item) => item.estado === 'miembro').length;
  const pendiente = items.filter((item) => item.estado === 'pendiente').length;
  const contactado = items.filter((item) => item.estado === 'contactado').length;
  const rechazado = items.filter((item) => item.estado === 'rechazado').length;

  setMetric('miembros', miembro);
  setMetric('pendientes', pendiente);
  setMetric('contactados', contactado);
  setMetric('rechazados', rechazado);
  renderMembers(miembro, pendiente, contactado, rechazado);
}

async function loadUsers(token) {
  const response = await fetch('/api/users', { headers: { authorization: 'Bearer ' + token } });
  if (!response.ok) {
    setMetric('usuarios', '—');
    return;
  }

  const data = await response.json().catch(() => ({}));
  setMetric('usuarios', (data.users || []).length);
}

async function loadTreasury(token) {
  const [movimientosResult, cuotasResult] = await Promise.allSettled([
    fetch('/api/tesoreria', { headers: { authorization: 'Bearer ' + token } }),
    fetch('/api/cuotas-miembros?anio=' + encodeURIComponent(CURRENT_YEAR), { headers: { authorization: 'Bearer ' + token } })
  ]);

  const movimientosResponse = movimientosResult.status === 'fulfilled' ? movimientosResult.value : null;
  const cuotasResponse = cuotasResult.status === 'fulfilled' ? cuotasResult.value : null;

  if (!movimientosResponse?.ok && !cuotasResponse?.ok) {
    renderTreasuryUnavailable();
    return;
  }

  const movimientosData = movimientosResponse?.ok ? await movimientosResponse.json().catch(() => ({})) : {};
  const cuotasData = cuotasResponse?.ok ? await cuotasResponse.json().catch(() => ({})) : {};

  const movimientos = Array.isArray(movimientosData.movimientos) ? movimientosData.movimientos : [];
  const movimientosAnio = movimientos.filter((item) => getYearFromDate(item.fecha) === CURRENT_YEAR);
  const ingresosGenerales = sumByType(movimientosAnio, 'ingreso');
  const egresos = sumByType(movimientosAnio, 'egreso');
  const resumenCuotas = cuotasData.resumen || {};
  const cuotasRecaudadas = Number(resumenCuotas.totalPagado || resumenCuotas.recaudado || 0);
  const cuotasPendientes = Number(resumenCuotas.saldoPendiente || 0);
  const miembrosCuotas = Number(resumenCuotas.totalMiembros || resumenCuotas.miembros || 0);
  const ingresosTotales = ingresosGenerales + cuotasRecaudadas;
  const saldo = ingresosTotales - egresos;

  setMetric('tesoreria-ingresos', formatMoney(ingresosTotales));
  setMetric('tesoreria-egresos', formatMoney(egresos));
  setMetric('tesoreria-saldo', formatMoney(saldo));

  renderTreasurySummary({
    ingresosGenerales,
    cuotasRecaudadas,
    ingresosTotales,
    egresos,
    saldo,
    cuotasPendientes,
    miembrosCuotas
  });
}

function renderLatest(posts) {
  const box = document.querySelector('[data-dashboard-latest-posts]');
  if (!box) return;

  if (!posts.length) {
    box.innerHTML = '<p class="dashboard-empty">No hay publicaciones registradas.</p>';
    return;
  }

  box.innerHTML = posts.map((post) => '<article class="dashboard-list-item"><div><strong>' + escapeHTML(post.titulo || 'Sin título') + '</strong><span>' + escapeHTML(post.categoria || 'Sin categoría') + '</span></div><em>' + escapeHTML(post.estado || 'borrador') + '</em></article>').join('');
}

function renderMembers(miembro, pendiente, contactado, rechazado) {
  const box = document.querySelector('[data-dashboard-member-summary]');
  if (!box) return;
  box.innerHTML = '<article><strong>' + miembro + '</strong><span>Miembros</span></article><article><strong>' + pendiente + '</strong><span>Pendientes</span></article><article><strong>' + contactado + '</strong><span>Contactados</span></article><article><strong>' + rechazado + '</strong><span>Rechazados</span></article>';
}

function renderTreasurySummary(summary) {
  const box = document.querySelector('[data-dashboard-treasury-summary]');
  if (!box) return;

  box.innerHTML = `
    <div class="dashboard-treasury-grid">
      <article><span>Ingresos generales</span><strong>${formatMoney(summary.ingresosGenerales)}</strong></article>
      <article><span>Cuotas recaudadas</span><strong>${formatMoney(summary.cuotasRecaudadas)}</strong></article>
      <article><span>Total ingresos</span><strong>${formatMoney(summary.ingresosTotales)}</strong></article>
      <article><span>Total egresos</span><strong>${formatMoney(summary.egresos)}</strong></article>
      <article><span>Saldo disponible</span><strong>${formatMoney(summary.saldo)}</strong></article>
      <article><span>Cuotas pendientes</span><strong>${formatMoney(summary.cuotasPendientes)}</strong></article>
    </div>
    <p class="dashboard-treasury-note">${summary.miembrosCuotas || 0} miembros registrados en cuotas durante ${CURRENT_YEAR}.</p>
  `;
}

function renderTreasuryUnavailable() {
  setMetric('tesoreria-ingresos', '—');
  setMetric('tesoreria-egresos', '—');
  setMetric('tesoreria-saldo', '—');

  const box = document.querySelector('[data-dashboard-treasury-summary]');
  if (!box) return;
  box.innerHTML = '<p class="dashboard-empty">Tesorería no disponible para este usuario o sesión.</p>';
}

function sumByType(items, type) {
  return items
    .filter((item) => String(item.tipo || '').toLowerCase() === type)
    .reduce((sum, item) => sum + Number(item.monto || 0), 0);
}

function getYearFromDate(value) {
  const year = Number(String(value || '').slice(0, 4));
  return Number.isFinite(year) ? year : 0;
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function setMetric(name, value) {
  document.querySelectorAll('[data-dashboard-total="' + name + '"]').forEach((element) => {
    element.textContent = String(value ?? '—');
  });
}

function setStatus(element, message, ok) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('success', Boolean(ok));
  element.classList.toggle('error', !ok);
}

function escapeHTML(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
