// Carga el ajuste visual del selector de acciones de usuarios.
// No modifica contenido ni lógica: solo estilo.
if (!window.__nothofagusUsersActionsActasStyle) {
  window.__nothofagusUsersActionsActasStyle = true;

  if (!document.querySelector('link[href="users-actions-actas-style.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'users-actions-actas-style.css';
    document.head.appendChild(link);
  }
}
