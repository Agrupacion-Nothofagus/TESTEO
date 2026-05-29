const formulario = document.querySelector('#publication-form');
const resultado = document.querySelector('#resultado');
const fecha = document.querySelector('#fecha');

if (fecha) {
  fecha.valueAsDate = new Date();
}

function crearSlug(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
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
