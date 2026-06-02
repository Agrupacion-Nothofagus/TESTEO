const toggle = document.querySelector('[data-contact-toggle]');
const panel = document.querySelector('#contact-form-panel');
const form = document.querySelector('#contact-form');
const status = document.querySelector('#contact-status');
const phone = document.querySelector('#contact-phone');

const CONTACT_EMAIL = 'contacto@agrupacionnothofagus.cl';
const PHONE_PREFIX = '+569';

toggle?.addEventListener('click', () => {
  const isHidden = panel.classList.toggle('is-hidden');
  toggle.setAttribute('aria-expanded', String(!isHidden));

  if (!isHidden) {
    setTimeout(() => document.querySelector('#contact-name')?.focus(), 80);
  }
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

form?.addEventListener('submit', (event) => {
  event.preventDefault();

  const nombre = document.querySelector('#contact-name').value.trim();
  const telefono = document.querySelector('#contact-phone').value.trim();
  const correo = document.querySelector('#contact-email').value.trim();
  const asunto = document.querySelector('#contact-subject').value.trim();
  const mensaje = document.querySelector('#contact-message').value.trim();

  if (!nombre || !telefono || !correo || !asunto || !mensaje) {
    showStatus('Completa todos los campos antes de enviar.', false);
    return;
  }

  const cuerpo = [
    `Nombre: ${nombre}`,
    `Teléfono: ${telefono}`,
    `Correo: ${correo}`,
    '',
    'Mensaje:',
    mensaje
  ].join('\n');

  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  window.location.href = mailto;

  showStatus('Se abrirá tu aplicación de correo para enviar el mensaje.', true);
});

function showStatus(message, ok) {
  status.textContent = message;
  status.classList.toggle('success', ok);
  status.classList.toggle('error', !ok);
}
