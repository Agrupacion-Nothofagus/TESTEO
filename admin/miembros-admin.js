import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
let loaded = false;

const timer = setInterval(() => {
  const button = document.querySelector('[data-admin-view="miembros-view"]');
  const list = document.querySelector('#members-list');
  if (!button || !list) return;

  clearInterval(timer);
  installMemberAdmin(button, list);
}, 300);

function installMemberAdmin(button, list) {
  button.addEventListener('click', () => {
    if (!loaded) loadRequests();
  });

  document.querySelector('#reload-members')?.addEventListener('click', loadRequests);

  list.addEventListener('click', async (event) => {
    const save = event.target.closest('[data-save-member]');
    if (!save) return;
    await saveRequest(save.dataset.saveMember);
  });

  if (button.classList.contains('is-active')) loadRequests();
}

async function loadRequests() {
  const list = document.querySelector('#members-list');
  if (!list) return;

  loaded = true;
  list.innerHTML = '<p class="admin-status">Cargando solicitudes...</p>';

  try {
    const data = await api('/api/miembros');
    const items = data.solicitudes || [];

    if (!items.length) {
      list.innerHTML = '<div class="members-empty-state"><strong>No hay solicitudes registradas</strong><p>Cuando alguien complete el formulario ÚNETE, aparecerá en este módulo.</p></div>';
      return;
    }

    list.innerHTML = items.map(renderRequest).join('');
  } catch (error) {
    list.innerHTML = `<p class="admin-status error">${escapeHTML(error.message || 'No fue posible cargar solicitudes.')}</p>`;
  }
}

async function saveRequest(id) {
  const card = document.querySelector(`[data-member-card="${cssEscape(id)}"]`);
  const status = document.querySelector('#members-status');
  if (!card || !status) return;

  const estado = card.querySelector('[data-member-status]').value;
  const observaciones = card.querySelector('[data-member-notes]').value;

  try {
    status.textContent = 'Actualizando solicitud...';
    status.classList.add('success');
    status.classList.remove('error');

    await api('/api/miembros', {
      method: 'PATCH',
      body: JSON.stringify({ id, estado, observaciones })
    });

    status.textContent = 'Solicitud actualizada correctamente.';
    await loadRequests();
  } catch (error) {
    status.textContent = error.message || 'No fue posible actualizar la solicitud.';
    status.classList.add('error');
    status.classList.remove('success');
  }
}

function renderRequest(item) {
  const estado = item.estado || 'pendiente';
  return `
    <article class="member-request-card" data-member-card="${escapeAttr(item.id)}">
      <div class="member-request-main">
        <span class="member-status-pill ${escapeAttr(estado)}">${escapeHTML(labelStatus(estado))}</span>
        <h4>${escapeHTML(item.nombre)}</h4>
        <p>${escapeHTML(item.motivacion)}</p>
        <dl>
          <div><dt>Correo</dt><dd>${escapeHTML(item.correo)}</dd></div>
          <div><dt>Teléfono</dt><dd>${escapeHTML(item.telefono)}</dd></div>
          <div><dt>Edad</dt><dd>${escapeHTML(item.edad)}</dd></div>
          <div><dt>Comuna</dt><dd>${escapeHTML(item.comuna)}</dd></div>
          <div><dt>Fecha</dt><dd>${formatDate(item.created_at)}</dd></div>
        </dl>
        ${item.intereses ? `<div class="member-interests"><strong>Intereses</strong><p>${escapeHTML(item.intereses)}</p></div>` : ''}
      </div>

      <div class="member-request-actions">
        <label>Estado
          <select data-member-status>
            ${statusOption('pendiente', estado, 'Pendiente')}
            ${statusOption('contactado', estado, 'Contactado')}
            ${statusOption('aceptado', estado, 'Aceptado')}
            ${statusOption('rechazado', estado, 'Rechazado')}
            ${statusOption('archivado', estado, 'Archivado')}
          </select>
        </label>
        <label>Observaciones
          <textarea data-member-notes rows="4" placeholder="Notas internas del proceso">${escapeHTML(item.observaciones || '')}</textarea>
        </label>
        <button type="button" class="secondary-admin-button" data-save-member="${escapeAttr(item.id)}">Guardar cambios</button>
      </div>
    </article>
  `;
}

async function api(url, options = {}) {
  if (!client) throw new Error('Supabase no está configurado.');

  const session = await client.auth.getSession();
  const token = session.data?.session?.access_token;
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

function statusOption(value, current, label) {
  return `<option value="${value}" ${value === current ? 'selected' : ''}>${label}</option>`;
}

function labelStatus(value) {
  return {
    pendiente: 'Pendiente',
    contactado: 'Contactado',
    aceptado: 'Aceptado',
    rechazado: 'Rechazado',
    archivado: 'Archivado'
  }[value] || 'Pendiente';
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

function escapeAttr(value) {
  return escapeHTML(value);
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}