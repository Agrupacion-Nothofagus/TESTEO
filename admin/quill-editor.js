import './roles-miembros.js?v=20260620-final-roles';
import './users-role-fix.js?v=20260620-final-roles';
import './miembros-delete.js?v=20260620-observer-fix';
import './miembros-admin.js?v=20260620-observer-fix';

const source = document.querySelector('#contenido');
const editorElement = document.querySelector('#contenido-editor');

let quill = null;
let internalUpdate = false;

if (source && editorElement && window.Quill) {
  quill = new window.Quill(editorElement, {
    theme: 'snow',
    placeholder: 'Desarrolla aquí el contenido completo de la publicación.',
    modules: {
      toolbar: [
        [{ header: [2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote', 'link'],
        ['clean']
      ]
    }
  });

  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

  if (descriptor?.get && descriptor?.set) {
    Object.defineProperty(source, 'value', {
      configurable: true,
      get() {
        return descriptor.get.call(this);
      },
      set(value) {
        descriptor.set.call(this, value);
        if (!internalUpdate) {
          setEditorContent(String(value || ''));
        }
      }
    });
  }

  source.classList.add('rich-editor-source-hidden');
  setEditorContent(source.value);

  quill.on('text-change', () => {
    internalUpdate = true;
    source.value = quill.root.innerHTML;
    internalUpdate = false;
  });

  source.closest('form')?.addEventListener('submit', () => {
    internalUpdate = true;
    source.value = quill.root.innerHTML;
    internalUpdate = false;
  }, true);

  source.closest('form')?.addEventListener('reset', () => {
    setTimeout(() => setEditorContent(''), 0);
  });
}

function setEditorContent(value) {
  if (!quill) return;

  const content = String(value || '').trim();
  if (!content) {
    quill.setText('');
    return;
  }

  if (looksLikeHTML(content)) {
    quill.clipboard.dangerouslyPasteHTML(content, 'silent');
    return;
  }

  quill.setText(content, 'silent');
}

function looksLikeHTML(value) {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}
