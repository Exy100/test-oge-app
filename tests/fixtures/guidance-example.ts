import { taskExample } from './model-examples';
import type { TaskInstance } from '../../src/core/types';

/** Development-only contract: formatting and hostile strings, never a stream source. */
export function guidanceExample(): TaskInstance {
  return {
    ...taskExample(),
    id: 'guidance-contract',
    generatorId: 'guidance-contract',
    hints: [
      'Вспомни **единицы информации**.',
      'В одном байте $8$ бит.',
      'Умножь число байт на число бит в байте.',
    ],
    solution: [
      {
        text: 'Сопоставим единицы.\n\n| Единица | Биты |\n| --- | --- |\n| Байт | 8 |',
      },
      { text: 'Запишем вычисление.', formula: '8 \\times 8 = 64' },
      {
        text: '<img src=x onerror="globalThis.guidanceAttack=1"> Ответ — **64 бита**.',
        code: 'print(8 * 8)\n# ```` и <script>globalThis.guidanceAttack=1</script>\n',
      },
    ],
    commonMistakes: [
      {
        answer: '8',
        explanation:
          'Переведи байты в биты: умножь на восемь. <img src=x onerror="globalThis.guidanceAttack=1">',
      },
    ],
  };
}
