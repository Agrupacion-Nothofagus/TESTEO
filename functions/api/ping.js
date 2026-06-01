export function onRequest() {
  return new Response(JSON.stringify({ ok: true, service: 'Agrupacion Nothofagus API' }), {
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });
}
