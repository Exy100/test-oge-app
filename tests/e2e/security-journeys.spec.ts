import { test as base, expect } from '../fixtures/security-browser';
import {
  buildFixedVariant,
  buildVariant,
  variantSeed,
} from '../../src/core/variants';
import { createExamDraft } from '../../src/core/variants/exam';
import { areaSchemas, PREFIX } from '../../src/core/storage/schemas';

const test = base.extend({
  launchOptions: async ({ browserName, launchOptions }, use) => {
    await use(
      browserName === 'chromium'
        ? {
            ...launchOptions,
            args: [
              ...(launchOptions.args ?? []),
              '--use-angle=swiftshader',
              '--enable-unsafe-swiftshader',
            ],
          }
        : launchOptions,
    );
  },
});

for (const source of ['fixed', 'random']) {
  test(`${source}: full saved result, all reviews and print stay local and respect CSP`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const variant =
      source === 'fixed'
        ? buildFixedVariant('V01', 'document')
        : buildVariant('security-result', 'document');
    const text =
      '<img src="https://security-probe.invalid/student" onerror="globalThis.studentAttack=1">';
    const attempt = {
      ...createExamDraft(
        {
          id: 'security-result',
          variantId: variant.id,
          seed: variantSeed(variant),
          variant13: 'document',
        },
        Date.parse('2026-10-26T10:00:00Z'),
      ),
      finishedAt: '2026-10-26T10:01:00Z',
      elapsedMs: 60000,
      score: null,
      answers: variant.tasks.map((task) => ({
        taskNumber: task.taskNumber,
        text:
          task.taskNumber === 16
            ? text
            : task.answer.type === 'artifact'
              ? 'Моя работа'
              : task.answer.value,
        reasoning: text,
      })),
    };
    const data = areaSchemas.variantAttempts.parse({
      version: 1,
      entries: [attempt],
    });
    await page.addInitScript(
      ({ key, data }) => {
        localStorage.setItem(key, JSON.stringify(data));
      },
      { key: PREFIX + 'variantAttempts', data },
    );
    const workers: string[] = [];
    page.on('worker', (worker) => workers.push(worker.url()));
    await page.goto(
      `variants/${source === 'fixed' ? 'V01' : 'random'}/result/?attempt=security-result`,
    );
    for (let number = 1; number <= 16; number++) {
      const review = page.locator(`#result-task-${String(number)}`);
      await review.locator('summary').click();
      await expect(review.locator('.exam-saved-answer')).toBeVisible();
      await expect(review).toContainText(text);
    }
    expect(workers.some((url) => /result\.worker-/u.test(url))).toBe(true);
    await page
      .getByRole('button', {
        name: 'Подготовить результат к печати',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('button', { name: 'Печатать результат', exact: true }),
    ).toBeEnabled();
    await expect(
      page.locator('img[src*="security-probe.invalid"]'),
    ).toHaveCount(0);
    expect(
      await page.evaluate((): unknown =>
        Reflect.get(globalThis, 'studentAttack'),
      ),
    ).toBeUndefined();
  });
}

const games = [
  { id: 'bit-warehouse', route: 'materials/i1/bits-bytes/' },
  { id: 'packet-route', route: 'materials/i7/restore-address/' },
  { id: 'robot-maze', route: 'materials/i13/robot-loops/' },
  { id: 'sorting-center', route: 'materials/i12/sheet-selection/' },
  { id: 'logic-gates', route: 'materials/i3/logic-operations/' },
];
for (const game of games) {
  test(`${game.id}: lazy 3D scene and theme respect CSP and make no third-party requests`, async ({
    page,
    browserName,
  }) => {
    await page.goto(game.route);
    const scene = page.locator('#' + game.id);
    await scene.scrollIntoViewIfNeeded();
    await scene.getByLabel('Объёмная игра', { exact: true }).check();
    if (browserName === 'chromium')
      await expect(
        scene.locator('canvas[data-three-ready="true"]'),
      ).toBeVisible();
    else await expect(scene.locator('[data-three-mode]')).toBeVisible();
    await scene.getByLabel('Уровень игры').selectOption('1');
    await page.getByLabel('Тема', { exact: true }).selectOption('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await scene.getByLabel('Объёмная игра', { exact: true }).uncheck();
    await expect(scene.locator('canvas')).toHaveCount(0);
  });
}
