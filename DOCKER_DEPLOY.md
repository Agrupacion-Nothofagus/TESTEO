# Despliegue con Docker

El contenedor ejecuta Node.js 20, sirve el sitio estático y adapta las funciones de `functions/api/` al mismo origen bajo `/api/*`. Las funciones reciben un `Request` web estándar y `process.env` como `env`, por lo que mantienen soporte para `Response`, `Headers`, `FormData`, JSON y cargas `multipart/form-data`.

## Configuración

1. Copiar el archivo de ejemplo:

   ```bash
   cp .env.example .env
   ```

2. Completar al menos estas variables en `.env`:

   ```dotenv
   PORT=8080
   SUPABASE_URL=https://TU-PROYECTO.supabase.co
   SUPABASE_ANON_KEY=TU_SUPABASE_ANON_KEY
   SUPABASE_ADMIN_KEY=TU_SUPABASE_SERVICE_ROLE_KEY
   ADMIN_EMAILS=admin@agrupacionnothofagus.cl
   ```

`SUPABASE_ADMIN_KEY` solo se entrega a las funciones del servidor. `.env`, `functions/`, los archivos Docker, SQL, Git y Node quedan bloqueados por el servidor y excluidos del contexto público. No coloque la clave administrativa en ningún archivo dentro de `scripts/`, `admin/` ni otro JavaScript cargado por el navegador.

El servidor genera `/scripts/supabase-config.js` en memoria usando únicamente `SUPABASE_URL` y `SUPABASE_ANON_KEY`, que son datos públicos necesarios para el cliente. La clave `SUPABASE_ADMIN_KEY` nunca se incluye. Si las variables públicas no están definidas, se sirve el archivo estático existente como compatibilidad local.

Para habilitar el envío de correo del formulario de contacto, configure también `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` y `CONTACT_TO_EMAIL`.

## Levantar el servicio

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f web
```

## Pruebas rápidas

Abrir en el navegador:

- <http://localhost:8080>
- <http://localhost:8080/admin>
- <http://localhost:8080/api/tesoreria>
- <http://localhost:8080/api/cuotas-miembros>

Las dos rutas administrativas devolverán `401` sin un token de sesión Supabase válido. Esto confirma que la API responde y conserva la protección existente. Pruebas con `curl`:

```bash
curl -i http://localhost:8080/api/ping
curl -i http://localhost:8080/api/no-existe
curl -i -X OPTIONS http://localhost:8080/api/tesoreria
curl -i -H "Authorization: Bearer TOKEN_DE_SESION" http://localhost:8080/api/tesoreria
curl -i -H "Authorization: Bearer TOKEN_DE_SESION" "http://localhost:8080/api/cuotas-miembros?anio=2026"
```

Ejecutar las pruebas automatizadas con Node 20:

```bash
npm test
```

## Actualización y parada

```bash
git pull --ff-only
docker compose up -d --build
```

```bash
docker compose down
```

## API editorial heredada

`functions/api/publicaciones/[id].js` fue adaptada para guardar y eliminar mediante Supabase REST, eliminando su dependencia del binding D1 de Cloudflare. Mantiene la autorización heredada `Authorization: Bearer ADMIN_TOKEN`; complete `ADMIN_TOKEN` si todavía utiliza esa ruta. El frontend actual administra publicaciones directamente con sesiones de Supabase.
