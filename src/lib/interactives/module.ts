import type { ComponentType } from 'react';
import { importFreshModule } from '../fresh-module';
import type { InteractiveRuntime } from './runtime';

export type InteractiveValue =
  | string
  | number
  | boolean
  | null
  | InteractiveValue[]
  | { [key: string]: InteractiveValue };

export interface InteractiveProps extends InteractiveRuntime {
  id: string;
  parameters: Readonly<Record<string, InteractiveValue>>;
}

export interface InteractiveModule {
  default: ComponentType<InteractiveProps>;
}

// Successful modules are shared across mounts. Only failed requests need a fresh URL.
const modules = new Map<string, Promise<InteractiveModule>>();

export async function loadInteractive(
  entry: string,
): Promise<InteractiveModule> {
  const url = new URL(entry, window.location.href);
  if (url.origin !== window.location.origin || !/^https?:$/u.test(url.protocol))
    throw new Error('Модуль интерактива должен находиться на этом сайте.');
  const cached = modules.get(url.href);
  if (cached) return cached;
  const pending = importFreshModule<unknown>(url.href)
    .then((loaded) => {
      if (
        typeof loaded !== 'object' ||
        loaded === null ||
        !('default' in loaded) ||
        typeof loaded.default !== 'function'
      )
        throw new Error('Модуль интерактива должен экспортировать компонент.');
      return loaded as InteractiveModule;
    })
    .catch((error: unknown) => {
      modules.delete(url.href);
      throw error;
    });
  modules.set(url.href, pending);
  return pending;
}
