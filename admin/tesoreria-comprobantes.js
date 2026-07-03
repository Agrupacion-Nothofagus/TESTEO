import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const STORAGE_KEY = 'nothofagus_tesoreria_v1';
const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_BYTES = 10 * 1024 * 1024;
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

if (!window.__nothofagusTesoreriaComprobantes) {
  window.__nothofagusTesoreriaComprobantes = true;
  instalarComprobantesTesoreria();
}

function instalarComprobantesTesoreria() {
  agregarCamposArchivo();

  const observer = new MutationObserver(() => agregarCamposArchivo());
  observer.observe(document.querySelector('.admin-content') || document.body, { childList: true, subtree: true });

  document.addEventListener('submit', manejarSubmitConArchivo, true);
}

function agregarCamposArchivo() {
  document.querySelectorAll('[data-tesoreria-form]').forEach((form) => {
    if (form.querySelector('[name="archivo"]')) return;

    const submit = form.querySelector('button[type="submit"]');
    const label = document.createElement('label');
    label.className = 'tesoreria-file-label';
    label.innerHTML = `
      Comprobante
      <input name="archivo" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png">
      <small>PDF, JPG o PNG · Máx. 10 MB</small>
    `;

    form.insertBefore(label, submit);
  });
}

async function manejarSubmitConArchivo(event) {
  const form = event.target.closest?.('[data-tesoreria-form]');
  if (!form || !form.querySelector('[name="archivo"]')) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const tipo = form.dataset.tesoreriaForm;
  const descripcion = form.descripcion?.value?.trim() || '';
  const monto = Number(form.monto?.value || 0);
  const fecha = form.fecha?.value || '';
  const archivo = form.archivo?.files?.[0] || null;

  if (!descripcion || !monto || monto <= 0) {
    mostrarEstado(tipo, 'Completa descripción y monto válido.', false);
    return;
  }

  if (archivo) {
    const validacion = validarArchivo(archivo);
    if (!validacion.ok) {
      mostrarEstado(tipo, validacion.message, false);
      return;
    }
  }

  try {
    mostrarEstado(tipo, archivo ? 'Subiendo comprobante y guardando movimiento...' : 'Guardando movimiento en Supabase...', true);

    const body = new FormData();
    body.append('tipo', tipo);
    body.append('descripcion', descripcion);
    body.append('monto', String(monto));
    body.append('fecha', fecha);
    if (archivo) body.append('archivo', archivo);

    const data = await apiTesoreria('/api/tesoreria', { method: 'POST', body });
    if (data.movimiento) {
      const movimientos = cargarLocal();
      movimientos.unshift(data.movimiento);
      guardarLocal(movimientos);
      renderTesoreria(movimientos);
    }

    form.reset();
    form.fecha.valueAsDate = new Date();
    mostrarEstado(tipo, `${tipo === 'ingreso' ? 'Ingreso' : 'Egreso'} registrado correctamente.`, true);
  } catch (error) {
    mostrarEstado(tipo, error.message || 'No fue posible guardar el movimiento.', false);
  }
}

async function apiTesoreria(path, options = {}) {
  if (!client) throw new Error('Supabase no está configurado.');
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
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

  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Error en Tesorería.');
  return result;
}

function validarArchivo(file) {
  const tipo = String(file.type || '').toLowerCase();
  if (!TIPOS_PERMITIDOS.includes(tipo)) return { ok: false, message: 'El comprobante debe ser PDF, JPG o PNG.' };
  if (Number(file.size || 0) > MAX_BYTES) return { ok: false, message: 'El comprobante no puede superar 10 MB.' };
  return { ok: true };
}

function cargarLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function guardarLocal(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function renderTesoreria(movimientos) {
  const ingresos = movimientos.filter((item) => item.tipo === 'ingreso').reduce((sum, item) => sum + Number(item.monto || 0), 0);
  const egresos = movimientos.filter((item) => item.tipo === 'egreso').reduce((sum, item) => sum + Number(item.monto || 0), 0);
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

  list.innerHTML = items.map((item) => `
    <article class="tesoreria-row ${escapeAttr(item.tipo)}">
      <small>${formatDate(item.fecha)}</small>
      <strong>${escapeHTML(item.descripcion)}</strong>
      <em>${item.tipo === 'egreso' ? '-' : '+'}${formatCLP(item.monto)}</em>
      ${renderArchivoLink(item)}
      <button type="button" class="tesoreria-delete-button" data-tesoreria-delete="${escapeAttr(item.id)}">Eliminar</button>
    </article>
  `).join('');
}

function renderArchivoLink(item) {
  if (!item?.archivoUrl) return '<span class="tesoreria-no-file">Sin comprobante</span>';
  return `<a class="tesoreria-file-link" href="${escapeAttr(item.archivoUrl)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHTML(item.archivoNombre || 'Comprobante')}</a>`;
}

function mostrarEstado(tipo, message, ok) {
  const box = document.querySelector(`[data-tesoreria-status="${tipo}"]`);
  if (!box) return;
  box.textContent = message;
  box.classList.toggle('success', Boolean(ok));
  box.classList.toggle('error', !ok);
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
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}

function escapeHTML(value) {
  return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}
