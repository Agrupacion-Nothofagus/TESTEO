const headers = {
  'content-type': 'application/json; charset=utf-8'
};

const ROLES_PERMITIDOS = ['administrador', 'editor', 'lector', 'gestor_miembros'];
const DOMINIO_INSTITUCIONAL = '@agrupacionnothofagus.cl';

export async function onRequest({ request, env }) {
  try {
    if (request.method === 'OPTIONS') {
      return reply({ ok: true });
    }

    const cfg = config(env);
    const session = await currentUser(request, cfg);
    allow(session, cfg);

    if (request.method === 'GET') return listUsers(cfg);
    if (request.method === 'POST') return createUser(request, cfg);
    if (request.method === 'PATCH') return updateUser(request, cfg);
    if (request.method === 'DELETE') return deleteUser(request, cfg, session);

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
  if (!cfg.admins.includes(email)) throw fail('No autorizado para administrar usuarios.', 403);
}

async function listUsers(cfg) {
  const res = await callSupabase(cfg, '/auth/v1/admin/users?per_page=100&page=1');
  const data = await res.json();

  if (!res.ok) throw fail(data.message || 'No fue posible listar usuarios.', res.status);

  return reply({ users: (data.users || []).map(cleanUser) });
}

async function createUser(request, cfg) {
  const body = await request.json();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '').trim();
  const nombre = String(body.nombre || '').trim();
  const rol = normalizeRole(body.rol || 'editor');

  if (!email.endsWith(DOMINIO_INSTITUCIONAL)) {
    throw fail(`El correo debe usar el dominio ${DOMINIO_INSTITUCIONAL}.`, 400);
  }

  if (password.length < 8) throw fail('La contraseña debe tener al menos 8 caracteres.', 400);

  const res = await callSupabase(cfg, '/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, rol }
    })
  });

  const data = await res.json();
  if (!res.ok) throw fail(data.message || 'No fue posible crear el usuario.', res.status);

  return reply({ user: cleanUser(data.user || data) });
}

async function updateUser(request, cfg) {
  const body = await request.json();
  const id = String(body.id || '').trim();
  const nombre = String(body.nombre || '').trim();
  const rol = normalizeRole(body.rol || 'editor');
  const password = String(body.password || '').trim();

  if (!id) throw fail('Falta el ID del usuario.', 400);

  const payload = { user_metadata: { nombre, rol } };

  if (password) {
    if (password.length < 8) throw fail('La contraseña debe tener al menos 8 caracteres.', 400);
    payload.password = password;
  }

  const res = await callSupabase(cfg, `/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) throw fail(data.message || 'No fue posible actualizar el usuario.', res.status);

  return reply({ user: cleanUser(data.user || data) });
}

async function deleteUser(request, cfg, session) {
  const body = await request.json();
  const id = String(body.id || '').trim();

  if (!id) throw fail('Falta el ID del usuario.', 400);
  if (id === session.id) throw fail('No puedes eliminar tu propio usuario desde este panel.', 400);

  const res = await callSupabase(cfg, `/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw fail(data.message || 'No fue posible eliminar el usuario.', res.status);
  }

  return reply({ ok: true });
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

function cleanUser(user) {
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

function normalizeRole(rol) {
  const value = String(rol || 'editor').trim().toLowerCase();
  return ROLES_PERMITIDOS.includes(value) ? value : 'editor';
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function fail(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
