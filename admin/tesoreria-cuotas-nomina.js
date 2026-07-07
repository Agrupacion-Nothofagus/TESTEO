import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusCuotasNomina) return;
  window.__nothofagusCuotasNomina = true;

  const API_URL = '/api/cuotas-miembros';
  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  let cache = [];
  let permisos = { write: false };
  let currentYear = new Date().getFullYear();

  loadStyles();
  start();

  document.addEventListener('click', async (event) => {
    const nomina = event.target.closest?.('[data-cuotas-nomina]');
    if (nomina) {
      event.preventDefault();
      await openNominaModal();
      return;
    }

    const close = event.target.closest?.('[data-cuotas-nomina-close]');
    const backdrop = event.target.matches?.('[data-cuotas-nomina-backdrop]');
    if (close || backdrop) {
      event.preventDefault();
      closeNominaModal();
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest?.('[data-cuotas-nomina-form]');
    if (!form) return;
    event.preventDefault();
    await saveNomina(form);
  });

  const observer = new MutationObserver(() => {
    window.clearTimeout(start.timer);
    start.timer = window.setTimeout(start, 120);
  });

  function start() {
    enhanceLayout();
    const view = document.querySelector('#tesoreria-cuotas-view');
    if (view && !view.dataset.nominaObserved) {
      view.dataset.nominaObserved = 'true';
      observer.observe(view, { childList: true, subtree: true });
    }
  }

  function enhanceLayout() {
    const view = document.querySelector('#tesoreria-cuotas-view');
    if (!view) return;

    const secondary = view.querySelector('.cuotas-secondary-grid');
    const recent = view.querySelector('[data-cuotas-recent-movements]');
    const annual = view.querySelector('[data-cuotas-annual-summary]');
    if (secondary && recent && annual && secondary.firstElementChild !== recent) {
      secondary.prepend(recent);
      secondary.append(annual);
    }

    const monthSummary = view.querySelector('[data-cuotas-month-summary]');
    if (monthSummary) {
      const existingButtons = Array.from(view.querySelectorAll('[data-cuotas-nomina]'));
      const button = existingButtons[0] || document.createElement('button');
      existingButtons.slice(1).forEach((item) => item.remove());

      button.type = 'button';
      button.className = 'cuotas-nomina-button';
      button.dataset.cuotasNomina = 'true';
      button.textContent = 'Nómina';

      let slot = view.querySelector('[data-cuotas-nomina-slot]');
      if (!slot) {
        slot = document.createElement('div');
        slot.className = 'cuotas-nomina-slot';
        slot.dataset.cuotasNominaSlot = 'true';
      }
      if (slot.previousElementSibling !== monthSummary) monthSummary.after(slot);
      if (button.parentElement !== slot) slot.replaceChildren(button);
    }

    view.querySelectorAll('button').forEach((button) => {
      if (button.textContent.trim().toLowerCase() === 'editar integrante') button.textContent = 'Nómina';
    });
  }

  async function openNominaModal() {
    const backdrop = getOrCreateBackdrop();
    backdrop.classList.add('is-open');
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.innerHTML = renderLoading();

    try {
      const data = await fetchCuotas(true);
      cache = data.miembros || [];
      permisos = data.permisos || permisos;
      currentYear = Number(data.anio || getSelectedYear());
      backdrop.innerHTML = renderNominaModal(cache, permisos);
    } catch (error) {
      backdrop.innerHTML = renderError(error.message || 'No fue posible cargar la nómina de integrantes.');
    }
  }

  function closeNominaModal() {
    const backdrop = document.querySelector('[data-cuotas-nomina-backdrop]');
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    backdrop.setAttribute('aria-hidden', 'true');
    window.setTimeout(() => { backdrop.innerHTML = ''; }, 160);
  }

  async function saveNomina(form) {
    const status = form.querySelector('[data-cuotas-nomina-status]');
    const submit = form.querySelector('button[type="submit"]');
    const rows = Array.from(form.querySelectorAll('[data-nomina-row]'));

    if (!permisos.write) {
      setNominaStatus(status, 'No tienes permiso para editar la nómina.', false);
      return;
    }

    try {
      submit.disabled = true;
      setNominaStatus(status, 'Guardando nómina de integrantes...', true);

      for (const row of rows) {
        const id = row.dataset.nominaRow;
        const original = cache.find((item) => String(item.id) === String(id));
        if (!original) continue;
        const payload = buildMemberPayload(row, original);
        await api(API_URL, { method: 'PATCH', body: JSON.stringify(payload) });
      }

      setNominaStatus(status, 'Nómina actualizada correctamente.', true);
      await refreshCuotasView();
      window.setTimeout(closeNominaModal, 650);
    } catch (error) {
      setNominaStatus(status, error.message || 'No fue posible guardar la nómina.', false);
    } finally {
      submit.disabled = false;
    }
  }

  function buildMemberPayload(row, original) {
    const get = (field) => row.querySelector(`[data-field="${field}"]`);
    return {
      id: original.id,
      nombre: original.nombre || '',
      rut: original.rut || '',
      correo: get('correo')?.value?.trim() || original.correo || '',
      telefono: get('telefono')?.value?.trim() || original.telefono || '',
      estado_miembro: get('estado_miembro')?.value || original.estadoMiembro || 'estudiante',
      estado_cuenta: get('estado_cuenta')?.value || original.estadoCuenta || 'activo',
      cuota_mensual: Number(get('cuota_mensual')?.value || 0),
      anio: Number(get('anio')?.value || currentYear),
      observaciones: get('observaciones')?.value?.trim() || '',
      exento: Boolean(get('exento')?.checked)
    };
  }

  function renderNominaModal(items, perms) {
    const disabled = perms.write ? '' : 'disabled';
    return `
      <section class="cuotas-modal cuotas-nomina-modal" role="dialog" aria-modal="true" aria-label="Nómina de integrantes">
        <div class="cuotas-modal-header">
          <div>
            <p class="section-tag">Tesorería · Cuotas</p>
            <h3>Nómina de integrantes</h3>
            <p>Administra estado, cuota mensual, exención e información de cada integrante activo.</p>
          </div>
          <button type="button" class="cuotas-modal-close" data-cuotas-nomina-close>×</button>
        </div>
        <form class="cuotas-nomina-form" data-cuotas-nomina-form>
          <p class="cuotas-nomina-help">Los socios/as activos/as se agregan automáticamente a esta nómina. Desde aquí puedes ajustar la cuota mensual, estado, exención y datos de contacto usados por la matriz mensual.</p>
          <div class="cuotas-nomina-table-wrap">
            <table class="cuotas-nomina-table">
              <thead>
                <tr>
                  <th>Integrante</th>
                  <th>Estado</th>
                  <th>Cuota mensual</th>
                  <th>Cuenta</th>
                  <th>Exento</th>
                  <th>Teléfono</th>
                  <th>Correo</th>
                  <th>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                ${items.length ? items.map((member) => renderNominaRow(member, disabled)).join('') : '<tr><td colspan="8">No hay integrantes activos para mostrar.</td></tr>'}
              </tbody>
            </table>
          </div>
          <p class="cuotas-nomina-status" data-cuotas-nomina-status aria-live="polite"></p>
          <div class="cuotas-nomina-actions">
            <button type="button" class="secondary" data-cuotas-nomina-close>Cerrar</button>
            ${perms.write ? '<button type="submit">Guardar nómina</button>' : ''}
          </div>
        </form>
      </section>
    `;
  }

  function renderNominaRow(member, disabled) {
    return `
      <tr data-nomina-row="${escapeAttr(member.id)}">
        <td class="cuotas-nomina-persona">
          <strong>${escapeHTML(member.nombre || 'Sin nombre')}</strong>
          <small>${escapeHTML(member.rut || 'RUT no registrado')} · Año <input type="hidden" data-field="anio" value="${escapeAttr(member.anio || currentYear)}">${escapeHTML(String(member.anio || currentYear))}</small>
        </td>
        <td>
          <select data-field="estado_miembro" ${disabled}>
            ${option('estudiante', member.estadoMiembro, 'Estudiante')}
            ${option('trabajador', member.estadoMiembro, 'Trabajador')}
            ${option('cesante', member.estadoMiembro, 'Cesante')}
          </select>
        </td>
        <td><input type="number" min="0" step="1" data-field="cuota_mensual" value="${escapeAttr(member.cuotaMensual || 0)}" ${disabled}></td>
        <td>
          <select data-field="estado_cuenta" ${disabled}>
            ${option('activo', member.estadoCuenta, 'Activo')}
            ${option('inactivo', member.estadoCuenta, 'Inactivo')}
          </select>
        </td>
        <td><label class="cuotas-nomina-exento"><input type="checkbox" data-field="exento" ${member.exento ? 'checked' : ''} ${disabled}> Sí</label></td>
        <td><input data-field="telefono" value="${escapeAttr(member.telefono || '')}" ${disabled}></td>
        <td><input type="email" data-field="correo" value="${escapeAttr(member.correo || '')}" ${disabled}></td>
        <td><input data-field="observaciones" value="${escapeAttr(member.observaciones || '')}" ${disabled}></td>
      </tr>
    `;
  }

  function renderLoading() {
    return `<section class="cuotas-modal cuotas-nomina-modal"><div class="cuotas-modal-header"><div><p class="section-tag">Tesorería · Cuotas</p><h3>Nómina de integrantes</h3><p>Cargando integrantes...</p></div><button type="button" class="cuotas-modal-close" data-cuotas-nomina-close>×</button></div><div class="cuotas-nomina-form"><p class="cuotas-empty">Preparando nómina editable.</p></div></section>`;
  }

  function renderError(message) {
    return `<section class="cuotas-modal cuotas-nomina-modal"><div class="cuotas-modal-header"><div><p class="section-tag">Tesorería · Cuotas</p><h3>Nómina de integrantes</h3><p>No fue posible cargar la información.</p></div><button type="button" class="cuotas-modal-close" data-cuotas-nomina-close>×</button></div><div class="cuotas-nomina-form"><p class="cuotas-empty error">${escapeHTML(message)}</p><div class="cuotas-nomina-actions"><button type="button" class="secondary" data-cuotas-nomina-close>Cerrar</button></div></div></section>`;
  }

  function getOrCreateBackdrop() {
    let backdrop = document.querySelector('[data-cuotas-nomina-backdrop]');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'cuotas-modal-backdrop';
      backdrop.dataset.cuotasNominaBackdrop = 'true';
      backdrop.setAttribute('aria-hidden', 'true');
      document.querySelector('#tesoreria-cuotas-view')?.appendChild(backdrop);
    }
    return backdrop;
  }

  async function fetchCuotas(force = false) {
    if (!force && cache.length) return { miembros: cache, permisos, anio: currentYear };
    return api(`${API_URL}?anio=${encodeURIComponent(getSelectedYear())}`);
  }

  async function refreshCuotasView() {
    const yearSelect = document.querySelector('#tesoreria-cuotas-view [data-cuotas-year]');
    if (yearSelect) {
      yearSelect.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    document.querySelector('[data-tesoreria-open="cuotas"]')?.click();
  }

  function getSelectedYear() {
    return Number(document.querySelector('#tesoreria-cuotas-view [data-cuotas-year]')?.value || currentYear || new Date().getFullYear());
  }

  async function api(url, options = {}) {
    if (!client) throw new Error('Supabase no está configurado.');
    const session = await client.auth.getSession();
    const token = session.data?.session?.access_token;
    if (!token) throw new Error('Sesión no disponible.');
    const response = await fetch(url, {
      ...options,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=utf-8',
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Error de solicitud.');
    return data;
  }

  function setNominaStatus(element, message, ok) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('success', Boolean(ok));
    element.classList.toggle('error', !ok);
  }

  function loadStyles() {
    if (document.querySelector('link[data-cuotas-nomina]')) return;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'tesoreria-cuotas-nomina.css?v=20260707-nomina-slot';
    css.dataset.cuotasNomina = 'true';
    document.head.appendChild(css);
  }

  function option(value, current, label) {
    return `<option value="${escapeAttr(value)}" ${String(current || '') === String(value) ? 'selected' : ''}>${escapeHTML(label)}</option>`;
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeAttr(value) {
    return escapeHTML(value);
  }
})();
