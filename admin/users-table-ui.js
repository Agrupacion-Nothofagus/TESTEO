const usersPanel = document.querySelector('#users-panel');
const userForm = document.querySelector('#user-create-form');
const reloadUsers = document.querySelector('#reload-users');

if (usersPanel && userForm) {
  const toolbar = document.createElement('div');
  toolbar.className = 'users-table-toolbar';
  toolbar.innerHTML = `
    <button type="button" class="join-button" id="toggle-create-user">Crear usuario</button>
    <button type="button" class="secondary-admin-button" id="toolbar-reload-users">Actualizar listado</button>
  `;

  userForm.parentNode.insertBefore(toolbar, userForm);
  userForm.classList.add('user-create-form-collapsed');

  document.querySelector('#toggle-create-user')?.addEventListener('click', () => {
    userForm.classList.toggle('user-create-form-collapsed');
  });

  document.querySelector('#toolbar-reload-users')?.addEventListener('click', () => {
    reloadUsers?.click();
  });
}
