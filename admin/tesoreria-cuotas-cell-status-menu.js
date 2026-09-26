import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusCuotasCellStatusMenu) return;
  window.__nothofagusCuotasCellStatusMenu = true;

  const API_URL = '/api/cuotas-estados';
  const LEGACY_STORAGE_KEY = 'nothofagus_cuotas_month_status_overrides_v1';
  const STATUS_CLASSES = ['pagado', 'pendiente', 'atrasado', 'sin_registro'];
  const STATUS_LABELS = { pagado: 'Pagado', pendiente: 'Pendiente', atrasado: 'Atrasado', sin_registro: 'N/A' };
  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  let activeDot = null;
  let menu = null;
  let forwardingPaymentClick = false;
  let records = [];
  let loadingRecords = false;
  let pendingRefresh = false;

  loadStyles();
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeMenu(); closeDetails(); }
  });
  window.addEventListener('nothofagus:cuotas-matrix-refreshed', refreshRecords);

  const startObserver = () => {
    const view = document.querySelector('#tesoreria-cuotas-view');
    if (view) refreshRecords();
  };

  document.addEventListener('DOMContentLoaded', startObserver);

  function handleClick(event) {
    const detailClose = event.target.closest?.('[data-cuotas-cell-details-close]');
    if (detailClose || event.target.matches?.('[data-cuotas-cell-details-backdrop]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeDetails();
      return;
    }

    const choice = event.target.closest?.('[data-status-choice]');
    if (choice && menu?.contains(choice)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      handleChoice(choice.dataset.statusChoice, choice);
      return;
    }

    const dot = event.target.closest?.('#tesoreria-cuotas-view [data-cuotas-payment-month]');
    if (dot) {
      if (forwardingPaymentClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openMenu(dot);
      return;
    }
    if (menu && !event.target.closest?.('.cuotas-status-menu')) closeMenu();
  }

  function openMenu(dot) {
    activeDot = dot;
    closeMenu(false);
    menu = document.createElement('div');
    menu.className = 'cuotas-status-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `
      <button type="button" data-status-choice="${dot.dataset.cuotasPaymentId ? 'editar_pago' : 'pagado'}">${dot.dataset.cuotasPaymentId ? 'Editar pago registrado' : 'Registrar pago'}</button>
      ${dot.dataset.cuotasPaymentId ? '<button type="button" data-status-choice="eliminar_pago">Eliminar pago</button>' : ''}
      <button type="button" data-status-choice="pendiente">Pendiente</button>
      <button type="button" data-status-choice="atrasado">Atrasado</button>
      <button type="button" data-status-choice="sin_registro">N/A</button>
      <button type="button" data-status-choice="detalles">Detalles</button>`;
    document.querySelector('#tesoreria-cuotas-view')?.appendChild(menu);
    positionMenu(dot, menu);
  }

  function positionMenu(dot, panel) {
    const rect = dot.getBoundingClientRect();
    const width = 176;
    let left = rect.left + rect.width / 2 - width / 2;
    let top = rect.bottom + 10;
    left = Math.max(10, Math.min(left, window.innerWidth - width - 10));
    if (top + 230 > window.innerHeight) top = Math.max(10, rect.top - 230);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  async function handleChoice(choice, button) {
    if (!activeDot) return closeMenu();
    if (choice === 'detalles') {
      const info = getDotInfo(activeDot);
      closeMenu();
      openDetails(info);
      return;
    }
    if (choice === 'editar_pago') {
      const dot = activeDot;
      const info = getDotInfo(dot);
      closeMenu();
      window.dispatchEvent(new CustomEvent('nothofagus:cuotas-edit-payment', {
        detail: { paymentId: dot.dataset.cuotasPaymentId || '', memberId: info.memberId, month: info.month, anio: info.anio }
      }));
      return;
    }
    if (choice === 'eliminar_pago') {
      const dot = activeDot;
      const info = getDotInfo(dot);
      closeMenu();
      window.dispatchEvent(new CustomEvent('nothofagus:cuotas-delete-payment', {
        detail: { paymentId: dot.dataset.cuotasPaymentId || '', memberId: info.memberId, month: info.month, anio: info.anio }
      }));
      return;
    }
    if (!STATUS_CLASSES.includes(choice)) return closeMenu();
    if (choice === 'pagado') {
      const dot = activeDot;
      const info = getDotInfo(dot);
      closeMenu();
      forwardingPaymentClick = true;
      dot.click();
      forwardingPaymentClick = false;
      return;
    }
    if (activeDot.dataset.cuotasPaymentId) {
      const info = getDotInfo(activeDot);
      showStatus(`${info.mesLabel} tiene un pago real. Elimínalo desde el historial antes de cambiar su estado.`, false);
      closeMenu();
      return;
    }

    const dot = activeDot;
    const info = getDotInfo(dot);
    if (info.currentStatus === choice) {
      showStatus(`${info.mesLabel} ya está marcado como ${STATUS_LABELS[choice]}.`, true);
      closeMenu();
      return;
    }

    try {
      if (button) button.disabled = true;
      showStatus('Guardando cambio de estado...', true);
      const result = await api(API_URL, {
        method: 'POST',
        body: JSON.stringify({
          member_id: info.memberId,
          anio: Number(info.anio),
          mes: info.month,
          fecha: new Date().toISOString().slice(0, 10),
          estado_anterior: info.currentStatus,
          estado_nuevo: choice,
          observacion: ''
        })
      });
      applyStatus(dot, choice, result.cambio);
      records.unshift(result.cambio);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      showStatus(`Estado actualizado a ${STATUS_LABELS[choice]}. El cambio quedó registrado en Movimientos.`, true);
      notifyStatusChanged(info, choice, result.cambio);
      closeMenu();
    } catch (error) {
      if (button) button.disabled = false;
      showStatus(error.message || 'No fue posible guardar el cambio de estado.', false);
    }
  }

  function applyStatus(dot, status, record = null) {
    STATUS_CLASSES.forEach((item) => dot.classList.remove(item));
    dot.classList.add(status, 'is-manual-status');
    dot.dataset.manualStatus = status;
    if (record?.id) dot.dataset.cuotasStatusRecordId = record.id;
    const info = getDotInfo(dot);
    const label = STATUS_LABELS[status] || status;
    dot.title = `${info.mesLabel} · ${label} · cambio registrado`;
    dot.setAttribute('aria-label', dot.title);
  }

  function notifyStatusChanged(info, status, record) {
    const detail = { memberId: info.memberId, memberName: info.memberName, month: info.month, mesLabel: info.mesLabel, anio: info.anio, status, record };
    document.querySelector('#tesoreria-cuotas-view')?.dispatchEvent(new CustomEvent('nothofagus:cuotas-status-changed', { bubbles: true, detail }));
    window.dispatchEvent(new CustomEvent('nothofagus:cuotas-status-changed', { detail }));
    window.dispatchEvent(new CustomEvent('nothofagus:cuotas-status-record-changed', { detail: { ...detail, action: 'created' } }));
    if (typeof window.__nothofagusCuotasManualStatusRecalculate === 'function') window.__nothofagusCuotasManualStatusRecalculate();
  }

  async function refreshRecords() {
    const view = document.querySelector('#tesoreria-cuotas-view');
    if (!view || !client) return;
    if (loadingRecords) { pendingRefresh = true; return; }
    loadingRecords = true;
    try {
      const year = getSelectedYear();
      const data = await api(`${API_URL}?anio=${encodeURIComponent(year)}`, { cache: 'no-store' });
      records = Array.isArray(data.cambios) ? data.cambios : [];
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      applyRecords();
    } catch (error) {
      showStatus(error.message || 'No fue posible cargar el historial de estados.', false);
    } finally {
      loadingRecords = false;
      if (pendingRefresh) { pendingRefresh = false; window.setTimeout(refreshRecords, 40); }
    }
  }

  function applyRecords() {
    const latest = new Map();
    records.filter((record) => !record.eliminado).forEach((record) => {
      const key = makeKey(record.memberId, record.anio, record.mes);
      if (!latest.has(key)) latest.set(key, record);
    });
    document.querySelectorAll('#tesoreria-cuotas-view .payment-status-dot[data-month]').forEach((dot) => {
      if (dot.dataset.cuotasPaymentId) return;
      const info = getDotInfo(dot);
      const record = latest.get(makeKey(info.memberId, info.anio, info.month));
      if (record && STATUS_CLASSES.includes(record.estadoNuevo)) applyStatus(dot, record.estadoNuevo, record);
    });
    if (typeof window.__nothofagusCuotasManualStatusRecalculate === 'function') window.__nothofagusCuotasManualStatusRecalculate();
  }

  function getDotInfo(dot) {
    const row = dot.closest('tr');
    const month = Number(dot.dataset.month || 0);
    const memberId = String(dot.dataset.memberId || dot.dataset.cuotasPaymentMonth || '');
    const memberName = row?.querySelector('[data-label="Integrante"] strong')?.textContent?.trim() || 'Integrante';
    const cuota = row?.querySelector('[data-label="Cuota mensual"]')?.textContent?.trim() || '—';
    const currentStatus = getCurrentStatus(dot);
    const anio = getSelectedYear();
    const mesLabel = dot.closest('td')?.dataset.label || getMonthName(month);
    const record = records.find((item) => !item.eliminado && String(item.memberId) === memberId && Number(item.anio) === Number(anio) && Number(item.mes) === month) || null;
    return { row, dot, memberId, memberName, cuota, month, mesLabel, anio, currentStatus, record };
  }

  function getCurrentStatus(dot) {
    if (dot.classList.contains('pagado')) return 'pagado';
    if (dot.classList.contains('pendiente')) return 'pendiente';
    if (dot.classList.contains('atrasado')) return 'atrasado';
    return 'sin_registro';
  }

  function openDetails(info) {
    closeDetails();
    const panel = document.createElement('div');
    panel.className = 'cuotas-cell-details-backdrop';
    panel.dataset.cuotasCellDetailsBackdrop = 'true';
    panel.innerHTML = `
      <section class="cuotas-cell-details-panel" role="dialog" aria-modal="true" aria-label="Detalles de cuota mensual">
        <header class="cuotas-cell-details-head"><div><h4>Detalles del mes</h4><p>${escapeHTML(info.memberName)} · ${escapeHTML(info.mesLabel)} ${escapeHTML(info.anio)}</p></div><button type="button" class="cuotas-cell-details-close" data-cuotas-cell-details-close>×</button></header>
        <div class="cuotas-cell-details-body">
          <dl>
            <div><dt>Integrante</dt><dd>${escapeHTML(info.memberName)}</dd></div>
            <div><dt>Mes</dt><dd>${escapeHTML(info.mesLabel)} ${escapeHTML(info.anio)}</dd></div>
            <div><dt>Estado actual</dt><dd>${escapeHTML(STATUS_LABELS[info.currentStatus] || info.currentStatus)}</dd></div>
            <div><dt>Cuota mensual</dt><dd>${escapeHTML(info.cuota)}</dd></div>
          </dl>
          <p class="cuotas-empty compact">${info.record ? `Último cambio registrado por ${escapeHTML(info.record.actualizadoPor || info.record.creadoPor || 'Usuario interno')}${info.record.observacion ? `: ${escapeHTML(info.record.observacion)}` : '.'}` : 'Este estado se calcula automáticamente y aún no tiene un cambio manual registrado.'}</p>
        </div>
      </section>`;
    document.querySelector('#tesoreria-cuotas-view')?.appendChild(panel);
  }

  async function api(url, options = {}) {
    const session = await client?.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) throw new Error('Sesión no disponible.');
    const response = await fetch(url, { ...options, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Error de solicitud.');
    return data;
  }

  function closeDetails() { document.querySelectorAll('#tesoreria-cuotas-view [data-cuotas-cell-details-backdrop]').forEach((item) => item.remove()); }
  function closeMenu(clearActive = true) { menu?.remove(); menu = null; if (clearActive) activeDot = null; }
  function makeKey(memberId, anio, month) { return `${memberId}:${anio}:${month}`; }
  function getSelectedYear() { return String(document.querySelector('[data-cuotas-year]')?.value || document.querySelector('[data-cuotas-filter-year]')?.value || new Date().getFullYear()); }
  function getMonthName(month) { return ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][month] || 'Mes'; }
  function showStatus(message, ok) { const status = document.querySelector('#tesoreria-cuotas-view [data-cuotas-status]'); if (!status) return; status.textContent = message; status.classList.toggle('success', Boolean(ok)); status.classList.toggle('error', !ok); }
  function loadStyles() {
    const href = 'tesoreria-cuotas-cell-status-menu.css?v=20260924-delete-payment';
    const existing = document.querySelector('link[data-cuotas-cell-status-menu]');
    if (existing) { existing.href = href; return; }
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = href; css.dataset.cuotasCellStatusMenu = 'true'; document.head.appendChild(css);
  }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])); }
})();
