import {
  bits as formatBits,
  bytes as formatBytes,
} from '../../core/generators/task.ts';
import { addressLabs, assembleAddress } from './networks.ts';
import { directedMaps, type DirectedMap } from './graphs.ts';
import type { LocalStore } from '../../core/storage/store';

export interface Cargo {
  name: string;
  digits: string;
  base: number;
  bitsPerSymbol: number;
}
export interface WarehouseLevel {
  id: string;
  title: string;
  capacity: number;
  minimum: number;
  cargo: readonly Cargo[];
}
export const warehouseLevels: readonly WarehouseLevel[] = [
  {
    id: 'bytes',
    title: 'Биты в байты',
    capacity: 44,
    minimum: 4,
    cargo: [
      { name: 'Записки', digits: '8', base: 10, bitsPerSymbol: 8 },
      { name: 'Карточки', digits: '12', base: 10, bitsPerSymbol: 8 },
      { name: 'Письма', digits: '16', base: 10, bitsPerSymbol: 8 },
    ],
  },
  {
    id: 'bases',
    title: 'Три системы счисления',
    capacity: 44,
    minimum: 4,
    cargo: [
      { name: 'Записки', digits: '1000', base: 2, bitsPerSymbol: 8 },
      { name: 'Карточки', digits: '14', base: 8, bitsPerSymbol: 8 },
      { name: 'Письма', digits: '10', base: 16, bitsPerSymbol: 8 },
    ],
  },
  {
    id: 'wide',
    title: 'По 16 бит на символ',
    capacity: 128,
    minimum: 6,
    cargo: [
      { name: 'Записки', digits: '110', base: 2, bitsPerSymbol: 16 },
      { name: 'Карточки', digits: '12', base: 8, bitsPerSymbol: 16 },
      { name: 'Письма', digits: '10', base: 16, bitsPerSymbol: 16 },
    ],
  },
];
export function cargoBytes(cargo: Cargo) {
  return (parseInt(cargo.digits, cargo.base) * cargo.bitsPerSymbol) / 8;
}
export function warehouseLoad(
  level: WarehouseLevel,
  counts: readonly number[],
) {
  if (
    counts.length !== level.cargo.length ||
    counts.some((n) => !Number.isInteger(n) || n < 0 || n > 6)
  )
    throw new RangeError('Выбери от 0 до 6 контейнеров каждого вида.');
  const bytes = level.cargo.reduce(
    (sum, cargo, i) => sum + cargoBytes(cargo) * (counts[i] ?? 0),
    0,
  );
  return { bytes, bits: bytes * 8, count: counts.reduce((a, b) => a + b, 0) };
}
export function checkWarehouse(
  level: WarehouseLevel,
  counts: readonly number[],
  bits: string,
  bytes: string,
) {
  const load = warehouseLoad(level, counts);
  if (counts.some((n) => n === 0))
    return {
      correct: false,
      message: 'Возьми хотя бы один контейнер каждого вида.',
    };
  if (load.count < level.minimum)
    return {
      correct: false,
      message: `Выбрано контейнеров: ${String(load.count)}. Нужно не меньше ${String(level.minimum)}.`,
    };
  if (load.bytes > level.capacity)
    return {
      correct: false,
      message: `Груз занимает ${formatBytes(load.bytes)}, а помещается ${String(level.capacity)}. Убери часть груза или замени большой контейнер меньшим.`,
    };
  if (
    !/^\d+$/u.test(bits) ||
    !/^\d+$/u.test(bytes) ||
    Number(bits) !== load.bits ||
    Number(bytes) !== load.bytes
  )
    return {
      correct: false,
      message:
        'Проверь расчёт: переведи число символов в десятичную систему, умножь на биты на символ и количество контейнеров. Сложи биты всех видов, затем раздели сумму на 8.',
    };
  const terms = level.cargo.map(
    (cargo, i) =>
      `${String(counts[i])} × ${String(parseInt(cargo.digits, cargo.base))} × ${String(cargo.bitsPerSymbol)}`,
  );
  return {
    correct: true,
    message: `Верно: ${terms.join(' + ')} = ${formatBits(load.bits)}; ${String(load.bits)} ÷ 8 = ${formatBytes(load.bytes)}. Осталось ${formatBytes(level.capacity - load.bytes)}.`,
  };
}

