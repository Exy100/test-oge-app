import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { launch } from 'puppeteer-core';
import { generateReport, startFlow } from 'lighthouse';
import { createServer } from 'vite';
import {
  assertInteractionBudget,
  assertResultNavigation,
  scenariosForShard,
} from './performance-scenarios.mjs';

const scenarios = scenariosForShard(process.env.OGE_LH_SHARD);
const origin = 'http://127.0.0.1:4325';
const base = origin + '/test-oge-app/';
const output = '.lighthouseci/reports/interactions';
const runs = [];
const vitals = await readFile(
  createRequire(import.meta.url)
    .resolve('web-vitals')
    .replace(/web-vitals\.(?:umd\.cjs|js)$/u, 'web-vitals.iife.js'),
  'utf8',
);
const measure =
  vitals +
  `
globalThis.__trustedInputs = 0;
for (const type of ['click', 'keydown']) addEventListener(type, (event) => {
  if (event.isTrusted) globalThis.__trustedInputs++;
}, { capture: true });
webVitals.onINP((metric) => {
  globalThis.__inp = {
    value: metric.value,
    entries: metric.entries.map((entry) => ({ name: entry.name, duration: entry.duration, interactionId: entry.interactionId })),
  };
}, { reportAllChanges: true, durationThreshold: 16 });
`;
let browser;
let fixtures;
const preview = spawn(
  process.execPath,
  [
    'node_modules/astro/bin/astro.mjs',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4325',
    '--ignore-lock',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverOutput = '';
preview.stdout.on('data', (chunk) => {
  serverOutput += chunk;
});
preview.stderr.on('data', (chunk) => {
  serverOutput += chunk;
});

async function ready() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (preview.exitCode !== null)
      throw new Error(`Preview остановлен: ${serverOutput}`);
    try {
      if (serverOutput.includes(base) && (await fetch(base)).ok) return;
    } catch {
      /* The owned preview is still starting. */
    }
    await delay(100);
  }
  throw new Error(`Preview не запустился: ${serverOutput}`);
}

async function measuredInp(page, context) {
  const background = await context.newPage();
  await background.bringToFront();
  await page.waitForFunction(() => document.visibilityState === 'hidden');
  await page.waitForFunction(() => globalThis.__inp?.entries.length > 0);
  return page.evaluate(() => ({
    ...globalThis.__inp,
    trustedInputs: globalThis.__trustedInputs,
  }));
}

async function verifySlowInteraction(browser) {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.evaluateOnNewDocument(measure);
    await page.goto(base + 'about/');
    await page.evaluate(() => {
      const probe = document.createElement('button');
      probe.id = 'inp-negative-probe';
      probe.textContent = 'INP probe';
      probe.onclick = () => {
        const end = performance.now() + 260;
        while (performance.now() < end) {
          /* Deliberately slow control proves the gate detects a regression. */
        }
      };
      document.body.prepend(probe);
    });
    await page.click('#inp-negative-probe');
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const metric = await measuredInp(page, context);
    if (
      !Number.isFinite(metric.value) ||
      metric.value <= 200 ||
      !(metric.trustedInputs > 0)
    )
      throw new Error('INP probe не обнаружил задержку 260 мс.');
    let rejected = false;
    try {
      assertInteractionBudget(metric);
    } catch (error) {
      if (!error.message.includes('> 200')) throw error;
      rejected = true;
    }
    if (!rejected) throw new Error('INP gate принял заведомо медленный ввод.');
    await writeFile(
      output + '/slow-input-probe.json',
      JSON.stringify(metric, null, 2) + '\n',
    );
  } finally {
    await context.close();
  }
}

async function resultFixtures() {
  const vite = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const { buildFixedVariant, buildVariant, variantSeed } =
      await vite.ssrLoadModule('/src/core/variants/index.ts');
    const { createExamDraft } = await vite.ssrLoadModule(
      '/src/core/variants/exam.ts',
    );
    const { PREFIX, areaSchemas } = await vite.ssrLoadModule(
      '/src/core/storage/schemas.ts',
    );
    const variants = [
      buildFixedVariant('V01', 'document'),
      buildVariant('lighthouse-variant', 'document'),
    ];
    const entries = variants.map((variant, index) => ({
      ...createExamDraft(
        {
          id: `lighthouse-${String(index)}`,
          variantId: variant.id,
          seed: variantSeed(variant),
          variant13: 'document',
        },
        Date.parse('2026-10-26T10:00:00Z'),
      ),
      finishedAt: '2026-10-26T10:01:00Z',
      elapsedMs: 60_000,
      score: null,
      answers: variant.tasks.map((task) => ({
        taskNumber: task.taskNumber,
        text:
          task.answer.type === 'artifact' ? 'Моя работа' : task.answer.value,
        reasoning: 'Сохранённый черновик',
      })),
    }));
    return {
      key: PREFIX + 'variantAttempts',
      data: areaSchemas.variantAttempts.parse({ version: 1, entries }),
    };
  } finally {
    await vite.close();
  }
}

