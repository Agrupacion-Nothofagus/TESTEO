(() => {
  if (window.__nothofagusCuotasCellStatusMenu) return;
  window.__nothofagusCuotasCellStatusMenu = true;

  const STORAGE_KEY = 'nothofagus_cuotas_month_status_overrides_v1';
  const STATUS_CLASSES = ['pagado', 'pendiente', 'atrasado', 'sin_registro'];
  const STATUS_LABELS = {
    pagado: 'Pagado',
    pendiente: 'Pendiente',
    atrasado: 'Atrasado',
    sin_registro: 'N/A'
  };

  let activeDot = null;
  let menu = null;

  loadStyles();
  applyOverridesSoon();

  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      closeDetails();
    }
  });

  const observer = new MutationObserver(() => applyOverridesSoon());
  const startObserver = () => {
    const view = document.querySelector('#tesoreria-cuotas-view');
    if (view && !view.dataset.cellStatusObserved) {
      view.dataset.cellStatusObserved = 'true';
      observer.observe(view, { childList: true, subtree: true });
    }
    applyOverridesSoon();
  };

  document.addEventListener('DOMContentLoaded', startObserver);
  window.setTimeout(startObserver, 400);
  window.setTimeout(startObserver, 1200);

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
      handleChoice(choice.dataset.statusChoice);
      return;
    }

    const dot = event.target.closest?.('#tesoreria-cuotas-view [data-cuotas-payment-month]');
    if (dot) {
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
      <button type="button" data-status-choice="pagado">Pagado</button>
      <button type="button" data-status-choice="pendiente">Pendiente</button>
      <button type="button" data-status-choice="atrasado">Atrasado</button>
      <button type="button" data-status-choice="sin_registro">N/A</button>
      <button type="button" data-status-choice="detalles">Detalles</button>
    `;
    document.querySelector('#tesoreria-cuotas-view')?.appendChild(menu);
    positionMenu(dot, menu);
  }

  function positionMenu(dot, panel) {
    const rect = dot.getBoundingClientRect();
    const width = 176;
    const gap = 10;
    let left = rect.left + rect.width / 2 - width / 2;
    let top = rect.bottom + gap;
    left = Math.max(10, Math.min(left, window.innerWidth - width - 10));
    if (top + 230 > window.innerHeight) top = Math.max(10, rect.top - 230);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }

  function handleChoice(choice) {
    if (!activeDot) return closeMenu();
    if (choice === 'detalles') {
      const info = getDotInfo(activeDot);
      closeMenu();
      openDetails(info);
      return;
    }
    if (!STATUS_CLASSES.includes(choice)) return closeMenu();
    applyStatus(activeDot, choice, true);
    closeMenu();
  }

  function applyStatus(dot, status, persist = false) {
    STATUS_CLASSES.forEach((item) => dot.classList.remove(item));
    dot.classList.add(status, 'is-manual-status');
    dot.dataset.manualStatus = status;
    const info = getDotInfo(dot);
    const label = STATUS_LABELS[status] || status;
    dot.title = `${info.mesLabel} · ${label} · cambio manual`;
    dot.setAttribute('aria-label', dot.title);
    if (persist) {
      const overrides = readOverrides();
      overrides[makeKey(info.memberId, info.anio, info.month)] = status;
      writeOverrides(overrides);
      showStatus(`Estado actualizado visualmente a ${label}.`, true);
    }
  }

  function applyOverridesSoon() {
    window.clearTimeout(applyOverridesSoon.timer);
    applyOverridesSoon.timer = window.setTimeout(applyOverrides, 80);
  }

  function applyOverrides() {
    const overrides = readOverrides();
    document.querySelectorAll('#tesoreria-cuotas-view [data-cuotas-payment-month]').forEach((dot) => {
      const info = getDotInfo(dot);
      const status = overrides[makeKey(info.memberId, info.anio, info.month)];
      if (STATUS_CLASSES.includes(status)) applyStatus(dot, status, false);
    });
  }

  function getDotInfo(dot) {
    const row = dot.closest('tr');
    const month = Number(dot.dataset.month || 0);
    const memberId = String(dot.dataset.cuotasPaymentMonth || '');
    const memberName = row?.querySelector('[data-label="Integrante"] strong')?.textContent?.trim() || 'Integrante';
    const cuota = row?.querySelector('[data-label="Cuota mensual"]')?.textContent?.trim() || '—';
    const currentStatus = getCurrentStatus(dot);
    const anio = String(document.querySelector('[data-cuotas-year]')?.value || document.querySelector('[data-cuotas-filter-year]')?.value || new Date().getFullYear());
    const mesLabel = dot.closest('td')?.dataset.label || getMonthName(month);
    return { row, dot, memberId, memberName, cuota, month, mesLabel, anio, currentStatus };
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
        <header class="cuotas-cell-details-head">
          <div>
            <h4>Detalles del mes</h4>
            <p>${escapeHTML(info.memberName)} · ${escapeHTML(info.mesLabel)} ${escapeHTML(info.anio)}</p>
          </div>
          <button type="button" class="cuotas-cell-details-close" data-cuotas-cell-details-close>×</button>
        </header>
        <div class="cuotas-cell-details-body">
          <dl>
            <div><dt>Integrante</dt><dd>${escapeHTML(info.memberName)}</dd></div>
            <div><dt>Mes</dt><dd>${escapeHTML(info.mesLabel)} ${escapeHTML(info.anio)}</dd></div>
            <div><dt>Estado actual</dt><dd>${escapeHTML(STATUS_LABELS[info.currentStatus] || info.currentStatus)}</dd></div>
            <div><dt>Cuota mensual</dt><dd>${escapeHTML(info.cuota)}</dd></div>
          </dl>
          <p class="cuotas-empty compact">Los cambios hechos desde este menú actualizan la matriz visual. Para registrar monto, fecha, método o comprobante, usa el botón “Registrar pago”.</p>
        </div>
      </section>
    `;
    document.querySelector('#tesoreria-cuotas-view')?.appendChild(panel);
  }

  function closeDetails() {
    document.querySelectorAll('#tesoreria-cuotas-view [data-cuotas-cell-details-backdrop]').forEach((item) => item.remove());
  }

  function closeMenu(clearActive = true) {
    menu?.remove();
    menu = null;
    if (clearActive) activeDot = null;
  }

  function makeKey(memberId, anio, month) {
    return `${memberId}:${anio}:${month}`;
  }

  function readOverrides() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; } catch { return {}; }
  }

  function writeOverrides(value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value || {}));
  }

  function getMonthName(month) {
    return ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][month] || 'Mes';
  }

  function showStatus(message, ok) {
    const status = document.querySelector('#tesoreria-cuotas-view [data-cuotas-status]');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', !ok);
  }

  function loadStyles() {
    if (document.querySelector('link[data-cuotas-cell-status-menu]')) return;
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'tesoreria-cuotas-cell-status-menu.css?v=20260707';
    css.dataset.cuotasCellStatusMenu = 'true';
    document.head.appendChild(css);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  }
})();
