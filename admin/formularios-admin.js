import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const VIEW_ID = 'formularios-view';
const ESTADOS = ['nuevo', 'leido', 'respondido', 'archivado'];
const ROLES_FORMULARIOS = ['administrador', 'admin', 'gestor_miembros', 'secretariado'];
let mensajes = [];
let cargado = false;

instalarModuloFormularios();

function instalarModuloFormularios() {
  cargarEstilos();
  instalarSidebar();
  instalarVista();
  aplicarPermisos();
  window.addEventListener('nothofagus:admin-view', (event) => {
    if (event.detail?.viewId === VIEW_ID) cargarMensajes();
  });
}

function cargarEstilos() {
  if (document.querySelector('link[href^="formularios-admin.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'formularios-admin.css?v=20260706-formularios';
  document.head.appendChild(link);
}

function instalarSidebar() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || document.querySelector(`[data-admin-view="${VIEW_ID}"]`)) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sidebar-link is-hidden';
  button.dataset.adminView = VIEW_ID;
  button.dataset.formulariosSidebar = 'true';
  button.innerHTML = '<span>📨</span> Formularios';
  nav.appendChild(button);
}

function instalarVista() {
  const adminContent = document.querySelector('.admin-content');
  if (!adminContent || document.getElementById(VIEW_ID)) return;

  const section = document.createElement('section');
  section.className = 'admin-view formularios-admin-view';
  section.id = VIEW_ID;
  section.dataset.viewTitle = 'Formularios';
  section.dataset.viewDescription = 'Respuestas recibidas desde el formulario de contacto de la página principal.';
  section.innerHTML = `
    <div class="admin-panel formularios-panel">
      <div class="panel-heading formularios-heading-row">
        <div>
          <p class="section-tag">Contacto web</p>
          <h3>Formularios recibidos</h3>
          <p>Mensajes enviados desde el formulario de contacto del sitio público.</p>
        </div>
        <button type="button" class="secondary-admin-button" data-formularios-reload>Actualizar</button>
      </div>

      <div class="formularios-summary-grid" aria-label="Resumen de formularios">
        <article class="formularios-summary-card"><span>Total</span><strong data-formularios-total>0</strong></article>
        <article class="formularios-summary-card"><span>Nuevos</span><strong data-formularios-nuevos>0</strong></article>
        <article class="formularios-summary-card"><span>Respondidos</span><strong data-formularios-respondidos>0</strong></article>
        <article class="formularios-summary-card"><span>Archivados</span><strong data-formularios-archivados>0</strong></article>
      </div>

      <div class="formularios-toolbar">
        <label>Buscar
          <input type="search" data-formularios-filter="buscar" placeholder="Nombre, correo, asunto o mensaje">
        </label>
        <label>Estado
          <select data-formularios-filter="estado">
            <option value="">Todos</option>
            <option value="nuevo">Nuevo</option>
            <option value="leido">Leído</option>
            <option value="respondido">Respondido</option>
            <option value="archivado">Archivado</option>
          </select>
        </label>
        <label>Fecha
          <input type="date" data-formularios-filter="fecha">
        </label>
        <button type="button" class="secondary-admin-button" data-formularios-clear>Limpiar</button>
      </div>

      <p class="admin-status" data-formularios-status></p>
      <div class="formularios-list" data-formularios-list>
        <p class="admin-status">Cargando formularios...</p>
      </div>
    </div>
  `;

  adminContent.appendChild(section);
  section.querySelector('[data-formularios-reload]')?.addEventListener('click', () => cargarMensajes(true));
  section.querySelector('[data-formularios-clear]')?.addEventListener('click', limpiarFiltros);
  section.querySelectorAll('[data-formularios-filter]').forEach((input) => {
    input.addEventListener('input', renderizarMensajes);
    input.addEventListener('change', renderizarMensajes);
  });
}

async function aplicarPermisos() {
  if (!client) return;
  const { data } = await client.auth.getSession();
  const user = data?.session?.user;
  if (!user || !puedeVerFormularios(user)) return;
  document.querySelector('[data-formularios-sidebar]')?.classList.remove('is-hidden');
}

function puedeVerFormularios(user) {
  return ROLES_FORMULARIOS.includes(obtenerRol(user));
}

