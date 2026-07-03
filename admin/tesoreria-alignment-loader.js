// Carga ajustes visuales para alinear los formularios de Ingresos y Egresos.
if (!window.__nothofagusTesoreriaAlignmentLoader) {
  window.__nothofagusTesoreriaAlignmentLoader = true;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'tesoreria-form-alignment.css';
  document.head.appendChild(link);
}
