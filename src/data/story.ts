import world from '../../data/story/world.json' with { type: 'json' };
import prologue from '../../data/story/prologue.json' with { type: 'json' };
import memories from '../../data/story/memories.json' with { type: 'json' };
import type { MemoriesDef, WorldDef } from '../rules/story.ts';

export interface PrologueDef {
  scenes: string[];
  unlockScenes: Record<string, string[]>;
  waveLines: Record<string, string[]>;
  foreshadow: { key: string; chance: number };
}

/** Story data (docs/STORY_WORLD_EXPANSION.md §7 release scope). */
export const WORLD = world as unknown as WorldDef;
export const PROLOGUE = prologue as PrologueDef;
export const MEMORIES = memories as unknown as MemoriesDef;
