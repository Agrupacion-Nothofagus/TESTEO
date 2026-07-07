const headers = {
  'content-type': 'application/json; charset=utf-8'
};

const ESTADOS_SOCIO = ['activo', 'inactivo', 'suspendido'];
const CATEGORIAS_PERMITIDAS = ['Socio/a activo/a', 'Socio/a colaborador/a', 'Socio/a benefactor/a'];

export async function onRequest({ request, env }) {
  try {
    if (request.method === 'OPTIONS') return reply({ ok: true });
    if (request.method !== 'PATCH') return reply({ error: 'Método no permitido.' }, 405);

    const cfg = config(env);
    const session = await currentUser(request, cfg);
    allowMembersAccess(session, cfg);

    const body = await request.json().catch(() => ({}));
    const id = limpiar(body.id);
    if (!id) throw fail('Falta el ID del miembro.', 400);

    const payload = construirPayloadEdicion(body);
    if (!Object.keys(payload).length) throw fail('No hay campos para actualizar.', 400);
    payload.updated_at = new Date().toISOString();

    const res = await callSupabase(cfg, `/rest/v1/solicitudes_miembros?id=eq.${encodeURIComponent(id)}&estado=eq.miembro`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => []);
    if (!res.ok) throw fail(data.message || 'No fue posible actualizar el miembro.', res.status);

    const item = Array.isArray(data) ? data[0] : data;
    if (!item) throw fail('Miembro no encontrado.', 404);

    return reply({ ok: true, miembro: item });
  } catch (error) {
    return reply({ error: error.message || 'Error interno.' }, error.status || 500);
  }
}

function construirPayloadEdicion(body) {
  const payload = {};

  setText(payload, body, 'nombre');
  setText(payload, body, 'rut_documento');
  setText(payload, body, 'fecha_nacimiento');
  setText(payload, body, 'domicilio');
  setText(payload, body, 'comuna');
  setText(payload, body, 'telefono');
  setText(payload, body, 'correo', (value) => value.toLowerCase());
  setText(payload, body, 'ocupacion');
  setText(payload, body, 'observaciones_internas');
  setText(payload, body, 'observaciones', null, 'observaciones_internas');

  if (Object.prototype.hasOwnProperty.call(body, 'edad')) {
    const edad = Number(body.edad || 0);
    if (edad < 0 || edad > 120) throw fail('La edad ingresada no es válida.', 400);
    payload.edad = edad;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'categoria_socio')) {
    const categoria = limpiar(body.categoria_socio);
    if (categoria && !CATEGORIAS_PERMITIDAS.includes(categoria)) throw fail('Categoría de socio/a no válida.', 400);
    payload.categoria_socio = categoria;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'estado_socio')) {
    payload.estado_socio = normalizarEstadoSocio(body.estado_socio);
  }

  if (payload.telefono && !/^\+569\d{8}$/.test(payload.telefono)) {
    throw fail('El teléfono debe tener formato +569XXXXXXXX.', 400);
  }

  if (payload.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.correo)) {
    throw fail('El correo electrónico no es válido.', 400);
  }

  return payload;
}

function setText(payload, body, inputKey, transform = null, outputKey = inputKey) {
  if (!Object.prototype.hasOwnProperty.call(body, inputKey)) return;
  const value = limpiar(body[inputKey]);
  payload[outputKey] = transform ? transform(value) : value;
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

  if (!esAdmin && !esGestor) throw fail('No autorizado para editar miembros.', 403);
}

function normalizarEstadoSocio(estado) {
  const value = String(estado || '').trim().toLowerCase();
  if (value === 'active') return 'activo';
  if (value === 'inactive') return 'inactivo';
  if (value === 'suspended') return 'suspendido';
  return ESTADOS_SOCIO.includes(value) ? value : 'activo';
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
