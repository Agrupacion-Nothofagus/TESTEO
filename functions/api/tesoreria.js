const headers = { 'content-type': 'application/json; charset=utf-8' };
const TABLE = 'tesoreria_movimientos';
const BUCKET = 'tesoreria-comprobantes';
const ROLES_TESORERIA = ['administrador', 'admin', 'tesorero', 'tesorera'];
const TIPOS_ARCHIVO_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024;

export async function onRequest({ request, env }) {
  try {
    if (request.method === 'OPTIONS') return reply({ ok: true });

    const cfg = getConfig(env);
    const user = await getCurrentUser(request, cfg);
    const permisos = getPermisos(user, cfg);

    if (!permisos.tesoreria) throw fail('No autorizado para acceder a Tesorería.', 403);

    if (request.method === 'GET') return listMovimientos(cfg);
    if (request.method === 'POST') return saveMovimiento(request, cfg, user);
    if (request.method === 'DELETE') return deleteMovimiento(request, cfg, user);

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

  const movimientos = await Promise.all((data || []).map((row) => fromDb(row, cfg)));
  return reply({ movimientos });
}

async function saveMovimiento(request, cfg, user) {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  const { fields, file } = contentType.includes('multipart/form-data')
    ? await readMultipart(request)
    : { fields: await request.json().catch(() => ({})), file: null };

  const archivo = file ? await uploadComprobante(cfg, file, fields.tipo) : null;
  const movimiento = toDb(fields, user, archivo);

  const res = await supabaseFetch(cfg, `/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(movimiento)
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) {
    if (archivo?.archivo_path) await deleteStorageObject(cfg, archivo.archivo_path).catch(() => null);
    throw fail(data.message || 'No fue posible guardar el movimiento.', res.status);
  }

  return reply({ movimiento: await fromDb(Array.isArray(data) ? data[0] : data, cfg) });
}

async function deleteMovimiento(request, cfg, user) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw fail('Falta el ID del movimiento.', 400);

  const auditoria = {
    eliminado: true,
    eliminado_por: getNombreUsuario(user),
    eliminado_email: limpiar(user?.email).toLowerCase(),
    eliminado_en: new Date().toISOString(),
    actualizado_por: getNombreUsuario(user),
    updated_at: new Date().toISOString()
  };

  const res = await supabaseFetch(cfg, `/rest/v1/${TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(auditoria)
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible marcar el movimiento como eliminado.', res.status);

  const row = Array.isArray(data) ? data[0] : data;
  return reply({ ok: true, movimiento: await fromDb(row, cfg) });
}

async function readMultipart(request) {
  const formData = await request.formData();
  const fields = {
    tipo: limpiar(formData.get('tipo')),
    fecha: limpiar(formData.get('fecha')),
    descripcion: limpiar(formData.get('descripcion')),
    monto: limpiar(formData.get('monto')),
    observaciones: limpiar(formData.get('observaciones'))
  };

  const file = formData.get('archivo');
  const hasFile = file && typeof file.arrayBuffer === 'function' && Number(file.size || 0) > 0;
  return { fields, file: hasFile ? file : null };
}

async function uploadComprobante(cfg, file, tipoMovimiento) {
  const tipoArchivo = String(file.type || '').toLowerCase();
  const size = Number(file.size || 0);

  if (!TIPOS_ARCHIVO_PERMITIDOS.includes(tipoArchivo)) {
    throw fail('El comprobante debe ser PDF, JPG o PNG.', 400);
  }

  if (size > MAX_ARCHIVO_BYTES) {
    throw fail('El comprobante no puede superar 10 MB.', 400);
  }

  const tipo = normalizarTipo(tipoMovimiento) || 'movimiento';
  const year = new Date().getFullYear();
  const safeName = sanitizeFileName(file.name || `comprobante-${Date.now()}`);
  const path = `${tipo}/${year}/${crypto.randomUUID()}-${safeName}`;

  const res = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${encodeStoragePath(path)}`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${cfg.key}`,
      'content-type': tipoArchivo,
      'x-upsert': 'false'
    },
    body: await file.arrayBuffer()
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(data.message || 'No fue posible subir el comprobante.', res.status);

  return {
    archivo_path: path,
    archivo_nombre: file.name || safeName,
    archivo_tipo: tipoArchivo,
    archivo_tamano: size
  };
}

async function createSignedUrl(cfg, path) {
  if (!path) return '';

  const res = await fetch(`${cfg.url}/storage/v1/object/sign/${BUCKET}/${encodeStoragePath(path)}`, {
    method: 'POST',
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ expiresIn: 60 * 60 })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return '';

  const signed = data.signedURL || data.signedUrl || '';
  if (!signed) return '';
  return signed.startsWith('http') ? signed : `${cfg.url}/storage/v1${signed}`;
}

async function deleteStorageObject(cfg, path) {
  if (!path) return;

  await fetch(`${cfg.url}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: {
      apikey: cfg.key,
      authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ prefixes: [path] })
  });
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

function toDb(item, user, archivo = null) {
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
    archivo_path: archivo?.archivo_path || null,
    archivo_nombre: archivo?.archivo_nombre || null,
    archivo_tipo: archivo?.archivo_tipo || null,
    archivo_tamano: archivo?.archivo_tamano || null,
    eliminado: false,
    eliminado_por: null,
    eliminado_email: null,
    eliminado_en: null,
    creado_por: limpiar(item.creadoPor || item.creado_por) || nombre,
    actualizado_por: nombre,
    updated_at: new Date().toISOString()
  };
}

async function fromDb(row = {}, cfg) {
  if (!row) return null;

  const archivoPath = row.archivo_path || '';

  return {
    id: row.id || '',
    tipo: row.tipo || '',
    fecha: row.fecha || '',
    descripcion: row.descripcion || '',
    monto: Number(row.monto || 0),
    observaciones: row.observaciones || '',
    archivoPath,
    archivoNombre: row.archivo_nombre || '',
    archivoTipo: row.archivo_tipo || '',
    archivoTamano: Number(row.archivo_tamano || 0),
    archivoUrl: archivoPath ? await createSignedUrl(cfg, archivoPath) : '',
    eliminado: Boolean(row.eliminado),
    eliminadoPor: row.eliminado_por || '',
    eliminadoEmail: row.eliminado_email || '',
    eliminadoEn: row.eliminado_en || '',
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

function sanitizeFileName(value) {
  const cleaned = String(value || 'comprobante')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 90);

  return cleaned || 'comprobante';
}

function encodeStoragePath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
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
