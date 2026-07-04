const headers = { 'content-type': 'application/json; charset=utf-8' };
const MEMBERS_TABLE = 'tesoreria_cuotas_miembros';
const PAYMENTS_TABLE = 'tesoreria_cuotas_pagos';
const BUCKET = 'tesoreria-comprobantes';
const MEMBER_STATES = ['estudiante', 'trabajador', 'cesante'];
const MEMBER_ACCOUNT_STATES = ['activo', 'inactivo'];
const PAYMENT_METHODS = ['transferencia', 'efectivo', 'deposito', 'webpay', 'otro'];
const PAYMENT_TYPES = ['mensual', 'anual'];
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ADMIN_ROLES = ['administrador', 'admin'];
const TREASURY_ROLES = ['tesorero', 'tesorera'];
const SECRETARY_ROLES = ['secretario', 'secretaria', 'secretariado'];
const MEMBER_ROLES = ['miembro', 'socio', 'socia', 'member'];

export async function onRequest({ request, env }) {
  try {
    if (request.method === 'OPTIONS') return reply({ ok: true });

    const cfg = getConfig(env);
    const user = await getCurrentUser(request, cfg);
    const permisos = getPermisos(user, cfg);

    if (!permisos.read) throw fail('No autorizado para acceder a Cuotas de Miembros.', 403);

    if (request.method === 'GET') return listCuotas(request, cfg, user, permisos);
    if (request.method === 'POST') return createRecord(request, cfg, user, permisos);
    if (request.method === 'PATCH') return updateMember(request, cfg, user, permisos);
    if (request.method === 'DELETE') return deletePayment(request, cfg, permisos);

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

async function listCuotas(request, cfg, user, permisos) {
  const year = getYear(new URL(request.url).searchParams.get('anio'));
  const members = await listMembers(cfg, user, permisos);
  const payments = await listPayments(cfg, year);
  const allowedIds = new Set(members.map((item) => item.id));
  const normalizedPayments = await Promise.all(payments.filter((item) => allowedIds.has(item.member_id)).map((item) => fromPaymentDb(item, cfg)));
  const byMember = groupPayments(normalizedPayments);
  const items = members.map((member) => withFinancialSummary(fromMemberDb(member), byMember.get(member.id) || [], year));

  return reply({
    anio: year,
    permisos: { read: permisos.read, write: permisos.write, export: permisos.export, ownOnly: permisos.ownOnly, role: permisos.role },
    miembros: items,
    resumen: buildGlobalSummary(items)
  });
}

async function createRecord(request, cfg, user, permisos) {
  if (!permisos.write) throw fail('Solo administración o tesorería pueden crear registros o pagos.', 403);

  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  const isMultipart = contentType.includes('multipart/form-data');
  const { fields, file } = isMultipart ? await readMultipart(request) : { fields: await request.json().catch(() => ({})), file: null };
  const action = limpiar(fields.action || fields.tipo_registro || 'member');

  if (action === 'payment') return createPayment(fields, file, cfg, user);
  return createMember(fields, cfg, user);
}

async function createMember(fields, cfg, user) {
  const payload = memberToDb(fields, user, false);
  const res = await supabaseFetch(cfg, `/rest/v1/${MEMBERS_TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible crear el miembro de cuotas.', res.status);
  return reply({ miembro: fromMemberDb(Array.isArray(data) ? data[0] : data) }, 201);
}

async function updateMember(request, cfg, user, permisos) {
  if (!permisos.write) throw fail('Solo administración o tesorería pueden editar miembros.', 403);

  const body = await request.json().catch(() => ({}));
  const id = limpiar(body.id);
  if (!id) throw fail('Falta el ID del miembro.', 400);

  const payload = memberToDb(body, user, true);
  const res = await supabaseFetch(cfg, `/rest/v1/${MEMBERS_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible actualizar el miembro.', res.status);
  return reply({ miembro: fromMemberDb(Array.isArray(data) ? data[0] : data) });
}

async function createPayment(fields, file, cfg, user) {
  const memberId = limpiar(fields.member_id || fields.memberId);
  if (!memberId) throw fail('Falta el miembro asociado al pago.', 400);

  const member = await getMemberById(cfg, memberId);
  const archivo = file ? await uploadComprobante(cfg, file, fields.anio || new Date().getFullYear()) : null;
  const payload = paymentToDb(fields, user, archivo, member);

  const res = await supabaseFetch(cfg, `/rest/v1/${PAYMENTS_TABLE}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) {
    if (archivo?.comprobante_path) await deleteStorageObject(cfg, archivo.comprobante_path).catch(() => null);
    throw fail(data.message || 'No fue posible registrar el pago.', res.status);
  }

  return reply({ pago: await fromPaymentDb(Array.isArray(data) ? data[0] : data, cfg) }, 201);
}

async function deletePayment(request, cfg, permisos) {
  if (!permisos.write) throw fail('Solo administración o tesorería pueden eliminar pagos.', 403);

  const id = new URL(request.url).searchParams.get('payment_id') || new URL(request.url).searchParams.get('id');
  if (!id) throw fail('Falta el ID del pago.', 400);

  const res = await supabaseFetch(cfg, `/rest/v1/${PAYMENTS_TABLE}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' }
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible eliminar el pago.', res.status);

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.comprobante_path) await deleteStorageObject(cfg, row.comprobante_path).catch(() => null);

  return reply({ ok: true, pago: await fromPaymentDb(row, cfg) });
}

async function listMembers(cfg, user, permisos) {
  const ownFilter = permisos.ownOnly ? `&correo=eq.${encodeURIComponent(String(user.email || '').toLowerCase())}` : '';
  const res = await supabaseFetch(cfg, `/rest/v1/${MEMBERS_TABLE}?select=*&order=nombre.asc&limit=1000${ownFilter}`);
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible listar miembros de cuotas.', res.status);
  return Array.isArray(data) ? data : [];
}

async function listPayments(cfg, year) {
  const res = await supabaseFetch(cfg, `/rest/v1/${PAYMENTS_TABLE}?select=*&anio=eq.${encodeURIComponent(year)}&order=fecha_pago.desc&order=created_at.desc&limit=5000`);
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible listar pagos de cuotas.', res.status);
  return Array.isArray(data) ? data : [];
}

async function getMemberById(cfg, id) {
  const res = await supabaseFetch(cfg, `/rest/v1/${MEMBERS_TABLE}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible revisar el miembro.', res.status);
  const item = Array.isArray(data) ? data[0] : data;
  if (!item) throw fail('Miembro no encontrado.', 404);
  return item;
}

function memberToDb(item, user, partial) {
  const estado = normalizeMemberState(item.estado_miembro || item.estadoMiembro || item.estado || 'estudiante');
  const estadoCuenta = normalizeAccountState(item.estado_cuenta || item.estadoCuenta || 'activo');
  const cuota = Number(item.cuota_mensual || item.cuotaMensual || 0);
  const year = getYear(item.anio || new Date().getFullYear());
  const nombre = limpiar(item.nombre || item.nombre_completo || item.nombreCompleto);
  const correo = limpiar(item.correo).toLowerCase();

  if (!partial && !nombre) throw fail('El nombre completo es obligatorio.', 400);
  if (!partial && !correo) throw fail('El correo es obligatorio.', 400);
  if (!partial && cuota < 0) throw fail('La cuota mensual no puede ser negativa.', 400);
  if (correo && !isEmail(correo)) throw fail('El correo no es válido.', 400);

  const payload = {
    estado_miembro: estado,
    estado_cuenta: estadoCuenta,
    cuota_mensual: Math.max(0, cuota),
    anio: year,
    rut: limpiar(item.rut),
    telefono: limpiar(item.telefono),
    observaciones: limpiar(item.observaciones),
    exento: Boolean(item.exento),
    actualizado_por: getNombreUsuario(user),
    updated_at: new Date().toISOString()
  };

  if (nombre) payload.nombre = nombre;
  if (correo) payload.correo = correo;
  if (!partial) payload.creado_por = getNombreUsuario(user);

  return payload;
}

function paymentToDb(item, user, archivo, member) {
  const tipoPago = PAYMENT_TYPES.includes(limpiar(item.tipo_pago || item.tipoPago || 'mensual').toLowerCase()) ? limpiar(item.tipo_pago || item.tipoPago || 'mensual').toLowerCase() : 'mensual';
  const year = getYear(item.anio || new Date().getFullYear());
  const mes = tipoPago === 'anual' ? 0 : normalizeMonth(item.mes);
  const monto = Number(item.monto || 0);
  const metodo = normalizePaymentMethod(item.metodo_pago || item.metodoPago || 'transferencia');

  if (!monto || monto <= 0) throw fail('El monto del pago debe ser mayor a 0.', 400);

  return {
    member_id: member.id,
    mes,
    anio: year,
    monto,
    fecha_pago: limpiar(item.fecha_pago || item.fechaPago) || new Date().toISOString().slice(0, 10),
    metodo_pago: metodo,
    observacion: limpiar(item.observacion || item.observaciones),
    tipo_pago: tipoPago,
    comprobante_path: archivo?.comprobante_path || null,
    comprobante_nombre: archivo?.comprobante_nombre || null,
    comprobante_tipo: archivo?.comprobante_tipo || null,
    comprobante_tamano: archivo?.comprobante_tamano || null,
    creado_por: getNombreUsuario(user),
    actualizado_por: getNombreUsuario(user),
    updated_at: new Date().toISOString()
  };
}

async function readMultipart(request) {
  const formData = await request.formData();
  const fields = {};
  for (const [key, value] of formData.entries()) {
    if (key !== 'comprobante') fields[key] = typeof value === 'string' ? value : '';
  }
  const file = formData.get('comprobante');
  const hasFile = file && typeof file.arrayBuffer === 'function' && Number(file.size || 0) > 0;
  return { fields, file: hasFile ? file : null };
}

async function uploadComprobante(cfg, file, yearValue) {
  const tipoArchivo = String(file.type || '').toLowerCase();
  const size = Number(file.size || 0);
  if (!FILE_TYPES.includes(tipoArchivo)) throw fail('El comprobante debe ser PDF, JPG o PNG.', 400);
  if (size > MAX_FILE_BYTES) throw fail('El comprobante no puede superar 10 MB.', 400);

  const year = getYear(yearValue || new Date().getFullYear());
  const safeName = sanitizeFileName(file.name || `comprobante-${Date.now()}`);
  const path = `cuotas/${year}/${crypto.randomUUID()}-${safeName}`;

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

  return { comprobante_path: path, comprobante_nombre: file.name || safeName, comprobante_tipo: tipoArchivo, comprobante_tamano: size };
}

async function createSignedUrl(cfg, path) {
  if (!path) return '';
  const res = await fetch(`${cfg.url}/storage/v1/object/sign/${BUCKET}/${encodeStoragePath(path)}`, {
    method: 'POST',
    headers: { apikey: cfg.key, authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 * 60 })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return '';
  const signed = data.signedURL || data.signedUrl || '';
  return signed ? (signed.startsWith('http') ? signed : `${cfg.url}/storage/v1${signed}`) : '';
}

async function deleteStorageObject(cfg, path) {
  if (!path) return;
  await fetch(`${cfg.url}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: { apikey: cfg.key, authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ prefixes: [path] })
  });
}

function fromMemberDb(row = {}) {
  return {
    id: row.id || '',
    nombre: row.nombre || '',
    rut: row.rut || '',
    correo: row.correo || '',
    telefono: row.telefono || '',
    estadoMiembro: normalizeMemberState(row.estado_miembro || row.estadoMiembro),
    cuotaMensual: Number(row.cuota_mensual || 0),
    anio: getYear(row.anio || new Date().getFullYear()),
    observaciones: row.observaciones || '',
    estadoCuenta: normalizeAccountState(row.estado_cuenta || row.estadoCuenta),
    exento: Boolean(row.exento),
    creadoPor: row.creado_por || '',
    actualizadoPor: row.actualizado_por || '',
    creadoEn: row.created_at || '',
    actualizadoEn: row.updated_at || ''
  };
}

async function fromPaymentDb(row = {}, cfg) {
  const comprobantePath = row.comprobante_path || '';
  return {
    id: row.id || '',
    memberId: row.member_id || '',
    mes: Number(row.mes || 0),
    anio: getYear(row.anio || new Date().getFullYear()),
    monto: Number(row.monto || 0),
    fechaPago: row.fecha_pago || '',
    metodoPago: row.metodo_pago || '',
    observacion: row.observacion || '',
    tipoPago: row.tipo_pago || 'mensual',
    comprobantePath,
    comprobanteNombre: row.comprobante_nombre || '',
    comprobanteTipo: row.comprobante_tipo || '',
    comprobanteTamano: Number(row.comprobante_tamano || 0),
    comprobanteUrl: comprobantePath ? await createSignedUrl(cfg, comprobantePath) : '',
    creadoPor: row.creado_por || '',
    creadoEn: row.created_at || ''
  };
}

function withFinancialSummary(member, payments, year) {
  const cuotaAnualEsperada = member.exento ? 0 : Number(member.cuotaMensual || 0) * 12;
  const paymentsForYear = payments.filter((pago) => Number(pago.anio) === Number(year));
  const totalPagado = paymentsForYear.reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
  const saldoPendiente = Math.max(cuotaAnualEsperada - totalPagado, 0);
  const months = new Set(paymentsForYear.filter((pago) => Number(pago.mes) >= 1 && Number(pago.mes) <= 12 && Number(pago.monto) > 0).map((pago) => Number(pago.mes)));
  const tienePagoAnual = paymentsForYear.some((pago) => pago.tipoPago === 'anual' || Number(pago.mes) === 0);
  const mesesPagados = totalPagado >= cuotaAnualEsperada && cuotaAnualEsperada > 0 ? 12 : months.size;
  const estadoPago = getPaymentStatus(member, totalPagado, cuotaAnualEsperada, year, tienePagoAnual);

  return { ...member, pagos: paymentsForYear, cuotaAnualEsperada, totalPagado, saldoPendiente, mesesPagados, estadoPago, estadoCuotaAnual: estadoPago === 'pagada_anual' ? 'Pagada anual' : labelStatus(estadoPago) };
}

function getPaymentStatus(member, totalPagado, cuotaAnualEsperada, year, tienePagoAnual) {
  if (member.exento || cuotaAnualEsperada === 0) return 'exento';
  if (totalPagado >= cuotaAnualEsperada || tienePagoAnual) return 'pagada_anual';

  const now = new Date();
  const currentYear = now.getFullYear();
  const dueMonth = Number(year) < currentYear ? 12 : Number(year) > currentYear ? 0 : now.getMonth() + 1;
  const expectedDue = Number(member.cuotaMensual || 0) * dueMonth;

  if (dueMonth > 0 && totalPagado < expectedDue) return 'atrasado';
  if (totalPagado > 0) return totalPagado >= expectedDue ? 'al_dia' : 'parcial';
  return dueMonth === 0 ? 'parcial' : 'atrasado';
}

function buildGlobalSummary(items) {
  return items.reduce((acc, item) => {
    acc.totalMiembros += 1;
    if (item.estadoPago === 'al_dia') acc.alDia += 1;
    if (item.estadoPago === 'atrasado') acc.atrasados += 1;
    if (item.estadoPago === 'pagada_anual') acc.cuotasAnualesPagadas += 1;
    acc.totalRecaudado += Number(item.totalPagado || 0);
    acc.saldoPendiente += Number(item.saldoPendiente || 0);
    return acc;
  }, { totalMiembros: 0, alDia: 0, atrasados: 0, cuotasAnualesPagadas: 0, totalRecaudado: 0, saldoPendiente: 0 });
}

function groupPayments(payments) {
  const map = new Map();
  payments.forEach((payment) => {
    if (!map.has(payment.memberId)) map.set(payment.memberId, []);
    map.get(payment.memberId).push(payment);
  });
  return map;
}

async function getCurrentUser(request, cfg) {
  const token = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw fail('Sesión no enviada.', 401);

  const res = await fetch(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.key, authorization: `Bearer ${token}` } });
  if (!res.ok) throw fail('Sesión inválida o expirada.', 401);
  return res.json();
}

