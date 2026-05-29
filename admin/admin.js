import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_TABLE_PUBLICACIONES,
  supabaseConfigurado
} from '../scripts/supabase-config.js';

const loginPanel = document.querySelector('#login-panel');
const sessionPanel = document.querySelector('#session-panel');
const editorPanel = document.querySelector('#editor-panel');
const postsPanel = document.querySelector('#posts-panel');
const loginForm = document.querySelector('#login-form');
const loginStatus = document.querySelector('#login-status');
const sessionEmail = document.querySelector('#session-email');
const logoutButton = document.querySelector('#logout-button');
const formulario = document.querySelector('#publication-form');
const resultado = document.querySelector('#form-status');
const fecha = document.querySelector('#fecha');
const resetButton = document.querySelector('#reset-form');
const reloadButton = document.querySelector('#reload-posts');
const postsList = document.querySelector('#posts-list');
const formTitle = document.querySelector('#form-title');

let supabase = null;
let publicaciones = [];

if (fecha) fecha.valueAsDate = new Date();

if (!supabaseConfigurado()) {
  setStatus(loginStatus, 'Supabase aún no está configurado. Edita scripts/supabase-config.js con la URL y la anon key del proyecto.', false);
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  iniciarPanel();
}

async function iniciarPanel() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    mostrarPanel(data.session.user.email);
    await cargarPublicacionesAdmin();
  }
}

loginForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  if (!supabase) {
    setStatus(loginStatus, 'Supabase no está configurado.', false);
    return;
  }

  const email = document.querySelector('#login-email').value.trim();
  const password = document.querySelector('#login-password').value;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    mostrarPanel(data.user.email);
    setStatus(loginStatus, 'Ingreso correcto.', true);
    await cargarPublicacionesAdmin();
  } catch (error) {
    setStatus(loginStatus, error.message || 'No fue posible ingresar.', false);
  }
});

logoutButton.addEventListener('click', async () => {
  if (supabase) await supabase.auth.signOut();
  ocultarPanel();
});

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  if (!supabase) {
    setStatus(resultado, 'Supabase no está configurado.', false);
    return;
  }

  const id = document.querySelector('#publicacion-id').value.trim();
  const publicacion = obtenerDatosFormulario();

  try {
    let respuesta;

    if (id) {
      respuesta = await supabase
        .from(SUPABASE_TABLE_PUBLICACIONES)
        .update(publicacion)
        .eq('id', id)
        .select()
        .single();
    } else {
      respuesta = await supabase
        .from(SUPABASE_TABLE_PUBLICACIONES)
        .insert(publicacion)
        .select()
        .single();
    }

    if (respuesta.error) throw respuesta.error;

    setStatus(resultado, id ? 'Publicación actualizada correctamente.' : 'Publicación creada correctamente.', true);
    limpiarFormulario();
    await cargarPublicacionesAdmin();
  } catch (error) {
    setStatus(resultado, error.message || 'No fue posible guardar la publicación.', false);
  }
});

reloadButton.addEventListener('click', cargarPublicacionesAdmin);
resetButton.addEventListener('click', limpiarFormulario);

async function cargarPublicacionesAdmin() {
  postsList.innerHTML = '<p class="admin-status">Cargando publicaciones...</p>';

  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE_PUBLICACIONES)
      .select('*')
      .order('fecha', { ascending: false });

    if (error) throw error;

    publicaciones = data || [];
    renderizarListado();
  } catch (error) {
    postsList.innerHTML = `<p class="admin-status error">${escaparHTML(error.message || 'No fue posible cargar publicaciones.')}</p>`;
  }
}

