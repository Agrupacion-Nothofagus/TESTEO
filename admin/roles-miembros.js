import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const ROLE_VALUE = 'gestor_miembros';
const ROLE_LABEL = 'Gestor de miembros';
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

cargarEstilosMiembros();
agregarOpcionRol();
observarSelectoresDeRol();
instalarVistasMiembros();
aplicarPermisosMiembros();

function cargarEstilosMiembros() {
  agregarHojaEstilo('members-admin.css');
  agregarHojaEstilo('members-layout-fixes.css');
}

function agregarHojaEstilo(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
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

function instalarVistasMiembros() {
  const nav = document.querySelector('.sidebar-nav');
  const adminContent = document.querySelector('.admin-content');
  if (!nav || !adminContent || document.querySelector('[data-admin-view="members-pending-view"]')) return;

  const group = document.createElement('div');
  group.className = 'sidebar-member-group is-hidden';
  group.dataset.membersSidebar = 'true';
  group.innerHTML = `
    <p class="sidebar-group-title">Solicitudes</p>
    <button type="button" class="sidebar-link member-sidebar-link" data-admin-view="members-pending-view" data-member-counter-key="pendiente">
      <span>🕓</span>
      Pendientes <strong class="member-sidebar-counter" data-member-counter="pendiente">0</strong>
    </button>
    <button type="button" class="sidebar-link member-sidebar-link" data-admin-view="members-contacted-view" data-member-counter-key="contactado">
      <span>📞</span>
      Contactados <strong class="member-sidebar-counter" data-member-counter="contactado">0</strong>
    </button>
  `;
  nav.appendChild(group);

  const rejectedButton = crearSidebarButton('members-rejected-view', '🚫', 'Rechazados', 'rechazado');
  const membersButton = crearSidebarButton('members-list-view', '🤝', 'Miembros', 'miembro');
  nav.appendChild(rejectedButton);
  nav.appendChild(membersButton);

  const vistas = [
    crearVista('members-pending-view', 'Pendientes', 'Solicitudes recién ingresadas o aún no revisadas.', 'pendiente'),
    crearVista('members-contacted-view', 'Contactados', 'Solicitudes revisadas y personas ya contactadas.', 'contactado'),
    crearVista('members-rejected-view', 'Rechazados', 'Solicitudes no aceptadas con observaciones del rechazo.', 'rechazado'),
    crearVista('members-list-view', 'Miembros', 'Personas aceptadas que forman parte de la organización como socios/as.', 'miembro')
  ];

  vistas.forEach((section) => adminContent.appendChild(section));

  document.querySelectorAll('.member-sidebar-link').forEach((button) => {
    button.addEventListener('click', () => activarVista(button.dataset.adminView));
  });
}

function crearSidebarButton(viewId, icon, label, counterKey) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sidebar-link member-sidebar-link is-hidden';
  button.dataset.adminView = viewId;
  button.dataset.memberCounterKey = counterKey;
  button.innerHTML = `<span>${icon}</span>${label} <strong class="member-sidebar-counter" data-member-counter="${counterKey}">0</strong>`;
  return button;
}

function crearVista(id, title, description, status) {
  const section = document.createElement('section');
  section.className = 'admin-view member-admin-view';
  section.id = id;
  section.dataset.viewTitle = title;
  section.dataset.viewDescription = description;
  section.dataset.memberStatusView = status;
  section.innerHTML = `
    <div class="admin-panel members-card">
      <div class="panel-heading members-heading-row">
        <div>
          <p class="section-tag">Gestión de miembros</p>
          <h3>${title}</h3>
          <p>${description}</p>
        </div>
        <button type="button" class="secondary-admin-button" data-reload-members>Actualizar</button>
      </div>

      <div class="members-filter-bar" data-member-filter-bar>
        <label>
          Buscar por nombre
          <input type="search" data-member-filter="nombre" placeholder="Nombre completo">
        </label>
        <label>
          Categoría
          <select data-member-filter="categoria">
            <option value="">Todas</option>
            <option value="Socio/a activo/a">Socio/a activo/a</option>
            <option value="Socio/a colaborador/a">Socio/a colaborador/a</option>
            <option value="Socio/a benefactor/a">Socio/a benefactor/a</option>
          </select>
        </label>
        <label>
          Estado
          <select data-member-filter="estado">
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="contactado">Contactado</option>
            <option value="rechazado">Rechazado</option>
            <option value="miembro">Miembro</option>
          </select>
        </label>
        <label>
          Fecha de solicitud
          <input type="date" data-member-filter="fecha">
        </label>
      </div>

      <p class="admin-status" data-members-status></p>
      <div class="members-list" data-members-list>
        <p class="admin-status">Cargando registros...</p>
      </div>
    </div>
  `;
  return section;
}

async function aplicarPermisosMiembros() {
  if (!client) return;

  const { data } = await client.auth.getSession();
  const user = data?.session?.user;
  const rol = obtenerRol(user);
  const esAdmin = rol === 'administrador' || rol === 'admin';
  const esGestorMiembros = rol === ROLE_VALUE;

  if (esAdmin || esGestorMiembros) {
    document.querySelector('[data-members-sidebar]')?.classList.remove('is-hidden');
    document.querySelectorAll('.member-sidebar-link').forEach((button) => button.classList.remove('is-hidden'));
  }

  if (esGestorMiembros) {
    ocultarAccesosPublicaciones();
    activarVista('members-pending-view');
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
      window.dispatchEvent(new CustomEvent('nothofagus:members-view', { detail: { viewId } }));
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
