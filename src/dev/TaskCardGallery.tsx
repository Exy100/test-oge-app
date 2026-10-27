import { useState } from 'react';
import { useHydrated } from '../components/useHydrated';
import { streamSources, resolveStreamTask } from '../core/stream/catalog';
import TaskCard from '../components/tasks/TaskCard';
import { renderRichText } from '../core/rich-text/render';
import type { StreamOutcome } from '../core/stream';
import {
  shortFixtures,
  answerFormat,
} from '../../tests/fixtures/exam/short-answers';
import { taskExample } from '../../tests/fixtures/model-examples';
import type { TaskInstance } from '../core/types';
import { guidanceExample } from '../../tests/fixtures/guidance-example';
import { learningPythonGenerators } from '../core/generators/16/programs';

const sources = streamSources();
export default function TaskCardGallery() {
  const [id, setId] = useState(sources[0]?.generatorId ?? '');
  const [seed, setSeed] = useState('card-test');
  const ready = useHydrated();
  const [outcomes, setOutcomes] = useState<StreamOutcome[]>([]);
  const [revision, setRevision] = useState(0);
  const source = sources.find((item) => item.generatorId === id);
  const learning = learningPythonGenerators.find((item) => item.id === id);
  const fixture = shortFixtures.find((item) => `fixture:${item.id}` === id);
  if (!source && !fixture && !learning && id !== 'guidance-contract')
    throw new Error('Нет источника для карточки.');
  const task: TaskInstance =
    id === 'guidance-contract'
      ? guidanceExample()
      : fixture
        ? {
            ...taskExample(fixture.taskNumber),
            id,
            generatorId: id,
            seed: fixture.id,
            statement: `Проверка записи ответа ${fixture.id} на бланке. Условие экзамена в приложение не копируется.`,
            answer: answerFormat(fixture),
          }
        : learning
          ? learning.generate(seed)
          : resolveStreamTask({
              generatorId: id,
              seed: source?.kind === 'curated' ? (source.seeds[0] ?? '') : seed,
              taskNumber: source?.taskNumber ?? 1,
            });
  return (
    <div className="stream">
      <label>
        Источник задания
        <select
          disabled={!ready}
          value={id}
          onChange={(event) => {
            setId(event.target.value);
            setOutcomes([]);
            setRevision((value) => value + 1);
          }}
        >
          {sources.map((item) => (
            <option key={item.generatorId} value={item.generatorId}>
              {item.generatorId}
            </option>
          ))}
          <optgroup label="Учебные упражнения №16">
            {learningPythonGenerators.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id}
              </option>
            ))}
          </optgroup>
          <option value="guidance-contract">
            Контракт помощи: текст, код и формулы
          </option>
          {shortFixtures.map((item) => (
            <option key={item.id} value={`fixture:${item.id}`}>
              {item.id} — запись ответа
            </option>
          ))}
        </select>
      </label>
      <label>
        Seed
        <input
          value={seed}
          maxLength={200}
          onChange={(event) => {
            setSeed(event.target.value);
            setOutcomes([]);
            setRevision((value) => value + 1);
          }}
        />
      </label>
      <TaskCard
        key={revision}
        task={task}
        statementHtml={renderRichText(task.statement)}
        onResult={(result) => {
          setOutcomes((items) => [...items, result]);
        }}
      />
      <output aria-label="События карточки">{JSON.stringify(outcomes)}</output>
    </div>
  );
}
