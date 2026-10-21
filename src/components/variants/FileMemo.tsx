import { fileMemo } from '../../core/variants/file-memo';

export default function FileMemo() {
  return (
    <section className="file-memo" aria-label="Памятка о файлах">
      <h3>Как работать с файлами</h3>
      <p>{fileMemo.introduction}</p>
      <ol>
        {fileMemo.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div
        className="file-formats-scroll"
        role="region"
        aria-label="Форматы исходников и результатов"
        tabIndex={0}
      >
        <table>
          <caption>Исходники и результаты работ</caption>
          <thead>
            <tr>
              <th scope="col">Задание</th>
              <th scope="col">Что открыть</th>
              <th scope="col">Что сохранить</th>
            </tr>
          </thead>
          <tbody>
            {fileMemo.formats.map((row) => (
              <tr key={row.task}>
                <th scope="row">{row.task}</th>
                <td>{row.input}</td>
                <td>{row.output}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>{fileMemo.limits}</p>
      <p>{fileMemo.integrity}</p>
    </section>
  );
}
