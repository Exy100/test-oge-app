import type { FigureSpec } from '../core/types';

const nodes = ['А', 'Б', 'В', 'Г'].map((label, index) => ({
  id: String(index),
  label,
}));
export const figureExamples: FigureSpec[] = [
  {
    kind: 'weighted-graph',
    description: 'Дорога между двумя пунктами',
    nodes: nodes.slice(0, 2),
    edges: [{ from: '0', to: '1', weight: 3 }],
  },
  {
    kind: 'weighted-graph',
    description: 'Треугольник дорог',
    nodes: nodes.slice(0, 3),
    edges: [
      { from: '0', to: '1', weight: 5 },
      { from: '1', to: '2', weight: 7 },
      { from: '0', to: '2', weight: 10 },
    ],
  },
  {
    kind: 'weighted-graph',
    description: 'Разветвлённые дороги',
    nodes: [{ id: '0', label: 'Северный посёлок' }, ...nodes.slice(1)],
    edges: [
      { from: '0', to: '1', weight: 12 },
      { from: '0', to: '2', weight: 8 },
      { from: '0', to: '3', weight: 4 },
      { from: '1', to: '3', weight: 9 },
    ],
  },
  {
    kind: 'directed-graph',
    description: 'Одна дуга',
    nodes: nodes.slice(0, 2),
    edges: [{ from: '0', to: '1' }],
  },
  {
    kind: 'directed-graph',
    description: 'Дуги в обе стороны',
    nodes: nodes.slice(0, 2),
    edges: [
      { from: '0', to: '1' },
      { from: '1', to: '0' },
    ],
  },
  {
    kind: 'directed-graph',
    description: 'Развилка и объединение',
    nodes,
    edges: [
      { from: '0', to: '1' },
      { from: '0', to: '2' },
      { from: '1', to: '3' },
      { from: '2', to: '3' },
    ],
  },
  {
    kind: 'table',
    description: 'Размер одного файла',
    columns: ['Файл', 'Байты'],
    rows: [['a.txt', 8]],
  },
  {
    kind: 'table',
    description: 'Таблица истинности НЕ',
    columns: ['A', 'НЕ A'],
    rows: [0, 1].map((a) => [a, Number(!a)]),
  },
  {
    kind: 'table',
    description: 'Кириллица и длинные имена',
    columns: ['Каталог', 'Имя файла', 'Размер в байтах'],
    rows: [
      ['Учебные материалы', 'Описание алгоритма движения Робота.txt', 128],
      ['Программы', 'Решение.py', 64],
    ],
  },
  {
    kind: 'logic-circuit',
    description: 'Отрицание',
    nodes: [
      { id: 'a', label: 'А', operation: 'input' },
      { id: 'n', operation: 'not', inputs: ['a'] },
    ],
    output: 'n',
  },
  {
    kind: 'logic-circuit',
    description: 'Конъюнкция',
    nodes: [
      { id: 'a', label: 'А', operation: 'input' },
      { id: 'b', label: 'Б', operation: 'input' },
      { id: 'c', operation: 'and', inputs: ['a', 'b'] },
    ],
    output: 'c',
  },
  {
    kind: 'logic-circuit',
    description: 'Несколько операций',
    nodes: [
      { id: 'a', label: 'Вход А', operation: 'input' },
      { id: 'b', label: 'Вход Б', operation: 'input' },
      { id: 'n', operation: 'not', inputs: ['a'] },
      { id: 'o', operation: 'or', inputs: ['n', 'b'] },
      { id: 'x', operation: 'xor', inputs: ['o', 'a'] },
    ],
    output: 'x',
  },
  {
    kind: 'place-value',
    description: 'Двоичные разряды',
    base: 2,
    digits: [1, 0, 1],
  },
  {
    kind: 'place-value',
    description: 'Шестнадцатеричные разряды',
    base: 16,
    digits: [10, 15],
  },
  {
    kind: 'place-value',
    description: 'Ведущий ноль',
    base: 8,
    digits: [0, 7, 0, 1],
  },
  {
    kind: 'code-table',
    description: 'Код из двух символов',
    entries: [
      { symbol: 'А', code: '0' },
      { symbol: 'Б', code: '1' },
    ],
  },
  {
    kind: 'code-table',
    description: 'Коды разной длины',
    entries: [
      { symbol: 'А', code: '0' },
      { symbol: 'Б', code: '10' },
      { symbol: 'В', code: '11' },
    ],
  },
  {
    kind: 'code-table',
    description: 'Коды со знаками',
    entries: [
      { symbol: '<', code: '00' },
      { symbol: '&', code: '01' },
      { symbol: 'Пробел', code: '10' },
      { symbol: '→', code: '11' },
    ],
  },
  {
    kind: 'file-tree',
    description: 'Файл в корне',
    entries: [{ kind: 'file', path: 'a.txt', size: 8 }],
  },
  {
    kind: 'file-tree',
    description: 'Вложенные каталоги',
    entries: [
      { kind: 'file', path: 'Тексты/Примеры/а.txt', size: 16 },
      { kind: 'directory', path: 'Тексты' },
      { kind: 'directory', path: 'Тексты/Примеры' },
    ],
  },
  {
    kind: 'file-tree',
    description: 'Несколько ветвей',
    entries: [
      { kind: 'directory', path: 'Программы' },
      { kind: 'directory', path: 'Данные' },
      { kind: 'file', path: 'Программы/Решение.py', size: 32 },
      { kind: 'file', path: 'Данные/Длинное имя учебного набора.txt', size: 0 },
    ],
  },
  {
    kind: 'network-address',
    description: 'Адрес документа',
    protocol: 'https',
    host: 'example.org',
    path: 'docs/a.txt',
  },
  {
    kind: 'network-address',
    description: 'Адрес файла FTP',
    protocol: 'ftp',
    host: 'files.example.org',
    path: 'Тексты/Пример.txt',
  },
  {
    kind: 'network-address',
    description: 'Длинный адрес',
    protocol: 'http',
    host: 'school.example.org',
    path: 'Материалы/Информатика/Длинное имя файла.txt',
  },
  {
    kind: 'robot-field',
    description: 'Одноклеточное поле',
    rows: 1,
    columns: 1,
    start: { row: 0, column: 0 },
    painted: [],
    targets: [{ row: 0, column: 0 }],
    walls: [],
  },
  {
    kind: 'robot-field',
    description: 'Вертикальная стена',
    rows: 2,
    columns: 3,
    start: { row: 0, column: 0 },
    painted: [{ row: 1, column: 0 }],
    targets: [{ row: 1, column: 2 }],
    walls: [{ from: { row: 0, column: 0 }, to: { row: 0, column: 1 } }],
  },
  {
    kind: 'robot-field',
    description: 'Горизонтальная и вертикальная стены',
    rows: 4,
    columns: 5,
    start: { row: 2, column: 1 },
    painted: [
      { row: 0, column: 4 },
      { row: 3, column: 0 },
    ],
    targets: [
      { row: 3, column: 0 },
      { row: 2, column: 4 },
    ],
    walls: [
      { from: { row: 0, column: 1 }, to: { row: 1, column: 1 } },
      { from: { row: 2, column: 2 }, to: { row: 2, column: 3 } },
    ],
  },
];
