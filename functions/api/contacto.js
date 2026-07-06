const headers = {
  'content-type': 'application/json; charset=utf-8'
};

const SITE_BASE_URL = 'https://raw.githubusercontent.com/Agrupacion-Nothofagus/TESTEO/main';
const LOGO_URL = `${SITE_BASE_URL}/assets/logo-nothofagus-institucional.svg`;
const BACKGROUND_URL = `${SITE_BASE_URL}/fondo.jpg`;
const ESTADOS_CONTACTO = ['nuevo', 'leido', 'respondido', 'archivado'];

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
  const body = await request.json();

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
  let emailWarning = '';

  if (cfg) {
    savedMessage = await saveContactMessage(cfg, mensajeContacto);
    saved = true;
  }

  if (hasEmailConfig(env)) {
    try {
      await sendContactEmail(env, mensajeContacto);
      emailSent = true;
    } catch (error) {
      emailWarning = error.message || 'No fue posible enviar el correo.';
      if (!saved) throw fail(emailWarning, 500);
    }
  } else if (!saved) {
    throw fail('Faltan variables de Supabase o correo para recibir el mensaje.', 500);
  }

  return reply({ ok: true, saved, emailSent, warning: emailWarning, mensaje: savedMessage });
}

async function listContactMessages(cfg) {
  const res = await callSupabase(cfg, '/rest/v1/contacto_mensajes?select=*&order=created_at.desc&limit=500');
  const data = await res.json().catch(() => []);
  if (!res.ok) throw fail(data.message || 'No fue posible listar los formularios de contacto.', res.status);

  return reply({ mensajes: Array.isArray(data) ? data.map(normalizarMensajeSalida) : [] });
}

