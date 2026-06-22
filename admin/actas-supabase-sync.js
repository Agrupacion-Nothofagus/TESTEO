import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

// Sincroniza el módulo de actas existente con Supabase.
// Mantiene localStorage solo como caché local para no romper la interfaz ya construida.
if (!window.__nothofagusActasSupabaseSync) {
  window.__nothofagusActasSupabaseSync = true;

  const STORAGE_KEY = 'nothofagus_registro_actas_v1';
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

  let cacheActas = readLocalCache();
  let sincronizando = false;
  let cargaInicialCompletada = false;

  Storage.prototype.getItem = function patchedGetItem(key) {
    if (this === window.localStorage && key === STORAGE_KEY) {
      return JSON.stringify(cacheActas || []);
    }

    return originalGetItem.call(this, key);
  };

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    if (this === window.localStorage && key === STORAGE_KEY) {
      const anteriores = [...cacheActas];
      const siguientes = parseActas(value);

      cacheActas = siguientes;
      originalSetItem.call(this, key, JSON.stringify(cacheActas));

      if (!sincronizando && cargaInicialCompletada) {
        sincronizarCambios(anteriores, siguientes).catch((error) => {
          console.error('[Actas] No fue posible sincronizar con Supabase:', error);
          mostrarEstadoActasSync(error.message || 'No fue posible sincronizar el acta con Supabase.', false);
        });
      }

      return;
    }

    return originalSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function patchedRemoveItem(key) {
    if (this === window.localStorage && key === STORAGE_KEY) {
      const anteriores = [...cacheActas];
      cacheActas = [];
      originalRemoveItem.call(this, key);

      if (!sincronizando && cargaInicialCompletada) {
        sincronizarCambios(anteriores, []).catch((error) => {
          console.error('[Actas] No fue posible sincronizar eliminación con Supabase:', error);
        });
      }

      return;
    }

    return originalRemoveItem.call(this, key);
  };

  cargarActasDesdeSupabase();

  async function cargarActasDesdeSupabase() {
    try {
      const token = await getToken();
      if (!token) return;

      const localAntesDeCargar = [...cacheActas];
      const res = await fetch('/api/actas', {
        headers: { authorization: `Bearer ${token}` }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No fue posible cargar actas desde Supabase.');

      const remotas = Array.isArray(data.actas) ? data.actas.filter(Boolean) : [];

      if (!remotas.length && localAntesDeCargar.length) {
        cargaInicialCompletada = true;
        cacheActas = localAntesDeCargar;
        originalSetItem.call(window.localStorage, STORAGE_KEY, JSON.stringify(cacheActas));
        await sincronizarCambios([], localAntesDeCargar);
        mostrarEstadoActasSync('Actas locales migradas a Supabase.', true);
        refrescarVistaActas();
        return;
      }

      sincronizando = true;
      cacheActas = remotas;
      originalSetItem.call(window.localStorage, STORAGE_KEY, JSON.stringify(cacheActas));
      sincronizando = false;
      cargaInicialCompletada = true;

      refrescarVistaActas();
    } catch (error) {
      sincronizando = false;
      cargaInicialCompletada = true;
      console.error('[Actas] Error al cargar desde Supabase:', error);
      mostrarEstadoActasSync(error.message || 'No fue posible cargar actas desde Supabase.', false);
    }
  }

  async function sincronizarCambios(anteriores, siguientes) {
    const token = await getToken();
    if (!token) throw new Error('Sesión no disponible para sincronizar actas.');

    const anterioresMap = new Map(anteriores.map((item) => [String(item.id), item]));
    const siguientesMap = new Map(siguientes.map((item) => [String(item.id), item]));

    const eliminadas = anteriores.filter((item) => item?.id && !siguientesMap.has(String(item.id)));
    const guardadas = siguientes.filter((item) => {
      if (!item?.id) return false;
      const previa = anterioresMap.get(String(item.id));
      return !previa || JSON.stringify(previa) !== JSON.stringify(item);
    });

    for (const acta of guardadas) {
      await guardarActaRemota(acta, token);
    }

    for (const acta of eliminadas) {
      await eliminarActaRemota(acta.id, token);
    }

    if (guardadas.length || eliminadas.length) {
      mostrarEstadoActasSync('Actas sincronizadas con Supabase.', true);
    }
  }

  async function guardarActaRemota(acta, token) {
    const res = await fetch('/api/actas', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(acta)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No fue posible guardar el acta en Supabase.');

    if (data.acta?.id) {
      const index = cacheActas.findIndex((item) => String(item.id) === String(acta.id));
      if (index >= 0) {
        cacheActas[index] = data.acta;
        sincronizando = true;
        originalSetItem.call(window.localStorage, STORAGE_KEY, JSON.stringify(cacheActas));
        sincronizando = false;
      }
    }
  }

  async function eliminarActaRemota(id, token) {
    const res = await fetch(`/api/actas?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}` }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'No fue posible eliminar el acta en Supabase.');
  }

  async function getToken() {
    if (!client) return '';
    const { data } = await client.auth.getSession();
    return data?.session?.access_token || '';
  }

  function readLocalCache() {
    return parseActas(originalGetItem.call(window.localStorage, STORAGE_KEY) || '[]');
  }

  function parseActas(value) {
    try {
      const parsed = JSON.parse(String(value || '[]'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function refrescarVistaActas() {
    setTimeout(() => {
      document.querySelector('[data-acta-refrescar]')?.click();
    }, 180);
  }

  function mostrarEstadoActasSync(message, ok) {
    const box = document.querySelector('[data-actas-registro-status]') || document.querySelector('[data-actas-status]');
    if (!box) return;
    box.textContent = message;
    box.classList.toggle('success', Boolean(ok));
    box.classList.toggle('error', !ok);
  }
}
