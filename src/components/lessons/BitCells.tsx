import { byteGroups } from '../../lib/interactives/information';
export default function BitCells({ id, bits }: { id: string; bits: number }) {
  const { remainder } = byteGroups(bits);
  return (
    <svg role="img" viewBox="0 0 340 65" aria-labelledby={id + '-byte-title'}>
      <title id={id + '-byte-title'}>В байте восемь битовых ячеек; остаток заполняет {remainder} из восьми.</title>
      {Array.from({ length: 8 }, (_, index) => (
        <rect key={index} x={index * 41 + 2} y={8} width={35} height={35}
          fill={index < remainder ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} />
      ))}
    </svg>
  );
}
