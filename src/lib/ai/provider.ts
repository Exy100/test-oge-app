import type { FeedbackProvider } from './contract';
import demoUrl from './demo-provider.ts?module-url';
import { importFreshModule } from '../fresh-module';
import apiUrl from './api-provider.ts?module-url';
import httpUrl from './http.ts?module-url';

export interface FeedbackApi {
  load: () => Promise<FeedbackProvider>;
  available?: (signal: AbortSignal) => Promise<void>;
}

/** Public build setting; never inferred from a URL, stored preference or secret. */
export const aiApiEnabled = import.meta.env.PUBLIC_AI_MODE === 'api';
export const feedbackApi: FeedbackApi | undefined = aiApiEnabled
  ? {
      load: async () =>
        (
          await importFreshModule<typeof import('./api-provider')>(apiUrl)
        ).createApiFeedbackProvider(),
      available: async (signal) =>
        (
          await importFreshModule<typeof import('./http')>(httpUrl)
        ).checkAiHealth(signal),
    }
  : undefined;

/** Switch the transport and its description here when the real API is ready. */
export const feedbackSource = {
  label: 'Демонстрационный режим',
  notice:
    'Это пример разбора из заготовки. Твой ответ и черновик остаются в этом браузере.',
  actionLabel: 'Показать пример разбора',
};

export async function loadFeedbackProvider(): Promise<FeedbackProvider> {
  const { demoFeedbackProvider } =
    await importFreshModule<typeof import('./demo-provider')>(demoUrl);
  return demoFeedbackProvider;
}
