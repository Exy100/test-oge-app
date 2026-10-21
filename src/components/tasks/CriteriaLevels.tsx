import { useId } from 'react';
import type { Score, TaskInstance } from '../../core/types';

/** Shared rubric: read-only during an exam, selectable during practice. */
export default function CriteriaLevels({
  criteria,
  selection,
}: {
  criteria: NonNullable<TaskInstance['criteria']>;
  selection?: {
    value: Score | null;
    onChange: (score: Score) => void;
    disabled: boolean;
  };
}) {
  const id = useId();
  const Row = selection ? 'label' : 'p';
  return (
    <fieldset disabled={selection?.disabled}>
      <legend>
        {selection ? 'Балл по критериям' : 'Учебные критерии работы'}
      </legend>
      {criteria.levels.map((level) => (
        <Row className="criterion" key={level.score}>
          {selection && (
            <input
              type="radio"
              name={`${id}-score`}
              checked={selection.value === level.score}
              onChange={() => {
                selection.onChange(level.score);
              }}
            />
          )}
          <span>
            <strong>{level.score} балл(а).</strong> {level.description}
          </span>
        </Row>
      ))}
    </fieldset>
  );
}
