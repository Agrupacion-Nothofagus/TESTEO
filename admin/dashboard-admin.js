import './dashboard-modern.js?v=20260703-dashboard-modern';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_TABLE_PUBLICACIONES,
  supabaseConfigurado
} from '../scripts/supabase-config.js';

const dashboard = document.querySelector('#dashboard-view');
const publicationsTotal = document.querySelector('[data-dashboard-total="publicaciones"]');
const publicationsPublished = document.querySelector('[data-dashboard-total="publicadas"]');
const publicationsDraft = document.querySelector('[data-dashboard-total="borradores"]');
const membersTotal = document.querySelector('[data-dashboard-total="miembros"]');
const pendingTotal = document.querySelector('[data-dashboard-total="pendientes"]');
const contactedTotal = document.querySelector('[data-dashboard-total="contactados"]');
const rejectedTotal = document.querySelector('[data-dashboard-total="rechazados"]');
const usersTotal = document.querySelector('[data-dashboard-total="usuarios"]');
const visitsTotal = document.querySelector('[data-dashboard-total="visitas"]');
const latestPosts = document.querySelector('[data-dashboard-latest-posts]');
const memberSummary = document.querySelector('[data-dashboard-member-summary]');
const dashboardStatus = document.querySelector('[data-dashboard-status]');

const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

if (dashboard) {
  installDashboardNavigation();
  loadDashboard();
}

function installDashboardNavigation() {
  document.querySelectorAll('[data-dashboard-open-view]').forEach((button) => {
    button.addEventListener('click', () => {
      const viewId = button.dataset.dashboardOpenView;
      document.querySelector(`[data-admin-view="${viewId}"]`)?.click();
    });
  });
}

async function loadDashboard() {
  if (!client) {
    setDashboardStatus('Supabase no está configurado para cargar métricas.', false);
    return;
  }

  setDashboardStatus('Cargando resumen del panel...', true);

  const sessionResponse = await client.auth.getSession();
  const token = sessionResponse.data?.session?.access_token;

  if (!token) {
    setDashboardStatus('Sesión no disponible. Vuelve a iniciar sesión.', false);
    return;
  }

  await Promise.allSettled([
    loadPublicationStats(),
    loadMemberStats(token),
    loadUserStats(token)
  ]);

  loadVisitStats();
  setDashboardStatus('Panel de control actualizado.', true);
}

async function loadPublicationStats() {
  const { data, error } = await client
    .from(SUPABASE_TABLE_PUBLICACIONES)
    .select('titulo, estado, fecha, categoria')
    .order('fecha', { ascending: false });

  if (error) throw error;

  const posts = data || [];
  const published = posts.filter((item) => item.estado === 'publicado').length;
  const drafts = posts.filter((item) => item.estado !== 'publicado').length;

  setMetric(publicationsTotal, posts.length);
  setMetric(publicationsPublished, published);
  setMetric(publicationsDraft, drafts);
  renderLatestPosts(posts.slice(0, 4));
}

async function loadMemberStats(token) {
  const response = await fetch('/api/miembros', {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    renderMemberSummary(null);
    return;
  }

  const data = await response.json().catch(() => ({}));
  const solicitudes = data.solicitudes || [];
  const counts = {
    miembro: solicitudes.filter((item) => item.estado === 'miembro').length,
    pendiente: solicitudes.filter((item) => item.estado === 'pendiente').length,
    contactado: solicitudes.filter((item) => item.estado === 'contactado').length,
    rechazado: solicitudes.filter((item) => item.estado === 'rechazado').length
  };

  setMetric(membersTotal, counts.miembro);
  setMetric(pendingTotal, counts.pendiente);
  setMetric(contactedTotal, counts.contactado);
  setMetric(rejectedTotal, counts.rechazado);
  renderMemberSummary(counts);
}

async function loadUserStats(token) {
  const response = await fetch('/api/users', {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    setMetric(usersTotal, '—');
    return;
  }

  const data = await response.json().catch(() => ({}));
  setMetric(usersTotal, (data.users || []).length);
}

function loadVisitStats() {
  const storedVisits = Number(localStorage.getItem('nothofagus_admin_visible_visits') || 0);
  setMetric(visitsTotal, storedVisits > 0 ? storedVisits : '—');
}

function renderLatestPosts(posts) {
  if (!latestPosts) return;

  if (!posts.length) {
    latestPosts.innerHTML = '<p class="dashboard-empty">No hay publicaciones registradas.</p>';
    return;
  }

  latestPosts.innerHTML = posts.map((post) => `
    <article class="dashboard-list-item">
      <div>
        <strong>${escapeHTML(post.titulo || 'Sin título')}</strong>
        <span>${escapeHTML(post.categoria || 'Sin categoría')} · ${formatDate(post.fecha)}</span>
      </div>
      <em>${escapeHTML(post.estado || 'borrador')}</em>
    </article>
  `).join('');
}

function renderMemberSummary(counts) {
  if (!memberSummary) return;

  if (!counts) {
    memberSummary.innerHTML = '<p class="dashboard-empty">No fue posible cargar el resumen de miembros.</p>';
    return;
  }

  memberSummary.innerHTML = `
    <article><strong>${counts.miembro}</strong><span>Miembros</span></article>
    <article><strong>${counts.pendiente}</strong><span>Pendientes</span></article>
    <article><strong>${counts.contactado}</strong><span>Contactados</span></article>
    <article><strong>${counts.rechazado}</strong><span>Rechazados</span></article>
  `;
}

function setMetric(element, value) {
  if (!element) return;
  element.textContent = String(value ?? '—');
}

function setDashboardStatus(message, ok) {
  if (!dashboardStatus) return;
  dashboardStatus.textContent = message;
  dashboardStatus.classList.toggle('success', Boolean(ok));
  dashboardStatus.classList.toggle('error', !ok);
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${value}T12:00:00`));
}

function escapeHTML(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
