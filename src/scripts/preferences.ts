import { browserStore, browserCache } from '../core/storage/browser';
import { PREFIX } from '../core/storage/schemas';
const store = browserStore();
const system = window.matchMedia('(prefers-color-scheme: dark)');
function apply() {
  const settings = store.read('settings');
  const root = document.documentElement;
  root.dataset.themePreference = settings.theme;
  root.dataset.theme =
    settings.theme === 'system'
      ? system.matches
        ? 'dark'
        : 'light'
      : settings.theme;
  root.dataset.fontSize = String(settings.fontSize);
  root.dataset.animations = settings.animations ? 'on' : 'off';
  const motion = document.getElementById('navigation-motion');
  if (motion instanceof HTMLLinkElement) motion.disabled = !settings.animations;
  document
    .querySelectorAll<HTMLSelectElement>('[data-theme-select]')
    .forEach((select) => {
      select.value = settings.theme;
      select.disabled = false;
    });
  document
    .querySelectorAll<HTMLButtonElement>('[data-clear-theme]')
    .forEach((button) => {
      button.disabled = false;
    });
  const banner = document.getElementById('storage-notice');
  if (banner) {
    const messages = store.messages();
    if (browserCache().notice) messages.push(browserCache().notice);
    if (browserCache().memoryOnly)
      messages.push(
        'Временное хранилище недоступно. Кэш ИИ останется только в памяти страницы.',
      );
    banner.textContent = messages.join(' ');
    banner.hidden = messages.length === 0;
  }
}
store.subscribe(apply);
apply();
system.addEventListener('change', apply);
window.addEventListener('pageshow', (event) => {
  if (event.persisted) store.refresh();
  apply();
});
window.addEventListener('storage', (event) => {
  if (
    event.key === null ||
    event.key.startsWith(PREFIX) ||
    event.key === 'oge.theme'
  )
    store.refresh();
});
document.addEventListener('change', (event) => {
  if (
    !(event.target instanceof HTMLSelectElement) ||
    !event.target.matches('[data-theme-select]')
  )
    return;
  const theme = event.target.value;
  if (theme === 'system' || theme === 'light' || theme === 'dark')
    store.write('settings', { ...store.read('settings'), theme });
});
document.addEventListener('click', (event) => {
  if (
    !(event.target instanceof Element) ||
    !event.target.closest('[data-clear-theme]')
  )
    return;
  store.write('settings', { ...store.read('settings'), theme: 'system' });
  const status = document.getElementById('privacy-reset-status');
  if (status)
    status.textContent = store.memoryOnly
      ? 'Браузер не разрешил удалить настройку. Для этой страницы включена системная тема.'
      : 'Сохранённая тема удалена. Включена системная тема.';
});
