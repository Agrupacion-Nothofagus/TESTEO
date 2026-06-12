const headers = {
  'content-type': 'application/json; charset=utf-8'
};

const ESTADOS_PERMITIDOS = ['pendiente', 'contactado', 'rechazado', 'miembro'];
const ESTADOS_LEGACY = ['aceptado', 'archivado'];
const ESTADOS_SOCIO = ['activo', 'inactivo', 'suspendido'];
const CATEGORIAS_PERMITIDAS = ['Socio/a activo/a', 'Socio/a colaborador/a', 'Socio/a benefactor/a'];

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

  const sitioWeb = limpiar(body.sitio_web);
  if (sitioWeb) return reply({ ok: true });

  const areas = normalizarLista(body.areas_participacion);
  const solicitud = {
    nombre: limpiar(body.nombre),
    rut_documento: limpiar(body.rut_documento),
    fecha_nacimiento: limpiar(body.fecha_nacimiento),
    edad: Number(body.edad || 0),
    menor_edad: Boolean(body.menor_edad),
    domicilio: limpiar(body.domicilio),
    comuna: limpiar(body.comuna),
    telefono: limpiar(body.telefono),
    correo: limpiar(body.correo).toLowerCase(),
    ocupacion: limpiar(body.ocupacion),
    adulto_nombre: limpiar(body.adulto_nombre),
    adulto_rut: limpiar(body.adulto_rut),
    adulto_vinculo: limpiar(body.adulto_vinculo),
    adulto_telefono: limpiar(body.adulto_telefono),
    adulto_correo: limpiar(body.adulto_correo).toLowerCase(),
    adulto_declaracion: Boolean(body.adulto_declaracion),
    categoria_socio: normalizarCategoria(body.categoria_socio),
    vinculo_organizacion: limpiar(body.vinculo_organizacion),
    motivacion: limpiar(body.motivacion),
    areas_participacion: areas,
    otro_area: limpiar(body.otro_area),
    aporte: limpiar(body.aporte),
    experiencia_previa: Boolean(body.experiencia_previa),
    experiencia_descripcion: limpiar(body.experiencia_descripcion),
    declaracion_final: Boolean(body.declaracion_final),
    intereses: areas.join(', '),
    estado: 'pendiente',
    observaciones: '',
    observacion_rechazo: '',
    observaciones_internas: '',
    estado_socio: 'activo',
    fecha_ingreso: null
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
  const res = await callSupabase(cfg, '/rest/v1/solicitudes_miembros?select=*&order=created_at.desc&limit=300');
  const data = await res.json();
  if (!res.ok) throw fail(data.message || 'No fue posible listar solicitudes.', res.status);

  return reply({ solicitudes: (data || []).map(normalizarRegistroSalida) });
}

