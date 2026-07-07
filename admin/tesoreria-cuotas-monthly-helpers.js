(() => {
  if (window.__nothofagusCuotasMonthlyHelpers) return;
  window.__nothofagusCuotasMonthlyHelpers = true;

  document.addEventListener('click', (event) => {
    const clear = event.target.closest?.('[data-cuotas-clear-filter]');
    if (!clear) return;
    event.preventDefault();
    document.querySelector('[data-cuotas-filter="search"]') && (document.querySelector('[data-cuotas-filter="search"]').value = '');
    document.querySelector('[data-cuotas-filter="estado"]') && (document.querySelector('[data-cuotas-filter="estado"]').value = '');
    document.querySelector('[data-cuotas-filter="pago"]') && (document.querySelector('[data-cuotas-filter="pago"]').value = '');
    const month = document.querySelector('[data-cuotas-month]');
    if (month) {
      month.value = String(new Date().getMonth() + 1);
      month.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
})();
