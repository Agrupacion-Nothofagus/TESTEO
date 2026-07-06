const headers = {
  'content-type': 'application/json; charset=utf-8'
};

const ESTADOS_CONTACTO = ['nuevo', 'leido', 'respondido', 'archivado'];
const ROLES_FORMULARIOS = ['administrador', 'admin', 'gestor_miembros', 'secretariado'];

export async function onRequest({ request, env }) {
  try {
    if (request.method === 'OPTIONS') return reply({ ok: true });
    if (request.method === 'POST') return createContactMessage(request, env);

    const cfg = config(env);
    const session = await currentUser(request, cfg);
    allowFormAccess(session, cfg);

    if (request.method === 'GET') return listContactMessages(cfg);
    if (request.method === 'PATCH') return updateContactMessage(request, cfg);
    if (request.method === 'DELETE') return deleteContactMessage(request, cfg);

    return reply({ error: 'Método no permitido.' }, 405);
  } catch (error) {
    return reply({ error: error.message || 'Error interno.' }, error.status || 500);
  }
}

async function createContactMessage(request, env) {
  const body = await request.json().catch(() => ({}));
  const mensajeContacto = {
    nombre: limpiar(body.nombre),
    telefono: limpiar(body.telefono),
    correo: limpiar(body.correo).toLowerCase(),
    asunto: limpiar(body.asunto),
    mensaje: limpiar(body.mensaje),
    estado: 'nuevo',
    observaciones: '',
    origen: 'formulario_contacto'
  };

  validarContacto(mensajeContacto);

  const cfg = hasSupabase(env) ? config(env) : null;
  let savedMessage = null;
  let saved = false;
  let emailSent = false;
  let warning = '';

  if (cfg) {
    savedMessage = await saveContactMessage(cfg, mensajeContacto);
    saved = true;
  }

  if (hasEmailConfig(env)) {
    try {
      await sendContactEmail(env, mensajeContacto);
      emailSent = true;
    } catch (error) {
      warning = error.message || 'No fue posible enviar el correo.';
      if (!saved) throw fail(warning, 500);
    }
  } else if (!saved) {
    throw fail('Faltan variables de Supabase o correo para recibir el mensaje.', 500);
  }

  return reply({ ok: true, saved, emailSent, warning, mensaje: savedMessage });
}

async function listContactMessages(cfg) {
  const res = await callSupabase(cfg, '/rest/v1/contacto_mensajes?select=*&order=created_at.desc&limit=500');
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible listar los formularios de contacto.', res.status);
  return reply({ mensajes: Array.isArray(data) ? data.map(normalizarMensajeSalida) : [] });
}

async function updateContactMessage(request, cfg) {
  const body = await request.json().catch(() => ({}));
  const id = limpiar(body.id);
  if (!id) throw fail('Falta el ID del mensaje.', 400);

  const estado = normalizarEstado(body.estado || body.status || 'leido');
  const payload = {
    estado,
    observaciones: limpiar(body.observaciones || body.notes || ''),
    updated_at: new Date().toISOString()
  };

  if (estado === 'respondido') payload.respondido_at = new Date().toISOString();

  const res = await callSupabase(cfg, `/rest/v1/contacto_mensajes?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible actualizar el mensaje.', res.status);
  return reply({ mensaje: normalizarMensajeSalida(Array.isArray(data) ? data[0] : data) });
}

async function deleteContactMessage(request, cfg) {
  const id = limpiar(new URL(request.url).searchParams.get('id'));
  if (!id) throw fail('Falta el ID del mensaje.', 400);

  const res = await callSupabase(cfg, `/rest/v1/contacto_mensajes?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' }
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw fail(data.message || 'No fue posible eliminar el mensaje.', res.status);
  }

  return reply({ ok: true });
}

async function saveContactMessage(cfg, mensajeContacto) {
  const res = await callSupabase(cfg, '/rest/v1/contacto_mensajes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(mensajeContacto)
  });

  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible guardar el mensaje de contacto.', res.status);
  return normalizarMensajeSalida(Array.isArray(data) ? data[0] : data);
}