function getPermisos(user, cfg) {
  const email = String(user.email || '').toLowerCase();
  const role = String(user.user_metadata?.rol || user.user_metadata?.role || user.app_metadata?.rol || user.app_metadata?.role || '').trim().toLowerCase();
  const admin = ADMIN_ROLES.includes(role) || cfg.admins.includes(email);
  const treasury = TREASURY_ROLES.includes(role);
  const secretary = SECRETARY_ROLES.includes(role);
  const member = MEMBER_ROLES.includes(role);
  const write = admin || treasury;
  return { role, read: write || secretary || member, write, export: write, ownOnly: member && !write && !secretary };
}

function supabaseFetch(cfg, path, options = {}) {
  return fetch(`${cfg.url}${path}`, {
    ...options,
    headers: { apikey: cfg.key, authorization: `Bearer ${cfg.key}`, 'content-type': 'application/json', ...(options.headers || {}) }
  });
}

function normalizeMemberState(value) {
  const state = limpiar(value).toLowerCase();
  return MEMBER_STATES.includes(state) ? state : 'estudiante';
}

function normalizeAccountState(value) {
  const state = limpiar(value).toLowerCase();
  return MEMBER_ACCOUNT_STATES.includes(state) ? state : 'activo';
}

function normalizePaymentMethod(value) {
  const method = limpiar(value).toLowerCase();
  return PAYMENT_METHODS.includes(method) ? method : 'transferencia';
}

function normalizeMonth(value) {
  const month = Number(value || 0);
  if (month < 1 || month > 12) throw fail('El mes del pago no es válido.', 400);
  return month;
}

function getYear(value) {
  const year = Number(value || new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return new Date().getFullYear();
  return year;
}

function labelStatus(value) {
  return { al_dia: 'Al día', atrasado: 'Atrasado', parcial: 'Parcial', pagada_anual: 'Pagada anual', exento: 'Exento' }[value] || 'Parcial';
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sanitizeFileName(value) {
  const cleaned = String(value || 'comprobante').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 90);
  return cleaned || 'comprobante';
}

function encodeStoragePath(path) {
  return String(path || '').split('/').map(encodeURIComponent).join('/');
}

function limpiar(value) {
  return String(value || '').trim().slice(0, 5000);
}

function getNombreUsuario(user) {
  return user?.user_metadata?.nombre || user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email || 'Usuario interno';
}

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
