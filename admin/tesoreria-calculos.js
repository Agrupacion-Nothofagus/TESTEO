export function summarizeLedger(rows = []) {
  const active = rows.filter((row) => !row.eliminado);
  const income = active.filter((row) => row.tipo === 'ingreso').reduce((sum, row) => sum + amount(row.monto), 0);
  const expense = active.filter((row) => row.tipo === 'egreso').reduce((sum, row) => sum + amount(row.monto), 0);
  return { income, expense, balance: income - expense, active };
}

export function buildQuotaMetrics(members = [], paid = 0, year = new Date().getFullYear(), referenceDate = new Date()) {
  const activeMembers = members.filter((member) => String(member.estadoCuenta || member.estado_cuenta || '').toLowerCase() !== 'inactivo');
  const chargeable = activeMembers.filter((member) => !member.exento);
  const currentYear = referenceDate.getFullYear();
  const dueMonths = Number(year) < currentYear ? 12 : Number(year) > currentYear ? 0 : referenceDate.getMonth() + 1;
  const focusMonth = Number(year) === currentYear ? referenceDate.getMonth() + 1 : 12;
  const applicable = (member, month) => !(member.mesesNoAplican || []).map(Number).includes(month);
  const monthlyExpected = chargeable.reduce((sum, member) => sum + (applicable(member, focusMonth) ? amount(member.cuotaMensual ?? member.cuota_mensual) : 0), 0);
  const annualExpected = chargeable.reduce((sum, member) => sum + (Number.isFinite(Number(member.cuotaAnualEsperada)) && member.cuotaAnualEsperada !== undefined
    ? amount(member.cuotaAnualEsperada)
    : amount(member.cuotaMensual ?? member.cuota_mensual) * Array.from({ length: 12 }, (_, index) => index + 1).filter((month) => applicable(member, month)).length), 0);
  const expectedToDate = chargeable.reduce((sum, member) => sum + amount(member.cuotaMensual ?? member.cuota_mensual) * Array.from({ length: dueMonths }, (_, index) => index + 1).filter((month) => applicable(member, month)).length, 0);
  const collected = amount(paid);
  const hasMemberTotals = chargeable.some((member) => member.totalPagado !== undefined);
  const annualPending = hasMemberTotals
    ? chargeable.reduce((sum, member) => sum + Math.max(amount(member.cuotaAnualEsperada ?? (member.cuotaMensual ?? member.cuota_mensual) * 12) - amount(member.totalPagado), 0), 0)
    : Math.max(annualExpected - collected, 0);
  const overdueToDate = hasMemberTotals
    ? chargeable.reduce((sum, member) => sum + Math.max(amount(member.cuotaMensual ?? member.cuota_mensual) * Array.from({ length: dueMonths }, (_, index) => index + 1).filter((month) => applicable(member, month)).length - amount(member.totalPagado), 0), 0)
    : Math.max(expectedToDate - collected, 0);

  return {
    activeMembers: activeMembers.length,
    chargeableMembers: chargeable.length,
    monthlyExpected,
    annualExpected,
    expectedToDate,
    collected,
    annualPending,
    overdueToDate,
    recoveryToDate: expectedToDate > 0 ? Math.min(100, Math.round((collected / expectedToDate) * 100)) : 0,
    recoveryAnnual: annualExpected > 0 ? Math.min(100, Math.round((collected / annualExpected) * 100)) : 0
  };
}

export function buildMonthlySeries(rows = [], labels = []) {
  const series = Array.from({ length: 12 }, (_, index) => ({ label: labels[index] || String(index + 1), income: 0, expense: 0 }));
  rows.filter((row) => !row.eliminado).forEach((row) => {
    const month = Number(String(row.fecha || '').slice(5, 7)) - 1;
    if (month < 0 || month > 11) return;
    if (row.tipo === 'egreso') series[month].expense += amount(row.monto);
    else series[month].income += amount(row.monto);
  });
  return series;
}

function amount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}
