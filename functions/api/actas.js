const headers = { 'content-type': 'application/json; charset=utf-8' };

const ROLES_VER_ACTAS = ['administrador', 'admin', 'secretario', 'secretaria', 'secretariado', 'gestor_miembros'];
const ROLES_ADMIN_ACTAS = ['administrador', 'admin'];
const ORGANIZACION = 'Agrupación Nothofagus';

export async function onRequest({ request, env }) {
  try {
    if (request.method === 'OPTIONS') return reply({ ok: true });

    const cfg = config(env);
    const user = await currentUser(request, cfg);
    const permisos = permisosActas(user, cfg);

    if (!permisos.ver) throw fail('No autorizado para acceder a actas.', 403);

    if (request.method === 'GET') return listActas(cfg);
    if (request.method === 'POST' || request.method === 'PATCH') return upsertActa(request, cfg, user, permisos);
    if (request.method === 'DELETE') return deleteActa(request, cfg, permisos);

    return reply({ error: 'Método no permitido.' }, 405);
  } catch (error) {
    return reply({ error: error.message || 'Error interno.' }, error.status || 500);
  }
}

function config(env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_ADMIN_KEY;
  const admins = String(env.ADMIN_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!url || !key) throw fail('Faltan variables de entorno de Supabase.', 500);
  return { url, key, admins };
}

async function listActas(cfg) {
  const res = await callSupabase(cfg, '/rest/v1/actas?select=*&order=fecha.desc.nullslast&order=updated_at.desc&limit=500');
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible listar actas.', res.status);
  return reply({ actas: (data || []).map(fromDbActa) });
}

async function upsertActa(request, cfg, user, permisos) {
  if (!permisos.editar) throw fail('No autorizado para guardar actas.', 403);
  const body = await request.json().catch(() => ({}));
  const payload = toDbActa(body, user);

  const res = await callSupabase(cfg, '/rest/v1/actas?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible guardar el acta.', res.status);
  const item = Array.isArray(data) ? data[0] : data;
  return reply({ acta: fromDbActa(item) });
}

async function deleteActa(request, cfg, permisos) {
  if (!permisos.eliminar) throw fail('Solo un administrador puede eliminar actas.', 403);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) throw fail('Falta el ID del acta.', 400);

  const res = await callSupabase(cfg, `/rest/v1/actas?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible eliminar el acta.', res.status);
  return reply({ ok: true, acta: Array.isArray(data) ? fromDbActa(data[0]) : fromDbActa(data) });
}

async function currentUser(request, cfg) {
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

function permisosActas(user, cfg) {
  const email = String(user.email || '').toLowerCase();
  const rol = String(user.user_metadata?.rol || user.user_metadata?.role || user.app_metadata?.rol || user.app_metadata?.role || '').trim().toLowerCase();
  const admin = ROLES_ADMIN_ACTAS.includes(rol) || cfg.admins.includes(email);
  const ver = admin || ROLES_VER_ACTAS.includes(rol);
  return { ver, editar: ver, eliminar: admin, aprobar: admin };
}

function toDbActa(acta, user) {
  const nombreUsuario = obtenerNombreUsuario(user);
  return limpiarObjeto({
    id: limpiar(acta.id) || undefined,
    titulo: limpiar(acta.titulo) || 'Acta sin título',
    tipo_reunion: limpiar(acta.tipoReunion || acta.tipo_reunion) || 'ordinaria',
    fecha: limpiar(acta.fecha) || null,
    hora_inicio: limpiar(acta.horaInicio || acta.hora_inicio) || null,
    hora_termino: limpiar(acta.horaTermino || acta.hora_termino) || null,
    hora_cierre: limpiar(acta.horaCierre || acta.hora_cierre) || null,
    lugar_modalidad: limpiar(acta.lugarModalidad || acta.lugar_modalidad) || 'presencial',
    estado: normalizarEstado(acta.estado),
    organizacion: ORGANIZACION,
    asistentes: lista(acta.asistentes),
    agenda: lista(acta.agenda),
    desarrollo: limpiar(acta.desarrollo),
    acuerdos: lista(acta.acuerdos),
    compromisos_pendientes: lista(acta.compromisosPendientes || acta.compromisos_pendientes),
    observaciones_finales: limpiar(acta.observacionesFinales || acta.observaciones_finales),
    firmas_asistentes: lista(acta.firmasAsistentes || acta.firmas_asistentes),
    redactado_por: limpiar(acta.redactadoPor || acta.redactado_por),
    cargo_redactor: limpiar(acta.cargoRedactor || acta.cargo_redactor),
    firma_secretaria: limpiar(acta.firmaSecretaria || acta.firma_secretaria),
    firma_presidencia: limpiar(acta.firmaPresidencia || acta.firma_presidencia),
    creado_por: limpiar(acta.creadoPor || acta.creado_por) || nombreUsuario,
    actualizado_por: nombreUsuario,
    updated_at: new Date().toISOString()
  });
}

function fromDbActa(row = {}) {
  if (!row) return null;
  return {
    id: row.id || '',
    organizacion: row.organizacion || ORGANIZACION,
    folio: '',
    tipoReunion: row.tipo_reunion || 'ordinaria',
    titulo: row.titulo || 'Acta sin título',
    fecha: row.fecha || '',
    horaInicio: row.hora_inicio || '',
    horaTermino: row.hora_termino || '',
    horaCierre: row.hora_cierre || '',
    lugarModalidad: row.lugar_modalidad || 'presencial',
    asistentes: lista(row.asistentes),
    agenda: lista(row.agenda),
    desarrollo: row.desarrollo || '',
    acuerdos: lista(row.acuerdos),
    compromisosPendientes: lista(row.compromisos_pendientes),
    observacionesFinales: row.observaciones_finales || '',
    firmasAsistentes: lista(row.firmas_asistentes),
    redactadoPor: row.redactado_por || '',
    cargoRedactor: row.cargo_redactor || '',
    firmaSecretaria: row.firma_secretaria || '',
    firmaPresidencia: row.firma_presidencia || '',
    estado: row.estado || 'borrador',
    creadoPor: row.creado_por || '',
    actualizadoPor: row.actualizado_por || '',
    creadoEn: row.created_at || '',
    actualizadoEn: row.updated_at || ''
  };
}

function callSupabase(cfg, path, options = {}) {
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

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizarEstado(value) {
  const estado = limpiar(value || 'borrador').toLowerCase();
  return ['borrador', 'finalizada', 'aprobada'].includes(estado) ? estado : 'borrador';
}

function limpiar(value) { return String(value || '').trim(); }
function lista(value) { return Array.isArray(value) ? value : []; }
function limpiarObjeto(obj) { return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)); }
function obtenerNombreUsuario(user) { return user?.user_metadata?.nombre || user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || 'Usuario interno'; }
