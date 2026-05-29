# Agrupación Nothofagus Web

Sitio web institucional de Agrupación Nothofagus con sección dinámica de publicaciones y panel administrativo.

## Estructura principal

```text
index.html
styles.css
nav-access.css
scripts/publicaciones.js
admin/
functions/api/publicaciones/
schema.sql
wrangler.toml.example
```

## Funcionalidades

- Página institucional pública.
- Carrusel de publicaciones.
- Panel administrativo en `/admin/`.
- API para listar, crear, editar y eliminar publicaciones.
- Base de datos preparada para Cloudflare D1.
- Autorización mediante variable secreta `ADMIN_TOKEN`.

## Configuración en Cloudflare Pages

1. Crear o conectar el proyecto desde este repositorio.
2. Usar la rama `main`.
3. Framework preset: `None`.
4. Build command: dejar vacío.
5. Build output directory: `/`.

## Configurar Cloudflare D1

Crear una base de datos D1 llamada:

```text
nothofagus_cms
```

Luego ejecutar el contenido de:

```text
schema.sql
```

para crear la tabla `publicaciones`.

## Variables y bindings requeridos

En Cloudflare Pages, agregar el binding D1:

```text
Binding name: DB
Database: nothofagus_cms
```

Agregar una variable secreta:

```text
ADMIN_TOKEN = valor_privado_definido_por_la_organizacion
```

El token se ingresa desde el panel `/admin/` para poder crear, editar o eliminar publicaciones.

## Seguridad recomendada

Para una protección institucional más sólida, proteger la ruta:

```text
/admin/*
```

con Cloudflare Access / Zero Trust, permitiendo solo correos autorizados del dominio institucional.

## API

```text
GET    /api/publicaciones
GET    /api/publicaciones?admin=1
POST   /api/publicaciones
PUT    /api/publicaciones/:id
DELETE /api/publicaciones/:id
```

Las rutas `POST`, `PUT` y `DELETE` requieren encabezado:

```text
Authorization: Bearer ADMIN_TOKEN
```
