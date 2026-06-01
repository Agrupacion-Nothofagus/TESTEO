import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_TABLE_PUBLICACIONES, supabaseConfigurado } from '../scripts/supabase-config.js';

const form = document.querySelector('#publication-form');
const status = document.querySelector('#form-status');
const imageInput = document.querySelector('#imagen');
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();

  if (!client) return show('Supabase no está configurado.', false);

  const bajada = document.querySelector('#resumen').value.trim();
  const record = {
    estado: document.querySelector('#estado').value,
    fecha: document.querySelector('#fecha').value,
    categoria: document.querySelector('#categoria').value,
    titulo: document.querySelector('#titulo').value.trim(),
    resumen: bajada,
    bajada,
    imagen_url: imageInput.value.trim(),
    contenido: document.querySelector('#contenido').value.trim(),
    fuentes_referencias: document.querySelector('#fuentes-referencias').value.trim(),
    enlace: document.querySelector('#enlace').value.trim()
  };

  const id = document.querySelector('#publicacion-id').value.trim();
  show('Guardando publicación...', true);

  try {
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

function show(message, ok) {
  status.textContent = message;
  status.classList.toggle('success', ok);
  status.classList.toggle('error', !ok);
}
