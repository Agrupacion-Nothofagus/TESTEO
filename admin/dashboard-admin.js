import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_TABLE_PUBLICACIONES, supabaseConfigurado } from '../scripts/supabase-config.js';

const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

initSafeDashboard();

function initSafeDashboard() {
  const hero = document.querySelector('#dashboard-view .dashboard-hero-card');
  if (hero) {
    hero.innerHTML = '<p class="section-tag">Vista operativa</p><p>Resumen rápido del estado institucional: publicaciones, solicitudes, miembros y usuarios.</p>';
  }

  document.querySelectorAll('[data-dashboard-open-view]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelector('[data-admin-view="' + button.dataset.dashboardOpenView + '"]')?.click();
    });
  });

  loadDashboardData();
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
    loadUsers(token)
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
