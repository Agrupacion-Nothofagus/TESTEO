const toggle = document.querySelector('[data-contact-toggle]');
const panel = document.querySelector('#contact-form-panel');
const form = document.querySelector('#contact-form');
const status = document.querySelector('#contact-status');
const phone = document.querySelector('#contact-phone');
const submitButton = form?.querySelector('button[type="submit"]');

const PHONE_PREFIX = '+569';
const CONTACT_PANEL_ANIMATION_MS = 320;
let contactPanelTimer = null;

toggle?.addEventListener('click', () => {
  if (!panel) return;

  const isClosed = panel.classList.contains('is-hidden');

  if (isClosed) {
    openContactPanel();
    return;
  }

  closeContactPanel();
});

phone?.addEventListener('input', () => {
  const digits = phone.value.replace(/\D/g, '');
  const withoutCountry = digits.replace(/^569?/, '').slice(0, 8);
  phone.value = `${PHONE_PREFIX}${withoutCountry}`;
});

phone?.addEventListener('blur', () => {
  if (!phone.value.startsWith(PHONE_PREFIX)) {
    phone.value = PHONE_PREFIX;
  }
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    nombre: document.querySelector('#contact-name').value.trim(),
    telefono: document.querySelector('#contact-phone').value.trim(),
    correo: document.querySelector('#contact-email').value.trim(),
    asunto: document.querySelector('#contact-subject').value.trim(),
    mensaje: document.querySelector('#contact-message').value.trim()
  };

  if (!payload.nombre || !payload.telefono || !payload.correo || !payload.asunto || !payload.mensaje) {
    showStatus('Completa todos los campos antes de enviar.', false);
    return;
  }

  if (!/^\+569\d{8}$/.test(payload.telefono)) {
    showStatus('Ingresa un teléfono válido con formato +569XXXXXXXX.', false);
    return;
  }

  try {
    setLoading(true);
    showStatus('Enviando mensaje...', true);

    const response = await fetch('/api/contacto', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No fue posible enviar el mensaje.');
    }

    form.reset();
    phone.value = PHONE_PREFIX;
    showStatus('Mensaje enviado correctamente. Te contactaremos a la brevedad.', true);
  } catch (error) {
    showStatus(error.message || 'No fue posible enviar el mensaje.', false);
  } finally {
    setLoading(false);
  }
});

function openContactPanel() {
  clearTimeout(contactPanelTimer);
  panel.classList.remove('is-hidden', 'is-closing');
  toggle?.setAttribute('aria-expanded', 'true');
  setTimeout(() => document.querySelector('#contact-name')?.focus(), 120);
}

function closeContactPanel() {
  clearTimeout(contactPanelTimer);
  panel.classList.add('is-closing');
  toggle?.setAttribute('aria-expanded', 'false');

  contactPanelTimer = setTimeout(() => {
    panel.classList.add('is-hidden');
    panel.classList.remove('is-closing');
  }, CONTACT_PANEL_ANIMATION_MS);
}

function setLoading(isLoading) {
  if (!submitButton) return;
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? 'Enviando...' : 'Enviar mensaje';
}

function showStatus(message, ok) {
  status.textContent = message;
  status.classList.toggle('success', ok);
  status.classList.toggle('error', !ok);
}
