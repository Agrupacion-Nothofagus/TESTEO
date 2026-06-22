import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabaseConfigurado } from '../scripts/supabase-config.js';

/*
  Registro de Actas - Agrupación Nothofagus
  Persistencia temporal: localStorage.
  Para migrar a Supabase/PocketBase/Firebase/backend propio, reemplazar las funciones:
  - getActas()
  - saveActas()
  - guardarActa()
  - eliminarActa()
  - aprobarActa()
  y aplicar validación de permisos también en el backend.
*/

const STORAGE_KEY = 'nothofagus_registro_actas_v1';
const LOGO_PDF_URL = '../logo-nothofagus.png'; // Cambiar aquí la ruta del logo institucional usado en PDF.
const ROLES_VER_ACTAS = ['administrador', 'admin', 'secretario', 'secretaria', 'secretariado', 'gestor_miembros'];
const ROLES_ADMIN_ACTAS = ['administrador', 'admin'];
const ROLES_SECRETARIA_ACTAS = ['secretario', 'secretaria', 'secretariado', 'gestor_miembros'];
const client = supabaseConfigurado() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

let usuarioActual = null;
let actas = [];
let actaEditandoId = null;
let actaVistaId = null;
let puedeVerActas = false;
let puedeEliminarActas = false;
let puedeAprobarActas = false;

cargarEstilosActas();
initRegistroActas();

async function initRegistroActas() {
  usuarioActual = await obtenerUsuarioActual();
  const rol = obtenerRol(usuarioActual);
  puedeVerActas = ROLES_VER_ACTAS.includes(rol);
  puedeEliminarActas = ROLES_ADMIN_ACTAS.includes(rol);
  puedeAprobarActas = ROLES_ADMIN_ACTAS.includes(rol);

  instalarVistaActas();
  instalarSidebarActas();
  actas = getActas();
  renderListadoActas();

  if (location.hash === '#registro-actas') {
    activarVistaActas();
  }
}