export interface PacketLevel {
  id: string;
  title: string;
  address: keyof typeof addressLabs;
  graph: DirectedMap;
  via: string | null;
  avoid: string | null;
}
export const packetLevels: readonly PacketLevel[] = [
  {
    id: 'fork',
    title: 'Развилки',
    address: 'https',
    graph: directedMaps.fork,
    via: null,
    avoid: null,
  },
  {
    id: 'via',
    title: 'Через заданный узел',
    address: 'ftp',
    graph: directedMaps.fork,
    via: 'Г',
    avoid: null,
  },
  {
    id: 'blocked',
    title: 'Закрытый узел',
    address: 'overlap',
    graph: directedMaps.merge,
    via: 'Д',
    avoid: 'Ж',
  },
];
export function nextPacketNodes(level: PacketLevel, path: readonly string[]) {
  const current = path.at(-1);
  return level.graph.edges
    .filter(([from, to]) => from === current && to !== level.avoid)
    .map(([, to]) => to);
}
export function packetPaths(level: PacketLevel): string[][] {
  const start = level.graph.nodes[0],
    end = level.graph.nodes.at(-1);
  if (!start || !end) throw new RangeError('У сети нет начала или конца.');
  const paths: string[][] = [];
  function visit(path: string[]) {
    if (path.at(-1) === end) {
      if (!level.via || path.includes(level.via)) paths.push(path);
      return;
    }
    for (const next of nextPacketNodes(level, path))
      if (!path.includes(next)) visit([...path, next]);
  }
  visit([start]);
  return paths;
}
export function checkPacket(
  level: PacketLevel,
  sequence: string,
  path: readonly string[],
  count: string,
) {
  let address;
  try {
    address = assembleAddress(addressLabs[level.address].problem, sequence);
  } catch {
    return {
      correct: false,
      message: 'Запиши все семь цифровых меток без повторов и разделителей.',
    };
  }
  if (!address.correct)
    return {
      correct: false,
      message: `Из фрагментов получилось «${address.address}». Проверь протокол, сервер и путь; нужны все семь фрагментов.`,
    };
  const paths = packetPaths(level);
  if (!paths.some((candidate) => candidate.join(':') === path.join(':')))
    return {
      correct: false,
      message:
        'Дойди до финиша по стрелкам, соблюдая условие о промежуточных узлах. Можно вернуться на один шаг.',
    };
  if (!/^\d+$/u.test(count) || Number(count) !== paths.length)
    return {
      correct: false,
      message:
        'Пересчитай все допустимые пути, а не только пройденный. В начале поставь 1; в остальных узлах складывай числа на входящих стрелках с учётом условия.',
    };
  return {
    correct: true,
    message: `Верно: ${address.address}. Маршрут ${path.join(' → ')} допустим. Всего путей по условию: ${String(paths.length)}.`,
  };
}

/** Game IDs namespace levels inside the existing exportable lesson progress area. */
export function saveGameLevel(
  store: LocalStore,
  lessonId: string,
  gameId: string,
  levelId: string,
) {
  store.refresh();
  const progress = store.read('lessonProgress');
  const current = progress.entries.find((row) => row.lessonId === lessonId) ?? {
    lessonId,
    completed: false,
    quizCorrect: 0,
    quizTotal: 0,
    levels: [],
  };
  const levels = [...new Set([...current.levels, `${gameId}:${levelId}`])];
  store.write('lessonProgress', {
    ...progress,
    entries: [
      ...progress.entries.filter((row) => row.lessonId !== lessonId),
      { ...current, levels },
    ],
  });
}
