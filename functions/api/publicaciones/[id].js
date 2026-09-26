const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestPut(context) {
  const { env, request, params } = context;

  if (!estaAutorizado(request, env)) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  try {
    const id = Number(params.id);
    const data = await request.json();
    const publicacion = limpiarPublicacion(data);

    validarPublicacion(publicacion, id);

    await actualizarPublicacion(env, id, publicacion);

    return new Response(JSON.stringify({ ok: true, id }), { headers: jsonHeaders });
  } catch (error) {
    return errorResponse('No fue posible actualizar la publicación.', error, 400);
  }
}

export async function onRequestDelete(context) {
  const { env, request, params } = context;

  if (!estaAutorizado(request, env)) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  try {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id < 1) throw new Error('ID inválido.');

    await eliminarPublicacion(env, id);

    return new Response(JSON.stringify({ ok: true, id }), { headers: jsonHeaders });
  } catch (error) {
    return errorResponse('No fue posible eliminar la publicación.', error, 400);
  }
}

function limpiarPublicacion(data) {
  return {
    titulo: String(data.titulo || '').trim(),
    resumen: String(data.resumen || '').trim(),
    contenido: String(data.contenido || '').trim(),
    categoria: String(data.categoria || 'Institucional').trim(),
    imagen: String(data.imagen || '').trim(),
    enlace: String(data.enlace || '').trim(),
    estado: ['publicado', 'borrador'].includes(data.estado) ? data.estado : 'borrador',
    fecha: String(data.fecha || '').trim()
  };
}

function validarPublicacion(publicacion, id) {
  if (!Number.isInteger(id) || id < 1) throw new Error('ID inválido.');
  if (!publicacion.titulo) throw new Error('El título es obligatorio.');
  if (!publicacion.resumen) throw new Error('El resumen es obligatorio.');
  if (!publicacion.fecha) throw new Error('La fecha es obligatoria.');
}

function estaAutorizado(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.replace('Bearer ', '').trim();
  return Boolean(env.ADMIN_TOKEN && token && token === env.ADMIN_TOKEN);
}

async function actualizarPublicacion(env, id, publicacion) {
  const response = await supabaseRequest(env, `?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ ...publicacion, actualizado_en: new Date().toISOString() })
  });
  if (!response.ok) throw await supabaseError(response);
}

async function eliminarPublicacion(env, id) {
  const response = await supabaseRequest(env, `?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  });
  if (!response.ok) throw await supabaseError(response);
}

function supabaseRequest(env, query, options) {
  const url = String(env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = String(env.SUPABASE_ADMIN_KEY || '');
  if (!url || !key) throw new Error('Faltan variables SUPABASE_URL o SUPABASE_ADMIN_KEY.');

  return fetch(`${url}/rest/v1/publicaciones${query}`, {
    ...options,
    headers: {
      ...adminHeaders(key),
      'content-type': 'application/json; charset=utf-8',
      ...(options.headers || {})
    }
  });
}

function adminHeaders(key) {
  return String(key).startsWith('sb_secret_')
    ? { apikey: key }
    : { apikey: key, authorization: `Bearer ${key}` };
}

async function supabaseError(response) {
  const data = await response.json().catch(() => ({}));
  return new Error(data.message || data.error || `Supabase respondió HTTP ${response.status}.`);
}

function errorResponse(mensaje, error, status = 500) {
  return new Response(JSON.stringify({
    error: mensaje,
    detalle: error.message
  }), {
    status,
    headers: jsonHeaders
  });
}
