import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const STORAGE_KEY = 'nothofagus_tesoreria_v1';
const ROLES_TESORERIA = ['administrador', 'admin', 'tesorero', 'tesorera'];
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let movimientos = [];
let movimientosLocalesIniciales = [];

if (!window.__nothofagusTesoreriaAdmin) {
  window.__nothofagusTesoreriaAdmin = true;
  cargarEstilosTesoreria();
  initTesoreria();
}

async function initTesoreria() {
  const user = await obtenerUsuarioActual();
  const rol = obtenerRol(user);
  if (!ROLES_TESORERIA.includes(rol)) return;

  movimientosLocalesIniciales = cargarMovimientosLocales();
  movimientos = movimientosLocalesIniciales;

  instalarVistasTesoreria();
  instalarSidebarTesoreria();
  instalarEventosTesoreria();
  renderTesoreria();

  await cargarMovimientosRemotos();

  if (location.hash === '#tesoreria') activarVistaTesoreria('general');
  if (location.hash === '#tesoreria-ingresos') activarVistaTesoreria('ingresos');
  if (location.hash === '#tesoreria-egresos') activarVistaTesoreria('egresos');
}

function cargarEstilosTesoreria() {
  if (document.querySelector('link[href="tesoreria-admin.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'tesoreria-admin.css';
  document.head.appendChild(link);
}

async function obtenerUsuarioActual() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session?.user || null;
}

function obtenerRol(user) {
  return String(user?.user_metadata?.rol || user?.user_metadata?.role || user?.app_metadata?.rol || user?.app_metadata?.role || '').trim().toLowerCase();
}

async function getToken() {
  if (!client) return '';
  const { data } = await client.auth.getSession();
  return data?.session?.access_token || '';
}

async function apiTesoreria(path = '/api/tesoreria', options = {}) {
  const token = await getToken();
  if (!token) throw new Error('Sesión no disponible para Tesorería.');

  const response = await fetch(path, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8',
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error en Tesorería.');
  return data;
}

async function cargarMovimientosRemotos() {
  try {
    mostrarEstadoTesoreria('ingreso', 'Cargando movimientos desde Supabase...', true);
    const data = await apiTesoreria();
    const remotos = Array.isArray(data.movimientos) ? data.movimientos.filter(Boolean) : [];

    if (!remotos.length && movimientosLocalesIniciales.length) {
      await migrarLocalesASupabase(movimientosLocalesIniciales);
      const recarga = await apiTesoreria();
      movimientos = Array.isArray(recarga.movimientos) ? recarga.movimientos.filter(Boolean) : [];
      guardarMovimientosLocales(movimientos);
      renderTesoreria();
      mostrarEstadoTesoreria('ingreso', 'Movimientos locales migrados a Supabase.', true);
      mostrarEstadoTesoreria('egreso', 'Movimientos locales migrados a Supabase.', true);
      return;
    }

    movimientos = remotos;
    guardarMovimientosLocales(movimientos);
    renderTesoreria();
    limpiarEstadosTesoreria();
  } catch (error) {
    mostrarEstadoTesoreria('ingreso', error.message || 'No fue posible cargar Tesorería desde Supabase.', false);
    mostrarEstadoTesoreria('egreso', error.message || 'No fue posible cargar Tesorería desde Supabase.', false);
  }
}

async function migrarLocalesASupabase(items) {
  for (const item of items) {
    if (!item?.tipo || !item?.descripcion || !Number(item?.monto)) continue;
    await apiTesoreria('/api/tesoreria', {
      method: 'POST',
      body: JSON.stringify({
        tipo: item.tipo,
        fecha: item.fecha || new Date().toISOString().slice(0, 10),
        descripcion: item.descripcion,
        monto: Number(item.monto),
        observaciones: item.observaciones || ''
      })
    });
  }
}

function instalarSidebarTesoreria() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || document.querySelector('[data-tesoreria-sidebar]')) return;

  const group = document.createElement('div');
  group.className = 'tesoreria-sidebar-group';
  group.dataset.tesoreriaSidebar = 'true';
  group.innerHTML = `
    <button type="button" class="sidebar-link tesoreria-sidebar-toggle" data-tesoreria-toggle aria-expanded="false" aria-controls="tesoreria-sidebar-menu">
      <span>💰</span>
      Tesorería
      <strong class="tesoreria-toggle-caret" aria-hidden="true">⌄</strong>
    </button>
    <div class="tesoreria-sidebar-menu is-collapsed" id="tesoreria-sidebar-menu" data-tesoreria-menu>
      <button type="button" class="sidebar-link tesoreria-sidebar-link" data-tesoreria-open="general"><span>📊</span>General</button>
      <button type="button" class="sidebar-link tesoreria-sidebar-link" data-tesoreria-open="ingresos"><span>📥</span>Ingresos</button>
      <button type="button" class="sidebar-link tesoreria-sidebar-link" data-tesoreria-open="egresos"><span>📤</span>Egresos</button>
    </div>
  `;

  nav.appendChild(group);
  group.querySelector('[data-tesoreria-toggle]')?.addEventListener('click', alternarMenuTesoreria);
  group.querySelectorAll('[data-tesoreria-open]').forEach((button) => {
    button.addEventListener('click', () => activarVistaTesoreria(button.dataset.tesoreriaOpen));
  });
}

