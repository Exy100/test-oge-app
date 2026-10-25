import type { Parcel } from '../../lib/interactives/factory-games';
export default function SortingDiagram({
  parcels,
  routes,
  current,
}: {
  parcels: readonly Parcel[];
  routes: readonly (boolean | null)[];
  current: number;
}) {
  return (
    <div
      className="lab-table-scroll"
      tabIndex={0}
      role="region"
      aria-label="Посылки и распределение"
    >
      <table>
        <caption>Посылки и твои решения</caption>
        <thead>
          <tr>
            <th scope="col">№</th>
            <th scope="col">Зона</th>
            <th scope="col">кг</th>
            <th scope="col">Решение</th>
          </tr>
        </thead>
        <tbody>
          {parcels.map((parcel, i) => (
            <tr key={parcel.id} data-current={i === current}>
              <th scope="row">
                {parcel.id}
                {i === current ? ' ←' : ''}
              </th>
              <td>{parcel.zone}</td>
              <td>{parcel.weight}</td>
              <td>
                {routes[i] === null
                  ? 'Не принято'
                  : routes[i]
                    ? 'Отбор'
                    : 'Остальные'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
