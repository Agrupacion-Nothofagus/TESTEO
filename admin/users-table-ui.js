const usersPanel = document.querySelector('#users-panel');
const userForm = document.querySelector('#user-create-form');
const reloadUsers = document.querySelector('#reload-users');
const usersList = document.querySelector('#users-list');
const createPassword = document.querySelector('#user-password');
const usersStatus = document.querySelector('#users-status');

let allowNativeDeleteConfirm = false;
let pendingDeleteButton = null;
let loadedUsers = [];

loadOptimizedStyles();

if (usersPanel && userForm) {
  installDeleteModal();
  installConfirmInterceptor();

  const topbar = usersPanel.querySelector('.admin-topbar');
  const topbarActions = document.createElement('div');
  topbarActions.className = 'users-topbar-actions';
  topbarActions.innerHTML = '<button type="button" class="secondary-admin-button" id="toggle-create-user" aria-expanded="false">Añadir usuario</button>';
  if (reloadUsers) topbarActions.appendChild(reloadUsers);
  topbar?.appendChild(topbarActions);

  userForm.classList.add('user-create-form-collapsed');

  const createActions = document.createElement('div');
  createActions.className = 'user-create-actions-bottom';
  createActions.innerHTML = `
    <button type="button" class="users-cancel-create">Cancelar</button>
    <button type="submit" class="secondary-admin-button">Crear usuario</button>
  `;
  userForm.appendChild(createActions);

  enhancePasswordField(createPassword, 'Mostrar u ocultar contraseña inicial');

  const overview = document.createElement('div');
  overview.className = 'users-overview';
  overview.innerHTML = `
    <div class="users-summary-grid" aria-label="Resumen de usuarios">
      <article><span>Total usuarios</span><strong data-users-summary="total">0</strong><small>Cuentas internas</small></article>
      <article><span>Administradores</span><strong data-users-summary="administrador">0</strong><small>Acceso completo</small></article>
      <article><span>Contenido</span><strong data-users-summary="contenido">0</strong><small>Editores y lectura</small></article>
      <article><span>Operación</span><strong data-users-summary="operacion">0</strong><small>Secretariado y tesorería</small></article>
    </div>
    <div class="users-filter-bar">
      <label>Buscar usuario
        <input type="search" data-users-filter="search" placeholder="Nombre o correo">
      </label>
      <label>Rol
        <select data-users-filter="role">
          <option value="">Todos los roles</option>
          <option value="administrador">Administrador</option>
          <option value="editor">Editor</option>
          <option value="lector">Lectura</option>
          <option value="gestor_miembros">Secretariado</option>
          <option value="tesorero">Tesorero</option>
        </select>
      </label>
      <p data-users-result-count aria-live="polite">Preparando usuarios...</p>
    </div>
  `;
  userForm.after(overview);

  if (usersList && !document.querySelector('.users-table-header')) {
    const header = document.createElement('div');
    header.className = 'users-table-header';
    header.setAttribute('aria-hidden', 'true');
    header.innerHTML = `
      <span>Usuario</span>
      <span>Correo electrónico</span>
      <span>Rol</span>
      <span>Nueva contraseña</span>
      <span>Acciones</span>
    `;
    usersList.parentNode.insertBefore(header, usersList);
  }

  document.querySelector('#toggle-create-user')?.addEventListener('click', toggleCreateForm);
  document.querySelector('.users-cancel-create')?.addEventListener('click', closeCreateForm);
  overview.querySelectorAll('[data-users-filter]').forEach((field) => {
    field.addEventListener('input', applyUserFilters);
    field.addEventListener('change', applyUserFilters);
  });

  observePasswordFields();
  observeActionButtons();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-toggle-password]');
  if (!button) return;

  const field = button.closest('.password-field');
  const input = field?.querySelector('input');
  if (!input) return;

  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  button.textContent = isPassword ? '🙈' : '👁️';
  button.setAttribute('aria-label', isPassword ? 'Ocultar contraseña' : 'Mostrar contraseña');
});

document.addEventListener('click', (event) => {
  const save = event.target.closest('[data-visible-save-user]');
  const remove = event.target.closest('[data-visible-remove-user]');
  if (save) save.closest('.user-admin-card')?.querySelector('[data-save-user]')?.click();
  if (remove) {
    const original = remove.closest('.user-admin-card')?.querySelector('[data-remove-user]');
    pendingDeleteButton = original || null;
    original?.click();
  }
});

