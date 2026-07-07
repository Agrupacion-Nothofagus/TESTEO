import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusTreasurySaasGeneral) return;
  window.__nothofagusTreasurySaasGeneral = true;

  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  const year = new Date().getFullYear();
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  loadStyles();
  bindActions();
  observePage();
  queueRender();
  document.addEventListener('DOMContentLoaded', queueRender);
  window.addEventListener('hashchange', queueRender);
  window.setTimeout(queueRender, 600);
  window.setTimeout(queueRender, 1500);

  function observePage() {
    if (!document.body || document.body.dataset.treasurySaasObserved) return;
    document.body.dataset.treasurySaasObserved = 'true';
    new MutationObserver(() => queueRender()).observe(document.body, { childList: true, subtree: true });
  }

  function queueRender() {
    window.clearTimeout(queueRender.timer);
    queueRender.timer = window.setTimeout(render, 120);
  }

  async function render() {
    const panel = document.querySelector('#tesoreria-general-view .tesoreria-panel');
    if (!panel || panel.dataset.saasReady === 'true') return;
    panel.dataset.saasReady = 'true';
    panel.innerHTML = '<section class="treasury-saas-dashboard"><div class="treasury-saas-panel"><p class="treasury-saas-empty">Cargando dashboard financiero...</p></div></section>';
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
    const movements = allMovements.filter((item) => getYear(item.fecha) === year);
    const income = sum(movements, 'ingreso');
    const expenses = sum(movements, 'egreso');
    const q = cuotasData.resumen || {};
    const cuotasPaid = Number(q.totalPagado || q.recaudado || 0);
    const cuotasPending = Number(q.saldoPendiente || 0);
    const members = Number(q.totalMiembros || q.miembros || 0);
    const totalIncome = income + cuotasPaid;
    const balance = totalIncome - expenses;
    const monthly = monthlySeries(movements, cuotasData.miembros || []);
    const currentIndex = new Date().getMonth();
    const avgExpense = expenses / Math.max(currentIndex + 1, 1);
    const coverage = avgExpense > 0 ? Math.floor(Math.max(balance, 0) / avgExpense) : 0;
    const recovery = cuotasPaid + cuotasPending > 0 ? Math.round((cuotasPaid / (cuotasPaid + cuotasPending)) * 100) : 0;

    return { movements, recent: movements.slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))).slice(0, 6), income, expenses, cuotasPaid, cuotasPending, members, totalIncome, balance, monthly, currentIncome: monthly[currentIndex].income, currentExpense: monthly[currentIndex].expense, avgExpense, coverage, recovery };
  }

  function monthlySeries(movements, members) {
    const series = Array.from({ length: 12 }, (_, index) => ({ label: months[index], income: 0, expense: 0 }));
    movements.forEach((item) => {
      const idx = getMonth(item.fecha);
      if (idx < 0 || idx > 11) return;
      if (String(item.tipo || '').toLowerCase() === 'egreso') series[idx].expense += Number(item.monto || 0);
      else series[idx].income += Number(item.monto || 0);
    });
    if (Array.isArray(members)) {
      members.forEach((member) => (member.pagos || []).forEach((payment) => {
        if (Number(payment.anio || year) !== year || payment.tipoPago === 'anual') return;
        const idx = Number(payment.mes || 0) - 1;
        if (idx >= 0 && idx < 12) series[idx].income += Number(payment.monto || 0);
      }));
    }
    return series;
  }

  function template(data) {
    return '<section class="treasury-saas-dashboard">' +
      '<header class="treasury-saas-hero"><div><p class="treasury-saas-kicker">Administración financiera</p><h3>Tesorería general</h3><p>Dashboard administrativo tipo SaaS para visualizar ingresos, egresos, cuotas, flujo mensual, saldo disponible y focos de gestión.</p><div class="treasury-saas-hero-actions"><button type="button" data-saas-treasury-go="ingresos">Registrar ingreso</button><button type="button" class="secondary" data-saas-treasury-go="egresos">Registrar egreso</button><button type="button" class="secondary" data-saas-treasury-go="cuotas">Registro de pagos</button></div></div><aside class="treasury-saas-balance"><span>Saldo disponible</span><strong>' + money(data.balance) + '</strong><small>' + (data.balance >= 0 ? 'Balance positivo según movimientos y cuotas registradas.' : 'Revisar egresos y recaudación pendiente.') + '</small></aside></header>' +
      '<div class="treasury-saas-kpi-grid">' + card('Ingresos totales', money(data.totalIncome), 'General ' + money(data.income) + ' · cuotas ' + money(data.cuotasPaid)) + card('Egresos totales', money(data.expenses), 'Promedio mensual ' + money(data.avgExpense)) + card('Cuotas pendientes', money(data.cuotasPending), data.recovery + '% de recuperación estimada') + card('Integrantes en cuotas', String(data.members), 'Nómina sincronizada') + '</div>' +
      '<div class="treasury-saas-grid"><section class="treasury-saas-panel"><div class="treasury-saas-chart-title"><h4>Flujo mensual</h4><span>' + year + '</span></div><div class="treasury-saas-chart">' + bars(data.monthly) + '</div></section><aside class="treasury-saas-side"><section class="treasury-saas-panel"><div class="treasury-saas-chart-title"><h4>Salud financiera</h4><span>SaaS</span></div><div class="treasury-saas-health">' + health('Ingreso del mes', money(data.currentIncome), 'Entradas registradas') + health('Egreso del mes', money(data.currentExpense), 'Salidas registradas') + health('Cobertura estimada', data.coverage > 0 ? data.coverage + ' meses' : 'Sin egreso promedio', 'Saldo / egreso promedio') + health('Recuperación cuotas', data.recovery + '%', 'Recaudación anual') + '</div></section><section class="treasury-saas-panel"><div class="treasury-saas-chart-title"><h4>Acciones rápidas</h4><span>Operación</span></div><div class="treasury-saas-quick"><button type="button" data-saas-treasury-go="ingresos">Ingreso</button><button type="button" class="secondary" data-saas-treasury-go="egresos">Egreso</button><button type="button" class="secondary" data-saas-treasury-go="cuotas">Cuotas</button></div></section></aside></div>' +
      '<section class="treasury-saas-panel"><div class="treasury-saas-chart-title"><h4>Últimos movimientos</h4><span>' + data.recent.length + ' registros</span></div><div class="treasury-saas-recent">' + recent(data.recent) + '</div></section>' +
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
    return items.map((item) => '<article class="' + attr(item.tipo || '') + '"><div><strong>' + esc(item.descripcion || 'Movimiento') + '</strong><span>' + date(item.fecha) + ' · ' + esc(item.tipo || '') + '</span></div><em>' + (item.tipo === 'egreso' ? '-' : '+') + money(item.monto) + '</em></article>').join('');
  }

  function bindActions() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-saas-treasury-go]');
      if (!button) return;
      event.preventDefault();
      document.querySelector('[data-tesoreria-open="' + button.dataset.saasTreasuryGo + '"]')?.click();
    });
  }

  function loadStyles() {
    if (document.querySelector('link[data-treasury-saas-general]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'tesoreria-general-saas.css?v=20260709';
    link.dataset.treasurySaasGeneral = 'true';
    document.head.appendChild(link);
  }

  function sum(items, type) { return items.filter((item) => String(item.tipo || '').toLowerCase() === type).reduce((total, item) => total + Number(item.monto || 0), 0); }
  function getYear(value) { return Number(String(value || '').slice(0, 4)) || 0; }
  function getMonth(value) { return Number(String(value || '').slice(5, 7)) - 1; }
  function money(value) { return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0)); }
  function date(value) { return value ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(String(value).slice(0, 10) + 'T12:00:00')) : 'Sin fecha'; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }
  function attr(value) { return esc(value); }
})();
