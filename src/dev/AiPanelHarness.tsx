import { useState } from 'react';
import AiPanel from '../components/ai/AiPanel';
import { createApiFeedbackProvider } from '../lib/ai/api-provider';
import { useHydrated } from '../components/useHydrated';

const api = { load: () => Promise.resolve(createApiFeedbackProvider()) };
/** Only Astro dev imports this harness. E2e routes the real client to a private SSE server. */
export default function AiPanelHarness() {
  const ready = useHydrated();
  const [reasoning, setReasoning] = useState('Мой черновик');
  return (
    <fieldset
      className="ai-client-harness"
      disabled={!ready}
      aria-busy={!ready}
    >
      <legend>Клиентский разбор</legend>
      <label>
        Черновик для проверки
        <input
          value={reasoning}
          onChange={(event) => {
            setReasoning(event.target.value);
          }}
        />
      </label>
      <h2>Проверенный краткий ответ</h2>
      <AiPanel
        taskNumber={10}
        request={{
          generatorId: 'numeral-sum-v2',
          seed: 'ai-client',
          answer: '1',
          reasoning,
        }}
        api={api}
      />
    </fieldset>
  );
}
