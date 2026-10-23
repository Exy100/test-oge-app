/** Only working course scenes belong in the inventory. */
export const interactives = [
  { id: 'text-volume', kind: '2d', load: () => import('./TextVolume.tsx') },
  {
    id: 'bits-and-bytes',
    kind: '2d',
    load: () => import('./BitsAndBytes.tsx'),
  },
  { id: 'code-decoder', kind: '2d', load: () => import('./CodeDecoder.tsx') },
] as const;
