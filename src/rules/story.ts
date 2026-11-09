/**
 * Story layer (docs/STORY_WORLD_EXPANSION.md §3, §5, §7): world map homestead, region
 * unlocks, memory fragments and recall cards. Pure data → decisions; no DOM.
 */

export interface RegionDef { id: string; icon: string; hex: [number, number]; maps?: string[]; released: boolean; far?: boolean; unlock?: { clearRegion: string }; }
export interface WorldDef { home: string; regions: RegionDef[]; homestead: [number, number][]; }

export interface FragmentWhen { char?: string; noDamage?: boolean; ecologyAtLeast?: number; openedField?: boolean; retried?: boolean; burstWaveClean?: boolean; lakeHeld?: boolean; }
export interface FragmentDef { id: string; philosophy: string; region: string; when: FragmentWhen; }
export interface PhilosophyDef { id: string; char: string; icon: string; i18n: string; }
export interface MemoriesDef { recallAt: number; philosophies: PhilosophyDef[]; fragments: FragmentDef[]; }

/** What a cleared run did (collected by the game layer). */
export interface RunFacts {
  region: string;
  char: string;
  cleared: boolean;
  /** Integer HP lost over the whole run. */
  damage: number;
  ecologyBest: number;
  openedField: boolean;
  retries: number;
  /** A wave in which a glacier lake burst ended without damage. */
  burstWaveClean: boolean;
  /** At least one glacier lake never burst. */
  lakeHeld: boolean;
}

/** Does a cleared run meet a fragment's condition? (all listed conditions must hold) */
export function fragmentMet(f: FragmentDef, r: RunFacts): boolean {
  if (!r.cleared || r.region !== f.region) return false;
  const w = f.when;
  if (w.char && w.char !== r.char) return false;
  if (w.noDamage && r.damage > 0) return false;
  if (w.ecologyAtLeast !== undefined && r.ecologyBest < w.ecologyAtLeast) return false;
  if (w.openedField && !r.openedField) return false;
  if (w.retried && r.retries === 0) return false;
  if (w.burstWaveClean && !r.burstWaveClean) return false;
  if (w.lakeHeld && !r.lakeHeld) return false;
  return true;
}

/** Fragments newly earned by this run. */
export function newFragments(m: MemoriesDef, r: RunFacts, have: readonly string[]): string[] {
  return m.fragments.filter(f => !have.includes(f.id) && fragmentMet(f, r)).map(f => f.id);
}

/** Philosophies whose recall card is open: `recallAt` of their fragments collected. */
export function openRecalls(m: MemoriesDef, have: readonly string[]): string[] {
  return m.philosophies.filter(p => m.fragments.filter(f => f.philosophy === p.id && have.includes(f.id)).length >= m.recallAt).map(p => p.id);
}

/** A region is open when released and its unlock region has every map cleared. */
export function regionOpen(w: WorldDef, id: string, cleared: (mapId: string) => boolean): boolean {
  const r = w.regions.find(x => x.id === id);
  if (!r || !r.released) return false;
  if (!r.unlock) return true;
  const need = w.regions.find(x => x.id === r.unlock!.clearRegion);
  return !!need?.maps?.length && need.maps.every(cleared);
}

/** Homestead cells shown: the home cell plus one per cleared map (in data order). */
export function homesteadCells(w: WorldDef, clearedMaps: readonly string[]): { hex: [number, number]; map: string | null }[] {
  const order = w.regions.flatMap(r => r.maps ?? []).filter(id => clearedMaps.includes(id));
  const home = w.regions.find(r => r.id === w.home)!;
  return [{ hex: home.hex, map: null }, ...order.slice(0, w.homestead.length).map((map, i) => ({ hex: w.homestead[i], map }))];
}
