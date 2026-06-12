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
  const areas = normalizeAreas(item.areas_participacion || item.intereses);

  return `
    <article class="member-request-card" data-member-card="${escapeAttr(item.id)}">
      <div class="member-request-main">
        <span class="member-status-pill ${escapeAttr(estado)}">${escapeHTML(labelStatus(estado))}</span>
        <h4>${escapeHTML(item.nombre)}</h4>
        <p>${escapeHTML(item.motivacion)}</p>

        <div class="member-admin-section">
          <strong>Antecedentes personales</strong>
          <dl>
            <div><dt>RUT / documento</dt><dd>${escapeHTML(item.rut_documento || '—')}</dd></div>
            <div><dt>Nacimiento</dt><dd>${formatDate(item.fecha_nacimiento)}</dd></div>
            <div><dt>Edad</dt><dd>${escapeHTML(item.edad)}</dd></div>
            <div><dt>Menor de edad</dt><dd>${item.menor_edad ? 'Sí' : 'No'}</dd></div>
            <div><dt>Domicilio</dt><dd>${escapeHTML(item.domicilio || '—')}</dd></div>
            <div><dt>Comuna</dt><dd>${escapeHTML(item.comuna)}</dd></div>
            <div><dt>Teléfono</dt><dd>${escapeHTML(item.telefono)}</dd></div>
            <div><dt>Correo</dt><dd>${escapeHTML(item.correo)}</dd></div>
            <div><dt>Ocupación</dt><dd>${escapeHTML(item.ocupacion || '—')}</dd></div>
            <div><dt>Fecha solicitud</dt><dd>${formatDate(item.created_at)}</dd></div>
          </dl>
        </div>

        ${item.menor_edad ? renderAdultSection(item) : ''}

        <div class="member-admin-section">
          <strong>Categoría y vínculo</strong>
          <dl>
            <div><dt>Categoría solicitada</dt><dd>${escapeHTML(item.categoria_socio || '—')}</dd></div>
            <div><dt>Experiencia previa</dt><dd>${item.experiencia_previa ? 'Sí' : 'No'}</dd></div>
          </dl>
          <p><strong>Vínculo con la organización:</strong> ${escapeHTML(item.vinculo_organizacion || '—')}</p>
        </div>

        <div class="member-admin-section">
          <strong>Motivación e intereses</strong>
          ${areas.length ? `<ul class="member-areas-list">${areas.map((area) => `<li>${escapeHTML(area)}</li>`).join('')}</ul>` : '<p>Sin áreas declaradas.</p>'}
          ${item.otro_area ? `<p><strong>Otro:</strong> ${escapeHTML(item.otro_area)}</p>` : ''}
          <p><strong>Aporte declarado:</strong> ${escapeHTML(item.aporte || '—')}</p>
          ${item.experiencia_previa ? `<p><strong>Experiencia:</strong> ${escapeHTML(item.experiencia_descripcion || '—')}</p>` : ''}
        </div>
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
          <textarea data-member-notes rows="5" placeholder="Notas internas del proceso">${escapeHTML(item.observaciones || '')}</textarea>
        </label>
        <button type="button" class="secondary-admin-button" data-save-member="${escapeAttr(item.id)}">Guardar cambios</button>
      </div>
    </article>
  `;
}

function renderAdultSection(item) {
  return `
    <div class="member-admin-section member-adult-section">
      <strong>Adulto responsable</strong>
      <dl>
        <div><dt>Nombre</dt><dd>${escapeHTML(item.adulto_nombre || '—')}</dd></div>
        <div><dt>RUT</dt><dd>${escapeHTML(item.adulto_rut || '—')}</dd></div>
        <div><dt>Vínculo</dt><dd>${escapeHTML(item.adulto_vinculo || '—')}</dd></div>
        <div><dt>Teléfono</dt><dd>${escapeHTML(item.adulto_telefono || '—')}</dd></div>
        <div><dt>Correo</dt><dd>${escapeHTML(item.adulto_correo || '—')}</dd></div>
        <div><dt>Declaración</dt><dd>${item.adulto_declaracion ? 'Aceptada' : 'No registrada'}</dd></div>
      </dl>
    </div>
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

function normalizeAreas(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
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