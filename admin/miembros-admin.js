import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const MEMBER_STATUS = ['pendiente', 'contactado', 'rechazado', 'miembro'];
const MEMBER_STATUS_LABELS = {
  pendiente: 'Pendiente',
  contactado: 'Contactado',
  rechazado: 'Rechazado',
  miembro: 'Miembro'
};
const SOCIO_STATUS_LABELS = {
  activo: 'Activo/a',
  inactivo: 'Inactivo/a',
  suspendido: 'Suspendido/a'
};
const CACHE_KEY = 'nothofagus_members_admin_cache_v2';
const CACHE_TTL = 90 * 1000;
const PAGE_SIZE = 45;
const RENDER_IDLE_DELAY = 24;

let solicitudes = [];
let loaded = false;
let ready = false;
let loading = false;
let loadPromise = null;
let renderLimits = { pendiente: PAGE_SIZE, contactado: PAGE_SIZE, rechazado: PAGE_SIZE, miembro: PAGE_SIZE };
let filterTimer = null;

const timer = setInterval(() => {
  const firstView = document.querySelector('[data-member-status-view]');
  if (!firstView) return;

  clearInterval(timer);
  ready = true;
  installMemberAdmin();
}, 120);

window.addEventListener('nothofagus:members-view', async () => {
  if (!ready) return;
  if (!loaded) await loadRequests({ useCache: true });
  renderActiveView();
});

function installMemberAdmin() {
  installPerformanceStyle();

  document.querySelectorAll('[data-reload-members]').forEach((button) => {
    button.addEventListener('click', () => loadRequests({ force: true }));
  });

  document.querySelectorAll('[data-member-filter-bar]').forEach((bar) => {
    const handler = () => {
      window.clearTimeout(filterTimer);
      filterTimer = window.setTimeout(() => {
        resetActiveLimit();
        renderActiveView();
      }, 90);
    };
    bar.addEventListener('input', handler);
    bar.addEventListener('change', handler);
  });

  document.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-member-action]');
    const toggleButton = event.target.closest('[data-toggle-member-detail]');
    const saveMemberButton = event.target.closest('[data-save-member-record]');
    const moreButton = event.target.closest('[data-members-load-more]');

    if (actionButton) {
      await handleMemberAction(actionButton);
    }

    if (toggleButton) {
      toggleMemberDetail(toggleButton.dataset.toggleMemberDetail);
    }

    if (saveMemberButton) {
      await saveMemberRecord(saveMemberButton.dataset.saveMemberRecord);
    }

    if (moreButton) {
      const status = moreButton.dataset.membersLoadMore;
      renderLimits[status] = Number(renderLimits[status] || PAGE_SIZE) + PAGE_SIZE;
      renderActiveView();
    }
  });

  document.querySelectorAll('[data-member-status-view]').forEach((view) => {
    if (view.classList.contains('is-active')) {
      loadRequests({ useCache: true });
    }
  });
}

async function loadRequests({ force = false, useCache = false } = {}) {
  if (loading && loadPromise) return loadPromise;
  loaded = true;

  const cached = !force && useCache ? readCache() : null;
  if (cached?.length) {
    solicitudes = cached.map(normalizeSolicitud);
    updateCounters();
    renderActiveView();
    showActiveStatus('Listado cargado desde caché. Actualizando en segundo plano...', true);
    refreshRequestsInBackground();
    return;
  }

  loading = true;
  setLoadingState('Cargando registros...');
  loadPromise = fetchRequests()
    .then((items) => {
      solicitudes = items;
      loaded = true;
      writeCache(items);
      updateCounters();
      renderActiveView();
      showActiveStatus('Listado de miembros actualizado.', true);
    })
    .catch((error) => {
      renderAllLists(`<p class="admin-status error">${escapeHTML(error.message || 'No fue posible cargar registros.')}</p>`);
    })
    .finally(() => {
      loading = false;
      loadPromise = null;
    });

  return loadPromise;
}

