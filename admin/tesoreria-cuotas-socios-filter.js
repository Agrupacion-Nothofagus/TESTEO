(() => {
  if (window.__nothofagusCuotasSociosFilter) return;
  window.__nothofagusCuotasSociosFilter = true;

  const originalFetch = window.fetch.bind(window);
  let eligibleCache = { key: '', expires: 0, emails: null };

  window.fetch = async (input, init = {}) => {
    const response = await originalFetch(input, init);
    if (!shouldFilterCuotas(input, init, response)) return response;

    try {
      const data = await response.clone().json();
      if (!Array.isArray(data.miembros)) return response;

      const authorization = getAuthorization(input, init);
      const eligibleEmails = await getEligibleMemberEmails(authorization);
      if (!eligibleEmails) return response;

      const filtered = normalizeCuotasBySocioCategory(data, eligibleEmails);
      return new Response(JSON.stringify(filtered), {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders(response)
      });
    } catch {
      return response;
    }
  };

  function shouldFilterCuotas(input, init, response) {
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    if (method !== 'GET' || !response?.ok) return false;
    return isCuotasUrl(typeof input === 'string' ? input : input?.url || '');
  }

  function normalizeCuotasBySocioCategory(data, eligibleEmails) {
    const allMembers = Array.isArray(data.miembros) ? data.miembros : [];
    const visibleMembers = allMembers.filter((member) => eligibleEmails.has(normalizeEmail(member.correo)));
    const summary = buildSummary(visibleMembers);

    return {
      ...data,
      miembros: visibleMembers,
      resumen: {
        ...(data.resumen || {}),
        ...summary
      },
      filtroSociosCuotas: {
        criterio: 'Solo socios/as activos/as y socios/as benefactores/as con estado socio activo.',
        integrantesElegibles: visibleMembers.length,
        integrantesExcluidos: Math.max(allMembers.length - visibleMembers.length, 0)
      }
    };
  }

  async function getEligibleMemberEmails(authorization) {
    const cacheKey = authorization || 'no-auth';
    const now = Date.now();
    if (eligibleCache.key === cacheKey && eligibleCache.expires > now && eligibleCache.emails instanceof Set) {
      return eligibleCache.emails;
    }

    if (!authorization) return null;

    const response = await originalFetch('/api/miembros', {
      headers: { authorization }
    });

    if (!response.ok) return null;
    const data = await response.json().catch(() => ({}));
    const solicitudes = Array.isArray(data.solicitudes) ? data.solicitudes : [];
    const emails = new Set(
      solicitudes
        .filter(isEligibleRegistryMember)
        .map((item) => normalizeEmail(item.correo))
        .filter(Boolean)
    );

    eligibleCache = { key: cacheKey, expires: now + 60 * 1000, emails };
    return emails;
  }

  function isEligibleRegistryMember(item = {}) {
    const estado = normalizeText(item.estado);
    const estadoSocio = normalizeText(item.estado_socio || item.estadoSocio || 'activo');
    const category = normalizeText(item.categoria_socio || item.categoriaSocio || item.tipo_socio || item.tipoSocio || '');
    const isMember = estado === 'miembro' || estado === 'aceptado';
    const isActive = !estadoSocio || estadoSocio === 'activo';
    const isAllowedCategory = category.includes('activo') || category.includes('benefactor');
    return isMember && isActive && isAllowedCategory;
  }

  function buildSummary(members) {
    return members.reduce((acc, item) => {
      acc.totalMiembros += 1;
      if (item.estadoPago === 'al_dia') acc.alDia += 1;
      if (item.estadoPago === 'atrasado') acc.atrasados += 1;
      if (item.estadoPago === 'pagada_anual') acc.cuotasAnualesPagadas += 1;
      acc.totalRecaudado += Number(item.totalPagado || 0);
      acc.saldoPendiente += Number(item.saldoPendiente || 0);
      return acc;
    }, { totalMiembros: 0, alDia: 0, atrasados: 0, cuotasAnualesPagadas: 0, totalRecaudado: 0, saldoPendiente: 0 });
  }

  function getAuthorization(input, init) {
    const fromInit = readHeader(init?.headers, 'authorization');
    if (fromInit) return fromInit;
    return readHeader(input?.headers, 'authorization');
  }

  function readHeader(headers, name) {
    if (!headers) return '';
    if (typeof headers.get === 'function') return headers.get(name) || '';
    const key = Object.keys(headers).find((item) => item.toLowerCase() === name.toLowerCase());
    return key ? String(headers[key] || '') : '';
  }

  function isCuotasUrl(url) {
    try {
      return new URL(url, location.origin).pathname === '/api/cuotas-miembros';
    } catch {
      return String(url || '').includes('/api/cuotas-miembros');
    }
  }

  function responseHeaders(response) {
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json; charset=utf-8');
    return headers;
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }
})();
