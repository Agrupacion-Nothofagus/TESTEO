const headers = { 'content-type': 'application/json; charset=utf-8' };

export async function onRequest({ request, env }) {
  try {
    const cfg = config(env);
    const session = await currentUser(request, cfg);
    allow(session, cfg);

    if (request.method === 'OPTIONS') return reply({ ok: true });
    if (request.method === 'GET') return list(cfg);
    if (request.method === 'POST') return create(request, cfg);

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
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

  if (!url || !key) throw fail('Faltan variables SUPABASE_URL o SUPABASE_ADMIN_KEY.', 500);
  if (!admins.length) throw fail('Falta configurar ADMIN_EMAILS.', 500);

  return { url, key, admins };
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

function allow(user, cfg) {
  const email = String(user.email || '').toLowerCase();

  if (!cfg.admins.includes(email)) {
    throw fail('No autorizado.', 403);
  }
}

async function list(cfg) {
  const res = await call(cfg, '/auth/v1/admin/users?per_page=100&page=1');
  const data = await res.json();

  if (!res.ok) {
    throw fail(data.message || 'No fue posible listar usuarios.', res.status);
  }

  return reply({
    users: (data.users || []).map(clean)
  });
}

async function create(request, cfg) {
  const body = await request.json();

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '').trim();
  const nombre = String(body.nombre || '').trim();
  const rol = String(body.rol || 'editor').trim();

  if (!email.endsWith('@agrupacionnothofagus.cl')) {
    throw fail('El correo debe usar @agrupacionnothofagus.cl.', 400);
  }

  if (password.length < 8) {
    throw fail('La contraseña debe tener al menos 8 caracteres.', 400);
  }

  const res = await call(cfg, '/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, rol }
    })
  });

  const data = await res.json();

  if (!res.ok) {
    throw fail(data.message || 'No fue posible crear el usuario.', res.status);
  }

  return reply({
    user: clean(data.user || data)
  });
}

function call(cfg, path, options = {}) {
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

function clean(user) {
  return {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    email_confirmed_at: user.email_confirmed_at,
    nombre: user.user_metadata?.nombre || '',
    rol: user.user_metadata?.rol || 'editor'
  };
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers
  });
}

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
