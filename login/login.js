import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  supabaseConfigurado
} from '../scripts/supabase-config.js';

const loginForm = document.querySelector('#login-form');
const loginStatus = document.querySelector('#login-status');

let supabase = null;

if (!supabaseConfigurado()) {
  setStatus('Supabase aún no está configurado. Revisa scripts/supabase-config.js.', false);
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  verificarSesionActiva();
}

async function verificarSesionActiva() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    window.location.href = '../admin/';
  }
}

loginForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  if (!supabase) {
    setStatus('Supabase no está configurado.', false);
    return;
  }

  const email = document.querySelector('#login-email').value.trim();
  const password = document.querySelector('#login-password').value;

  try {
    setStatus('Verificando credenciales...', true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) throw error;

    setStatus('Ingreso correcto. Redirigiendo al panel...', true);
    window.location.href = '../admin/';
  } catch (error) {
    setStatus(error.message || 'No fue posible iniciar sesión.', false);
  }
});

function setStatus(mensaje, success) {
  loginStatus.textContent = mensaje;
  loginStatus.classList.toggle('success', Boolean(success));
  loginStatus.classList.toggle('error', !success);
}
