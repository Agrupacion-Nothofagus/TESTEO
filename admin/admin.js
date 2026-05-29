const tokenForm = document.querySelector('#token-form');
const tokenInput = document.querySelector('#admin-token');
const tokenStatus = document.querySelector('#token-status');
const formulario = document.querySelector('#publication-form');
const resultado = document.querySelector('#form-status');
const fecha = document.querySelector('#fecha');
const postsList = document.querySelector('#posts-list');
const reloadButton = document.querySelector('#reload-posts');
const resetButton = document.querySelector('#reset-form');
const formTitle = document.querySelector('#form-title');

let adminToken = sessionStorage.getItem('nothofagus_admin_token') || '';
let publicaciones = [];

if (fecha) {
  fecha.valueAsDate = new Date();
}

if (adminToken && tokenInput) {
  tokenInput.value = adminToken;
  setStatus(tokenStatus, 'Panel activado en esta sesión.', true);
  cargarPublicacionesAdmin();
}

tokenForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  adminToken = tokenInput.value.trim();

  if (!adminToken) {
    setStatus(tokenStatus, 'Debes ingresar el token administrativo.', false);
    return;
  }

  sessionStorage.setItem('nothofagus_admin_token', adminToken);
  setStatus(tokenStatus, 'Panel activado. Cargando publicaciones...', true);
  await cargarPublicacionesAdmin();
});

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  if (!adminToken) {
    setStatus(resultado, 'Primero debes activar el panel con el token administrativo.', false);
    return;
  }

  const id = document.querySelector('#publicacion-id').value.trim();
  const publicacion = obtenerDatosFormulario();
  const metodo = id ? 'PUT' : 'POST';
  const url = id ? `/api/publicaciones/${id}` : '/api/publicaciones';

  try {
    const respuesta = await fetch(url, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify(publicacion)
    });

    const data = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(data.detalle || data.error || 'No fue posible guardar la publicación.');
    }

    setStatus(resultado, id ? 'Publicación actualizada correctamente.' : 'Publicación creada correctamente.', true);
    limpiarFormulario();
    await cargarPublicacionesAdmin();
  } catch (error) {
    setStatus(resultado, error.message, false);
  }
});

reloadButton.addEventListener('click', cargarPublicacionesAdmin);
resetButton.addEventListener('click', limpiarFormulario);

async function cargarPublicacionesAdmin() {
  if (!adminToken) return;

  postsList.innerHTML = '<p class="admin-status">Cargando publicaciones...</p>';

  try {
    const respuesta = await fetch('/api/publicaciones?admin=1', {
      cache: 'no-store',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(data.detalle || data.error || 'No fue posible cargar publicaciones.');
    }

    publicaciones = data;
    renderizarListado();
  } catch (error) {
    postsList.innerHTML = `<p class="admin-status error">${escaparHTML(error.message)}</p>`;
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
  const item = publicaciones.find((publicacion) => publicacion.id === id);
  if (!item) return;

  document.querySelector('#publicacion-id').value = item.id;
  document.querySelector('#estado').value = item.estado || 'borrador';
  document.querySelector('#fecha').value = item.fecha || '';
  document.querySelector('#categoria').value = item.categoria || '';
  document.querySelector('#titulo').value = item.titulo || '';
  document.querySelector('#resumen').value = item.resumen || '';
  document.querySelector('#contenido').value = item.contenido || '';
  document.querySelector('#imagen').value = item.imagen || '';
  document.querySelector('#enlace').value = item.enlace || '';
  formTitle.textContent = 'Editar publicación';
  window.scrollTo({ top: formulario.offsetTop - 90, behavior: 'smooth' });
};

window.eliminarPublicacion = async function eliminarPublicacion(id) {
  const item = publicaciones.find((publicacion) => publicacion.id === id);
  const confirmar = confirm(`¿Eliminar la publicación "${item?.titulo || id}"?`);

  if (!confirmar) return;

  try {
    const respuesta = await fetch(`/api/publicaciones/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });

    const data = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(data.detalle || data.error || 'No fue posible eliminar la publicación.');
    }

    setStatus(resultado, 'Publicación eliminada correctamente.', true);
    await cargarPublicacionesAdmin();
  } catch (error) {
    setStatus(resultado, error.message, false);
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
    imagen: document.querySelector('#imagen').value.trim(),
    enlace: document.querySelector('#enlace').value.trim()
  };
}

function limpiarFormulario() {
  formulario.reset();
  document.querySelector('#publicacion-id').value = '';
  fecha.valueAsDate = new Date();
  formTitle.textContent = 'Nueva publicación';
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
