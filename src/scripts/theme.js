// Blocking, dependency-free preference bootstrap before CSS and body.
(() => {
  let settings = { theme: 'system', fontSize: 100, animations: true };
  try {
    const journal = localStorage.getItem('oge:informatics:v1:transaction');
    const raw = localStorage.getItem('oge:informatics:v1:settings');
    const value = journal
      ? JSON.parse(journal).settings
      : raw
        ? JSON.parse(raw)
        : null;
    if (
      value &&
      (value.version === 1 || value.version === 0) &&
      ['system', 'light', 'dark'].includes(value.theme)
    ) {
      settings.theme = value.theme;
      if (
        value.version === 1 &&
        [100, 125, 150, 200].includes(value.fontSize) &&
        typeof value.animations === 'boolean'
      )
        settings = value;
    } else if (!raw) {
      const legacy = localStorage.getItem('oge.theme');
      if (legacy === 'light' || legacy === 'dark') settings.theme = legacy;
    }
  } catch {
    /* Defaults remain readable when browser storage is unavailable. */
  }
  const root = document.documentElement;
  root.dataset.themePreference = settings.theme;
  root.dataset.theme =
    settings.theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : settings.theme;
  root.dataset.fontSize = String(settings.fontSize);
  root.dataset.animations = settings.animations ? 'on' : 'off';
  const motion = document.getElementById('navigation-motion');
  if (motion) motion.disabled = !settings.animations;
})();
