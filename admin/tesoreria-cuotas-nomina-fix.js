import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusCuotasNominaFix) return;
  window.__nothofagusCuotasNominaFix = true;

  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  const API_URL = '/api/cuotas-miembros';

  loadCss();
  bindEvents();
  observeAndPlace();

  function bindEvents() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest?.('[data-cuotas-nomina]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      await openNomina();
    }, true);

    document.addEventListener('click', (event) => {
      if (event.target.matches?.('[data-cuotas-nomina-backdrop]') || event.target.closest?.('[data-cuotas-nomina-close]')) {
        event.preventDefault();
        closeNomina();
      }
    }, true);

    document.addEventListener('submit', async (event) => {
      const form = event.target.closest?.('[data-cuotas-nomina-form-fix]');
      if (!form) return;
      event.preventDefault();
      await saveNomina(form);
    }, true);
  }

  function observeAndPlace() {
    placeButton();
    const observer = new MutationObserver(() => queuePlaceButton());
    const start = () => {
      if (document.body && !document.body.dataset.cuotasNominaFixObserved) {
        document.body.dataset.cuotasNominaFixObserved = 'true';
        observer.observe(document.body, { childList: true, subtree: true });
      }
      queuePlaceButton();
    };
    start();
    document.addEventListener('DOMContentLoaded', start);
    window.addEventListener('hashchange', start);
    document.addEventListener('click', (event) => {
      if (event.target.closest?.('[data-tesoreria-open="cuotas"], [data-tesoreria-toggle]')) {
        window.setTimeout(placeButton, 100);
        window.setTimeout(placeButton, 500);
      }
    }, true);
    window.setTimeout(placeButton, 250);
    window.setTimeout(placeButton, 900);
    window.setTimeout(placeButton, 1800);
  }

  function queuePlaceButton() {
    window.clearTimeout(queuePlaceButton.timer);
    queuePlaceButton.timer = window.setTimeout(placeButton, 80);
  }

  function placeButton() {
    const view = document.querySelector('#tesoreria-cuotas-view');
    if (!view) return;
    const summary = view.querySelector('[data-cuotas-month-summary]');
    if (!summary) return;

    const existing = Array.from(view.querySelectorAll('[data-cuotas-nomina]'));
    const button = existing[0] || document.createElement('button');
    existing.slice(1).forEach((item) => item.remove());

    button.type = 'button';
    button.className = 'cuotas-nomina-button';
    button.dataset.cuotasNomina = 'true';
    button.textContent = 'Nómina';
    button.removeAttribute('disabled');

    let slot = view.querySelector('[data-cuotas-nomina-slot]');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'cuotas-nomina-slot';
      slot.dataset.cuotasNominaSlot = 'true';
    }

    if (slot.parentElement !== summary.parentElement || slot.previousElementSibling !== summary) {
      summary.insertAdjacentElement('afterend', slot);
    }
    if (button.parentElement !== slot || slot.children.length !== 1) {
      slot.replaceChildren(button);
    }
  }

  async function openNomina() {
    const backdrop = getBackdrop();
    backdrop.classList.add('is-open');
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.innerHTML = renderLoading();

    try {
      const data = await request(`${API_URL}?anio=${encodeURIComponent(getYear())}`);
      backdrop.innerHTML = renderModal(data.miembros || [], data.permisos || {});
    } catch (error) {
      backdrop.innerHTML = renderError(error.message || 'No fue posible cargar la nómina.');
    }
  }

  function closeNomina() {
    const backdrop = document.querySelector('[data-cuotas-nomina-backdrop]');
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => { backdrop.innerHTML = ''; }, 120);
  }

  function getBackdrop() {
    const view = document.querySelector('#tesoreria-cuotas-view');
    let backdrop = document.querySelector('[data-cuotas-nomina-backdrop]');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'cuotas-modal-backdrop cuotas-nomina-backdrop';
      backdrop.dataset.cuotasNominaBackdrop = 'true';
      backdrop.setAttribute('aria-hidden', 'true');
    }
    (view || document.body).appendChild(backdrop);
    return backdrop;
  }

  function renderLoading() {
    return `<section class="cuotas-modal cuotas-nomina-modal"><div class="cuotas-modal-header"><div><p class="section-tag">Tesorería · Cuotas</p><h3>Nómina de integrantes</h3><p>Cargando integrantes...</p></div><button type="button" class="cuotas-modal-close" data-cuotas-nomina-close>×</button></div><div class="cuotas-nomina-form"><p class="cuotas-empty">Preparando nómina editable.</p></div></section>`;
  }

  function renderError(message) {
    return `<section class="cuotas-modal cuotas-nomina-modal"><div class="cuotas-modal-header"><div><p class="section-tag">Tesorería · Cuotas</p><h3>Nómina de integrantes</h3><p>No fue posible cargar la información.</p></div><button type="button" class="cuotas-modal-close" data-cuotas-nomina-close>×</button></div><div class="cuotas-nomina-form"><p class="cuotas-empty error">${esc(message)}</p><div class="cuotas-nomina-actions"><button type="button" class="secondary" data-cuotas-nomina-close>Cerrar</button></div></div></section>`;
  }

  function renderModal(items, permissions) {
    const canWrite = Boolean(permissions.write);
    const disabled = canWrite ? '' : 'disabled';
    return `<section class="cuotas-modal cuotas-nomina-modal" role="dialog" aria-modal="true" aria-label="Nómina de integrantes"><div class="cuotas-modal-header"><div><p class="section-tag">Tesorería · Cuotas</p><h3>Nómina de integrantes</h3><p>Administra estado, cuota mensual, exención e información de cada integrante.</p></div><button type="button" class="cuotas-modal-close" data-cuotas-nomina-close>×</button></div><form class="cuotas-nomina-form" data-cuotas-nomina-form-fix>${help()}<div class="cuotas-nomina-table-wrap"><table class="cuotas-nomina-table"><thead><tr><th>Integrante</th><th>Estado</th><th>Cuota mensual</th><th>Cuenta</th><th>Exento</th><th>Teléfono</th><th>Correo</th><th>Observaciones</th></tr></thead><tbody>${items.length ? items.map((item) => row(item, disabled)).join('') : '<tr><td colspan="8">No hay integrantes activos para mostrar.</td></tr>'}</tbody></table></div><p class="cuotas-nomina-status" data-cuotas-nomina-status aria-live="polite"></p><div class="cuotas-nomina-actions"><button type="button" class="secondary" data-cuotas-nomina-close>Cerrar</button>${canWrite ? '<button type="submit">Guardar nómina</button>' : ''}</div></form></section>`;
  }

  function help() {
    return '<p class="cuotas-nomina-help">Los socios/as activos/as se agregan automáticamente. Desde aquí puedes ajustar cuota mensual, estado, exención y datos de contacto usados por la matriz mensual.</p>';
  }

  function row(item, disabled) {
    const year = item.anio || getYear();
    return `<tr data-nomina-row="${escAttr(item.id)}"><td class="cuotas-nomina-persona"><strong>${esc(item.nombre || 'Sin nombre')}</strong><small>${esc(item.rut || 'RUT no registrado')} · Año <input type="hidden" data-field="anio" value="${escAttr(year)}">${esc(year)}</small></td><td><select data-field="estado_miembro" ${disabled}>${option('estudiante', item.estadoMiembro, 'Estudiante')}${option('trabajador', item.estadoMiembro, 'Trabajador')}${option('cesante', item.estadoMiembro, 'Cesante')}</select></td><td><input type="number" min="0" step="1" data-field="cuota_mensual" value="${escAttr(item.cuotaMensual || 0)}" ${disabled}></td><td><select data-field="estado_cuenta" ${disabled}>${option('activo', item.estadoCuenta, 'Activo')}${option('inactivo', item.estadoCuenta, 'Inactivo')}</select></td><td><label class="cuotas-nomina-exento"><input type="checkbox" data-field="exento" ${item.exento ? 'checked' : ''} ${disabled}> Sí</label></td><td><input data-field="telefono" value="${escAttr(item.telefono || '')}" ${disabled}></td><td><input type="email" data-field="correo" value="${escAttr(item.correo || '')}" ${disabled}></td><td><input data-field="observaciones" value="${escAttr(item.observaciones || '')}" ${disabled}></td></tr>`;
  }

  async function saveNomina(form) {
    const status = form.querySelector('[data-cuotas-nomina-status]');
    const submit = form.querySelector('button[type="submit"]');
    try {
      if (submit) submit.disabled = true;
      setStatus(status, 'Guardando nómina...', true);
      const rows = Array.from(form.querySelectorAll('[data-nomina-row]'));
      for (const rowElement of rows) {
        await request(API_URL, { method: 'PATCH', body: JSON.stringify(payload(rowElement)) });
      }
      setStatus(status, 'Nómina actualizada correctamente.', true);
      refreshCuotas();
      window.setTimeout(closeNomina, 600);
    } catch (error) {
      setStatus(status, error.message || 'No fue posible guardar la nómina.', false);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  function payload(rowElement) {
    const field = (name) => rowElement.querySelector(`[data-field="${name}"]`);
    return { id: rowElement.dataset.nominaRow, estado_miembro: field('estado_miembro')?.value || 'estudiante', estado_cuenta: field('estado_cuenta')?.value || 'activo', cuota_mensual: Number(field('cuota_mensual')?.value || 0), anio: Number(field('anio')?.value || getYear()), telefono: field('telefono')?.value?.trim() || '', correo: field('correo')?.value?.trim() || '', observaciones: field('observaciones')?.value?.trim() || '', exento: Boolean(field('exento')?.checked) };
  }

  async function request(url, options = {}) {
    if (!client) throw new Error('Supabase no está configurado.');
    const session = await client.auth.getSession();
    const token = session.data?.session?.access_token;
    if (!token) throw new Error('Sesión no disponible.');
    const headers = new Headers(options.headers || {});
    headers.set('authorization', ['Bearer', token].join(' '));
    headers.set('content-type', 'application/json; charset=utf-8');
    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Error de solicitud.');
    return data;
  }

  function refreshCuotas() {
    const year = document.querySelector('#tesoreria-cuotas-view [data-cuotas-year]');
    if (year) year.dispatchEvent(new Event('change', { bubbles: true }));
    window.setTimeout(placeButton, 250);
  }

  function getYear() {
    return Number(document.querySelector('#tesoreria-cuotas-view [data-cuotas-year]')?.value || new Date().getFullYear());
  }

  function option(value, current, label) {
    return `<option value="${escAttr(value)}" ${String(current || '') === String(value) ? 'selected' : ''}>${esc(label)}</option>`;
  }

  function setStatus(element, message, ok) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('success', Boolean(ok));
    element.classList.toggle('error', !ok);
  }

  function loadCss() {
    const href = 'tesoreria-cuotas-nomina.css?v=20260708-fix';
    const existing = document.querySelector('link[data-cuotas-nomina]');
    if (existing) existing.href = href;
    else {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.dataset.cuotasNomina = 'true';
      document.head.appendChild(link);
    }
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch]));
  }

  function escAttr(value) {
    return esc(value);
  }
})();
