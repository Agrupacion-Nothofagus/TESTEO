import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';
import { buildMonthlySeries, buildQuotaMetrics, summarizeLedger } from './tesoreria-calculos.js?v=20260921-integral-1';

(() => {
  if (window.__nothofagusTreasurySaasGeneral) return;
  window.__nothofagusTreasurySaasGeneral = true;

  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MATRIX_STATUS_KEY = 'nothofagus_cuotas_month_status_overrides_v1';
  const DELETED_QUOTAS_KEY = 'nothofagus_cuotas_ingresos_eliminados_v1';
  const state = { year: new Date().getFullYear(), loading: false, pending: false, sequence: 0 };

  loadStyles();
  bindActions();
  document.addEventListener('DOMContentLoaded', scheduleIfVisible);
  window.addEventListener('hashchange', scheduleIfVisible);
  window.addEventListener('nothofagus:cuotas-status-changed', scheduleIfVisible);
  window.addEventListener('nothofagus:cuotas-payment-changed', scheduleIfVisible);
  window.addEventListener('nothofagus:tesoreria-updated', scheduleIfVisible);
  window.addEventListener('storage', (event) => {
    if ([MATRIX_STATUS_KEY, DELETED_QUOTAS_KEY].includes(event.key)) scheduleIfVisible();
  });

  function scheduleIfVisible(delay = 120) {
    if (!document.querySelector('#tesoreria-general-view.is-active')) return;
    scheduleRender(delay);
  }

  function scheduleRender(delay = 120) {
    window.clearTimeout(scheduleRender.timer);
    scheduleRender.timer = window.setTimeout(render, delay);
  }

  async function render() {
    const panel = document.querySelector('#tesoreria-general-view.is-active .tesoreria-panel');
    if (!panel) return;
    if (state.loading) {
      state.pending = true;
      return;
    }

    const requestId = ++state.sequence;
    state.loading = true;
    if (!panel.querySelector('.treasury-saas-dashboard')) {
      panel.innerHTML = '<section class="treasury-saas-dashboard"><div class="treasury-saas-panel"><p class="treasury-saas-empty">Calculando el resumen financiero...</p></div></section>';
    }

    try {
      const data = await getData(state.year);
      if (requestId === state.sequence) panel.innerHTML = template(data);
    } catch (error) {
      panel.innerHTML = '<section class="treasury-saas-dashboard"><div class="treasury-saas-panel"><h4>Tesorería general</h4><p class="treasury-saas-empty">' + esc(error.message || 'No fue posible cargar el resumen financiero.') + '</p><button type="button" data-treasury-refresh>Reintentar</button></div></section>';
    } finally {
      state.loading = false;
      if (state.pending) {
        state.pending = false;
        scheduleRender(80);
      }
    }
  }

  async function getData(year) {
    if (!client) throw new Error('Supabase no está configurado.');
    const session = await client.auth.getSession();
    const token = session.data?.session?.access_token;
    if (!token) throw new Error('Sesión no disponible para Tesorería.');
    const options = { cache: 'no-store', headers: { authorization: 'Bearer ' + token } };
    const [generalResult, quotasResult] = await Promise.allSettled([
      fetch('/api/tesoreria', options),
      fetch('/api/cuotas-miembros?anio=' + encodeURIComponent(year), options)
    ]);

    const generalResponse = generalResult.status === 'fulfilled' ? generalResult.value : null;
    const quotasResponse = quotasResult.status === 'fulfilled' ? quotasResult.value : null;
    const generalData = generalResponse?.ok ? await generalResponse.json().catch(() => ({})) : {};
    const quotasData = quotasResponse?.ok ? await quotasResponse.json().catch(() => ({})) : {};
    if (!generalResponse?.ok && !quotasResponse?.ok) throw new Error('No fue posible consultar movimientos ni cuotas.');

    const warnings = [];
    if (!generalResponse?.ok) warnings.push('Los movimientos manuales no respondieron y no se incluyen temporalmente.');
    if (!quotasResponse?.ok) warnings.push('Las cuotas no respondieron y no se incluyen temporalmente.');

    const allMovements = Array.isArray(generalData.movimientos) ? generalData.movimientos.filter(Boolean) : [];
    const manualActive = allMovements.filter((item) => getYear(item.fecha) === year && !item.eliminado).map((item) => normalizeManualMovement(item, false));
    const manualDeleted = allMovements.filter((item) => getYear(item.fecha) === year && item.eliminado).map((item) => normalizeManualMovement(item, true));
    const deletedQuotaMap = readJson(DELETED_QUOTAS_KEY, {});
    const quotaRowsAll = buildQuotaPaymentRows(quotasData, year);
    const activeQuotaRows = quotaRowsAll.filter((row) => !deletedQuotaMap[row.sourceId]);
    const deletedQuotaRows = Object.values(deletedQuotaMap)
      .filter((row) => row && Number(row.anio || getYear(row.fecha)) === year)
      .map((row) => ({ ...row, eliminado: true, source: 'Cuota eliminada', sourceKind: 'cuota' }));
    const realPaymentKeys = new Set(activeQuotaRows.map((row) => row.paymentKey));
    const provisionalRows = buildProvisionalRows(quotasData, realPaymentKeys, deletedQuotaMap, year);
    if (provisionalRows.length) warnings.push(`${provisionalRows.length} ${provisionalRows.length === 1 ? 'marca visual está pendiente' : 'marcas visuales están pendientes'} de convertirse en pagos reales.`);

    const ledger = sortRows([...manualActive, ...manualDeleted, ...activeQuotaRows, ...deletedQuotaRows]);
    const totals = summarizeLedger(ledger);
    const incomeManual = manualActive.filter((row) => row.tipo === 'ingreso').reduce((sum, row) => sum + Number(row.monto || 0), 0);
    const quotasPaid = activeQuotaRows.reduce((sum, row) => sum + Number(row.monto || 0), 0);
    const quotaMetrics = buildQuotaMetrics(Array.isArray(quotasData.miembros) ? quotasData.miembros : [], quotasPaid, year);
    const monthly = buildMonthlySeries(ledger, months);
    const focusMonth = year === new Date().getFullYear() ? new Date().getMonth() : 11;

    return {
      year,
      ledger,
      recent: ledger.slice(0, 12),
      incomeManual,
      quotasPaid,
      quotaMetrics,
      totalIncome: totals.income,
      totalExpense: totals.expense,
      balance: totals.balance,
      monthly,
      currentIncome: monthly[focusMonth].income,
      currentExpense: monthly[focusMonth].expense,
      focusMonth: monthNames[focusMonth + 1],
      reconciliation: totals.income - incomeManual - quotasPaid,
      warnings,
      counts: { manual: manualActive.length, quotas: activeQuotaRows.length, deleted: ledger.filter((row) => row.eliminado).length },
      updatedAt: new Date()
    };
  }

  function normalizeManualMovement(item, deleted) {
    return {
      ...item,
      id: item.id || '',
      tipo: item.tipo === 'egreso' ? 'egreso' : 'ingreso',
      fecha: item.fecha || '',
      descripcion: item.descripcion || 'Movimiento',
      monto: Number(item.monto || 0),
      eliminado: Boolean(deleted),
      source: item.tipo === 'egreso' ? 'Egreso manual' : 'Ingreso manual',
      sourceKind: 'manual'
    };
  }

  function buildQuotaPaymentRows(data, year) {
    const historic = Array.isArray(data.pagosHistoricos) ? data.pagosHistoricos : [];
    const fromMembers = Array.isArray(data.miembros) ? data.miembros.flatMap((member) => {
      const payments = Array.isArray(member.pagos) ? member.pagos : [];
      return payments.map((payment) => ({ ...payment, miembroNombre: member.nombre || '', memberId: payment.memberId || payment.member_id || member.id }));
    }) : [];
    const source = historic.length ? historic : fromMembers;
    const unique = new Map();

    source.forEach((payment) => {
      const paymentYear = Number(payment.anio || year);
      const paymentAmount = Number(payment.monto || 0);
      if (paymentYear !== year || paymentAmount <= 0) return;
      const type = String(payment.tipoPago || payment.tipo_pago || 'mensual').toLowerCase();
      const month = type === 'anual' ? 0 : Number(payment.mes || 0);
      const memberId = String(payment.memberId || payment.member_id || '');
      const id = String(payment.id || [memberId, paymentYear, month, paymentAmount, payment.fechaPago || payment.fecha_pago || ''].join(':'));
      if (unique.has(id)) return;
      const name = payment.miembroNombre || payment.nombre || 'Integrante';
      unique.set(id, {
        id: `cuota-${id}`,
        sourceId: id,
        paymentKey: `${memberId}:${paymentYear}:${month}`,
        memberId,
        tipo: 'ingreso',
        source: 'Cuota registrada',
        sourceKind: 'cuota',
        fecha: payment.fechaPago || payment.fecha_pago || `${paymentYear}-${String(Math.max(month, 1)).padStart(2, '0')}-01`,
        anio: paymentYear,
        descripcion: type === 'anual' || month === 0 ? `Cuota anual · ${name}` : `Cuota mensual ${monthName(month)} · ${name}`,
        monto: paymentAmount,
        comprobanteUrl: payment.comprobanteUrl || '',
        comprobanteNombre: payment.comprobanteNombre || payment.comprobante_nombre || ''
      });
    });

    return Array.from(unique.values());
  }

  function buildProvisionalRows(data, realPaymentKeys, deletedQuotaMap, year) {
    const overrides = readJson(MATRIX_STATUS_KEY, {});
    const members = Array.isArray(data.miembros) ? data.miembros : [];
    const byId = new Map(members.map((member) => [String(member.id), member]));
    return Object.entries(overrides).flatMap(([key, status]) => {
      const [memberId, itemYear, monthRaw] = String(key).split(':');
      const month = Number(monthRaw || 0);
      if (Number(itemYear) !== year || status !== 'pagado' || !month) return [];
      if (realPaymentKeys.has(`${memberId}:${year}:${month}`)) return [];
      const member = byId.get(memberId);
      if (!member || String(member.estadoCuenta || '').toLowerCase() === 'inactivo') return [];
      const sourceId = `matriz:${memberId}:${year}:${month}`;
      if (deletedQuotaMap[sourceId]) return [];
      return [{ sourceId, memberId, month, memberName: member.nombre || 'Integrante', amount: Number(member.cuotaMensual || 0) }];
    });
  }

  function template(data) {
    const metrics = data.quotaMetrics;
    const activeRecords = data.counts.manual + data.counts.quotas;
    return `<section class="treasury-saas-dashboard">
      <header class="treasury-saas-hero">
        <div>
          <p class="treasury-saas-kicker">Tesorería centralizada</p>
          <h3>Resumen financiero</h3>
          <p>Un solo balance con movimientos manuales y pagos reales de cuotas. Los eliminados y las marcas visuales quedan fuera de los totales.</p>
          <div class="treasury-saas-hero-actions"><button type="button" data-saas-treasury-go="ingresos">Registrar ingreso</button><button type="button" class="secondary" data-saas-treasury-go="egresos">Registrar egreso</button><button type="button" class="secondary" data-saas-treasury-go="cuotas">Registro de pagos</button></div>
        </div>
        <aside class="treasury-saas-snapshot">
          <div class="treasury-saas-toolbar"><label>Año<select data-treasury-year>${yearOptions(data.year)}</select></label><button type="button" data-treasury-refresh>↻ Actualizar</button></div>
          <div class="treasury-saas-balance ${data.balance < 0 ? 'is-negative' : ''}"><span>Saldo disponible</span><strong>${money(data.balance)}</strong><small>${money(data.totalIncome)} ingresos − ${money(data.totalExpense)} egresos</small></div>
        </aside>
      </header>
      ${warningTemplate(data.warnings)}
      <div class="treasury-saas-kpi-grid">
        ${card('Ingresos totales', money(data.totalIncome), `${money(data.incomeManual)} manuales + ${money(data.quotasPaid)} cuotas`)}
        ${card('Egresos totales', money(data.totalExpense), 'Sólo egresos activos del período')}
        ${card('Cuotas recaudadas', money(data.quotasPaid), `${data.counts.quotas} pagos reales · ${metrics.recoveryToDate}% de lo vencido`)}
        ${card('Pendiente anual', money(metrics.annualPending), `Esperado anual ${money(metrics.annualExpected)}`)}
      </div>
      <section class="treasury-saas-panel treasury-reconciliation ${Math.abs(data.reconciliation) < 0.01 ? 'is-balanced' : 'has-difference'}">
        <div><span>Conciliación</span><strong>${Math.abs(data.reconciliation) < 0.01 ? 'Totales cuadrados' : 'Revisar diferencia'}</strong></div>
        <div class="treasury-equation"><b>${money(data.incomeManual)}</b><small>Ingresos manuales</small><i>+</i><b>${money(data.quotasPaid)}</b><small>Cuotas reales</small><i>=</i><b>${money(data.totalIncome)}</b><small>Ingresos totales</small></div>
      </section>
      <div class="treasury-saas-grid">
        <section class="treasury-saas-panel"><div class="treasury-saas-chart-title"><div><h4>Flujo mensual de caja</h4><p>Fecha efectiva de cada ingreso y egreso</p></div><span>${data.year}</span></div><div class="treasury-chart-legend"><span><i class="income"></i>Ingresos</span><span><i class="expense"></i>Egresos</span></div><div class="treasury-saas-chart">${bars(data.monthly)}</div></section>
        <aside class="treasury-saas-side">
          <section class="treasury-saas-panel"><div class="treasury-saas-chart-title"><h4>Estado de cuotas</h4><span>${metrics.activeMembers} activos</span></div><div class="treasury-saas-health">${health('Esperado mensual', money(metrics.monthlyExpected), `${metrics.chargeableMembers} integrantes cobrables`)}${health('Esperado a la fecha', money(metrics.expectedToDate), `Enero a ${data.focusMonth}`)}${health('Vencido pendiente', money(metrics.overdueToDate), 'Esperado a la fecha − recaudado')}${health('Cumplimiento', metrics.recoveryToDate + '%', `${money(metrics.collected)} recaudados`)}</div><div class="treasury-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${metrics.recoveryToDate}"><span style="width:${metrics.recoveryToDate}%"></span></div></section>
          <section class="treasury-saas-panel treasury-period-card"><div class="treasury-saas-chart-title"><h4>${data.focusMonth}</h4><span>Caja del mes</span></div><div class="treasury-period-values"><div><span>Ingresos</span><strong>${money(data.currentIncome)}</strong></div><div><span>Egresos</span><strong>${money(data.currentExpense)}</strong></div></div></section>
        </aside>
      </div>
      <section class="treasury-saas-panel treasury-saas-ledger-panel"><div class="treasury-saas-chart-title"><div><h4>Registro integrado</h4><p>Cuotas y movimientos ordenados por fecha</p></div><span>${activeRecords} activos · ${data.counts.deleted} eliminados</span></div><div class="treasury-saas-recent treasury-saas-ledger">${recent(data.recent)}</div></section>
      <footer class="treasury-updated">Actualizado ${dateTime(data.updatedAt)} · Los totales usan exclusivamente registros guardados.</footer>
    </section>`;
  }

  function bindActions() {
    document.addEventListener('click', (event) => {
      const open = event.target.closest?.('[data-tesoreria-open="general"]');
      if (open) return void window.setTimeout(() => scheduleRender(0), 50);
      const refresh = event.target.closest?.('[data-treasury-refresh]');
      if (refresh) {
        event.preventDefault();
        scheduleRender(0);
        return;
      }
      const button = event.target.closest?.('[data-saas-treasury-go]');
      if (!button) return;
      event.preventDefault();
      const destination = button.dataset.saasTreasuryGo;
      if (destination === 'ingresos' || destination === 'egresos') {
        document.querySelector('[data-tesoreria-open="movimientos"]')?.click();
        const type = destination === 'ingresos' ? 'ingreso' : 'egreso';
        const formType = document.querySelector('#tesoreria-movimientos-view select[name="tipo"]');
        const filterType = document.querySelector('#tesoreria-movimientos-view [data-tesoreria-filter="tipo"]');
        if (formType) formType.value = type;
        if (filterType) {
          filterType.value = type;
          filterType.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return;
      }
      document.querySelector('[data-tesoreria-open="' + destination + '"]')?.click();
    }, true);

    document.addEventListener('change', (event) => {
      const select = event.target.closest?.('[data-treasury-year]');
      if (!select) return;
      const year = Number(select.value);
      if (!Number.isInteger(year)) return;
      state.year = year;
      window.dispatchEvent(new CustomEvent('nothofagus:treasury-year-changed', { detail: { year } }));
      scheduleRender(0);
    }, true);
  }

  function warningTemplate(warnings) {
    if (!warnings.length) return '';
    return `<aside class="treasury-warning" role="status"><strong>Revisión requerida</strong><ul>${warnings.map((warning) => `<li>${esc(warning)}</li>`).join('')}</ul></aside>`;
  }

  function card(label, value, note) { return `<article class="treasury-saas-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`; }
  function health(label, value, note) { return `<article><div><strong>${esc(label)}</strong><span>${esc(note)}</span></div><em>${esc(value)}</em></article>`; }

  function bars(series) {
    const max = Math.max(...series.flatMap((item) => [item.income, item.expense]), 1);
    return series.map((item) => `<div class="treasury-saas-bar-row"><span>${item.label}</span><div class="treasury-saas-bar-track"><i class="treasury-saas-bar-income" style="width:${Math.round((item.income / max) * 100)}%"></i><i class="treasury-saas-bar-expense" style="width:${Math.round((item.expense / max) * 100)}%"></i></div><strong>${money(item.income - item.expense)}</strong></div>`).join('');
  }

  function recent(items) {
    if (!items.length) return '<p class="treasury-saas-empty">No hay movimientos registrados para este año.</p>';
    return items.map((item) => `<article class="${attr(item.tipo || '')} source-${attr(item.sourceKind || '')}${item.eliminado ? ' is-deleted' : ''}"><div><strong>${esc(item.descripcion || 'Movimiento')}</strong><span><b class="treasury-source-badge">${esc(item.source || 'General')}</b>${date(item.fecha)}${item.eliminado ? ' · eliminado por ' + esc(item.eliminadoPor || item.eliminadoEmail || 'Usuario interno') : ''}</span></div><em>${item.tipo === 'egreso' ? '-' : '+'}${money(item.monto)}</em></article>`).join('');
  }

  function yearOptions(selected) {
    const current = new Date().getFullYear();
    return Array.from(new Set([selected, current - 2, current - 1, current, current + 1])).sort((a, b) => b - a).map((year) => `<option value="${year}" ${year === selected ? 'selected' : ''}>${year}</option>`).join('');
  }

  function sortRows(items) { return items.slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || String(b.id || '').localeCompare(String(a.id || ''))); }
  function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)) || fallback; } catch { return fallback; } }

  function loadStyles() {
    const href = 'tesoreria-general-saas.css?v=20260921-integral-1';
    const existing = document.querySelector('link[data-treasury-saas-general]');
    if (existing) return void (existing.href = href);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.treasurySaasGeneral = 'true';
    document.head.appendChild(link);
  }

  function getYear(value) { return Number(String(value || '').slice(0, 4)) || 0; }
  function monthName(month) { return monthNames[Number(month)] || 'mensual'; }
  function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
  function date(value) { return value ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(String(value).slice(0, 10) + 'T12:00:00')) : 'Sin fecha'; }
  function dateTime(value) { return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(value); }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }
  function attr(value) { return esc(value).replace(/\s+/g, '-').toLowerCase(); }
})();