function instalarVistasTesoreria() {
  const content = document.querySelector('.admin-content');
  if (!content || document.querySelector('#tesoreria-general-view')) return;

  content.appendChild(crearVistaTesoreria('tesoreria-general-view', 'Tesorería general', 'Resumen automático de ingresos, egresos y saldo institucional.', getGeneralTemplate()));
  content.appendChild(crearVistaTesoreria('tesoreria-ingresos-view', 'Ingresos', 'Registra entradas de dinero con descripción y monto.', getMovimientoTemplate('ingreso')));
  content.appendChild(crearVistaTesoreria('tesoreria-egresos-view', 'Egresos', 'Registra salidas de dinero con descripción y monto.', getMovimientoTemplate('egreso')));
}

function crearVistaTesoreria(id, title, description, template) {
  const section = document.createElement('section');
  section.className = 'admin-view tesoreria-view';
  section.id = id;
  section.dataset.viewTitle = title;
  section.dataset.viewDescription = description;
  section.innerHTML = template;
  return section;
}

function getGeneralTemplate() {
  return `
    <div class="admin-panel tesoreria-panel">
      <div class="tesoreria-topbar">
        <div>
          <p class="section-tag">Administración financiera</p>
          <h3>Tesorería general</h3>
          <p>Resumen automático de ingresos, egresos y saldo disponible según los movimientos registrados.</p>
        </div>
        <div class="tesoreria-actions-row">
          <button type="button" data-tesoreria-go="ingresos">Registrar ingreso</button>
          <button type="button" data-tesoreria-go="egresos">Registrar egreso</button>
        </div>
      </div>
      <div class="tesoreria-summary-grid">
        <article class="tesoreria-summary-card ingresos"><span>Total ingresos</span><strong data-tesoreria-total="ingresos">$0</strong></article>
        <article class="tesoreria-summary-card egresos"><span>Total egresos</span><strong data-tesoreria-total="egresos">$0</strong></article>
        <article class="tesoreria-summary-card saldo" data-tesoreria-saldo-card><span>Saldo general</span><strong data-tesoreria-total="saldo">$0</strong></article>
      </div>
      <section class="tesoreria-list-card">
        <h4>Últimos movimientos</h4>
        <div class="tesoreria-list" data-tesoreria-list="general"></div>
      </section>
    </div>
  `;
}

function getMovimientoTemplate(tipo) {
  const label = tipo === 'ingreso' ? 'Ingresos' : 'Egresos';
  const action = tipo === 'ingreso' ? 'Registrar ingreso' : 'Registrar egreso';
  const text = tipo === 'ingreso' ? 'entrada de dinero' : 'salida de dinero';

  return `
    <div class="admin-panel tesoreria-panel">
      <div class="tesoreria-topbar">
        <div>
          <p class="section-tag">Tesorería</p>
          <h3>${label}</h3>
          <p>Registra cada ${text} con una descripción y un monto.</p>
        </div>
        <div class="tesoreria-actions-row"><button type="button" data-tesoreria-go="general">Ver general</button></div>
      </div>
      <section class="tesoreria-form-card">
        <h4>${action}</h4>
        <form class="tesoreria-form" data-tesoreria-form="${tipo}">
          <label>Fecha<input name="fecha" type="date" required></label>
          <label>Descripción<input name="descripcion" type="text" placeholder="Ej: cuota socio, compra de insumos" required></label>
          <label>Monto<input name="monto" type="number" min="1" step="1" placeholder="0" required></label>
          <button type="submit">Guardar</button>
        </form>
        <p class="admin-status tesoreria-status" data-tesoreria-status="${tipo}" aria-live="polite"></p>
      </section>
      <section class="tesoreria-list-card">
        <h4>Registro de ${label.toLowerCase()}</h4>
        <div class="tesoreria-list" data-tesoreria-list="${tipo}"></div>
      </section>
    </div>
  `;
}

