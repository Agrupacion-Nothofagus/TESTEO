import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_TABLE_PUBLICACIONES,
  SUPABASE_BUCKET_PUBLICACIONES,
  supabaseConfigurado
} from '../scripts/supabase-config.js';

const form = document.querySelector('#publication-form');
const status = document.querySelector('#form-status');
const coverInput = document.querySelector('#imagen');
const coverFile = document.querySelector('#imagen-file');
const extraFiles = document.querySelector('#imagenes-complementarias-file');
const extraUrls = document.querySelector('#imagenes-complementarias');
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const CATEGORIAS = ['Institución', 'Labor social', 'Actualidad', 'Ensayo', 'Columna de opinión', 'Memoria institucional'];

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();

  if (!client) return show('Supabase no está configurado.', false);

  show('Guardando publicación...', true);

  try {
    const coverUrl = await uploadSingleImage(coverFile?.files?.[0], 'portada');
    if (coverUrl) coverInput.value = coverUrl;

    if (!coverInput.value.trim()) {
      throw new Error('Debes subir una imagen de portada JPG/PNG o mantener una URL existente.');
    }

    const complementaryUploaded = await uploadComplementaryImages();
    const complementaryManual = parseUrls(extraUrls.value);
    const complementaryUrls = [...complementaryManual, ...complementaryUploaded];

    extraUrls.value = complementaryUrls.join('\n');

    const bajada = document.querySelector('#resumen').value.trim();
    const record = {
      estado: document.querySelector('#estado').value,
      fecha: document.querySelector('#fecha').value,
      categoria: normalizeCategory(document.querySelector('#categoria').value),
      titulo: document.querySelector('#titulo').value.trim(),
      resumen: bajada,
      bajada,
      contenido: document.querySelector('#contenido').value.trim(),
      fuentes_referencias: document.querySelector('#fuentes-referencias').value.trim(),
      imagen_url: coverInput.value.trim(),
      imagenes_complementarias: complementaryUrls,
      enlace: document.querySelector('#enlace').value.trim()
    };

    const id = document.querySelector('#publicacion-id').value.trim();
    const response = id
      ? await client.from(SUPABASE_TABLE_PUBLICACIONES).update(record).eq('id', id)
      : await client.from(SUPABASE_TABLE_PUBLICACIONES).insert(record);

    if (response.error) throw response.error;
    show('Publicación guardada correctamente.', true);
    setTimeout(() => window.location.reload(), 900);
  } catch (error) {
    show(error.message || 'No fue posible guardar la publicación.', false);
  }
}, true);

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  const action = button?.getAttribute('onclick') || '';
  const match = action.match(/editarPublicacion\((\d+)\)/);
  if (!match || !client) return;

  setTimeout(() => fillEditorialFields(match[1]), 120);
});

async function fillEditorialFields(id) {
  const response = await client.from(SUPABASE_TABLE_PUBLICACIONES).select('*').eq('id', id).single();
  if (response.error || !response.data) return;

  const item = response.data;
  document.querySelector('#categoria').value = normalizeCategory(item.categoria);
  document.querySelector('#resumen').value = item.bajada || item.resumen || '';
  document.querySelector('#contenido').value = item.contenido || '';
  document.querySelector('#fuentes-referencias').value = item.fuentes_referencias || '';
  coverInput.value = item.imagen_url || '';
  extraUrls.value = Array.isArray(item.imagenes_complementarias)
    ? item.imagenes_complementarias.join('\n')
    : '';
}

async function uploadComplementaryImages() {
  const files = Array.from(extraFiles?.files || []);
  const urls = [];

  for (const file of files) {
    const url = await uploadSingleImage(file, 'complementaria');
    if (url) urls.push(url);
  }

  return urls;
}

async function uploadSingleImage(file, folder) {
  if (!file) return '';
  validateImage(file);
  show(folder === 'portada' ? 'Subiendo imagen de portada...' : 'Subiendo imagen complementaria...', true);

  const extension = file.type === 'image/png' ? 'png' : 'jpg';
  const title = document.querySelector('#titulo').value || 'publicacion';
  const path = `publicaciones/${folder}/${slug(title)}-${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
  const upload = await client.storage.from(SUPABASE_BUCKET_PUBLICACIONES).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type
  });

  if (upload.error) throw upload.error;

  const { data } = client.storage.from(SUPABASE_BUCKET_PUBLICACIONES).getPublicUrl(path);
  return data?.publicUrl || '';
}

function parseUrls(value) {
  return String(value || '')
    .split('\n')
    .map((url) => url.trim())
    .filter(Boolean);
}

function validateImage(file) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Solo se aceptan imágenes JPG o PNG.');
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error('La imagen supera los 5 MB. Usa una imagen más liviana.');
  }
}

function normalizeCategory(category) {
  return CATEGORIAS.includes(category) ? category : 'Institución';
}

function slug(value) {
  return String(value || 'publicacion')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'publicacion';
}

function show(message, ok) {
  status.textContent = message;
  status.classList.toggle('success', ok);
  status.classList.toggle('error', !ok);
}