function cargarEstilosActas() {
  if (document.querySelector('link[href="actas-admin.css"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'actas-admin.css';
  document.head.appendChild(link);
}

async function obtenerUsuarioActual() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data?.session?.user || null;
}

function obtenerRol(user) {
  const role = String(
    user?.user_metadata?.rol
    || user?.user_metadata?.role
    || user?.app_metadata?.rol
    || user?.app_metadata?.role
    || ''
  ).trim().toLowerCase();

  if (role === 'secretario') return 'secretario';
  if (role === 'secretaria') return 'secretaria';
  if (role === 'secretariado') return 'secretariado';
  if (role === 'gestor_miembros') return 'gestor_miembros';
  if (role === 'admin') return 'admin';
  return role;
}

function instalarSidebarActas() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || document.querySelector('[data-admin-view="actas-view"]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = `sidebar-link actas-sidebar-link${puedeVerActas ? '' : ' is-hidden'}`;
  button.dataset.adminView = 'actas-view';
  button.innerHTML = '<span>📝</span> Registro de Actas';
  nav.appendChild(button);

  button.addEventListener('click', () => activarVistaActas());
}

function instalarVistaActas() {
  const content = document.querySelector('.admin-content');
  if (!content || document.querySelector('#actas-view')) return;

  const section = document.createElement('section');
  section.className = 'admin-view';
  section.id = 'actas-view';
  section.dataset.viewTitle = 'Registro de Actas';
  section.dataset.viewDescription = 'Gestión interna de actas institucionales, reuniones, asambleas, coordinaciones y proyectos.';
  section.innerHTML = puedeVerActas ? getActasTemplate() : getActasDeniedTemplate();
  content.appendChild(section);

  if (puedeVerActas) instalarEventosActas(section);
}

function getActasDeniedTemplate() {
  return `
    <div class="admin-panel actas-panel">
      <div class="actas-access-denied">No tienes permisos para acceder al Registro de Actas.</div>
    </div>
  `;
}

function getActasTemplate() {
  return `
    <div class="admin-panel actas-panel">
      <div class="actas-topbar">
        <div>
          <p class="section-tag">Registro interno</p>
          <h3>Registro de Actas</h3>
          <p>Registra, edita, visualiza y genera actas institucionales en PDF con formato formal.</p>
        </div>
        <div class="actas-actions-row">
          <button type="button" class="secondary-admin-button" data-acta-nueva>Nueva acta</button>
          <button type="button" class="secondary-admin-button" data-acta-refrescar>Actualizar</button>
        </div>
      </div>

      <div class="actas-toolbar">
        <label>
          Buscar
          <input type="search" data-acta-buscar placeholder="Folio, título, fecha o tipo de reunión">
        </label>
        <label>
          Estado
          <select data-acta-filtro-estado>
            <option value="">Todos</option>
            <option value="borrador">Borrador</option>
            <option value="finalizada">Finalizada</option>
            <option value="aprobada">Aprobada</option>
          </select>
        </label>
        <label>
          Tipo de reunión
          <select data-acta-filtro-tipo>
            <option value="">Todas</option>
            <option value="ordinaria">Ordinaria</option>
            <option value="extraordinaria">Extraordinaria</option>
            <option value="asamblea">Asamblea</option>
            <option value="coordinacion">Coordinación</option>
            <option value="proyecto">Proyecto</option>
            <option value="otra">Otra</option>
          </select>
        </label>
      </div>

      <p class="admin-status actas-status" data-actas-status></p>

      <div class="actas-layout">
        <section class="actas-list-card">
          <div class="actas-list" data-actas-list></div>
        </section>

        <section class="actas-editor actas-hidden" data-actas-editor>
          ${getActaFormTemplate()}
        </section>

        <section class="actas-viewer actas-hidden" data-actas-viewer>
          <div class="actas-topbar">
            <div>
              <p class="section-tag">Vista de lectura</p>
              <h4 data-acta-view-title>Acta</h4>
            </div>
            <div class="actas-viewer-actions">
              <button type="button" data-acta-view-pdf>Generar PDF</button>
              <button type="button" class="actas-small-button" data-acta-view-editar>Editar</button>
              <button type="button" class="actas-small-button" data-acta-view-cerrar>Cerrar</button>
            </div>
          </div>
          <div class="actas-viewer-content" data-acta-view-content></div>
        </section>
      </div>
    </div>
  `;
}

function getActaFormTemplate() {
  return `
    <form data-acta-form class="actas-editor">
      <section class="actas-form-section">
        <h4>Encabezado del acta</h4>
        <div class="actas-form-grid">
          <label>Organización<input name="organizacion" value="Agrupación Nothofagus" readonly></label>
          <label>Tipo de reunión<select name="tipoReunion" required>${options(['ordinaria','extraordinaria','asamblea','coordinacion','proyecto','otra'])}</select></label>
          <label class="full">Título del acta<input name="titulo" required placeholder="Ej: Reunión de coordinación mensual"></label>
          <label>Número o folio<input name="folio" placeholder="Ej: 003"></label>
          <label>Fecha<input name="fecha" type="date" required></label>
          <label>Hora de inicio<input name="horaInicio" type="time"></label>
          <label>Hora de término<input name="horaTermino" type="time"></label>
          <label>Lugar o modalidad<select name="lugarModalidad">${options(['presencial','online','hibrida'])}</select></label>
        </div>
      </section>

      <section class="actas-form-section">
        <h4>Asistentes</h4>
        <div class="actas-repeat-list" data-repeat="asistentes"></div>
        <button type="button" class="actas-small-button" data-add-row="asistentes">Agregar asistente</button>
      </section>

      <section class="actas-form-section">
        <h4>Puntos de agenda</h4>
        <div class="actas-repeat-list" data-repeat="agenda"></div>
        <button type="button" class="actas-small-button" data-add-row="agenda">Agregar punto de agenda</button>
      </section>

      <section class="actas-form-section">
        <h4>Desarrollo de la reunión</h4>
        <div class="actas-form-grid">
          <label class="full">Resumen de lo conversado<textarea name="desarrollo" rows="10" placeholder="Redacta el desarrollo de la reunión. Puedes usar saltos de línea, listas simples y párrafos."></textarea></label>
        </div>
      </section>

      <section class="actas-form-section">
        <h4>Acuerdos adoptados</h4>
        <div class="actas-repeat-list" data-repeat="acuerdos"></div>
        <button type="button" class="actas-small-button" data-add-row="acuerdos">Agregar acuerdo</button>
      </section>

      <section class="actas-form-section">
        <h4>Compromisos pendientes</h4>
        <div class="actas-repeat-list" data-repeat="compromisosPendientes"></div>
        <button type="button" class="actas-small-button" data-add-row="compromisosPendientes">Agregar compromiso pendiente</button>
      </section>

      <section class="actas-form-section">
        <h4>Cierre del acta</h4>
        <div class="actas-form-grid">
          <label>Hora de cierre<input name="horaCierre" type="time"></label>
          <label>Redactado por<input name="redactadoPor" required placeholder="Nombre completo"></label>
          <label>Cargo de quien redacta<input name="cargoRedactor" placeholder="Secretaría, presidencia, etc."></label>
          <label>Firma Secretaría<input name="firmaSecretaria" placeholder="Nombre o constancia de firma"></label>
          <label>Firma Presidencia<input name="firmaPresidencia" placeholder="Nombre o constancia de firma"></label>
          <label class="full">Observaciones finales<textarea name="observacionesFinales" rows="5"></textarea></label>
        </div>
      </section>

      <section class="actas-form-section">
        <h4>Firmas de asistentes, opcional</h4>
        <div class="actas-repeat-list" data-repeat="firmasAsistentes"></div>
        <button type="button" class="actas-small-button" data-add-row="firmasAsistentes">Agregar firma de asistente</button>
      </section>

      <div class="actas-form-actions">
        <button type="button" data-guardar-estado="borrador">Guardar borrador</button>
        <button type="button" data-guardar-estado="finalizada">Guardar como finalizada</button>
        <button type="button" data-acta-aprobar-form>Aprobar acta</button>
        <button type="button" class="actas-small-button" data-acta-cancelar>Cancelar</button>
      </div>
    </form>
  `;
}

function instalarEventosActas(section) {
  section.querySelector('[data-acta-nueva]')?.addEventListener('click', nuevaActa);
  section.querySelector('[data-acta-refrescar]')?.addEventListener('click', () => {
    actas = getActas();
    renderListadoActas();
    showActasStatus('Listado actualizado.', true);
  });
  section.querySelector('[data-acta-buscar]')?.addEventListener('input', renderListadoActas);
  section.querySelector('[data-acta-filtro-estado]')?.addEventListener('change', renderListadoActas);
  section.querySelector('[data-acta-filtro-tipo]')?.addEventListener('change', renderListadoActas);
  section.querySelector('[data-acta-cancelar]')?.addEventListener('click', ocultarEditor);
  section.querySelector('[data-acta-view-cerrar]')?.addEventListener('click', ocultarViewer);
  section.querySelector('[data-acta-view-editar]')?.addEventListener('click', () => editarActa(actaVistaId));
  section.querySelector('[data-acta-view-pdf]')?.addEventListener('click', () => generarPDF(actaVistaId));
  section.querySelector('[data-acta-aprobar-form]')?.addEventListener('click', () => aprobarActa(actaEditandoId));
  section.querySelectorAll('[data-guardar-estado]').forEach((button) => {
    button.addEventListener('click', () => guardarActa(button.dataset.guardarEstado));
  });
  section.querySelectorAll('[data-add-row]').forEach((button) => {
    button.addEventListener('click', () => addRepeatRow(button.dataset.addRow));
  });
}

function activarVistaActas() {
  if (!puedeVerActas) {
    showActasStatus('No tienes permisos para acceder al Registro de Actas.', false);
  }
  document.querySelectorAll('[data-admin-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.adminView === 'actas-view');
  });
  document.querySelectorAll('.admin-view').forEach((view) => {
    view.classList.toggle('is-active', view.id === 'actas-view');
  });
  document.querySelector('#admin-view-title').textContent = 'Registro de Actas';
  document.querySelector('#admin-view-description').textContent = 'Gestión interna de actas institucionales, reuniones, asambleas, coordinaciones y proyectos.';
  location.hash = 'registro-actas';
}

