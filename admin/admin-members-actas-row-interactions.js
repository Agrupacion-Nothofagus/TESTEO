(() => {
  if (window.__nothofagusMembersActasRowInteractions) return;
  window.__nothofagusMembersActasRowInteractions = true;

  document.addEventListener('click', (event) => {
    const requestMain = event.target.closest?.('.member-request-main');
    if (!requestMain) return;
    if (event.target.closest('summary, details, button, a, input, select, textarea, label')) return;

    const details = requestMain.querySelector('.member-detail-box');
    if (!details) return;

    event.preventDefault();
    details.open = !details.open;
  });
})();
