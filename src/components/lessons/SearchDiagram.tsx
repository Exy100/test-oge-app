import { regionNames } from '../../lib/interactives/search';
const circles = [
  { cx: 150, cy: 120 },
  { cx: 250, cy: 120 },
  { cx: 200, cy: 210 },
];
const positions = [
  [30, 310],
  [112, 104],
  [288, 104],
  [200, 82],
  [200, 268],
  [143, 186],
  [257, 186],
  [200, 148],
];
export default function SearchDiagram({
  id,
  counts,
  selected,
}: {
  id: string;
  counts: readonly number[];
  selected: readonly boolean[];
}) {
  return (
    <svg role="img" viewBox="0 0 400 334" aria-labelledby={`${id}-venn-title`}>
      <title id={`${id}-venn-title`}>
        Три множества страниц A, B, C. Подсвечены области текущего запроса;
        числа перечислены также в таблице.
      </title>
      <defs>
        {circles.map((circle, index) => (
          <clipPath key={index} id={`${id}-circle-${String(index)}`}>
            <circle {...circle} r="90" />
          </clipPath>
        ))}
        {counts.map((_, mask) => (
          <mask key={mask} id={`${id}-exclude-${String(mask)}`}>
            <rect x="4" y="4" width="392" height="326" fill="white" />
            {circles.map((circle, index) =>
              (mask & (2 ** index)) === 0 ? (
                <circle key={index} {...circle} r="90" fill="black" />
              ) : null,
            )}
          </mask>
        ))}
      </defs>
      {counts.map((_, mask) => {
        const region = (
          <rect
            x="4"
            y="4"
            width="392"
            height="326"
            fill="var(--accent-surface)"
            mask={`url(#${id}-exclude-${String(mask)})`}
          />
        );
        return (
          <g key={mask} data-region={mask} data-selected={selected[mask]}>
            {selected[mask]
              ? circles.reduce(
                  (child, _, index) =>
                    (mask & (2 ** index)) !== 0 ? (
                      <g clipPath={`url(#${id}-circle-${String(index)})`}>
                        {child}
                      </g>
                    ) : (
                      child
                    ),
                  region,
                )
              : null}
          </g>
        );
      })}
      <rect
        x="4"
        y="4"
        width="392"
        height="326"
        rx="6"
        fill="none"
        stroke="currentColor"
      />
      {circles.map((circle, index) => (
        <circle
          key={index}
          {...circle}
          r="90"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      ))}
      <text x="72" y="44" fill="currentColor">
        A
      </text>
      <text x="320" y="44" fill="currentColor">
        B
      </text>
      <text x="200" y="314" textAnchor="middle" fill="currentColor">
        C
      </text>
      {counts.map((value, mask) => (
        <text
          key={mask}
          x={positions[mask]?.[0]}
          y={positions[mask]?.[1]}
          textAnchor="middle"
          fontWeight={selected[mask] ? 700 : 400}
          textDecoration={selected[mask] ? 'underline' : 'none'}
          fill="currentColor"
          aria-label={`${regionNames[mask] ?? ''}: ${String(value)}${selected[mask] ? ', учтено' : ''}`}
        >
          {value}
        </text>
      ))}
    </svg>
  );
}