async function cargarMensajes(force = false) {
  if (!force && cargado) return;
  const status = document.querySelector('[data-formularios-status]');
  const list = document.querySelector('[data-formularios-list]');
  if (!client || !list) return;

  try {
    setStatus(status, 'Cargando formularios...', true);
    const token = await obtenerToken();
    const response = await fetch('/api/contacto', {
      headers: { authorization: 'Bearer ' + token }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No fue posible cargar formularios.');
    mensajes = Array.isArray(data.mensajes) ? data.mensajes : [];
    cargado = true;
    renderizarMensajes();
    setStatus(status, 'Formularios actualizados.', true);
  } catch (error) {
    mensajes = [];
    renderizarMensajes();
    setStatus(status, error.message || 'No fue posible cargar formularios.', false);
  }
}

async function actualizarMensaje(id, estado, observaciones = '') {
  const status = document.querySelector('[data-formularios-status]');
  try {
    const token = await obtenerToken();
    const response = await fetch('/api/contacto', {
      method: 'PATCH',
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({ id, estado, observaciones })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No fue posible actualizar el formulario.');
    const index = mensajes.findIndex((item) => item.id === id);
    if (index >= 0) mensajes[index] = data.mensaje;
    renderizarMensajes();
    setStatus(status, 'Formulario actualizado.', true);
  } catch (error) {
    setStatus(status, error.message || 'No fue posible actualizar el formulario.', false);
  }
}

async function eliminarMensaje(id) {
  if (!confirm('¿Eliminar este mensaje de contacto?')) return;
  const status = document.querySelector('[data-formularios-status]');
  try {
    const token = await obtenerToken();
    const response = await fetch('/api/contacto?id=' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { authorization: 'Bearer ' + token }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No fue posible eliminar el formulario.');
    mensajes = mensajes.filter((item) => item.id !== id);
    renderizarMensajes();
    setStatus(status, 'Formulario eliminado.', true);
  } catch (error) {
    setStatus(status, error.message || 'No fue posible eliminar el formulario.', false);
  }
}

function renderizarMensajes() {
  const list = document.querySelector('[data-formularios-list]');
  if (!list) return;
  actualizarResumen();
  const filtrados = filtrarMensajes();
  if (!filtrados.length) {
    list.innerHTML = '<p class="admin-status">No hay formularios para mostrar.</p>';
    return;
  }

  list.innerHTML = filtrados.map((item) => `
    <article class="formulario-card" data-formulario-id="${escapeAttr(item.id)}">
      <div class="formulario-card-header">
        <div>
          <span class="formulario-badge ${escapeAttr(item.estado)}">${etiquetaEstado(item.estado)}</span>
          <h4>${escapeHTML(item.asunto || 'Sin asunto')}</h4>
          <div class="formulario-card-meta">
            <span>${escapeHTML(formatearFechaHora(item.created_at))}</span>
            <span>·</span>
            <span>${escapeHTML(item.origen || 'formulario_contacto')}</span>
          </div>
        </div>
      </div>

      <div class="formulario-contact-grid">
        <div class="formulario-field"><span>Nombre</span><strong>${escapeHTML(item.nombre)}</strong></div>
        <div class="formulario-field"><span>Teléfono</span><a href="tel:${escapeAttr(item.telefono)}">${escapeHTML(item.telefono)}</a></div>
        <div class="formulario-field"><span>Correo</span><a href="mailto:${escapeAttr(item.correo)}">${escapeHTML(item.correo)}</a></div>
      </div>

      <p class="formulario-message">${escapeHTML(item.mensaje)}</p>

      <div class="formulario-notes">
        <label for="observaciones-${escapeAttr(item.id)}">Observaciones internas</label>
        <textarea id="observaciones-${escapeAttr(item.id)}" data-formulario-notes="${escapeAttr(item.id)}" placeholder="Agrega observaciones internas">${escapeHTML(item.observaciones || '')}</textarea>
      </div>

      <div class="formulario-actions">
        <a href="mailto:${escapeAttr(item.correo)}?subject=${encodeURIComponent('Re: ' + (item.asunto || 'Contacto Nothofagus'))}">Responder por correo</a>
        <button type="button" data-formulario-action="leido" data-id="${escapeAttr(item.id)}">Marcar leído</button>
        <button type="button" data-formulario-action="respondido" data-id="${escapeAttr(item.id)}">Marcar respondido</button>
        <button type="button" data-formulario-action="archivado" data-id="${escapeAttr(item.id)}">Archivar</button>
        <button type="button" class="danger" data-formulario-action="delete" data-id="${escapeAttr(item.id)}">Eliminar</button>
      </div>
    </article>
  `).join('');

  list.querySelectorAll('[data-formulario-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      const action = button.dataset.formularioAction;
      const notes = list.querySelector(`[data-formulario-notes="${cssEscape(id)}"]`)?.value || '';
      if (action === 'delete') eliminarMensaje(id);
      else actualizarMensaje(id, action, notes);
    });
  });
}

function filtrarMensajes() {
  const buscar = document.querySelector('[data-formularios-filter="buscar"]')?.value.trim().toLowerCase() || '';
  const estado = document.querySelector('[data-formularios-filter="estado"]')?.value || '';
  const fecha = document.querySelector('[data-formularios-filter="fecha"]')?.value || '';

  return mensajes.filter((item) => {
    const texto = [item.nombre, item.correo, item.telefono, item.asunto, item.mensaje].join(' ').toLowerCase();
    const fechaItem = String(item.created_at || '').slice(0, 10);
    if (buscar && !texto.includes(buscar)) return false;
    if (estado && item.estado !== estado) return false;
    if (fecha && fechaItem !== fecha) return false;
    return true;
  });
}

function actualizarResumen() {
  setText('[data-formularios-total]', mensajes.length);
  setText('[data-formularios-nuevos]', mensajes.filter((item) => item.estado === 'nuevo').length);
  setText('[data-formularios-respondidos]', mensajes.filter((item) => item.estado === 'respondido').length);
  setText('[data-formularios-archivados]', mensajes.filter((item) => item.estado === 'archivado').length);
}

function limpiarFiltros() {
  document.querySelectorAll('[data-formularios-filter]').forEach((input) => { input.value = ''; });
  renderizarMensajes();
}

async function obtenerToken() {
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sesión no disponible. Inicia sesión nuevamente.');
  return token;
}

function obtenerRol(user) {
  return String(user?.user_metadata?.rol || user?.user_metadata?.role || user?.app_metadata?.rol || user?.app_metadata?.role || '').trim().toLowerCase();
}

function etiquetaEstado(estado) {
  return ({ nuevo: 'Nuevo', leido: 'Leído', respondido: 'Respondido', archivado: 'Archivado' })[estado] || 'Nuevo';
}

function formatearFechaHora(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function setStatus(element, message, ok) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('success', Boolean(ok));
  element.classList.toggle('error', !ok);
}

function setText(selector, value) {
  document.querySelector(selector)?.replaceChildren(document.createTextNode(String(value ?? '0')));
}

function escapeHTML(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}
