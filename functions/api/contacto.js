const headers = {
  'content-type': 'application/json; charset=utf-8'
};

const SITE_BASE_URL = 'https://raw.githubusercontent.com/Agrupacion-Nothofagus/TESTEO/main';
const LOGO_URL = `${SITE_BASE_URL}/logo.png`;
const BACKGROUND_URL = `${SITE_BASE_URL}/fondo.jpg`;

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();

    const nombre = String(body.nombre || '').trim();
    const telefono = String(body.telefono || '').trim();
    const correo = String(body.correo || '').trim();
    const asunto = String(body.asunto || '').trim();
    const mensaje = String(body.mensaje || '').trim();

    if (!nombre || !telefono || !correo || !asunto || !mensaje) {
      return reply({ error: 'Todos los campos son obligatorios.' }, 400);
    }

    if (!/^\+569\d{8}$/.test(telefono)) {
      return reply({ error: 'El teléfono debe usar formato +569XXXXXXXX.' }, 400);
    }

    if (!isEmail(correo)) {
      return reply({ error: 'El correo electrónico no es válido.' }, 400);
    }

    if (!env.RESEND_API_KEY || !env.CONTACT_TO_EMAIL || !env.CONTACT_FROM_EMAIL) {
      return reply({ error: 'Faltan variables de correo en Cloudflare.' }, 500);
    }

    const html = buildContactEmail({ nombre, telefono, correo, asunto, mensaje });
    const text = buildContactText({ nombre, telefono, correo, asunto, mensaje });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from: env.CONTACT_FROM_EMAIL,
        to: [env.CONTACT_TO_EMAIL],
        reply_to: correo,
        subject: `Mensaje web Nothofagus: ${asunto}`,
        html,
        text
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return reply({ error: data.message || 'No fue posible enviar el correo.' }, res.status);
    }

    return reply({ ok: true });
  } catch (error) {
    return reply({ error: error.message || 'Error interno.' }, 500);
  }
}

export async function onRequestOptions() {
  return reply({ ok: true });
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
                        <td style="padding:17px 20px; background:#1f3d2b; border-radius:18px;">
                          <p style="margin:0 0 5px; color:#cfe4ca; font-size:11px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase;">Asunto</p>
                          <h2 style="margin:0; color:#ffffff; font-size:20px; line-height:1.3; font-weight:800;">
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
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
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
