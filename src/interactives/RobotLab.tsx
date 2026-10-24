import { useState } from 'react';
import RobotPractice from '../components/tasks/RobotPractice';
import { isRobotKind, type RobotKind } from '../core/generators/15/fields';
import type { InteractiveProps } from '../lib/interactives/module';

const families: readonly [RobotKind, string][] = [
  ['robot-corridor', 'Подготовка: коридор'],
  ['robot-wall-gaps', 'Подготовка: стена с проходами'],
  ['robot-comb', 'Подготовка: гребёнка'],
  ['robot-room', 'Подготовка: комната'],
  ['robot-corner-right', 'Формат 2025: две стены справа'],
  ['robot-corner-left', 'Формат 2026: две стены слева'],
  ['robot-stairs', 'Проект 2027: лестница'],
];
export default function RobotLab({
  id,
  parameters,
  active,
  reducedMotion,
}: InteractiveProps) {
  const initial = parameters.family ?? 'robot-corridor';
  if (typeof initial !== 'string' || !isRobotKind(initial))
    throw new RangeError('Неизвестное семейство Робота.');
  const [family, setFamily] = useState<RobotKind>(initial);
  return (
    <div className="information-lab">
      <label htmlFor={`${id}-family`}>Семейство полей</label>
      <select
        id={`${id}-family`}
        value={family}
        onChange={(event) => {
          const next = event.target.value;
          if (isRobotKind(next)) setFamily(next);
        }}
      >
        {families.map(([value, title]) => (
          <option key={value} value={value}>
            {title}
          </option>
        ))}
      </select>
      <p>
        Составь программу, проверь датчики и граничные поля. При смене семейства
        редактор и выполнение начинают заново. Код сохраняется кнопкой
        скачивания; после перезагрузки страницы редактор сбрасывается.
      </p>
      <RobotPractice
        key={family}
        kind={family}
        seed="lesson-robot-family"
        active={active}
        reducedMotion={reducedMotion}
        lesson
        initialCode="закрасить"
      />
    </div>
  );
}