async function refreshRequestsInBackground() {
  if (loading) return;
  loading = true;
  try {
    const items = await fetchRequests();
    solicitudes = items;
    writeCache(items);
    updateCounters();
    renderActiveView();
    showActiveStatus('Listado actualizado.', true);
  } catch {
    // Se mantiene la versión en caché para no bloquear la sección.
  } finally {
    loading = false;
  }
}

async function fetchRequests() {
  const data = await api('/api/miembros');
  return (data.solicitudes || []).map(normalizeSolicitud);
}

function renderActiveView() {
  const view = document.querySelector('[data-member-status-view].is-active');
  if (!view) return;

  const statusView = view.dataset.memberStatusView;
  const list = view.querySelector('[data-members-list]');
  const statusBox = view.querySelector('[data-members-status]');
  const filtered = getFilteredItems(view, statusView);

  if (statusBox) statusBox.textContent = '';
  if (!list) return;

  if (!filtered.length) {
    list.innerHTML = emptyState(statusView);
    return;
  }

  const limit = Number(renderLimits[statusView] || PAGE_SIZE);
  const visible = filtered.slice(0, limit);
  const remaining = Math.max(filtered.length - visible.length, 0);
  const body = statusView === 'miembro'
    ? visible.map(renderMember).join('')
    : visible.map((item) => renderSolicitud(item, statusView)).join('');

  list.innerHTML = body + renderLoadMore(statusView, remaining, filtered.length);
}

function renderLoadMore(statusView, remaining, total) {
  if (remaining <= 0) return '';
  return `
    <div class="members-load-more">
      <p>Mostrando ${Math.max(total - remaining, 0)} de ${total} registros.</p>
      <button type="button" class="secondary-admin-button" data-members-load-more="${escapeAttr(statusView)}">Cargar ${Math.min(PAGE_SIZE, remaining)} más</button>
    </div>
  `;
}

function getFilteredItems(view, statusView) {
  const filters = getFilters(view);

  return solicitudes
    .filter((item) => item.estado === statusView)
    .filter((item) => {
      const nombreOk = !filters.nombre || item.nombre.toLowerCase().includes(filters.nombre);
      const categoriaOk = !filters.categoria || item.categoria_socio === filters.categoria;
      const estadoOk = !filters.estado || item.estado === filters.estado;
      const fechaOk = !filters.fecha || normalizeDate(item.created_at) === filters.fecha;
      return nombreOk && categoriaOk && estadoOk && fechaOk;
    });
}

function getFilters(view) {
  return {
    nombre: String(view.querySelector('[data-member-filter="nombre"]')?.value || '').trim().toLowerCase(),
    categoria: String(view.querySelector('[data-member-filter="categoria"]')?.value || '').trim(),
    estado: String(view.querySelector('[data-member-filter="estado"]')?.value || '').trim(),
    fecha: String(view.querySelector('[data-member-filter="fecha"]')?.value || '').trim()
  };
}

function renderSolicitud(item, statusView) {
  const isRejected = statusView === 'rechazado';
  const actionButtons = renderActions(statusView, item.id);

  return `
    <article class="member-request-card" data-member-card="${escapeAttr(item.id)}">
      <div class="member-request-main">
        <div class="member-card-header">
          <span class="member-status-pill ${escapeAttr(item.estado)}">${escapeHTML(labelStatus(item.estado))}</span>
          <small>${formatDate(item.created_at)}</small>
        </div>
        <h4>${escapeHTML(item.nombre)}</h4>
        <dl class="member-summary-grid">
          <div><dt>Correo electrónico</dt><dd>${escapeHTML(item.correo)}</dd></div>
          <div><dt>Teléfono</dt><dd>${escapeHTML(item.telefono)}</dd></div>
          <div><dt>Categoría solicitada</dt><dd>${escapeHTML(item.categoria_socio || '—')}</dd></div>
          <div><dt>Fecha de solicitud</dt><dd>${formatDate(item.created_at)}</dd></div>
        </dl>
        ${isRejected ? `<div class="member-rejection-box"><strong>Observaciones del rechazo</strong><p>${escapeHTML(item.observacion_rechazo || 'Sin observaciones registradas.')}</p></div>` : ''}
        <details class="member-detail-box">
          <summary>Ver detalle</summary>
          ${renderFullInfo(item)}
        </details>
      </div>

      <div class="member-request-actions">
        <label>${isRejected ? 'Observaciones del rechazo' : 'Observaciones internas o de rechazo'}
          <textarea data-member-notes rows="5" placeholder="Registra observaciones internas o motivo de rechazo">${escapeHTML(isRejected ? item.observacion_rechazo : item.observaciones_internas || item.observaciones || '')}</textarea>
        </label>
        ${actionButtons}
      </div>
    </article>
  `;
}

