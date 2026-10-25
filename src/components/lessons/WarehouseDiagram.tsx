import {
  cargoBytes,
  warehouseLoad,
  type WarehouseLevel,
} from '../../lib/interactives/games';

export default function WarehouseDiagram({
  level,
  counts,
}: {
  level: WarehouseLevel;
  counts: readonly number[];
}) {
  const { bytes } = warehouseLoad(level, counts);
  const scale = 400 / Math.max(level.capacity, bytes);
  return (
    <svg
      role="img"
      viewBox="0 0 420 165"
      aria-label={`Загрузка склада: ${String(bytes)} из ${String(level.capacity)} байт. Каркас — общая вместимость; контейнеры за каркасом не помещаются.`}
    >
      <title>Загрузка склада</title>
      {level.cargo.map((cargo, i) => (
        <text key={cargo.name} x="8" y={22 + i * 20} fill="currentColor">
          {cargo.name}: {counts[i]}
        </text>
      ))}
      <rect
        x="8"
        y="78"
        width={level.capacity * scale}
        height="45"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      {level.cargo.flatMap((cargo, row) => {
        const offset = level.cargo
          .slice(0, row)
          .reduce(
            (sum, item, i) => sum + cargoBytes(item) * (counts[i] ?? 0),
            0,
          );
        const width = cargoBytes(cargo) * scale;
        return Array.from({ length: counts[row] ?? 0 }, (_, i) => (
          <rect
            key={`${String(row)}:${String(i)}`}
            x={8 + offset * scale + i * width + 1}
            y={83 + row * 2}
            width={Math.max(0, width - 2)}
            height={35 - row * 4}
            fill="currentColor"
          />
        ));
      })}
      <text x="8" y="150" fill="currentColor">
        Каркас: {level.capacity} байт
      </text>
    </svg>
  );
}
