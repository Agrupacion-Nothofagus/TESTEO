import './tesoreria-cuotas-retired-flow.js?v=20260710';
import './tesoreria-cuotas-comprobante-detalles.js?v=20260710';
import './tesoreria-ingresos-cuotas.js?v=20260710';
import './dashboard-admin-panel-update.js?v=20260709';
import './tesoreria-general-saas.js?v=20260710';
import './tesoreria-cuotas-nomina-fix.js?v=20260709';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const usersViewButton = document.querySelector('[data-admin-view="usuarios-view"]');
const usersPanel = document.querySelector('#users-panel');

if (!window.__nothofagusAdminUsersAccessFix) {
  window.__nothofagusAdminUsersAccessFix = true;
  verificarAccesoUsuarios();
}

async function verificarAccesoUsuarios() {
  if (!supabaseConfigurado() || !usersViewButton || !usersPanel) return;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const sessionResponse = await client.auth.getSession();
  const token = sessionResponse.data?.session?.access_token;

  if (!token) return;

  try {
    const response = await fetch('/api/users', {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) return;
    usersViewButton.classList.remove('is-hidden');
    usersPanel.classList.remove('is-hidden');
  } catch {
    // Si el endpoint no autoriza, se mantiene oculto por seguridad.
  }
}
