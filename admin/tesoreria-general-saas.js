import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusTreasurySaasGeneral) return;
  window.__nothofagusTreasurySaasGeneral = true;

  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  const year = new Date().getFullYear();
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MATRIX_STATUS_KEY = 'nothofagus_cuotas_month_status_overrides_v1';
  const DELETED_QUOTAS_KEY = 'nothofagus_cuotas_ingresos_eliminados_v1';

  loadStyles();
  bindActions();
  scheduleRender();
  document.addEventListener('DOMContentLoaded', scheduleRender);
  window.addEventListener('hashchange', scheduleRender);
  window.addEventListener('storage', scheduleRender);
  window.addEventListener('nothofagus:cuotas-status-changed', scheduleRender);
  window.addEventListener('nothofagus:cuotas-manual-status-calculated', scheduleRender);
  document.addEventListener('nothofagus:cuotas-status-changed', scheduleRender);
  document.addEventListener('nothofagus:cuotas-manual-status-calculated', scheduleRender);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-tesoreria-open], [data-tesoreria-go], [data-saas-treasury-go], [data-status-choice], [data-tesoreria-delete], [data-tesoreria-cuota-delete]')) {
      window.setTimeout(scheduleRender, 220);
    }
  }, true);
  document.addEventListener('submit', (event) => {
    if (event.target.closest?.('[data-tesoreria-form], [data-cuotas-cell-comprobante-form], [data-cuotas-comprobante-form]')) {
      window.setTimeout(scheduleRender, 650);
      window.setTimeout(scheduleRender, 1400);
    }
  }, true);
  window.setTimeout(scheduleRender, 600);
  window.setTimeout(scheduleRender, 1500);

  function scheduleRender() {
    window.clearTimeout(scheduleRender.timer);
    scheduleRender.timer = window.setTimeout(render, 120);
  }

  async function render() {
    const panel = document.querySelector('#tesoreria-general-view .tesoreria-panel');
    if (!panel) return;

    const hasDashboard = panel.querySelector('.treasury-saas-dashboard');
    if (!hasDashboard) {
      panel.innerHTML = '<section class="treasury-saas-dashboard"><div class="treasury-saas-panel"><p class="treasury-saas-empty">Cargando dashboard financiero integrado...</p></div></section>';
    }

    try {
      const data = await getData();
      panel.innerHTML = template(data);
    } catch (error) {
      panel.innerHTML = '<section class="treasury-saas-dashboard"><div class="treasury-saas-panel"><h4>Tesorería general</h4><p class="treasury-saas-empty">' + esc(error.message || 'No fue posible cargar el dashboard financiero.') + '</p></div></section>';
    }
  }

  async function getData() {
    if (!client) throw new Error('Supabase no está configurado.');
    const session = await client.auth.getSession();
    const token = session.data?.session?.access_token;
    if (!token) throw new Error('Sesión no disponible para Tesorería.');

    const [generalResult, cuotasResult] = await Promise.allSettled([
      fetch('/api/tesoreria', { headers: { authorization: 'Bearer ' + token } }),
      fetch('/api/cuotas-miembros?anio=' + encodeURIComponent(year), { headers: { authorization: 'Bearer ' + token } })
    ]);

    const generalResponse = generalResult.status === 'fulfilled' ? generalResult.value : null;
    const cuotasResponse = cuotasResult.status === 'fulfilled' ? cuotasResult.value : null;
    const generalData = generalResponse?.ok ? await generalResponse.json().catch(() => ({})) : {};
    const cuotasData = cuotasResponse?.ok ? await cuotasResponse.json().catch(() => ({})) : {};
    if (!generalResponse?.ok && !cuotasResponse?.ok) throw new Error('Tesorería no disponible para este usuario o sesión.');

    const allMovements = Array.isArray(generalData.movimientos) ? generalData.movimientos.filter(Boolean) : [];
    const manualActive = allMovements.filter((item) => getYear(item.fecha) === year && !item.eliminado).map((item) => normalizeManualMovement(item, false));
    const manualDeleted = allMovements.filter((item) => getYear(item.fecha) === year && item.eliminado).map((item) => normalizeManualMovement(item, true));

    const deletedQuotaMap = readJson(DELETED_QUOTAS_KEY, {});
    const quotaRowsAll = buildQuotaPaymentRows(cuotasData);
    const activeQuotaRows = quotaRowsAll.filter((row) => !deletedQuotaMap[row.sourceId]);
    const deletedQuotaRows = Object.values(deletedQuotaMap).filter((row) => row && getYear(row.fecha) === year).map((row) => ({ ...row, eliminado: true, source: 'Cuota eliminada', sourceKind: 'cuota' }));
    const realPaymentKeys = new Set(activeQuotaRows.map((row) => row.paymentKey));
    const matrixRows = buildMatrixRows(cuotasData, realPaymentKeys, deletedQuotaMap);

    const ledger = sortRows([...manualActive, ...manualDeleted, ...activeQuotaRows, ...deletedQuotaRows, ...matrixRows]);
    const activeLedger = ledger.filter((row) => !row.eliminado);
    const totalIncome = activeLedger.filter((row) => row.tipo === 'ingreso').reduce((sum, row) => sum + Number(row.monto || 0), 0);
    const totalExpense = activeLedger.filter((row) => row.tipo === 'egreso').reduce((sum, row) => sum + Number(row.monto || 0), 0);
    const balance = totalIncome - totalExpense;
    const incomeManual = activeLedger.filter((row) => row.tipo === 'ingreso' && row.sourceKind === 'manual').reduce((sum, row) => sum + Number(row.monto || 0), 0);
    const expensesManual = activeLedger.filter((row) => row.tipo === 'egreso').reduce((sum, row) => sum + Number(row.monto || 0), 0);
    const cuotasPaid = activeLedger.filter((row) => row.tipo === 'ingreso' && row.sourceKind === 'cuota').reduce((sum, row) => sum + Number(row.monto || 0), 0);
    const matrixPaid = activeLedger.filter((row) => row.tipo === 'ingreso' && row.sourceKind === 'matriz').reduce((sum, row) => sum + Number(row.monto || 0), 0);
    const members = Number((cuotasData.resumen || {}).totalMiembros || (cuotasData.resumen || {}).miembros || 0);
    const cuotasPending = getPendingAmount(cuotasData, matrixRows, activeQuotaRows);
    const monthly = monthlySeries(activeLedger);
    const currentIndex = new Date().getMonth();
    const avgExpense = expensesManual / Math.max(currentIndex + 1, 1);
    const coverage = avgExpense > 0 ? Math.floor(Math.max(balance, 0) / avgExpense) : 0;
    const recovery = cuotasPaid + matrixPaid + cuotasPending > 0 ? Math.round(((cuotasPaid + matrixPaid) / (cuotasPaid + matrixPaid + cuotasPending)) * 100) : 0;

    return {
      ledger,
      recent: ledger.slice(0, 8),
      incomeManual,
      expensesManual,
      cuotasPaid,
      matrixPaid,
      cuotasPending,
      members,
      totalIncome,
      balance,
      monthly,
      currentIncome: monthly[currentIndex].income,
      currentExpense: monthly[currentIndex].expense,
      avgExpense,
      coverage,
      recovery,
      counts: {
        ingresos: activeLedger.filter((row) => row.tipo === 'ingreso').length,
        egresos: activeLedger.filter((row) => row.tipo === 'egreso').length,
        cuotas: activeQuotaRows.length,
        matriz: matrixRows.length,
        eliminados: ledger.filter((row) => row.eliminado).length
      }
    };
  }

  function normalizeManualMovement(item, deleted) {
    return {
      ...item,
      id: item.id || '',
      tipo: item.tipo || 'ingreso',
      fecha: item.fecha || '',
      descripcion: item.descripcion || 'Movimiento',
      monto: Number(item.monto || 0),
      eliminado: Boolean(deleted),
      source: item.tipo === 'egreso' ? 'Egreso manual' : 'Ingreso manual',
      sourceKind: 'manual'
    };
  }

  function buildQuotaPaymentRows(data) {
    const historic = Array.isArray(data.pagosHistoricos) ? data.pagosHistoricos : [];
    const fromMembers = Array.isArray(data.miembros) ? data.miembros.flatMap((member) => {
      const pagos = Array.isArray(member.pagos) ? member.pagos : [];
      return pagos.map((pago) => ({ ...pago, miembroNombre: member.nombre || '', memberId: pago.memberId || pago.member_id || member.id }));
    }) : [];
    const source = historic.length ? historic : fromMembers;
    const unique = new Map();

    source.forEach((pago) => {
      const amount = Number(pago.monto || 0);
      if (!amount || amount <= 0) return;
      const paymentYear = Number(pago.anio || year);
      if (paymentYear !== year) return;
      const type = String(pago.tipoPago || pago.tipo_pago || 'mensual').toLowerCase();
      const month = type === 'anual' ? 0 : Number(pago.mes || 0);
      const memberId = String(pago.memberId || pago.member_id || '');
      const id = String(pago.id || [memberId, paymentYear, month, amount, pago.fechaPago || pago.fecha_pago || ''].join(':'));
      if (unique.has(id)) return;
      const name = pago.miembroNombre || pago.nombre || 'Integrante';
      unique.set(id, {
        id: `cuota-${id}`,
        sourceId: id,
        paymentKey: `${memberId}:${paymentYear}:${month}`,
        memberId,
        tipo: 'ingreso',
        source: 'Cuota registrada',
        sourceKind: 'cuota',
        fecha: pago.fechaPago || pago.fecha_pago || `${paymentYear}-${String(Math.max(month, 1)).padStart(2, '0')}-01`,
        anio: paymentYear,
        descripcion: type === 'anual' || month === 0 ? `Cuota anual · ${name}` : `Cuota mensual ${monthName(month)} · ${name}`,
        monto: amount,
        comprobanteUrl: pago.comprobanteUrl || '',
        comprobanteNombre: pago.comprobanteNombre || pago.comprobante_nombre || ''
      });
    });

    return Array.from(unique.values());
  }

  function buildMatrixRows(cuotasData, realPaymentKeys, deletedQuotaMap) {
    const overrides = readJson(MATRIX_STATUS_KEY, {});
    const members = Array.isArray(cuotasData.miembros) ? cuotasData.miembros : [];
    const byId = new Map(members.map((member) => [String(member.id), member]));
    const rows = [];

    Object.entries(overrides).forEach(([key, status]) => {
      const [memberId, itemYear, monthRaw] = String(key).split(':');
      const itemMonth = Number(monthRaw || 0);
      if (Number(itemYear) !== year || status !== 'pagado' || !itemMonth) return;
      if (realPaymentKeys.has(`${memberId}:${year}:${itemMonth}`)) return;
      const member = byId.get(String(memberId));
      if (!member || String(member.estadoCuenta || member.estado_cuenta || '').toLowerCase() === 'inactivo') return;
      const amount = Number(member.cuotaMensual || member.cuota_mensual || 0);
      if (!amount || amount <= 0) return;
      const sourceId = `matriz:${memberId}:${year}:${itemMonth}`;
      if (deletedQuotaMap[sourceId]) return;
      rows.push({
        id: sourceId,
        sourceId,
        paymentKey: `${memberId}:${year}:${itemMonth}`,
        memberId,
        tipo: 'ingreso',
        source: 'Matriz mensual',
        sourceKind: 'matriz',
        fecha: `${year}-${String(itemMonth).padStart(2, '0')}-01`,
        anio: year,
        descripcion: `Matriz: cuota ${monthName(itemMonth)} · ${member.nombre || 'Integrante'}`,
        monto: amount,
        provisional: true
      });
    });

    return rows;
  }

  function getPendingAmount(cuotasData, matrixRows, activeQuotaRows) {
    const overrides = readJson(MATRIX_STATUS_KEY, {});
    const hasOverrides = Object.keys(overrides).some((key) => String(key).split(':')[1] === String(year));
    if (!hasOverrides) return Number((cuotasData.resumen || {}).saldoPendiente || 0);

    const paidKeys = new Set([...activeQuotaRows.map((row) => row.paymentKey), ...matrixRows.map((row) => row.paymentKey)]);
    const members = Array.isArray(cuotasData.miembros) ? cuotasData.miembros : [];
    return members.reduce((sum, member) => {
      if (String(member.estadoCuenta || '').toLowerCase() === 'inactivo' || member.exento) return sum;
      const amount = Number(member.cuotaMensual || 0);
      for (let month = 1; month <= 12; month += 1) {
        const status = overrides[`${member.id}:${year}:${month}`];
        const expected = status === 'sin_registro' ? 0 : amount;
        const paid = paidKeys.has(`${member.id}:${year}:${month}`) ? amount : 0;
        sum += Math.max(expected - paid, 0);
      }
      return sum;
    }, 0);
  }

  function monthlySeries(rows) {
    const series = Array.from({ length: 12 }, (_, index) => ({ label: months[index], income: 0, expense: 0 }));
    rows.forEach((row) => {
      const idx = getMonth(row.fecha);
      if (idx < 0 || idx > 11) return;
      if (String(row.tipo || '').toLowerCase() === 'egreso') series[idx].expense += Number(row.monto || 0);
      else series[idx].income += Number(row.monto || 0);
    });
    return series;
  }

  function template(data) {
    return '<section class="treasury-saas-dashboard">' +
      '<header class="treasury-saas-hero"><div><p class="treasury-saas-kicker">Tesorería centralizada</p><h3>Tesorería general</h3><p>Panel general conectado: ingresos manuales, egresos, cuotas registradas y cambios de la matriz mensual pasan por esta vista.</p><div class="treasury-saas-hero-actions"><button type="button" data-saas-treasury-go="ingresos">Registrar ingreso</button><button type="button" class="secondary" data-saas-treasury-go="egresos">Registrar egreso</button><button type="button" class="secondary" data-saas-treasury-go="cuotas">Matriz de pagos</button></div></div><aside class="treasury-saas-balance"><span>Saldo disponible</span><strong>' + money(data.balance) + '</strong><small>Ingresos manuales + cuotas registradas + matriz pagada - egresos.</small></aside></header>' +
      '<div class="treasury-saas-kpi-grid">' + card('Ingresos integrados', money(data.totalIncome), `Manual ${money(data.incomeManual)} · cuotas ${money(data.cuotasPaid)} · matriz ${money(data.matrixPaid)}`) + card('Egresos', money(data.expensesManual), 'Egresos manuales activos') + card('Cuotas pendientes', money(data.cuotasPending), data.recovery + '% de recuperación estimada') + card('Registros conectados', String(data.counts.ingresos + data.counts.egresos), `${data.counts.cuotas} cuotas · ${data.counts.matriz} matriz · ${data.counts.eliminados} eliminados`) + '</div>' +
      '<div class="treasury-saas-grid"><section class="treasury-saas-panel"><div class="treasury-saas-chart-title"><h4>Flujo mensual integrado</h4><span>' + year + '</span></div><div class="treasury-saas-chart">' + bars(data.monthly) + '</div></section><aside class="treasury-saas-side"><section class="treasury-saas-panel"><div class="treasury-saas-chart-title"><h4>Salud financiera</h4><span>General</span></div><div class="treasury-saas-health">' + health('Ingreso del mes', money(data.currentIncome), 'Manual + cuotas + matriz') + health('Egreso del mes', money(data.currentExpense), 'Salidas registradas') + health('Cobertura estimada', data.coverage > 0 ? data.coverage + ' meses' : 'Sin egreso promedio', 'Saldo / egreso promedio') + health('Recuperación cuotas', data.recovery + '%', 'Cuotas reales y matriz pagada') + '</div></section><section class="treasury-saas-panel"><div class="treasury-saas-chart-title"><h4>Acciones rápidas</h4><span>Operación</span></div><div class="treasury-saas-quick"><button type="button" data-saas-treasury-go="ingresos">Ingreso</button><button type="button" class="secondary" data-saas-treasury-go="egresos">Egreso</button><button type="button" class="secondary" data-saas-treasury-go="cuotas">Matriz</button></div></section></aside></div>' +
      '<section class="treasury-saas-panel treasury-saas-ledger-panel"><div class="treasury-saas-chart-title"><h4>Registro integrado</h4><span>' + data.ledger.length + ' movimientos</span></div><div class="treasury-saas-recent treasury-saas-ledger">' + recent(data.recent) + '</div></section>' +
      '</section>';
  }

  function card(label, value, note) { return '<article class="treasury-saas-card"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(note) + '</small></article>'; }
  function health(label, value, note) { return '<article><div><strong>' + esc(label) + '</strong><span>' + esc(note) + '</span></div><em>' + esc(value) + '</em></article>'; }

  function bars(series) {
    const max = Math.max(...series.flatMap((item) => [item.income, item.expense]), 1);
    return series.map((item) => '<div class="treasury-saas-bar-row"><span>' + item.label + '</span><div class="treasury-saas-bar-track"><i class="treasury-saas-bar-income" style="width:' + Math.round((item.income / max) * 100) + '%"></i><i class="treasury-saas-bar-expense" style="width:' + Math.round((item.expense / max) * 100) + '%"></i></div><strong>' + money(item.income - item.expense) + '</strong></div>').join('');
  }

  function recent(items) {
    if (!items.length) return '<p class="treasury-saas-empty">No hay movimientos registrados.</p>';
    return items.map((item) => '<article class="' + attr(item.tipo || '') + ' source-' + attr(item.sourceKind || '') + (item.eliminado ? ' is-deleted' : '') + '"><div><strong>' + esc(item.descripcion || 'Movimiento') + '</strong><span><b class="treasury-source-badge">' + esc(item.source || 'General') + '</b> ' + date(item.fecha) + (item.provisional ? ' · matriz manual' : '') + (item.eliminado ? ' · eliminado por ' + esc(item.eliminadoPor || item.eliminadoEmail || 'Usuario interno') : '') + '</span></div><em>' + (item.tipo === 'egreso' ? '-' : '+') + money(item.monto) + '</em></article>').join('');
  }

  function bindActions() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-saas-treasury-go]');
      if (!button) return;
      event.preventDefault();
      document.querySelector('[data-tesoreria-open="' + button.dataset.saasTreasuryGo + '"]')?.click();
    });
  }

  function sortRows(items) {
    return items.slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || String(b.id || '').localeCompare(String(a.id || '')));
  }

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) || fallback; } catch { return fallback; }
  }

  function loadStyles() {
    const href = 'tesoreria-general-saas.css?v=20260710-central';
    const existing = document.querySelector('link[data-treasury-saas-general]');
    if (existing) {
      existing.href = href;
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.treasurySaasGeneral = 'true';
    document.head.appendChild(link);
  }

  function sum(items, type) { return items.filter((item) => String(item.tipo || '').toLowerCase() === type).reduce((total, item) => total + Number(item.monto || 0), 0); }
  function getYear(value) { return Number(String(value || '').slice(0, 4)) || 0; }
  function getMonth(value) { return Number(String(value || '').slice(5, 7)) - 1; }
  function monthName(month) { return monthNames[Number(month)] || 'mensual'; }
  function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
  function date(value) { return value ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(String(value).slice(0, 10) + 'T12:00:00')) : 'Sin fecha'; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }
  function attr(value) { return esc(value).replace(/\s+/g, '-').toLowerCase(); }
})();
