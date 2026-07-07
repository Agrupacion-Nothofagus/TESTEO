(() => {
  if (window.__nothofagusCuotasSubmitGuard) return;
  window.__nothofagusCuotasSubmitGuard = true;

  if (!document.querySelector('link[data-cuotas-submit-guard]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'tesoreria-cuotas-submit-guard.css?v=20260707';
    css.dataset.cuotasSubmitGuard = 'true';
    document.head.appendChild(css);
  }

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form?.matches?.('[data-cuotas-payment-form]')) return;

    const memberId = String(form.querySelector('[name="member_id"]')?.value || '').trim();
    const tipoPago = String(form.querySelector('[name="tipo_pago"]')?.value || 'mensual').trim().toLowerCase();
    const mes = Number(form.querySelector('[name="mes"]')?.value || 0);
    const anio = String(form.querySelector('[name="anio"]')?.value || '').trim();

    if (tipoPago !== 'mensual' || !memberId || !mes) return;

    const dot = document.querySelector(`[data-cuotas-payment-month="${cssEscape(memberId)}"][data-month="${mes}"]`);
    if (!dot?.classList?.contains('pagado')) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const memberName = form.querySelector(`[name="member_id"] option[value="${cssEscape(memberId)}"]`)?.textContent?.trim() || 'este integrante';
    const monthName = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][mes] || 'este mes';
    const message = `Ya existe un pago mensual registrado para ${memberName} en ${monthName}${anio ? ` ${anio}` : ''}. Revisa el historial antes de volver a registrar.`;

    showGuardMessage(form, message);
  }, true);

  function showGuardMessage(form, message) {
    let box = form.querySelector('[data-cuotas-guard-message]');
    if (!box) {
      box = document.createElement('p');
      box.dataset.cuotasGuardMessage = 'true';
      box.className = 'cuotas-guard-message';
      form.querySelector('.cuotas-modal-actions')?.before(box);
    }
    box.textContent = message;
    box.setAttribute('role', 'alert');
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return window.CSS.escape(value);
    return String(value).replace(/"/g, '\\"');
  }
})();