usersList?.addEventListener('input', markUserRowDirty);
usersList?.addEventListener('change', (event) => {
  markUserRowDirty(event);
  const role = event.target.closest('[data-user-role]');
  if (role) role.closest('[data-user-card]')?.setAttribute('data-user-role-filter', role.value);
});

window.addEventListener('nothofagus:users-loaded', (event) => {
  loadedUsers = Array.isArray(event.detail?.users) ? event.detail.users : [];
  updateUserSummary();
  window.setTimeout(applyUserFilters, 0);
});

window.addEventListener('nothofagus:user-created', closeCreateForm);

function installDeleteModal() {
  if (document.querySelector('#delete-user-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'delete-user-modal';
  modal.className = 'delete-user-modal is-hidden';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="delete-user-modal__backdrop" data-delete-cancel></div>
    <section class="delete-user-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="delete-user-title">
      <p class="section-tag">Confirmar eliminación</p>
      <h3 id="delete-user-title">Eliminar usuario</h3>
      <p id="delete-user-message" class="delete-user-modal__message"></p>
      <div class="delete-user-modal__actions">
        <button type="button" class="delete-user-modal__cancel" data-delete-cancel>Cancelar</button>
        <button type="button" class="delete-user-modal__accept" data-delete-accept>Aceptar</button>
      </div>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll('[data-delete-cancel]').forEach((button) => {
    button.addEventListener('click', closeDeleteModal);
  });

  modal.querySelector('[data-delete-accept]')?.addEventListener('click', () => {
    const button = pendingDeleteButton;
    closeDeleteModal();
    if (!button) return;

    allowNativeDeleteConfirm = true;
    button.click();
    allowNativeDeleteConfirm = false;
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDeleteModal();
  });
}

function installConfirmInterceptor() {
  if (window.__nothofagusConfirmInstalled) return;
  window.__nothofagusConfirmInstalled = true;
  const nativeConfirm = window.confirm.bind(window);

  window.confirm = (message) => {
    const text = String(message || '');
    if (allowNativeDeleteConfirm) return true;

    if (text.startsWith('¿Eliminar el usuario') && text.includes('Esta acción no se puede deshacer')) {
      showDeleteModal(text);
      return false;
    }

    return nativeConfirm(message);
  };
}

function showDeleteModal(message) {
  const modal = document.querySelector('#delete-user-modal');
  const messageBox = document.querySelector('#delete-user-message');
  if (!modal || !messageBox) return;

  pendingDeleteButton = pendingDeleteButton || document.activeElement?.closest?.('[data-remove-user]') || null;
  messageBox.textContent = message;
  modal.classList.remove('is-hidden');
  modal.setAttribute('aria-hidden', 'false');
  modal.querySelector('[data-delete-cancel]')?.focus();
}

function closeDeleteModal() {
  const modal = document.querySelector('#delete-user-modal');
  if (!modal) return;

  modal.classList.add('is-hidden');
  modal.setAttribute('aria-hidden', 'true');
  pendingDeleteButton = null;
}

function observePasswordFields() {
  enhanceAllPasswordFields();

  if (!usersList) return;
  const observer = new MutationObserver(() => enhanceAllPasswordFields());
  observer.observe(usersList, { childList: true, subtree: true });
}

function observeActionButtons() {
  enhanceAllActionButtons();

  if (!usersList) return;
  const observer = new MutationObserver(() => {
    enhanceAllActionButtons();
    updateUserSummary();
    applyUserFilters();
  });
  observer.observe(usersList, { childList: true, subtree: true });
}

function enhanceAllPasswordFields() {
  document.querySelectorAll('#users-panel input[type="password"], #users-panel input[data-user-password]').forEach((input) => {
    enhancePasswordField(input, 'Mostrar u ocultar contraseña');
  });
}

function enhanceAllActionButtons() {
  document.querySelectorAll('.user-admin-actions').forEach((actions) => {
    if (actions.querySelector('.user-row-action-buttons')) return;

    const originalRemove = actions.querySelector('[data-remove-user]');
    const controls = document.createElement('div');
    controls.className = 'user-row-action-buttons';
    controls.innerHTML = `
      <button type="button" class="user-row-save" data-visible-save-user disabled>Guardado</button>
      <button type="button" class="user-row-remove" data-visible-remove-user aria-label="${originalRemove?.disabled ? 'No puedes eliminar tu propia sesión' : 'Eliminar usuario'}" title="${originalRemove?.disabled ? 'No puedes eliminar tu propia sesión' : 'Eliminar usuario'}" ${originalRemove?.disabled ? 'disabled aria-disabled="true"' : ''}>Eliminar</button>
    `;
    actions.prepend(controls);
  });
}

function toggleCreateForm() {
  const opening = userForm.classList.contains('user-create-form-collapsed');
  userForm.classList.toggle('user-create-form-collapsed', !opening);
  const button = document.querySelector('#toggle-create-user');
  if (button) {
    button.textContent = opening ? 'Cerrar formulario' : 'Añadir usuario';
    button.setAttribute('aria-expanded', opening ? 'true' : 'false');
  }
  if (opening) userForm.querySelector('#user-email')?.focus();
}

function closeCreateForm() {
  userForm.classList.add('user-create-form-collapsed');
  const button = document.querySelector('#toggle-create-user');
  if (button) {
    button.textContent = 'Añadir usuario';
    button.setAttribute('aria-expanded', 'false');
  }
}

function markUserRowDirty(event) {
  const editable = event.target.closest?.('[data-user-name], [data-user-role], [data-user-password]');
  if (!editable) return;
  const card = editable.closest('[data-user-card]');
  const button = card?.querySelector('[data-visible-save-user]');
  card?.classList.add('is-dirty');
  if (button) {
    button.disabled = false;
    button.textContent = 'Guardar';
  }
}

function updateUserSummary() {
  const source = loadedUsers.length ? loadedUsers : Array.from(usersList?.querySelectorAll('[data-user-card]') || []).map((card) => ({
    rol: card.dataset.userRoleFilter || 'editor'
  }));
  const counts = {
    total: source.length,
    administrador: source.filter((user) => normalizeRole(user.rol) === 'administrador').length,
    contenido: source.filter((user) => ['editor', 'lector'].includes(normalizeRole(user.rol))).length,
    operacion: source.filter((user) => ['gestor_miembros', 'tesorero'].includes(normalizeRole(user.rol))).length
  };

  document.querySelectorAll('[data-users-summary]').forEach((element) => {
    const key = element.dataset.usersSummary;
    element.textContent = String(counts[key] || 0);
  });
}

function applyUserFilters() {
  if (!usersPanel || !usersList) return;
  const search = String(usersPanel.querySelector('[data-users-filter="search"]')?.value || '').trim().toLowerCase();
  const role = String(usersPanel.querySelector('[data-users-filter="role"]')?.value || '').trim();
  let visible = 0;

  usersList.querySelectorAll('[data-user-card]').forEach((card) => {
    const haystack = `${card.dataset.userNameFilter || ''} ${card.dataset.userEmailFilter || ''}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    const matchesRole = !role || normalizeRole(card.dataset.userRoleFilter) === role;
    const show = matchesSearch && matchesRole;
    card.hidden = !show;
    if (show) visible += 1;
  });

  const result = usersPanel.querySelector('[data-users-result-count]');
  if (result) result.textContent = `${visible} usuario${visible === 1 ? '' : 's'} en esta vista`;
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (role === 'admin') return 'administrador';
  if (role === 'lectura') return 'lector';
  if (role === 'secretariado') return 'gestor_miembros';
  if (role === 'tesorera') return 'tesorero';
  return role || 'editor';
}

function loadOptimizedStyles() {
  if (document.querySelector('link[data-users-panel-optimized]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'users-panel-optimized.css?v=20260924';
  link.dataset.usersPanelOptimized = 'true';
  document.head.appendChild(link);
}

function enhancePasswordField(input, label) {
  if (!input || input.parentElement?.classList.contains('password-field')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'password-field';
  input.parentNode.insertBefore(wrapper, input);
  wrapper.appendChild(input);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'password-eye-button';
  button.dataset.togglePassword = 'true';
  button.setAttribute('aria-label', label || 'Mostrar contraseña');
  button.textContent = '👁️';
  wrapper.appendChild(button);
}

function showUserTableMessage(message, ok) {
  if (!usersStatus) return;
  usersStatus.textContent = message;
  usersStatus.classList.toggle('success', ok);
  usersStatus.classList.toggle('error', !ok);
}
