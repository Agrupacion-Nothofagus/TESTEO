import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const VIEW_ID = 'members-list-view';

instalarRegistroRapidoMiembros();

function instalarRegistroRapidoMiembros() {
  cargarEstilos();
  const timer = setInterval(() => {
    const view = document.getElementById(VIEW_ID);
    if (!view) return;
    clearInterval(timer);
    instalarPanel(view);
  }, 250);
}

function cargarEstilos() {
  if (document.querySelector('link[href^="miembros-quick-create.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'miembros-quick-create.css?v=20260706';
  document.head.appendChild(link);
}

function instalarPanel(view) {
  if (view.querySelector('[data-member-quick-create-panel]')) return;

  const heading = view.querySelector('.members-heading-row');
  const reloadButton = view.querySelector('[data-reload-members]');
  if (heading && reloadButton && !heading.querySelector('[data-open-member-quick-create]')) {
    const actions = document.createElement('div');
    actions.className = 'member-heading-actions';
    reloadButton.parentElement?.removeChild(reloadButton);
    actions.appendChild(crearBotonAgregar());
    actions.appendChild(reloadButton);
    heading.appendChild(actions);
  }

  const filterBar = view.querySelector('[data-member-filter-bar]');
  const panel = document.createElement('div');
  panel.className = 'member-quick-create-panel';
  panel.dataset.memberQuickCreatePanel = 'true';
  panel.innerHTML = panelHTML();
  filterBar?.before(panel);

  view.querySelector('[data-open-member-quick-create]')?.addEventListener('click', () => togglePanel(panel));
  panel.querySelector('[data-close-member-quick-create]')?.addEventListener('click', () => cerrarPanel(panel));
  panel.querySelector('[data-member-quick-birth]')?.addEventListener('change', actualizarEdad);
  panel.querySelector('[data-member-quick-form]')?.addEventListener('submit', guardarMiembroRapido);
}

function crearBotonAgregar() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-admin-button';
  button.dataset.openMemberQuickCreate = 'true';
  button.textContent = 'Agregar miembro';
  return button;
}

function panelHTML() {
  return `
    <div>
      <p class="section-tag">Registro directo</p>
      <h4>Agregar miembro</h4>
      <p>Completa solo los antecedentes esenciales para ingresar a una persona directamente como socio/a activo/a.</p>
    </div>

    <form class="member-quick-create-form" data-member-quick-form>
      <div class="member-quick-grid">
        <label>Nombre completo
          <input type="text" data-member-quick="nombre" placeholder="Nombre y apellido" required>
        </label>
        <label>RUT o documento
          <input type="text" data-member-quick="rut_documento" placeholder="12.345.678-9" required>
        </label>
        <label>Fecha de nacimiento
          <input type="date" data-member-quick="fecha_nacimiento" data-member-quick-birth required>
        </label>
        <label>Edad
          <input type="number" data-member-quick="edad" min="12" max="120" placeholder="Edad" required>
        </label>
      </div>

      <div class="member-quick-grid">
        <label>Teléfono
          <input type="tel" data-member-quick="telefono" value="+569" inputmode="tel" required>
        </label>
        <label>Correo electrónico
          <input type="email" data-member-quick="correo" placeholder="correo@ejemplo.cl" required>
        </label>
        <label>Comuna o ciudad
          <input type="text" data-member-quick="comuna" placeholder="Ej: Temuco" required>
        </label>
        <label>Ocupación
          <input type="text" data-member-quick="ocupacion" placeholder="Estudiante, trabajador/a, etc." required>
        </label>
      </div>

      <div class="member-quick-grid">
        <label>Categoría de socio/a
          <select data-member-quick="categoria_socio" required>
            <option value="Socio/a activo/a">Socio/a activo/a</option>
            <option value="Socio/a colaborador/a">Socio/a colaborador/a</option>
            <option value="Socio/a benefactor/a">Socio/a benefactor/a</option>
          </select>
        </label>
        <label>Estado del socio/a
          <select data-member-quick="estado_socio" required>
            <option value="activo">Activo/a</option>
            <option value="inactivo">Inactivo/a</option>
            <option value="suspendido">Suspendido/a</option>
          </select>
        </label>
        <label>Fecha de ingreso
          <input type="date" data-member-quick="fecha_ingreso" value="${new Date().toISOString().slice(0, 10)}">
        </label>
      </div>

      <label>Domicilio, opcional
        <input type="text" data-member-quick="domicilio" placeholder="Dirección o sector">
      </label>

      <label>Observaciones internas, opcional
        <textarea data-member-quick="observaciones_internas" placeholder="Notas administrativas del registro directo"></textarea>
      </label>

      <div class="member-quick-actions-row">
        <button type="button" class="secondary-admin-button" data-close-member-quick-create>Cancelar</button>
        <button type="submit" class="secondary-admin-button">Guardar miembro</button>
      </div>

      <p class="member-quick-status" data-member-quick-status aria-live="polite"></p>
    </form>
  `;
}

function togglePanel(panel) {
  panel.classList.toggle('is-open');
  if (panel.classList.contains('is-open')) {
    panel.querySelector('[data-member-quick="nombre"]')?.focus();
  }
}

function cerrarPanel(panel) {
  panel.classList.remove('is-open');
  limpiarStatus(panel);
}

function actualizarEdad(event) {
  const form = event.target.closest('form');
  const edadInput = form?.querySelector('[data-member-quick="edad"]');
  const birth = event.target.value;
  if (!birth || !edadInput) return;
  const age = calcularEdad(birth);
  if (age > 0) edadInput.value = String(age);
}

async function guardarMiembroRapido(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const panel = form.closest('[data-member-quick-create-panel]');
  const status = form.querySelector('[data-member-quick-status]');

  try {
    setStatus(status, 'Guardando miembro...', true);
    const payload = obtenerPayload(form);
    validarPayload(payload);
    const token = await obtenerToken();

    const response = await fetch('/api/miembros', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'No fue posible crear el miembro.');

    setStatus(status, 'Miembro agregado correctamente.', true);
    form.reset();
    form.querySelector('[data-member-quick="telefono"]').value = '+569';
    form.querySelector('[data-member-quick="fecha_ingreso"]').value = new Date().toISOString().slice(0, 10);
    document.querySelector('#members-list-view [data-reload-members]')?.click();
    window.setTimeout(() => cerrarPanel(panel), 900);
  } catch (error) {
    setStatus(status, error.message || 'No fue posible guardar el miembro.', false);
  }
}

function obtenerPayload(form) {
  const payload = {
    registro_directo: true,
    estado: 'miembro',
    menor_edad: false,
    declaracion_final: true,
    areas_participacion: ['Registro administrativo'],
    vinculo_organizacion: 'Registro directo desde panel administrativo',
    motivacion: 'Registro directo de socio/a realizado desde el panel administrativo.',
    aporte: 'Registro administrativo interno.'
  };

  form.querySelectorAll('[data-member-quick]').forEach((input) => {
    payload[input.dataset.memberQuick] = input.value.trim();
  });

  payload.edad = Number(payload.edad || 0);
  payload.correo = String(payload.correo || '').toLowerCase();
  payload.estado_socio = payload.estado_socio || 'activo';
  return payload;
}

function validarPayload(payload) {
  const required = ['nombre', 'rut_documento', 'fecha_nacimiento', 'edad', 'telefono', 'correo', 'comuna', 'ocupacion', 'categoria_socio'];
  if (required.some((key) => !String(payload[key] || '').trim())) {
    throw new Error('Completa todos los campos obligatorios.');
  }
  if (!/^\+569\d{8}$/.test(payload.telefono)) {
    throw new Error('El teléfono debe usar formato +569XXXXXXXX.');
  }
}

async function obtenerToken() {
  if (!client) throw new Error('Supabase no está configurado.');
  const { data } = await client.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Sesión no disponible. Vuelve a iniciar sesión.');
  return token;
}

function calcularEdad(fechaNacimiento) {
  const birth = new Date(fechaNacimiento);
  if (Number.isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function setStatus(element, message, ok) {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('success', Boolean(ok));
  element.classList.toggle('error', !ok);
}

function limpiarStatus(panel) {
  const status = panel?.querySelector('[data-member-quick-status]');
  if (!status) return;
  status.textContent = '';
  status.classList.remove('success', 'error');
}
