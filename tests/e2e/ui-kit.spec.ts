import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4324/test-oge-app/dev/ui/');
  await expect(page.getByTestId('ui-gallery')).toHaveAttribute(
    'aria-busy',
    'false',
  );
});

test('Button: все варианты и размеры, disabled и loading блокируют действие', async ({
  page,
}) => {
  const section = page.getByRole('region', {
    name: 'Button — кнопки',
    exact: true,
  });
  let clicks = 0;
  for (const variant of ['Основная', 'Вторичная', 'Текстовая']) {
    for (const size of ['sm', 'md', 'lg']) {
      const button = section.getByRole('button', {
        name: `${variant} ${size}`,
        exact: true,
      });
      await button.click();
      clicks += 1;
      await expect(page.getByTestId('button-count')).toHaveText(String(clicks));
      const box = await button.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
  }
  for (let index = 1; index <= 3; index += 1) {
    await expect(
      section.getByRole('button', {
        name: `Недоступна ${String(index)}`,
        exact: true,
      }),
    ).toBeDisabled();
    await expect(
      section.getByRole('button', {
        name: `Загрузка ${String(index)}`,
        exact: false,
      }),
    ).toBeDisabled();
  }
  const action = section.getByRole('button', {
    name: 'Увеличить счётчик',
    exact: false,
  });
  await section.getByRole('button', { name: 'Режим загрузки' }).click();
  await expect(action).toBeDisabled();
  await expect(action).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByTestId('button-count')).toHaveText(String(clicks));
  await section.getByRole('button', { name: 'Режим загрузки' }).click();
  await action.focus();
  await action.press('Enter');
  await expect(page.getByTestId('button-count')).toHaveText(String(clicks + 1));
});

test('Card: содержимое и читаемые варианты поверхности в двух темах', async ({
  page,
}) => {
  const section = page.getByRole('region', {
    name: 'Card — карточки',
    exact: true,
  });
  await expect(
    section.getByRole('heading', { name: 'Основная карточка' }),
  ).toBeVisible();
  await expect(section.getByText('В одном байте восемь бит.')).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    const colors = await section
      .locator('.ui-card')
      .evaluateAll((cards) =>
        cards.map((card) => getComputedStyle(card).backgroundColor),
      );
    expect(new Set(colors).size).toBe(2);
    expect(
      (
        await new AxeBuilder({ page })
          .include('#cards-title + .ui-gallery-grid')
          .analyze()
      ).violations,
    ).toEqual([]);
  }
});

test('Tabs: стрелки, Home/End, отключённая вкладка и сохранение ввода', async ({
  page,
}) => {
  const list = page.getByRole('tablist', { name: 'Разбор перевода единиц' });
  const rule = list.getByRole('tab', { name: 'Правило' });
  const example = list.getByRole('tab', { name: 'Пример' });
  const calculation = list.getByRole('tab', { name: 'Вычисление' });
  await expect(
    list.getByRole('tab', { name: 'Недоступная вкладка' }),
  ).toBeDisabled();
  await rule.focus();
  await rule.press('ArrowRight');
  await expect(example).toBeFocused();
  await expect(example).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Пример' })).toHaveText(
    '2 байта = 16 бит.',
  );
  await example.press('End');
  await expect(calculation).toBeFocused();
  await page.getByLabel('Байты', { exact: true }).fill('7');
  await expect(
    page.getByRole('tabpanel', { name: 'Вычисление' }),
  ).toContainText('7 байт = 56 бит');
  await calculation.focus();
  await calculation.press('Home');
  await expect(rule).toBeFocused();
  await rule.press('ArrowLeft');
  await expect(calculation).toBeFocused();
  await expect(page.getByLabel('Байты', { exact: true })).toHaveValue('7');
  await calculation.press('Tab');
  await expect(
    page.getByRole('tabpanel', { name: 'Вычисление' }),
  ).toBeFocused();
});

