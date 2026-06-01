const usersPanel = document.querySelector('#users-panel');
const userForm = document.querySelector('#user-create-form');
const reloadUsers = document.querySelector('#reload-users');
const usersList = document.querySelector('#users-list');
const createPassword = document.querySelector('#user-password');
const usersStatus = document.querySelector('#users-status');

let allowNativeDeleteConfirm = false;
let pendingDeleteButton = null;

if (usersPanel && userForm) {
  installDeleteModal();
  installConfirmInterceptor();

  const addToolbar = document.createElement('div');
  addToolbar.className = 'users-add-toolbar';
  addToolbar.innerHTML = `
    <button type="button" class="secondary-admin-button" id="toggle-create-user">Añadir usuario</button>
  `;

  userForm.parentNode.insertBefore(addToolbar, userForm);
  userForm.classList.add('user-create-form-collapsed');

  const createActions = document.createElement('div');
  createActions.className = 'user-create-actions-bottom';
  createActions.innerHTML = `
    <button type="submit" class="secondary-admin-button">Crear usuario</button>
  `;
  userForm.appendChild(createActions);

  enhancePasswordField(createPassword, 'Mostrar u ocultar contraseña inicial');

  const tableToolbar = document.createElement('div');
  tableToolbar.className = 'users-table-toolbar';
  tableToolbar.innerHTML = `
    <button type="button" class="secondary-admin-button" id="toolbar-reload-users">Actualizar listado</button>
  `;

  if (usersList) {
    usersList.parentNode.insertBefore(tableToolbar, usersList);
  }

  if (usersList && !document.querySelector('.users-table-header')) {
    const header = document.createElement('div');
    header.className = 'users-table-header';
    header.setAttribute('aria-hidden', 'true');
    header.innerHTML = `
      <span>Usuario</span>
      <span>Correo electrónico</span>
      <span>Rol</span>
      <span>Restablecer contraseña</span>
      <span>Acciones</span>
    `;
    usersList.parentNode.insertBefore(header, usersList);
  }

  document.querySelector('#toggle-create-user')?.addEventListener('click', () => {
    userForm.classList.toggle('user-create-form-collapsed');
  });

  document.querySelector('#toolbar-reload-users')?.addEventListener('click', () => {
    reloadUsers?.click();
  });

  observePasswordFields();
  observeActionMenus();
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

document.addEventListener('change', (event) => {
  const select = event.target.closest('[data-user-action-menu]');
  if (!select || !select.value) return;

  const row = select.closest('.user-admin-card');
  const action = select.value;
  select.value = '';

  if (action === 'save') {
    row?.querySelector('[data-save-user]')?.click();
  }

  if (action === 'suspend') {
    showUserTableMessage('La opción Suspender requiere activar el endpoint seguro de suspensión en Cloudflare.', false);
  }

  if (action === 'remove') {
    row?.querySelector('[data-remove-user]')?.click();
  }
});

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

  pendingDeleteButton = document.activeElement?.closest?.('[data-remove-user]') || pendingDeleteButton;
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

function observeActionMenus() {
  enhanceAllActionMenus();

  if (!usersList) return;
  const observer = new MutationObserver(() => enhanceAllActionMenus());
  observer.observe(usersList, { childList: true, subtree: true });
}

function enhanceAllPasswordFields() {
  document.querySelectorAll('#users-panel input[type="password"], #users-panel input[data-user-password]').forEach((input) => {
    enhancePasswordField(input, 'Mostrar u ocultar contraseña');
  });
}

function enhanceAllActionMenus() {
  document.querySelectorAll('.user-admin-actions').forEach((actions) => {
    if (actions.querySelector('[data-user-action-menu]')) return;

    const menu = document.createElement('select');
    menu.className = 'user-action-menu';
    menu.dataset.userActionMenu = 'true';
    menu.innerHTML = `
      <option value="">Seleccionar acción</option>
      <option value="save">Guardar cambios</option>
      <option value="suspend">Suspender</option>
      <option value="remove">Eliminar usuario</option>
    `;
    actions.prepend(menu);
  });
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
