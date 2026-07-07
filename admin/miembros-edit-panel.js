import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusMiembrosEditPanel) return;
  window.__nothofagusMiembrosEditPanel = true;

  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  let cache = new Map();
  let loading = false;

  document.addEventListener('click', async (event) => {
    const toggle = event.target.closest?.('[data-toggle-member-detail]');
    if (!toggle) return;
    window.setTimeout(() => ensureEditPanel(toggle.dataset.toggleMemberDetail), 80);
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest?.('[data-member-edit-form]');
    if (!form) return;
    event.preventDefault();
    await saveMemberEdit(form);
  });

  document.addEventListener('nothofagus:members-view', () => {
    window.setTimeout(refreshPanels, 180);
  });

  const observer = new MutationObserver(() => {
    window.clearTimeout(refreshPanels.timer);
    refreshPanels.timer = window.setTimeout(refreshPanels, 120);
  });

  document.addEventListener('DOMContentLoaded', start);
  window.setTimeout(start, 600);

  function start() {
    loadStyles();
    const root = document.querySelector('[data-member-status-view]');
    if (root && !root.dataset.memberEditObserved) {
      root.dataset.memberEditObserved = 'true';
      observer.observe(document.body, { childList: true, subtree: true });
    }
    refreshPanels();
  }

  async function refreshPanels() {
    const openExtras = document.querySelectorAll('.member-extra.is-open[data-member-extra]');
    if (!openExtras.length) return;
    await loadMembers();
    openExtras.forEach((extra) => ensureEditPanel(extra.dataset.memberExtra));
  }

  async function ensureEditPanel(id) {
    if (!id) return;
    const extra = document.querySelector(`[data-member-extra="${cssEscape(id)}"]`);
    if (!extra || !extra.classList.contains('is-open') || extra.querySelector('[data-member-edit-panel]')) return;

    await loadMembers();
    const item = cache.get(String(id));
    if (!item) return;

    const panel = document.createElement('section');
    panel.className = 'member-edit-panel';
    panel.dataset.memberEditPanel = id;
    panel.innerHTML = renderEditForm(item);

    const recordActions = extra.querySelector('.member-record-actions');
    if (recordActions) {
      recordActions.before(panel);
    } else {
      extra.appendChild(panel);
    }
  }

  async function loadMembers(force = false) {
    if (!client || loading) return;
    if (!force && cache.size) return;
    loading = true;
    try {
      const session = await client.auth.getSession();
      const token = session.data?.session?.access_token;
      if (!token) return;
      const response = await fetch('/api/miembros', {
        headers: { authorization: `Bearer ${token}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No fue posible cargar miembros.');
      cache = new Map((data.solicitudes || []).filter((item) => item.estado === 'miembro').map((item) => [String(item.id), item]));
    } catch (error) {
      console.error('No fue posible preparar edición de miembros:', error);
    } finally {
      loading = false;
    }
  }

  function renderEditForm(item) {
    return `
      <details class="member-edit-details">
        <summary>Editar datos del miembro</summary>
        <form class="member-edit-form" data-member-edit-form data-member-id="${escapeAttr(item.id)}">
          <div class="member-edit-grid">
            <label>Nombre completo
              <input name="nombre" value="${escapeAttr(item.nombre)}" autocomplete="name">
            </label>
            <label>RUT / documento
              <input name="rut_documento" value="${escapeAttr(item.rut_documento)}">
            </label>
            <label>Fecha de nacimiento
              <input type="date" name="fecha_nacimiento" value="${escapeAttr(normalizeInputDate(item.fecha_nacimiento))}">
            </label>
            <label>Edad
              <input type="number" name="edad" min="0" max="120" value="${escapeAttr(item.edad || '')}">
            </label>
            <label>Teléfono
              <input name="telefono" value="${escapeAttr(item.telefono)}" placeholder="+569XXXXXXXX" autocomplete="tel">
            </label>
            <label>Correo electrónico
              <input type="email" name="correo" value="${escapeAttr(item.correo)}" autocomplete="email">
            </label>
            <label>Categoría de socio/a
              <select name="categoria_socio">
                ${option('Socio/a activo/a', item.categoria_socio)}
                ${option('Socio/a colaborador/a', item.categoria_socio)}
                ${option('Socio/a benefactor/a', item.categoria_socio)}
              </select>
            </label>
            <label>Estado del socio/a
              <select name="estado_socio">
                ${option('activo', item.estado_socio, 'Activo/a')}
                ${option('inactivo', item.estado_socio, 'Inactivo/a')}
                ${option('suspendido', item.estado_socio, 'Suspendido/a')}
              </select>
            </label>
            <label>Domicilio
              <input name="domicilio" value="${escapeAttr(item.domicilio)}">
            </label>
            <label>Comuna
              <input name="comuna" value="${escapeAttr(item.comuna)}">
            </label>
            <label>Ocupación
              <input name="ocupacion" value="${escapeAttr(item.ocupacion)}">
            </label>
            <label class="member-edit-full">Observaciones internas
              <textarea name="observaciones_internas" rows="4">${escapeHTML(item.observaciones_internas || item.observaciones || '')}</textarea>
            </label>
          </div>
          <p class="member-edit-status" data-member-edit-status></p>
          <div class="member-edit-actions">
            <button type="submit" class="secondary-admin-button">Guardar edición del miembro</button>
          </div>
        </form>
      </details>
    `;
  }

  async function saveMemberEdit(form) {
    const id = form.dataset.memberId;
    const status = form.querySelector('[data-member-edit-status]');
    const button = form.querySelector('button[type="submit"]');
    const payload = { id };

    new FormData(form).forEach((value, key) => {
      payload[key] = String(value || '').trim();
    });

    try {
      if (status) {
        status.textContent = 'Guardando edición...';
        status.classList.remove('error', 'success');
      }
      if (button) button.disabled = true;
      const session = await client.auth.getSession();
      const token = session.data?.session?.access_token;
      if (!token) throw new Error('Sesión no disponible. Vuelve a iniciar sesión.');

      const response = await fetch('/api/miembros-editar', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No fue posible guardar la edición.');

      cache.set(String(id), data.miembro);
      updateVisibleRow(id, data.miembro);
      if (status) {
        status.textContent = 'Miembro actualizado correctamente.';
        status.classList.add('success');
      }
    } catch (error) {
      if (status) {
        status.textContent = error.message || 'No fue posible guardar la edición.';
        status.classList.add('error');
      }
    } finally {
      if (button) button.disabled = false;
    }
  }

  function updateVisibleRow(id, item) {
    const card = document.querySelector(`[data-member-card="${cssEscape(id)}"]`);
    const spans = card?.querySelectorAll('.member-row-summary span');
    if (!spans?.length) return;
    if (spans[0]) spans[0].textContent = item.nombre || '—';
    if (spans[1]) spans[1].textContent = item.edad || '—';
    if (spans[2]) spans[2].textContent = item.telefono || '—';
    if (spans[3]) spans[3].textContent = item.correo || '—';
    if (spans[4]) spans[4].textContent = item.categoria_socio || '—';
    if (spans[6]) spans[6].textContent = labelSocioStatus(item.estado_socio);
  }

  function option(value, current, label = value) {
    return `<option value="${escapeAttr(value)}" ${String(value) === String(current || '') ? 'selected' : ''}>${escapeHTML(label)}</option>`;
  }

  function labelSocioStatus(value) {
    return { activo: 'Activo/a', inactivo: 'Inactivo/a', suspendido: 'Suspendido/a' }[String(value || '').toLowerCase()] || 'Activo/a';
  }

  function normalizeInputDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  function loadStyles() {
    if (document.querySelector('link[data-miembros-edit-panel]')) return;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'miembros-edit-panel.css?v=20260707';
    css.dataset.miembrosEditPanel = 'true';
    document.head.appendChild(css);
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
})();
