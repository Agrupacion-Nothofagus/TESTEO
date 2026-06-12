const headers = {
  'content-type': 'application/json; charset=utf-8'
};

const ESTADOS_PERMITIDOS = ['pendiente', 'contactado', 'aceptado', 'rechazado', 'archivado'];

export async function onRequest({ request, env }) {
  try {
    if (request.method === 'OPTIONS') return reply({ ok: true });

    const cfg = config(env);

    if (request.method === 'POST') return createSolicitud(request, cfg);

    const session = await currentUser(request, cfg);
    allowMembersAccess(session, cfg);

    if (request.method === 'GET') return listSolicitudes(cfg);
    if (request.method === 'PATCH') return updateSolicitud(request, cfg);

    return reply({ error: 'Método no permitido.' }, 405);
  } catch (error) {
    return reply({ error: error.message || 'Error interno.' }, error.status || 500);
  }
}

function config(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ADMIN_KEY;
  const admins = String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!url || !key) throw fail('Faltan variables SUPABASE_URL o SUPABASE_ADMIN_KEY.', 500);

  return { url, key, admins };
}

async function createSolicitud(request, cfg) {
  const body = await request.json();

  const sitioWeb = String(body.sitio_web || '').trim();
  if (sitioWeb) return reply({ ok: true });

  const solicitud = {
    nombre: limpiar(body.nombre),
    telefono: limpiar(body.telefono),
    correo: limpiar(body.correo).toLowerCase(),
    edad: Number(body.edad || 0),
    comuna: limpiar(body.comuna),
    motivacion: limpiar(body.motivacion),
    intereses: limpiar(body.intereses),
    estado: 'pendiente',
    observaciones: ''
  };

  validarSolicitud(solicitud);

  const res = await callSupabase(cfg, '/rest/v1/solicitudes_miembros', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(solicitud)
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible guardar la solicitud.', res.status);

  return reply({ ok: true, solicitud: Array.isArray(data) ? data[0] : data }, 201);
}

async function listSolicitudes(cfg) {
  const res = await callSupabase(
    cfg,
    '/rest/v1/solicitudes_miembros?select=*&order=created_at.desc&limit=200'
  );

  const data = await res.json();
  if (!res.ok) throw fail(data.message || 'No fue posible listar solicitudes.', res.status);

  return reply({ solicitudes: data || [] });
}

async function updateSolicitud(request, cfg) {
  const body = await request.json();
  const id = limpiar(body.id);
  const estado = normalizarEstado(body.estado || 'pendiente');
  const observaciones = limpiar(body.observaciones);

  if (!id) throw fail('Falta el ID de la solicitud.', 400);

  const res = await callSupabase(cfg, `/rest/v1/solicitudes_miembros?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ estado, observaciones, updated_at: new Date().toISOString() })
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible actualizar la solicitud.', res.status);

  return reply({ solicitud: Array.isArray(data) ? data[0] : data });
}

async function currentUser(request, cfg) {
  const token = String(request.headers.get('authorization') || '')
    .replace(/^Bearer\s+/i, '')
    .trim();

  if (!token) throw fail('Sesión no enviada.', 401);

  const res = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: {
      apikey: cfg.key,
      authorization: authHeader(token)
    }
  });

  if (!res.ok) throw fail('Sesión inválida o expirada.', 401);
  return res.json();
}

function allowMembersAccess(user, cfg) {
  const email = String(user.email || '').toLowerCase();
  const rol = String(
    user.user_metadata?.rol
    || user.user_metadata?.role
    || user.app_metadata?.rol
    || user.app_metadata?.role
    || ''
  ).trim().toLowerCase();

  const esAdmin = rol === 'administrador' || rol === 'admin' || cfg.admins.includes(email);
  const esGestor = rol === 'gestor_miembros';

  if (!esAdmin && !esGestor) throw fail('No autorizado para gestionar miembros.', 403);
}

function validarSolicitud(solicitud) {
  if (!solicitud.nombre || !solicitud.telefono || !solicitud.correo || !solicitud.edad || !solicitud.comuna || !solicitud.motivacion) {
    throw fail('Faltan campos obligatorios.', 400);
  }

  if (!/^\+569\d{8}$/.test(solicitud.telefono)) {
    throw fail('El teléfono debe tener formato +569XXXXXXXX.', 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(solicitud.correo)) {
    throw fail('El correo electrónico no es válido.', 400);
  }

  if (solicitud.edad < 12 || solicitud.edad > 120) {
    throw fail('La edad ingresada no es válida.', 400);
  }
}

function normalizarEstado(estado) {
  const value = String(estado || '').trim().toLowerCase();
  return ESTADOS_PERMITIDOS.includes(value) ? value : 'pendiente';
}

function limpiar(value) {
  return String(value || '').trim().slice(0, 5000);
}

function callSupabase(cfg, path, options = {}) {
  return fetch(`${cfg.url}${path}`, {
    ...options,
    headers: {
      ...headers,
      apikey: cfg.key,
      authorization: authHeader(cfg.key),
      ...(options.headers || {})
    }
  });
}

function authHeader(token) {
  return `Bearer ${token}`;
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}