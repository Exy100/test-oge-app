import {
  areaNames,
  areaLabels,
  defaults,
  parseArea,
  areasSchema,
  PREFIX,
  MAX_BACKUP_BYTES,
} from './schemas';
import type { Area, Areas } from './schemas';
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export type StorageGetter = () => StoragePort;
export const JOURNAL = `${PREFIX}transaction`;
export class LocalStore {
  private data = defaults();
  private port: StoragePort | undefined;
  private listeners = new Set<() => void>();
  private notices = new Set<string>();
  memoryOnly = false;
  constructor(getStorage: StorageGetter) {
    try {
      this.port = getStorage();
      this.load();
    } catch {
      this.fallback();
    }
  }
  private fallback() {
    this.memoryOnly = true;
    this.notices.add(
      'Хранилище недоступно или заполнено. Изменения останутся только в памяти этой страницы. Экспортируй данные перед её закрытием.',
    );
  }
  private emit() {
    for (const listener of this.listeners) listener();
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  messages() {
    return [...this.notices];
  }
  read<K extends Area>(area: K): Areas[K] {
    return structuredClone(this.data[area]);
  }
  snapshot(): Areas {
    return structuredClone(this.data);
  }
  private load() {
    if (!this.port) return;
    const journal = this.port.getItem(JOURNAL);
    if (journal) {
      try {
        this.data = areasSchema.parse(JSON.parse(journal));
        this.persistAll();
        return;
      } catch {
        if (this.memoryOnly) return;
        this.notices.add(
          'Повреждённая запись импорта удалена. Проверены сохранённые области.',
        );
        this.port.removeItem(JOURNAL);
      }
    }
    const removals: string[] = [];
    const updates: [string, string][] = [];
    for (const area of areaNames) {
      const raw = this.port.getItem(PREFIX + area);
      if (raw === null) continue;
      try {
        if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES)
          throw new Error('Размер');
        const value = parseArea(area, JSON.parse(raw));
        this.data = areasSchema.parse({ ...this.data, [area]: value });
        if (JSON.stringify(value) !== raw)
          updates.push([PREFIX + area, JSON.stringify(value)]);
      } catch {
        this.notices.add(
          `Повреждены данные «${areaLabels[area]}». Эта область сброшена.`,
        );
        this.data = { ...this.data, [area]: defaults()[area] };
        removals.push(PREFIX + area);
      }
    }
    const oldTheme = this.port.getItem('oge.theme');
    if (oldTheme !== null) {
      if (
        !this.port.getItem(PREFIX + 'settings') &&
        ['system', 'light', 'dark'].includes(oldTheme)
      ) {
        this.data.settings = parseArea('settings', {
          ...this.data.settings,
          theme: oldTheme,
        });
        updates.push([PREFIX + 'settings', JSON.stringify(this.data.settings)]);
      }
      removals.push('oge.theme');
    }
    // Finish all reads before writes: quota errors must not erase loaded data.
    for (const [key, value] of updates) this.port.setItem(key, value);
    for (const key of removals) this.port.removeItem(key);
  }
  refresh() {
    if (this.memoryOnly) return;
    this.data = defaults();
    try {
      this.load();
    } catch {
      this.fallback();
    }
    this.emit();
  }
  write<K extends Area>(area: K, value: Areas[K]) {
    const validated = parseArea(area, value);
    this.data = areasSchema.parse({ ...this.data, [area]: validated });
    if (!this.memoryOnly) {
      try {
        this.port?.setItem(PREFIX + area, JSON.stringify(validated));
      } catch {
        this.fallback();
      }
    }
    this.emit();
  }
  private persistAll() {
    if (this.memoryOnly || !this.port) return;
    try {
      // A complete journal is authoritative until all seven area writes finish.
      this.port.setItem(JOURNAL, JSON.stringify(this.data));
      for (const area of areaNames)
        this.port.setItem(PREFIX + area, JSON.stringify(this.data[area]));
      this.port.removeItem(JOURNAL);
      this.port.removeItem('oge.theme');
    } catch {
      this.fallback();
    }
  }
  replace(value: Areas) {
    this.data = areasSchema.parse(value);
    this.persistAll();
    this.emit();
  }
  clear() {
    this.data = defaults();
    let success = true;
    for (const key of [
      ...areaNames.map((area) => PREFIX + area),
      JOURNAL,
      'oge.theme',
    ]) {
      try {
        if (!this.port) throw new Error('Нет доступа');
        this.port.removeItem(key);
      } catch {
        success = false;
        this.fallback();
      }
    }
    this.emit();
    return success;
  }
}