function nuevaActa() {
  if (!puedeVerActas) return showActasStatus('No tienes permisos para crear actas.', false);
  actaEditandoId = null;
  mostrarEditor();
  resetFormActa();
  addRepeatRow('asistentes');
  addRepeatRow('agenda');
  addRepeatRow('acuerdos');
  showActasStatus('Nueva acta en edición.', true);
}

function editarActa(id) {
  const acta = getActaById(id);
  if (!acta) return showActasStatus('No fue posible encontrar el acta.', false);
  if (!puedeVerActas) return showActasStatus('No tienes permisos para editar actas.', false);
  actaEditandoId = id;
  mostrarEditor();
  cargarActaEnFormulario(acta);
  showActasStatus('Acta cargada para edición.', true);
}

function guardarActa(estadoSolicitado) {
  if (!puedeVerActas) return showActasStatus('No tienes permisos para guardar actas.', false);
  if (estadoSolicitado === 'aprobada' && !puedeAprobarActas) return showActasStatus('Solo un administrador puede aprobar actas.', false);

  const acta = leerFormularioActa();
  const previa = actaEditandoId ? getActaById(actaEditandoId) : null;
  acta.id = previa?.id || crypto.randomUUID();
  acta.estado = estadoSolicitado;
  acta.creadoEn = previa?.creadoEn || new Date().toISOString();
  acta.actualizadoEn = new Date().toISOString();
  acta.creadoPor = previa?.creadoPor || obtenerNombreUsuario();
  acta.actualizadoPor = obtenerNombreUsuario();

  const validacion = validarActa(acta, estadoSolicitado);
  if (!validacion.ok) return showActasStatus(validacion.mensaje, false);

  actas = getActas();
  const index = actas.findIndex((item) => item.id === acta.id);
  if (index >= 0) actas[index] = acta;
  else actas.unshift(acta);
  saveActas(actas);
  actaEditandoId = acta.id;
  renderListadoActas();
  showActasStatus(estadoSolicitado === 'borrador' ? 'Acta guardada como borrador.' : 'Acta guardada como finalizada.', true);
}

