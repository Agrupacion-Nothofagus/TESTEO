import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

if (!window.__nothofagusDashboardModernStable) {
  window.__nothofagusDashboardModernStable = true;
  loadModernCss();
  window.setTimeout(initModernDashboard, 120);
}

function loadModernCss() {
  if (document.querySelector('link[href="dashboard-modern.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'dashboard-modern.css';
  document.head.appendChild(link);
}

function initModernDashboard() {
  cleanDuplicateTitle();
  addModernBoard();
  refreshModernMetrics();
  loadExtendedMetrics();
  [400, 1000, 2200, 4200].forEach((delay) => window.setTimeout(refreshModernMetrics, delay));
}

function cleanDuplicateTitle() {
  const hero = document.querySelector('#dashboard-view .dashboard-hero-card');
  if (!hero || hero.classList.contains('dashboard-overview-clean')) return;
  hero.classList.add('dashboard-overview-clean');
  hero.innerHTML = '<p class="section-tag">Vista operativa</p><p class="dashboard-overview-lead">Revisa rápidamente el estado institucional: contenido publicado, solicitudes de socios/as, documentación interna, tesorería y administración de usuarios.</p><div class="dashboard-overview-strip"><span>Publicaciones<strong data-modern-total="publicaciones">—</strong></span><span>Solicitudes<strong data-modern-total="pendientes">—</strong></span><span>Miembros<strong data-modern-total="miembros">—</strong></span><span>Actas<strong data-modern-total="actas">—</strong></span></div>';
}

function addModernBoard() {
  const stats = document.querySelector('#dashboard-view .dashboard-stats-grid');
  if (!stats || document.querySelector('[data-dashboard-modern-board]')) return;
  const board = document.createElement('div');
  board.className = 'dashboard-modern-board';
  board.dataset.dashboardModernBoard = 'true';
  board.innerHTML = '<article class="dashboard-modern-card"><div class="dashboard-modern-heading"><div><p class="section-tag">Publicaciones</p><h4>Estado editorial</h4></div><span class="dashboard-modern-badge" data-modern-total="publicaciones">—</span></div><div class="dashboard-modern-bars" data-modern-bars="publicaciones"></div></article><article class="dashboard-modern-card"><div class="dashboard-modern-heading"><div><p class="section-tag">Solicitudes</p><h4>Socios/as y postulaciones</h4></div></div><div class="dashboard-modern-donut-wrap"><div class="dashboard-modern-donut" data-modern-donut="miembros"><strong data-modern-percent="miembros">—</strong></div><div class="dashboard-modern-mini-list" data-modern-list="miembros"></div></div></article><article class="dashboard-modern-card dark"><div class="dashboard-modern-heading"><div><p class="section-tag">Tesorería</p><h4>Balance general</h4></div><span class="dashboard-modern-badge" data-modern-total="movimientos">— movimientos</span></div><div class="dashboard-modern-finance"><div class="dashboard-modern-balance"><span>Saldo disponible</span><strong data-modern-total="saldo">—</strong></div><div class="dashboard-modern-finance-grid"><article><span>Ingresos</span><strong data-modern-total="ingresos">—</strong></article><article><span>Egresos</span><strong data-modern-total="egresos">—</strong></article></div></div></article><article class="dashboard-modern-card"><div class="dashboard-modern-heading"><div><p class="section-tag">Actas</p><h4>Estado documental</h4></div><span class="dashboard-modern-badge" data-modern-total="actas">—</span></div><div class="dashboard-modern-bars" data-modern-bars="actas"></div></article><article class="dashboard-modern-card dashboard-modern-span-2"><div class="dashboard-modern-heading"><div><p class="section-tag">Operación</p><h4>Distribución general</h4></div><span class="dashboard-modern-badge">Dashboard actualizado</span></div><div class="dashboard-modern-bars" data-modern-bars="operacion"></div></article>';
  stats.parentNode.insertBefore(board, stats);
}

function refreshModernMetrics() {
  copyMetric('publicaciones');
  copyMetric('publicadas');
  copyMetric('borradores');
  copyMetric('miembros');
  copyMetric('pendientes');
  copyMetric('contactados');
  copyMetric('rechazados');
  copyMetric('usuarios');
  copyMetric('visitas');

  const publicadas = readNumber('publicadas');
  const borradores = readNumber('borradores');
  const miembros = readNumber('miembros');
  const pendientes = readNumber('pendientes');
  const contactados = readNumber('contactados');
  const rechazados = readNumber('rechazados');
  const usuarios = readNumber('usuarios');
  const total = miembros + pendientes + contactados + rechazados;
  const percent = total ? Math.round((miembros / total) * 100) : 0;
  const donut = document.querySelector('[data-modern-donut="miembros"]');
  if (donut) donut.style.setProperty('--donut-value', percent + '%');
  setOne('[data-modern-percent="miembros"]', percent + '%');
  renderBars('publicaciones', [['Publicadas', publicadas], ['Borradores/archivo', borradores]]);
  renderMemberList(miembros, pendientes, contactados, rechazados);
  renderBars('operacion', [['Publicaciones', publicadas + borradores], ['Solicitudes', pendientes + contactados + rechazados], ['Miembros', miembros], ['Usuarios', usuarios]]);
}

async function loadExtendedMetrics() {
  if (!client) return;
  const session = await client.auth.getSession();
  const token = session.data?.session?.access_token;
  if (!token) return;
  await Promise.allSettled([loadActas(token), loadTesoreria(token)]);
}

async function loadActas(token) {
  const res = await fetch('/api/actas', { headers: { authorization: 'Bearer ' + token } });
  if (!res.ok) return;
  const data = await res.json().catch(() => ({}));
  const actas = Array.isArray(data.actas) ? data.actas : [];
  const borrador = actas.filter((item) => item.estado === 'borrador').length;
  const finalizada = actas.filter((item) => item.estado === 'finalizada').length;
  const aprobada = actas.filter((item) => item.estado === 'aprobada').length;
  setModern('actas', actas.length);
  renderBars('actas', [['Borradores', borrador], ['Finalizadas', finalizada], ['Aprobadas', aprobada]]);
}

async function loadTesoreria(token) {
  const res = await fetch('/api/tesoreria', { headers: { authorization: 'Bearer ' + token } });
  if (!res.ok) return;
  const data = await res.json().catch(() => ({}));
  const items = Array.isArray(data.movimientos) ? data.movimientos : [];
  const ingresos = items.filter((item) => item.tipo === 'ingreso').reduce((sum, item) => sum + Number(item.monto || 0), 0);
  const egresos = items.filter((item) => item.tipo === 'egreso').reduce((sum, item) => sum + Number(item.monto || 0), 0);
  setModern('movimientos', items.length + ' movimientos');
  setModern('ingresos', money(ingresos));
  setModern('egresos', money(egresos));
  setModern('saldo', money(ingresos - egresos));
}

function copyMetric(name) {
  const source = document.querySelector('[data-dashboard-total="' + name + '"]');
  if (source) setModern(name, source.textContent.trim() || '—');
}

function renderMemberList(miembros, pendientes, contactados, rechazados) {
  const list = document.querySelector('[data-modern-list="miembros"]');
  if (!list) return;
  list.innerHTML = '<article><span>Miembros</span><strong>' + miembros + '</strong></article><article><span>Pendientes</span><strong>' + pendientes + '</strong></article><article><span>Contactados</span><strong>' + contactados + '</strong></article><article><span>Rechazados</span><strong>' + rechazados + '</strong></article>';
}

function renderBars(key, items) {
  const box = document.querySelector('[data-modern-bars="' + key + '"]');
  if (!box) return;
  const max = Math.max(...items.map((item) => Number(item[1] || 0)), 1);
  box.innerHTML = items.map((item) => {
    const width = Math.max(5, Math.round((Number(item[1] || 0) / max) * 100));
    return '<div class="dashboard-modern-bar"><span>' + escapeHTML(item[0]) + '</span><div class="dashboard-modern-track"><i style="--bar-value:' + width + '%"></i></div><strong>' + Number(item[1] || 0) + '</strong></div>';
  }).join('');
}

function readNumber(name) {
  const value = document.querySelector('[data-dashboard-total="' + name + '"]')?.textContent || '0';
  const parsed = Number(String(value).replace(/[^0-9-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function setModern(name, value) {
  document.querySelectorAll('[data-modern-total="' + name + '"]').forEach((item) => {
    const text = String(value ?? '—');
    if (item.textContent !== text) item.textContent = text;
  });
}

function setOne(selector, value) {
  const item = document.querySelector(selector);
  if (item && item.textContent !== value) item.textContent = value;
}

function money(value) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function escapeHTML(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
