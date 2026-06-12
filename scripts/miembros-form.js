const toggle = document.querySelector('[data-member-toggle]');
const panel = document.querySelector('#member-form-panel');
const form = document.querySelector('#member-form');

const PHONE_PREFIX = '+569';
const MEMBER_PANEL_ANIMATION_MS = 320;
let memberPanelTimer = null;

if (form) renderMemberForm();

const status = document.querySelector('#member-status');
const submitButton = form?.querySelector('button[type="submit"]');
const cancelButton = document.querySelector('[data-member-cancel]');
const phone = document.querySelector('#member-phone');
const adultPhone = document.querySelector('#member-adult-phone');
const birthDate = document.querySelector('#member-birthdate');
const ageInput = document.querySelector('#member-age');
const minorRadios = document.querySelectorAll('input[name="member-minor"]');
const minorSection = document.querySelector('#member-minor-section');
const experienceRadios = document.querySelectorAll('input[name="member-experience"]');
const experienceSection = document.querySelector('#member-experience-section');

installPhoneMask(phone);
installPhoneMask(adultPhone);

birthDate?.addEventListener('change', () => {
  const edad = calculateAge(birthDate.value);
  if (edad !== null) ageInput.value = String(edad);
  syncMinorSection();
});

minorRadios.forEach((radio) => radio.addEventListener('change', syncMinorSection));
experienceRadios.forEach((radio) => radio.addEventListener('change', syncExperienceSection));

syncMinorSection();
syncExperienceSection();

toggle?.addEventListener('click', () => {
  if (!panel) return;
  const isClosed = panel.classList.contains('is-hidden');
  isClosed ? openMemberPanel() : closeMemberPanel();
});

cancelButton?.addEventListener('click', closeMemberPanel);

form?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = collectPayload();
  const validation = validatePayload(payload);

  if (!validation.ok) {
    showStatus(validation.message, false);
    return;
  }

  try {
    setLoading(true);
    showStatus('Enviando solicitud...', true);

    const response = await fetch('/api/miembros', {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'No fue posible enviar la solicitud.');
    }

    form.reset();
    phone.value = PHONE_PREFIX;
    adultPhone.value = PHONE_PREFIX;
    syncMinorSection();
    syncExperienceSection();
    showStatus('Su solicitud ha sido enviada correctamente. La organización revisará los antecedentes y podrá contactarle para continuar el proceso.', true);
  } catch (error) {
    showStatus(error.message || 'No fue posible enviar la solicitud.', false);
  } finally {
    setLoading(false);
  }
});

