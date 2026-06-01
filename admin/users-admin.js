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

async function api(url, options = {}) {
  if (!client) throw new Error('Supabase no está configurado.');

  const sessionResponse = await client.auth.getSession();
  const token = sessionResponse.data?.session?.access_token;
  if (!token) throw new Error('Sesión no disponible. Vuelve a iniciar sesión.');

  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error de solicitud.');
  return data;
}

function renderUser(user) {
  return `
    <article class="user-admin-card">
      <div>
        <h4>${escapeHTML(user.email)}</h4>
        <p>${escapeHTML(user.nombre || 'Sin nombre')} · ${escapeHTML(user.rol || 'editor')}</p>
        <small>Creado: ${formatDate(user.created_at)}${user.last_sign_in_at ? ` · Último ingreso: ${formatDate(user.last_sign_in_at)}` : ''}</small>
      </div>
      <span class="user-admin-badge">${user.email_confirmed_at ? 'Confirmado' : 'Pendiente'}</span>
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
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function escapeHTML(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
