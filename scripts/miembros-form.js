const toggle = document.querySelector('[data-member-toggle]');
const panel = document.querySelector('#member-form-panel');
const form = document.querySelector('#member-form');
const status = document.querySelector('#member-status');
const phone = document.querySelector('#member-phone');
const submitButton = form?.querySelector('button[type="submit"]');
const cancelButton = document.querySelector('[data-member-cancel]');

const PHONE_PREFIX = '+569';
const MEMBER_PANEL_ANIMATION_MS = 320;
let memberPanelTimer = null;

toggle?.addEventListener('click', () => {
  if (!panel) return;
  const isClosed = panel.classList.contains('is-hidden');
  isClosed ? openMemberPanel() : closeMemberPanel();
});

cancelButton?.addEventListener('click', closeMemberPanel);

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
    nombre: document.querySelector('#member-name').value.trim(),
    telefono: document.querySelector('#member-phone').value.trim(),
    correo: document.querySelector('#member-email').value.trim(),
    edad: document.querySelector('#member-age').value.trim(),
    comuna: document.querySelector('#member-city').value.trim(),
    motivacion: document.querySelector('#member-motivation').value.trim(),
    intereses: document.querySelector('#member-interests').value.trim(),
    sitio_web: document.querySelector('#member-website').value.trim()
  };

  if (!payload.nombre || !payload.telefono || !payload.correo || !payload.edad || !payload.comuna || !payload.motivacion) {
    showStatus('Completa los campos obligatorios antes de enviar.', false);
    return;
  }

  if (!/^\+569\d{8}$/.test(payload.telefono)) {
    showStatus('Ingresa un teléfono válido con formato +569XXXXXXXX.', false);
    return;
  }

  try {
    setLoading(true);
    showStatus('Enviando solicitud...', true);

    const response = await fetch('/api/miembros', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No fue posible enviar la solicitud.');
    }

    form.reset();
    phone.value = PHONE_PREFIX;
    showStatus('Solicitud enviada correctamente. Nos contactaremos a la brevedad.', true);
  } catch (error) {
    showStatus(error.message || 'No fue posible enviar la solicitud.', false);
  } finally {
    setLoading(false);
  }
});

function openMemberPanel() {
  clearTimeout(memberPanelTimer);
  panel.classList.remove('is-hidden', 'is-closing');
  toggle?.setAttribute('aria-expanded', 'true');
  setTimeout(() => document.querySelector('#member-name')?.focus(), 120);
}

function closeMemberPanel() {
  if (!panel || panel.classList.contains('is-hidden')) return;

  clearTimeout(memberPanelTimer);
  panel.classList.add('is-closing');
  toggle?.setAttribute('aria-expanded', 'false');

  memberPanelTimer = setTimeout(() => {
    panel.classList.add('is-hidden');
    panel.classList.remove('is-closing');
  }, MEMBER_PANEL_ANIMATION_MS);
}

function setLoading(isLoading) {
  if (!submitButton) return;
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? 'Enviando...' : 'Enviar solicitud';
}

function showStatus(message, ok) {
  status.textContent = message;
  status.classList.toggle('success', ok);
  status.classList.toggle('error', !ok);
}