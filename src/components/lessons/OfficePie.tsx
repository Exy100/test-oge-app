export default function OfficePie({
  id,
  values,
  legend,
  labels,
}: {
  id: string;
  values: readonly number[];
  legend: boolean;
  labels: boolean;
}) {
  const total = values.reduce((a, b) => a + b, 0);
  let angle = -Math.PI / 2;
  return (
    <figure>
      <svg role="img" viewBox="0 0 360 300" aria-labelledby={`${id}-title`}>
        <title id={`${id}-title`}>
          Соотношение участников 7, 8 и 9 классов; численности перечислены в
          таблице
        </title>
        <defs>
          <pattern
            id={`${id}-stripe`}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <rect width="8" height="8" fill="var(--surface)" />
            <path d="M0 0L8 8" stroke="currentColor" />
          </pattern>
        </defs>
        {total === 0 ? (
          <text x="24" y="150" fill="currentColor">
            Нет данных для круговой диаграммы
          </text>
        ) : (
          values.map((value, index) => {
            const start = angle,
              portion = value / total;
            angle += portion * Math.PI * 2;
            const end = angle,
              mid = (start + end) / 2,
              x1 = 180 + 100 * Math.cos(start),
              y1 = 130 + 100 * Math.sin(start),
              x2 = 180 + 100 * Math.cos(end),
              y2 = 130 + 100 * Math.sin(end);
            if (value === 0) return null;
            return (
              <g key={index}>
                {portion === 1 ? (
                  <circle
                    cx="180"
                    cy="130"
                    r="100"
                    fill={
                      index === 1
                        ? `url(#${id}-stripe)`
                        : 'var(--accent-surface)'
                    }
                    stroke="currentColor"
                  />
                ) : (
                  <path
                    d={`M180 130 L${String(x1)} ${String(y1)} A100 100 0 ${portion > 0.5 ? '1' : '0'} 1 ${String(x2)} ${String(y2)} Z`}
                    fill={
                      index === 0
                        ? 'var(--accent-surface)'
                        : index === 1
                          ? `url(#${id}-stripe)`
                          : 'var(--violet-bg)'
                    }
                    stroke="currentColor"
                  />
                )}
                {labels && (
                  <text
                    x={180 + 65 * Math.cos(mid)}
                    y={136 + 65 * Math.sin(mid)}
                    textAnchor="middle"
                    fill="currentColor"
                    fontWeight="bold"
                  >
                    {value}
                  </text>
                )}
              </g>
            );
          })
        )}
        {legend &&
          values.map((value, index) => (
            <text key={index} x={20 + index * 112} y="275" fill="currentColor">
              {index + 7} кл.: {value}
            </text>
          ))}
      </svg>
      <figcaption>
        Секторы пропорциональны численностям; штриховка и подписи дополняют
        цвет.
      </figcaption>
    </figure>
  );
}
