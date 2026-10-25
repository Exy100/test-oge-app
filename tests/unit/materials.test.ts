import { describe, expect, it } from 'vitest';
import {
  materialSections,
  lessonCatalog,
  lessonRoute,
  sectionHref,
  sectionPractice,
  matchesNumbers,
  readMaterialFilter,
  writeMaterialFilter,
} from '../../src/lib/lessons/catalog';
import {
  lessonCompletion,
  sectionAttempts,
  setLessonCompleted,
} from '../../src/lib/lessons/progress';
import { LocalStore, type StoragePort } from '../../src/core/storage/store';
import { defaults, parseBackup } from '../../src/core/storage/schemas';
import { parseStreamQuery } from '../../src/lib/stream-url';
import coverage from '../../coverage.config';
import type { LessonMetadata } from '../../src/lib/lessons/schema';

const lesson = (id: string, prerequisites: string[] = []): LessonMetadata => ({
  id,
  title: id,
  section: 'i1',
  taskNumbers: [1],
  readingMinutes: 5,
  prerequisites,
});
class MemoryStorage implements StoragePort {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

describe('materials catalog', () => {
  it('covers the same 14 sections as the content schema and all numbers 1–16', () => {
    expect(materialSections.map((section) => section.id).sort()).toEqual(
      Object.keys(coverage.lessons.sections).sort(),
    );
    expect(
      [...new Set(materialSections.flatMap((section) => section.numbers))].sort(
        (a, b) => a - b,
      ),
    ).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
    for (const section of materialSections) {
      for (const prerequisite of section.prerequisites) {
        const parent = materialSections.find(
          (item) => item.id === prerequisite,
        );
        expect(parent).toBeDefined();
        expect(parent?.row).toBeLessThan(section.row);
        expect(sectionHref(prerequisite)).toBe('/materials/#' + prerequisite);
      }
      for (const link of sectionPractice(section)) {
        const parsed = parseStreamQuery(
          new URL(link.href, 'https://example.test').search,
          [],
        );
        expect(parsed.filters.numbers).toEqual([...section.numbers]);
      }
    }
    expect(() => sectionHref('elsewhere')).toThrow('Неизвестный');
  });

  it('keeps document and presentation routes separate', () => {
    const section = materialSections.find((section) => section.id === 'i11');
    if (!section) throw new Error('Нет раздела №13.');
    const links = sectionPractice(section);
    expect(
      links.map((link) =>
        new URL(link.href, 'https://example.test').searchParams.get(
          'variant13',
        ),
      ),
    ).toEqual(['presentation', 'document']);
  });

  it('orders lessons after their actual prerequisites and creates safe routes', () => {
    const catalog = lessonCatalog([
      lesson('a-dependent', ['z-foundation']),
      lesson('z-foundation'),
    ]);
    expect(catalog.map((item) => item.id)).toEqual([
      'z-foundation',
      'a-dependent',
    ]);
    expect(catalog[1]?.route).toBe('/materials/i1/a-dependent/');
    expect(lessonRoute(lesson('биты/байты?#'))).toBe(
      '/materials/i1/%D0%B1%D0%B8%D1%82%D1%8B%2F%D0%B1%D0%B0%D0%B9%D1%82%D1%8B%3F%23/',
    );
    expect(lessonCatalog([])).toEqual([]);
  });

  it.each([
    [lesson('a', ['missing'])],
    [lesson('a', ['b']), lesson('b', ['a'])],
    [lesson('a', ['a'])],
    [lesson('a'), lesson('a')],
    [lesson('..')],
    [lesson('x'.repeat(201))],
    [{ ...lesson('a'), section: 'other' }],
  ])(
    'rejects invalid lesson dependencies or identifiers: %j',
    (...metadata) => {
      expect(() => lessonCatalog(metadata)).toThrow(TypeError);
    },
  );

  it('reads and writes a sorted multi-number filter without losing unrelated query data', () => {
    expect(readMaterialFilter('?numbers=13,1,13')).toEqual({
      numbers: [1, 13],
      invalid: false,
    });
    expect(writeMaterialFilter('?source=study&numbers=3', [13, 1, 13])).toBe(
      '?source=study&numbers=1%2C13',
    );
    expect(writeMaterialFilter('?numbers=3', [])).toBe('');
    expect(readMaterialFilter('')).toEqual({ numbers: [], invalid: false });
    expect(matchesNumbers([4, 9], [9, 16])).toBe(true);
    expect(matchesNumbers([4, 9], [1])).toBe(false);
    expect(matchesNumbers([1], [])).toBe(true);
    expect(() => writeMaterialFilter('', [0])).toThrow(TypeError);
  });
  it.each([
    '?numbers=0',
    '?numbers=17',
    '?numbers=-1',
    '?numbers=1.5',
    '?numbers=',
    '?numbers=01',
    '?numbers=1&numbers=3',
    '?numbers=1,NaN',
    '?' + 'x'.repeat(8193),
  ])('handles a malformed URL without hiding the catalog: %s', (search) => {
    expect(readMaterialFilter(search)).toEqual({ numbers: [], invalid: true });
  });
});

describe('lesson progress', () => {
  it('persists manual completion, undoes it and does not duplicate an entry', () => {
    const storage = new MemoryStorage();
    const store = new LocalStore(() => storage);
    setLessonCompleted(store, 'bits', true);
    setLessonCompleted(store, 'bits', true);
    expect(
      lessonCompletion(
        ['bits', 'bits'],
        new LocalStore(() => storage).read('lessonProgress'),
      ),
    ).toEqual({ completed: 1, total: 1 });
    expect(store.read('lessonProgress').entries).toHaveLength(1);
    setLessonCompleted(store, 'bits', false);
    expect(lessonCompletion(['bits'], store.read('lessonProgress'))).toEqual({
      completed: 0,
      total: 1,
    });
  });

  it('refreshes changes from another tab and retains quiz results and game levels', () => {
    const storage = new MemoryStorage();
    const first = new LocalStore(() => storage);
    const second = new LocalStore(() => storage);
    first.write('lessonProgress', {
      version: 1,
      entries: [
        {
          lessonId: 'bits',
          completed: false,
          quizCorrect: 3,
          quizTotal: 5,
          levels: ['level-1'],
        },
        {
          lessonId: 'codes',
          completed: true,
          quizCorrect: 0,
          quizTotal: 0,
          levels: [],
        },
      ],
    });
    setLessonCompleted(second, 'bits', true);
    expect(
      second
        .read('lessonProgress')
        .entries.find((row) => row.lessonId === 'bits'),
    ).toEqual({
      lessonId: 'bits',
      completed: true,
      quizCorrect: 3,
      quizTotal: 5,
      levels: ['level-1'],
    });
    expect(
      lessonCompletion(['bits', 'codes'], second.read('lessonProgress')),
    ).toEqual({ completed: 2, total: 2 });
  });

  it('counts only available lessons, including after backup import', () => {
    const store = new LocalStore(() => new MemoryStorage());
    setLessonCompleted(store, 'absent-lesson', true);
    const backup = parseBackup(
      JSON.stringify({
        format: 'oge-informatics',
        version: 1,
        areas: store.snapshot(),
        aiCache: { version: 1, entries: [] },
      }),
    );
    expect(lessonCompletion(['bits'], backup.areas.lessonProgress)).toEqual({
      completed: 0,
      total: 1,
    });
    expect(lessonCompletion([], backup.areas.lessonProgress)).toEqual({
      completed: 0,
      total: 0,
    });
  });

  it('keeps completion usable in memory when browser storage is blocked', () => {
    const store = new LocalStore(() => {
      throw new DOMException('Blocked', 'SecurityError');
    });
    setLessonCompleted(store, 'bits', true);
    expect(store.memoryOnly).toBe(true);
    expect(
      lessonCompletion(['bits'], store.read('lessonProgress')).completed,
    ).toBe(1);
    expect(store.messages().length).toBeGreaterThan(0);
  });

  it('preserves a full imported area when adding another mark is rejected', () => {
    const store = new LocalStore(() => new MemoryStorage());
    store.write('lessonProgress', {
      version: 1,
      entries: Array.from({ length: 500 }, (_, index) => ({
        lessonId: 'import-' + String(index),
        completed: true,
        quizCorrect: 0,
        quizTotal: 0,
        levels: [],
      })),
    });
    expect(() => {
      setLessonCompleted(store, 'bits', true);
    }).toThrow();
    expect(store.read('lessonProgress').entries).toHaveLength(500);
  });

  it('keeps practice counters separate from lesson marks and manual practical assessments', () => {
    const stats = defaults().streamStats;
    stats.entries = [
      {
        taskNumber: 10,
        attempts: 3,
        correct: 2,
        self: { attempts: 0, credit: 0 },
        aiAccepted: { attempts: 0, credit: 0 },
        lastActivity: '2026-10-22T00:00:00.000Z',
      },
      {
        taskNumber: 13,
        attempts: 5,
        correct: 5,
        self: { attempts: 2, credit: 1 },
        aiAccepted: { attempts: 1, credit: 0.5 },
        lastActivity: '2026-10-22T00:00:00.000Z',
      },
    ];
    expect(sectionAttempts([10], stats)).toEqual({
      attempts: 3,
      correct: 2,
      self: 0,
      aiAccepted: 0,
    });
    expect(sectionAttempts([13], stats)).toEqual({
      attempts: 0,
      correct: 0,
      self: 2,
      aiAccepted: 1,
    });
    expect(
      lessonCompletion(['bits'], defaults().lessonProgress).completed,
    ).toBe(0);
  });
});
