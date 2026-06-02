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

    const html = `
      <div style="font-family: Arial, sans-serif; color: #1f2d24; line-height: 1.6;">
        <h2 style="color: #1f3d2b;">Nuevo mensaje desde la página web</h2>
        <p><strong>Nombre:</strong> ${escapeHTML(nombre)}</p>
        <p><strong>Teléfono:</strong> ${escapeHTML(telefono)}</p>
        <p><strong>Correo:</strong> ${escapeHTML(correo)}</p>
        <p><strong>Asunto:</strong> ${escapeHTML(asunto)}</p>
        <hr style="border: 0; border-top: 1px solid #dfe8dc; margin: 20px 0;">
        <p><strong>Mensaje:</strong></p>
        <p>${escapeHTML(mensaje).replaceAll('\n', '<br>')}</p>
      </div>
    `;

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
        html
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
