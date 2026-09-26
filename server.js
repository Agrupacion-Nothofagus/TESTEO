import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.join(ROOT, 'functions', 'api');
const PORT = parsePort(process.env.PORT);
const MAX_REQUEST_BYTES = 25 * 1024 * 1024;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BLOCKED_DIRECTORIES = new Set(['functions', 'node_modules', '.git']);
const BLOCKED_FILES = new Set([
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
  'package.json',
  'package-lock.json',
  'server.js',
  'readme.md',
  'docker_deploy.md',
  'wrangler.toml',
  'wrangler.toml.example'
]);
const BLOCKED_EXTENSIONS = new Set(['.sql', '.toml', '.yaml', '.yml', '.lock']);
const MIME_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

const apiRoutes = await discoverApiRoutes(API_ROOT);

export const server = createServer(async (incoming, outgoing) => {
  try {
    const url = requestUrl(incoming);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      await handleApi(incoming, outgoing, url);
      return;
    }

    await handleStatic(incoming, outgoing, url);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    if (status >= 500) console.error(error);
    sendJson(outgoing, status, { error: status === 500 ? 'Error interno del servidor.' : error.message });
  }
});

async function handleApi(incoming, outgoing, url) {
  const apiPath = url.pathname.slice('/api'.length) || '/';
  const match = matchApiRoute(apiPath);

  if (!match) {
    sendJson(outgoing, 404, { error: 'Ruta API no encontrada.' });
    return;
  }

  const method = String(incoming.method || 'GET').toUpperCase();
  const module = await import(pathToFileURL(match.file).href);
  const methodExport = `onRequest${method.charAt(0)}${method.slice(1).toLowerCase()}`;
  const handler = module[methodExport] || module.onRequest;

  if (typeof handler !== 'function') {
    sendJson(outgoing, 405, { error: 'Método no permitido.' }, { Allow: exportedMethods(module).join(', ') });
    return;
  }

  const request = await toWebRequest(incoming, url, method);
  const response = await handler({
    request,
    env: process.env,
    params: match.params,
    data: {},
    waitUntil(promise) {
      Promise.resolve(promise).catch((error) => console.error('waitUntil:', error));
    }
  });

  if (!(response instanceof Response)) {
    throw new TypeError(`La función ${path.relative(ROOT, match.file)} no devolvió un objeto Response.`);
  }

  await sendWebResponse(outgoing, response, method === 'HEAD');
}

async function handleStatic(incoming, outgoing, url) {
  const method = String(incoming.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) {
    sendJson(outgoing, 405, { error: 'Método no permitido.' }, { Allow: 'GET, HEAD' });
    return;
  }

  const segments = safeSegments(url.pathname);
  if (!segments || isBlockedStaticPath(segments)) {
    sendJson(outgoing, 404, { error: 'Recurso no encontrado.' });
    return;
  }

  if (segments.join('/') === 'scripts/supabase-config.js' && hasPublicSupabaseConfig()) {
    sendRuntimeSupabaseConfig(outgoing, method === 'HEAD');
    return;
  }

  let filePath = path.resolve(ROOT, ...segments);
  if (!isInsideRoot(filePath)) {
    sendJson(outgoing, 404, { error: 'Recurso no encontrado.' });
    return;
  }

  let fileStat = await stat(filePath).catch(() => null);
  if (fileStat?.isDirectory()) {
    if (!url.pathname.endsWith('/')) {
      outgoing.writeHead(308, {
        Location: `${url.pathname}/${url.search}`,
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      });
      outgoing.end();
      return;
    }
    filePath = path.join(filePath, 'index.html');
    fileStat = await stat(filePath).catch(() => null);
  }

  if (!fileStat?.isFile() || isBlockedStaticPath(path.relative(ROOT, filePath).split(path.sep))) {
    sendJson(outgoing, 404, { error: 'Recurso no encontrado.' });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES.get(extension);
  if (!contentType) {
    sendJson(outgoing, 404, { error: 'Recurso no encontrado.' });
    return;
  }

  outgoing.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': fileStat.size,
    'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff'
  });

  if (method === 'HEAD') {
    outgoing.end();
    return;
  }

  createReadStream(filePath).on('error', (error) => outgoing.destroy(error)).pipe(outgoing);
}

export async function toWebRequest(incoming, url, method) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }

  const options = { method, headers };
  if (BODY_METHODS.has(method)) options.body = await readBody(incoming);
  return new Request(url, options);
}

async function readBody(incoming) {
  const chunks = [];
  let size = 0;

  for await (const chunk of incoming) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw httpError('El cuerpo de la solicitud supera 25 MB.', 413);
    chunks.push(chunk);
  }

  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function sendWebResponse(outgoing, response, headOnly) {
  const headers = {};
  for (const [name, value] of response.headers) {
    if (!['connection', 'transfer-encoding'].includes(name.toLowerCase())) headers[name] = value;
  }

  if (typeof response.headers.getSetCookie === 'function') {
    const cookies = response.headers.getSetCookie();
    if (cookies.length) headers['set-cookie'] = cookies;
  }

  const body = headOnly || response.body === null ? null : Buffer.from(await response.arrayBuffer());
  if (body && headers['content-length'] === undefined) headers['content-length'] = body.length;
  outgoing.writeHead(response.status, headers);
  outgoing.end(body);
}

