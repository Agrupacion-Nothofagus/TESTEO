import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const ROLE_VALUE = 'gestor_miembros';
const ROLE_LABEL = 'Gestor de miembros';
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

cargarEstilosMiembros();
agregarOpcionRol();
observarSelectoresDeRol();
instalarVistaMiembros();
aplicarPermisosMiembros();

function cargarEstilosMiembros() {
  if (document.querySelector('link[href="members-admin.css"]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'members-admin.css';
  document.head.appendChild(link);
}

function agregarOpcionRol() {
  document.querySelectorAll('#user-role, [data-user-role]').forEach((select) => {
    if (!select || select.querySelector(`option[value="${ROLE_VALUE}"]`)) return;

    const option = document.createElement('option');
    option.value = ROLE_VALUE;
    option.textContent = ROLE_LABEL;
    select.appendChild(option);
  });
}

function observarSelectoresDeRol() {
  const usersList = document.querySelector('#users-list');
  if (!usersList) return;

  const observer = new MutationObserver(() => agregarOpcionRol());
  observer.observe(usersList, { childList: true, subtree: true });
}

function instalarVistaMiembros() {
  const nav = document.querySelector('.sidebar-nav');
  const adminContent = document.querySelector('.admin-content');
  if (!nav || !adminContent || document.querySelector('[data-admin-view="miembros-view"]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sidebar-link is-hidden';
  button.dataset.adminView = 'miembros-view';
  button.innerHTML = '<span>🤝</span> Gestión de miembros';
  nav.appendChild(button);

  const section = document.createElement('section');
  section.className = 'admin-view';
  section.id = 'miembros-view';
  section.dataset.viewTitle = 'Gestión de miembros';
  section.dataset.viewDescription = 'Revisa y gestiona las solicitudes de ingreso realizadas desde el botón ÚNETE.';
  section.innerHTML = `
    <div class="admin-panel members-card">
      <div class="panel-heading members-heading-row">
        <div>
          <p class="section-tag">Solicitudes de ingreso</p>
          <h3>Gestión de miembros</h3>
          <p>
            Revisa nuevas solicitudes, actualiza su estado y registra observaciones del proceso de incorporación.
          </p>
        </div>
        <button type="button" class="secondary-admin-button" id="reload-members">Actualizar solicitudes</button>
      </div>

      <p id="members-status" class="admin-status"></p>
      <div id="members-list" class="members-list">
        <p class="admin-status">Cargando solicitudes...</p>
      </div>
    </div>
  `;
  adminContent.appendChild(section);

  button.addEventListener('click', () => activarVista('miembros-view'));
}

async function aplicarPermisosMiembros() {
  if (!client) return;

  const { data } = await client.auth.getSession();
  const user = data?.session?.user;
  const rol = obtenerRol(user);
  const esAdmin = rol === 'administrador' || rol === 'admin';
  const esGestorMiembros = rol === ROLE_VALUE;
  const membersButton = document.querySelector('[data-admin-view="miembros-view"]');

  if (membersButton && (esAdmin || esGestorMiembros)) {
    membersButton.classList.remove('is-hidden');
  }

  if (esGestorMiembros) {
    ocultarAccesosPublicaciones();
    activarVista('miembros-view');
  }
}

function ocultarAccesosPublicaciones() {
  document.querySelector('[data-admin-view="gestion-view"]')?.classList.add('is-hidden');
  document.querySelector('[data-admin-view="nueva-view"]')?.classList.add('is-hidden');
  document.querySelector('[data-admin-view="usuarios-view"]')?.classList.add('is-hidden');
  document.querySelector('#posts-panel')?.classList.add('is-hidden');
  document.querySelector('#editor-panel')?.classList.add('is-hidden');
  document.querySelector('#users-panel')?.classList.add('is-hidden');
}

function activarVista(viewId) {
  document.querySelectorAll('[data-admin-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.adminView === viewId);
  });

  document.querySelectorAll('.admin-view').forEach((view) => {
    const activa = view.id === viewId;
    view.classList.toggle('is-active', activa);

    if (activa) {
      document.querySelector('#admin-view-title').textContent = view.dataset.viewTitle || 'Panel administrativo';
      document.querySelector('#admin-view-description').textContent = view.dataset.viewDescription || '';
    }
  });
}

function obtenerRol(user) {
  return String(
    user?.user_metadata?.rol
    || user?.user_metadata?.role
    || user?.app_metadata?.rol
    || user?.app_metadata?.role
    || ''
  ).trim().toLowerCase();
}
