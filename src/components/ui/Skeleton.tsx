export function Skeleton({
  label = 'Загрузка материала',
  lines = 3,
}: {
  label?: string;
  lines?: 1 | 2 | 3;
}) {
  return (
    <div className="ui-skeleton" role="status" aria-busy="true">
      <span className="ui-sr-only">{label}</span>
      <span aria-hidden="true" className="ui-skeleton-lines">
        {Array.from({ length: lines }, (_, index) => (
          <span key={index} />
        ))}
      </span>
    </div>
  );
}