test('Modal: фокус удерживается внутри, Esc и отмена возвращают его инициатору', async ({
  page,
}) => {
  const trigger = page.getByRole('button', { name: 'Настроить повторения' });
  await trigger.focus();
  await trigger.press('Enter');
  const modal = page.getByRole('dialog', { name: 'Настроить тренировку' });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('heading')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(modal.getByRole('button', { name: 'Отмена' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    modal.getByRole('button', { name: 'Закрыть окно' }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(modal.getByRole('button', { name: 'Отмена' })).toBeFocused();
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab');
    expect(
      await modal.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await modal.getByRole('spinbutton').fill('7');
  await modal.getByRole('button', { name: 'Отмена' }).click();
  await expect(page.getByTestId('applied-repeats')).toHaveText('3');
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  await modal.getByRole('spinbutton').fill('6');
  await modal.getByRole('button', { name: 'Применить' }).click();
  await expect(page.getByTestId('applied-repeats')).toHaveText('6');
  await expect(trigger).toBeFocused();
  // Safari does not necessarily focus a button when it is clicked.
  await page.getByRole('spinbutton', { name: 'Только чтение' }).focus();
  await trigger.evaluate((button) => {
    button.addEventListener(
      'mousedown',
      (event) => {
        event.preventDefault();
      },
      { once: true },
    );
  });
  await trigger.click();
  await modal.getByRole('button', { name: 'Закрыть окно' }).click();
  await expect(trigger).toBeFocused();
});

test('Tooltip: фокус, hover панели, касание и Esc', async ({ page }) => {
  const trigger = page.getByRole('button', { name: 'О подсказках' });
  const tooltip = page.getByRole('tooltip');
  await trigger.focus();
  await expect(tooltip).toContainText(
    'Подсказку можно открыть до проверки ответа.',
  );
  await expect(trigger).toHaveAccessibleDescription(/Подсказку можно открыть/);
  await trigger.press('Escape');
  await expect(tooltip).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(tooltip).toBeVisible();
  const box = await tooltip.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );
  await page.getByRole('button', { name: 'Информация', exact: true }).click();
  await expect(tooltip).not.toBeVisible();
  await trigger.hover();
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tooltip).not.toBeVisible();
});

test('Toast: сообщения озвучиваются, закрываются и возвращают фокус', async ({
  page,
}) => {
  const section = page.getByRole('region', {
    name: 'Toast — уведомление',
    exact: true,
  });
  for (const [label, role, text] of [
    ['Информация', 'status', 'Обычное уведомление'],
    ['Успех', 'status', 'Успешное уведомление'],
    ['Ошибка', 'alert', 'Сообщение об ошибке'],
  ] as const) {
    const trigger = section.getByRole('button', { name: label, exact: true });
    await trigger.click();
    await expect(section.getByRole(role)).toContainText(text);
    const dismiss = section.getByRole('button', {
      name: 'Закрыть уведомление',
    });
    await dismiss.focus();
    await dismiss.press('Enter');
    await expect(section.getByRole(role)).toBeEmpty();
    await expect(trigger).toBeFocused();
  }
});

test('Disclosure: открытое и закрытое состояния доступны с клавиатуры', async ({
  page,
}) => {
  const section = page.getByRole('region', {
    name: 'Disclosure — раскрывающийся блок',
  });
  const summary = section
    .locator('summary')
    .filter({ hasText: 'Как перевести биты в байты?' });
  const answer = section.getByText('Раздели количество бит на 8.', {
    exact: false,
  });
  await expect(answer).not.toBeVisible();
  await summary.focus();
  await summary.press('Enter');
  await expect(answer).toBeVisible();
  await summary.press('Space');
  await expect(answer).not.toBeVisible();
  const opened = section
    .locator('summary')
    .filter({ hasText: 'Открытый пример' });
  await expect(
    section.getByText('При обратном переводе', { exact: false }),
  ).toBeVisible();
  await opened.click();
  await expect(
    section.getByText('При обратном переводе', { exact: false }),
  ).not.toBeVisible();
});

test('Badge: смысл всех меток передан текстом', async ({ page }) => {
  const section = page.getByRole('region', { name: 'Badge — метки' });
  for (const text of ['Обычная', 'Акцент', 'Верно', 'Ошибка ответа'])
    await expect(section.getByText(text, { exact: true })).toBeVisible();
  await expect(section.getByRole('button')).toHaveCount(0);
  expect(
    (
      await new AxeBuilder({ page })
        .include('#badges-title + .ui-gallery-row')
        .analyze()
    ).violations,
  ).toEqual([]);
});

test('ProgressBar: пустой, частичный, полный и неопределённый прогресс', async ({
  page,
}) => {
  for (const [label, position] of [
    ['Пустая шкала', 0],
    ['Заполненная наполовину', 0.5],
    ['Полная шкала', 1],
    ['Неизвестный объём', -1],
  ] as const) {
    const progress = page.getByRole('progressbar', { name: label });
    await expect(progress).toBeVisible();
    expect(
      await progress.evaluate(
        (element: HTMLProgressElement) => element.position,
      ),
    ).toBe(position);
  }
});

test('Kbd: клавиши читаются как текст и не перехватывают Tab', async ({
  page,
}) => {
  const section = page.getByRole('region', { name: 'Kbd — клавиши' });
  await expect(section.locator('kbd')).toHaveText([
    'Tab',
    'Shift',
    'Tab',
    'Enter',
    'Esc',
  ]);
  expect(
    await section
      .locator('kbd')
      .evaluateAll((keys) => keys.every((key) => key.tabIndex === -1)),
  ).toBe(true);
});

test('Skeleton: доступное название загрузки и декоративные линии', async ({
  page,
}) => {
  const section = page.getByRole('region', {
    name: 'Skeleton — состояние загрузки',
  });
  const states = section.getByRole('status');
  await expect(states).toHaveText([
    'Загрузка одной строки',
    'Загрузка двух строк',
    'Загрузка материала',
  ]);
  for (const state of await states.all())
    await expect(state).toHaveAttribute('aria-busy', 'true');
  await expect(section.locator('[aria-hidden="true"]')).toHaveCount(3);
});

test('SegmentedControl: стрелки пропускают отключённый вариант', async ({
  page,
}) => {
  const group = page.getByRole('group', { name: 'Режим занятия', exact: true });
  const theory = group.getByRole('radio', { name: 'Теория' });
  const practice = group.getByRole('radio', { name: 'Практика' });
  await expect(theory).toBeChecked();
  await expect(group.getByRole('radio', { name: 'Смешанный' })).toBeDisabled();
  await theory.focus();
  await theory.press('ArrowRight');
  await expect(practice).toBeChecked();
  await expect(practice).toBeFocused();
  await expect(page.getByTestId('selected-mode')).toHaveText('Практика');
  await practice.press('ArrowRight');
  await expect(theory).toBeChecked();
  const disabled = page.getByRole('group', {
    name: 'Недоступный режим',
    exact: true,
  });
  for (const radio of await disabled.getByRole('radio').all())
    await expect(radio).toBeDisabled();
});

test('Slider: клавиатурный шаг, границы и доступное значение', async ({
  page,
}) => {
  const slider = page.getByRole('slider', { name: 'Доля практики' });
  await slider.focus();
  await slider.press('Home');
  await expect(slider).toHaveValue('0');
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('5');
  await expect(slider).toHaveAttribute('aria-valuetext', '5%');
  const progress = page.getByRole('progressbar', { name: 'Выбранная доля' });
  expect(
    await progress.evaluate((element: HTMLProgressElement) => element.value),
  ).toBe(5);
  await slider.press('End');
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('100');
  await expect(
    page.getByRole('slider', { name: 'Недоступный ползунок' }),
  ).toBeDisabled();
});

test('NumberInput: обязательность, диапазон, дроби, readOnly и disabled', async ({
  page,
}) => {
  const field = page.getByRole('spinbutton', {
    name: 'Число задач',
    exact: false,
  });
  const submit = page.getByRole('button', {
    name: 'Проверить число',
    exact: true,
  });
  for (const invalid of ['', '0', '11', '1.5']) {
    await field.fill(invalid);
    await submit.click();
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAccessibleDescription(
      /Введи целое число от 1 до 10/,
    );
  }
  await field.fill('3');
  await field.press('ArrowUp');
  await expect(field).toHaveValue('4');
  await field.press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'Принято: 4.' }),
  ).toBeVisible();
  const decimal = page.getByRole('spinbutton', { name: 'Дробное значение' });
  await decimal.focus();
  await decimal.press('ArrowUp');
  await expect(decimal).toHaveValue('3');
  await expect(
    page.getByRole('spinbutton', { name: 'Недоступное поле' }),
  ).toBeDisabled();
  const readOnly = page.getByRole('spinbutton', { name: 'Только чтение' });
  await expect(readOnly).not.toBeEditable();
  await readOnly.focus();
  await readOnly.press('ArrowUp');
  await expect(readOnly).toHaveValue('16');
});

test('открытые состояния проходят axe в обеих темах', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Тема', { exact: true }).selectOption(theme);
    await page.getByRole('button', { name: 'Ошибка', exact: true }).click();
    await page.getByRole('button', { name: 'О подсказках' }).focus();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Настроить повторения' }).click();
    const modal = page.getByRole('dialog');
    await modal.getByRole('spinbutton').fill('0');
    await modal.getByRole('button', { name: 'Применить' }).click();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
  }
});

test('UI-кит при 200% тексте и reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(360);
  expect(
    await page
      .locator('.ui-spinner')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none');
  await page.getByRole('button', { name: 'Настроить повторения' }).click();
  const modal = page.getByRole('dialog');
  expect(
    await modal.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await modal.getByRole('button', { name: 'Отмена' }).click();
  await expect(modal).not.toBeVisible();
});
