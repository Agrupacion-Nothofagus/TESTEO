import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusTesoreriaIngresosCuotas) return;
  window.__nothofagusTesoreriaIngresosCuotas = true;

  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  let year = new Date().getFullYear();
  const DELETED_QUOTAS_KEY = 'nothofagus_cuotas_ingresos_eliminados_v1';
  let cache = { general: [], cuotas: [], cuotasEliminadas: [], estados: [] };
  let loading = false;
  let refreshPending = false;

  loadStyle();
  bindMovementActions();
  document.addEventListener('DOMContentLoaded', queueRefreshIfVisible);
  window.addEventListener('hashchange', queueRefreshIfVisible);
  window.addEventListener('nothofagus:tesoreria-updated', queueRefreshIfVisible);
  window.addEventListener('nothofagus:cuotas-payment-changed', queueRefreshIfVisible);
  window.addEventListener('nothofagus:cuotas-status-record-changed', queueRefreshIfVisible);
  window.addEventListener('nothofagus:treasury-year-changed', (event) => {
    const nextYear = Number(event.detail?.year);
    if (Number.isInteger(nextYear)) year = nextYear;
    queueRefreshIfVisible();
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-tesoreria-open="movimientos"], [data-tesoreria-go="movimientos"]')) window.setTimeout(queueRefresh, 80);
    if (event.target.closest?.('[data-tesoreria-clear]')) window.setTimeout(queueRender, 0);
  }, true);
  document.addEventListener('input', (event) => {
    if (event.target.closest?.('[data-tesoreria-filter]')) window.setTimeout(queueRender, 0);
  }, true);
  document.addEventListener('change', (event) => {
    if (event.target.closest?.('[data-tesoreria-filter]')) window.setTimeout(queueRender, 0);
  }, true);
  function queueRefreshIfVisible() {
    if (document.querySelector('#tesoreria-movimientos-view.is-active')) queueRefresh();
  }

  function bindMovementActions() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest?.('[data-tesoreria-cuota-delete]');
      const editStatus = event.target.closest?.('[data-tesoreria-status-edit]');
      const deleteStatus = event.target.closest?.('[data-tesoreria-status-delete]');
      const closeStatus = event.target.closest?.('[data-tesoreria-status-close]');
      if (button) {
        event.preventDefault(); event.stopPropagation();
        await deleteQuotaIncome(button.dataset.tesoreriaCuotaDelete, button);
      }
      if (editStatus) {
        event.preventDefault(); event.stopPropagation();
        openStatusEditor(editStatus.dataset.tesoreriaStatusEdit);
      }
      if (deleteStatus) {
        event.preventDefault(); event.stopPropagation();
        await deleteStatusChange(deleteStatus.dataset.tesoreriaStatusDelete, deleteStatus);
      }
      if (closeStatus || event.target.matches?.('[data-tesoreria-status-modal]')) {
        event.preventDefault(); event.stopPropagation();
        closeStatusEditor();
      }
    }, true);
    document.addEventListener('submit', (event) => {
      if (!event.target.matches?.('[data-tesoreria-status-form]')) return;
      event.preventDefault();
      saveStatusChange(event.target);
    }, true);
  }

  function queueRefresh() {
    window.clearTimeout(queueRefresh.timer);
    queueRefresh.timer = window.setTimeout(refreshData, 120);
  }

  function queueRender() {
    window.clearTimeout(queueRender.timer);
    queueRender.timer = window.setTimeout(renderCuotasAsIncome, 90);
  }

  async function refreshData() {
    if (loading) {
      refreshPending = true;
      return;
    }
    if (!document.querySelector('#tesoreria-movimientos-view.is-active')) return;
    try {
      loading = true;
      const token = await getToken();
      if (!token) return;
      const [generalResult, cuotasResult, statusResult] = await Promise.allSettled([
        fetch('/api/tesoreria', { headers: { authorization: 'Bearer ' + token } }),
        fetch('/api/cuotas-miembros?anio=' + encodeURIComponent(year), { headers: { authorization: 'Bearer ' + token } }),
        fetch('/api/cuotas-estados?anio=' + encodeURIComponent(year), { headers: { authorization: 'Bearer ' + token }, cache: 'no-store' })
      ]);
      const generalResponse = generalResult.status === 'fulfilled' ? generalResult.value : null;
      const cuotasResponse = cuotasResult.status === 'fulfilled' ? cuotasResult.value : null;
      const statusResponse = statusResult.status === 'fulfilled' ? statusResult.value : null;
      const generalData = generalResponse?.ok ? await generalResponse.json().catch(() => ({})) : {};
      const cuotasData = cuotasResponse?.ok ? await cuotasResponse.json().catch(() => ({})) : {};
      const statusData = statusResponse?.ok ? await statusResponse.json().catch(() => ({})) : {};
      const deleted = readDeletedQuotaRows();
      cache.general = Array.isArray(generalData.movimientos) ? generalData.movimientos.filter(Boolean) : [];
      cache.cuotas = cuotaPaymentsToIncomeRows(cuotasData);
      cache.cuotasEliminadas = Object.values(deleted).filter((item) => item && Number(item.anio || year) === year);
      cache.estados = statusChangesToRows(statusData);
      renderCuotasAsIncome();
    } finally {
      loading = false;
      if (refreshPending) {
        refreshPending = false;
        queueRefresh();
      }
    }
  }

  function cuotaPaymentsToIncomeRows(data) {
    const historic = Array.isArray(data.pagosHistoricos) ? data.pagosHistoricos : [];
    const fromMembers = Array.isArray(data.miembros) ? data.miembros.flatMap((member) => {
      const pagos = Array.isArray(member.pagos) ? member.pagos : [];
      return pagos.map((pago) => ({ ...pago, miembroNombre: member.nombre || '' }));
    }) : [];
    const source = historic.length ? historic : fromMembers;
    const unique = new Map();

    source.forEach((pago) => {
      const amount = Number(pago.monto || 0);
      if (!amount || amount <= 0) return;
      const paymentYear = Number(pago.anio || year);
      if (paymentYear !== year) return;
      const id = String(pago.id || [pago.memberId || pago.member_id || '', pago.anio || year, pago.mes || 0, amount, pago.fechaPago || pago.fecha_pago || ''].join(':'));
      if (unique.has(id)) return;
      const type = String(pago.tipoPago || pago.tipo_pago || 'mensual').toLowerCase();
      const month = Number(pago.mes || 0);
      const name = pago.miembroNombre || pago.nombre || 'Integrante';
      unique.set(id, {
        id: `cuota-${id}`,
        sourceId: id,
        tipo: 'ingreso',
        origen: 'cuota',
        fecha: pago.fechaPago || pago.fecha_pago || `${paymentYear}-01-01`,
        anio: paymentYear,
        descripcion: type === 'anual' || month === 0 ? `Cuota anual · ${name}` : `Cuota mensual ${monthName(month)} · ${name}`,
        monto: amount,
        observaciones: pago.observacion || '',
        comprobanteUrl: pago.comprobanteUrl || '',
        comprobanteNombre: pago.comprobanteNombre || pago.comprobante_nombre || ''
      });
    });

    return Array.from(unique.values()).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  }

  function statusChangesToRows(data) {
    const changes = Array.isArray(data.cambios) ? data.cambios : [];
    return changes.map((change) => ({
      id: `estado-${change.id}`,
      sourceId: change.id,
      tipo: 'estado_cuota',
      origen: 'estado_cuota',
      fecha: change.fecha || String(change.creadoEn || '').slice(0, 10),
      anio: Number(change.anio || year),
      mes: Number(change.mes || 0),
      memberId: change.memberId || '',
      memberNombre: change.memberNombre || 'Integrante',
      descripcion: `Estado de cuota ${monthName(change.mes)} · ${change.memberNombre || 'Integrante'}`,
      monto: 0,
      observaciones: change.observacion || '',
      estadoAnterior: change.estadoAnterior || 'sin_registro',
      estadoNuevo: change.estadoNuevo || 'sin_registro',
      eliminado: Boolean(change.eliminado),
      eliminadoPor: change.eliminadoPor || '',
      eliminadoEmail: change.eliminadoEmail || '',
      eliminadoEn: change.eliminadoEn || '',
      creadoPor: change.creadoPor || '',
      actualizadoPor: change.actualizadoPor || ''
    }));
  }

  function renderCuotasAsIncome() {
    if (!document.querySelector('#tesoreria-movimientos-view.is-active')) return;
    const mergedAll = sortRows([...cache.general, ...cache.cuotas, ...cache.cuotasEliminadas, ...cache.estados]);
    renderList('movimiento', filterMovementRows(mergedAll), false);
    annotateMovementPanel(mergedAll.length, cache.cuotas.length, cache.estados.filter((item) => !item.eliminado).length);
  }

  function renderList(type, items, onlyIncome) {
    const list = document.querySelector(`[data-tesoreria-list="${type}"]`);
    if (!list) return;
    const rows = onlyIncome ? items.filter((item) => item.tipo === 'ingreso') : items;
    if (!rows.length) {
      list.innerHTML = type === 'movimiento'
        ? '<div class="tesoreria-empty"><strong>No hay movimientos para estos filtros.</strong><span>Registra un ingreso o egreso, o limpia los filtros para ver todo el libro.</span></div>'
        : '<div class="tesoreria-empty"><strong>Aún no hay actividad contable.</strong><span>Los ingresos y egresos aparecerán aquí al registrarlos.</span></div>';
      if (type === 'movimiento') setText('[data-tesoreria-results]', '0 registros');
      return;
    }
    if (type === 'movimiento') setText('[data-tesoreria-results]', `${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`);
    list.innerHTML = rows.map(rowTemplate).join('');
  }

  function rowTemplate(item) {
    const isQuota = item.origen === 'cuota';
    const isStatus = item.origen === 'estado_cuota';
    const deleted = Boolean(item.eliminado);
    if (isStatus) return statusRowTemplate(item, deleted);
    const fileUrl = item.comprobanteUrl || item.archivoUrl || '';
    const fileName = item.comprobanteNombre || item.archivoNombre || 'Comprobante';
    const comprobante = fileUrl
      ? `<a class="tesoreria-file-link" href="${escapeAttr(fileUrl)}" target="_blank" rel="noopener noreferrer">📎 ${escapeHTML(fileName)}</a>`
      : '<span class="tesoreria-no-file">Sin comprobante</span>';
    const action = isQuota
      ? deleted
        ? deletedBadge(item)
        : `<span class="tesoreria-cuota-badge">Cuota pagada</span><button type="button" class="tesoreria-delete-button" data-tesoreria-cuota-delete="${escapeAttr(item.sourceId)}">Eliminar</button>`
      : deleted
        ? deletedBadge(item)
        : `<button type="button" class="tesoreria-delete-button" data-tesoreria-delete="${escapeAttr(item.id)}">Eliminar</button>`;
    return `
      <article class="tesoreria-row ${escapeAttr(item.tipo)} ${isQuota ? 'is-cuota-income' : ''} ${deleted ? 'is-deleted' : ''}">
        <small>${formatDate(item.fecha)}</small>
        <div class="tesoreria-row-description"><span class="tesoreria-type-badge">${item.tipo === 'egreso' ? 'Egreso' : isQuota ? 'Ingreso · cuota' : 'Ingreso'}</span><strong>${escapeHTML(item.descripcion)}</strong></div>
        <em>${item.tipo === 'egreso' ? '-' : '+'}${money(item.monto)}</em>
        <div class="tesoreria-cuota-actions">${comprobante}${action}</div>
      </article>
    `;
  }

  function statusRowTemplate(item, deleted) {
    const transition = `<span class="tesoreria-status-transition"><b class="status-${escapeAttr(item.estadoAnterior)}">${escapeHTML(statusLabel(item.estadoAnterior))}</b><i aria-hidden="true">→</i><b class="status-${escapeAttr(item.estadoNuevo)}">${escapeHTML(statusLabel(item.estadoNuevo))}</b></span>`;
    const note = item.observaciones
      ? `<small class="tesoreria-status-note">${escapeHTML(item.observaciones)}</small>`
      : '<small class="tesoreria-status-note is-empty">Sin información adicional</small>';
    const actions = deleted
      ? deletedBadge(item)
      : `<button type="button" class="tesoreria-edit-button" data-tesoreria-status-edit="${escapeAttr(item.sourceId)}">Editar / agregar información</button><button type="button" class="tesoreria-delete-button" data-tesoreria-status-delete="${escapeAttr(item.sourceId)}">Eliminar</button>`;
    return `
      <article class="tesoreria-row is-status-change ${deleted ? 'is-deleted' : ''}">
        <small>${formatDate(item.fecha)}</small>
        <div class="tesoreria-row-description"><span class="tesoreria-type-badge">Cambio de estado</span><strong>${escapeHTML(item.descripcion)}</strong>${note}</div>
        <div class="tesoreria-status-value">${transition}</div>
        <div class="tesoreria-cuota-actions">${actions}</div>
      </article>`;
  }

  async function deleteQuotaIncome(sourceId, button) {
    const item = cache.cuotas.find((row) => String(row.sourceId) === String(sourceId));
    if (!item) return;
    if (!confirm(`¿Eliminar la cuota pagada "${item.descripcion}"? Quedará una marca local con el usuario que la eliminó.`)) return;

    try {
      button.disabled = true;
      const token = await getToken();
      if (!token) throw new Error('Sesión no disponible.');
       const response = await fetch('/api/cuotas-miembros?payment_id=' + encodeURIComponent(sourceId), { method: 'DELETE', headers: { authorization: 'Bearer ' + token } });
       const result = await response.json().catch(() => ({}));
       if (!response.ok) throw new Error(result.error || 'La API no pudo eliminar el pago. No se modificó el registro local.');
      const audit = await getAuditUser();
      const deleted = readDeletedQuotaRows();
      deleted[sourceId] = { ...item, eliminado: true, eliminadoPor: audit.name, eliminadoEmail: audit.email, eliminadoEn: new Date().toISOString() };
      writeDeletedQuotaRows(deleted);
      cache.cuotas = cache.cuotas.filter((row) => String(row.sourceId) !== String(sourceId));
      cache.cuotasEliminadas = Object.values(deleted).filter((row) => Number(row.anio || year) === year);
      renderCuotasAsIncome();
    } catch (error) {
      alert(error.message || 'No fue posible eliminar la cuota pagada.');
      button.disabled = false;
    }
  }

  function openStatusEditor(sourceId) {
    const item = cache.estados.find((row) => String(row.sourceId) === String(sourceId));
    if (!item || item.eliminado) return;
    closeStatusEditor();
    const modal = document.createElement('div');
    modal.className = 'tesoreria-status-modal';
    modal.dataset.tesoreriaStatusModal = 'true';
    modal.innerHTML = `
      <section class="tesoreria-status-dialog" role="dialog" aria-modal="true" aria-labelledby="tesoreria-status-dialog-title">
        <header><div><span>Cambio de estado</span><h4 id="tesoreria-status-dialog-title">${escapeHTML(item.memberNombre)}</h4><p>${escapeHTML(monthName(item.mes))} ${escapeHTML(item.anio)}</p></div><button type="button" data-tesoreria-status-close aria-label="Cerrar">×</button></header>
        <form data-tesoreria-status-form>
          <input type="hidden" name="id" value="${escapeAttr(item.sourceId)}">
          <div class="tesoreria-status-form-grid">
            <label>Fecha del cambio<input type="date" name="fecha" value="${escapeAttr(String(item.fecha || '').slice(0, 10))}" required></label>
            <label>Estado anterior<select name="estado_anterior">${statusOptions(item.estadoAnterior)}</select></label>
            <label>Estado nuevo<select name="estado_nuevo">${statusOptions(item.estadoNuevo)}</select></label>
            <label class="full">Información adicional<textarea name="observacion" rows="4" maxlength="1200" placeholder="Motivo, acuerdo, respaldo o comentario del cambio">${escapeHTML(item.observaciones || '')}</textarea></label>
          </div>
          <p class="tesoreria-status-form-message" data-tesoreria-status-form-message aria-live="polite"></p>
          <footer><button type="button" class="secondary" data-tesoreria-status-close>Cancelar</button><button type="submit">Guardar cambios</button></footer>
        </form>
      </section>`;
    document.body.appendChild(modal);
    modal.querySelector('textarea')?.focus();
  }

  function closeStatusEditor() {
    document.querySelectorAll('[data-tesoreria-status-modal]').forEach((modal) => modal.remove());
  }

  async function saveStatusChange(form) {
    const submit = form.querySelector('button[type="submit"]');
    const message = form.querySelector('[data-tesoreria-status-form-message]');
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      if (submit) submit.disabled = true;
      if (message) message.textContent = 'Guardando cambios...';
      const token = await getToken();
      if (!token) throw new Error('Sesión no disponible.');
      const response = await fetch('/api/cuotas-estados', {
        method: 'PATCH',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(data)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'No fue posible actualizar el cambio de estado.');
      const updated = statusChangesToRows({ cambios: [result.cambio] })[0];
      cache.estados = cache.estados.map((row) => String(row.sourceId) === String(updated.sourceId) ? updated : row);
      closeStatusEditor();
      renderCuotasAsIncome();
      notifyStatusRecordChanged('updated', result.cambio);
    } catch (error) {
      if (submit) submit.disabled = false;
      if (message) message.textContent = error.message || 'No fue posible guardar los cambios.';
    }
  }

  async function deleteStatusChange(sourceId, button) {
    const item = cache.estados.find((row) => String(row.sourceId) === String(sourceId));
    if (!item || item.eliminado) return;
    if (!confirm(`¿Eliminar el cambio de estado de ${item.memberNombre} para ${monthName(item.mes)}? La auditoría de eliminación se conservará.`)) return;
    try {
      button.disabled = true;
      const token = await getToken();
      if (!token) throw new Error('Sesión no disponible.');
      const response = await fetch('/api/cuotas-estados?id=' + encodeURIComponent(sourceId), { method: 'DELETE', headers: { authorization: 'Bearer ' + token } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'No fue posible eliminar el cambio de estado.');
      const updated = statusChangesToRows({ cambios: [result.cambio] })[0];
      cache.estados = cache.estados.map((row) => String(row.sourceId) === String(updated.sourceId) ? updated : row);
      renderCuotasAsIncome();
      notifyStatusRecordChanged('deleted', result.cambio);
    } catch (error) {
      alert(error.message || 'No fue posible eliminar el cambio de estado.');
      button.disabled = false;
    }
  }

  function notifyStatusRecordChanged(action, change) {
    window.dispatchEvent(new CustomEvent('nothofagus:cuotas-status-record-changed', { detail: { action, change } }));
  }

  function statusOptions(selected) {
    return ['pagado', 'pendiente', 'atrasado', 'sin_registro'].map((value) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${escapeHTML(statusLabel(value))}</option>`).join('');
  }

  function statusLabel(status) {
    return { pagado: 'Pagado', pendiente: 'Pendiente', atrasado: 'Atrasado', sin_registro: 'Sin registro' }[status] || 'Sin registro';
  }

  async function getAuditUser() {
    if (!client) return { name: 'Usuario interno', email: '' };
    const session = await client.auth.getSession();
    const user = session.data?.session?.user;
    const name = user?.user_metadata?.nombre || user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || 'Usuario interno';
    return { name, email: user?.email || '' };
  }

  function deletedBadge(item) {
    const user = item.eliminadoPor || item.eliminadoEmail || 'Usuario interno';
    const date = item.eliminadoEn ? formatDateTime(item.eliminadoEn) : 'fecha no registrada';
    return `<span class="tesoreria-deleted-badge">Eliminado por ${escapeHTML(user)} · ${escapeHTML(date)}</span>`;
  }

  function annotateMovementPanel(totalRows, cuotaRows, statusRows) {
    const result = document.querySelector('#tesoreria-movimientos-view [data-tesoreria-results]');
    if (!result) return;
    const filtered = document.querySelectorAll('#tesoreria-movimientos-view [data-tesoreria-list="movimiento"] .tesoreria-row').length;
    result.textContent = `${filtered} de ${totalRows} registros · ${cuotaRows} pagos · ${statusRows} cambios de estado`;
  }

  function filterMovementRows(items) {
    const type = document.querySelector('[data-tesoreria-filter="tipo"]')?.value || 'todos';
    const month = document.querySelector('[data-tesoreria-filter="mes"]')?.value || '';
    const search = document.querySelector('[data-tesoreria-filter="busqueda"]')?.value?.trim().toLowerCase() || '';
    const showDeleted = Boolean(document.querySelector('[data-tesoreria-filter="eliminados"]')?.checked);
    return items.filter((item) => {
      if (!showDeleted && item.eliminado) return false;
      if (type !== 'todos' && item.tipo !== type) return false;
      if (month && !String(item.fecha || '').startsWith(month)) return false;
      if (search) {
        const text = `${item.descripcion || ''} ${item.creadoPor || ''} ${item.observaciones || ''}`.toLowerCase();
        if (!text.includes(search)) return false;
      }
      return true;
    });
  }

  async function getToken() {
    if (!client) return '';
    const session = await client.auth.getSession();
    return session.data?.session?.access_token || '';
  }

  function sortRows(items) {
    return items.slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  }

  function readDeletedQuotaRows() {
    try { return JSON.parse(localStorage.getItem(DELETED_QUOTAS_KEY) || '{}') || {}; } catch { return {}; }
  }

  function writeDeletedQuotaRows(value) {
    localStorage.setItem(DELETED_QUOTAS_KEY, JSON.stringify(value || {}));
  }

  function monthName(month) {
    return ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][Number(month)] || 'mensual';
  }

  function setText(selector, value) {
    document.querySelectorAll(selector).forEach((element) => { element.textContent = value; });
  }

  function money(value) {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(String(value).slice(0, 10) + 'T12:00:00'));
  }

  function formatDateTime(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  function loadStyle() {
    const href = 'tesoreria-ingresos-cuotas.css?v=20260710-delete-buttons';
    const existing = document.querySelector('link[data-tesoreria-ingresos-cuotas]');
    if (existing) {
      existing.href = href;
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.tesoreriaIngresosCuotas = 'true';
    document.head.appendChild(link);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function escapeAttr(value) {
    return escapeHTML(value);
  }
})();
