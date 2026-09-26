import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { after, before, test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://proyecto-prueba.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-publica-prueba';
process.env.SUPABASE_ADMIN_KEY = 'admin-no-publicar';
const { server, toWebRequest } = await import('../server.js');
let baseUrl;

before(async () => {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('sirve la página pública y /admin', async () => {
  for (const pathname of ['/', '/admin', '/admin/']) {
    const response = await fetch(baseUrl + pathname);
    assert.equal(response.status, 200, pathname);
    assert.match(response.headers.get('content-type'), /text\/html/);
  }
});

test('ejecuta una Pages Function mediante /api', async () => {
  const response = await fetch(baseUrl + '/api/ping?prueba=1');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: 'Agrupacion Nothofagus API' });
});

test('expone solo la configuración pública de Supabase al frontend', async () => {
  const response = await fetch(baseUrl + '/scripts/supabase-config.js');
  const source = await response.text();
  assert.equal(response.status, 200);
  assert.match(source, /proyecto-prueba\.supabase\.co/);
  assert.match(source, /anon-publica-prueba/);
  assert.doesNotMatch(source, /admin-no-publicar/);
  assert.match(source, /SUPABASE_URL\.startsWith\('https:\/\/'\)/);
  assert.match(source, /!SUPABASE_ANON_KEY\.includes\('TU_SUPABASE_ANON_KEY'\)/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('pasa OPTIONS a las funciones existentes', async () => {
  const response = await fetch(baseUrl + '/api/tesoreria', { method: 'OPTIONS' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test('preserva headers, query y multipart/form-data', async () => {
  const boundary = '----nothofagus-test-boundary';
  const payload = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="descripcion"',
    '',
    'Ingreso de prueba',
    `--${boundary}`,
    'Content-Disposition: form-data; name="archivo"; filename="prueba.txt"',
    'Content-Type: text/plain',
    '',
    'contenido',
    `--${boundary}--`,
    ''
  ].join('\r\n');
  const incoming = Readable.from([Buffer.from(payload)]);
  incoming.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
    'x-prueba': 'cabecera-preservada'
  };

  const request = await toWebRequest(
    incoming,
    new URL('http://localhost/api/tesoreria?anio=2026'),
    'POST'
  );
  const form = await request.formData();

  assert.equal(request.headers.get('x-prueba'), 'cabecera-preservada');
  assert.equal(new URL(request.url).searchParams.get('anio'), '2026');
  assert.equal(form.get('descripcion'), 'Ingreso de prueba');
  assert.equal(await form.get('archivo').text(), 'contenido');
});

test('resuelve rutas dinámicas y handlers por método', async () => {
  const response = await fetch(baseUrl + '/api/publicaciones/123', { method: 'DELETE' });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'No autorizado.');
});

test('la API editorial usa Supabase sin requerir Cloudflare D1', async () => {
  const module = await import('../functions/api/publicaciones/[id].js');
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url: String(url), options };
    return new Response(null, { status: 204 });
  };

  try {
    const response = await module.onRequestPut({
      request: new Request('http://localhost/api/publicaciones/7', {
        method: 'PUT',
        headers: {
          authorization: 'Bearer token-editorial',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ titulo: 'Título', resumen: 'Resumen', fecha: '2026-09-21' })
      }),
      env: {
        ADMIN_TOKEN: 'token-editorial',
        SUPABASE_URL: 'https://proyecto-prueba.supabase.co',
        SUPABASE_ADMIN_KEY: 'sb_secret_prueba'
      },
      params: { id: '7' }
    });

    assert.equal(response.status, 200);
    assert.equal(captured.options.method, 'PATCH');
    assert.equal(captured.url, 'https://proyecto-prueba.supabase.co/rest/v1/publicaciones?id=eq.7');
    assert.equal(captured.options.headers.apikey, 'sb_secret_prueba');
    assert.equal(captured.options.headers.authorization, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Tesorería rechaza movimientos sin descripción antes de escribir en Supabase', async () => {
  const module = await import('../functions/api/tesoreria.js');
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url) => {
    requests += 1;
    assert.match(String(url), /\/auth\/v1\/user$/);
    return Response.json({ email: 'tesoreria@example.cl', user_metadata: { rol: 'tesorero' } });
  };

  try {
    const response = await module.onRequest({
      request: new Request('http://localhost/api/tesoreria', {
        method: 'POST',
        headers: {
          authorization: 'Bearer token-tesoreria',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ tipo: 'ingreso', fecha: '2026-09-21', descripcion: '   ', monto: 1000 })
      }),
      env: {
        SUPABASE_URL: 'https://proyecto-prueba.supabase.co',
        SUPABASE_ADMIN_KEY: 'sb_secret_prueba'
      }
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'La descripción es obligatoria.');
    assert.equal(requests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('devuelve 404 JSON para APIs inexistentes', async () => {
  const response = await fetch(baseUrl + '/api/no-existe');
  assert.equal(response.status, 404);
  assert.equal((await response.json()).error, 'Ruta API no encontrada.');
});

test('bloquea archivos internos y sensibles', async () => {
  for (const pathname of ['/functions/api/ping.js', '/.env', '/.git/config', '/package.json', '/schema.sql']) {
    const response = await fetch(baseUrl + pathname);
    assert.equal(response.status, 404, pathname);
  }
});
