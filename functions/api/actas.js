const headers = { 'content-type': 'application/json; charset=utf-8' };

export async function onRequest({ request, env }) {
  return new Response(JSON.stringify({ ok: true, method: request.method }), { headers });
}