function renderMember(item) {
  return `
    <article class="member-row-card" data-member-card="${escapeAttr(item.id)}">
      <button type="button" class="member-row-summary" data-toggle-member-detail="${escapeAttr(item.id)}" aria-expanded="false">
        <span>${escapeHTML(item.nombre)}</span>
        <span>${escapeHTML(item.edad || '—')}</span>
        <span>${escapeHTML(item.telefono)}</span>
        <span>${escapeHTML(item.correo)}</span>
        <span>${escapeHTML(item.categoria_socio || '—')}</span>
        <span>${formatDate(item.fecha_ingreso || item.updated_at || item.created_at)}</span>
        <span>${escapeHTML(labelSocioStatus(item.estado_socio))}</span>
      </button>

      <div class="member-extra" data-member-extra="${escapeAttr(item.id)}">
        <div class="member-extra-grid" data-member-extra-grid="${escapeAttr(item.id)}" data-detail-loaded="false">
          <p class="admin-status compact">Detalle preparado para cargar al desplegar.</p>
        </div>
        <div class="member-record-actions">
          <label>Estado del socio/a
            <select data-member-socio-status>
              ${socioStatusOption('activo', item.estado_socio)}
              ${socioStatusOption('inactivo', item.estado_socio)}
              ${socioStatusOption('suspendido', item.estado_socio)}
            </select>
          </label>
          <label>Observaciones internas
            <textarea data-member-internal-notes rows="4" placeholder="Observaciones administrativas">${escapeHTML(item.observaciones_internas || item.observaciones || '')}</textarea>
          </label>
          <button type="button" class="secondary-admin-button" data-save-member-record="${escapeAttr(item.id)}">Guardar datos del socio/a</button>
        </div>
      </div>
    </article>
  `;
}

function hydrateMemberDetail(id) {
  const grid = document.querySelector(`[data-member-extra-grid="${cssEscape(id)}"]`);
  if (!grid || grid.dataset.detailLoaded === 'true') return;
  const item = solicitudes.find((solicitud) => String(solicitud.id) === String(id));
  if (!item) return;
  window.setTimeout(() => {
    grid.innerHTML = renderFullInfo(item);
    grid.dataset.detailLoaded = 'true';
  }, RENDER_IDLE_DELAY);
}

function renderFullInfo(item) {
  return `
    <div class="member-admin-section">
      <strong>Antecedentes personales</strong>
      <dl>
        <div><dt>RUT / documento</dt><dd>${escapeHTML(item.rut_documento || '—')}</dd></div>
        <div><dt>Fecha de nacimiento</dt><dd>${formatDate(item.fecha_nacimiento)}</dd></div>
        <div><dt>Domicilio</dt><dd>${escapeHTML(item.domicilio || '—')}</dd></div>
        <div><dt>Comuna</dt><dd>${escapeHTML(item.comuna || '—')}</dd></div>
        <div><dt>Ocupación</dt><dd>${escapeHTML(item.ocupacion || '—')}</dd></div>
        <div><dt>Menor de edad</dt><dd>${item.menor_edad ? 'Sí' : 'No'}</dd></div>
      </dl>
    </div>
    <div class="member-admin-section">
      <strong>Vínculo y participación</strong>
      <p><strong>Vínculo:</strong> ${escapeHTML(item.vinculo_organizacion || '—')}</p>
      <p><strong>Áreas de interés:</strong> ${escapeHTML(normalizeAreas(item.areas_participacion || item.intereses).join(', ') || '—')}</p>
      <p><strong>Motivación:</strong> ${escapeHTML(item.motivacion || '—')}</p>
      <p><strong>Aporte declarado:</strong> ${escapeHTML(item.aporte || '—')}</p>
      <p><strong>Experiencia previa:</strong> ${item.experiencia_previa ? escapeHTML(item.experiencia_descripcion || 'Sí, sin detalle.') : 'No'}</p>
    </div>
    ${item.menor_edad ? renderAdultSection(item) : ''}
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
      </dl>
    </div>
  `;
}

