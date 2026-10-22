import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'astro/loaders';
import config from '../../coverage.config.ts';
import { filesIn, formatDiagnostic } from './files.mjs';
import { readLesson } from './lessons.mjs';

/** Validate source even when Astro already has a cached entry with the same digest. */
export function lessonLoader() {
  const source = config.sources.lessons;
  const loader = glob({
    base: source,
    pattern: '**/*.mdx',
    generateId: ({ data }) => data.id,
    deferRender: true,
  });
  return {
    name: 'oge-lessons',
    async load(context) {
      const root = fileURLToPath(context.config.root);
      async function validate(file) {
        const result = readLesson(
          file,
          await readFile(resolve(root, file), 'utf8'),
          config.lessons,
        );
        for (const reference of result.references ?? [])
          if (reference.fallback)
            result.findings.push({
              ...reference,
              rule: 'lesson',
              message:
                'С фазы 7 InteractiveFallback запрещён: нужен работающий интерактив.',
            });
        if (result.findings.length)
          throw new Error(result.findings.map(formatDiagnostic).join('\n'));
        return { ...result.data, file };
      }
      const lessons = [];
      const ids = new Set();
      for (const file of (await filesIn(root, source)).filter((file) =>
        file.endsWith('.mdx'),
      )) {
        const lesson = await validate(file);
        if (ids.has(lesson.id))
          throw new Error(
            `${file}:1: lesson: Повтор идентификатора ${lesson.id}.`,
          );
        ids.add(lesson.id);
        lessons.push(lesson);
      }
      for (const lesson of lessons)
        for (const id of lesson.prerequisites)
          if (!ids.has(id) || id === lesson.id)
            throw new Error(
              `${lesson.file}:1: lesson: Неизвестный или собственный пререквизит ${id}.`,
            );

      await loader.load({
        ...context,
        async parseData(entry) {
          // glob also uses this hook for file edits in the development server.
          await validate(relative(root, entry.filePath));
          return context.parseData(entry);
        },
      });
    },
  };
}
