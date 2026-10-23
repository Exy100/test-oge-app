/** Only working course scenes belong in the inventory. */
export const interactives = [
  { id: 'text-volume', kind: '2d', load: () => import('./TextVolume.tsx') },
  {
    id: 'bits-and-bytes',
    kind: '2d',
    load: () => import('./BitsAndBytes.tsx'),
  },
  { id: 'code-decoder', kind: '2d', load: () => import('./CodeDecoder.tsx') },
  { id: 'logic-builder', kind: '2d', load: () => import('./LogicBuilder.tsx') },
  { id: 'shortest-path', kind: '2d', load: () => import('./ShortestPath.tsx') },
  { id: 'path-count', kind: '2d', load: () => import('./PathCount.tsx') },
  {
    id: 'fixed-executor',
    kind: '2d',
    load: () => import('./FixedExecutor.tsx'),
  },
  {
    id: 'program-tracer',
    kind: '2d',
    load: () => import('./ProgramTracer.tsx'),
  },
  {
    id: 'resource-address',
    kind: '2d',
    load: () => import('./ResourceAddress.tsx'),
  },
  { id: 'search-sets', kind: '2d', load: () => import('./SearchSets.tsx') },
  { id: 'numeral-lab', kind: '2d', load: () => import('./NumeralLab.tsx') },
  { id: 'file-tree', kind: '2d', load: () => import('./FileTree.tsx') },
  {
    id: 'text-file-search',
    kind: '2d',
    load: () => import('./TextFileSearch.tsx'),
  },
  { id: 'file-masks', kind: '2d', load: () => import('./FileMasks.tsx') },
] as const;