function instalarEventosTesoreria() {
  document.querySelectorAll('[data-tesoreria-form]').forEach((form) => {
    form.querySelector('input[name="fecha"]').valueAsDate = new Date();
    form.addEventListener('submit', guardarMovimiento);
  });

  document.querySelectorAll('[data-tesoreria-go]').forEach((button) => {
    button.addEventListener('click', () => activarVistaTesoreria(button.dataset.tesoreriaGo));
  });

  document.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-tesoreria-delete]');
    if (deleteButton) eliminarMovimiento(deleteButton.dataset.tesoreriaDelete);

    if (event.target.closest('[data-tesoreria-sidebar], [data-tesoreria-toggle], [data-tesoreria-open]')) return;
    if (event.target.closest('[data-publicaciones-toggle], [data-members-toggle], [data-actas-toggle], [data-admin-view]')) cerrarMenuTesoreria();
  }, true);
}

async function guardarMovimiento(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const tipo = form.dataset.tesoreriaForm;
  const descripcion = form.descripcion.value.trim();
  const monto = Number(form.monto.value);
  const fecha = form.fecha.value;

  if (!descripcion || !monto || monto <= 0) {
    mostrarEstadoTesoreria(tipo, 'Completa descripción y monto válido.', false);
    return;
  }

  try {
    mostrarEstadoTesoreria(tipo, 'Guardando movimiento en Supabase...', true);
    const data = await apiTesoreria('/api/tesoreria', {
      method: 'POST',
      body: JSON.stringify({ tipo, descripcion, monto, fecha })
    });

    if (data.movimiento) movimientos.unshift(data.movimiento);
    guardarMovimientosLocales(movimientos);
    form.reset();
    form.fecha.valueAsDate = new Date();
    renderTesoreria();
    mostrarEstadoTesoreria(tipo, `${tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} registrado correctamente.`, true);
  } catch (error) {
    mostrarEstadoTesoreria(tipo, error.message || 'No fue posible guardar el movimiento.', false);
  }
}

