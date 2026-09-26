import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const STORAGE_KEY = 'nothofagus_tesoreria_v1';
const ROLES_TESORERIA = ['administrador', 'admin', 'tesorero', 'tesorera'];
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let movimientos = [];
let movimientosLocalesIniciales = [];
let filtrosMovimientos = { tipo: 'todos', mes: 'todos', busqueda: '', eliminados: false };

const TIPOS_ARCHIVO_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;

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
  if (location.hash === '#tesoreria-movimientos') activarVistaTesoreria('movimientos');
  if (location.hash === '#tesoreria-ingresos') activarVistaTesoreria('movimientos', 'ingreso');
  if (location.hash === '#tesoreria-egresos') activarVistaTesoreria('movimientos', 'egreso');
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

  const isFormData = options.body instanceof FormData;
  const response = await fetch(path, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(isFormData ? {} : { 'content-type': 'application/json; charset=utf-8' }),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error en Tesorería.');
  return data;
}

async function cargarMovimientosRemotos() {
  try {
    mostrarEstadoTesoreria('movimiento', 'Cargando movimientos desde Supabase...', true);
    const data = await apiTesoreria();
    const remotos = Array.isArray(data.movimientos) ? data.movimientos.filter(Boolean) : [];

    if (!remotos.length && movimientosLocalesIniciales.length) {
      await migrarLocalesASupabase(movimientosLocalesIniciales);
      const recarga = await apiTesoreria();
      movimientos = Array.isArray(recarga.movimientos) ? recarga.movimientos.filter(Boolean) : [];
      guardarMovimientosLocales(movimientos);
      renderTesoreria();
      mostrarEstadoTesoreria('movimiento', 'Movimientos locales migrados a Supabase.', true);
      return;
    }

    movimientos = remotos;
    guardarMovimientosLocales(movimientos);
    renderTesoreria();
    limpiarEstadosTesoreria();
  } catch (error) {
    mostrarEstadoTesoreria('movimiento', error.message || 'No fue posible cargar Tesorería desde Supabase.', false);
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
      <button type="button" class="sidebar-link tesoreria-sidebar-link" data-tesoreria-open="movimientos"><span>↕️</span>Movimientos</button>
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
  content.appendChild(crearVistaTesoreria('tesoreria-movimientos-view', 'Movimientos', 'Registra, consulta y filtra ingresos y egresos en un solo libro.', getMovimientoTemplate()));
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
          <button type="button" data-tesoreria-go="movimientos" data-tesoreria-type="ingreso">Registrar ingreso</button>
          <button type="button" data-tesoreria-go="movimientos" data-tesoreria-type="egreso">Registrar egreso</button>
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

function getMovimientoTemplate() {
  return `
    <div class="admin-panel tesoreria-panel">
      <div class="tesoreria-topbar">
        <div>
          <p class="section-tag">Tesorería</p>
          <h3>Movimientos</h3>
          <p>Libro único de ingresos, egresos, pagos de cuotas y cambios de estado con su historial de auditoría.</p>
        </div>
        <div class="tesoreria-actions-row"><button type="button" data-tesoreria-go="general">Ver general</button></div>
      </div>
      <section class="tesoreria-form-card">
        <h4>Registrar movimiento</h4>
        <form class="tesoreria-form" data-tesoreria-form="movimiento">
          <label>Tipo<select name="tipo" required><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></select></label>
          <label>Fecha<input name="fecha" type="date" required></label>
          <label>Descripción<input name="descripcion" type="text" maxlength="180" placeholder="Ej: aporte, compra de insumos" required></label>
          <label>Monto<input name="monto" type="number" min="1" step="1" placeholder="0" required></label>
          <label class="tesoreria-file-label">Comprobante<input name="archivo" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"><small>PDF, JPG o PNG · Máx. 10 MB</small></label>
          <button type="submit">Guardar</button>
        </form>
        <p class="admin-status tesoreria-status" data-tesoreria-status="movimiento" aria-live="polite"></p>
      </section>
      <section class="tesoreria-list-card">
        <div class="tesoreria-list-heading"><div><h4>Libro de movimientos</h4><p data-tesoreria-results>0 registros</p></div></div>
        <div class="tesoreria-filters" aria-label="Filtros de movimientos">
          <label>Tipo<select data-tesoreria-filter="tipo"><option value="todos">Todos</option><option value="ingreso">Ingresos</option><option value="egreso">Egresos</option><option value="estado_cuota">Cambios de estado</option></select></label>
          <label>Mes<input type="month" data-tesoreria-filter="mes"></label>
          <label class="tesoreria-search">Buscar<input type="search" data-tesoreria-filter="busqueda" placeholder="Descripción o responsable"></label>
          <label class="tesoreria-check"><input type="checkbox" data-tesoreria-filter="eliminados"> Mostrar eliminados</label>
          <button type="button" class="tesoreria-clear-filters" data-tesoreria-clear>Limpiar filtros</button>
        </div>
        <div class="tesoreria-list" data-tesoreria-list="movimiento"></div>
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
    button.addEventListener('click', () => activarVistaTesoreria(button.dataset.tesoreriaGo, button.dataset.tesoreriaType));
  });

  document.querySelectorAll('[data-tesoreria-filter]').forEach((control) => {
    control.addEventListener('input', actualizarFiltrosMovimientos);
    control.addEventListener('change', actualizarFiltrosMovimientos);
  });
  document.querySelector('[data-tesoreria-clear]')?.addEventListener('click', limpiarFiltrosMovimientos);

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
  const tipo = form.elements.tipo?.value || '';
  const descripcion = form.descripcion.value.trim();
  const monto = Number(form.monto.value);
  const fecha = form.fecha.value;
  const archivo = form.archivo?.files?.[0] || null;

  if (!descripcion || !monto || monto <= 0) {
    mostrarEstadoTesoreria('movimiento', 'Completa la descripción y un monto válido.', false);
    return;
  }

  if (!['ingreso', 'egreso'].includes(tipo)) {
    mostrarEstadoTesoreria('movimiento', 'Selecciona si el movimiento es un ingreso o egreso.', false);
    return;
  }

  if (archivo && !validarArchivo(archivo)) return;

  try {
    mostrarEstadoTesoreria('movimiento', archivo ? 'Subiendo comprobante y guardando...' : 'Guardando movimiento...', true);
    const body = new FormData();
    body.append('tipo', tipo);
    body.append('descripcion', descripcion);
    body.append('monto', String(monto));
    body.append('fecha', fecha);
    if (archivo) body.append('archivo', archivo);
    const data = await apiTesoreria('/api/tesoreria', {
      method: 'POST',
      body
    });

    if (data.movimiento) movimientos.unshift(data.movimiento);
    guardarMovimientosLocales(movimientos);
    form.reset();
    form.fecha.valueAsDate = new Date();
    renderTesoreria();
    mostrarEstadoTesoreria('movimiento', `${tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} registrado correctamente.`, true);
    window.dispatchEvent(new CustomEvent('nothofagus:tesoreria-updated'));
  } catch (error) {
    mostrarEstadoTesoreria('movimiento', error.message || 'No fue posible guardar el movimiento.', false);
  }
}

function validarArchivo(file) {
  const tipo = String(file.type || '').toLowerCase();
  if (!TIPOS_ARCHIVO_PERMITIDOS.includes(tipo)) {
    mostrarEstadoTesoreria('movimiento', 'El comprobante debe ser PDF, JPG o PNG.', false);
    return false;
  }
  if (Number(file.size || 0) > MAX_ARCHIVO_BYTES) {
    mostrarEstadoTesoreria('movimiento', 'El comprobante no puede superar 10 MB.', false);
    return false;
  }
  return true;
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
    mostrarEstadoTesoreria('movimiento', 'Movimiento marcado como eliminado con auditoría.', true);
    window.dispatchEvent(new CustomEvent('nothofagus:tesoreria-updated'));
  } catch (error) {
    mostrarEstadoTesoreria('movimiento', error.message || 'No fue posible marcar el movimiento como eliminado.', false);
  }
}

function activarVistaTesoreria(tipo, presetType = '') {
  if (tipo === 'ingresos' || tipo === 'ingreso') {
    tipo = 'movimientos';
    presetType = 'ingreso';
  }
  if (tipo === 'egresos' || tipo === 'egreso') {
    tipo = 'movimientos';
    presetType = 'egreso';
  }
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

  if (tipo === 'movimientos' && presetType) {
    const formType = view.querySelector('select[name="tipo"]');
    const filterType = view.querySelector('[data-tesoreria-filter="tipo"]');
    if (formType) formType.value = presetType;
    if (filterType) filterType.value = presetType;
    filtrosMovimientos.tipo = presetType;
  }

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

  renderLista('general', movimientos.filter((item) => !item.eliminado).slice(0, 8));
  renderLista('movimiento', filtrarMovimientos(movimientos));
}

function actualizarFiltrosMovimientos() {
  const tipo = document.querySelector('[data-tesoreria-filter="tipo"]');
  const mes = document.querySelector('[data-tesoreria-filter="mes"]');
  const busqueda = document.querySelector('[data-tesoreria-filter="busqueda"]');
  const eliminados = document.querySelector('[data-tesoreria-filter="eliminados"]');
  filtrosMovimientos = {
    tipo: tipo?.value || 'todos',
    mes: mes?.value || 'todos',
    busqueda: busqueda?.value?.trim().toLowerCase() || '',
    eliminados: Boolean(eliminados?.checked)
  };
  renderLista('movimiento', filtrarMovimientos(movimientos));
}

function limpiarFiltrosMovimientos() {
  document.querySelectorAll('[data-tesoreria-filter]').forEach((control) => {
    if (control.type === 'checkbox') control.checked = false;
    else if (control.dataset.tesoreriaFilter === 'tipo') control.value = 'todos';
    else control.value = '';
  });
  filtrosMovimientos = { tipo: 'todos', mes: 'todos', busqueda: '', eliminados: false };
  renderLista('movimiento', filtrarMovimientos(movimientos));
}

function filtrarMovimientos(items) {
  return items.filter((item) => {
    if (!filtrosMovimientos.eliminados && item.eliminado) return false;
    if (filtrosMovimientos.tipo !== 'todos' && item.tipo !== filtrosMovimientos.tipo) return false;
    if (filtrosMovimientos.mes !== 'todos' && filtrosMovimientos.mes && !String(item.fecha || '').startsWith(filtrosMovimientos.mes)) return false;
    if (filtrosMovimientos.busqueda) {
      const text = `${item.descripcion || ''} ${item.creadoPor || ''} ${item.observaciones || ''}`.toLowerCase();
      if (!text.includes(filtrosMovimientos.busqueda)) return false;
    }
    return true;
  });
}

function renderLista(tipo, items) {
  const list = document.querySelector(`[data-tesoreria-list="${tipo}"]`);
  if (!list) return;

  if (!items.length) {
    list.innerHTML = tipo === 'movimiento'
      ? '<div class="tesoreria-empty"><strong>No hay movimientos para estos filtros.</strong><span>Registra un ingreso o egreso, o limpia los filtros para ver todo el libro.</span></div>'
      : '<div class="tesoreria-empty"><strong>Aún no hay actividad contable.</strong><span>Los ingresos y egresos aparecerán aquí al registrarlos.</span></div>';
    setText('[data-tesoreria-results]', '0 registros');
    return;
  }

  if (tipo === 'movimiento') setText('[data-tesoreria-results]', `${items.length} ${items.length === 1 ? 'registro' : 'registros'}`);

  list.innerHTML = items.map((item) => {
    const deleted = Boolean(item.eliminado);
    return `
      <article class="tesoreria-row ${escapeAttr(item.tipo)} ${deleted ? 'is-deleted' : ''}">
        <small>${formatDate(item.fecha)}</small>
        <div class="tesoreria-row-description"><span class="tesoreria-type-badge">${item.tipo === 'egreso' ? 'Egreso' : 'Ingreso'}</span><strong>${escapeHTML(item.descripcion)}</strong></div>
        <em>${item.tipo === 'egreso' ? '-' : '+'}${formatCLP(item.monto)}</em>
        ${renderArchivoLink(item)}
        ${deleted ? renderDeletedBadge(item) : `<button type="button" class="tesoreria-delete-button" data-tesoreria-delete="${escapeAttr(item.id)}">Eliminar</button>`}
      </article>
    `;
  }).join('');
}

function renderArchivoLink(item) {
  if (!item?.archivoUrl) return '<span class="tesoreria-no-file">Sin comprobante</span>';
  return `<a class="tesoreria-file-link" href="${escapeAttr(item.archivoUrl)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHTML(item.archivoNombre || 'Comprobante')}</a>`;
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
