import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuotaMetrics, summarizeLedger } from '../admin/tesoreria-calculos.js';
import { onRequest as cuotasRequest } from '../functions/api/cuotas-miembros.js';
import { onRequest as tesoreriaRequest } from '../functions/api/tesoreria.js';

const env = { SUPABASE_URL: 'https://auditoria.supabase.co', SUPABASE_ADMIN_KEY: 'sb_secret_prueba' };
const auth = { authorization: 'Bearer prueba' };

test('No aplica reduce el esperado y el sobrepago de otra persona no oculta la deuda', async () => {
  const originalFetch = globalThis.fetch;
  const members = [
    { id: 'm1', nombre: 'Integrante A', correo: 'a@example.cl', estado_cuenta: 'activo', cuota_mensual: 1000, exento: false },
    { id: 'm2', nombre: 'Integrante B', correo: 'b@example.cl', estado_cuenta: 'activo', cuota_mensual: 2000, exento: false }
  ];
  const payments = [
    { id: 'p1', member_id: 'm1', anio: 2026, mes: 6, monto: 1000, fecha_pago: '2026-06-20', tipo_pago: 'mensual' },
    { id: 'p2', member_id: 'm2', anio: 2026, mes: 0, monto: 26000, fecha_pago: '2026-06-20', tipo_pago: 'anual' }
  ];
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/auth/v1/user')) return Response.json({ email: 'tesoreria@example.cl', user_metadata: { rol: 'tesorero' } });
    if (target.includes('/tesoreria_cuotas_miembros?select=')) return Response.json(members);
    if (target.includes('/tesoreria_cuotas_pagos?select=')) return Response.json(payments);
    if (target.includes('/tesoreria_cuotas_estados?select=')) return Response.json(
      Array.from({ length: 5 }, (_, index) => ({ member_id: 'm1', mes: index + 1, estado_nuevo: 'sin_registro', eliminado: false }))
    );
    return Response.json({ message: `Ruta inesperada: ${target}` }, { status: 500 });
  };
  try {
    const response = await cuotasRequest({ request: new Request('http://localhost/api/cuotas-miembros?anio=2026&sync=0&include_files=0', { headers: auth }), env });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.miembros[0].cuotaAnualEsperada, 7000);
    assert.deepEqual(data.miembros[0].mesesNoAplican, [1, 2, 3, 4, 5]);
    assert.equal(data.miembros[0].saldoPendiente, 6000);
    assert.equal(data.miembros[1].saldoPendiente, 0);
    assert.equal(data.resumen.totalRecaudado, 27000);
    assert.equal(data.resumen.esperadoAnual, 31000);
    assert.equal(data.resumen.saldoPendiente, 6000);

    const metrics = buildQuotaMetrics(data.miembros, data.resumen.totalRecaudado, 2026, new Date('2026-09-24T12:00:00'));
    assert.equal(metrics.monthlyExpected, 3000);
    assert.equal(metrics.expectedToDate, 22000);
    assert.equal(metrics.annualPending, 6000);
    assert.equal(metrics.overdueToDate, 3000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Un abono parcial no marca el mes como pagado ni permite excluir su obligación', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/auth/v1/user')) return Response.json({ email: 'tesoreria@example.cl', user_metadata: { rol: 'tesorero' } });
    if (target.includes('/tesoreria_cuotas_miembros?select=')) return Response.json([{ id: 'm1', nombre: 'Integrante A', correo: 'a@example.cl', estado_cuenta: 'activo', cuota_mensual: 1000, exento: false }]);
    if (target.includes('/tesoreria_cuotas_pagos?select=')) return Response.json([{ id: 'p1', member_id: 'm1', anio: 2026, mes: 7, monto: 500, fecha_pago: '2026-07-20', tipo_pago: 'mensual' }]);
    if (target.includes('/tesoreria_cuotas_estados?select=')) return Response.json([{ member_id: 'm1', mes: 7, estado_nuevo: 'sin_registro', eliminado: false }]);
    return Response.json({ error: 'Ruta inesperada' }, { status: 500 });
  };
  try {
    const response = await cuotasRequest({ request: new Request('http://localhost/api/cuotas-miembros?anio=2026&sync=0&include_files=0', { headers: auth }), env });
    assert.equal(response.status, 200);
    const { miembros, resumen } = await response.json();
    assert.deepEqual(miembros[0].mesesNoAplican, []);
    assert.equal(miembros[0].mesesPagados, 0);
    assert.equal(miembros[0].totalPagado, 500);
    assert.equal(miembros[0].saldoPendiente, 11500);
    assert.equal(resumen.esperadoAnual, 12000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Tesorería pagina más de mil movimientos y excluye los eliminados', async () => {
  const originalFetch = globalThis.fetch;
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: String(index), tipo: 'ingreso', fecha: '2026-09-01', monto: 1, eliminado: false }));
  let pageCalls = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/auth/v1/user')) return Response.json({ email: 'tesoreria@example.cl', user_metadata: { rol: 'tesorero' } });
    if (target.includes('/tesoreria_movimientos?')) {
      pageCalls += 1;
      return Response.json(target.includes('offset=1000') ? [{ id: '1000', tipo: 'egreso', fecha: '2026-09-01', monto: 2, eliminado: true }] : firstPage);
    }
    return Response.json({ message: `Ruta inesperada: ${target}` }, { status: 500 });
  };
  try {
    const response = await tesoreriaRequest({ request: new Request('http://localhost/api/tesoreria?include_files=0', { headers: auth }), env });
    assert.equal(response.status, 200);
    const { movimientos } = await response.json();
    assert.equal(pageCalls, 2);
    assert.equal(movimientos.length, 1001);
    assert.deepEqual(summarizeLedger(movimientos).balance, 1000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Un monto fraccionario o no finito no entra al libro en pesos chilenos', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/auth/v1/user')) return Response.json({ email: 'tesoreria@example.cl', user_metadata: { rol: 'tesorero' } });
    if (target.includes('/tesoreria_cuotas_miembros?id=eq.m1')) return Response.json([{ id: 'm1', nombre: 'Integrante A' }]);
    throw new Error(`No debía escribirse: ${target}`);
  };
  try {
    const cuota = await cuotasRequest({ request: new Request('http://localhost/api/cuotas-miembros', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'payment', member_id: 'm1', anio: 2026, mes: 7, monto: 1000.5 }) }), env });
    assert.equal(cuota.status, 400);
    const movimiento = await tesoreriaRequest({ request: new Request('http://localhost/api/tesoreria', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ tipo: 'ingreso', monto: 'Infinity', descripcion: 'Prueba' }) }), env });
    assert.equal(movimiento.status, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