function aprobarActa(id) {
  if (!puedeAprobarActas) return showActasStatus('Solo un administrador puede aprobar actas.', false);
  const acta = getActaById(id);
  if (!acta) return showActasStatus('Selecciona un acta para aprobar.', false);
  const validacion = validarActa(acta, 'aprobada');
  if (!validacion.ok) return showActasStatus(validacion.mensaje, false);
  acta.estado = 'aprobada';
  acta.actualizadoEn = new Date().toISOString();
  acta.actualizadoPor = obtenerNombreUsuario();
  actas = getActas().map((item) => item.id === id ? acta : item);
  saveActas(actas);
  renderListadoActas();
  cargarActaEnFormulario(acta);
  showActasStatus('Acta aprobada correctamente.', true);
}

function eliminarActa(id) {
  if (!puedeEliminarActas) return showActasStatus('No tienes permisos para eliminar esta acta.', false);
  const acta = getActaById(id);
  if (!acta) return;
  if (!confirm(`¿Eliminar el acta ${acta.folio || acta.titulo}? Esta acción no se puede deshacer.`)) return;
  actas = getActas().filter((item) => item.id !== id);
  saveActas(actas);
  if (actaEditandoId === id) ocultarEditor();
  if (actaVistaId === id) ocultarViewer();
  renderListadoActas();
  showActasStatus('Acta eliminada correctamente.', true);
}

function verActa(id) {
  const acta = getActaById(id);
  if (!acta) return;
  if (!puedeVerActas) return showActasStatus('No tienes permisos para ver actas.', false);
  actaVistaId = id;
  ocultarEditor(false);
  const viewer = document.querySelector('[data-actas-viewer]');
  const title = document.querySelector('[data-acta-view-title]');
  const content = document.querySelector('[data-acta-view-content]');
  title.textContent = `${acta.folio || 'Sin folio'} · ${acta.titulo || 'Acta sin título'}`;
  content.innerHTML = renderActaLectura(acta);
  viewer.classList.remove('actas-hidden');
}

