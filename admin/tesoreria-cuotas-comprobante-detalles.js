import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusCuotasComprobanteDetalles) return;
  window.__nothofagusCuotasComprobanteDetalles = true;

  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  const API_URL = '/api/cuotas-miembros';
  const STATUS_KEY = 'nothofagus_cuotas_month_status_overrides_v1';
  let selectedDot = null;

  loadStyles();

  document.addEventListener('click', (event) => {
    const dot = event.target.closest?.('#tesoreria-cuotas-view [data-cuotas-payment-month]');
    if (dot) selectedDot = dot;

    const details = event.target.closest?.('.cuotas-status-menu [data-status-choice="detalles"]');
    if (details) {
      event.preventDefault();
      event.stopImmediatePropagation();
      document.querySelectorAll('#tesoreria-cuotas-view .cuotas-status-menu').forEach((item) => item.remove());
      openComprobanteModal(getDotInfo(selectedDot));
    }

    const close = event.target.closest?.('[data-cuotas-comprobante-close]');
    if (close || event.target.matches?.('[data-cuotas-comprobante-backdrop]')) {
      event.preventDefault();
      closeComprobanteModal();
    }
  }, true);

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest?.('[data-cuotas-comprobante-form]');
    if (!form) return;
    event.preventDefault();
    await saveComprobante(form);
  }, true);

  function openComprobanteModal(info) {
    if (!info?.memberId || !info.month) return;
    closeComprobanteModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'cuotas-comprobante-backdrop';
    backdrop.dataset.cuotasComprobanteBackdrop = 'true';
    backdrop.innerHTML = renderModal(info);
    document.querySelector('#tesoreria-cuotas-view')?.appendChild(backdrop);
  }

  function renderModal(info) {
    const amount = parseMoney(info.cuota);
    return `
      <section class="cuotas-comprobante-panel" role="dialog" aria-modal="true" aria-label="Agregar comprobante de pago">
        <header class="cuotas-comprobante-head">
          <div>
            <h4>Comprobante de transferencia</h4>
            <p>${escapeHTML(info.memberName)} · ${escapeHTML(info.mesLabel)} ${escapeHTML(info.anio)}</p>
          </div>
          <button type="button" data-cuotas-comprobante-close>×</button>
        </header>
        <form class="cuotas-comprobante-form" data-cuotas-comprobante-form data-member-id="${escapeAttr(info.memberId)}" data-month="${escapeAttr(info.month)}" data-year="${escapeAttr(info.anio)}">
          <div class="cuotas-comprobante-summary">
            <article><span>Estado</span><strong>${escapeHTML(info.statusLabel)}</strong></article>
            <article><span>Cuota mensual</span><strong>${escapeHTML(info.cuota)}</strong></article>
          </div>
          <div class="cuotas-comprobante-grid">
            <label>Monto pagado
              <input type="number" name="monto" min="1" step="1" value="${escapeAttr(amount || '')}" required>
            </label>
            <label>Fecha de pago
              <input type="date" name="fecha_pago" value="${escapeAttr(new Date().toISOString().slice(0, 10))}" required>
            </label>
          </div>
          <label>Método de pago
            <select name="metodo_pago" required>
              <option value="transferencia">Transferencia</option>
              <option value="deposito">Depósito</option>
              <option value="efectivo">Efectivo</option>
              <option value="webpay">Webpay</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <label>Foto o comprobante
            <input type="file" name="comprobante" accept="image/jpeg,image/png,application/pdf" required>
          </label>
          <label>Observación
            <textarea name="observacion" rows="3" placeholder="Ej.: número de operación, banco, nota interna..."></textarea>
          </label>
          <p class="cuotas-comprobante-note">Se aceptan JPG, PNG o PDF. Al guardar se registra el pago y el mes queda marcado como pagado.</p>
          <p class="cuotas-comprobante-status" data-cuotas-comprobante-status aria-live="polite"></p>
          <div class="cuotas-comprobante-actions">
            <button type="button" class="secondary" data-cuotas-comprobante-close>Cerrar</button>
            <button type="submit">Guardar comprobante</button>
          </div>
        </form>
      </section>
    `;
  }

  async function saveComprobante(form) {
    const status = form.querySelector('[data-cuotas-comprobante-status]');
    const submit = form.querySelector('button[type="submit"]');
    const file = form.querySelector('input[name="comprobante"]')?.files?.[0];
    if (!file) return setStatus(status, 'Adjunta una imagen o PDF del comprobante.', false);

    try {
      if (submit) submit.disabled = true;
      setStatus(status, 'Guardando pago y comprobante...', true);
      await postPayment(form, file);
      markDotPaid(form.dataset.memberId, form.dataset.year, form.dataset.month);
      setStatus(status, 'Comprobante guardado correctamente.', true);
      refreshCuotas();
      window.setTimeout(closeComprobanteModal, 700);
    } catch (error) {
      setStatus(status, error.message || 'No fue posible guardar el comprobante.', false);
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function postPayment(form, file) {
    if (!client) throw new Error('Supabase no está configurado.');
    const session = await client.auth.getSession();
    const accessToken = session.data?.session?.access_token;
    if (!accessToken) throw new Error('Sesión no disponible.');

    const data = new FormData(form);
    data.set('action', 'payment');
    data.set('tipo_pago', 'mensual');
    data.set('member_id', form.dataset.memberId || '');
    data.set('mes', form.dataset.month || '');
    data.set('anio', form.dataset.year || new Date().getFullYear());
    data.set('comprobante', file);

    const response = await fetch(API_URL, { method: 'POST', headers: { authorization: `Bearer ${accessToken}` }, body: data });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'No fue posible registrar el pago.');
    return result;
  }

  function getDotInfo(dot) {
    const row = dot?.closest('tr');
    const month = Number(dot?.dataset.month || 0);
    const memberId = String(dot?.dataset.cuotasPaymentMonth || '');
    const anio = String(document.querySelector('[data-cuotas-year]')?.value || document.querySelector('[data-cuotas-filter-year]')?.value || new Date().getFullYear());
    const status = getCurrentStatus(dot);
    return {
      dot,
      row,
      month,
      memberId,
      anio,
      memberName: row?.querySelector('[data-label="Integrante"] strong')?.textContent?.trim() || 'Integrante',
      cuota: row?.querySelector('[data-label="Cuota mensual"]')?.textContent?.trim() || '—',
      mesLabel: dot?.closest('td')?.dataset.label || getMonthName(month),
      statusLabel: { pagado: 'Pagado', pendiente: 'Pendiente', atrasado: 'Atrasado', sin_registro: 'N/A' }[status] || status
    };
  }

  function getCurrentStatus(dot) {
    if (!dot) return 'sin_registro';
    if (dot.classList.contains('pagado')) return 'pagado';
    if (dot.classList.contains('pendiente')) return 'pendiente';
    if (dot.classList.contains('atrasado')) return 'atrasado';
    return 'sin_registro';
  }

  function markDotPaid(memberId, anio, month) {
    const dot = document.querySelector(`#tesoreria-cuotas-view [data-cuotas-payment-month="${cssEscape(memberId)}"][data-month="${cssEscape(month)}"]`);
    if (dot) {
      dot.classList.remove('pendiente', 'atrasado', 'sin_registro');
      dot.classList.add('pagado', 'is-manual-status');
      dot.dataset.manualStatus = 'pagado';
    }
    const overrides = readOverrides();
    overrides[`${memberId}:${anio}:${month}`] = 'pagado';
    localStorage.setItem(STATUS_KEY, JSON.stringify(overrides));
  }

  function refreshCuotas() {
    const year = document.querySelector('#tesoreria-cuotas-view [data-cuotas-year]');
    if (year) year.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function closeComprobanteModal() {
    document.querySelectorAll('#tesoreria-cuotas-view [data-cuotas-comprobante-backdrop]').forEach((item) => item.remove());
  }

  function loadStyles() {
    if (document.querySelector('link[data-cuotas-comprobante-detalles]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'tesoreria-cuotas-comprobante-detalles.css?v=20260710';
    link.dataset.cuotasComprobanteDetalles = 'true';
    document.head.appendChild(link);
  }

  function readOverrides() {
    try { return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}') || {}; } catch { return {}; }
  }

  function parseMoney(value) { return Number(String(value || '').replace(/[^0-9]/g, '')) || 0; }
  function getMonthName(month) { return ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][month] || 'Mes'; }
  function setStatus(element, message, ok) { if (element) { element.textContent = message; element.classList.toggle('success', Boolean(ok)); element.classList.toggle('error', !ok); } }
  function cssEscape(value) { return window.CSS?.escape ? window.CSS.escape(String(value || '')) : String(value || '').replace(/"/g, '\\"'); }
  function escapeHTML(value) { return String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char])); }
  function escapeAttr(value) { return escapeHTML(value).replace(/'/g, '&#039;'); }
})();
