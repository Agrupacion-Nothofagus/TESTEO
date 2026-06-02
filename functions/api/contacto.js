const headers = {
  'content-type': 'application/json; charset=utf-8'
};

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
      <body style="margin:0; padding:0; background:#f5f1e8; font-family: Arial, Helvetica, sans-serif; color:#1f2d24;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; background:#f5f1e8; padding:28px 12px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; max-width:680px; background:#ffffff; border-radius:26px; overflow:hidden; border:1px solid #dfe8dc; box-shadow:0 18px 44px rgba(31,61,43,0.12);">
                <tr>
                  <td style="padding:34px 34px 30px; background:linear-gradient(135deg,#13251b,#1f3d2b 58%,#4f7d4a); color:#ffffff; text-align:center;">
                    <div style="display:inline-block; padding:7px 13px; border-radius:999px; background:rgba(255,255,255,0.16); border:1px solid rgba(255,255,255,0.22); font-size:12px; font-weight:800; letter-spacing:1.4px; text-transform:uppercase;">
                      Agrupación Nothofagus
                    </div>
                    <h1 style="margin:18px 0 8px; font-size:30px; line-height:1.15; font-weight:800;">
                      Nuevo mensaje desde la página web
                    </h1>
                    <p style="margin:0; color:#edf5ed; font-size:15px; line-height:1.6;">
                      Se ha recibido una nueva consulta mediante el formulario de contacto institucional.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:30px 34px 10px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;">
                      <tr>
                        <td style="padding:0 0 18px;">
                          <p style="margin:0 0 8px; color:#4f7d4a; font-size:12px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase;">
                            Asunto
                          </p>
                          <h2 style="margin:0; color:#1f3d2b; font-size:23px; line-height:1.25;">
                            ${safeAsunto}
                          </h2>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:separate; border-spacing:0 12px;">
                      <tr>
                        <td style="padding:16px 18px; background:#faf8f2; border:1px solid #dfe8dc; border-radius:18px;">
                          <p style="margin:0 0 4px; color:#5f6f63; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:1px;">Nombre</p>
                          <p style="margin:0; color:#1f2d24; font-size:16px; font-weight:800;">${safeNombre}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:16px 18px; background:#faf8f2; border:1px solid #dfe8dc; border-radius:18px;">
                          <p style="margin:0 0 4px; color:#5f6f63; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:1px;">Teléfono</p>
                          <p style="margin:0; color:#1f2d24; font-size:16px; font-weight:800;">${safeTelefono}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:16px 18px; background:#faf8f2; border:1px solid #dfe8dc; border-radius:18px;">
                          <p style="margin:0 0 4px; color:#5f6f63; font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:1px;">Correo</p>
                          <p style="margin:0; color:#1f3d2b; font-size:16px; font-weight:800; word-break:break-word;">${safeCorreo}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding:8px 34px 32px;">
                    <div style="background:#ffffff; border:1px solid #dfe8dc; border-left:6px solid #4f7d4a; border-radius:20px; padding:22px 24px;">
                      <p style="margin:0 0 12px; color:#4f7d4a; font-size:12px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase;">
                        Mensaje
                      </p>
                      <p style="margin:0; color:#1f2d24; font-size:16px; line-height:1.75;">
                        ${safeMensaje}
                      </p>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:22px 34px; background:#faf8f2; border-top:1px solid #dfe8dc; text-align:center;">
                    <p style="margin:0 0 6px; color:#1f3d2b; font-size:14px; font-weight:800;">
                      Mensaje recibido el ${escapeHTML(fecha)}
                    </p>
                    <p style="margin:0; color:#5f6f63; font-size:12px; line-height:1.6;">
                      Este correo fue generado automáticamente desde el formulario de contacto de Agrupación Nothofagus.
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
