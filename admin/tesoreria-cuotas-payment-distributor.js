(() => {
  if (window.__nothofagusCuotasPaymentDistributor) return;
  window.__nothofagusCuotasPaymentDistributor = true;

  const MATRIX_STATUS_KEY = 'nothofagus_cuotas_month_status_overrides_v1';
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const response = await originalFetch(input, init);
    if (!shouldNormalize(input, init, response)) return response;

    try {
      const data = await response.clone().json();
      const normalized = normalizeCuotasResponse(data);
      if (!normalized) return response;
      return new Response(JSON.stringify(normalized), {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders(response)
      });
    } catch {
      return response;
    }
  };

  function shouldNormalize(input, init, response) {
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    if (method !== 'GET' || !response?.ok) return false;
    const url = typeof input === 'string' ? input : input?.url || '';
    try { return new URL(url, location.origin).pathname === '/api/cuotas-miembros'; } catch { return String(url).includes('/api/cuotas-miembros'); }
  }

  function normalizeCuotasResponse(data) {
    if (!data || data.__cuotasPaymentDistributed) return data;
    const members = Array.isArray(data.miembros) ? data.miembros : [];
    if (!members.length) return { ...data, __cuotasPaymentDistributed: true };

    const overrides = readOverrides();
    if (!Object.keys(overrides).length) return { ...data, __cuotasPaymentDistributed: true };

    const memberMap = new Map(members.map((member) => [String(member.id || ''), member]));
    const byMemberPaidMonths = paidMonthsByMember(overrides);
    const changedPaymentsByMember = new Map();

    const normalizedMembers = members.map((member) => {
      const pagos = Array.isArray(member.pagos) ? member.pagos : [];
      const normalizedPayments = distributePaymentsForMember(member, pagos, byMemberPaidMonths);
      changedPaymentsByMember.set(String(member.id || ''), normalizedPayments);
      return { ...member, pagos: normalizedPayments };
    });

    const historic = Array.isArray(data.pagosHistoricos) ? data.pagosHistoricos : [];
    const normalizedHistoric = historic.length
      ? historic.flatMap((payment) => {
          const memberId = String(payment.memberId || payment.member_id || '');
          const member = memberMap.get(memberId);
          if (!member) return [payment];
          return distributeSinglePayment(member, payment, byMemberPaidMonths);
        })
      : historic;

    return {
      ...data,
      miembros: normalizedMembers,
      pagosHistoricos: normalizedHistoric,
      __cuotasPaymentDistributed: true
    };
  }

  function distributePaymentsForMember(member, pagos, byMemberPaidMonths) {
    return pagos.flatMap((payment) => distributeSinglePayment(member, payment, byMemberPaidMonths));
  }

  function distributeSinglePayment(member, payment, byMemberPaidMonths) {
    const memberId = String(payment.memberId || payment.member_id || member.id || '');
    const year = Number(payment.anio || member.anio || new Date().getFullYear());
    const type = String(payment.tipoPago || payment.tipo_pago || 'mensual').toLowerCase();
    const cuota = Number(member.cuotaMensual || member.cuota_mensual || 0);
    const amount = Number(payment.monto || 0);
    if (!memberId || !year || type === 'anual' || !cuota || amount <= cuota) return [payment];

    const paidMonths = Array.from(byMemberPaidMonths.get(`${memberId}:${year}`) || []);
    const currentMonth = Number(payment.mes || 0);
    const months = Array.from(new Set([...paidMonths, currentMonth].filter((month) => month >= 1 && month <= 12))).sort((a, b) => a - b);
    if (months.length <= 1) return [payment];

    let remaining = amount;
    const parts = [];
    months.forEach((month) => {
      if (remaining <= 0) return;
      const slice = Math.min(cuota, remaining);
      remaining -= slice;
      parts.push({
        ...payment,
        id: `${payment.id || memberId}-${year}-${month}-dist`,
        memberId,
        member_id: memberId,
        mes: month,
        anio: year,
        monto: slice,
        observacion: payment.observacion || payment.observaciones || 'Distribución automática de pago multicuota'
      });
    });

    if (remaining > 0) {
      const last = parts[parts.length - 1] || { ...payment, memberId, member_id: memberId, mes: currentMonth || months[0], anio: year, monto: 0 };
      last.monto = Number(last.monto || 0) + remaining;
    }

    return parts.length ? parts : [payment];
  }

  function paidMonthsByMember(overrides) {
    const map = new Map();
    Object.entries(overrides || {}).forEach(([key, status]) => {
      if (status !== 'pagado') return;
      const [memberId, year, monthRaw] = String(key).split(':');
      const month = Number(monthRaw || 0);
      if (!memberId || !year || month < 1 || month > 12) return;
      const mapKey = `${memberId}:${year}`;
      if (!map.has(mapKey)) map.set(mapKey, new Set());
      map.get(mapKey).add(month);
    });
    return map;
  }

  function readOverrides() {
    try { return JSON.parse(localStorage.getItem(MATRIX_STATUS_KEY) || '{}') || {}; } catch { return {}; }
  }

  function responseHeaders(response) {
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json; charset=utf-8');
    return headers;
  }
})();
