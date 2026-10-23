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
] as const;
