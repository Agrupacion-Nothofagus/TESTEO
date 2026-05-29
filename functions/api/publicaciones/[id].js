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

    await env.DB.prepare(`
      UPDATE publicaciones
      SET titulo = ?, resumen = ?, contenido = ?, categoria = ?, imagen = ?, enlace = ?, estado = ?, fecha = ?, actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
      .bind(
        publicacion.titulo,
        publicacion.resumen,
        publicacion.contenido,
        publicacion.categoria,
        publicacion.imagen,
        publicacion.enlace,
        publicacion.estado,
        publicacion.fecha,
        id
      )
      .run();

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

    await env.DB.prepare('DELETE FROM publicaciones WHERE id = ?').bind(id).run();

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

function errorResponse(mensaje, error, status = 500) {
  return new Response(JSON.stringify({
    error: mensaje,
    detalle: error.message
  }), {
    status,
    headers: jsonHeaders
  });
}
