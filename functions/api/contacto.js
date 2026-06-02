const headers = {
  'content-type': 'application/json; charset=utf-8'
};

const EMAIL_BANNER_DATA_URI = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCADIA7ABAREA/8QAHAABAQACAgMBAAAAAAAAAAAAAAAABQIDBgQHCAAB/8QARhAAAQIDBQQFCQQIBQUAAAAAAQACAwQRBRIhMQYTQVFhByJxgZGhFCMyUrHR8AcWYnKCsvEkM1OissIXQ0Rjc5L/xAAYAQEBAQEBAAAAAAAAAAAAAAAAAQIDBP/EAB4RAQEAAwEAAwEBAAAAAAAAAAABAhEhAxIxQVEi/9oADAMBAAIRAxEAPwD3FIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGFfI3ZY7viZ2iZNMwdVvUnkLX9c3VwI1t7ptq4lJrQlStvOvTXu1W4WbW5Xf7KfH6ZX/Kr7pnwLhCcc3PrR6LT1YtPbm3CjO0YXJ2WjXvNprfckbV9+F2pNqT0O9r5Dv4C6kAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABl3ZnrWp6zM2UJ6hOLprfutP8Ak05XlQqSUoXyva1xd+uPa/Bvs1J43pnN/DO8orB8V7KnDw1RNSXS1Wxtua6Uptr8l92i0v2nH1b6aa+r8L4nZV9oeVceVyrKV2U3tprWtvVb03snpf2wV6ipXKFS2lFNNJpPe2rX1/4nRXsuxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGOfY3Svs3tUZhVGmV5d5ML8tJbSktvX9bn9Tq65g4syuXKp1aU34tv5Xv7mw8pXYuM/FUqR2p3rG/5a8t6/dJt2IZHyaYpluNr29QeUsQ4Wes4/cLqhrz2c+j+9g1rrp/yp+qjKxM7Xxc9+0xP1bJ4x8c2pcpLS1tbtpJv5XU7eQy5m8t2jH5kVr5U0Vb1WnZt4v2GcttAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB8v8AauskN9Zq2UqE0iS7a2q9bZ9W8zv6wxvO1FblGm2S1K7a6WvX3PqaHVDu5S6f8AWRmeSt1yq1ShJb6v5N+9q/wDqN7U+vM+vVn4H4j2P2a2jHtCqOaVNvZaztZJ6W3r9LNO2fZY6+rw2Wb9zU4+fGc9qbc10sr3svr0Op+4fctt9n+R4So0qNZ3XFq1N9r21u3R5w60AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADMNc2V6aXU6dVqqSp7Wd1Jv2u9p5dr57K05TnGLlJb2s7P9L7HhMxr7i+uT6vMOMp0aNvq6q2u+9bP6nT6Lw9F+PHcV8nZ3VqjSjStfScZPZ6Z7L5+wT+mq9KqSqSbSS2l3rXl7G7JtpAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABnH2Hpj2x6mVGnSLk3dJbWvPpvXm+JtqHGjKSnJX0s9tfzqTPaL+R6J9bGbMe+U6Kq0pWut8+Ovrb4ne+eV8mWJqW9v6zVWpVZUpJea2l3r0+3r8u7itbAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB5c8qx7b6n5m4qjTqpRjB7W3ScbW1t9n6Hq8jZ8h2Pr5xZ0pUqUo0rXl7Pq2rWm/Qa+WnZc7m1Kp1qSkt9rx1+vS6fQ6wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPyLOH9u6rxPZ+o1VpU3qUko9vVqX+e/0Oq+KsaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//Z';

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
                  <td style="padding:0; background:#13251b;">
                    <img src="${EMAIL_BANNER_DATA_URI}" width="760" alt="Agrupación Nothofagus" style="display:block; width:100%; max-width:760px; height:auto; border:0; line-height:0;">
                  </td>
                </tr>

                <tr>
                  <td style="padding:24px 30px 16px; background:#ffffff;">
                    <p style="margin:0 0 6px; color:#4f7d4a; font-size:12px; font-weight:800; letter-spacing:1.3px; text-transform:uppercase;">
                      Nuevo mensaje desde la página web
                    </p>
                    <h1 style="margin:0; color:#1f3d2b; font-size:24px; line-height:1.2; font-weight:800;">
                      Formulario de contacto institucional
                    </h1>
                  </td>
                </tr>

                <tr>
                  <td style="padding:0 30px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse;">
                      <tr>
                        <td style="padding:14px 16px; background:#faf8f2; border:1px solid #dfe8dc; border-radius:18px;">
                          <p style="margin:0 0 6px; color:#5f6f63; font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase;">Nombre</p>
                          <p style="margin:0; color:#1f2d24; font-size:16px; font-weight:800;">${safeNombre}</p>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; border-collapse:separate; border-spacing:0 12px; margin-top:0;">
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

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; margin-top:2px;">
                      <tr>
                        <td style="padding:22px 24px; background:#1f3d2b; border-radius:20px;">
                          <p style="margin:0 0 7px; color:#cfe4ca; font-size:11px; font-weight:800; letter-spacing:1.2px; text-transform:uppercase;">Asunto</p>
                          <h2 style="margin:0; color:#ffffff; font-size:26px; line-height:1.25; font-weight:800;">
                            ${safeAsunto}
                          </h2>
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%; margin-top:14px;">
                      <tr>
                        <td style="padding:24px 26px; background:#ffffff; border:1px solid #dfe8dc; border-left:7px solid #4f7d4a; border-radius:20px;">
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
