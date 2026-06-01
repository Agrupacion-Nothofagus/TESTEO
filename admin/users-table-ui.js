const usersPanel = document.querySelector('#users-panel');
const userForm = document.querySelector('#user-create-form');
const reloadUsers = document.querySelector('#reload-users');
const usersList = document.querySelector('#users-list');
const createPassword = document.querySelector('#user-password');

if (usersPanel && userForm) {
  const addToolbar = document.createElement('div');
  addToolbar.className = 'users-add-toolbar';
  addToolbar.innerHTML = `
    <button type="button" class="secondary-admin-button" id="toggle-create-user">Añadir usuario</button>
  `;

  userForm.parentNode.insertBefore(addToolbar, userForm);
  userForm.classList.add('user-create-form-collapsed');

  const createTopbar = document.createElement('div');
  createTopbar.className = 'user-create-topbar';
  createTopbar.innerHTML = `
    <button type="submit" class="secondary-admin-button">Crear usuario</button>
  `;
  userForm.insertBefore(createTopbar, userForm.firstElementChild);

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
      <span>Rol</span>
      <span>Contraseña</span>
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
