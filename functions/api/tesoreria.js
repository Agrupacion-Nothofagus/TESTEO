const headers = { 'content-type': 'application/json; charset=utf-8' };
const TABLE = 'tesoreria_movimientos';
const ROLES_TESORERIA = ['administrador', 'admin', 'tesorero', 'tesorera'];

export async function onRequest({ request, env }) {
  try {
    if (request.method === 'OPTIONS') return reply({ ok: true });

    const cfg = getConfig(env);
    const user = await getCurrentUser(request, cfg);
    const permisos = getPermisos(user, cfg);

    if (!permisos.tesoreria) throw fail('No autorizado para acceder a Tesorería.', 403);

    if (request.method === 'GET') return listMovimientos(cfg);
    if (request.method === 'POST') return saveMovimiento(request, cfg, user);
    if (request.method === 'DELETE') return deleteMovimiento(request, cfg);

    return reply({ error: 'Método no permitido.' }, 405);
  } catch (error) {
    return reply({ error: error.message || 'Error interno.' }, error.status || 500);
  }
}

function getConfig(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ADMIN_KEY;
  const admins = String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  if (!url || !key) throw fail('Faltan variables SUPABASE_URL o SUPABASE_ADMIN_KEY.', 500);
  return { url, key, admins };
}

async function listMovimientos(cfg) {
  const res = await supabaseFetch(cfg, `/rest/v1/${TABLE}?select=*&order=fecha.desc&order=created_at.desc&limit=1000`);
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible listar movimientos de Tesorería.', res.status);

  return reply({ movimientos: (data || []).map(fromDb) });
}

async function saveMovimiento(request, cfg, user) {
  const body = await request.json().catch(() => ({}));
  const movimiento = toDb(body, user);

  const res = await supabaseFetch(cfg, `/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(movimiento)
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible guardar el movimiento.', res.status);

  return reply({ movimiento: fromDb(Array.isArray(data) ? data[0] : data) });
}

async function deleteMovimiento(request, cfg) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw fail('Falta el ID del movimiento.', 400);

  const res = await supabaseFetch(cfg, `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible eliminar el movimiento.', res.status);

  return reply({ ok: true, movimiento: fromDb(Array.isArray(data) ? data[0] : data) });
}

async function getCurrentUser(request, cfg) {
  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw fail('Sesión no enviada.', 401);

  const res = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) throw fail('Sesión inválida o expirada.', 401);
  return res.json();
}

function getPermisos(user, cfg) {
  const email = String(user.email || '').toLowerCase();
  const rol = String(
    user.user_metadata?.rol
    || user.user_metadata?.role
    || user.app_metadata?.rol
    || user.app_metadata?.role
    || ''
  ).trim().toLowerCase();

  return { tesoreria: ROLES_TESORERIA.includes(rol) || cfg.admins.includes(email) };
}

function toDb(item, user) {
  const tipo = normalizarTipo(item.tipo);
  const monto = Number(item.monto || 0);
  if (!tipo) throw fail('Tipo de movimiento inválido.', 400);
  if (!monto || monto <= 0) throw fail('El monto debe ser mayor a 0.', 400);

  const nombre = getNombreUsuario(user);

  return {
    tipo,
    fecha: limpiar(item.fecha) || new Date().toISOString().slice(0, 10),
    descripcion: limpiar(item.descripcion) || 'Movimiento sin descripción',
    monto,
    observaciones: limpiar(item.observaciones),
    creado_por: limpiar(item.creadoPor || item.creado_por) || nombre,
    actualizado_por: nombre,
    updated_at: new Date().toISOString()
  };
}

function fromDb(row = {}) {
  if (!row) return null;

  return {
    id: row.id || '',
    tipo: row.tipo || '',
    fecha: row.fecha || '',
    descripcion: row.descripcion || '',
    monto: Number(row.monto || 0),
    observaciones: row.observaciones || '',
    creadoPor: row.creado_por || '',
    actualizadoPor: row.actualizado_por || '',
    creadoEn: row.created_at || '',
    actualizadoEn: row.updated_at || ''
  };
}

function supabaseFetch(cfg, path, options = {}) {
  return fetch(`${cfg.url}${path}`, {
    ...options,
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
}

function normalizarTipo(value) {
  const tipo = limpiar(value).toLowerCase();
  return ['ingreso', 'egreso'].includes(tipo) ? tipo : '';
}

function limpiar(value) {
  return String(value || '').trim();
}

function getNombreUsuario(user) {
  return user?.user_metadata?.nombre
    || user?.user_metadata?.name
    || user?.user_metadata?.full_name
    || user?.email
    || 'Usuario interno';
}

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
