import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusTesoreriaIngresosCuotas) return;
  window.__nothofagusTesoreriaIngresosCuotas = true;

  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  const year = new Date().getFullYear();
  let cache = { general: [], cuotas: [] };
  let loading = false;

  loadStyle();
  observeTreasury();
  queueRefresh();
  document.addEventListener('DOMContentLoaded', queueRefresh);
  window.addEventListener('hashchange', queueRefresh);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-tesoreria-open], [data-tesoreria-go]')) window.setTimeout(queueRefresh, 160);
  }, true);
  window.setTimeout(queueRefresh, 700);
  window.setTimeout(queueRefresh, 1800);

  function observeTreasury() {
    if (!document.body || document.body.dataset.ingresosCuotasObserved) return;
    document.body.dataset.ingresosCuotasObserved = 'true';
    new MutationObserver(() => queueRender()).observe(document.body, { childList: true, subtree: true });
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
    if (loading) return;
    if (!document.querySelector('#tesoreria-ingresos-view, #tesoreria-general-view')) return;
    try {
      loading = true;
      const token = await getToken();
      if (!token) return;
      const [generalResult, cuotasResult] = await Promise.allSettled([
        fetch('/api/tesoreria', { headers: { authorization: 'Bearer ' + token } }),
        fetch('/api/cuotas-miembros?anio=' + encodeURIComponent(year), { headers: { authorization: 'Bearer ' + token } })
      ]);
      const generalResponse = generalResult.status === 'fulfilled' ? generalResult.value : null;
      const cuotasResponse = cuotasResult.status === 'fulfilled' ? cuotasResult.value : null;
      const generalData = generalResponse?.ok ? await generalResponse.json().catch(() => ({})) : {};
      const cuotasData = cuotasResponse?.ok ? await cuotasResponse.json().catch(() => ({})) : {};
      cache.general = Array.isArray(generalData.movimientos) ? generalData.movimientos.filter(Boolean) : [];
      cache.cuotas = cuotaPaymentsToIncomeRows(cuotasData);
      renderCuotasAsIncome();
    } finally {
      loading = false;
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
        descripcion: type === 'anual' || month === 0 ? `Cuota anual · ${name}` : `Cuota mensual ${monthName(month)} · ${name}`,
        monto: amount,
        observaciones: pago.observacion || '',
        comprobanteUrl: pago.comprobanteUrl || '',
        comprobanteNombre: pago.comprobanteNombre || pago.comprobante_nombre || ''
      });
    });

    return Array.from(unique.values()).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  }

  function renderCuotasAsIncome() {
    if (!document.querySelector('#tesoreria-ingresos-view, #tesoreria-general-view')) return;
    const activeManual = cache.general.filter((item) => !item.eliminado);
    const baseIncome = activeManual.filter((item) => item.tipo === 'ingreso');
    const baseExpense = activeManual.filter((item) => item.tipo === 'egreso');
    const mergedIncome = sortRows([...cache.general.filter((item) => item.tipo === 'ingreso'), ...cache.cuotas]);
    const mergedGeneral = sortRows([...cache.general, ...cache.cuotas]).slice(0, 8);
    const totalIncome = [...baseIncome, ...cache.cuotas].reduce((sum, item) => sum + Number(item.monto || 0), 0);
    const totalExpense = baseExpense.reduce((sum, item) => sum + Number(item.monto || 0), 0);

    setText('[data-tesoreria-total="ingresos"]', money(totalIncome));
    setText('[data-tesoreria-total="egresos"]', money(totalExpense));
    setText('[data-tesoreria-total="saldo"]', money(totalIncome - totalExpense));
    document.querySelector('[data-tesoreria-saldo-card]')?.classList.toggle('negative', totalIncome - totalExpense < 0);

    renderList('ingreso', mergedIncome, true);
    renderList('general', mergedGeneral, false);
    annotateIncomePanel(mergedIncome.length, cache.cuotas.length);
  }

  function renderList(type, items, onlyIncome) {
    const list = document.querySelector(`[data-tesoreria-list="${type}"]`);
    if (!list) return;
    const rows = onlyIncome ? items.filter((item) => item.tipo === 'ingreso') : items;
    if (!rows.length) {
      list.innerHTML = '<p class="tesoreria-empty">No hay movimientos registrados.</p>';
      return;
    }
    list.innerHTML = rows.map(rowTemplate).join('');
  }

  function rowTemplate(item) {
    const isQuota = item.origen === 'cuota';
    const deleted = Boolean(item.eliminado);
    const comprobante = isQuota && item.comprobanteUrl ? `<a class="tesoreria-cuota-receipt" href="${escapeAttr(item.comprobanteUrl)}" target="_blank" rel="noopener">Comprobante</a>` : '';
    const action = isQuota
      ? '<span class="tesoreria-cuota-badge">Cuota pagada</span>'
      : deleted
        ? deletedBadge(item)
        : `<button type="button" class="tesoreria-delete-button" data-tesoreria-delete="${escapeAttr(item.id)}">Eliminar</button>`;
    return `
      <article class="tesoreria-row ${escapeAttr(item.tipo)} ${isQuota ? 'is-cuota-income' : ''} ${deleted ? 'is-deleted' : ''}">
        <small>${formatDate(item.fecha)}</small>
        <strong>${escapeHTML(item.descripcion)}</strong>
        <em>${item.tipo === 'egreso' ? '-' : '+'}${money(item.monto)}</em>
        <div class="tesoreria-cuota-actions">${comprobante}${action}</div>
      </article>
    `;
  }

  function deletedBadge(item) {
    const user = item.eliminadoPor || item.eliminadoEmail || 'Usuario interno';
    const date = item.eliminadoEn ? formatDateTime(item.eliminadoEn) : 'fecha no registrada';
    return `<span class="tesoreria-deleted-badge">Eliminado por ${escapeHTML(user)} · ${escapeHTML(date)}</span>`;
  }

  function annotateIncomePanel(totalRows, cuotaRows) {
    const panel = document.querySelector('#tesoreria-ingresos-view .tesoreria-list-card h4');
    if (!panel) return;
    panel.textContent = `Registro de ingresos (${totalRows} movimientos, ${cuotaRows} cuotas pagadas)`;
  }

  async function getToken() {
    if (!client) return '';
    const session = await client.auth.getSession();
    return session.data?.session?.access_token || '';
  }

  function sortRows(items) {
    return items.slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
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
    if (document.querySelector('link[data-tesoreria-ingresos-cuotas]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'tesoreria-ingresos-cuotas.css?v=20260710';
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
