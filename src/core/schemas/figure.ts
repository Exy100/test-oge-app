import { z } from '../zod';
import {
  FiniteNumberSchema,
  NaturalSchema,
  RelativePathSchema,
  TextSchema,
  unique,
} from './shared';

const description = { description: TextSchema };
const node = z.strictObject({ id: TextSchema, label: TextSchema });
const nodes = z
  .array(node)
  .min(1)
  .refine((items) => unique(items.map((item) => item.id)));
const edge = z.strictObject({ from: TextSchema, to: TextSchema });
const weightedEdge = edge.extend({
  weight: FiniteNumberSchema.pipe(z.number().positive()),
});
function validEdges(
  graph: { nodes: { id: string }[]; edges: { from: string; to: string }[] },
  directed: boolean,
): boolean {
  const ids = new Set(graph.nodes.map((item) => item.id));
  return (
    graph.edges.every(
      (item) => ids.has(item.from) && ids.has(item.to) && item.from !== item.to,
    ) &&
    unique(
      graph.edges.map((item) =>
        JSON.stringify(
          directed ? [item.from, item.to] : [item.from, item.to].sort(),
        ),
      ),
    )
  );
}
const weightedGraph = z
  .strictObject({
    kind: z.literal('weighted-graph'),
    ...description,
    nodes,
    edges: z.array(weightedEdge),
  })
  .refine(
    (graph) => validEdges(graph, false),
    'Проверь концы и повторы рёбер.',
  );
const directedGraph = z
  .strictObject({
    kind: z.literal('directed-graph'),
    ...description,
    nodes,
    edges: z.array(edge),
  })
  .refine((graph) => validEdges(graph, true), 'Проверь концы и повторы дуг.');
const table = z
  .strictObject({
    kind: z.literal('table'),
    ...description,
    columns: z.array(TextSchema).min(1),
    rows: z.array(z.array(z.union([z.string(), FiniteNumberSchema]))).min(1),
  })
  .refine(
    (value) => value.rows.every((row) => row.length === value.columns.length),
    'Ширина строк должна совпадать с заголовком.',
  );
const logicNode = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal('input'),
    id: TextSchema,
    label: TextSchema,
  }),
  z.strictObject({
    operation: z.literal('not'),
    id: TextSchema,
    inputs: z.tuple([TextSchema]),
  }),
  z.strictObject({
    operation: z.literal('and'),
    id: TextSchema,
    inputs: z.tuple([TextSchema, TextSchema]),
  }),
  z.strictObject({
    operation: z.literal('or'),
    id: TextSchema,
    inputs: z.tuple([TextSchema, TextSchema]),
  }),
  z.strictObject({
    operation: z.literal('xor'),
    id: TextSchema,
    inputs: z.tuple([TextSchema, TextSchema]),
  }),
]);
const logic = z
  .strictObject({
    kind: z.literal('logic-circuit'),
    ...description,
    nodes: z.array(logicNode).min(1),
    output: TextSchema,
  })
  .refine((circuit) => {
    const seen = new Set<string>();
    for (const item of circuit.nodes) {
      if (
        seen.has(item.id) ||
        (item.operation !== 'input' &&
          item.inputs.some((input) => !seen.has(input)))
      )
        return false;
      seen.add(item.id);
    }
    return seen.has(circuit.output);
  }, 'Элементы схемы нужны в порядке вычисления, без циклов и неизвестных входов.');
const placeValue = z
  .strictObject({
    kind: z.literal('place-value'),
    ...description,
    base: NaturalSchema.pipe(z.number().min(2).max(36)),
    digits: z.array(NaturalSchema).min(1),
  })
  .refine(
    (value) => value.digits.every((digit) => digit < value.base),
    'Цифра должна быть меньше основания.',
  );
const codes = z
  .strictObject({
    kind: z.literal('code-table'),
    ...description,
    entries: z
      .array(
        z.strictObject({
          symbol: TextSchema,
          code: z.string().regex(/^[01]+$/u),
        }),
      )
      .min(1),
  })
  .refine(
    (value) =>
      unique(value.entries.map((entry) => entry.symbol)) &&
      unique(value.entries.map((entry) => entry.code)),
    'Символы и коды должны быть уникальны.',
  );
const treeEntry = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('directory'), path: RelativePathSchema }),
  z.strictObject({
    kind: z.literal('file'),
    path: RelativePathSchema,
    size: NaturalSchema,
  }),
]);
const fileTree = z
  .strictObject({
    kind: z.literal('file-tree'),
    ...description,
    entries: z.array(treeEntry).min(1),
  })
  .refine((tree) => {
    const directories = new Set(
      tree.entries
        .filter((entry) => entry.kind === 'directory')
        .map((entry) => entry.path),
    );
    return (
      unique(tree.entries.map((entry) => entry.path)) &&
      tree.entries.every(
        (entry) =>
          !entry.path.includes('/') ||
          directories.has(entry.path.slice(0, entry.path.lastIndexOf('/'))),
      )
    );
  }, 'Пути должны быть уникальны, родительские каталоги — существовать.');
const address = z.strictObject({
  kind: z.literal('network-address'),
  ...description,
  protocol: z.enum(['http', 'https', 'ftp']),
  host: z
    .string()
    .regex(
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/u,
    ),
  path: RelativePathSchema,
});
const cell = z.strictObject({ row: NaturalSchema, column: NaturalSchema });
const robot = z
  .strictObject({
    kind: z.literal('robot-field'),
    ...description,
    rows: NaturalSchema.pipe(z.number().positive()),
    columns: NaturalSchema.pipe(z.number().positive()),
    start: cell,
    painted: z.array(cell),
    targets: z.array(cell),
    walls: z.array(z.strictObject({ from: cell, to: cell })),
  })
  .refine((field) => {
    const key = (position: z.infer<typeof cell>) =>
      `${String(position.row)},${String(position.column)}`;
    const inside = (position: z.infer<typeof cell>) =>
      position.row < field.rows && position.column < field.columns;
    return (
      inside(field.start) &&
      [...field.painted, ...field.targets].every(inside) &&
      unique(field.painted.map(key)) &&
      unique(field.targets.map(key)) &&
      field.walls.every(
        (wall) =>
          inside(wall.from) &&
          inside(wall.to) &&
          Math.abs(wall.from.row - wall.to.row) +
            Math.abs(wall.from.column - wall.to.column) ===
            1,
      ) &&
      unique(
        field.walls.map((wall) =>
          JSON.stringify([key(wall.from), key(wall.to)].sort()),
        ),
      )
    );
  }, 'Клетки должны лежать внутри поля; стена разделяет соседние клетки и не повторяется.');

export const FigureSpecSchema = z.discriminatedUnion('kind', [
  weightedGraph,
  directedGraph,
  table,
  logic,
  placeValue,
  codes,
  fileTree,
  address,
  robot,
]);
