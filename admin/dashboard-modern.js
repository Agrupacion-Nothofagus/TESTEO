// Dashboard moderno estabilizado.
// Este archivo evita observadores recursivos y solo corrige el titulo duplicado.
if (!window.__nothofagusDashboardModernSafe) {
  window.__nothofagusDashboardModernSafe = true;
  setTimeout(() => {
    const hero = document.querySelector('#dashboard-view .dashboard-hero-card');
    if (!hero) return;
    hero.classList.add('dashboard-overview-clean');
    hero.innerHTML = '<p class="section-tag">Vista operativa</p><p class="dashboard-overview-lead">Revisa rapidamente el estado institucional: publicaciones, solicitudes, miembros, actas, tesoreria y usuarios.</p><div class="dashboard-overview-strip"><span>Publicaciones<strong data-modern-total="publicaciones">—</strong></span><span>Solicitudes<strong data-modern-total="pendientes">—</strong></span><span>Miembros<strong data-modern-total="miembros">—</strong></span><span>Usuarios<strong data-modern-total="usuarios">—</strong></span></div>';
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'dashboard-modern.css';
    document.head.appendChild(link);
    const copy = () => ['publicaciones','pendientes','miembros','usuarios'].forEach((name) => {
      const source = document.querySelector('[data-dashboard-total="' + name + '"]');
      document.querySelectorAll('[data-modern-total="' + name + '"]').forEach((target) => {
        target.textContent = source ? source.textContent : '—';
      });
    });
    copy();
    setTimeout(copy, 700);
    setTimeout(copy, 1800);
  }, 120);
}
