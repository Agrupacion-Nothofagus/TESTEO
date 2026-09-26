const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const TABLE = 'tesoreria_cuotas_estados';
const MEMBERS_TABLE = 'tesoreria_cuotas_miembros';
const STATES = ['pagado', 'pendiente', 'atrasado', 'sin_registro'];
const READ_ROLES = ['administrador', 'admin', 'tesorero', 'tesorera', 'secretario', 'secretaria', 'secretariado', 'miembro', 'socio', 'socia', 'member'];
const WRITE_ROLES = ['administrador', 'admin', 'tesorero', 'tesorera'];
const MEMBER_ROLES = ['miembro', 'socio', 'socia', 'member'];

export async function onRequest({ request, env }) {
  try {
    if (request.method === 'OPTIONS') return reply({ ok: true });
    const cfg = getConfig(env);
    const user = await getCurrentUser(request, cfg);
    const permissions = getPermissions(user, cfg);
    if (!permissions.read) throw fail('No autorizado para acceder al historial de estados.', 403);

    if (request.method === 'GET') return await listChanges(request, cfg, user, permissions);
    if (!permissions.write) throw fail('Solo administración o tesorería pueden modificar estados de cuotas.', 403);
    if (request.method === 'POST') return await createChange(request, cfg, user);
    if (request.method === 'PATCH') return await updateChange(request, cfg, user);
    if (request.method === 'DELETE') return await deleteChange(request, cfg, user);
    return reply({ error: 'Método no permitido.' }, 405);
  } catch (error) {
    return reply({ error: error.message || 'Error interno.' }, error.status || 500);
  }
}

function getConfig(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ADMIN_KEY;
  const admins = String(env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!url || !key) throw fail('Faltan variables SUPABASE_URL o SUPABASE_ADMIN_KEY.', 500);
  return { url, key, admins };
}

async function listChanges(request, cfg, user, permissions) {
  const url = new URL(request.url);
  const year = getYear(url.searchParams.get('anio'));
  let memberFilter = '';
  if (permissions.ownOnly) {
    const member = await getMemberByEmail(cfg, user?.email);
    if (!member?.id) return reply({ anio: year, cambios: [] });
    memberFilter = `&member_id=eq.${encodeURIComponent(member.id)}`;
  }
  const res = await supabaseFetch(cfg, `/rest/v1/${TABLE}?select=*&anio=eq.${year}${memberFilter}&order=created_at.desc&limit=2000`);
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible listar el historial de estados.', res.status);
  return reply({ anio: year, cambios: (data || []).map(fromDb) });
}

