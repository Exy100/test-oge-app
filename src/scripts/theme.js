// Runs before the stylesheet and body, independently of React hydration.
(() => {
  const marker = Symbol.for('oge.theme.initialized');
  if (window[marker]) return;
  window[marker] = true;

  const key = 'oge.theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const normalize = (value) =>
    value === 'light' || value === 'dark' ? value : 'system';
  function readPreference() {
    try {
      return normalize(localStorage.getItem(key));
    } catch {
      return 'system';
    }
  }
  let preference = readPreference();

  function apply(target = document) {
    const theme =
      preference === 'system'
        ? system.matches
          ? 'dark'
          : 'light'
        : preference;
    target.documentElement.dataset.theme = theme;
    target.documentElement.dataset.themePreference = preference;
    target.querySelectorAll('[data-theme-select]').forEach((select) => {
      select.value = preference;
      select.disabled = false;
    });
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => apply());
  document.addEventListener('astro:page-load', () => apply());
  document.addEventListener('astro:before-swap', (event) =>
    apply(event.newDocument),
  );
  document.addEventListener('change', (event) => {
    if (
      !(event.target instanceof HTMLSelectElement) ||
      !event.target.matches('[data-theme-select]')
    )
      return;
    preference = normalize(event.target.value);
    apply();
    try {
      localStorage.setItem(key, preference);
    } catch {
      // Keep the choice for this tab even when browser storage is unavailable.
      return;
    }
  });
  system.addEventListener('change', () => {
    if (preference === 'system') apply();
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = readPreference();
    apply();
  });
})();
