import { folders } from '../../lib/interactives/training-files';
export default function TrainingFileControls({
  id,
  folder,
  onFolder,
  recursive,
  onRecursive,
}: {
  id: string;
  folder: string;
  onFolder: (folder: string) => void;
  recursive?: boolean;
  onRecursive?: (recursive: boolean) => void;
}) {
  return (
    <>
      <p>
        <a
          href={`${import.meta.env.BASE_URL}materials/files/training.zip`}
          download
        >
          Скачать учебные файлы (ZIP, CC0)
        </a>
        . Это небольшой учебный набор, а не полный корпус экзаменационного
        примера.
      </p>
      <label htmlFor={`${id}-folder`}>Каталог поиска</label>
      <select
        id={`${id}-folder`}
        value={folder}
        onChange={(event) => {
          onFolder(event.target.value);
        }}
      >
        {folders.map((path) => (
          <option key={path} value={path}>
            {path || 'Корень набора'}
          </option>
        ))}
      </select>
      {onRecursive && (
        <label>
          <input
            type="checkbox"
            checked={recursive}
            onChange={(event) => {
              onRecursive(event.target.checked);
            }}
          />{' '}
          Учитывать вложенные папки
        </label>
      )}
    </>
  );
}
