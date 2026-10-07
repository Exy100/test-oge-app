import { expect, test } from '@playwright/test';
import { Rng } from '../../src/core/rng';
import { rngProbe } from '../fixtures/rng-probe';
import { rngRuntimeSource, runtimeSeeds } from '../fixtures/rng-source';

test('RNG matches Node in the browser engine', async ({ page }) => {
  await page.setContent('<main id="result"></main>');
  await page.addScriptTag({
    type: 'module',
    content: `${rngRuntimeSource()}
    document.querySelector('#result').textContent = JSON.stringify(
      ${JSON.stringify(runtimeSeeds)}.map(seed => rngProbe(new Rng(seed)))
    );`,
  });
  await expect(page.locator('#result')).toHaveText(
    JSON.stringify(runtimeSeeds.map((seed) => rngProbe(new Rng(seed)))),
  );
});