async function updateSolicitud(request, cfg) {
  const body = await request.json();
  const id = limpiar(body.id);
  const estado = normalizarEstado(body.estado || 'pendiente');

  if (!id) throw fail('Falta el ID de la solicitud.', 400);

  const actual = await getSolicitudById(cfg, id);
  const payload = construirPayloadActualizacion(body, estado, actual);

  validarCambioEstado(payload, actual);

  const res = await callSupabase(cfg, `/rest/v1/solicitudes_miembros?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible actualizar la solicitud.', res.status);

  return reply({ solicitud: Array.isArray(data) ? normalizarRegistroSalida(data[0]) : normalizarRegistroSalida(data) });
}

async function getSolicitudById(cfg, id) {
  const res = await callSupabase(cfg, `/rest/v1/solicitudes_miembros?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible revisar la solicitud.', res.status);
  const item = Array.isArray(data) ? data[0] : data;
  if (!item) throw fail('Solicitud no encontrada.', 404);
  return normalizarRegistroSalida(item);
}

function construirPayloadActualizacion(body, estado, actual) {
  const observacionRechazo = limpiar(body.observacion_rechazo || body.rejectionObservation || '');
  const observacionesInternas = limpiar(body.observaciones_internas || body.internalNotes || body.observaciones || '');
  const estadoSocio = normalizarEstadoSocio(body.estado_socio || body.memberStatus || actual.estado_socio || 'activo');

  const payload = {
    estado,
    observaciones: observacionesInternas,
    observaciones_internas: observacionesInternas,
    estado_socio: estadoSocio,
    updated_at: new Date().toISOString()
  };

  if (estado === 'rechazado') {
    payload.observacion_rechazo = observacionRechazo;
  }

  if (estado === 'miembro') {
    payload.fecha_ingreso = actual.fecha_ingreso || new Date().toISOString();
  }

  return payload;
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
  const requeridos = [
    solicitud.nombre,
    solicitud.rut_documento,
    solicitud.fecha_nacimiento,
    solicitud.edad,
    solicitud.domicilio,
    solicitud.comuna,
    solicitud.telefono,
    solicitud.correo,
    solicitud.ocupacion,
    solicitud.categoria_socio,
    solicitud.vinculo_organizacion,
    solicitud.motivacion,
    solicitud.aporte
  ];

  if (requeridos.some((item) => !String(item || '').trim())) throw fail('Faltan campos obligatorios.', 400);
  if (!solicitud.declaracion_final) throw fail('Debes aceptar la declaración final.', 400);
  if (!/^\+569\d{8}$/.test(solicitud.telefono)) throw fail('El teléfono debe tener formato +569XXXXXXXX.', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(solicitud.correo)) throw fail('El correo electrónico no es válido.', 400);
  if (solicitud.edad < 12 || solicitud.edad > 120) throw fail('La edad ingresada no es válida.', 400);
  if (!solicitud.areas_participacion.length) throw fail('Debes seleccionar al menos un área de participación.', 400);

  if (solicitud.areas_participacion.includes('Otro') && !solicitud.otro_area) throw fail('Debes especificar el área marcada como Otro.', 400);
  if (solicitud.experiencia_previa && !solicitud.experiencia_descripcion) throw fail('Debes describir brevemente la experiencia previa.', 400);

  if (solicitud.menor_edad) validarAdultoResponsable(solicitud);
}

function validarAdultoResponsable(solicitud) {
  const adulto = [solicitud.adulto_nombre, solicitud.adulto_rut, solicitud.adulto_vinculo, solicitud.adulto_telefono, solicitud.adulto_correo];
  if (adulto.some((item) => !String(item || '').trim())) throw fail('Faltan antecedentes del adulto responsable.', 400);
  if (!solicitud.adulto_declaracion) throw fail('Falta la declaración del adulto responsable.', 400);
  if (!/^\+569\d{8}$/.test(solicitud.adulto_telefono)) throw fail('El teléfono del adulto responsable no es válido.', 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(solicitud.adulto_correo)) throw fail('El correo del adulto responsable no es válido.', 400);
}

function validarCambioEstado(payload, actual) {
  if (payload.estado === 'rechazado' && !payload.observacion_rechazo) {
    throw fail('Para rechazar una solicitud debes completar Observaciones del rechazo.', 400);
  }

  if (payload.estado === 'miembro') {
    const requerido = [actual.nombre, actual.correo, actual.telefono, actual.categoria_socio];
    if (requerido.some((item) => !String(item || '').trim())) {
      throw fail('No se puede transformar en miembro sin nombre, correo, teléfono y categoría de socio/a.', 400);
    }
  }

  if (actual.menor_edad) validarAdultoResponsable(actual);
}

function normalizarRegistroSalida(item) {
  if (!item) return item;
  const estado = normalizarEstado(item.estado);
  return {
    ...item,
    estado,
    observacion_rechazo: item.observacion_rechazo || item.rejectionObservation || '',
    observaciones_internas: item.observaciones_internas || item.internalNotes || item.observaciones || '',
    estado_socio: normalizarEstadoSocio(item.estado_socio || item.memberStatus || 'activo'),
    fecha_ingreso: item.fecha_ingreso || item.joinedAt || (estado === 'miembro' ? item.updated_at || item.created_at : null)
  };
}

function normalizarCategoria(categoria) {
  const value = limpiar(categoria);
  return CATEGORIAS_PERMITIDAS.includes(value) ? value : '';
}

function normalizarEstado(estado) {
  const value = String(estado || '').trim().toLowerCase();
  if (value === 'aceptado' || value === 'accepted' || value === 'member') return 'miembro';
  if (ESTADOS_PERMITIDOS.includes(value)) return value;
  if (ESTADOS_LEGACY.includes(value)) return value;
  return 'pendiente';
}

function normalizarEstadoSocio(estado) {
  const value = String(estado || '').trim().toLowerCase();
  if (value === 'active') return 'activo';
  if (value === 'inactive') return 'inactivo';
  if (value === 'suspended') return 'suspendido';
  return ESTADOS_SOCIO.includes(value) ? value : 'activo';
}

function normalizarLista(value) {
  if (Array.isArray(value)) return value.map(limpiar).filter(Boolean).slice(0, 20);
  return String(value || '').split(',').map(limpiar).filter(Boolean).slice(0, 20);
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