function requestUrl(incoming) {
  const forwardedProto = firstHeader(incoming.headers['x-forwarded-proto']);
  const forwardedHost = firstHeader(incoming.headers['x-forwarded-host']);
  const protocol = forwardedProto === 'https' ? 'https' : 'http';
  const host = forwardedHost || incoming.headers.host || `localhost:${PORT}`;
  return new URL(incoming.url || '/', `${protocol}://${host}`);
}

function firstHeader(value) {
  const text = Array.isArray(value) ? value[0] : value;
  return String(text || '').split(',')[0].trim();
}

function safeSegments(pathname) {
  try {
    const decoded = decodeURIComponent(pathname);
    if (decoded.includes('\\') || decoded.includes('\0')) return null;
    const segments = decoded.split('/').filter(Boolean);
    if (segments.some((segment) => segment === '.' || segment === '..')) return null;
    return segments;
  } catch {
    return null;
  }
}

function isBlockedStaticPath(segments) {
  const lower = segments.map((segment) => segment.toLowerCase());
  if (lower.some((segment) => segment.startsWith('.') || BLOCKED_DIRECTORIES.has(segment))) return true;
  const filename = lower.at(-1) || 'index.html';
  return BLOCKED_FILES.has(filename)
    || filename.startsWith('.env')
    || BLOCKED_EXTENSIONS.has(path.extname(filename));
}

function isInsideRoot(filePath) {
  const relative = path.relative(ROOT, filePath);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function hasPublicSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function sendRuntimeSupabaseConfig(outgoing, headOnly) {
  const source = [
    `export const SUPABASE_URL = ${jsSingleQuoted(process.env.SUPABASE_URL)};`,
    `export const SUPABASE_ANON_KEY = ${jsSingleQuoted(process.env.SUPABASE_ANON_KEY)};`,
    "export const SUPABASE_TABLE_PUBLICACIONES = 'publicaciones';",
    "export const SUPABASE_BUCKET_PUBLICACIONES = 'publicaciones';",
    '',
    'export function supabaseConfigurado() {',
    '  return (',
    "    SUPABASE_URL.startsWith('https://') &&",
    "    !SUPABASE_URL.includes('TU-PROYECTO') &&",
    '    SUPABASE_ANON_KEY &&',
    "    !SUPABASE_ANON_KEY.includes('TU_SUPABASE_ANON_KEY')",
    '  );',
    '}',
    ''
  ].join('\n');
  const body = Buffer.from(source);
  outgoing.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  outgoing.end(headOnly ? undefined : body);
}

function jsSingleQuoted(value) {
  return `'${String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replaceAll('\r', '\\r')
    .replaceAll('\n', '\\n')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')}'`;
}

async function discoverApiRoutes(directory) {
  const files = [];
  await walk(directory, files);
  return files.map(routeFromFile).sort((a, b) => b.score - a.score);
}

async function walk(directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(item, files);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(item);
  }
}

function routeFromFile(file) {
  let relative = path.relative(API_ROOT, file).replaceAll(path.sep, '/').replace(/\.js$/i, '');
  if (relative === 'index') relative = '';
  else relative = relative.replace(/\/index$/i, '');

  const names = [];
  let score = 0;
  const parts = relative ? relative.split('/') : [];
  const pattern = parts.map((part) => {
    const catchAll = part.match(/^\[\.\.\.(.+)]$/);
    const optionalCatchAll = part.match(/^\[\[\.\.\.(.+)]]$/);
    const dynamic = part.match(/^\[(.+)]$/);
    if (optionalCatchAll) {
      names.push(optionalCatchAll[1]);
      return '(.*)';
    }
    if (catchAll) {
      names.push(catchAll[1]);
      return '(.+)';
    }
    if (dynamic) {
      names.push(dynamic[1]);
      score += 1;
      return '([^/]+)';
    }
    score += 10;
    return escapeRegex(part);
  }).join('/');

  return { file, names, regex: new RegExp(`^/${pattern}/?$`), score };
}

function matchApiRoute(apiPath) {
  for (const route of apiRoutes) {
    const match = route.regex.exec(apiPath);
    if (!match) continue;
    const params = Object.fromEntries(route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])]));
    return { file: route.file, params };
  }
  return null;
}

function exportedMethods(module) {
  const methods = Object.keys(module)
    .filter((name) => /^onRequest[A-Z]/.test(name))
    .map((name) => name.slice('onRequest'.length).toUpperCase());
  return methods.length ? methods : ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sendJson(outgoing, status, body, extraHeaders = {}) {
  if (outgoing.headersSent) return outgoing.end();
  const payload = JSON.stringify(body);
  outgoing.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  outgoing.end(payload);
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function parsePort(value) {
  const port = Number(value || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT debe ser un puerto válido.');
  return port;
}

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Agrupación Nothofagus disponible en http://0.0.0.0:${PORT}`);
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