async function click(page, selector) {
  await page.waitForSelector(selector, { visible: true });
  await page.click(selector);
}
async function button(page, name) {
  await click(page, `::-p-aria(${name}[role="button"])`);
}
async function answer(page) {
  const selector = '::-p-aria(Твой ответ[role="textbox"])';
  await page.waitForSelector(selector, { visible: true });
  await click(page, selector);
  await page.keyboard.type('123');
  await button(page, 'Проверить ответ');
  await page.waitForSelector('[role="status"]', { visible: true });
}
async function act(page, action) {
  switch (action) {
    case 'answer':
      await answer(page);
      break;
    case 'filter':
      await click(page, '[data-material-number][value="1"]:not(:disabled)');
      await page.waitForFunction(
        () =>
          document.querySelectorAll('.materials-topic:not([hidden])').length ===
          1,
      );
      break;
    case 'lesson':
      await page.$eval('.lesson-interactive', (element) =>
        element.scrollIntoView(),
      );
      await page.waitForSelector(
        '.interactive-host > .interactive-toolbar button:not(:disabled)',
      );
      await click(
        page,
        '.interactive-host > .interactive-toolbar button:not(:disabled)',
      );
      break;
    case 'three':
      await page.$eval('#bit-warehouse', (element) => element.scrollIntoView());
      await click(
        page,
        '#bit-warehouse ::-p-aria(Объёмная игра[role="checkbox"])',
      );
      await page.waitForSelector('#bit-warehouse canvas', { visible: true });
      await click(
        page,
        '#bit-warehouse ::-p-aria(Всего бит в выбранном грузе[role="textbox"])',
      );
      await page.keyboard.type('352');
      break;
    case 'setup':
      await button(page, 'Пройти с таймером');
      await page.waitForSelector('::-p-aria(13.2 — Документ[role="radio"])');
      await click(page, '::-p-aria(13.2 — Документ[role="radio"])');
      break;
    case 'exam':
    case 'training':
      await click(page, '::-p-aria(13.2 — Документ[role="radio"])');
      await button(
        page,
        action === 'exam' ? 'Начать экзамен' : 'Начать тренировку',
      );
      await page.waitForSelector('::-p-aria(Твой ответ[role="textbox"])');
      await click(page, '::-p-aria(Твой ответ[role="textbox"])');
      await page.keyboard.type('123');
      await click(page, 'nav button[aria-label^="Задание №2,"]');
      await page.waitForFunction(() =>
        document.querySelector('#exam-task-title')?.textContent.includes('№2'),
      );
      break;
    case 'print':
      await button(page, 'Подготовить условия для печати');
      await page.waitForSelector('.variant-print-task');
      break;
    case 'result':
      await click(page, '#result-task-1 summary');
      await page.waitForSelector(
        '#result-task-1 .variant-task-body .rich-text',
      );
      break;
    case 'settings':
      await click(page, '#settings-font');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        () => document.documentElement.dataset.fontSize === '200',
      );
      break;
    case 'theme':
      await click(page, '#theme-select');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.waitForFunction(
        () => document.documentElement.dataset.theme === 'dark',
      );
      break;
    default:
      throw new Error(`Неизвестный сценарий ${action}.`);
  }
  // Let the last trusted input reach its next painted frame before stopping trace.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}

try {
  await mkdir(output, { recursive: true });
  await ready();
  browser = await launch({
    executablePath: process.env.CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  await verifySlowInteraction(browser);
  for (const scenario of scenarios) {
    for (let run = 1; run <= 3; run++) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      if (scenario.action !== 'result')
        await page.evaluateOnNewDocument(measure);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewport({
        width: 412,
        height: 823,
        deviceScaleFactor: 1.75,
        isMobile: true,
        hasTouch: true,
      });
      const flow = await startFlow(page, {
        name: `${scenario.id} — ${String(run)}/3`,
        flags: { formFactor: 'mobile', logLevel: 'error' },
      });
      const row = { id: scenario.id, run, path: scenario.path };
      let tracing = false;
      try {
        let url = base + scenario.path;
        if (scenario.action === 'result') {
          fixtures ??= await resultFixtures();
          await page.evaluateOnNewDocument(
            ({ key, data }) => localStorage.setItem(key, JSON.stringify(data)),
            fixtures,
          );
          const index = scenario.id === 'result-fixed' ? 0 : 1;
          url += `?attempt=lighthouse-${String(index)}`;
          // Fresh context and default storage reset keep this a cold navigation.
          await flow.navigate(url, {
            stepName: 'Сохранённый результат: холодная загрузка',
          });
          await page.waitForSelector('.result-screen #result-task-1 summary');
          const navigation = (await flow.createFlowResult()).steps[0].lhr;
          assertResultNavigation(navigation);
          await page.evaluate(measure);
        } else {
          const response = await page.goto(url, { waitUntil: 'networkidle0' });
          if (response.status() !== (scenario.status ?? 200))
            throw new Error(`HTTP ${String(response.status())}: ${url}`);
        }
        await flow.startTimespan({
          stepName: 'Ввод и следующий кадр',
          throttlingMethod: 'devtools',
        });
        tracing = true;
        await act(page, scenario.action);
        if (errors.length) throw new Error(errors.join('\n'));
        await flow.endTimespan();
        tracing = false;
        row.metric = await measuredInp(page, context);
        row.inpMs = assertInteractionBudget(row.metric);
        console.log(
          `${scenario.id} ${String(run)}/3: INP ${String(row.inpMs)} ms`,
        );
      } catch (error) {
        row.error = error.message;
        process.exitCode = 1;
        console.error(`${scenario.id} ${String(run)}/3: ${error.message}`);
      } finally {
        if (tracing) await flow.endTimespan();
        const name = `${output}/${scenario.id}-${String(run)}`;
        runs.push(row);
        await writeFile(
          output + '/summary.json',
          JSON.stringify(runs, null, 2) + '\n',
        );
        if (flow.createArtifactsJson().gatherSteps.length) {
          const lighthouse = await flow.createFlowResult();
          await writeFile(
            name + '.json',
            JSON.stringify({ measurement: row, lighthouse }, null, 2) + '\n',
          );
          await writeFile(name + '.html', generateReport(lighthouse));
        }
        await context.close();
      }
    }
  }
} finally {
  await browser?.close();
  preview.kill('SIGTERM');
}