async function createChange(request, cfg, user) {
  const body = await request.json().catch(() => ({}));
  const memberId = limpiar(body.member_id || body.memberId);
  if (!memberId) throw fail('Falta el integrante asociado al cambio.', 400);
  const member = await getMemberById(cfg, memberId);
  if (!member) throw fail('El integrante indicado no existe.', 404);

  const payload = toDb(body, user, member, false);
  const res = await supabaseFetch(cfg, `/rest/v1/${TABLE}`, {
    method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible registrar el cambio de estado.', res.status);
  return reply({ cambio: fromDb(Array.isArray(data) ? data[0] : data) }, 201);
}

async function updateChange(request, cfg, user) {
  const body = await request.json().catch(() => ({}));
  const id = limpiar(body.id || new URL(request.url).searchParams.get('id'));
  if (!id) throw fail('Falta el ID del cambio de estado.', 400);
  const current = await getChangeById(cfg, id);
  if (!current) throw fail('El cambio de estado no existe.', 404);
  if (current.eliminado) throw fail('No se puede editar un cambio eliminado.', 409);

  const payload = {
    fecha: normalizarFecha(body.fecha || current.fecha),
    estado_anterior: normalizarEstado(body.estado_anterior || body.estadoAnterior || current.estado_anterior),
    estado_nuevo: normalizarEstado(body.estado_nuevo || body.estadoNuevo || current.estado_nuevo),
    observacion: limpiar(body.observacion ?? current.observacion).slice(0, 1200),
    actualizado_por: getUserName(user),
    updated_at: new Date().toISOString()
  };
  if (!payload.estado_anterior || !payload.estado_nuevo) throw fail('Estado de cuota inválido.', 400);
  if (payload.estado_anterior === payload.estado_nuevo) throw fail('El nuevo estado debe ser distinto al estado anterior.', 400);
  const res = await supabaseFetch(cfg, `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible actualizar el cambio de estado.', res.status);
  return reply({ cambio: fromDb(Array.isArray(data) ? data[0] : data) });
}

async function deleteChange(request, cfg, user) {
  const id = limpiar(new URL(request.url).searchParams.get('id'));
  if (!id) throw fail('Falta el ID del cambio de estado.', 400);
  const payload = {
    eliminado: true,
    eliminado_por: getUserName(user),
    eliminado_email: limpiar(user?.email).toLowerCase(),
    eliminado_en: new Date().toISOString(),
    actualizado_por: getUserName(user),
    updated_at: new Date().toISOString()
  };
  const res = await supabaseFetch(cfg, `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible eliminar el cambio de estado.', res.status);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw fail('El cambio de estado no existe.', 404);
  return reply({ ok: true, cambio: fromDb(row) });
}

function toDb(item, user, member) {
  const anio = getYear(item.anio);
  const mes = Number(item.mes);
  const previous = normalizarEstado(item.estado_anterior || item.estadoAnterior);
  const next = normalizarEstado(item.estado_nuevo || item.estadoNuevo);
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw fail('Mes inválido.', 400);
  if (!previous || !next) throw fail('Estado de cuota inválido.', 400);
  if (previous === next) throw fail('El nuevo estado debe ser distinto al estado anterior.', 400);
  const name = getUserName(user);
  return {
    member_id: member.id,
    member_nombre: limpiar(member.nombre) || 'Integrante',
    anio,
    mes,
    fecha: normalizarFecha(item.fecha),
    estado_anterior: previous,
    estado_nuevo: next,
    observacion: limpiar(item.observacion).slice(0, 1200),
    eliminado: false,
    creado_por: name,
    creado_email: limpiar(user?.email).toLowerCase(),
    actualizado_por: name,
    updated_at: new Date().toISOString()
  };
}

function fromDb(row = {}) {
  return {
    id: row.id || '',
    memberId: row.member_id || '',
    memberNombre: row.member_nombre || 'Integrante',
    anio: Number(row.anio || 0),
    mes: Number(row.mes || 0),
    fecha: row.fecha || '',
    estadoAnterior: row.estado_anterior || '',
    estadoNuevo: row.estado_nuevo || '',
    observacion: row.observacion || '',
    eliminado: Boolean(row.eliminado),
    eliminadoPor: row.eliminado_por || '',
    eliminadoEmail: row.eliminado_email || '',
    eliminadoEn: row.eliminado_en || '',
    creadoPor: row.creado_por || '',
    creadoEmail: row.creado_email || '',
    actualizadoPor: row.actualizado_por || '',
    creadoEn: row.created_at || '',
    actualizadoEn: row.updated_at || ''
  };
}

async function getMemberById(cfg, id) {
  const res = await supabaseFetch(cfg, `/rest/v1/${MEMBERS_TABLE}?select=id,nombre&id=eq.${encodeURIComponent(id)}&limit=1`);
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible validar el integrante.', res.status);
  return Array.isArray(data) ? data[0] : null;
}

async function getMemberByEmail(cfg, email) {
  const value = limpiar(email).toLowerCase();
  if (!value) return null;
  const res = await supabaseFetch(cfg, `/rest/v1/${MEMBERS_TABLE}?select=id&correo=ilike.${encodeURIComponent(value)}&limit=1`);
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible identificar al integrante.', res.status);
  return Array.isArray(data) ? data[0] : null;
}

async function getChangeById(cfg, id) {
  const res = await supabaseFetch(cfg, `/rest/v1/${TABLE}?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible consultar el cambio de estado.', res.status);
  return Array.isArray(data) ? data[0] : null;
}

async function getCurrentUser(request, cfg) {
  const token = limpiar(request.headers.get('authorization')).replace(/^Bearer\s+/i, '').trim();
  if (!token) throw fail('Sesión no enviada.', 401);
  const res = await fetch(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.key, authorization: `Bearer ${token}` } });
  if (!res.ok) throw fail('Sesión inválida o expirada.', 401);
  return res.json();
}

function getPermissions(user, cfg) {
  const email = limpiar(user?.email).toLowerCase();
  const role = limpiar(user?.user_metadata?.rol || user?.user_metadata?.role || user?.app_metadata?.rol || user?.app_metadata?.role).toLowerCase();
  const admin = cfg.admins.includes(email);
  return { read: admin || READ_ROLES.includes(role), write: admin || WRITE_ROLES.includes(role), ownOnly: MEMBER_ROLES.includes(role) && !admin };
}

function supabaseFetch(cfg, path, options = {}) {
  return fetch(`${cfg.url}${path}`, {
    ...options,
    headers: { ...adminHeaders(cfg.key), 'content-type': 'application/json', ...(options.headers || {}) }
  });
}

function adminHeaders(key) {
  return String(key).startsWith('sb_secret_') ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };
}

function getYear(value) {
  const year = Number(value || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw fail('Año inválido.', 400);
  return year;
}

function normalizarFecha(value) {
  const date = limpiar(value) || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail('Fecha inválida.', 400);
  return date;
}

function normalizarEstado(value) {
  const status = limpiar(value).toLowerCase();
  return STATES.includes(status) ? status : '';
}

function getUserName(user) {
  return user?.user_metadata?.nombre || user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || 'Usuario interno';
}

function limpiar(value) { return String(value ?? '').trim(); }
function reply(body, status = 200) { return new Response(JSON.stringify(body), { status, headers }); }
function fail(message, status = 400) { const error = new Error(message); error.status = status; return error; }
