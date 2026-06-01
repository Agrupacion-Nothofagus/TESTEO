const usersPanel = document.querySelector('#users-panel');
const userForm = document.querySelector('#user-create-form');
const reloadUsers = document.querySelector('#reload-users');
const usersList = document.querySelector('#users-list');

if (usersPanel && userForm) {
  const toolbar = document.createElement('div');
  toolbar.className = 'users-table-toolbar';
  toolbar.innerHTML = `
    <button type="button" class="secondary-admin-button" id="toolbar-reload-users">Actualizar listado</button>
    <button type="button" class="secondary-admin-button" id="toggle-create-user">Crear usuario</button>
  `;

  userForm.parentNode.insertBefore(toolbar, userForm);
  userForm.classList.add('user-create-form-collapsed');

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
