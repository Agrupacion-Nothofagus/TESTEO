// Corrige el flujo de creación de actas.
// Al entrar por el sidebar en Actas → Crear acta, siempre deja un formulario nuevo en blanco.
// No afecta la edición, porque el botón Editar no usa data-actas-open="crear".
if (!window.__nothofagusActasNewResetFix) {
  window.__nothofagusActasNewResetFix = true;

  document.addEventListener('click', (event) => {
    const crearDesdeSidebar = event.target.closest?.('[data-actas-open="crear"]');
    if (!crearDesdeSidebar) return;

    window.setTimeout(() => {
      const nuevaActaButton = document.querySelector('[data-acta-nueva]');
      if (nuevaActaButton) {
        nuevaActaButton.click();
        return;
      }

      limpiarFormularioActaVisualmente();
    }, 80);
  }, true);
}

function limpiarFormularioActaVisualmente() {
  const form = document.querySelector('[data-acta-form]');
  if (!form) return;

  form.reset();
  document.querySelectorAll('[data-repeat]').forEach((container) => {
    container.innerHTML = '';
  });

  document.querySelector('[data-acta-aprobar-form]')?.classList.add('actas-hidden');

  const status = document.querySelector('[data-actas-status]');
  if (status) {
    status.textContent = 'Nueva acta en edición.';
    status.classList.add('success');
    status.classList.remove('error');
  }
}