async function updateContactMessage(request, cfg) {
  const body = await request.json();
  const id = limpiar(body.id);
  if (!id) throw fail('Falta el ID del mensaje.', 400);

  const estado = normalizarEstado(body.estado || body.status || 'leido');
  const observaciones = limpiar(body.observaciones || body.notes || '');
  const payload = {
    estado,
    observaciones,
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

  const item = Array.isArray(data) ? data[0] : data;
  return reply({ mensaje: normalizarMensajeSalida(item) });
}

async function deleteContactMessage(request, cfg) {
  const url = new URL(request.url);
  const id = limpiar(url.searchParams.get('id'));
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
  const html = buildContactEmail(mensajeContacto);
  const text = buildContactText(mensajeContacto);

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
      html,
      text
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw fail(data.message || 'No fue posible enviar el correo.', res.status);
}

async function currentUser(request, cfg) {
  const token = String(request.headers.get('authorization') || '')
    .replace(/^Bearer\s+/i, '')
    .trim();

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
  const rol = String(
    user.user_metadata?.rol
    || user.user_metadata?.role
    || user.app_metadata?.rol
    || user.app_metadata?.role
    || ''
  ).trim().toLowerCase();

  const allowedRoles = ['administrador', 'admin', 'gestor_miembros', 'secretario', 'secretaria', 'secretariado'];
  const esAdminEmail = cfg.admins.includes(email);
  if (!esAdminEmail && !allowedRoles.includes(rol)) throw fail('No autorizado para revisar formularios.', 403);
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
  const fecha = new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago'
  }).format(new Date());

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Nuevo mensaje web Nothofagus</title>
      </head>
      <body style="margin:0; padding:0; background:#f5f1e8; font-family:Arial, Helvetica, sans-serif; color:#1f2d24;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; background:#f5f1e8; padding:22px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; max-width:760px; background:#ffffff; border-radius:24px; overflow:hidden; border:1px solid #dfe8dc; box-shadow:0 18px 44px rgba(31,61,43,0.12);">
                <tr>
                  <td background="${BACKGROUND_URL}" style="background-color:#13251b; background-image:linear-gradient(rgba(19,37,27,0.78), rgba(19,37,27,0.78)), url('${BACKGROUND_URL}'); background-size:cover; background-position:center; padding:28px 30px; color:#ffffff;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;">
                      <tr>
                        <td width="116" valign="middle" style="width:116px; padding-right:22px;">
                          <img src="${LOGO_URL}" width="106" height="106" alt="Logo Agrupación Nothofagus" style="display:block; width:106px; height:106px; border-radius:999px; border:1px solid rgba(255,255,255,0.65); background:#213f3d;">
                        </td>
                        <td valign="middle" style="text-align:left;">
                          <p style="margin:0 0 8px; color:#edf5ed; font-size:12px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase;">
                            Formulario de contacto institucional
                          </p>
                          <h1 style="margin:0; color:#ffffff; font-size:34px; line-height:1.05; font-weight:400; letter-spacing:-0.8px;">
                            Agrupación<br><strong style="font-weight:800;">Nothofagus</strong>
                          </h1>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:24px 30px 10px; background:#ffffff;">
                    <p style="margin:0 0 6px; color:#4f7d4a; font-size:12px; font-weight:800; letter-spacing:1.3px; text-transform:uppercase;">
                      Nuevo mensaje desde la página web
                    </p>
                    <p style="margin:0; color:#5f6f63; font-size:14px; line-height:1.55;">
                      Se ha recibido una nueva consulta desde el formulario público del sitio institucional.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:6px 30px 22px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:separate; border-spacing:0 12px;">
                      <tr>
                        <td style="padding:14px 16px; background:#faf8f2; border:1px solid #dfe8dc; border-radius:18px;">
                          <p style="margin:0 0 6px; color:#5f6f63; font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase;">Nombre</p>
                          <p style="margin:0; color:#1f2d24; font-size:16px; font-weight:800;">${safeNombre}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse;">
                            <tr>
                              <td width="50%" style="padding:14px 16px; background:#faf8f2; border:1px solid #dfe8dc; border-radius:18px;">
                                <p style="margin:0 0 6px; color:#5f6f63; font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase;">Teléfono</p>
                                <p style="margin:0; color:#1f2d24; font-size:15px; font-weight:800;">${safeTelefono}</p>
                              </td>
                              <td width="12" style="font-size:0; line-height:0;">&nbsp;</td>
                              <td width="50%" style="padding:14px 16px; background:#faf8f2; border:1px solid #dfe8dc; border-radius:18px;">
                                <p style="margin:0 0 6px; color:#5f6f63; font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase;">Correo</p>
                                <p style="margin:0; color:#1f3d2b; font-size:15px; font-weight:800; word-break:break-word;">${safeCorreo}</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; margin-top:4px;">
                      <tr>
                        <td style="padding:17px 20px; background:#ffffff; border:1px solid #dfe8dc; border-left:7px solid #4f7d4a; border-radius:18px;">
                          <p style="margin:0 0 8px; color:#4f7d4a; font-size:11px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase;">Asunto</p>
                          <h2 style="margin:0; color:#1f2d24; font-size:19px; line-height:1.35; font-weight:800;">
                            ${safeAsunto}
                          </h2>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; margin-top:14px;">
                      <tr>
                        <td style="padding:25px 26px; background:#ffffff; border:1px solid #dfe8dc; border-left:7px solid #4f7d4a; border-radius:20px;">
                          <p style="margin:0 0 12px; color:#4f7d4a; font-size:11px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase;">
                            Mensaje
                          </p>
                          <p style="margin:0; color:#1f2d24; font-size:17px; line-height:1.75;">
                            ${safeMensaje}
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:18px 30px; background:#faf8f2; border-top:1px solid #dfe8dc; text-align:center;">
                    <p style="margin:0 0 5px; color:#1f3d2b; font-size:13px; font-weight:800;">
                      Recibido el ${escapeHTML(fecha)}
                    </p>
                    <p style="margin:0; color:#5f6f63; font-size:12px; line-height:1.5;">
                      Correo automático generado desde el formulario de contacto de Agrupación Nothofagus.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
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
