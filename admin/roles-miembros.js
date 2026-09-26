import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const ROLE_VALUE = 'gestor_miembros';
const ROLE_LABEL = 'Secretariado';
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

cargarEstilosMiembros();
agregarOpcionRol();
observarSelectoresDeRol();
instalarVistasMiembros();
aplicarPermisosMiembros();

function cargarEstilosMiembros() {
  agregarHojaEstilo('members-admin.css');
  agregarHojaEstilo('members-layout-fixes.css');
  agregarHojaEstilo('members-sidebar-dropdown.css');
  agregarHojaEstilo('members-panel-optimized.css?v=20260924');
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
    if (!select) return;

    const option = select.querySelector(`option[value="${ROLE_VALUE}"]`);

    if (option) {
      if (option.textContent !== ROLE_LABEL) {
        option.textContent = ROLE_LABEL;
      }
      return;
    }

    const nuevaOpcion = document.createElement('option');
    nuevaOpcion.value = ROLE_VALUE;
    nuevaOpcion.textContent = ROLE_LABEL;
    select.appendChild(nuevaOpcion);
  });
}

function observarSelectoresDeRol() {
  const usersList = document.querySelector('#users-list');
  if (!usersList) return;

  const observer = new MutationObserver(() => agregarOpcionRol());
  observer.observe(usersList, { childList: true, subtree: false });
}

function instalarVistasMiembros() {
  const nav = document.querySelector('.sidebar-nav');
  const adminContent = document.querySelector('.admin-content');
  if (!nav || !adminContent || document.querySelector('[data-admin-view="members-list-view"]')) return;

  const group = document.createElement('div');
  group.className = 'sidebar-member-group is-hidden';
  group.dataset.membersSidebar = 'true';
  group.innerHTML = `
    <button type="button" class="sidebar-link sidebar-member-toggle is-hidden" data-members-toggle aria-expanded="false" aria-controls="members-sidebar-menu">
      <span>🤝</span>
      Miembros
      <strong class="member-toggle-caret" aria-hidden="true">⌄</strong>
    </button>
    <div class="sidebar-member-menu is-collapsed" id="members-sidebar-menu" data-members-menu>
      <button type="button" class="sidebar-link member-sidebar-link is-hidden" data-admin-view="members-list-view" data-member-counter-key="miembro">
        <span>👥</span>
        Miembros <strong class="member-sidebar-counter" data-member-counter="miembro">0</strong>
      </button>
      <button type="button" class="sidebar-link member-sidebar-link is-hidden" data-admin-view="members-contacted-view" data-member-counter-key="contactado">
        <span>📞</span>
        Contactados <strong class="member-sidebar-counter" data-member-counter="contactado">0</strong>
      </button>
    </div>
  `;
  nav.appendChild(group);

  const toggle = group.querySelector('[data-members-toggle]');
  toggle?.addEventListener('click', () => alternarMenuMiembros());

  const vistas = [
    crearVista('members-list-view', 'Miembros', 'Nómina institucional, estado y antecedentes de socios/as.', 'miembro'),
    crearVista('members-contacted-view', 'Contactados', 'Solicitudes nuevas y seguimiento de personas contactadas.', 'contactado')
  ];

  vistas.forEach((section) => adminContent.appendChild(section));

  document.querySelectorAll('.member-sidebar-link').forEach((button) => {
    button.addEventListener('click', () => activarVista(button.dataset.adminView));
  });
}

function crearVista(id, title, description, status) {
  const esNomina = status === 'miembro';
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

      <div class="members-summary-grid" data-members-summary aria-label="Resumen de ${esNomina ? 'miembros' : 'contactos'}">
        ${esNomina ? `
          <article><span>Total miembros</span><strong data-member-summary="total">0</strong><small>Nómina registrada</small></article>
          <article><span>Activos/as</span><strong data-member-summary="activo">0</strong><small>Participación vigente</small></article>
          <article><span>Inactivos/as</span><strong data-member-summary="inactivo">0</strong><small>Estado administrativo</small></article>
          <article><span>Suspendidos/as</span><strong data-member-summary="suspendido">0</strong><small>Requieren revisión</small></article>
        ` : `
          <article><span>Nuevos</span><strong data-member-summary="pendiente">0</strong><small>Sin contacto registrado</small></article>
          <article><span>Contactados</span><strong data-member-summary="contactado">0</strong><small>En seguimiento</small></article>
          <article><span>Total seguimiento</span><strong data-member-summary="seguimiento">0</strong><small>Solicitudes visibles</small></article>
        `}
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
            ${esNomina ? `
              <option value="activo">Activo/a</option>
              <option value="inactivo">Inactivo/a</option>
              <option value="suspendido">Suspendido/a</option>
            ` : `
              <option value="pendiente">Nuevo</option>
              <option value="contactado">Contactado</option>
            `}
          </select>
        </label>
        <label>
          ${esNomina ? 'Fecha de ingreso' : 'Fecha de solicitud'}
          <input type="date" data-member-filter="fecha">
        </label>
      </div>

      <div class="members-list-toolbar">
        <p data-members-result-count aria-live="polite">Preparando registros...</p>
        <button type="button" class="members-clear-filters" data-members-clear-filters>Limpiar filtros</button>
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
  const esSecretariado = rol === ROLE_VALUE;

  if (esAdmin || esSecretariado) {
    document.querySelector('[data-members-sidebar]')?.classList.remove('is-hidden');
    document.querySelector('[data-members-toggle]')?.classList.remove('is-hidden');
    document.querySelectorAll('.member-sidebar-link').forEach((button) => button.classList.remove('is-hidden'));
  }

  if (esSecretariado) {
    ocultarAccesosPublicaciones();
    abrirMenuMiembros();
    activarVista('members-list-view');
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
  if (viewId === 'members-pending-view' || viewId === 'members-rejected-view') {
    viewId = 'members-contacted-view';
  }
  const esVistaMiembros = String(viewId || '').startsWith('members-');
  if (esVistaMiembros) abrirMenuMiembros();

  document.querySelectorAll('[data-admin-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.adminView === viewId);
  });

  document.querySelector('[data-members-toggle]')?.classList.toggle('is-active', esVistaMiembros);

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

function alternarMenuMiembros() {
  const menu = document.querySelector('[data-members-menu]');
  if (!menu) return;

  if (menu.classList.contains('is-collapsed')) {
    abrirMenuMiembros();
  } else {
    cerrarMenuMiembros();
  }
}

function abrirMenuMiembros() {
  const menu = document.querySelector('[data-members-menu]');
  const toggle = document.querySelector('[data-members-toggle]');
  if (!menu || !toggle) return;

  menu.classList.remove('is-collapsed');
  toggle.classList.add('is-open');
  toggle.setAttribute('aria-expanded', 'true');
}

function cerrarMenuMiembros() {
  const menu = document.querySelector('[data-members-menu]');
  const toggle = document.querySelector('[data-members-toggle]');
  if (!menu || !toggle) return;

  menu.classList.add('is-collapsed');
  toggle.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
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
