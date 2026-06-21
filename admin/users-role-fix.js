import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const ROLE_OPTIONS = [
  { value: 'administrador', label: 'Administrador' },
  { value: 'editor', label: 'Editor' },
  { value: 'lector', label: 'Lectura' },
  { value: 'gestor_miembros', label: 'Secretariado' }
];

const usersList = document.querySelector('#users-list');
const userCreateRole = document.querySelector('#user-role');
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let syncing = false;
let applyingDomChanges = false;
let timer = null;

installCreateOptions();
queueSync();

if (usersList) {
  const observer = new MutationObserver(() => {
    if (applyingDomChanges) return;
    queueSync();
  });

  observer.observe(usersList, { childList: true, subtree: false });

  usersList.addEventListener('change', (event) => {
    const select = event.target.closest('[data-user-role]');
    if (!select) return;
    select.dataset.userRoleDirty = 'true';
  });
}

function installCreateOptions() {
  ensureRoleOptions(userCreateRole, userCreateRole?.value || 'editor');
}

function queueSync() {
  if (!client || !usersList || syncing) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(syncUserRoleSelectors, 220);
}

async function syncUserRoleSelectors() {
  if (!client || !usersList || syncing) return;

  syncing = true;

  try {
    const sessionResponse = await client.auth.getSession();
    const token = sessionResponse.data?.session?.access_token;
    if (!token) return;

    const response = await fetch('/api/users', {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) return;

    const data = await response.json().catch(() => ({}));
    const rolesById = new Map((data.users || []).map((user) => [String(user.id || ''), normalizeRole(user.rol)]));

    applyingDomChanges = true;

    document.querySelectorAll('[data-user-card]').forEach((card) => {
      const id = String(card.dataset.userCard || '');
      const select = card.querySelector('[data-user-role]');
      const storedRole = rolesById.get(id);

      if (!select) return;

      ensureRoleOptions(select, select.dataset.userRoleDirty === 'true' ? select.value : storedRole);
    });
  } finally {
    applyingDomChanges = false;
    syncing = false;
  }
}

function ensureRoleOptions(select, selectedValue) {
  if (!select) return;

  const normalizedSelected = normalizeRole(selectedValue || select.value || 'editor');

  ROLE_OPTIONS.forEach((role) => {
    let option = select.querySelector(`option[value="${role.value}"]`);

    if (!option) {
      option = document.createElement('option');
      option.value = role.value;
      select.appendChild(option);
    }

    if (option.textContent !== role.label) {
      option.textContent = role.label;
    }
  });

  if (normalizedSelected && select.value !== normalizedSelected) {
    select.value = normalizedSelected;
  }
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();

  if (role === 'admin') return 'administrador';
  if (role === 'lectura') return 'lector';
  if (role === 'secretariado') return 'gestor_miembros';

  return ROLE_OPTIONS.some((option) => option.value === role) ? role : 'editor';
}