function renderActions(status, id) {
  const actions = {
    pendiente: [
      ['contactado', 'Marcar como contactado'],
      ['rechazado', 'Rechazar'],
      ['miembro', 'Aceptar como miembro']
    ],
    contactado: [
      ['pendiente', 'Volver a pendiente'],
      ['rechazado', 'Rechazar'],
      ['miembro', 'Aceptar como miembro']
    ],
    rechazado: [
      ['pendiente', 'Restaurar a pendiente']
    ]
  }[status] || [];

  return `<div class="member-quick-actions">${actions.map(([nextStatus, label]) => `
    <button type="button" class="secondary-admin-button" data-member-action="${nextStatus}" data-member-id="${escapeAttr(id)}">${label}</button>
  `).join('')}</div>`;
}

async function handleMemberAction(button) {
  const id = button.dataset.memberId;
  const nextStatus = button.dataset.memberAction;
  const card = document.querySelector(`[data-member-card="${cssEscape(id)}"]`);
  const notes = String(card?.querySelector('[data-member-notes]')?.value || '').trim();
  const item = solicitudes.find((solicitud) => solicitud.id === id);

  if (!item) return;

  if (nextStatus === 'rechazado' && !notes) {
    showActiveStatus('Para rechazar una solicitud debes completar “Observaciones del rechazo”.', false);
    card?.querySelector('[data-member-notes]')?.focus();
    return;
  }

  if (nextStatus === 'miembro' && (!item.nombre || !item.correo || !item.telefono || !item.categoria_socio)) {
    showActiveStatus('No se puede transformar en miembro sin nombre, correo, teléfono y categoría de socio/a.', false);
    return;
  }

  const payload = {
    id,
    estado: nextStatus,
    observaciones: nextStatus === 'rechazado' ? '' : notes,
    observacion_rechazo: nextStatus === 'rechazado' ? notes : item.observacion_rechazo || '',
    observaciones_internas: nextStatus === 'rechazado' ? item.observaciones_internas || '' : notes
  };

  await patchMember(payload, 'Registro actualizado correctamente.');
}

async function saveMemberRecord(id) {
  const card = document.querySelector(`[data-member-card="${cssEscape(id)}"]`);
  if (!card) return;

  const payload = {
    id,
    estado: 'miembro',
    estado_socio: card.querySelector('[data-member-socio-status]')?.value || 'activo',
    observaciones_internas: card.querySelector('[data-member-internal-notes]')?.value || ''
  };

  await patchMember(payload, 'Datos del socio/a actualizados correctamente.');
}

