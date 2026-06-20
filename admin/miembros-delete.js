import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const ARCHIVE_STATUS = 'archivado';
let pendingMemberButton = null;
let membersFetchPatched = false;

installMembersFetchFilter();
installDeleteStyles();
installDeleteModal();
installMemberDeleteObserver();
installMemberDeleteEvents();

function installMembersFetchFilter() {
  if (membersFetchPatched || window.__nothofagusMembersFetchFilter) return;
  membersFetchPatched = true;
  window.__nothofagusMembersFetchFilter = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const response = await nativeFetch(input, init);
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || 'GET').toUpperCase();

    if (!url.includes('/api/miembros') || method !== 'GET') return response;

    try {
      const data = await response.clone().json();
      if (!Array.isArray(data.solicitudes)) return response;

      const filtered = {
        ...data,
        solicitudes: data.solicitudes.filter((item) => String(item.estado || '').toLowerCase() !== ARCHIVE_STATUS)
      };

      return new Response(JSON.stringify(filtered), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch {
      return response;
    }
  };
}

function installDeleteStyles() {
  if (document.querySelector('#member-delete-styles')) return;

  const style = document.createElement('style');
  style.id = 'member-delete-styles';
  style.textContent = `
    .member-delete-button {
      width: 100%;
      border: 0;
      border-radius: 999px;
      padding: 13px 20px;
      background: #b42318;
      color: #fff;
      font: inherit;
      font-weight: 900;
      cursor: pointer;
      transition: transform 0.2s ease, background 0.2s ease;
    }

    .member-delete-button:hover,
    .member-delete-button:focus-visible {
      background: #8f1d15;
      transform: translateY(-2px);
    }

    .member-record-actions .member-delete-button {
      margin-top: 2px;
    }
  `;
  document.head.appendChild(style);
}

function installDeleteModal() {
  if (document.querySelector('#delete-member-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'delete-member-modal';
  modal.className = 'delete-user-modal is-hidden';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="delete-user-modal__backdrop" data-member-delete-cancel></div>
    <section class="delete-user-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="delete-member-title">
      <p class="section-tag">Confirmar eliminación</p>
      <h3 id="delete-member-title">Eliminar registro</h3>
      <p id="delete-member-message" class="delete-user-modal__message"></p>
      <div class="delete-user-modal__actions">
        <button type="button" class="delete-user-modal__cancel" data-member-delete-cancel>Cancelar</button>
        <button type="button" class="delete-user-modal__accept" data-member-delete-accept>Eliminar</button>
      </div>
    </section>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll('[data-member-delete-cancel]').forEach((button) => {
    button.addEventListener('click', closeDeleteModal);
  });

  modal.querySelector('[data-member-delete-accept]')?.addEventListener('click', async () => {
    const button = pendingMemberButton;
    closeDeleteModal();
    if (!button) return;
    await archiveMemberRecord(button);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDeleteModal();
  });
}

function installMemberDeleteObserver() {
  enhanceDeleteButtons();

  const observer = new MutationObserver(() => enhanceDeleteButtons());
  observer.observe(document.body, { childList: true, subtree: true });
}

function installMemberDeleteEvents() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-delete-member-record]');
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    pendingMemberButton = button;
    showDeleteModal(button);
  }, true);
}

function enhanceDeleteButtons() {
  document.querySelectorAll('.member-request-card').forEach((card) => {
    const actions = card.querySelector('.member-request-actions');
    if (!actions || actions.querySelector('[data-delete-member-record]')) return;

    const id = card.getAttribute('data-member-card');
    const name = card.querySelector('h4')?.textContent?.trim() || 'esta solicitud';
    const button = createDeleteButton(id, name, 'solicitud');
    actions.appendChild(button);
  });

  document.querySelectorAll('.member-row-card').forEach((card) => {
    const actions = card.querySelector('.member-record-actions');
    if (!actions || actions.querySelector('[data-delete-member-record]')) return;

    const id = card.getAttribute('data-member-card');
    const name = card.querySelector('.member-row-summary span')?.textContent?.trim() || 'este socio/a';
    const button = createDeleteButton(id, name, 'miembro');
    actions.appendChild(button);
  });
}

function createDeleteButton(id, name, type) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'member-delete-button';
  button.dataset.deleteMemberRecord = id || '';
  button.dataset.memberName = name || '';
  button.dataset.memberDeleteType = type;
  button.textContent = type === 'miembro' ? 'Eliminar socio/a' : 'Eliminar solicitud';
  return button;
}

function showDeleteModal(button) {
  const modal = document.querySelector('#delete-member-modal');
  const messageBox = document.querySelector('#delete-member-message');
  const title = document.querySelector('#delete-member-title');
  if (!modal || !messageBox || !title) return;

  const type = button.dataset.memberDeleteType;
  const name = button.dataset.memberName || 'este registro';

  title.textContent = type === 'miembro' ? 'Eliminar socio/a' : 'Eliminar solicitud de socio/a';
  messageBox.textContent = type === 'miembro'
    ? `¿Eliminar el socio/a ${name}? Esta acción retirará el registro del panel de miembros y no se puede deshacer desde esta vista.`
    : `¿Eliminar la solicitud de socio/a ${name}? Esta acción retirará la postulación del panel y no se puede deshacer desde esta vista.`;

  modal.classList.remove('is-hidden');
  modal.setAttribute('aria-hidden', 'false');
  modal.querySelector('[data-member-delete-cancel]')?.focus();
}

function closeDeleteModal() {
  const modal = document.querySelector('#delete-member-modal');
  if (!modal) return;

  modal.classList.add('is-hidden');
  modal.setAttribute('aria-hidden', 'true');
  pendingMemberButton = null;
}

async function archiveMemberRecord(button) {
  const id = button.dataset.deleteMemberRecord;
  const type = button.dataset.memberDeleteType;
  const name = button.dataset.memberName || '';

  if (!id) return;

  try {
    showActiveStatus(type === 'miembro' ? 'Eliminando socio/a...' : 'Eliminando solicitud...', true);

    await api('/api/miembros', {
      method: 'PATCH',
      body: JSON.stringify({
        id,
        estado: ARCHIVE_STATUS,
        observaciones_internas: `Registro eliminado administrativamente desde el panel. ${name}`.trim()
      })
    });

    showActiveStatus(type === 'miembro' ? 'Socio/a eliminado del panel.' : 'Solicitud eliminada del panel.', true);
    document.querySelector('[data-member-status-view].is-active [data-reload-members]')?.click();
  } catch (error) {
    showActiveStatus(error.message || 'No fue posible eliminar el registro.', false);
  }
}

async function api(url, options = {}) {
  if (!client) throw new Error('Supabase no está configurado.');

  const session = await client.auth.getSession();
  const token = session.data?.session?.access_token;
  if (!token) throw new Error('Sesión no disponible. Vuelve a iniciar sesión.');

  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Error de solicitud.');
  return data;
}

function showActiveStatus(message, ok) {
  const view = document.querySelector('[data-member-status-view].is-active');
  const status = view?.querySelector('[data-members-status]');
  if (!status) return;

  status.textContent = message;
  status.classList.toggle('success', ok);
  status.classList.toggle('error', !ok);
}
