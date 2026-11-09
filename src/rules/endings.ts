import type { Axis } from './types.ts';

/**
 * Endings (GD §8.2, DETAILED §9): main axis = the played character's; sub = the largest other
 * axis, only if it reaches `subRatio` (30%) of the main. Release: 4 endings. The secret
 * 'confluence' ending is out of the MVP scope (brief).
 */
export interface EndingDef { id: string; char: string; sub: Axis | null; i18n: string; }
export interface EndingsData { subRatio: number; endings: EndingDef[]; }

export function resolveEnding(charId: string, mainAxis: Axis, axes: Record<Axis, number>, data: EndingsData): EndingDef {
  const main = axes[mainAxis];
  let sub: Axis | null = null, best = -Infinity;
  for (const k of Object.keys(axes) as Axis[]) if (k !== mainAxis && axes[k] > best) { best = axes[k]; sub = k; }
  const subOk = sub !== null && main > 0 && best >= data.subRatio * main - 1e-9;
  const want = subOk ? `${charId}+${sub}` : charId;
  return data.endings.find(e => e.id === want) ?? data.endings.find(e => e.id === charId)!;
}
