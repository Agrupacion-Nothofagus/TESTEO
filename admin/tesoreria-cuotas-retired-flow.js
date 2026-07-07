(() => {
  if (window.__nothofagusCuotasRetiredFlow) return;
  window.__nothofagusCuotasRetiredFlow = true;

  const STORAGE_KEY = 'nothofagus_cuotas_integrantes_retirados_v1';
  const originalFetch = window.fetch.bind(window);

  patchFetch();
  bindRetirementActions();

  function patchFetch() {
    if (window.__nothofagusCuotasRetiredFetchPatched) return;
    window.__nothofagusCuotasRetiredFetchPatched = true;

    window.fetch = async (input, init = {}) => {
      const response = await originalFetch(input, init);
      const method = String(init?.method || 'GET').toUpperCase();
      const url = typeof input === 'string' ? input : input?.url || '';

      if (method !== 'GET' || !isCuotasUrl(url) || !response.ok) return response;

      try {
        const data = await response.clone().json();
        if (!Array.isArray(data.miembros)) return response;

        const normalized = normalizeCuotasResponse(data);
        return new Response(JSON.stringify(normalized), {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders(response)
        });
      } catch {
        return response;
      }
    };
  }

  function normalizeCuotasResponse(data) {
    const retired = readRetired();
    const allMembers = Array.isArray(data.miembros) ? data.miembros : [];
    const allPayments = collectPayments(allMembers);
    const visibleMembers = allMembers.filter((member) => !isRetired(member, retired));
    const summary = buildSummary(visibleMembers, allPayments);

    return {
      ...data,
      miembros: visibleMembers,
      pagosHistoricos: allPayments,
      resumen: {
        ...(data.resumen || {}),
        ...summary
      },
      flujoCuotas: {
        totalPagadoHistorico: summary.totalRecaudado,
        totalPendienteActivo: summary.saldoPendiente,
        integrantesActivos: summary.totalMiembros,
        integrantesRetirados: allMembers.length - visibleMembers.length
      }
    };
  }

  function collectPayments(members) {
    return members.flatMap((member) => {
      const pagos = Array.isArray(member.pagos) ? member.pagos : [];
      return pagos.map((pago) => ({
        ...pago,
        memberId: pago.memberId || pago.member_id || member.id,
        miembroNombre: member.nombre || '',
        miembroEstadoCuenta: member.estadoCuenta || member.estado_cuenta || 'activo'
      }));
    });
  }

  function buildSummary(visibleMembers, allPayments) {
    const totalRecaudado = allPayments.reduce((sum, pago) => sum + Number(pago.monto || 0), 0);
    return visibleMembers.reduce((acc, item) => {
      acc.totalMiembros += 1;
      if (item.estadoPago === 'al_dia') acc.alDia += 1;
      if (item.estadoPago === 'atrasado') acc.atrasados += 1;
      if (item.estadoPago === 'pagada_anual') acc.cuotasAnualesPagadas += 1;
      acc.saldoPendiente += Number(item.saldoPendiente || 0);
      return acc;
    }, { totalMiembros: 0, alDia: 0, atrasados: 0, cuotasAnualesPagadas: 0, totalRecaudado, saldoPendiente: 0 });
  }

  function bindRetirementActions() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-cuotas-nomina-remove]');
      if (!button) return;
      const row = button.closest?.('[data-nomina-row]');
      const id = row?.dataset?.nominaRow;
      if (!id) return;

      const retired = readRetired();
      retired[id] = {
        id,
        fecha: new Date().toISOString(),
        nombre: row.querySelector('.cuotas-nomina-persona strong')?.textContent?.trim() || ''
      };
      writeRetired(retired);
    }, true);

    document.addEventListener('submit', (event) => {
      if (!event.target.closest?.('[data-cuotas-nomina-form-fix]')) return;
      window.setTimeout(refreshCuotasMatrix, 900);
    }, true);
  }

  function refreshCuotasMatrix() {
    const year = document.querySelector('#tesoreria-cuotas-view [data-cuotas-year]');
    if (year) year.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function isRetired(member, retired) {
    const id = String(member.id || '');
    const account = String(member.estadoCuenta || member.estado_cuenta || '').toLowerCase();
    return Boolean(retired[id]) || account === 'inactivo';
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

  function readRetired() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeRetired(value) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value || {}));
  }
})();
