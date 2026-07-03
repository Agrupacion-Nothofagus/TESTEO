import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_TABLE_PUBLICACIONES,
  supabaseConfigurado
} from '../scripts/supabase-config.js';

const dashboard = document.querySelector('#dashboard-view');
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

if (dashboard) {
  cleanDashboardTitle();
  installQuickLinks();
  loadSafeDashboard();
}

function cleanDashboardTitle() {
  const hero = document.querySelector('#dashboard-view .dashboard-hero-card');
  if (!hero) return;
  hero.innerHTML = `
    <p class="section-tag">Vista operativa</p>
    <p>Resumen rápido de publicaciones, solicitudes, miembros, usuarios y estado general del panel administrativo.</p>
  `;
}

function installQuickLinks() {
  document.querySelectorAll('[data-dashboard-open-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const viewId = button.dataset.dashboardOpenView;
      document.querySelector(`[data-admin-view="${viewId}"]`)?.click();
    });
  });
}

async function loadSafeDashboard() {
  const status = document.querySelector('[data-dashboard-status]');
  setStatus(status, 'Cargando panel de control...', true);

  if (!client) {
    setStatus(status, 'Supabase no está configurado.', false);
    return;
  }

  const session = await client.auth.getSession();
  const token = session.data?.session?.access_token;

  if (!token) {
    setStatus(status, 'Sesión no disponible. Vuelve a iniciar sesión.', false);
    return;
  }

  await Promise.allSettled([
    loadPublicaciones(),
    loadMiembros(token),
    loadUsuarios(token)
  ]);

  const visits = Number(localStorage.getItem('nothofagus_admin_visible_visits') || 0);
  setMetric('visitas', visits > 0 ? visits : '—');
  setStatus(status, 'Panel de control actualizado.', true);
}

async function loadPublicaciones() {
  const response = await client
    .from(SUPABASE_TABLE_PUBLICACIONES)
    .select('titulo, estado, fecha, categoria')
    .order('fecha', { ascending: false });

  if (response.error) return;

  const posts = response.data || [];
  const publicadas = posts.filter((item) => item.estado === 'publicado').length;
  const borradores = posts.filter((item) => item.estado !== 'publicado').length;

  setMetric('publicaciones', posts.length);
  setMetric('publicadas', publicadas);
  setMetric('borradores', borradores);
  renderLatestPosts(posts.slice(0, 4));
}

async function loadMiembros(token) {
  const response = await fetch('/api/miembros', {
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8'
    }
  });

  if (!response.ok) return;

  const data = await response.json().catch(() => ({}));
  const solicitudes = data.solicitudes || [];
  const miembro = solicitudes.filter((item) => item.estado === 'miembro').length;
  const pendiente = solicitudes.filter((item) => item.estado === 'pendiente').length;
  const contactado = solicitudes.filter((item) => item.estado === 'contactado').length;
  const rechazado = solicitudes.filter((item) => item.estado === 'rechazado').length;

  setMetric('miembros', miembro);
  setMetric('pendientes', pendiente);
  setMetric('contactados', contactado);
  setMetric('rechazados', rechazado);
  renderMemberSummary({ miembro, pendiente, contactado, rechazado });
}

async function loadUsuarios(token) {
  const response = await fetch('/api/users', {
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8'
    }
  });

  if (!response.ok) {
    setMetric('usuarios', '—');
    return;
  }

  const data = await response.json().catch(() => ({}));
  setMetric('usuarios', (data.users || []).length);
}

function renderLatestPosts(posts) {
  const box = document.querySelector('[data-dashboard-latest-posts]');
  if (!box) return;

  if (!posts.length) {
    box.innerHTML = '<p class="dashboard-empty">No hay publicaciones registradas.</p>';
    return;
  }

  box.innerHTML = posts.map((post) => `
    <article class="dashboard-list-item">
      <div>
        <strong>${escapeHTML(post.titulo || 'Sin título')}</strong>
        <span>${escapeHTML(post.categoria || 'Sin categoría')}</span>
      </div>
      <em>${escapeHTML(post.estado || 'borrador')}</em>
    </article>
  `).join('');
}

function renderMemberSummary(counts) {
  const box = document.querySelector('[data-dashboard-member-summary]');
  if (!box) return;
  box.innerHTML = `
    <article><strong>${counts.miembro}</strong><span>Miembros</span></article>
    <article><strong>${counts.pendiente}</strong><span>Pendientes</span></article>
    <article><strong>${counts.contactado}</strong><span>Contactados</span></article>
    <article><strong>${counts.rechazado}</strong><span>Rechazados</span></article>
  `;
}

function setMetric(name, value) {
  document.querySelectorAll(`[data-dashboard-total="${name}"]`).forEach((element) => {
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
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
