import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

if (!window.__nothofagusDashboardModern) {
  window.__nothofagusDashboardModern = true;
  cargarEstiloDashboardModerno();
  window.setTimeout(instalarDashboardModerno, 120);
}

function cargarEstiloDashboardModerno() {
  if (document.querySelector('link[href="dashboard-modern.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'dashboard-modern.css';
  document.head.appendChild(link);
}

function instalarDashboardModerno() {
  limpiarTituloDuplicado();
  agregarTableroModerno();
  actualizarIndicadoresDesdeDOM();
  cargarDatosExtendidos();

  const observer = new MutationObserver(() => actualizarIndicadoresDesdeDOM());
  observer.observe(document.querySelector('#dashboard-view') || document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

function limpiarTituloDuplicado() {
  const hero = document.querySelector('#dashboard-view .dashboard-hero-card');
  if (!hero || hero.classList.contains('dashboard-overview-clean')) return;

  hero.classList.add('dashboard-overview-clean');
  hero.innerHTML = `
    <p class="section-tag">Vista operativa</p>
    <p class="dashboard-overview-lead">Revisa rápidamente el estado institucional: contenido publicado, solicitudes de socios/as, documentación interna, tesorería y administración de usuarios.</p>
    <div class="dashboard-overview-strip" aria-label="Resumen rápido del panel">
      <span>Publicaciones<strong data-modern-total="publicaciones">—</strong></span>
      <span>Solicitudes<strong data-modern-total="pendientes">—</strong></span>
      <span>Miembros<strong data-modern-total="miembros">—</strong></span>
      <span>Actas<strong data-modern-total="actas">—</strong></span>
    </div>
  `;
}

function agregarTableroModerno() {
  const stats = document.querySelector('#dashboard-view .dashboard-stats-grid');
  if (!stats || document.querySelector('[data-dashboard-modern-board]')) return;

  const board = document.createElement('div');
  board.className = 'dashboard-modern-board';
  board.dataset.dashboardModernBoard = 'true';
  board.innerHTML = `
    <article class="dashboard-modern-card">
      <div class="dashboard-modern-heading">
        <div><p class="section-tag">Publicaciones</p><h4>Estado editorial</h4></div>
        <span class="dashboard-modern-badge" data-modern-total="publicaciones">—</span>
      </div>
      <div class="dashboard-modern-bars" data-modern-bars="publicaciones"></div>
    </article>

    <article class="dashboard-modern-card">
      <div class="dashboard-modern-heading">
        <div><p class="section-tag">Solicitudes</p><h4>Socios/as y postulaciones</h4></div>
      </div>
      <div class="dashboard-modern-donut-wrap">
        <div class="dashboard-modern-donut" data-modern-donut="miembros"><strong data-modern-percent="miembros">—</strong></div>
        <div class="dashboard-modern-mini-list" data-modern-list="miembros"></div>
      </div>
    </article>

    <article class="dashboard-modern-card dark">
      <div class="dashboard-modern-heading">
        <div><p class="section-tag">Tesorería</p><h4>Balance general</h4></div>
        <span class="dashboard-modern-badge" data-modern-total="movimientos">— movimientos</span>
      </div>
      <div class="dashboard-modern-finance">
        <div class="dashboard-modern-balance"><span>Saldo disponible</span><strong data-modern-total="saldo">—</strong></div>
        <div class="dashboard-modern-finance-grid">
          <article><span>Ingresos</span><strong data-modern-total="ingresos">—</strong></article>
          <article><span>Egresos</span><strong data-modern-total="egresos">—</strong></article>
        </div>
      </div>
    </article>

    <article class="dashboard-modern-card">
      <div class="dashboard-modern-heading">
        <div><p class="section-tag">Actas</p><h4>Estado documental</h4></div>
        <span class="dashboard-modern-badge" data-modern-total="actas">—</span>
      </div>
      <div class="dashboard-modern-bars" data-modern-bars="actas"></div>
    </article>

    <article class="dashboard-modern-card" style="grid-column: span 2;">
      <div class="dashboard-modern-heading">
        <div><p class="section-tag">Operación</p><h4>Distribución general</h4></div>
        <span class="dashboard-modern-badge">Dashboard actualizado</span>
      </div>
      <div class="dashboard-modern-bars" data-modern-bars="operacion"></div>
    </article>
  `;

  stats.parentNode.insertBefore(board, stats);
}

function actualizarIndicadoresDesdeDOM() {
  copiarMetricas(['publicaciones', 'publicadas', 'borradores', 'miembros', 'pendientes', 'contactados', 'rechazados', 'usuarios', 'visitas']);

  const publicadas = leerNumero('publicadas');
  const borradores = leerNumero('borradores');
  const miembros = leerNumero('miembros');
  const pendientes = leerNumero('pendientes');
  const contactados = leerNumero('contactados');
  const rechazados = leerNumero('rechazados');
  const usuarios = leerNumero('usuarios');

  renderBarras('publicaciones', [
    ['Publicadas', publicadas],
    ['Borradores/archivo', borradores]
  ]);

  const totalSolicitudes = miembros + pendientes + contactados + rechazados;
  const aceptacion = totalSolicitudes ? Math.round((miembros / totalSolicitudes) * 100) : 0;
  const donut = document.querySelector('[data-modern-donut="miembros"]');
  if (donut) donut.style.setProperty('--donut-value', `${aceptacion}%`);
  setText('[data-modern-percent="miembros"]', `${aceptacion}%`);

  renderListaMiembros({ miembros, pendientes, contactados, rechazados });
  renderBarras('operacion', [
    ['Publicaciones', publicadas + borradores],
    ['Solicitudes', pendientes + contactados + rechazados],
    ['Miembros', miembros],
    ['Usuarios', usuarios]
  ]);
}

async function cargarDatosExtendidos() {
  if (!client) return;
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return;

  await Promise.allSettled([
    cargarActas(token),
    cargarTesoreria(token)
  ]);
}

async function cargarActas(token) {
  const response = await fetch('/api/actas', { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) return;

  const data = await response.json().catch(() => ({}));
  const actas = Array.isArray(data.actas) ? data.actas : [];
  const borrador = actas.filter((item) => item.estado === 'borrador').length;
  const finalizada = actas.filter((item) => item.estado === 'finalizada').length;
  const aprobada = actas.filter((item) => item.estado === 'aprobada').length;

  setModernTotal('actas', actas.length);
  renderBarras('actas', [
    ['Borradores', borrador],
    ['Finalizadas', finalizada],
    ['Aprobadas', aprobada]
  ]);
}

async function cargarTesoreria(token) {
  const response = await fetch('/api/tesoreria', { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) return;

  const data = await response.json().catch(() => ({}));
  const movimientos = Array.isArray(data.movimientos) ? data.movimientos : [];
  const ingresos = movimientos.filter((item) => item.tipo === 'ingreso').reduce((sum, item) => sum + Number(item.monto || 0), 0);
  const egresos = movimientos.filter((item) => item.tipo === 'egreso').reduce((sum, item) => sum + Number(item.monto || 0), 0);
  const saldo = ingresos - egresos;

  setModernTotal('movimientos', `${movimientos.length} movimientos`);
  setModernTotal('ingresos', formatCLP(ingresos));
  setModernTotal('egresos', formatCLP(egresos));
  setModernTotal('saldo', formatCLP(saldo));
}

function copiarMetricas(names) {
  names.forEach((name) => {
    const source = document.querySelector(`[data-dashboard-total="${name}"]`);
    if (source) setModernTotal(name, source.textContent.trim() || '—');
  });
}

function renderListaMiembros(counts) {
  const list = document.querySelector('[data-modern-list="miembros"]');
  if (!list) return;

  list.innerHTML = `
    <article><span>Miembros</span><strong>${counts.miembros}</strong></article>
    <article><span>Pendientes</span><strong>${counts.pendientes}</strong></article>
    <article><span>Contactados</span><strong>${counts.contactados}</strong></article>
    <article><span>Rechazados</span><strong>${counts.rechazados}</strong></article>
  `;
}

function renderBarras(key, items) {
  const container = document.querySelector(`[data-modern-bars="${key}"]`);
  if (!container) return;

  const max = Math.max(...items.map(([, value]) => Number(value || 0)), 1);
  container.innerHTML = items.map(([label, value]) => {
    const width = Math.max(5, Math.round((Number(value || 0) / max) * 100));
    return `
      <div class="dashboard-modern-bar">
        <span>${escapeHTML(label)}</span>
        <div class="dashboard-modern-track"><i style="--bar-value:${width}%"></i></div>
        <strong>${Number(value || 0)}</strong>
      </div>
    `;
  }).join('');
}

function leerNumero(name) {
  const value = document.querySelector(`[data-dashboard-total="${name}"]`)?.textContent || '0';
  const parsed = Number(String(value).replace(/[^0-9-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function setModernTotal(name, value) {
  document.querySelectorAll(`[data-modern-total="${name}"]`).forEach((item) => {
    item.textContent = String(value ?? '—');
  });
}

function setText(selector, value) {
  const item = document.querySelector(selector);
  if (item) item.textContent = value;
}

function formatCLP(value) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function escapeHTML(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
