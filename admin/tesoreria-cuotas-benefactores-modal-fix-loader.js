(() => {
  if (window.__nothofagusBenefactorModalFixLoader) return;
  window.__nothofagusBenefactorModalFixLoader = true;

  const href = 'tesoreria-cuotas-benefactores-modal-fix.css?v=20260710-modal-fit';
  const existing = document.querySelector('link[data-benefactor-modal-fix]');
  if (existing) {
    existing.href = href;
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.benefactorModalFix = 'true';
  document.head.appendChild(link);
})();
