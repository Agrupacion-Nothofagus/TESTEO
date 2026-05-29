CREATE TABLE IF NOT EXISTS publicaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  resumen TEXT NOT NULL,
  contenido TEXT DEFAULT '',
  categoria TEXT DEFAULT 'Institucional',
  imagen TEXT DEFAULT '',
  enlace TEXT DEFAULT '',
  estado TEXT DEFAULT 'borrador',
  fecha TEXT NOT NULL,
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  actualizado_en TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_publicaciones_estado_fecha
ON publicaciones (estado, fecha DESC);

INSERT INTO publicaciones (titulo, resumen, contenido, categoria, imagen, enlace, estado, fecha)
SELECT
  'Sitio web institucional en etapa de prueba',
  'Iniciamos una versión preliminar del sitio web de Agrupación Nothofagus para validar estructura, contenidos y canales de contacto.',
  'Versión preliminar del sitio web institucional.',
  'Institucional',
  '',
  '#',
  'publicado',
  '2026-05-29'
WHERE NOT EXISTS (SELECT 1 FROM publicaciones);
