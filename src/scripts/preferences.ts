import {
  subscribeAppearance,
  type AppearanceSettings,
} from '../lib/preferences-bridge';

const system = window.matchMedia('(prefers-color-scheme: dark)');
let current: AppearanceSettings | null = null;
let changing = false;
function fromRoot(): AppearanceSettings {
  const data = document.documentElement.dataset;
  return {
    version: 1,
    theme:
      data.themePreference === 'light' || data.themePreference === 'dark'
        ? data.themePreference
        : 'system',
    fontSize:
      data.fontSize === '125'
        ? 125
        : data.fontSize === '150'
          ? 150
          : data.fontSize === '200'
            ? 200
            : 100,
    animations: data.animations !== 'off',
  };
}
function messages(values: string[]) {
  const banner = document.getElementById('storage-notice');
  if (banner) {
    banner.textContent = values.join(' ');
    banner.hidden = values.length === 0;
  }
}
function apply(settings: AppearanceSettings) {
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
      select.disabled = changing;
    });
  document
    .querySelectorAll<HTMLButtonElement>('[data-clear-theme]')
    .forEach((button) => {
      button.disabled = changing;
    });
}
function refreshLight() {
  window.dispatchEvent(new Event('oge:read-appearance'));
  apply(fromRoot());
  const notice = document.documentElement.dataset.appearanceNotice;
  messages(
    notice === 'blocked'
      ? [
          'Хранилище недоступно. Изменения могут остаться только в памяти этой страницы.',
        ]
      : notice === 'invalid'
        ? [
            'Сохранённые настройки повреждены. Открой настройки для проверки данных.',
          ]
        : [],
  );
}
refreshLight();
subscribeAppearance((snapshot) => {
  current = snapshot.settings;
  apply(snapshot.settings);
  messages(snapshot.messages);
});
system.addEventListener('change', () => {
  apply(current ?? fromRoot());
});
window.addEventListener('storage', () => {
  if (!current) refreshLight();
});
window.addEventListener('pageshow', () => {
  if (current) apply(current);
  else refreshLight();
});

async function writeTheme(theme: AppearanceSettings['theme'], clear = false) {
  if (changing) return;
  changing = true;
  apply(current ?? fromRoot());
  try {
    const { browserStore } = await import('../core/storage/browser');
    const store = browserStore();
    store.write('settings', { ...store.read('settings'), theme });
    if (clear) {
      const status = document.getElementById('privacy-reset-status');
      if (status)
        status.textContent = store.memoryOnly
          ? 'Браузер не разрешил удалить настройку. Для этой страницы включена системная тема.'
          : 'Сохранённая тема удалена. Включена системная тема.';
    }
  } catch {
    messages([
      'Не удалось сохранить настройку. Проверь соединение и повтори выбор.',
    ]);
  } finally {
    changing = false;
    apply(current ?? fromRoot());
  }
}
document.addEventListener('change', (event) => {
  if (
    !(event.target instanceof HTMLSelectElement) ||
    !event.target.matches('[data-theme-select]')
  )
    return;
  const theme = event.target.value;
  if (theme === 'system' || theme === 'light' || theme === 'dark')
    void writeTheme(theme);
});
document.addEventListener('click', (event) => {
  if (
    event.target instanceof Element &&
    event.target.closest('[data-clear-theme]')
  )
    void writeTheme('system', true);
});
