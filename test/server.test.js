import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { after, before, test } from 'node:test';
import { buildMonthlySeries, buildQuotaMetrics, summarizeLedger } from '../admin/tesoreria-calculos.js';

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
  const redirect = await fetch(baseUrl + '/admin?vista=cuotas', { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/admin/?vista=cuotas');
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

test('Cuotas permite guardar el nuevo estado benefactor', async () => {
  const module = await import('../functions/api/cuotas-miembros.js');
  const originalFetch = globalThis.fetch;
  let savedPayload;

  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/auth/v1/user')) {
      return Response.json({ email: 'tesoreria@example.cl', user_metadata: { rol: 'tesorero' } });
    }

    assert.match(String(url), /\/rest\/v1\/tesoreria_cuotas_miembros\?id=eq\.miembro-1$/);
    assert.equal(options.method, 'PATCH');
    savedPayload = JSON.parse(options.body);
    return Response.json([{
      id: 'miembro-1',
      nombre: 'Socio Benefactor',
      correo: 'benefactor@example.cl',
      estado_miembro: savedPayload.estado_miembro,
      estado_cuenta: savedPayload.estado_cuenta,
      cuota_mensual: savedPayload.cuota_mensual,
      anio: savedPayload.anio,
      exento: false
    }]);
  };

  try {
    const response = await module.onRequest({
      request: new Request('http://localhost/api/cuotas-miembros', {
        method: 'PATCH',
        headers: {
          authorization: 'Bearer token-tesoreria',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          id: 'miembro-1',
          estado_miembro: 'benefactor',
          estado_cuenta: 'activo',
          cuota_mensual: 10000,
          anio: 2026
        })
      }),
      env: {
        SUPABASE_URL: 'https://proyecto-prueba.supabase.co',
        SUPABASE_ADMIN_KEY: 'sb_secret_prueba'
      }
    });

    assert.equal(response.status, 200);
    assert.equal(savedPayload.estado_miembro, 'benefactor');
    assert.equal((await response.json()).miembro.estadoMiembro, 'benefactor');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Cuotas rechaza un pago mensual duplicado antes de insertarlo', async () => {
  const module = await import('../functions/api/cuotas-miembros.js');
  const originalFetch = globalThis.fetch;
  let insertRequests = 0;

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith('/auth/v1/user')) {
      return Response.json({ email: 'tesoreria@example.cl', user_metadata: { rol: 'tesorero' } });
    }
    if (target.includes('/tesoreria_cuotas_miembros?id=eq.miembro-1')) {
      return Response.json([{ id: 'miembro-1', nombre: 'Integrante', cuota_mensual: 6000 }]);
    }
    if (target.includes('/tesoreria_cuotas_pagos?select=id&member_id=eq.miembro-1&anio=eq.2026&tipo_pago=eq.mensual&mes=eq.6')) {
      return Response.json([{ id: 'pago-existente' }]);
    }
    if (options.method === 'POST') insertRequests += 1;
    return Response.json([], { status: 500 });
  };

  try {
    const response = await module.onRequest({
      request: new Request('http://localhost/api/cuotas-miembros', {
        method: 'POST',
        headers: { authorization: 'Bearer token-tesoreria', 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'payment', member_id: 'miembro-1', tipo_pago: 'mensual', mes: 6, anio: 2026, monto: 6000, fecha_pago: '2026-09-22' })
      }),
      env: { SUPABASE_URL: 'https://proyecto-prueba.supabase.co', SUPABASE_ADMIN_KEY: 'sb_secret_prueba' }
    });

    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /Ya existe un pago registrado/);
    assert.equal(insertRequests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Cuotas permite editar un pago real sin duplicarlo ni borrar su comprobante', async () => {
  const module = await import('../functions/api/cuotas-miembros.js');
  const originalFetch = globalThis.fetch;
  let updatedPayload;
  const currentPayment = {
    id: 'pago-1',
    member_id: 'miembro-1',
    mes: 7,
    anio: 2026,
    monto: 10000,
    fecha_pago: '2026-07-17',
    metodo_pago: 'transferencia',
    observacion: 'Pago original',
    tipo_pago: 'mensual',
    comprobante_path: 'cuotas/2026/comprobante.pdf',
    comprobante_nombre: 'comprobante.pdf',
    comprobante_tipo: 'application/pdf',
    comprobante_tamano: 2048,
    creado_por: 'Tesorería',
    created_at: '2026-07-17T12:00:00Z'
  };

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith('/auth/v1/user')) {
      return Response.json({ email: 'tesoreria@example.cl', user_metadata: { rol: 'tesorero', nombre: 'Tesorería' } });
    }
    if (target.includes('/tesoreria_cuotas_pagos?id=eq.pago-1&select=*&limit=1')) {
      return Response.json([currentPayment]);
    }
    if (target.includes('/tesoreria_cuotas_miembros?id=eq.miembro-1')) {
      return Response.json([{ id: 'miembro-1', nombre: 'Francisco Rubilar', cuota_mensual: 10000 }]);
    }
    if (target.includes('/tesoreria_cuotas_pagos?select=id&member_id=eq.miembro-1&anio=eq.2026&tipo_pago=eq.mensual&mes=eq.7')) {
      return Response.json([{ id: 'pago-1' }]);
    }
    if (target.includes('/tesoreria_cuotas_pagos?id=eq.pago-1') && options.method === 'PATCH') {
      updatedPayload = JSON.parse(options.body);
      return Response.json([{ ...currentPayment, ...updatedPayload }]);
    }
    if (target.includes('/storage/v1/object/sign/tesoreria-comprobantes/')) {
      return Response.json({ signedURL: '/object/sign/tesoreria-comprobantes/comprobante.pdf?token=prueba' });
    }
    return Response.json({ message: `Ruta inesperada: ${target}` }, { status: 500 });
  };

  try {
    const response = await module.onRequest({
      request: new Request('http://localhost/api/cuotas-miembros', {
        method: 'PATCH',
        headers: { authorization: 'Bearer token-tesoreria', 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'payment', id: 'pago-1', member_id: 'miembro-1', tipo_pago: 'mensual', mes: 7, anio: 2026, monto: 12000, fecha_pago: '2026-07-18', metodo_pago: 'deposito', observacion: 'Monto corregido' })
      }),
      env: { SUPABASE_URL: 'https://proyecto-prueba.supabase.co', SUPABASE_ADMIN_KEY: 'sb_secret_prueba' }
    });

    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(updatedPayload.monto, 12000);
    assert.equal(updatedPayload.metodo_pago, 'deposito');
    assert.equal(updatedPayload.observacion, 'Monto corregido');
    assert.equal(updatedPayload.comprobante_path, undefined);
    assert.equal(updatedPayload.creado_por, undefined);
    assert.equal(result.pago.comprobantePath, currentPayment.comprobante_path);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Los cambios manuales de estado se guardan como auditoría sin monto contable', async () => {
  const module = await import('../functions/api/cuotas-estados.js');
  const originalFetch = globalThis.fetch;
  let insertedPayload;

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith('/auth/v1/user')) {
      return Response.json({ email: 'tesoreria@example.cl', user_metadata: { rol: 'tesorero', nombre: 'Tesorería' } });
    }
    if (target.includes('/tesoreria_cuotas_miembros?select=id,nombre&id=eq.miembro-1')) {
      return Response.json([{ id: 'miembro-1', nombre: 'Integrante de prueba' }]);
    }
    if (target.endsWith('/rest/v1/tesoreria_cuotas_estados') && options.method === 'POST') {
      insertedPayload = JSON.parse(options.body);
      return Response.json([{ id: 'estado-1', ...insertedPayload, created_at: '2026-09-24T12:00:00Z' }]);
    }
    return Response.json({ message: 'Ruta inesperada' }, { status: 500 });
  };

  try {
    const response = await module.onRequest({
      request: new Request('http://localhost/api/cuotas-estados', {
        method: 'POST',
        headers: { authorization: 'Bearer token-tesoreria', 'content-type': 'application/json' },
        body: JSON.stringify({ member_id: 'miembro-1', anio: 2026, mes: 7, estado_anterior: 'atrasado', estado_nuevo: 'pendiente', observacion: 'Acuerdo de regularización' })
      }),
      env: { SUPABASE_URL: 'https://proyecto-prueba.supabase.co', SUPABASE_ADMIN_KEY: 'sb_secret_prueba' }
    });

    const result = await response.json();
    assert.equal(response.status, 201);
    assert.equal(insertedPayload.estado_nuevo, 'pendiente');
    assert.equal(insertedPayload.member_nombre, 'Integrante de prueba');
    assert.equal(insertedPayload.monto, undefined);
    assert.equal(result.cambio.estadoNuevo, 'pendiente');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Tesorería general concilia pagos reales, egresos e integrantes activos', () => {
  const ledger = [
    { tipo: 'ingreso', monto: 5000, fecha: '2026-09-10' },
    { tipo: 'ingreso', monto: 12000, fecha: '2026-09-22' },
    { tipo: 'egreso', monto: 4000, fecha: '2026-09-18' },
    { tipo: 'ingreso', monto: 9000, fecha: '2026-09-01', eliminado: true }
  ];
  const members = [
    { estadoCuenta: 'activo', cuotaMensual: 3000, exento: false },
    { estadoCuenta: 'activo', cuotaMensual: 6000, exento: false },
    { estadoCuenta: 'inactivo', cuotaMensual: 10000, exento: false }
  ];

  const totals = summarizeLedger(ledger);
  const quotas = buildQuotaMetrics(members, 12000, 2026, new Date('2026-09-21T12:00:00Z'));
  const monthly = buildMonthlySeries(ledger);

  assert.deepEqual({ income: totals.income, expense: totals.expense, balance: totals.balance }, { income: 17000, expense: 4000, balance: 13000 });
  assert.equal(quotas.activeMembers, 2);
  assert.equal(quotas.monthlyExpected, 9000);
  assert.equal(quotas.annualExpected, 108000);
  assert.equal(quotas.expectedToDate, 81000);
  assert.equal(quotas.annualPending, 96000);
  assert.equal(quotas.overdueToDate, 69000);
  assert.equal(monthly[8].income, 17000);
  assert.equal(monthly[8].expense, 4000);
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
