export const gateLevels = [
  {
    id: 'both',
    title: 'Два включённых датчика',
    goal: 'Проход должен открываться, только когда оба датчика A и B включены.',
  },
  {
    id: 'neither',
    title: 'Ни одного включённого датчика',
    goal: 'Проход должен открываться, только когда ни один датчик не включён.',
  },
  {
    id: 'exclusive',
    title: 'Ровно один датчик',
    goal: 'Проход должен открываться, только когда включён ровно один из двух датчиков.',
  },
] as const;
export type GateLevel = (typeof gateLevels)[number];
export function gateGoal(level: GateLevel, a: boolean, b: boolean) {
  if (level.id === 'both') return a && b;
  if (level.id === 'neither') return !a && !b;
  return a !== b;
}
