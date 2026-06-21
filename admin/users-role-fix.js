import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const ROLE_VALUE = 'gestor_miembros';
const ROLE_LABEL = 'Secretariado';
const usersList = document.querySelector('#users-list');
const userCreateRole = document.querySelector('#user-role');
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let syncing = false;
let timer = null;

installCreateOption();
queueSync();

if (usersList) {
  const observer = new MutationObserver(() => queueSync());
  observer.observe(usersList, { childList: true, subtree: true });
}

function installCreateOption() {
  ensureRoleOption(userCreateRole, false);
}

function queueSync() {
  if (!client || !usersList || syncing) return;
  window.clearTimeout(timer);
  timer = window.setTimeout(syncUserRoleSelectors, 180);
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
    const rolesById = new Map((data.users || []).map((user) => [String(user.id || ''), String(user.rol || '')]));

    document.querySelectorAll('[data-user-card]').forEach((card) => {
      const id = String(card.dataset.userCard || '');
      const select = card.querySelector('[data-user-role]');
      const role = rolesById.get(id);

      if (!select) return;

      ensureRoleOption(select, role === ROLE_VALUE);

      if (role === ROLE_VALUE && select.value !== ROLE_VALUE) {
        select.value = ROLE_VALUE;
      }
    });
  } finally {
    syncing = false;
  }
}

function ensureRoleOption(select, selected) {
  if (!select) return;

  let option = select.querySelector(`option[value="${ROLE_VALUE}"]`);

  if (!option) {
    option = document.createElement('option');
    option.value = ROLE_VALUE;
    select.appendChild(option);
  }

  option.textContent = ROLE_LABEL;
  option.selected = Boolean(selected);
}