function renderMemberForm() {
  form.innerHTML = `
    <section class="member-form-section member-form-intro" aria-labelledby="member-intro-title">
      <h3 id="member-intro-title">Solicitud de ingreso como socio/a</h3>
      <p>
        Usted está solicitando incorporarse a Agrupación Nothofagus. La información entregada será utilizada para evaluar y gestionar su solicitud de ingreso.
      </p>
      <p class="member-help">Los campos marcados con <span class="required-mark">*</span> son obligatorios.</p>
    </section>

    <fieldset class="member-form-section">
      <legend>Antecedentes personales</legend>
      <div class="member-form-row two-columns">
        <label>Nombre completo <span class="required-mark">*</span>
          <input id="member-name" type="text" autocomplete="name" required>
        </label>
        <label>RUT o documento de identidad <span class="required-mark">*</span>
          <input id="member-rut" type="text" placeholder="Ej: 12.345.678-9" required>
        </label>
      </div>

      <div class="member-form-row three-columns">
        <label>Fecha de nacimiento <span class="required-mark">*</span>
          <input id="member-birthdate" type="date" required>
        </label>
        <label>Edad <span class="required-mark">*</span>
          <input id="member-age" type="number" min="12" max="120" required>
        </label>
        <div class="member-radio-group" role="radiogroup" aria-labelledby="member-minor-label">
          <span id="member-minor-label">¿Es usted menor de edad? <span class="required-mark">*</span></span>
          <label><input type="radio" name="member-minor" value="si" required> Sí</label>
          <label><input type="radio" name="member-minor" value="no"> No</label>
        </div>
      </div>

      <label>Domicilio <span class="required-mark">*</span>
        <input id="member-address" type="text" autocomplete="street-address" required>
      </label>

      <div class="member-form-row two-columns">
        <label>Comuna <span class="required-mark">*</span>
          <input id="member-city" type="text" required>
        </label>
        <label>Teléfono de contacto <span class="required-mark">*</span>
          <input id="member-phone" type="tel" value="+569" inputmode="tel" autocomplete="tel" required>
        </label>
      </div>

      <div class="member-form-row two-columns">
        <label>Correo electrónico <span class="required-mark">*</span>
          <input id="member-email" type="email" autocomplete="email" required>
        </label>
        <label>Ocupación, oficio, profesión o actividad principal <span class="required-mark">*</span>
          <input id="member-occupation" type="text" required>
        </label>
      </div>
    </fieldset>

    <fieldset class="member-form-section member-conditional-section is-hidden" id="member-minor-section">
      <legend>Autorización para menores de edad</legend>
      <p class="member-help">Esta sección debe ser completada por madre, padre, tutor/a legal o adulto responsable legalmente habilitado.</p>

      <label>Nombre completo de madre, padre, tutor/a legal o adulto responsable legalmente habilitado
        <input id="member-adult-name" type="text">
      </label>

      <div class="member-form-row two-columns">
        <label>RUT del adulto responsable
          <input id="member-adult-rut" type="text" placeholder="Ej: 12.345.678-9">
        </label>
        <label>Vínculo con la persona menor de edad
          <select id="member-adult-link">
            <option value="">Seleccione una opción</option>
            <option value="Madre">Madre</option>
            <option value="Padre">Padre</option>
            <option value="Tutor/a legal">Tutor/a legal</option>
            <option value="Adulto responsable legalmente habilitado">Adulto responsable legalmente habilitado</option>
            <option value="Otro vínculo legalmente acreditado">Otro vínculo legalmente acreditado</option>
          </select>
        </label>
      </div>

      <div class="member-form-row two-columns">
        <label>Teléfono del adulto responsable
          <input id="member-adult-phone" type="tel" value="+569" inputmode="tel">
        </label>
        <label>Correo electrónico del adulto responsable
          <input id="member-adult-email" type="email">
        </label>
      </div>

      <label class="member-checkbox declaration-box">
        <input id="member-adult-declaration" type="checkbox">
        <span>Declaro estar legalmente habilitado/a para autorizar la solicitud de ingreso de la persona menor de edad.</span>
      </label>
    </fieldset>

    <fieldset class="member-form-section">
      <legend>Categoría de socio/a y vínculo con la organización</legend>
      <label>Categoría de socio/a solicitada <span class="required-mark">*</span>
        <select id="member-category" required>
          <option value="">Seleccione una categoría</option>
          <option value="Socio/a activo/a">Socio/a activo/a</option>
          <option value="Socio/a colaborador/a">Socio/a colaborador/a</option>
          <option value="Socio/a benefactor/a">Socio/a benefactor/a</option>
        </select>
      </label>

      <label>¿Tiene vínculo territorial, comunitario, educacional, social, cultural o funcional con la comuna o con los fines de la Organización? <span class="required-mark">*</span>
        <span class="member-help">Describa brevemente su vínculo con el territorio, comunidad, institución, área de interés o con los fines de Nothofagus.</span>
        <textarea id="member-organization-link" rows="4" required></textarea>
      </label>
    </fieldset>

    <fieldset class="member-form-section">
      <legend>Motivación e intereses</legend>
      <label>¿Por qué desea incorporarse a la Agrupación Nothofagus? <span class="required-mark">*</span>
        <textarea id="member-motivation" rows="5" required></textarea>
      </label>

      <div class="member-checkbox-group" aria-labelledby="member-areas-label">
        <span id="member-areas-label">¿En qué áreas le gustaría participar o colaborar? <span class="required-mark">*</span></span>
        ${renderAreaOptions()}
      </div>

      <label>Si marcó “Otro”, especifique
        <input id="member-other-area" type="text">
      </label>

      <label>¿Qué tipo de aporte cree que puede realizar a la Organización? <span class="required-mark">*</span>
        <textarea id="member-contribution" rows="4" required></textarea>
      </label>

      <div class="member-radio-group" role="radiogroup" aria-labelledby="member-experience-label">
        <span id="member-experience-label">¿Tiene experiencia previa en organizaciones sociales, comunitarias, culturales, educativas, ambientales o similares? <span class="required-mark">*</span></span>
        <label><input type="radio" name="member-experience" value="si" required> Sí</label>
        <label><input type="radio" name="member-experience" value="no"> No</label>
      </div>

      <label id="member-experience-section" class="member-conditional-section is-hidden">Si respondió sí, describa brevemente su experiencia
        <textarea id="member-experience-description" rows="4"></textarea>
      </label>
    </fieldset>

    <fieldset class="member-form-section">
      <legend>Declaración final</legend>
      <label class="member-checkbox declaration-box">
        <input id="member-final-declaration" type="checkbox" required>
        <span>Declaro que la información entregada es verdadera y manifiesto mi interés en incorporarme a Agrupación Nothofagus. <span class="required-mark">*</span></span>
      </label>
    </fieldset>

    <label class="member-honeypot" aria-hidden="true">Sitio web
      <input id="member-website" type="text" tabindex="-1" autocomplete="off">
    </label>

    <div class="member-form-actions">
      <button type="button" class="member-cancel-button" data-member-cancel>Cancelar</button>
      <button type="submit" class="member-submit-button">Enviar solicitud</button>
    </div>

    <p id="member-status" class="member-status" aria-live="polite"></p>
  `;
}

