const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const incluirBorradores = url.searchParams.get('admin') === '1';

  const query = incluirBorradores
    ? `SELECT * FROM publicaciones ORDER BY fecha DESC, id DESC`
    : `SELECT * FROM publicaciones WHERE estado = 'publicado' ORDER BY fecha DESC, id DESC`;

  try {
    const { results } = await env.DB.prepare(query).all();
    return new Response(JSON.stringify(results || []), { headers: jsonHeaders });
  } catch (error) {
    return errorResponse('No fue posible cargar las publicaciones.', error);
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!estaAutorizado(request, env)) {
    return new Response(JSON.stringify({ error: 'No autorizado.' }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  try {
    const data = await request.json();
    const publicacion = limpiarPublicacion(data);

    validarPublicacion(publicacion);

    const resultado = await env.DB.prepare(`
      INSERT INTO publicaciones
      (titulo, resumen, contenido, categoria, imagen, enlace, estado, fecha)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
      .bind(
        publicacion.titulo,
        publicacion.resumen,
        publicacion.contenido,
        publicacion.categoria,
        publicacion.imagen,
        publicacion.enlace,
        publicacion.estado,
        publicacion.fecha
      )
      .run();

    return new Response(JSON.stringify({ ok: true, id: resultado.meta.last_row_id }), {
      status: 201,
      headers: jsonHeaders
    });
  } catch (error) {
    return errorResponse('No fue posible crear la publicación.', error, 400);
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

function validarPublicacion(publicacion) {
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