async function generarPDF(id) {
  if (!puedeVerActas) return showActasStatus('No tienes permisos para generar PDF.', false);
  const acta = getActaById(id);
  if (!acta) return showActasStatus('Selecciona un acta para generar PDF.', false);
  await loadJsPDF();
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) return showActasStatus('No fue posible cargar la librería PDF.', false);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 46;
  const width = doc.internal.pageSize.getWidth();
  const bottom = doc.internal.pageSize.getHeight() - margin;
  let y = 44;

  const logo = await loadImageBase64(LOGO_PDF_URL).catch(() => null);
  if (logo) doc.addImage(logo, 'PNG', margin, y, 52, 52);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Agrupación Nothofagus', logo ? margin + 66 : margin, y + 20);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Registro institucional de acta', logo ? margin + 66 : margin, y + 38);
  y += 76;

  y = pdfTitle(doc, `ACTA · ${acta.titulo || 'Sin título'}`, margin, y, width);
  y = pdfKeyValue(doc, 'Folio', acta.folio || 'Sin folio', margin, y, bottom);
  y = pdfKeyValue(doc, 'Tipo de reunión', labelTipo(acta.tipoReunion), margin, y, bottom);
  y = pdfKeyValue(doc, 'Fecha', acta.fecha || 'Sin fecha', margin, y, bottom);
  y = pdfKeyValue(doc, 'Horario', `${acta.horaInicio || '—'} a ${acta.horaTermino || '—'}`, margin, y, bottom);
  y = pdfKeyValue(doc, 'Lugar o modalidad', labelTipo(acta.lugarModalidad), margin, y, bottom);
  y = pdfKeyValue(doc, 'Estado', acta.estado || 'borrador', margin, y, bottom);

  y = pdfSection(doc, 'Asistentes', acta.asistentes.map((a) => `• ${a.nombre || 'Sin nombre'} · ${a.cargo || 'Sin cargo'} · ${a.estado || 'presente'}`).join('\n') || 'Sin asistentes registrados.', margin, y, bottom);
  y = pdfSection(doc, 'Puntos de agenda', acta.agenda.map((a, i) => `${i + 1}. ${a.titulo || 'Sin título'}\n${a.descripcion || ''}`).join('\n\n') || 'Sin agenda registrada.', margin, y, bottom);
  y = pdfSection(doc, 'Desarrollo de la reunión', acta.desarrollo || 'Sin desarrollo registrado.', margin, y, bottom);
  y = pdfSection(doc, 'Acuerdos adoptados', acta.acuerdos.map((a, i) => `${i + 1}. ${a.descripcion || 'Sin descripción'}\nResponsable: ${a.responsable || '—'} · Plazo: ${a.plazo || '—'} · Estado: ${a.estado || 'pendiente'}`).join('\n\n') || 'Sin acuerdos registrados.', margin, y, bottom);
  y = pdfSection(doc, 'Compromisos pendientes', acta.compromisosPendientes.map((c, i) => `${i + 1}. ${c.descripcion || 'Sin descripción'}\nResponsable: ${c.responsable || '—'} · Fecha estimada: ${c.fechaEstimada || '—'}`).join('\n\n') || 'Sin compromisos pendientes.', margin, y, bottom);
  y = pdfSection(doc, 'Observaciones finales', acta.observacionesFinales || 'Sin observaciones.', margin, y, bottom);
  y = pdfSection(doc, 'Redacción y firmas', `Redacta: ${acta.redactadoPor || '—'}\nCargo: ${acta.cargoRedactor || '—'}\n\nFirma Secretaría: ${acta.firmaSecretaria || '____________________________'}\n\nFirma Presidencia: ${acta.firmaPresidencia || '____________________________'}`, margin, y, bottom);

  const safeFolio = crearSlugArchivo(acta.folio || 'sin-folio');
  const safeDate = acta.fecha || new Date().toISOString().slice(0, 10);
  doc.save(`acta-nothofagus-${safeFolio}-${safeDate}.pdf`);
  showActasStatus('PDF generado correctamente.', true);
}

function pdfTitle(doc, text, margin, y, width) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const lines = doc.splitTextToSize(text, width - margin * 2);
  doc.text(lines, margin, y);
  return y + lines.length * 16 + 12;
}

function pdfKeyValue(doc, key, value, margin, y, bottom) {
  if (y > bottom - 38) { doc.addPage(); y = margin; }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`${key}:`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.text(String(value || '—'), margin + 110, y);
  return y + 16;
}