function renderAreaOptions() {
  const areas = [
    'Educación y capacitación',
    'Cultura, artes y patrimonio',
    'Medio ambiente y territorio',
    'Investigación, estudios o publicaciones',
    'Proyectos comunitarios o fondos concursables',
    'Comunicaciones y redes sociales',
    'Vinculación territorial o comunitaria',
    'Actividades internas de la organización',
    'Administración, archivo o apoyo organizacional',
    'Apoyo económico o material',
    'Otro'
  ];

  return areas.map((area) => `
    <label class="member-checkbox">
      <input type="checkbox" name="member-areas" value="${escapeAttr(area)}">
      <span>${escapeHTML(area)}</span>
    </label>
  `).join('');
}

function collectPayload() {
  return {
    nombre: value('#member-name'),
    rut_documento: value('#member-rut'),
    fecha_nacimiento: value('#member-birthdate'),
    edad: value('#member-age'),
    menor_edad: checkedRadio('member-minor') === 'si',
    domicilio: value('#member-address'),
    comuna: value('#member-city'),
    telefono: value('#member-phone'),
    correo: value('#member-email'),
    ocupacion: value('#member-occupation'),
    adulto_nombre: value('#member-adult-name'),
    adulto_rut: value('#member-adult-rut'),
    adulto_vinculo: value('#member-adult-link'),
    adulto_telefono: value('#member-adult-phone'),
    adulto_correo: value('#member-adult-email'),
    adulto_declaracion: document.querySelector('#member-adult-declaration')?.checked || false,
    categoria_socio: value('#member-category'),
    vinculo_organizacion: value('#member-organization-link'),
    motivacion: value('#member-motivation'),
    areas_participacion: checkedValues('member-areas'),
    otro_area: value('#member-other-area'),
    aporte: value('#member-contribution'),
    experiencia_previa: checkedRadio('member-experience') === 'si',
    experiencia_descripcion: value('#member-experience-description'),
    declaracion_final: document.querySelector('#member-final-declaration')?.checked || false,
    sitio_web: value('#member-website')
  };
}

