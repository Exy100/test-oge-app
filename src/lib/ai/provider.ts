import type { FeedbackProvider } from './contract';
import demoUrl from './demo-provider.ts?module-url';
import { importFreshModule } from '../fresh-module';

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
