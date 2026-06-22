// Advertencia visual para eliminar actas, similar al modal de eliminar usuarios.
if (!window.__nothofagusActasDeleteWarning) {
  window.__nothofagusActasDeleteWarning = true;

  let allowActaDeleteConfirm = false;
  let pendingActaDeleteButton = null;
  const previousConfirm = window.confirm.bind(window);

  installActaDeleteModal();

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-acta-eliminar]');
    if (!button) return;
    pendingActaDeleteButton = button;
  }, true);

  window.confirm = (message) => {
    const text = String(message || '');

    if (allowActaDeleteConfirm && text.startsWith('¿Eliminar el acta')) {
      return true;
    }

    if (text.startsWith('¿Eliminar el acta') && text.includes('Esta acción no se puede deshacer')) {
      showActaDeleteModal(text);
      return false;
    }

    return previousConfirm(message);
  };

  function installActaDeleteModal() {
    if (document.querySelector('#delete-acta-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'delete-acta-modal';
    modal.className = 'delete-user-modal is-hidden';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="delete-user-modal__backdrop" data-acta-delete-cancel></div>
      <section class="delete-user-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="delete-acta-title">
        <p class="section-tag">Confirmar eliminación</p>
        <h3 id="delete-acta-title">Eliminar acta</h3>
        <p id="delete-acta-message" class="delete-user-modal__message"></p>
        <div class="delete-user-modal__actions">
          <button type="button" class="delete-user-modal__cancel" data-acta-delete-cancel>Cancelar</button>
          <button type="button" class="delete-user-modal__accept" data-acta-delete-accept>Aceptar</button>
        </div>
      </section>
    `;

    document.body.appendChild(modal);

    modal.querySelectorAll('[data-acta-delete-cancel]').forEach((button) => {
      button.addEventListener('click', closeActaDeleteModal);
    });

    modal.querySelector('[data-acta-delete-accept]')?.addEventListener('click', () => {
      const button = pendingActaDeleteButton;
      closeActaDeleteModal();

      if (!button) return;

      allowActaDeleteConfirm = true;
      button.click();
      allowActaDeleteConfirm = false;
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeActaDeleteModal();
    });
  }

  function showActaDeleteModal(message) {
    const modal = document.querySelector('#delete-acta-modal');
    const messageBox = document.querySelector('#delete-acta-message');
    if (!modal || !messageBox) return;

    pendingActaDeleteButton = pendingActaDeleteButton || document.activeElement?.closest?.('[data-acta-eliminar]') || null;
    messageBox.textContent = message;
    modal.classList.remove('is-hidden');
    modal.setAttribute('aria-hidden', 'false');
    modal.querySelector('[data-acta-delete-cancel]')?.focus();
  }

  function closeActaDeleteModal() {
    const modal = document.querySelector('#delete-acta-modal');
    if (!modal) return;

    modal.classList.add('is-hidden');
    modal.setAttribute('aria-hidden', 'true');
    pendingActaDeleteButton = null;
  }
}
