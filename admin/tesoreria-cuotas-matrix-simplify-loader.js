(() => {
  if (window.__nothofagusCuotasMatrixSimplifyLoader) return;
  window.__nothofagusCuotasMatrixSimplifyLoader = true;

  if (document.querySelector('link[data-cuotas-matrix-simplify]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'tesoreria-cuotas-matrix-simplify.css?v=20260707';
  link.dataset.cuotasMatrixSimplify = 'true';
  document.head.appendChild(link);
})();