async function patchMember(payload, successMessage) {
  try {
    showActiveStatus('Guardando cambios...', true);
    await api('/api/miembros', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    clearCache();
    showActiveStatus(successMessage, true);
    await loadRequests({ force: true });
  } catch (error) {
    showActiveStatus(error.message || 'No fue posible guardar los cambios.', false);
  }
}

function toggleMemberDetail(id) {
  const button = document.querySelector(`[data-toggle-member-detail="${cssEscape(id)}"]`);
  const detail = document.querySelector(`[data-member-extra="${cssEscape(id)}"]`);
  if (!button || !detail) return;

  const expanded = detail.classList.toggle('is-open');
  button.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  if (expanded) hydrateMemberDetail(id);
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

function normalizeSolicitud(item) {
  const estado = normalizeStatus(item.estado);
  return {
    ...item,
    estado,
    estado_socio: normalizeSocioStatus(item.estado_socio),
    observacion_rechazo: item.observacion_rechazo || item.rejection_observation || '',
    observaciones_internas: item.observaciones_internas || item.internal_notes || item.observaciones || '',
    fecha_ingreso: item.fecha_ingreso || item.joined_at || (estado === 'miembro' ? item.updated_at || item.created_at : '')
  };
}

function updateCounters() {
  const counts = { pendiente: 0, contactado: 0, rechazado: 0, miembro: 0 };
  solicitudes.forEach((item) => {
    if (counts[item.estado] !== undefined) counts[item.estado] += 1;
  });

  Object.entries(counts).forEach(([key, value]) => {
    document.querySelectorAll(`[data-member-counter="${key}"]`).forEach((counter) => {
      counter.textContent = value;
    });
  });
}

function setLoadingState(message) {
  const view = document.querySelector('[data-member-status-view].is-active');
  const list = view?.querySelector('[data-members-list]');
  if (list) list.innerHTML = `<p class="admin-status">${escapeHTML(message)}</p>`;
}

function renderAllLists(html) {
  document.querySelectorAll('[data-members-list]').forEach((list) => {
    list.innerHTML = html;
  });
}

function showActiveStatus(message, ok) {
  const view = document.querySelector('[data-member-status-view].is-active');
  const status = view?.querySelector('[data-members-status]');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('success', ok);
  status.classList.toggle('error', !ok);
}

function emptyState(status) {
  const text = {
    pendiente: 'No hay solicitudes pendientes.',
    contactado: 'No hay solicitudes contactadas.',
    rechazado: 'No hay solicitudes rechazadas.',
    miembro: 'No hay miembros registrados.'
  }[status] || 'No hay registros disponibles.';

  return `<div class="members-empty-state"><strong>${text}</strong><p>Usa los filtros o actualiza el listado para revisar nuevos registros.</p></div>`;
}

function resetActiveLimit() {
  const view = document.querySelector('[data-member-status-view].is-active');
  if (view?.dataset.memberStatusView) renderLimits[view.dataset.memberStatusView] = PAGE_SIZE;
}

function readCache() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (Date.now() - Number(parsed.updatedAt || 0) > CACHE_TTL) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function writeCache(items) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ updatedAt: Date.now(), items }));
  } catch {
    // La caché es opcional.
  }
}

function clearCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

function installPerformanceStyle() {
  if (document.querySelector('style[data-members-performance-style]')) return;
  const style = document.createElement('style');
  style.dataset.membersPerformanceStyle = 'true';
  style.textContent = `
    .members-load-more { display:grid; gap:10px; place-items:center; padding:14px; border-radius:18px; background:rgba(79,125,74,.08); }
    .members-load-more p { margin:0; color:var(--texto-suave); font-weight:850; }
    .admin-status.compact { margin:0; padding:12px; font-size:.82rem; }
  `;
  document.head.appendChild(style);
}

function normalizeStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'aceptado') return 'miembro';
  if (value === 'member') return 'miembro';
  if (MEMBER_STATUS.includes(value)) return value;
  return 'pendiente';
}

function normalizeSocioStatus(status) {
  const value = String(status || '').trim().toLowerCase();
  if (['activo', 'inactivo', 'suspendido'].includes(value)) return value;
  if (value === 'active') return 'activo';
  if (value === 'inactive') return 'inactivo';
  if (value === 'suspended') return 'suspendido';
  return 'activo';
}

function normalizeAreas(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function socioStatusOption(value, current) {
  return `<option value="${value}" ${value === current ? 'selected' : ''}>${SOCIO_STATUS_LABELS[value]}</option>`;
}

function labelStatus(value) {
  return MEMBER_STATUS_LABELS[normalizeStatus(value)] || 'Pendiente';
}

function labelSocioStatus(value) {
  return SOCIO_STATUS_LABELS[normalizeSocioStatus(value)] || 'Activo/a';
}

function normalizeDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
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