function pdfSection(doc, title, content, margin, y, bottom) {
  if (y > bottom - 80) { doc.addPage(); y = margin; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(title, margin, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(String(content || '—'), doc.internal.pageSize.getWidth() - margin * 2);
  lines.forEach((line) => {
    if (y > bottom) { doc.addPage(); y = margin; }
    doc.text(line, margin, y);
    y += 14;
  });
  return y + 12;
}

function renderListadoActas() {
  const list = document.querySelector('[data-actas-list]');
  if (!list) return;
  const filtered = filtrarActas();
  if (!filtered.length) {
    list.innerHTML = '<p class="dashboard-empty">No hay actas registradas con los filtros actuales.</p>';
    return;
  }
  list.innerHTML = filtered.map((acta) => `
    <article class="acta-card">
      <div class="acta-card-header">
        <div>
          <h4>${escapeHTML(acta.titulo || 'Acta sin título')}</h4>
          <small>Folio: ${escapeHTML(acta.folio || 'Sin folio')} · ${escapeHTML(labelTipo(acta.tipoReunion))} · ${escapeHTML(acta.fecha || 'Sin fecha')}</small>
        </div>
        <span class="acta-state-pill ${escapeAttr(acta.estado)}">${escapeHTML(acta.estado || 'borrador')}</span>
      </div>
      <p>Última modificación: ${formatDateTime(acta.actualizadoEn)} · Responsable: ${escapeHTML(acta.redactadoPor || acta.creadoPor || '—')}</p>
      <div class="acta-card-actions">
        <button type="button" data-acta-ver="${escapeAttr(acta.id)}">Ver</button>
        <button type="button" data-acta-editar="${escapeAttr(acta.id)}">Editar</button>
        <button type="button" data-acta-pdf="${escapeAttr(acta.id)}">Generar PDF</button>
        ${puedeAprobarActas && acta.estado === 'finalizada' ? `<button type="button" data-acta-aprobar="${escapeAttr(acta.id)}">Aprobar acta</button>` : ''}
        ${puedeEliminarActas ? `<button type="button" class="danger" data-acta-eliminar="${escapeAttr(acta.id)}">Eliminar</button>` : ''}
      </div>
    </article>
  `).join('');
  list.querySelectorAll('[data-acta-ver]').forEach((button) => button.addEventListener('click', () => verActa(button.dataset.actaVer)));
  list.querySelectorAll('[data-acta-editar]').forEach((button) => button.addEventListener('click', () => editarActa(button.dataset.actaEditar)));
  list.querySelectorAll('[data-acta-pdf]').forEach((button) => button.addEventListener('click', () => generarPDF(button.dataset.actaPdf)));
  list.querySelectorAll('[data-acta-aprobar]').forEach((button) => button.addEventListener('click', () => aprobarActa(button.dataset.actaAprobar)));
  list.querySelectorAll('[data-acta-eliminar]').forEach((button) => button.addEventListener('click', () => eliminarActa(button.dataset.actaEliminar)));
}

function filtrarActas() {
  const query = String(document.querySelector('[data-acta-buscar]')?.value || '').toLowerCase().trim();
  const estado = document.querySelector('[data-acta-filtro-estado]')?.value || '';
  const tipo = document.querySelector('[data-acta-filtro-tipo]')?.value || '';
  return getActas().filter((acta) => {
    const text = `${acta.folio} ${acta.titulo} ${acta.fecha} ${acta.tipoReunion}`.toLowerCase();
    return (!query || text.includes(query)) && (!estado || acta.estado === estado) && (!tipo || acta.tipoReunion === tipo);
  });
}

function leerFormularioActa() {
  const form = document.querySelector('[data-acta-form]');
  return {
    id: actaEditandoId || '',
    organizacion: form.organizacion.value.trim() || 'Agrupación Nothofagus',
    tipoReunion: form.tipoReunion.value,
    titulo: form.titulo.value.trim(),
    folio: form.folio.value.trim(),
    fecha: form.fecha.value,
    horaInicio: form.horaInicio.value,
    horaTermino: form.horaTermino.value,
    lugarModalidad: form.lugarModalidad.value,
    asistentes: readRepeatRows('asistentes'),
    agenda: readRepeatRows('agenda'),
    desarrollo: form.desarrollo.value.trim(),
    acuerdos: readRepeatRows('acuerdos'),
    compromisosPendientes: readRepeatRows('compromisosPendientes'),
    observacionesFinales: form.observacionesFinales.value.trim(),
    redactadoPor: form.redactadoPor.value.trim(),
    cargoRedactor: form.cargoRedactor.value.trim(),
    firmaSecretaria: form.firmaSecretaria.value.trim(),
    firmaPresidencia: form.firmaPresidencia.value.trim(),
    firmasAsistentes: readRepeatRows('firmasAsistentes'),
    estado: 'borrador',
    creadoPor: '',
    actualizadoPor: '',
    creadoEn: '',
    actualizadoEn: ''
  };
}

function cargarActaEnFormulario(acta) {
  resetFormActa(false);
  const form = document.querySelector('[data-acta-form]');
  Object.entries(acta).forEach(([key, value]) => {
    if (form.elements[key] && !Array.isArray(value)) form.elements[key].value = value || '';
  });
  ['asistentes','agenda','acuerdos','compromisosPendientes','firmasAsistentes'].forEach((key) => {
    (acta[key] || []).forEach((row) => addRepeatRow(key, row));
  });
  document.querySelector('[data-acta-aprobar-form]').classList.toggle('actas-hidden', !puedeAprobarActas || acta.estado !== 'finalizada');
}

function resetFormActa(clear = true) {
  const form = document.querySelector('[data-acta-form]');
  if (clear) form.reset();
  form.organizacion.value = 'Agrupación Nothofagus';
  document.querySelectorAll('[data-repeat]').forEach((container) => container.innerHTML = '');
  document.querySelector('[data-acta-aprobar-form]').classList.toggle('actas-hidden', true);
}

function addRepeatRow(type, data = {}) {
  const container = document.querySelector(`[data-repeat="${type}"]`);
  if (!container) return;
  const row = document.createElement('div');
  row.className = getRepeatClass(type);
  row.innerHTML = getRepeatTemplate(type, data);
  row.querySelector('[data-remove-row]')?.addEventListener('click', () => row.remove());
  container.appendChild(row);
}

function getRepeatClass(type) {
  if (type === 'firmasAsistentes' || type === 'acuerdos') return 'actas-repeat-row two';
  if (type === 'agenda' || type === 'compromisosPendientes') return `actas-repeat-row ${type === 'agenda' ? 'agenda' : 'compromiso'}`;
  return 'actas-repeat-row';
}

function getRepeatTemplate(type, data) {
  if (type === 'asistentes') return `
    <label>Nombre completo<input data-field="nombre" value="${escapeAttr(data.nombre)}"></label>
    <label>Cargo o rol<input data-field="cargo" value="${escapeAttr(data.cargo)}"></label>
    <label>Estado<select data-field="estado">${options(['presente','ausente','excusado'], data.estado)}</select></label>
    <button type="button" class="actas-danger-button" data-remove-row>×</button>`;
  if (type === 'agenda') return `
    <label>Título del punto<input data-field="titulo" value="${escapeAttr(data.titulo)}"></label>
    <label>Descripción breve<textarea data-field="descripcion" rows="2">${escapeHTML(data.descripcion)}</textarea></label>
    <button type="button" class="actas-danger-button" data-remove-row>×</button>`;
  if (type === 'acuerdos') return `
    <label>Acuerdo<textarea data-field="descripcion" rows="2">${escapeHTML(data.descripcion)}</textarea></label>
    <label>Responsable<input data-field="responsable" value="${escapeAttr(data.responsable)}"></label>
    <label>Plazo<input data-field="plazo" type="date" value="${escapeAttr(data.plazo)}"></label>
    <label>Estado<select data-field="estado">${options(['pendiente','en proceso','cumplido'], data.estado)}</select></label>
    <button type="button" class="actas-danger-button" data-remove-row>×</button>`;
  if (type === 'compromisosPendientes') return `
    <label>Descripción<textarea data-field="descripcion" rows="2">${escapeHTML(data.descripcion)}</textarea></label>
    <label>Responsable opcional<input data-field="responsable" value="${escapeAttr(data.responsable)}"></label>
    <label>Fecha estimada<input data-field="fechaEstimada" type="date" value="${escapeAttr(data.fechaEstimada)}"></label>
    <button type="button" class="actas-danger-button" data-remove-row>×</button>`;
  return `
    <label>Nombre<input data-field="nombre" value="${escapeAttr(data.nombre)}"></label>
    <label>Cargo<input data-field="cargo" value="${escapeAttr(data.cargo)}"></label>
    <label>Firma<input data-field="firma" value="${escapeAttr(data.firma)}"></label>
    <button type="button" class="actas-danger-button" data-remove-row>×</button>`;
}

function readRepeatRows(type) {
  return [...document.querySelectorAll(`[data-repeat="${type}"] .actas-repeat-row`)].map((row) => {
    const item = {};
    row.querySelectorAll('[data-field]').forEach((field) => item[field.dataset.field] = field.value.trim());
    return item;
  }).filter((item) => Object.values(item).some(Boolean));
}

function validarActa(acta, estado) {
  if (estado === 'borrador') return { ok: true };
  if (!acta.titulo) return { ok: false, mensaje: 'Debe ingresar un título para el acta.' };
  if (!acta.fecha) return { ok: false, mensaje: 'Debe ingresar la fecha del acta.' };
  if (!acta.tipoReunion) return { ok: false, mensaje: 'Debe seleccionar el tipo de reunión.' };
  if (!acta.asistentes.length) return { ok: false, mensaje: 'Debe registrar al menos un asistente.' };
  if (!acta.desarrollo && !acta.acuerdos.length) return { ok: false, mensaje: 'Debe completar el desarrollo de la reunión o ingresar acuerdos.' };
  if (!acta.redactadoPor) return { ok: false, mensaje: 'Debe ingresar el nombre de quien redacta el acta.' };
  if (estado === 'aprobada') {
    if (!puedeAprobarActas) return { ok: false, mensaje: 'Solo un administrador puede aprobar actas.' };
    if (acta.estado !== 'finalizada') return { ok: false, mensaje: 'El acta debe estar finalizada antes de aprobarse.' };
    if (!acta.folio) return { ok: false, mensaje: 'El acta debe tener folio para ser aprobada.' };
  }
  return { ok: true };
}

function renderActaLectura(acta) {
  return `
    <section><h5>Encabezado</h5><p><b>Folio:</b> ${escapeHTML(acta.folio || '—')}<br><b>Tipo:</b> ${escapeHTML(labelTipo(acta.tipoReunion))}<br><b>Fecha:</b> ${escapeHTML(acta.fecha || '—')}<br><b>Horario:</b> ${escapeHTML(acta.horaInicio || '—')} a ${escapeHTML(acta.horaTermino || '—')}<br><b>Modalidad:</b> ${escapeHTML(labelTipo(acta.lugarModalidad))}<br><b>Estado:</b> ${escapeHTML(acta.estado)}</p></section>
    <section><h5>Asistentes</h5><ul>${listItems(acta.asistentes.map((a) => `${a.nombre} · ${a.cargo} · ${a.estado}`))}</ul></section>
    <section><h5>Agenda</h5><ul>${listItems(acta.agenda.map((a) => `${a.titulo}: ${a.descripcion}`))}</ul></section>
    <section><h5>Desarrollo</h5><p>${escapeHTML(acta.desarrollo || 'Sin desarrollo registrado.').replaceAll('\n', '<br>')}</p></section>
    <section><h5>Acuerdos</h5><ul>${listItems(acta.acuerdos.map((a) => `${a.descripcion} · Responsable: ${a.responsable || '—'} · Plazo: ${a.plazo || '—'} · Estado: ${a.estado || 'pendiente'}`))}</ul></section>
    <section><h5>Compromisos pendientes</h5><ul>${listItems(acta.compromisosPendientes.map((c) => `${c.descripcion} · Responsable: ${c.responsable || '—'} · Fecha: ${c.fechaEstimada || '—'}`))}</ul></section>
    <section><h5>Cierre</h5><p><b>Observaciones:</b> ${escapeHTML(acta.observacionesFinales || '—')}<br><b>Redacta:</b> ${escapeHTML(acta.redactadoPor || '—')} · ${escapeHTML(acta.cargoRedactor || '—')}<br><b>Firma Secretaría:</b> ${escapeHTML(acta.firmaSecretaria || '—')}<br><b>Firma Presidencia:</b> ${escapeHTML(acta.firmaPresidencia || '—')}</p></section>
  `;
}

function listItems(items) {
  const clean = items.filter(Boolean);
  if (!clean.length) return '<li>Sin registros.</li>';
  return clean.map((item) => `<li>${escapeHTML(item)}</li>`).join('');
}

function mostrarEditor() { document.querySelector('[data-actas-editor]')?.classList.remove('actas-hidden'); document.querySelector('[data-actas-viewer]')?.classList.add('actas-hidden'); }
function ocultarEditor(clearId = true) { document.querySelector('[data-actas-editor]')?.classList.add('actas-hidden'); if (clearId) actaEditandoId = null; }
function ocultarViewer() { document.querySelector('[data-actas-viewer]')?.classList.add('actas-hidden'); actaVistaId = null; }
function getActas() { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
function saveActas(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
function getActaById(id) { return getActas().find((item) => item.id === id); }
function obtenerNombreUsuario() { return usuarioActual?.user_metadata?.nombre || usuarioActual?.email || 'Usuario interno'; }
function showActasStatus(message, ok) { const box = document.querySelector('[data-actas-status]'); if (!box) return; box.textContent = message; box.classList.toggle('success', Boolean(ok)); box.classList.toggle('error', !ok); }
function options(values, selected = '') { return values.map((value) => `<option value="${escapeAttr(value)}" ${selected === value ? 'selected' : ''}>${escapeHTML(labelTipo(value))}</option>`).join(''); }
function labelTipo(value) { return String(value || '').replace('hibrida', 'híbrida').replace('coordinacion', 'coordinación').replace(/\b\w/g, (m) => m.toUpperCase()); }
function formatDateTime(value) { if (!value) return '—'; return new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
function crearSlugArchivo(texto) { return String(texto || 'acta').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'acta'; }
function escapeHTML(value) { return String(value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function escapeAttr(value) { return escapeHTML(value); }
function loadJsPDF() { return new Promise((resolve, reject) => { if (window.jspdf?.jsPDF) return resolve(); const script = document.createElement('script'); script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); }); }
function loadImageBase64(url) { return new Promise((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; canvas.getContext('2d').drawImage(img, 0, 0); resolve(canvas.toDataURL('image/png')); }; img.onerror = reject; img.src = url; }); }
