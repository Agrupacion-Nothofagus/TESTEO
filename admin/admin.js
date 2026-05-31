import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_TABLE_PUBLICACIONES,
  SUPABASE_BUCKET_PUBLICACIONES,
  supabaseConfigurado
} from '../scripts/supabase-config.js';

const adminStatus = document.querySelector('#admin-status');
const sessionPanel = document.querySelector('#session-panel');
const editorPanel = document.querySelector('#editor-panel');
const postsPanel = document.querySelector('#posts-panel');
const usersPanel = document.querySelector('#users-panel');
const sessionEmail = document.querySelector('#session-email');
const logoutButton = document.querySelector('#logout-button');
const formulario = document.querySelector('#publication-form');
const resultado = document.querySelector('#form-status');
const fecha = document.querySelector('#fecha');
const resetButton = document.querySelector('#reset-form');
const reloadButton = document.querySelector('#reload-posts');
const postsList = document.querySelector('#posts-list');
const formTitle = document.querySelector('#form-title');
const sidebarLinks = document.querySelectorAll('[data-admin-view]');
const adminViews = document.querySelectorAll('.admin-view');
const viewTitle = document.querySelector('#admin-view-title');
const viewDescription = document.querySelector('#admin-view-description');
const imagenFile = document.querySelector('#imagen-file');
const imagenInput = document.querySelector('#imagen');
const imagePreviewWrap = document.querySelector('#image-preview-wrap');
const imagePreview = document.querySelector('#image-preview');

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];

let supabase = null;
let publicaciones = [];

if (fecha) fecha.valueAsDate = new Date();

sidebarLinks.forEach((button) => {
  button.addEventListener('click', () => cambiarVista(button.dataset.adminView));
});

imagenFile.addEventListener('change', () => {
  const file = imagenFile.files?.[0];

  if (!file) {
    ocultarPreviewImagen();
    return;
  }

  const validacion = validarImagen(file);
  if (!validacion.ok) {
    setStatus(resultado, validacion.mensaje, false);
    imagenFile.value = '';
    ocultarPreviewImagen();
    return;
  }

  imagePreview.src = URL.createObjectURL(file);
  imagePreviewWrap.classList.remove('is-hidden');
  setStatus(resultado, 'Imagen seleccionada. Se subirá al guardar la publicación.', true);
});

if (!supabaseConfigurado()) {
  setStatus(adminStatus, 'Supabase aún no está configurado. Revisa scripts/supabase-config.js.', false);
} else {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  iniciarPanel();
}

async function iniciarPanel() {
  const { data } = await supabase.auth.getSession();

  if (!data.session) {
    window.location.href = '../login/';
    return;
  }

  mostrarPanel(data.session.user.email);
  await cargarPublicacionesAdmin();
}

logoutButton.addEventListener('click', async () => {
  if (supabase) await supabase.auth.signOut();
  window.location.href = '../login/';
});

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  if (!supabase) {
    setStatus(resultado, 'Supabase no está configurado.', false);
    return;
  }

  const id = document.querySelector('#publicacion-id').value.trim();

  try {
    setStatus(resultado, 'Guardando publicación...', true);

    const nuevaImagenURL = await subirImagenSiExiste();
    if (nuevaImagenURL) {
      imagenInput.value = nuevaImagenURL;
    }

    const publicacion = obtenerDatosFormulario();
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
    cambiarVista('gestion-view');
  } catch (error) {
    setStatus(resultado, error.message || 'No fue posible guardar la publicación.', false);
  }
});

reloadButton.addEventListener('click', cargarPublicacionesAdmin);
resetButton.addEventListener('click', limpiarFormulario);

async function subirImagenSiExiste() {
  const file = imagenFile.files?.[0];
  if (!file) return '';

  const validacion = validarImagen(file);
  if (!validacion.ok) throw new Error(validacion.mensaje);

  const extension = file.type === 'image/png' ? 'png' : 'jpg';
  const nombreSeguro = crearSlug(document.querySelector('#titulo').value || 'publicacion');
  const timestamp = Date.now();
  const rutaArchivo = `publicaciones/${nombreSeguro}-${timestamp}.${extension}`;

  setStatus(resultado, 'Subiendo imagen...', true);

  const { error: uploadError } = await supabase
    .storage
    .from(SUPABASE_BUCKET_PUBLICACIONES)
    .upload(rutaArchivo, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type
    });

  if (uploadError) throw uploadError;

  const { data } = supabase
    .storage
    .from(SUPABASE_BUCKET_PUBLICACIONES)
    .getPublicUrl(rutaArchivo);

  if (!data?.publicUrl) throw new Error('No fue posible obtener la URL pública de la imagen.');

  return data.publicUrl;
}

function validarImagen(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      ok: false,
      mensaje: 'Formato no permitido. Solo se aceptan imágenes JPG o PNG.'
    };
  }

  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return {
      ok: false,
      mensaje: 'La imagen supera los 5 MB. Usa una imagen más liviana.'
    };
  }

  return { ok: true, mensaje: '' };
}

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
      ${item.imagen_url ? `<img class="post-admin-thumb" src="${escaparAtributo(item.imagen_url)}" alt="Imagen de ${escaparAtributo(item.titulo)}">` : ''}
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
  imagenInput.value = item.imagen_url || '';
  document.querySelector('#enlace').value = item.enlace || '';
  formTitle.textContent = 'Editar publicación';

  if (item.imagen_url) {
    imagePreview.src = item.imagen_url;
    imagePreviewWrap.classList.remove('is-hidden');
  } else {
    ocultarPreviewImagen();
  }

  cambiarVista('nueva-view');
  window.scrollTo({ top: 0, behavior: 'smooth' });
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

    setStatus(adminStatus, 'Publicación eliminada correctamente.', true);
    await cargarPublicacionesAdmin();
  } catch (error) {
    setStatus(adminStatus, error.message || 'No fue posible eliminar la publicación.', false);
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
    imagen_url: imagenInput.value.trim(),
    enlace: document.querySelector('#enlace').value.trim()
  };
}

function limpiarFormulario() {
  formulario.reset();
  document.querySelector('#publicacion-id').value = '';
  fecha.valueAsDate = new Date();
  formTitle.textContent = 'Nueva publicación';
  resultado.textContent = '';
  ocultarPreviewImagen();
}

function ocultarPreviewImagen() {
  imagePreview.removeAttribute('src');
  imagePreviewWrap.classList.add('is-hidden');
}

function mostrarPanel(email) {
  sessionPanel.classList.remove('is-hidden');
  editorPanel.classList.remove('is-hidden');
  postsPanel.classList.remove('is-hidden');
  usersPanel.classList.remove('is-hidden');
  sessionEmail.textContent = email || 'Sesión activa';
  setStatus(adminStatus, 'Sesión verificada. Panel administrativo disponible.', true);
}

function cambiarVista(viewId) {
  sidebarLinks.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.adminView === viewId);
  });

  adminViews.forEach((view) => {
    const activa = view.id === viewId;
    view.classList.toggle('is-active', activa);

    if (activa) {
      viewTitle.textContent = view.dataset.viewTitle || 'Panel administrativo';
      viewDescription.textContent = view.dataset.viewDescription || '';
    }
  });
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

function crearSlug(texto) {
  return String(texto || 'publicacion')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'publicacion';
}

function escaparHTML(valor) {
  return String(valor || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escaparAtributo(valor) {
  return escaparHTML(valor);
}
