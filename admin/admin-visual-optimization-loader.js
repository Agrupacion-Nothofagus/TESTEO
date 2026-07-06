(() => {
  if (window.__nothofagusAdminVisualOptimization) return;
  window.__nothofagusAdminVisualOptimization = true;

  if (!document.querySelector('link[data-visual-font="plus-jakarta"]')) {
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap';
    font.dataset.visualFont = 'plus-jakarta';
    document.head.appendChild(font);
  }

  if (!document.querySelector('link[data-visual-optimization]')) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '../visual-optimization.css?v=20260704-plus-jakarta-responsive';
    css.dataset.visualOptimization = 'true';
    document.head.appendChild(css);
  }

  if (!document.querySelector('link[data-visual-colors-restore]')) {
    const colors = document.createElement('link');
    colors.rel = 'stylesheet';
    colors.href = '../visual-colors-restore.css?v=20260706-logo';
    colors.dataset.visualColorsRestore = 'true';
    document.head.appendChild(colors);
  }
})();
