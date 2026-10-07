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
    target.querySelectorAll('[data-clear-theme]').forEach((button) => {
      button.disabled = false;
    });
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => apply());
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) preference = readPreference();
    apply();
  });
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
  document.addEventListener('click', (event) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest('[data-clear-theme]')
    )
      return;
    preference = 'system';
    apply();
    let message = 'Сохранённая тема удалена. Включена системная тема.';
    try {
      localStorage.removeItem(key);
    } catch {
      message =
        'Браузер не разрешил удалить настройку. Для этой страницы включена системная тема.';
    }
    const status = document.getElementById('privacy-reset-status');
    if (status) status.textContent = message;
  });
})();
