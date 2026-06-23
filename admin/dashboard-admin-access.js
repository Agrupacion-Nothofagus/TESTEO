import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

// Restringe el Panel de control exclusivamente a administradores.
if (!window.__nothofagusDashboardAdminAccess) {
  window.__nothofagusDashboardAdminAccess = true;

  initDashboardAccess();
}

async function initDashboardAccess() {
  const user = await getCurrentUser();
  const rol = getRole(user);
  const admin = rol === 'administrador' || rol === 'admin';

  if (admin) return;

  hideDashboard();
  redirectIfDashboardActive(rol);
  blockDashboardClicks(rol);
}

async function getCurrentUser() {
  if (!supabaseConfigurado()) return null;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data } = await client.auth.getSession();
  return data?.session?.user || null;
}

function getRole(user) {
  return String(
    user?.user_metadata?.rol
    || user?.user_metadata?.role
    || user?.app_metadata?.rol
    || user?.app_metadata?.role
    || ''
  ).trim().toLowerCase();
}

function hideDashboard() {
  document.querySelector('[data-admin-view="dashboard-view"]')?.classList.add('is-hidden');
  document.querySelector('#dashboard-view')?.classList.add('is-hidden');
}

function redirectIfDashboardActive(rol) {
  const dashboard = document.querySelector('#dashboard-view');
  if (!dashboard?.classList.contains('is-active')) return;

  openFallbackView(rol);
}

function blockDashboardClicks(rol) {
  document.addEventListener('click', (event) => {
    const dashboardTrigger = event.target.closest?.('[data-admin-view="dashboard-view"], [data-dashboard-open-view="dashboard-view"]');
    if (!dashboardTrigger) return;

    event.preventDefault();
    event.stopPropagation();
    openFallbackView(rol);
  }, true);
}

function openFallbackView(rol) {
  const candidates = rol === 'gestor_miembros' || rol === 'secretariado'
    ? ['members-pending-view', 'members-list-view', 'gestion-view']
    : ['gestion-view', 'nueva-view'];

  for (const viewId of candidates) {
    const button = document.querySelector(`[data-admin-view="${viewId}"]`);
    const view = document.querySelector(`#${viewId}`);

    if (button && view && !button.classList.contains('is-hidden') && !view.classList.contains('is-hidden')) {
      button.click();
      return;
    }
  }

  const fallback = document.querySelector('#gestion-view') || document.querySelector('.admin-view:not(#dashboard-view)');
  if (!fallback) return;

  document.querySelectorAll('.admin-view').forEach((view) => {
    view.classList.toggle('is-active', view === fallback);
  });

  document.querySelectorAll('[data-admin-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.adminView === fallback.id);
  });

  const title = document.querySelector('#admin-view-title');
  const description = document.querySelector('#admin-view-description');
  if (title) title.textContent = fallback.dataset.viewTitle || 'Panel administrativo';
  if (description) description.textContent = fallback.dataset.viewDescription || '';
}
