const formulario = document.querySelector('#publication-form');
const resultado = document.querySelector('#resultado');
const fecha = document.querySelector('#fecha');
const resetButton = document.querySelector('#reset-form');

if (fecha) {
  fecha.valueAsDate = new Date();
}

formulario.addEventListener('submit', (evento) => {
  evento.preventDefault();

  const titulo = document.querySelector('#titulo').value.trim();
  const publicacion = {
    id: crearSlug(titulo),
    estado: document.querySelector('#estado').value,
    fecha: document.querySelector('#fecha').value,
    categoria: document.querySelector('#categoria').value.trim(),
    titulo,
    resumen: document.querySelector('#resumen').value.trim(),
    imagen: document.querySelector('#imagen').value.trim(),
    enlace: document.querySelector('#enlace').value.trim() || '#'
  };

  resultado.textContent = JSON.stringify(publicacion, null, 2);
});

resetButton.addEventListener('click', () => {
  formulario.reset();
  fecha.valueAsDate = new Date();
  resultado.textContent = 'Completa el formulario para generar una publicación.';
});

function crearSlug(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
