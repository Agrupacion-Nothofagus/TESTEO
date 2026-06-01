import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const form = document.querySelector('#user-create-form');
const status = document.querySelector('#users-status');
const list = document.querySelector('#users-list');
const reload = document.querySelector('#reload-users');
const usersViewButton = document.querySelector('[data-admin-view="usuarios-view"]');

const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let loadedOnce = false;

usersViewButton?.addEventListener('click', () => {
  if (!loadedOnce) loadUsers();
});

reload?.addEventListener('click', loadUsers);

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = document.querySelector('#user-email').value.trim().toLowerCase();
  const password = document.querySelector('#user-password').value.trim();
  const nombre = document.querySelector('#user-name').value.trim();
  const rol = document.querySelector('#user-role').value;

  if (!email.endsWith('@agrupacionnothofagus.cl')) {
    show('El correo debe usar @agrupacionnothofagus.cl.', false);
    return;
  }

  try {
    show('Creando usuario...', true);

    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, nombre, rol })
    });

    form.reset();
    document.querySelector('#user-role').value = 'editor';

    show('Usuario creado correctamente.', true);
    await loadUsers();
  } catch (error) {
    show(error.message || 'No fue posible crear el usuario.', false);
  }
});

list?.addEventListener('click', async (event) => {
  const saveButton = event.target.closest('[data-save-user]');
  const removeButton = event.target.closest('[data-remove-user]');

  if (saveButton) {
    await updateUser(saveButton.dataset.saveUser);
  }

  if (removeButton) {
    await removeUser(removeButton.dataset.removeUser, removeButton.dataset.userEmail);
  }
});

async function loadUsers() {
  loadedOnce = true;
  list.innerHTML = '<p class="admin-status">Cargando usuarios...</p>';

  try {
    const data = await api('/api/users');
    const users = data.users || [];

    if (!users.length) {
      list.innerHTML = '<p class="admin-status">No hay usuarios disponibles.</p>';
      return;
    }

    list.innerHTML = users.map(renderUser).join('');
  } catch (error) {
    list.innerHTML = `<p class="admin-status error">${escapeHTML(error.message || 'No fue posible cargar usuarios.')}</p>`;
  }
}

async function updateUser(id) {
  const card = list.querySelector(`[data-user-card="${cssEscape(id)}"]`);
  if (!card) return;

  const nombre = card.querySelector('[data-user-name]').value.trim();
  const rol = card.querySelector('[data-user-role]').value;
  const password = card.querySelector('[data-user-password]').value.trim();

  try {
    show('Actualizando usuario...', true);

    await api('/api/users', {
      method: 'PATCH',
      body: JSON.stringify({
        id,
        nombre,
        rol,
        password
      })
    });

    show('Usuario actualizado correctamente.', true);
    await loadUsers();
  } catch (error) {
    show(error.message || 'No fue posible actualizar el usuario.', false);
  }
}

async function removeUser(id, email) {
  const confirmacion = confirm(`¿Eliminar el usuario ${email}? Esta acción no se puede deshacer.`);

  if (!confirmacion) return;

  try {
    show('Eliminando usuario...', true);

    await api('/api/users', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    });

    show('Usuario eliminado correctamente.', true);
    await loadUsers();
  } catch (error) {
    show(error.message || 'No fue posible eliminar el usuario.', false);
  }
}

async function api(url, options = {}) {
  if (!client) {
    throw new Error('Supabase no está configurado.');
  }

  const sessionResponse = await client.auth.getSession();
  const token = sessionResponse.data?.session?.access_token;

  if (!token) {
    throw new Error('Sesión no disponible. Vuelve a iniciar sesión.');
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Error de solicitud.');
  }

  return data;
}

function renderUser(user) {
  return `
    <article class="user-admin-card user-admin-edit-card" data-user-card="${escapeAttr(user.id)}">
      <div class="user-admin-main">
        <div class="user-admin-headline">
          <div>
            <h4>${escapeHTML(user.email)}</h4>
            <small>
              Creado: ${formatDate(user.created_at)}
              ${user.last_sign_in_at ? ` · Último ingreso: ${formatDate(user.last_sign_in_at)}` : ''}
            </small>
          </div>

          <span class="user-admin-badge">
            ${user.email_confirmed_at ? 'Confirmado' : 'Pendiente'}
          </span>
        </div>

        <div class="user-admin-fields">
          <label>
            Nombre o identificación
            <input data-user-name type="text" value="${escapeAttr(user.nombre || '')}" placeholder="Nombre del usuario">
          </label>

          <label>
            Rol
            <select data-user-role>
              <option value="administrador" ${user.rol === 'administrador' ? 'selected' : ''}>Administrador</option>
              <option value="editor" ${user.rol === 'editor' ? 'selected' : ''}>Editor</option>
              <option value="lector" ${user.rol === 'lector' ? 'selected' : ''}>Lector</option>
            </select>
          </label>

          <label>
            Nueva contraseña, opcional
            <input data-user-password type="password" minlength="8" placeholder="Dejar vacío para no cambiar">
          </label>
        </div>
      </div>

      <div class="user-admin-actions">
        <button type="button" class="secondary-admin-button" data-save-user="${escapeAttr(user.id)}">
          Guardar cambios
        </button>

        <button type="button" class="user-delete-button" data-remove-user="${escapeAttr(user.id)}" data-user-email="${escapeAttr(user.email)}">
          Eliminar usuario
        </button>
      </div>
    </article>
  `;
}

function show(message, ok) {
  status.textContent = message;
  status.classList.toggle('success', ok);
  status.classList.toggle('error', !ok);
}

function formatDate(value) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value));
}

function escapeHTML(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);

  return String(value).replaceAll('"', '\\"');
}
