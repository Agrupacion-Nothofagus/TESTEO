import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

(() => {
  if (window.__nothofagusCuotasBenefactores) return;
  window.__nothofagusCuotasBenefactores = true;

  const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
  const API_CUOTAS = '/api/cuotas-miembros';
  const API_MIEMBROS = '/api/miembros';
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const months = ['Pago anual','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const short = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const state = { year: currentYear, month: currentMonth, members: [], perms: { write: false }, loaded: false };

  loadStyles();
  mountView();
  mountMenu();
  bind();
  if (location.hash === '#tesoreria-benefactores') activate();

  function loadStyles() {
    [['tesoreria-cuotas.css?v=20260706-base','cuotasBase'],['tesoreria-cuotas-monthly-dashboard.css?v=20260706-monthly','cuotasMonthly']].forEach(([href,key]) => {
      if (document.querySelector(`link[data-${key}]`)) return;
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = href; link.dataset[key] = 'true'; document.head.appendChild(link);
    });
  }

  function mountMenu() {
    const add = () => {
      const menu = document.querySelector('[data-tesoreria-menu]');
      if (!menu || document.querySelector('[data-tesoreria-open="benefactores"]')) return false;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'sidebar-link tesoreria-sidebar-link'; b.dataset.tesoreriaOpen = 'benefactores';
      b.innerHTML = '<span>🌱</span>Cuotas benefactores';
      b.addEventListener('click', activate);
      menu.appendChild(b);
      return true;
    };
    if (add()) return;
    const obs = new MutationObserver(() => { if (add()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(add, 600); window.setTimeout(add, 1500);
  }

  function mountView() {
    const content = document.querySelector('.admin-content');
    if (!content || document.querySelector('#tesoreria-benefactores-view')) return;
    const section = document.createElement('section');
    section.className = 'admin-view tesoreria-view cuotas-view';
    section.id = 'tesoreria-benefactores-view';
    section.dataset.viewTitle = 'Cuotas de Socios Benefactores';
    section.dataset.viewDescription = 'Matriz mensual exclusiva para socios/as benefactores/as.';
    section.innerHTML = `<div class="admin-panel cuotas-monthly-dashboard"><header class="cuotas-dashboard-header"><div><p class="section-tag">Tesorería · Benefactores</p><h3>Matriz mensual de socios benefactores</h3><p>Control separado para cuotas y aportes de la categoría benefactor.</p></div><div class="cuotas-header-actions"><label class="cuotas-year-pill"><span>📅</span><select data-b-year>${years()}</select></label><button type="button" data-b-nomina>🌱 Nómina</button><button type="button" data-b-refresh>↻ Actualizar</button></div></header><section class="cuotas-kpi-grid" data-b-summary></section><section class="cuotas-dashboard-layout"><main class="cuotas-main-column"><section class="cuotas-filter-panel"><label>Buscar<input type="search" data-b-search placeholder="Buscar benefactor/a..."></label><label>Mes<select data-b-month>${monthOptions()}</select></label><button type="button" class="secondary" data-b-clear>Limpiar filtros</button></section><p class="admin-status tesoreria-status" data-b-status aria-live="polite"></p><section class="cuotas-table-card cuotas-monthly-matrix-card"><div class="cuotas-card-heading"><div><h4>Matriz mensual de pagos por socio benefactor</h4><p>Solo socios/as benefactores/as activos/as.</p></div><div class="cuotas-legend"><span><i class="status-dot pagado"></i>Pagado</span><span><i class="status-dot pendiente"></i>Pendiente</span><span><i class="status-dot atrasado"></i>Atrasado</span><span><i class="status-dot sin_registro"></i>Sin registro</span></div></div><div class="cuotas-table-wrap" data-b-table></div></section><section class="cuotas-secondary-grid"><article class="cuotas-side-card cuotas-annual-summary-card" data-b-annual></article><article class="cuotas-side-card cuotas-recent-card" data-b-recent></article></section></main><aside class="cuotas-side-panel"><article class="cuotas-side-card" data-b-month-summary></article><article class="cuotas-side-card"><h4>Nómina benefactores</h4><p class="cuotas-empty compact">Edita cuota mensual, estado de cuenta, exención y datos de contacto.</p><div class="cuotas-quick-buttons"><button type="button" data-b-nomina>Editar nómina <span>›</span></button></div></article></aside></section></div><div class="cuotas-modal-backdrop" data-b-modal aria-hidden="true"></div>`;
    content.appendChild(section);
  }

  function bind() {
    document.addEventListener('click', async (e) => {
      if (e.target.closest?.('[data-tesoreria-open="benefactores"]')) { e.preventDefault(); await activate(); }
      if (e.target.closest?.('[data-b-refresh]')) { e.preventDefault(); await load(true); }
      if (e.target.closest?.('[data-b-clear]')) { e.preventDefault(); const s = document.querySelector('[data-b-search]'); if (s) s.value = ''; render(); }
      if (e.target.closest?.('[data-b-nomina]')) { e.preventDefault(); openNomina(); }
      if (e.target.matches?.('[data-b-modal]') || e.target.closest?.('[data-b-close]')) { e.preventDefault(); closeModal(); }
    }, true);
    document.addEventListener('input', (e) => { if (e.target.matches?.('[data-b-search]')) render(); }, true);
    document.addEventListener('change', async (e) => { if (e.target.matches?.('[data-b-month]')) { state.month = Number(e.target.value || currentMonth); render(); } if (e.target.matches?.('[data-b-year]')) { state.year = Number(e.target.value || currentYear); await load(true); } }, true);
    document.addEventListener('submit', async (e) => { const f = e.target.closest?.('[data-b-form]'); if (!f) return; e.preventDefault(); await saveNomina(f); }, true);
  }

  async function activate() {
    const view = document.querySelector('#tesoreria-benefactores-view'); if (!view) return;
    openTreasury();
    document.querySelectorAll('.admin-view').forEach((x) => x.classList.toggle('is-active', x.id === 'tesoreria-benefactores-view'));
    document.querySelectorAll('.sidebar-nav .is-active').forEach((x) => x.classList.remove('is-active'));
    document.querySelector('[data-tesoreria-toggle]')?.classList.add('is-active');
    document.querySelector('[data-tesoreria-open="benefactores"]')?.classList.add('is-active');
    const t = document.querySelector('#admin-view-title'); const d = document.querySelector('#admin-view-description');
    if (t) t.textContent = view.dataset.viewTitle; if (d) d.textContent = view.dataset.viewDescription;
    location.hash = 'tesoreria-benefactores';
    if (!state.loaded) await load(true);
  }

  async function load(force = false) {
    if (!force && state.loaded) return;
    setStatus('Cargando socios benefactores...', true);
    try {
      const [cuotas, miembros] = await Promise.all([api(`${API_CUOTAS}?anio=${encodeURIComponent(state.year)}`), api(API_MIEMBROS)]);
      state.perms = cuotas.permisos || state.perms;
      const emails = benefactorEmails(miembros.solicitudes || []);
      state.members = (cuotas.miembros || []).filter((m) => emails.has(email(m.correo)) && String(m.estadoCuenta || '').toLowerCase() !== 'inactivo');
      state.loaded = true;
      render(); setStatus('Matriz de benefactores actualizada.', true);
    } catch (err) { state.loaded = false; setStatus(err.message || 'No fue posible cargar benefactores.', false); renderEmpty(err.message || 'No fue posible cargar benefactores.'); }
  }

  function benefactorEmails(items) {
    const set = new Set();
    items.forEach((x) => {
      const e = email(x.correo); const estado = txt(x.estado); const socio = txt(x.estado_socio || x.estadoSocio || 'activo'); const cat = txt(x.categoria_socio || x.categoriaSocio || '');
      if (e && (estado === 'miembro' || estado === 'aceptado') && (!socio || socio === 'activo') && cat.includes('benefactor')) set.add(e);
    });
    return set;
  }

  function render() {
    const items = filtered(); const s = summary(items);
    renderSummary(s); renderTable(items); renderMonthSummary(s); renderAnnual(s); renderRecent(items);
  }

  function filtered() { const q = txt(document.querySelector('[data-b-search]')?.value || ''); return state.members.filter((m) => !q || txt(`${m.nombre} ${m.correo} ${m.rut}`).includes(q)); }
  function summary(items) { const cobrables = items.filter((m) => !m.exento); const esperado = cobrables.reduce((a,m)=>a+Number(m.cuotaMensual||0),0); const recibido = items.reduce((a,m)=>a+monthPayments(m,state.month).reduce((b,p)=>b+Number(p.monto||0),0),0); const total = items.reduce((a,m)=>a+Number(m.totalPagado||0),0); const anual = cobrables.reduce((a,m)=>a+Number(m.cuotaMensual||0)*12,0); return { count: items.length, esperado, recibido, pendiente: Math.max(esperado-recibido,0), total, anual, saldo: Math.max(anual-total,0), pct: esperado ? Math.round((recibido/esperado)*1000)/10 : 0 }; }
  function renderSummary(s) { const box = document.querySelector('[data-b-summary]'); if (!box) return; box.innerHTML = [kpi('Benefactores activos',s.count,'Categoría benefactor','🌱'), kpi('Esperado mensual',money(s.esperado),'Mes seleccionado','💵'), kpi('Recibido del mes',money(s.recibido),`${s.pct}% del esperado`,'✅'), kpi('Pendiente del mes',money(s.pendiente),'Por cobrar','🕘'), kpi('Recaudado anual',money(s.total),'Pagos registrados','📈'), kpi('Saldo anual',money(s.saldo),'Pendiente anual','⚠️')].join(''); }
  function renderTable(items) { const box = document.querySelector('[data-b-table]'); if (!box) return; if (!items.length) { box.innerHTML = '<p class="cuotas-empty">No hay socios/as benefactores/as para mostrar.</p>'; return; } box.innerHTML = `<table class="cuotas-monthly-table"><thead><tr><th>Socio benefactor</th><th>Estado</th><th>Cuota mensual</th>${short.map(m=>`<th>${m}</th>`).join('')}<th>Total pagado</th><th>Saldo pendiente</th></tr></thead><tbody>${items.map(row).join('')}</tbody></table>`; }
  function row(m) { return `<tr><td data-label="Socio benefactor"><div class="cuotas-member-name"><span class="avatar-mini">${initials(m.nombre)}</span><div><strong>${esc(m.nombre)}</strong><small>${esc(m.correo || 'Sin correo')} · Socio/a benefactor/a</small></div></div></td><td data-label="Estado"><span class="cuotas-member-state">${memberState(m.estadoMiembro)}</span></td><td data-label="Cuota mensual"><strong>${money(m.cuotaMensual)}</strong></td>${Array.from({length:12},(_,i)=>cell(m,i+1)).join('')}<td data-label="Total pagado"><strong>${money(m.totalPagado)}</strong></td><td data-label="Saldo pendiente"><strong class="saldo-value">${money(m.saldoPendiente)}</strong></td></tr>`; }
  function cell(m, month) { const st = status(m, month); const pay = monthPayment(m, month); const title = `${months[month]} · ${monthState(st)}${pay ? ` · ${money(pay.monto)}` : ''}`; return `<td data-label="${short[month-1]}" class="month-cell"><span class="payment-status-dot ${escAttr(st)}" title="${escAttr(title)}"></span></td>`; }
  function renderMonthSummary(s) { const box = document.querySelector('[data-b-month-summary]'); if (box) box.innerHTML = `<h4>Resumen benefactores</h4><p class="cuotas-side-date">📅 ${esc(months[state.month])} ${state.year}</p><dl class="cuotas-side-list"><div><dt>Esperado</dt><dd>${money(s.esperado)}</dd></div><div><dt>Recibido</dt><dd class="positive">${money(s.recibido)}</dd></div><div><dt>Pendiente</dt><dd class="warning">${money(s.pendiente)}</dd></div><div><dt>% Cumplimiento</dt><dd>${s.pct}%</dd></div></dl><div class="cuotas-progress"><span style="width:${Math.min(s.pct,100)}%"></span></div>`; }
  function renderAnnual(s) { const box = document.querySelector('[data-b-annual]'); if (box) box.innerHTML = `<h4>Resumen anual benefactores</h4><div class="cuotas-annual-bars"><div><span>Esperado anual</span><strong>${money(s.anual)}</strong></div><div><span>Recaudado anual</span><strong>${money(s.total)}</strong></div><div><span>Saldo pendiente</span><strong>${money(s.saldo)}</strong></div></div>`; }
  function renderRecent(items) { const box = document.querySelector('[data-b-recent]'); if (!box) return; const pays = items.flatMap(m => (m.pagos||[]).map(p => ({...p,nombre:m.nombre}))).sort((a,b)=>String(b.fechaPago||'').localeCompare(String(a.fechaPago||''))).slice(0,5); box.innerHTML = `<h4>Últimos pagos benefactores</h4><div class="cuotas-recent-list">${pays.length ? pays.map(p => `<article><span class="recent-icon">↗</span><div><strong>${p.tipoPago === 'anual' ? 'Cuota anual' : 'Pago mensual'} - ${esc(p.nombre)}</strong><small>${esc(months[Number(p.mes||0)] || 'Pago')}</small></div><em>+${money(p.monto)}</em></article>`).join('') : '<p class="cuotas-empty compact">No hay pagos registrados.</p>'}</div>`; }

  function openNomina() { const modal = document.querySelector('[data-b-modal]'); if (!modal) return; const disabled = state.perms.write ? '' : 'disabled'; modal.innerHTML = `<section class="cuotas-modal cuotas-nomina-modal"><div class="cuotas-modal-header"><div><p class="section-tag">Tesorería · Benefactores</p><h3>Nómina de socios benefactores</h3><p>Edición separada para la categoría benefactor.</p></div><button type="button" class="cuotas-modal-close" data-b-close>×</button></div><form class="cuotas-nomina-form" data-b-form><div class="cuotas-nomina-table-wrap"><table class="cuotas-nomina-table"><thead><tr><th>Benefactor/a</th><th>Estado</th><th>Cuota mensual</th><th>Cuenta</th><th>Exento</th><th>Teléfono</th><th>Correo</th><th>Observaciones</th></tr></thead><tbody>${state.members.length ? state.members.map(m=>nominaRow(m,disabled)).join('') : '<tr><td colspan="8">No hay socios/as benefactores/as activos/as.</td></tr>'}</tbody></table></div><p class="cuotas-nomina-status" data-b-form-status></p><div class="cuotas-nomina-actions"><button type="button" class="secondary" data-b-close>Cerrar</button>${state.perms.write ? '<button type="submit">Guardar nómina</button>' : ''}</div></form></section>`; modal.classList.add('is-open'); modal.setAttribute('aria-hidden','false'); }
  function nominaRow(m, dis) { return `<tr data-b-row="${escAttr(m.id)}"><td class="cuotas-nomina-persona"><strong>${esc(m.nombre)}</strong><small>Socio/a benefactor/a<input type="hidden" data-field="anio" value="${escAttr(m.anio || state.year)}"></small></td><td><select data-field="estado_miembro" ${dis}>${option('estudiante',m.estadoMiembro,'Estudiante')}${option('trabajador',m.estadoMiembro,'Trabajador')}${option('cesante',m.estadoMiembro,'Cesante')}</select></td><td><input type="number" min="0" step="1" data-field="cuota_mensual" value="${escAttr(m.cuotaMensual||0)}" ${dis}></td><td><select data-field="estado_cuenta" ${dis}>${option('activo',m.estadoCuenta,'Activo')}${option('inactivo',m.estadoCuenta,'Inactivo')}</select></td><td><label class="cuotas-nomina-exento"><input type="checkbox" data-field="exento" ${m.exento ? 'checked' : ''} ${dis}> Sí</label></td><td><input data-field="telefono" value="${escAttr(m.telefono||'')}" ${dis}></td><td><input type="email" data-field="correo" value="${escAttr(m.correo||'')}" ${dis}></td><td><input data-field="observaciones" value="${escAttr(m.observaciones||'')}" ${dis}></td></tr>`; }
  async function saveNomina(form) { try { setFormStatus('Guardando nómina...', true); for (const r of Array.from(form.querySelectorAll('[data-b-row]'))) await api(API_CUOTAS, { method:'PATCH', body: JSON.stringify(payload(r)) }); setFormStatus('Nómina actualizada.', true); await load(true); window.setTimeout(closeModal,650); } catch(e) { setFormStatus(e.message || 'No fue posible guardar.', false); } }
  function payload(r) { const f = (n) => r.querySelector(`[data-field="${n}"]`); return { id:r.dataset.bRow, estado_miembro:f('estado_miembro')?.value || 'estudiante', estado_cuenta:f('estado_cuenta')?.value || 'activo', cuota_mensual:Number(f('cuota_mensual')?.value || 0), anio:Number(f('anio')?.value || state.year), telefono:f('telefono')?.value?.trim() || '', correo:f('correo')?.value?.trim() || '', observaciones:f('observaciones')?.value?.trim() || '', exento:Boolean(f('exento')?.checked) }; }
  function closeModal() { const modal = document.querySelector('[data-b-modal]'); if (!modal) return; modal.classList.remove('is-open'); modal.setAttribute('aria-hidden','true'); window.setTimeout(()=>{ modal.innerHTML=''; },160); }

  async function api(url, options = {}) { if (!client) throw new Error('Supabase no está configurado.'); const session = await client.auth.getSession(); const token = session.data?.session?.access_token; if (!token) throw new Error('Sesión no disponible.'); const response = await fetch(url, { ...options, headers: { authorization:`Bearer ${token}`, 'content-type':'application/json; charset=utf-8', ...(options.headers||{}) } }); const data = await response.json().catch(()=>({})); if (!response.ok) throw new Error(data.error || 'Error de solicitud.'); return data; }
  function status(m, month) { if (m.exento || m.estadoCuenta === 'inactivo') return 'sin_registro'; if ((m.pagos||[]).some(p => p.tipoPago === 'anual' || Number(p.mes) === 0)) return 'pagado'; if (monthPayment(m, month)) return 'pagado'; if (state.year < currentYear) return 'atrasado'; if (state.year > currentYear) return 'pendiente'; return month < currentMonth ? 'atrasado' : 'pendiente'; }
  function monthPayment(m, month) { return (m.pagos||[]).find(p => Number(p.mes) === month && p.tipoPago !== 'anual'); }
  function monthPayments(m, month) { return (m.pagos||[]).filter(p => Number(p.mes) === month && p.tipoPago !== 'anual'); }
  function years() { return [currentYear-2,currentYear-1,currentYear,currentYear+1].map(y=>`<option value="${y}" ${y===state.year?'selected':''}>${y}</option>`).join(''); }
  function monthOptions() { return months.slice(1).map((m,i)=>`<option value="${i+1}" ${i+1===state.month?'selected':''}>${m}</option>`).join(''); }
  function option(v,c,l) { return `<option value="${escAttr(v)}" ${String(c||'')===String(v)?'selected':''}>${esc(l)}</option>`; }
  function openTreasury() { const menu=document.querySelector('[data-tesoreria-menu]'); const toggle=document.querySelector('[data-tesoreria-toggle]'); if(menu){menu.classList.remove('is-collapsed');menu.style.maxHeight='520px';menu.style.opacity='1';menu.style.pointerEvents='auto';} if(toggle){toggle.classList.add('is-open');toggle.setAttribute('aria-expanded','true');} }
  function setStatus(msg, ok) { const b=document.querySelector('[data-b-status]'); if(b){b.textContent=msg;b.classList.toggle('success',!!ok);b.classList.toggle('error',!ok);} }
  function setFormStatus(msg, ok) { const b=document.querySelector('[data-b-form-status]'); if(b){b.textContent=msg;b.classList.toggle('success',!!ok);b.classList.toggle('error',!ok);} }
  function renderEmpty(msg) { const b=document.querySelector('[data-b-table]'); if(b)b.innerHTML=`<p class="cuotas-empty">${esc(msg)}</p>`; }
  function kpi(a,b,c,d){return `<article class="cuotas-kpi-card"><i>${esc(d)}</i><div><span>${esc(a)}</span><strong>${esc(b)}</strong><small>${esc(c)}</small></div></article>`;}
  function memberState(s){return {estudiante:'Estudiante',trabajador:'Trabajador',cesante:'Cesante'}[s]||'Estudiante';}
  function monthState(s){return {pagado:'Pagado',pendiente:'Pendiente',atrasado:'Atrasado',sin_registro:'Sin registro'}[s]||'Sin registro';}
  function initials(n=''){return String(n).trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'B';}
  function money(v){return new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(v||0));}
  function txt(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();}
  function email(v){return String(v||'').trim().toLowerCase();}
  function esc(v){return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));}
  function escAttr(v){return esc(v);}
})();
