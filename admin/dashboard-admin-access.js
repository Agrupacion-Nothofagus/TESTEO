import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

// Restringe el Panel de control exclusivamente a administradores.
// Para Secretariado / gestor_miembros también oculta Publicaciones.
if (!window.__nothofagusDashboardAdminAccess) {
  window.__nothofagusDashboardAdminAccess = true;

  initDashboardAccess();
}

async function initDashboardAccess() {
  const user = await getCurrentUser();
  const rol = getRole(user);
  const admin = rol === 'administrador' || rol === 'admin';
  const secretariado = rol === 'gestor_miembros' || rol === 'secretariado' || rol === 'secretaria' || rol === 'secretario';

  if (admin) return;

  hideDashboard();

  if (secretariado) {
    hidePublicaciones();
    keepSecretariadoNavigationClean();
  }

  redirectIfRestrictedViewActive(rol);
  blockRestrictedClicks(rol, secretariado);
  observeSidebarForRestrictedItems(secretariado);
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

function hidePublicaciones() {
  document.querySelector('[data-publicaciones-sidebar]')?.classList.add('is-hidden');
  document.querySelector('[data-publicaciones-toggle]')?.classList.add('is-hidden');
  document.querySelector('[data-publicaciones-menu]')?.classList.add('is-hidden', 'is-collapsed');
  document.querySelector('[data-admin-view="gestion-view"]')?.classList.add('is-hidden');
  document.querySelector('[data-admin-view="nueva-view"]')?.classList.add('is-hidden');
  document.querySelector('#gestion-view')?.classList.add('is-hidden');
  document.querySelector('#nueva-view')?.classList.add('is-hidden');
}

function keepSecretariadoNavigationClean() {
  hideDashboard();
  hidePublicaciones();
}

function redirectIfRestrictedViewActive(rol) {
  const dashboardActive = document.querySelector('#dashboard-view')?.classList.contains('is-active');
  const publicacionesActive = document.querySelector('#gestion-view')?.classList.contains('is-active')
    || document.querySelector('#nueva-view')?.classList.contains('is-active');

  if (!dashboardActive && !publicacionesActive) return;

  openFallbackView(rol);
}

function blockRestrictedClicks(rol, secretariado) {
  document.addEventListener('click', (event) => {
    const dashboardTrigger = event.target.closest?.('[data-admin-view="dashboard-view"], [data-dashboard-open-view="dashboard-view"]');
    const publicacionesTrigger = secretariado
      ? event.target.closest?.('[data-publicaciones-toggle], [data-publicaciones-sidebar], [data-admin-view="gestion-view"], [data-admin-view="nueva-view"], [data-dashboard-open-view="gestion-view"], [data-dashboard-open-view="nueva-view"]')
      : null;

    if (!dashboardTrigger && !publicacionesTrigger) return;

    event.preventDefault();
    event.stopPropagation();
    openFallbackView(rol);
  }, true);
}

function observeSidebarForRestrictedItems(secretariado) {
  if (!secretariado) return;

  const observer = new MutationObserver(() => keepSecretariadoNavigationClean());
  observer.observe(document.querySelector('.sidebar-nav') || document.body, {
    childList: true,
    subtree: true
  });
}

function openFallbackView(rol) {
  const candidates = rol === 'gestor_miembros' || rol === 'secretariado' || rol === 'secretaria' || rol === 'secretario'
    ? ['members-pending-view', 'members-list-view', 'registro-actas-view', 'crear-acta-view']
    : ['gestion-view', 'nueva-view'];

  for (const viewId of candidates) {
    const button = document.querySelector(`[data-admin-view="${viewId}"]`) || getActasButtonForView(viewId);
    const view = document.querySelector(`#${viewId}`);

    if (button && view && !button.classList.contains('is-hidden') && !view.classList.contains('is-hidden')) {
      button.click();
      return;
    }
  }

  const fallback = document.querySelector('.admin-view:not(#dashboard-view):not(#gestion-view):not(#nueva-view)');
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

function getActasButtonForView(viewId) {
  if (viewId === 'registro-actas-view') return document.querySelector('[data-actas-open="registro"]');
  if (viewId === 'crear-acta-view') return document.querySelector('[data-actas-open="crear"]');
  return null;
}
