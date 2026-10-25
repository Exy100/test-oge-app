import { useStoredAreas } from '../useStoredAreas';

export default function GameLevels({
  id,
  gameId,
  lessonId,
  levels,
  selected,
  onSelect,
}: {
  id: string;
  gameId: string;
  lessonId: string;
  levels: readonly { id: string; title: string }[];
  selected: number;
  onSelect: (index: number) => void;
}) {
  const { lessonProgress } = useStoredAreas();
  const completed =
    lessonProgress.entries.find((row) => row.lessonId === lessonId)?.levels ??
    [];
  return (
    <>
      <label htmlFor={`${id}-level`}>Уровень игры</label>
      <select
        id={`${id}-level`}
        value={selected}
        onChange={(event) => {
          onSelect(Number(event.target.value));
        }}
      >
        {levels.map((level, index) => (
          <option key={level.id} value={index}>
            {index + 1}. {level.title}
            {completed.includes(`${gameId}:${level.id}`) ? ' — пройден' : ''}
          </option>
        ))}
      </select>
      <p role="status">
        Пройдено уровней:{' '}
        {
          levels.filter((level) => completed.includes(`${gameId}:${level.id}`))
            .length
        }{' '}
        из {levels.length}. Прогресс хранится в этом браузере.
      </p>
    </>
  );
}