async function eliminarMovimiento(id) {
  const item = movimientos.find((mov) => mov.id === id);
  if (!item || item.eliminado) return;
  if (!confirm(`¿Marcar como eliminado el movimiento "${item.descripcion}"? Se conservará la auditoría del usuario que lo eliminó.`)) return;

  try {
    const data = await apiTesoreria(`/api/tesoreria?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (data.movimiento) movimientos = movimientos.map((mov) => mov.id === id ? data.movimiento : mov);
    guardarMovimientosLocales(movimientos);
    renderTesoreria();
    mostrarEstadoTesoreria(item.tipo, 'Movimiento marcado como eliminado con auditoría.', true);
  } catch (error) {
    mostrarEstadoTesoreria(item.tipo, error.message || 'No fue posible marcar el movimiento como eliminado.', false);
  }
}

function activarVistaTesoreria(tipo) {
  const viewId = `tesoreria-${tipo}-view`;
  const view = document.querySelector(`#${viewId}`);
  if (!view) return;

  abrirMenuTesoreria();
  cerrarOtrosMenus();

  document.querySelectorAll('.admin-view').forEach((item) => item.classList.toggle('is-active', item.id === viewId));
  document.querySelectorAll('[data-admin-view]').forEach((button) => button.classList.remove('is-active'));
  document.querySelectorAll('[data-tesoreria-open]').forEach((button) => button.classList.toggle('is-active', button.dataset.tesoreriaOpen === tipo));
  document.querySelector('[data-tesoreria-toggle]')?.classList.add('is-active');

  const title = document.querySelector('#admin-view-title');
  const description = document.querySelector('#admin-view-description');
  if (title) title.textContent = view.dataset.viewTitle || 'Tesorería';
  if (description) description.textContent = view.dataset.viewDescription || '';

  location.hash = tipo === 'general' ? 'tesoreria' : `tesoreria-${tipo}`;
  renderTesoreria();
}

function renderTesoreria() {
  const activos = movimientos.filter((item) => !item.eliminado);
  const ingresos = activos.filter((item) => item.tipo === 'ingreso').reduce((sum, item) => sum + Number(item.monto || 0), 0);
  const egresos = activos.filter((item) => item.tipo === 'egreso').reduce((sum, item) => sum + Number(item.monto || 0), 0);
  const saldo = ingresos - egresos;

  setText('[data-tesoreria-total="ingresos"]', formatCLP(ingresos));
  setText('[data-tesoreria-total="egresos"]', formatCLP(egresos));
  setText('[data-tesoreria-total="saldo"]', formatCLP(saldo));
  document.querySelector('[data-tesoreria-saldo-card]')?.classList.toggle('negative', saldo < 0);

  renderLista('general', movimientos.slice(0, 8));
  renderLista('ingreso', movimientos.filter((item) => item.tipo === 'ingreso'));
  renderLista('egreso', movimientos.filter((item) => item.tipo === 'egreso'));
}

function renderLista(tipo, items) {
  const list = document.querySelector(`[data-tesoreria-list="${tipo}"]`);
  if (!list) return;

  if (!items.length) {
    list.innerHTML = '<p class="tesoreria-empty">No hay movimientos registrados.</p>';
    return;
  }

  list.innerHTML = items.map((item) => {
    const deleted = Boolean(item.eliminado);
    return `
      <article class="tesoreria-row ${escapeAttr(item.tipo)} ${deleted ? 'is-deleted' : ''}">
        <small>${formatDate(item.fecha)}</small>
        <strong>${escapeHTML(item.descripcion)}</strong>
        <em>${item.tipo === 'egreso' ? '-' : '+'}${formatCLP(item.monto)}</em>
        ${deleted ? renderDeletedBadge(item) : `<button type="button" class="tesoreria-delete-button" data-tesoreria-delete="${escapeAttr(item.id)}">Eliminar</button>`}
      </article>
    `;
  }).join('');
}

function renderDeletedBadge(item) {
  const user = item.eliminadoPor || item.eliminadoEmail || 'Usuario interno';
  const date = item.eliminadoEn ? formatDateTime(item.eliminadoEn) : 'fecha no registrada';
  return `<span class="tesoreria-deleted-badge">Eliminado por ${escapeHTML(user)} · ${escapeHTML(date)}</span>`;
}

function alternarMenuTesoreria() {
  const menu = document.querySelector('[data-tesoreria-menu]');
  if (!menu) return;
  menu.classList.contains('is-collapsed') ? abrirMenuTesoreria() : cerrarMenuTesoreria();
  if (!menu.classList.contains('is-collapsed')) cerrarOtrosMenus();
}

function abrirMenuTesoreria() {
  const menu = document.querySelector('[data-tesoreria-menu]');
  const toggle = document.querySelector('[data-tesoreria-toggle]');
  if (!menu || !toggle) return;
  menu.classList.remove('is-collapsed');
  toggle.classList.add('is-open');
  toggle.setAttribute('aria-expanded', 'true');
}

function cerrarMenuTesoreria() {
  const menu = document.querySelector('[data-tesoreria-menu]');
  const toggle = document.querySelector('[data-tesoreria-toggle]');
  if (!menu || !toggle) return;
  menu.classList.add('is-collapsed');
  toggle.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
}

function cerrarOtrosMenus() {
  closeMenu('[data-publicaciones-menu]', '[data-publicaciones-toggle]');
  closeMenu('[data-members-menu]', '[data-members-toggle]');
  closeMenu('[data-actas-menu]', '[data-actas-toggle]');
}

function closeMenu(menuSelector, toggleSelector) {
  const menu = document.querySelector(menuSelector);
  const toggle = document.querySelector(toggleSelector);
  if (!menu || !toggle) return;
  menu.classList.add('is-collapsed');
  toggle.classList.remove('is-open');
  toggle.setAttribute('aria-expanded', 'false');
}

function cargarMovimientosLocales() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function guardarMovimientosLocales(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function mostrarEstadoTesoreria(tipo, message, ok) {
  const box = document.querySelector(`[data-tesoreria-status="${tipo}"]`);
  if (!box) return;
  box.textContent = message;
  box.classList.toggle('success', Boolean(ok));
  box.classList.toggle('error', !ok);
}

function limpiarEstadosTesoreria() {
  document.querySelectorAll('[data-tesoreria-status]').forEach((box) => {
    box.textContent = '';
    box.classList.remove('success', 'error');
  });
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function formatCLP(value) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
}

function formatDateTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function escapeHTML(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}