async function sendContactEmail(env, mensajeContacto) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL,
      to: [env.CONTACT_TO_EMAIL],
      reply_to: mensajeContacto.correo,
      subject: `Mensaje web Nothofagus: ${mensajeContacto.asunto}`,
      html: buildContactEmail(mensajeContacto),
      text: buildContactText(mensajeContacto)
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(data.message || 'No fue posible enviar el correo.', res.status);
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

function allowFormAccess(user, cfg) {
  const email = String(user.email || '').toLowerCase();
  const rol = obtenerRol(user);
  const esAdminEmail = cfg.admins.includes(email);

  if (!esAdminEmail && !ROLES_FORMULARIOS.includes(rol)) {
    throw fail('No autorizado para revisar formularios.', 403);
  }
}

function obtenerRol(user) {
  return String(
    user?.user_metadata?.rol
    || user?.user_metadata?.role
    || user?.app_metadata?.rol
    || user?.app_metadata?.role
    || ''
  ).trim().toLowerCase();
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

function hasSupabase(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ADMIN_KEY);
}

function hasEmailConfig(env) {
  return Boolean(env.RESEND_API_KEY && env.CONTACT_TO_EMAIL && env.CONTACT_FROM_EMAIL);
}

function validarContacto(item) {
  if (!item.nombre || !item.telefono || !item.correo || !item.asunto || !item.mensaje) {
    throw fail('Todos los campos son obligatorios.', 400);
  }

  if (!/^\+569\d{8}$/.test(item.telefono)) {
    throw fail('El teléfono debe usar formato +569XXXXXXXX.', 400);
  }

  if (!isEmail(item.correo)) {
    throw fail('El correo electrónico no es válido.', 400);
  }
}

function normalizarEstado(value) {
  const estado = String(value || '').trim().toLowerCase();
  return ESTADOS_CONTACTO.includes(estado) ? estado : 'leido';
}

function normalizarMensajeSalida(item) {
  if (!item) return item;
  return {
    ...item,
    estado: normalizarEstado(item.estado || 'nuevo'),
    observaciones: item.observaciones || '',
    origen: item.origen || 'formulario_contacto'
  };
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
      authorization: `Bearer ${cfg.key}`,
      ...(options.headers || {})
    }
  });
}

function buildContactEmail({ nombre, telefono, correo, asunto, mensaje }) {
  const safeNombre = escapeHTML(nombre);
  const safeTelefono = escapeHTML(telefono);
  const safeCorreo = escapeHTML(correo);
  const safeAsunto = escapeHTML(asunto);
  const safeMensaje = escapeHTML(mensaje).replaceAll('\n', '<br>');

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f5f1e8;padding:22px;color:#1f2d24;">
      <div style="max-width:720px;margin:auto;background:#fff;border:1px solid #dfe8dc;border-radius:20px;overflow:hidden;">
        <div style="background:#1f3d2b;color:#fff;padding:22px;">
          <p style="margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Formulario de contacto institucional</p>
          <h1 style="margin:0;font-size:28px;">Agrupación Nothofagus</h1>
        </div>
        <div style="padding:22px;">
          <p><strong>Nombre:</strong> ${safeNombre}</p>
          <p><strong>Teléfono:</strong> ${safeTelefono}</p>
          <p><strong>Correo:</strong> ${safeCorreo}</p>
          <p><strong>Asunto:</strong> ${safeAsunto}</p>
          <div style="margin-top:16px;padding:16px;border-left:6px solid #4f7d4a;background:#faf8f2;border-radius:14px;line-height:1.7;">
            ${safeMensaje}
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildContactText({ nombre, telefono, correo, asunto, mensaje }) {
  return [
    'Nuevo mensaje desde la página web de Agrupación Nothofagus',
    '',
    `Nombre: ${nombre}`,
    `Teléfono: ${telefono}`,
    `Correo: ${correo}`,
    `Asunto: ${asunto}`,
    '',
    'Mensaje:',
    mensaje
  ].join('\n');
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHTML(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
