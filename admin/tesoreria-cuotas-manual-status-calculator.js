(() => {
  if (window.__nothofagusCuotasManualStatusCalculator) return;
  window.__nothofagusCuotasManualStatusCalculator = true;

  const MONEY = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const monthNames = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  window.__nothofagusCuotasManualStatusRecalculate = recalculateNow;

  bindEvents();
  queueRecalculate();
  document.addEventListener('DOMContentLoaded', queueRecalculate);
  window.addEventListener('hashchange', queueRecalculate);
  window.setTimeout(queueRecalculate, 500);
  window.setTimeout(queueRecalculate, 1400);

  function bindEvents() {
    document.addEventListener('click', (event) => {
      if (event.target.closest?.('[data-status-choice]')) window.setTimeout(recalculateNow, 0);
      if (event.target.closest?.('[data-cuotas-payment-month]')) window.setTimeout(recalculateNow, 50);
    }, true);
    document.addEventListener('change', (event) => {
      if (event.target.matches?.('[data-cuotas-month], [data-cuotas-year], [data-cuotas-filter-year]')) window.setTimeout(recalculateNow, 80);
    }, true);
    window.addEventListener('nothofagus:cuotas-status-changed', recalculateNow);
    window.addEventListener('nothofagus:cuotas-matrix-refreshed', queueRecalculate);
    document.addEventListener('nothofagus:cuotas-status-changed', recalculateNow);
  }

  function queueRecalculate() {
    window.clearTimeout(queueRecalculate.timer);
    queueRecalculate.timer = window.setTimeout(recalculate, 70);
  }

  function recalculateNow() {
    window.clearTimeout(queueRecalculate.timer);
    recalculate();
    window.requestAnimationFrame(() => recalculate());
  }

  function recalculate() {
    const view = document.querySelector('#tesoreria-cuotas-view');
    const rows = Array.from(view?.querySelectorAll('.cuotas-monthly-table tbody tr') || []);
    if (!view || !rows.length) return;

    const selectedMonth = getSelectedMonth(view);
    const year = getSelectedYear(view);
    const summary = rows.reduce((acc, row) => {
      const rowCalc = recalculateRow(row, selectedMonth);
      if (row.dataset.estadoCuenta !== 'inactivo') acc.integrantesActivos += 1;
      acc.esperadoMes += rowCalc.expectedByMonth[selectedMonth] || 0;
      acc.recibidoMes += rowCalc.paidByMonth[selectedMonth] || 0;
      acc.totalRecaudado += rowCalc.totalPaid;
      acc.esperadoAnual += rowCalc.expectedAnnual;
      acc.saldoPendiente += rowCalc.pendingAnnual;
      if (rowCalc.pendingAnnual <= 0 && rowCalc.expectedAnnual > 0) acc.alDia += 1;
      if (rowCalc.pendingAnnual > 0) acc.atrasados += 1;
      return acc;
    }, { integrantesActivos: 0, esperadoMes: 0, recibidoMes: 0, totalRecaudado: 0, esperadoAnual: 0, saldoPendiente: 0, alDia: 0, atrasados: 0 });

    summary.pendienteMes = Math.max(summary.esperadoMes - summary.recibidoMes, 0);
    summary.porcentajeMes = summary.esperadoMes > 0 ? Math.round((summary.recibidoMes / summary.esperadoMes) * 1000) / 10 : 0;

    renderSummary(view, summary, selectedMonth, year);
    view.dataset.manualStatusCalculated = 'true';
    view.dispatchEvent(new CustomEvent('nothofagus:cuotas-manual-status-calculated', { bubbles: true, detail: summary }));
  }

  function recalculateRow(row, selectedMonth) {
    const cuota = parseMoney(row.querySelector('[data-label="Cuota mensual"]')?.textContent || '0');
    const dots = Array.from(row.querySelectorAll('.payment-status-dot[data-month]'));
    const totalCell = row.querySelector('[data-label="Total pagado"] strong') || row.querySelector('[data-label="Total pagado"]');
    const saldoCell = row.querySelector('[data-label="Saldo pendiente"] strong') || row.querySelector('[data-label="Saldo pendiente"]');
    const officialTotalPaid = getOriginalAmount(row, 'originalTotalPagado', totalCell);
    const paidByMonth = {};
    const expectedByMonth = {};
    let expectedAnnual = 0;

    dots.forEach((dot) => {
      const month = Number(dot.dataset.month || 0);
      const status = statusOf(dot);
      const expected = status === 'sin_registro' || row.dataset.estadoCuenta === 'inactivo' || row.dataset.exento === 'true' ? 0 : cuota;
      const paid = dot.dataset.cuotasPaymentId ? Number(dot.dataset.paymentAmount || 0) : 0;
      expectedByMonth[month] = expected;
      paidByMonth[month] = paid;
      expectedAnnual += expected;
      enrichDotTitle(dot, month, status, paid, expected);
    });

    const totalPaid = officialTotalPaid;
    const pendingAnnual = Math.max(expectedAnnual - totalPaid, 0);
    if (totalCell) flashText(totalCell, money(totalPaid));
    if (saldoCell) {
      flashText(saldoCell, money(pendingAnnual));
      saldoCell.classList.toggle('positive', pendingAnnual <= 0);
      saldoCell.classList.toggle('warning', pendingAnnual > 0);
    }
    row.dataset.manualExpectedMonth = String(expectedByMonth[selectedMonth] || 0);
    row.dataset.manualPaidMonth = String(paidByMonth[selectedMonth] || 0);
    row.dataset.manualTotalPaid = String(totalPaid);
    row.dataset.manualPendingAnnual = String(pendingAnnual);
    return { cuota, paidByMonth, expectedByMonth, totalPaid, expectedAnnual, pendingAnnual };
  }

  function renderSummary(view, summary, selectedMonth, year) {
    updateKpis(view, summary);
    updateMonthSummary(view, summary, selectedMonth, year);
    updateAnnualSummary(view, summary);
  }

  function updateKpis(view, summary) {
    const cards = Array.from(view.querySelectorAll('.cuotas-kpi-grid .cuotas-kpi-card'));
    setCard(cards[0], summary.integrantesActivos, 'Activos este año');
    setCard(cards[1], money(summary.esperadoMes), 'Según estados del mes');
    setCard(cards[2], money(summary.recibidoMes), `${summary.porcentajeMes}% del esperado`);
    setCard(cards[3], money(summary.pendienteMes), 'Del mes seleccionado');
    setCard(cards[4], money(summary.totalRecaudado), 'Solo pagos reales registrados');
    setCard(cards[5], money(summary.saldoPendiente), 'Pendiente por cobrar');
  }

  function setCard(card, value, note) {
    if (!card) return;
    const strong = card.querySelector('strong');
    const small = card.querySelector('small');
    if (strong) flashText(strong, String(value));
    if (small) small.textContent = String(note || '');
    flash(card);
  }

  function updateMonthSummary(view, summary, selectedMonth, year) {
    const box = view.querySelector('[data-cuotas-month-summary]');
    if (!box) return;
    box.innerHTML = `<h4>Resumen del mes</h4><p class="cuotas-side-date">📅 ${escapeHTML(monthNames[selectedMonth] || 'Mes')} ${escapeHTML(year)}</p><dl class="cuotas-side-list"><div><dt>Esperado</dt><dd>${money(summary.esperadoMes)}</dd></div><div><dt>Recibido</dt><dd class="positive">${money(summary.recibidoMes)}</dd></div><div><dt>Pendiente</dt><dd class="warning">${money(summary.pendienteMes)}</dd></div><div><dt>% Cumplimiento</dt><dd>${summary.porcentajeMes}%</dd></div></dl><div class="cuotas-progress"><span style="width:${Math.min(summary.porcentajeMes, 100)}%"></span></div><p class="cuotas-empty compact">Cálculo actualizado automáticamente por estado de color.</p>`;
    flash(box);
  }

  function updateAnnualSummary(view, summary) {
    const box = view.querySelector('[data-cuotas-annual-summary]');
    if (!box) return;
    const progress = summary.esperadoAnual > 0 ? Math.min(100, Math.round(summary.totalRecaudado / summary.esperadoAnual * 100)) : 0;
    box.innerHTML = `<h4>Resumen anual</h4><div class="cuotas-annual-progress"><div><span>Avance de recaudación</span><strong>${progress}%</strong></div><div class="cuotas-progress" role="progressbar" aria-label="Avance de recaudación anual" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div></div><div class="cuotas-annual-bars"><div><span>Esperado anual</span><strong>${money(summary.esperadoAnual)}</strong></div><div><span>Recaudado anual</span><strong>${money(summary.totalRecaudado)}</strong></div><div><span>Saldo pendiente anual</span><strong>${money(summary.saldoPendiente)}</strong></div></div>`;
  }

  function enrichDotTitle(dot, month, status, paid, expected) {
    const label = { pagado: 'Pagado', pendiente: 'Pendiente', atrasado: 'Atrasado', sin_registro: 'N/A' }[status] || status;
    const text = `${monthNames[month] || 'Mes'} · ${label} · Recibido ${money(paid)} · Esperado ${money(expected)}`;
    dot.title = text;
    dot.setAttribute('aria-label', text);
  }

  function statusOf(dot) {
    if (dot.dataset.manualStatus) return dot.dataset.manualStatus;
    if (dot.classList.contains('pagado')) return 'pagado';
    if (dot.classList.contains('pendiente')) return 'pendiente';
    if (dot.classList.contains('atrasado')) return 'atrasado';
    return 'sin_registro';
  }

  function flashText(element, value) {
    if (!element) return;
    if (element.textContent !== String(value)) flash(element);
    element.textContent = String(value);
  }

  function flash(element) {
    if (!element) return;
    element.classList.remove('cuotas-live-updated');
    void element.offsetWidth;
    element.classList.add('cuotas-live-updated');
    window.setTimeout(() => element.classList.remove('cuotas-live-updated'), 520);
  }

  function getOriginalAmount(row, key, cell) {
    if (!row) return 0;
    const dataKey = `cuotas${key.charAt(0).toUpperCase()}${key.slice(1)}`;
    if (row.dataset[dataKey] === undefined && cell) row.dataset[dataKey] = String(parseMoney(cell.textContent || '0'));
    return Number(row.dataset[dataKey] || 0) || 0;
  }

  function getSelectedMonth(view) {
    return Number(view.querySelector('[data-cuotas-month]')?.value || new Date().getMonth() + 1);
  }

  function getSelectedYear(view) {
    return String(view.querySelector('[data-cuotas-year]')?.value || view.querySelector('[data-cuotas-filter-year]')?.value || new Date().getFullYear());
  }

  function parseMoney(value) {
    return Number(String(value || '').replace(/[^0-9]/g, '')) || 0;
  }

  function money(value) {
    return MONEY.format(Number(value || 0));
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }
})();