function renderizarListado() {
  if (!publicaciones.length) {
    postsList.innerHTML = '<p class="admin-status">No hay publicaciones registradas.</p>';
    return;
  }

  postsList.innerHTML = publicaciones.map((item) => `
    <article class="post-admin-card">
      <div>
        <span class="post-admin-state ${item.estado === 'publicado' ? 'published' : 'draft'}">${escaparHTML(item.estado)}</span>
        <h3>${escaparHTML(item.titulo)}</h3>
        <p>${escaparHTML(item.resumen)}</p>
        <small>${escaparHTML(item.categoria || 'Institucional')} · ${formatearFecha(item.fecha)}</small>
      </div>
      <div class="post-admin-actions">
        <button type="button" onclick="editarPublicacion(${item.id})">Editar</button>
        <button type="button" class="danger" onclick="eliminarPublicacion(${item.id})">Eliminar</button>
      </div>
    </article>
  `).join('');
}

window.editarPublicacion = function editarPublicacion(id) {
  const item = publicaciones.find((publicacion) => Number(publicacion.id) === Number(id));
  if (!item) return;

  document.querySelector('#publicacion-id').value = item.id;
  document.querySelector('#estado').value = item.estado || 'borrador';
  document.querySelector('#fecha').value = item.fecha || '';
  document.querySelector('#categoria').value = item.categoria || '';
  document.querySelector('#titulo').value = item.titulo || '';
  document.querySelector('#resumen').value = item.resumen || '';
  document.querySelector('#contenido').value = item.contenido || '';
  document.querySelector('#imagen').value = item.imagen_url || '';
  document.querySelector('#enlace').value = item.enlace || '';
  formTitle.textContent = 'Editar publicación';
  window.scrollTo({ top: editorPanel.offsetTop - 80, behavior: 'smooth' });
};

window.eliminarPublicacion = async function eliminarPublicacion(id) {
  const item = publicaciones.find((publicacion) => Number(publicacion.id) === Number(id));
  const confirmar = confirm(`¿Eliminar la publicación "${item?.titulo || id}"?`);
  if (!confirmar) return;

  try {
    const { error } = await supabase
      .from(SUPABASE_TABLE_PUBLICACIONES)
      .delete()
      .eq('id', id);

    if (error) throw error;

    setStatus(resultado, 'Publicación eliminada correctamente.', true);
    await cargarPublicacionesAdmin();
  } catch (error) {
    setStatus(resultado, error.message || 'No fue posible eliminar la publicación.', false);
  }
};

function obtenerDatosFormulario() {
  return {
    estado: document.querySelector('#estado').value,
    fecha: document.querySelector('#fecha').value,
    categoria: document.querySelector('#categoria').value.trim(),
    titulo: document.querySelector('#titulo').value.trim(),
    resumen: document.querySelector('#resumen').value.trim(),
    contenido: document.querySelector('#contenido').value.trim(),
    imagen_url: document.querySelector('#imagen').value.trim(),
    enlace: document.querySelector('#enlace').value.trim()
  };
}

function limpiarFormulario() {
  formulario.reset();
  document.querySelector('#publicacion-id').value = '';
  fecha.valueAsDate = new Date();
  formTitle.textContent = 'Nueva publicación';
  resultado.textContent = '';
}

function mostrarPanel(email) {
  loginPanel.classList.add('is-hidden');
  sessionPanel.classList.remove('is-hidden');
  editorPanel.classList.remove('is-hidden');
  postsPanel.classList.remove('is-hidden');
  sessionEmail.textContent = email || 'Sesión activa';
}

function ocultarPanel() {
  loginPanel.classList.remove('is-hidden');
  sessionPanel.classList.add('is-hidden');
  editorPanel.classList.add('is-hidden');
  postsPanel.classList.add('is-hidden');
  sessionEmail.textContent = '—';
  publicaciones = [];
}

function setStatus(elemento, mensaje, success) {
  elemento.textContent = mensaje;
  elemento.classList.toggle('success', Boolean(success));
  elemento.classList.toggle('error', !success);
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return 'Sin fecha';
  const fechaObj = new Date(`${fechaISO}T12:00:00`);
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(fechaObj);
}

function escaparHTML(valor) {
  return String(valor || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