function validatePayload(payload) {
  const required = [
    payload.nombre,
    payload.rut_documento,
    payload.fecha_nacimiento,
    payload.edad,
    payload.domicilio,
    payload.comuna,
    payload.telefono,
    payload.correo,
    payload.ocupacion,
    payload.categoria_socio,
    payload.vinculo_organizacion,
    payload.motivacion,
    payload.aporte
  ];

  if (required.some((item) => !String(item || '').trim())) {
    return { ok: false, message: 'Completa todos los campos obligatorios antes de enviar.' };
  }

  if (!checkedRadio('member-minor')) return { ok: false, message: 'Indica si eres o no menor de edad.' };
  if (!checkedRadio('member-experience')) return { ok: false, message: 'Indica si tienes experiencia previa en organizaciones.' };
  if (!payload.areas_participacion.length) return { ok: false, message: 'Selecciona al menos un área de participación o colaboración.' };
  if (payload.areas_participacion.includes('Otro') && !payload.otro_area) return { ok: false, message: 'Si marcaste “Otro”, debes especificar el área de interés.' };
  if (payload.experiencia_previa && !payload.experiencia_descripcion) return { ok: false, message: 'Describe brevemente tu experiencia previa.' };
  if (!payload.declaracion_final) return { ok: false, message: 'Debes aceptar la declaración final para enviar la solicitud.' };

  if (!/^\+569\d{8}$/.test(payload.telefono)) return { ok: false, message: 'Ingresa un teléfono válido con formato +569XXXXXXXX.' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.correo)) return { ok: false, message: 'Ingresa un correo electrónico válido.' };

  if (payload.menor_edad) {
    const adultRequired = [payload.adulto_nombre, payload.adulto_rut, payload.adulto_vinculo, payload.adulto_telefono, payload.adulto_correo];
    if (adultRequired.some((item) => !String(item || '').trim())) return { ok: false, message: 'Completa los antecedentes del adulto responsable.' };
    if (!/^\+569\d{8}$/.test(payload.adulto_telefono)) return { ok: false, message: 'Ingresa un teléfono válido para el adulto responsable.' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.adulto_correo)) return { ok: false, message: 'Ingresa un correo válido para el adulto responsable.' };
    if (!payload.adulto_declaracion) return { ok: false, message: 'El adulto responsable debe aceptar la declaración de habilitación legal.' };
  }

  return { ok: true, message: '' };
}

function syncMinorSection() {
  const isMinor = checkedRadio('member-minor') === 'si';
  minorSection?.classList.toggle('is-hidden', !isMinor);
  minorSection?.querySelectorAll('input, select').forEach((field) => {
    if (field.id === 'member-adult-declaration') {
      field.required = isMinor;
      return;
    }
    field.required = isMinor;
  });
}

function syncExperienceSection() {
  const hasExperience = checkedRadio('member-experience') === 'si';
  experienceSection?.classList.toggle('is-hidden', !hasExperience);
  const textarea = document.querySelector('#member-experience-description');
  if (textarea) textarea.required = hasExperience;
}

function installPhoneMask(input) {
  input?.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '');
    const withoutCountry = digits.replace(/^569?/, '').slice(0, 8);
    input.value = `${PHONE_PREFIX}${withoutCountry}`;
  });

  input?.addEventListener('blur', () => {
    if (!input.value.startsWith(PHONE_PREFIX)) input.value = PHONE_PREFIX;
  });
}

function openMemberPanel() {
  clearTimeout(memberPanelTimer);
  panel.classList.remove('is-hidden', 'is-closing');
  toggle?.setAttribute('aria-expanded', 'true');
  setTimeout(() => document.querySelector('#member-name')?.focus(), 120);
}

function closeMemberPanel() {
  if (!panel || panel.classList.contains('is-hidden')) return;

  clearTimeout(memberPanelTimer);
  panel.classList.add('is-closing');
  toggle?.setAttribute('aria-expanded', 'false');

  memberPanelTimer = setTimeout(() => {
    panel.classList.add('is-hidden');
    panel.classList.remove('is-closing');
  }, MEMBER_PANEL_ANIMATION_MS);
}

function setLoading(isLoading) {
  if (!submitButton) return;
  submitButton.disabled = isLoading;
  submitButton.textContent = isLoading ? 'Enviando...' : 'Enviar solicitud';
}

function showStatus(message, ok) {
  status.textContent = message;
  status.classList.toggle('success', ok);
  status.classList.toggle('error', !ok);
}

function calculateAge(dateValue) {
  if (!dateValue) return null;
  const today = new Date();
  const birth = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;

  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function checkedRadio(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
}

function checkedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((input) => input.value);
}

function value(selector) {
  return document.querySelector(selector)?.value.trim() || '';
}

function escapeHTML(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHTML(value);
}