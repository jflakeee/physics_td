import type { SimGrid } from '../../src/core/types.ts';
import { cloneGrid, createGrid } from '../../src/sim/grid.ts';
import { createFluidScratch, fluidStep, type FluidScratch } from '../../src/sim/fluid.ts';
import { freezeCells, meltIce } from '../../src/sim/ice.ts';
import { createRng, seedState, type Rng } from '../../src/core/rng.ts';
import { CHARS, ENDLESS, NEXT_SEASON, SEASON_BY_NAME, SEASONS, STAGES, T, type CardId, type CharId, type PowerupId, type Season, type Weather } from './tuning.ts';
export type { CardId, CharId, PowerupId } from './tuning.ts';

/**
 * V4 hydro prototype rules (docs/REDESIGN_V4_HYDRO.md). No DOM.
 * A river runs top → bottom. Plants on the river turn flow × drop into power (P = ηρgQH);
 * power is XP; meeting the village demand earns coins; coins build plants, reservoirs, walls.
 * Weather changes the inflow. Spirits (auto skills) act on their own.
 * Water is conserved: inflow − drained = water + ice (`balance`).
 */

export const W = 64, H = 96;
const at = (x: number, y: number) => y * W + x;

// ---- maps: one per stage ---------------------------------------------------------------
export const BANK = 0.7;
export type SiteKind = 'river' | 'bank';
export type BuildKind = 'wheel' | 'reservoir' | 'wall';
/**
 * Build spots. Each spot has one building, so a tap is enough (no build menu): river spots take a
 * water wheel, bank spots by a bend take a reservoir, bank spots by the village or a wheel take a wall.
 */
export interface Site { id: number; kind: SiteKind; build: BuildKind; x: number; y: number; side: -1 | 1 }
/** A valley: river centre line, bed height (with rapids), village, build spots, disaster rows. */
export interface MapDef {
  id: string;
  river: (y: number) => number;
  bed: (y: number) => number;
  village: { x0: number; x1: number; y0: number; y1: number };
  sites: readonly Site[];
  /** River site that already has a wheel at the start. */
  startSite: number;
  /** Rows where an ice jam forms and where a landslide falls into the river. */
  jamRow: number; slideRow: number;
  /** Bank height above the bed (lower banks flood sooner). */
  bank: number;
}
function mkMap(c: {
  id: string; river: (y: number) => number; top: number; slope: number; rapids: [number, number][];
  village: MapDef['village']; wheels: number[]; banks: [number, -1 | 1, BuildKind][]; startSite: number; jamRow: number; slideRow: number; bank?: number;
}): MapDef {
  const bed = (y: number) => { let z = c.top - c.slope * y; for (const [y0, y1] of c.rapids) z -= 0.1 * Math.max(0, Math.min(y, y1) - y0); return z; };
  const sites: Site[] = [];
  for (const y of c.wheels) sites.push({ id: sites.length, kind: 'river', build: 'wheel', x: Math.round(c.river(y)), y, side: 1 });
  for (const [y, side, build] of c.banks) sites.push({ id: sites.length, kind: 'bank', build, x: Math.round(c.river(y) + side * 8), y, side });
  return { id: c.id, river: c.river, bed, village: c.village, sites, startSite: c.startSite, jamRow: c.jamRow, slideRow: c.slideRow, bank: c.bank ?? BANK };
}
/** Stage n plays on MAPS[n]: each valley bends differently, has its rapids elsewhere and its village on another bank. */
export const MAPS: readonly MapDef[] = [
  mkMap({ // 작은 계곡: two rapids, village on the right bank
    id: 'valley-1', river: y => 30 + 9 * Math.sin(y / 15), top: 7, slope: 0.05, rapids: [[22, 32], [56, 64]],
    village: { x0: 36, x1: 52, y0: 78, y1: 92 }, wheels: [10, 27, 40, 60, 72, 86],
    banks: [[18, -1, 'reservoir'], [46, -1, 'reservoir'], [66, 1, 'reservoir'], [80, 1, 'wall'], [90, 1, 'wall'], [33, 1, 'wall']],
    startSite: 1, jamRow: 16, slideRow: 48,
  }),
  mkMap({ // 가을 계곡: tighter bends, two rapids, village mid-valley on the left bank beside a slow reach
    id: 'valley-2', river: y => 34 - 8 * Math.sin(y / 12 + 0.5), top: 7, slope: 0.05, rapids: [[14, 21], [36, 46]],
    village: { x0: 13, x1: 29, y0: 52, y1: 66 }, wheels: [8, 18, 30, 41, 72, 86],
    banks: [[27, 1, 'reservoir'], [40, 1, 'reservoir'], [60, 1, 'reservoir'], [58, -1, 'wall'], [46, -1, 'wall'], [78, -1, 'wall']],
    startSite: 1, jamRow: 26, slideRow: 50, bank: 0.62,
  }),
  mkMap({ // 겨울 계곡: one long rapid and a wide slow reach above the village (left bank)
    id: 'valley-3', river: y => 32 + 11 * Math.sin(y / 18 + 2), top: 7, slope: 0.047, rapids: [[28, 42], [60, 66]],
    village: { x0: 8, x1: 24, y0: 78, y1: 92 }, wheels: [12, 24, 36, 52, 63, 84],
    banks: [[18, 1, 'reservoir'], [48, -1, 'reservoir'], [56, 1, 'reservoir'], [72, -1, 'wall'], [86, -1, 'wall'], [44, 1, 'wall']],
    startSite: 2, jamRow: 20, slideRow: 50,
  }),
];
// stage 1 map under its old names (tests, tools)
export const riverX = MAPS[0].river;
export const bed = MAPS[0].bed;
export const VILLAGE = MAPS[0].village;
export const SITES = MAPS[0].sites;
export const inChannel = (x: number, y: number, m: MapDef = MAPS[0]) => Math.abs(x - m.river(y)) <= 2.5;
export const inVillage = (x: number, y: number, m: MapDef = MAPS[0]) => x >= m.village.x0 && x <= m.village.x1 && y >= m.village.y0 && y <= m.village.y1;
export interface Plant { site: number; hp: number; power: number; drown: number; spin: number; /** Power made this second (for the number that pops up). */ sec: number }
/** Things on the land you can tap to gather. */
export type NodeKind = 'tree' | 'rock' | 'flower' | 'bush';
export interface GatherNode { cell: number; kind: NodeKind | null; /** Ticks until something grows back (0 while standing). */ timer: number }
/** A number that pops up over a cell: what was just gained there. */
export interface Gain { cell: number; amount: number; what: 'power' | 'coins' | 'wood' | 'stone' }
export interface Mats { wood: number; stone: number }

const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) & 255; };
const spotCache = new Map<string, readonly number[]>();
/** Fixed spots for trees, rocks, flowers and bushes: on the banks, away from the river, village and build spots. */
export function nodeSpots(m: MapDef): readonly number[] {
  const hit = spotCache.get(m.id); if (hit) return hit;
  const out: number[] = [];
  for (let y = 3; y < H - 3; y += 2) for (let x = 2; x < W - 2; x++) {
    if (hash(x * 7 + 3, y * 11 + 5) > 14) continue;
    if (Math.abs(x - m.river(y)) < 8) continue;
    if (x >= m.village.x0 - 4 && x <= m.village.x1 + 4 && y >= m.village.y0 - 5 && y <= m.village.y1 + 2) continue;
    if (m.sites.some(s => (s.x - x) ** 2 + (s.y - y) ** 2 < 36)) continue;
    if (out.some(c => ((c % W) - x) ** 2 + (((c / W) | 0) - y) ** 2 < 16)) continue;
    out.push(y * W + x);
  }
  spotCache.set(m.id, out);
  return out;
}
export type Phase = 'ready' | 'run' | 'levelup' | 'won' | 'lost';

export interface HydroWorld {
  g: SimGrid; sc: FluidScratch; rng: Rng;
  /** The valley this run plays on (MAPS[stage]). */
  map: MapDef;
  /** Gatherable things, materials in hand, building levels (1..3, 0 = not built), respawn dice. */
  nodes: GatherNode[]; mats: Mats; lvl: number[]; rng2: Rng;
  /** Numbers to pop up this tick (wheels earning). */
  gains: Gain[];
  /** Reservoir sites whose sluice ran this tick (for the picture). */
  sluiceOpen: number[];
  channel: Uint8Array; village: Uint8Array;
  built: (BuildKind | null)[]; plants: Plant[];
  tick: number; phase: Phase;
  xp: number; level: number; coins: number; hearts: number;
  /** Power made during the current second, and the last full second. */
  secPower: number; lastSecPower: number; blackout: number;
  inflow: number; drained: number;
  skill: { sand: number; ice: number; eta: number; tough: number; cheap: number; rain: number; sun: number; penstock: number };
  spiritTimer: { sand: number; ice: number; rain: number; sun: number };
  /** Stage index into STAGES, its seasons and length, the character and the bonuses brought in. */
  stage: number; seasons: Season[]; totalSec: number; char: CharId;
  etaBonus: number; costMul: Record<BuildKind, number>;
  /** Bonus skills unlocked by clearing stages: they join the level-up pool. */
  unlocked: CardId[];
  /** Run record for the stats screen. */
  record: { builds: number; floodHearts: number; blackoutHearts: number; power: number; gathered: number };
  /** Endless play after a clear: extra seasons survived (0 = not endless). */
  endless: boolean; extraSeasons: number;
  /** Power already paid out in gems (a cleared run is booked before it goes on). */
  bookedPower: number; bookedTicks: number;
  /** How this run was created (to rebuild it when a saved run is continued). */
  origin: { seed: number; opt: RunOptions };
  /** Temporary sandbag cells and their remaining ticks. */
  sandbags: Map<number, number>;
  cards: CardId[];
  events: { lostHeart: 'blackout' | 'flood' | null; spirit: { kind: 'sand' | 'ice' | 'rain' | 'sun'; cells: number[] } | null; seasonSurvived: string | null; disaster: { kind: 'jam' | 'burst' | 'slide'; cells: number[] } | null };
  /** Disasters: which weather entry was last entered, and ticks left of a forming ice jam. */
  wxKey: string; jamTicks: number;
  /** Ticks before the next flood heart can be lost. */
  floodCooldown: number;
  /** Village edge cell where the last flood came in (−1 = none), for the arrow on screen. */
  floodFrom: number;
}

/** What a run brings in from the main menu: stage, character, power-up ranks, unlocked bonus skills. */
export interface RunOptions { stage?: number; char?: CharId; powerups?: Partial<Record<PowerupId, number>>; unlocked?: CardId[] }

/** New game. One wheel is already turning at the first rapid. */
export function createHydro(seed = 1, opt: RunOptions = {}): HydroWorld {
  const stage = Math.max(0, Math.min(STAGES.length - 1, opt.stage ?? 0)), st = STAGES[stage], map = MAPS[Math.min(stage, MAPS.length - 1)];
  const ch = CHARS.find(c => c.id === (opt.char ?? 'miller')) ?? CHARS[0], pu = opt.powerups ?? {};
  const builder = 1 - 0.05 * (pu.builder ?? 0);
  const g = createGrid(W, H);
  const channel = new Uint8Array(W * H), village = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y), z = map.bed(y), d = Math.abs(x - map.river(y));
    if (inChannel(x, y, map)) { channel[i] = 1; g.h[i] = z; }
    else if (inVillage(x, y, map)) { village[i] = 1; g.h[i] = z + map.bank - 0.15; }
    else g.h[i] = z + map.bank + 0.012 * (d - 2.5);
  }
  const w: HydroWorld = {
    g, sc: createFluidScratch(W * H), rng: createRng(seedState(seed, 4)), channel, village,
    map, built: map.sites.map(() => null), plants: [], tick: 0, phase: 'ready',
    nodes: nodeSpots(map).map((cell, k) => { const h = hash(k, 3); return { cell, kind: h < 150 ? 'tree' : h < 195 ? 'rock' : h < 235 ? 'flower' : 'bush', timer: 0 } as GatherNode; }),
    mats: { wood: 0, stone: 0 }, lvl: map.sites.map(() => 0), rng2: createRng(seedState(seed, 5)), gains: [], sluiceOpen: [],
    xp: 0, level: 1, coins: T.startCoins + 20 * (pu.purse ?? 0), hearts: T.hearts + (pu.heart ?? 0),
    secPower: 0, lastSecPower: 0, blackout: 0, inflow: 0, drained: 0,
    skill: { sand: 0, ice: 0, eta: 0, tough: 0, cheap: 0, rain: 0, sun: 0, penstock: 0 }, spiritTimer: { sand: 0, ice: 0, rain: 0, sun: 0 },
    sandbags: new Map(), cards: [], events: { lostHeart: null, spirit: null, seasonSurvived: null, disaster: null }, floodCooldown: 0, floodFrom: -1, wxKey: '', jamTicks: 0,
    endless: false, extraSeasons: 0, bookedPower: 0, bookedTicks: 0,
    stage, seasons: st.seasons, totalSec: st.seasons.reduce((a, x) => a + x.seconds, 0), char: ch.id,
    etaBonus: ch.eta + 0.05 * (pu.turbine ?? 0),
    costMul: { wheel: ch.costMul.wheel * builder, reservoir: ch.costMul.reservoir * builder, wall: ch.costMul.wall * builder },
    unlocked: [...(opt.unlocked ?? [])], record: { builds: 0, floodHearts: 0, blackoutHearts: 0, power: 0, gathered: 0 },
    origin: { seed, opt: { ...opt, powerups: { ...(opt.powerups ?? {}) }, unlocked: [...(opt.unlocked ?? [])] } },
  };
  if (ch.startSkill && ch.startSkill !== 'coins') { w.skill[ch.startSkill] = 1; startSpirit(w, ch.startSkill); }
  // start with a little water in the river so the first wheel turns at once
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (channel[at(x, y)]) g.w[at(x, y)] = 0.25;
  for (let i = 0; i < W * H; i++) w.inflow += g.w[i];
  placeBuilding(w, map.startSite, 'wheel', true);
  return w;
}

// ---- time & weather -----------------------------------------------------------------
/** Length of stage 1 (code with no world in hand). A world's own length is `w.totalSec`. */
export const totalSeconds = SEASONS.reduce((a, s) => a + s.seconds, 0);
/** Season index and seconds into it. */
export function seasonAt(sec: number, seasons: Season[] = SEASONS): { si: number; t: number } {
  let t = sec;
  for (let si = 0; si < seasons.length; si++) { if (t < seasons[si].seconds) return { si, t }; t -= seasons[si].seconds; }
  return { si: seasons.length - 1, t: seasons[seasons.length - 1].seconds };
}
/** Weather now, the multiplier (ramped), and the next change (for the forecast). */
export function weatherAt(sec: number, seasons: Season[] = SEASONS): { now: Weather; mul: number; next: Weather | null; nextIn: number } {
  const SEASONS = seasons;
  const { si, t } = seasonAt(sec, seasons), list = SEASONS[si].weather;
  let k = 0;
  for (let j = 0; j < list.length; j++) if (list[j].t <= t) k = j;
  const now = list[k];
  const prevMul = k > 0 ? list[k - 1].mul : si > 0 ? SEASONS[si - 1].weather[SEASONS[si - 1].weather.length - 1].mul : now.mul;
  const f = now.ramp ? Math.min(1, (t - now.t) / now.ramp) : 1;
  const mul = prevMul + (now.mul - prevMul) * f;
  let next: Weather | null = list[k + 1] ?? null, nextIn = next ? next.t - t : 0;
  if (!next && si + 1 < SEASONS.length) { next = SEASONS[si + 1].weather[0]; nextIn = SEASONS[si].seconds - t; }
  return { now, mul, next, nextIn };
}
export const seconds = (w: HydroWorld) => w.tick / T.tps;

// ---- building -----------------------------------------------------------------------
export function cost(w: HydroWorld, k: BuildKind): number { return Math.round(T.cost[k] * w.costMul[k] * (1 - 0.15 * w.skill.cheap)); }
/** True if `site` is free and takes `k` (its own building when omitted) and the coins are there. */
export function canBuild(w: HydroWorld, site: number, k: BuildKind = w.map.sites[site]?.build): boolean {
  const s = w.map.sites[site];
  if (!s || w.built[site] || w.phase === 'won' || w.phase === 'lost') return false;
  if (k !== s.build) return false;
  const m = T.mat[k];
  return w.coins >= cost(w, k) && w.mats.wood >= m.wood && w.mats.stone >= m.stone;
}
/** What `site` still lacks to be built (0 = enough), for the "not enough" message. */
export function lacking(w: HydroWorld, site: number): { coins: number; wood: number; stone: number } {
  const k = w.map.sites[site].build, m = T.mat[k];
  return { coins: Math.max(0, cost(w, k) - w.coins), wood: Math.max(0, m.wood - w.mats.wood), stone: Math.max(0, m.stone - w.mats.stone) };
}
/** A free site whose building you cannot pay for yet (drawn dimmed). */
export const waiting = (w: HydroWorld, site: number) => !w.built[site] && w.phase !== 'won' && w.phase !== 'lost' && !canBuild(w, site);
/** Plant row cells (the channel across the site row). */
export function plantCells(site: number, m: MapDef = MAPS[0]): number[] {
  const s = m.sites[site], out: number[] = [];
  for (let x = 0; x < W; x++) if (inChannel(x, s.y, m)) out.push(at(x, s.y));
  return out;
}

/** Build on `site` (its own building unless `k` is given). `free` skips the cost (starting wheel). */
export function placeBuilding(w: HydroWorld, site: number, k: BuildKind = w.map.sites[site].build, free = false): boolean {
  if (!free && !canBuild(w, site, k)) return false;
  const s = w.map.sites[site], g = w.g, riverX = w.map.river;
  if (!free) { w.coins -= cost(w, k); w.mats.wood -= T.mat[k].wood; w.mats.stone -= T.mat[k].stone; w.record.builds++; }
  w.built[site] = k; w.lvl[site] = 1;
  if (k === 'wheel') w.plants.push({ site, hp: 1, power: 0, drown: 0, spin: 0, sec: 0 });
  else shape(w, site);
  return true;
}
/** Cut the reservoir bowl or raise the wall for the site's current level (deeper / higher per level). */
function shape(w: HydroWorld, site: number): void {
  const s = w.map.sites[site], g = w.g, riverX = w.map.river, L = w.lvl[site] - 1;
  if (s.build === 'reservoir') {
    // a bowl beside the river, joined to it by a short cut whose floor sits a little above the bed:
    // high water spills in, and drains back out when the river falls (passive storage)
    const r = 5, z = w.map.bed(s.y) - T.upgrade.reservoirDepth * L;
    for (let y = s.y - r; y <= s.y + r; y++) for (let x = s.x - r; x <= s.x + r; x++) {
      if (x < 1 || x > W - 2 || y < 1 || y > H - 2) continue;
      const i = at(x, y), d2 = (x - s.x) ** 2 + (y - s.y) ** 2;
      if (d2 > r * r || w.channel[i] || w.village[i]) continue;
      g.h[i] = Math.min(g.h[i], z + 0.05 + 0.25 * d2 / (r * r));
    }
    for (let x = Math.min(s.x, Math.round(riverX(s.y))); x <= Math.max(s.x, Math.round(riverX(s.y))); x++) {
      for (const y of [s.y, s.y + 1]) { const i = at(x, y); if (!w.channel[i]) g.h[i] = Math.min(g.h[i], w.map.bed(s.y) + 0.2); }
    }
  } else if (s.build === 'wall') {
    const top = 0.5 + T.upgrade.wallHeight * L;
    // raise the bank on the site's side for 15 rows
    for (let y = s.y - 7; y <= s.y + 7; y++) {
      const x = Math.round(riverX(y) + s.side * 3.5);
      for (const xx of [x, x + s.side]) if (xx > 0 && xx < W - 1) g.wall[at(xx, y)] = Math.max(g.wall[at(xx, y)], top);
    }
    // tie the upstream end back to high ground (an L-shaped levee): otherwise water already on the
    // land behind the wall cannot get back to the river and is funnelled down to the village
    const y0 = Math.max(1, s.y - 8);
    for (let x = Math.round(riverX(y0 + 1) + s.side * 3.5); x > 0 && x < W - 1; x += s.side) {
      if (w.village[at(x, y0)] || w.channel[at(x, y0)]) break;
      g.wall[at(x, y0)] = Math.max(g.wall[at(x, y0)], top);
    }
  }
}
/** Materials the next level of `site` costs, or null when it is not built or already at the top level. */
export function upgradeCost(w: HydroWorld, site: number): Mats | null {
  const k = w.built[site], L = w.lvl[site];
  if (!k || L < 1 || L >= T.upgrade.maxLevel) return null;
  const c = T.upgrade.cost[k];
  return { wood: c.wood * L, stone: c.stone * L };
}
export function canUpgrade(w: HydroWorld, site: number): boolean {
  const c = upgradeCost(w, site);
  return !!c && w.phase !== 'won' && w.phase !== 'lost' && w.mats.wood >= c.wood && w.mats.stone >= c.stone;
}
/** Upgrade a building with wood and stone: wheels make more power, reservoirs get deeper, walls higher. */
export function upgrade(w: HydroWorld, site: number): boolean {
  if (!canUpgrade(w, site)) return false;
  const c = upgradeCost(w, site)!;
  w.mats.wood -= c.wood; w.mats.stone -= c.stone;
  w.lvl[site]++;
  if (w.built[site] !== 'wheel') shape(w, site);
  return true;
}
/** Tap a tree, rock, flower or bush: take what it gives; the spot stays empty until something grows back. */
export function gather(w: HydroWorld, node: number): Gain | null {
  const n = w.nodes[node];
  if (!n || !n.kind || w.phase === 'won' || w.phase === 'lost' || w.phase === 'levelup') return null;
  const y = T.gather[n.kind];
  w.mats.wood += y.wood; w.mats.stone += y.stone; w.coins += y.coins;
  n.kind = null; n.timer = T.respawnSeconds * T.tps;
  w.record.gathered++;
  return y.wood ? { cell: n.cell, amount: y.wood, what: 'wood' } : y.stone ? { cell: n.cell, amount: y.stone, what: 'stone' } : { cell: n.cell, amount: y.coins, what: 'coins' };
}
/** Fix a broken plant. */
export function repair(w: HydroWorld, site: number): boolean {
  const p = w.plants.find(q => q.site === site);
  if (!p || p.hp > 0 || w.coins < T.repairCost) return false;
  w.coins -= T.repairCost; p.hp = 1;
  return true;
}

// ---- tick ---------------------------------------------------------------------------
export function start(w: HydroWorld): void { if (w.phase === 'ready') w.phase = 'run'; }
export const xpNeed = (level: number) => Math.round(T.xpBase * T.xpGrowth ** (level - 1));
export const eta = (w: HydroWorld) => T.eta * (1 + 0.1 * w.skill.eta + w.etaBonus);
/** Village demand per second now. */
export const demand = (w: HydroWorld) => (T.demand + T.demandGrow * seconds(w)) * STAGES[w.stage].demandMul * (1 + ENDLESS.demandStep * w.extraSeasons);

/** After a clear: keep playing on this map, season after season, until the village falls. */
export function continueEndless(w: HydroWorld): boolean {
  if (w.phase !== 'won') return false;
  w.endless = true;
  addSeason(w);
  w.phase = 'run';
  return true;
}
function addSeason(w: HydroWorld): void {
  const next = SEASON_BY_NAME[NEXT_SEASON[w.seasons[w.seasons.length - 1].name]];
  w.seasons = [...w.seasons, next];
  w.totalSec += next.seconds;
}

/** Measure each plant: flow across its row (from the fluid step's own fluxes) × surface drop. */
function plantPower(w: HydroWorld): number {
  const g = w.g, { out, s } = w.sc;
  let total = 0;
  const span = w.skill.penstock ? T.penstock.span : 3;
  for (const p of w.plants) {
    const row = w.map.sites[p.site].y;
    let q = 0, depth = 0, n = 0, up = 0, dn = 0;
    for (let x = 0; x < W; x++) {
      if (!w.channel[at(x, row)]) continue;
      const i = at(x, row), j = i + W;
      q += out[i * 4 + 2] * s[i] - out[j * 4 + 3] * s[j];
      depth += g.w[i]; n++;
      const iu = at(x, Math.max(0, row - span)), id = at(x, Math.min(H - 1, row + span));
      up += g.h[iu] + g.w[iu]; dn += g.h[id] + g.w[id];
    }
    depth /= n;
    const head = Math.max(0, (up - dn) / n);
    p.drown = Math.max(0, Math.min(1, (depth - T.drownFrom) / (T.drownTo - T.drownFrom)));
    if (p.drown > 0 && p.hp > 0) p.hp = Math.max(0, p.hp - T.plantWear * p.drown / (1 + 0.5 * w.skill.tough));
    p.power = p.hp > 0 ? T.powerScale * eta(w) * (1 + T.upgrade.wheelPower * (w.lvl[p.site] - 1)) * Math.max(0, q) * head * (1 - p.drown) : 0;
    total += p.power;
  }
  // shared grid: every extra working wheel lifts them all; a wheel turns as fast as it makes power
  let working = 0;
  for (const p of w.plants) if (p.power > 0) working++;
  const boost = 1 + T.synergy * Math.max(0, working - 1);
  for (const p of w.plants) { p.power *= boost; p.sec += p.power; if (p.power > 0) p.spin += Math.min(1.2, 0.2 + p.power * 3); }
  return total * boost;
}

/** Advance one tick (only while running). */
export function tick(w: HydroWorld): void {
  if (w.phase !== 'run') return;
  const g = w.g, sec = seconds(w);
  w.events.lostHeart = null; w.events.spirit = null; w.events.seasonSurvived = null; w.events.disaster = null; w.gains.length = 0;
  const { mul, now } = weatherAt(sec, w.seasons);
  // inflow at the top of the channel
  const top: number[] = [];
  for (let x = 0; x < W; x++) if (w.channel[at(x, 0)]) top.push(at(x, 0));
  const add = T.baseInflow * STAGES[w.stage].inflowMul * mul / top.length;
  for (const i of top) g.w[i] += add;
  w.inflow += add * top.length;
  disasters(w, now);
  fluidStep(g, T.K, w.sc);
  const power = plantPower(w);
  // ice: in a freeze the river skins over (water → ice, no melting); otherwise it melts slowly,
  // faster in a drought (stored flood water comes back)
  if (now.freeze) { for (let i = 0; i < W * H; i++) if (w.channel[i] && g.w[i] > 0.02) { const f = Math.min(g.w[i] - 0.02, now.freeze); g.w[i] -= f; g.ice[i] += f; } }
  else meltIce(g, mul < 0.6 ? T.ice.droughtMelt : T.iceMelt, 1e-6);
  sluices(w, mul);
  // bottom edge drains
  for (let x = 0; x < W; x++) { const i = at(x, H - 1); const d = Math.min(g.w[i], T.outletRate); g.w[i] -= d; w.drained += d; }
  // sandbags expire
  for (const [i, t] of w.sandbags) { if (t <= 1) { g.tmp[i] = 0; w.sandbags.delete(i); } else w.sandbags.set(i, t - 1); }
  spirits(w, mul);
  // gathered spots: something grows back after a while (tree, rock, flower or berry bush)
  for (const n of w.nodes) if (!n.kind && --n.timer <= 0) {
    const wt = T.respawnWeights; let r = w.rng2.int(wt.tree + wt.rock + wt.flower + wt.bush);
    n.kind = r < wt.tree ? 'tree' : (r -= wt.tree) < wt.rock ? 'rock' : (r -= wt.rock) < wt.flower ? 'flower' : 'bush';
    n.timer = 0;
  }
  // XP and the village
  w.xp += power; w.secPower += power; w.record.power += power;
  if ((w.tick + 1) % T.tps === 0) {
    w.lastSecPower = w.secPower;
    // each working wheel earns coins, so more wheels mean more coins; numbers pop up over the wheel:
    // the power it made this second and, above that, the coins it earned
    for (const p of w.plants) {
      if (p.sec < 0.5) continue;
      const st = w.map.sites[p.site];
      w.gains.push({ cell: at(st.x, st.y), amount: Math.round(p.sec), what: 'power' });
      w.coins += T.coinPerWheel;
      w.gains.push({ cell: at(st.x, st.y - 3), amount: T.coinPerWheel, what: 'coins' });
    }
    // the village pays a little extra while it has all the power it needs
    if (w.secPower >= demand(w)) {
      w.coins += T.coinVillage; w.blackout = 0;
      w.gains.push({ cell: at((w.map.village.x0 + w.map.village.x1) >> 1, w.map.village.y0 + 2), amount: T.coinVillage, what: 'coins' });
    } else if (++w.blackout >= T.blackoutSeconds) { w.blackout = 0; loseHeart(w, 'blackout'); }
    for (const p of w.plants) p.sec = 0;
    w.secPower = 0;
  }
  // the village: flood water stays (you can see the houses standing in it) and the villagers pump
  // it out slowly (water leaves the board). Too much water costs a heart, at most one per cooldown.
  let flood = 0, entry = -1, entryW = 0;
  for (let i = 0; i < W * H; i++) {
    if (!w.village[i]) continue;
    flood += g.w[i];
    if (g.w[i] > entryW && (!w.village[i - 1] || !w.village[i + 1] || !w.village[i - W] || !w.village[i + W])) { entryW = g.w[i]; entry = i; }
  }
  if (w.floodCooldown > 0) w.floodCooldown--;
  if (flood > T.villageFloodLimit && w.floodCooldown === 0) {
    loseHeart(w, 'flood');
    w.floodCooldown = T.floodCooldownSeconds * T.tps;
    w.floodFrom = entry;
  }
  for (let i = 0; i < W * H; i++) if (w.village[i] && g.w[i] > 0) { const d = Math.min(g.w[i], T.villagePump); g.w[i] -= d; w.drained += d; }
  w.tick++;
  if (w.hearts <= 0) { w.phase = 'lost'; return; }
  if (seconds(w) >= w.totalSec) {
    if (!w.endless) { w.phase = 'won'; return; }
    // endless: the year goes on; each season survived makes the village hungrier
    const done = w.seasons[w.seasons.length - 1].name;
    addSeason(w);
    w.extraSeasons++;
    w.events.seasonSurvived = done;
  }
  if (w.xp >= xpNeed(w.level)) levelUp(w);
}
/** Disasters other than plain high water: storm rain, ice jam and outburst, landslide. */
function disasters(w: HydroWorld, now: Weather): void {
  const g = w.g, m = w.map, key = `${seasonAt(seconds(w), w.seasons).si}:${now.t}`;
  if (key !== w.wxKey) {
    w.wxKey = key;
    if (now.kind === 'jam') {
      w.jamTicks = T.jam.seconds * T.tps;
      w.events.disaster = { kind: 'jam', cells: rowCells(w, m.jamRow, T.jam.rows) };
    } else if (now.kind === 'slide') {
      // earth slides into the river: the bed is blocked until the water wears it away
      const cells = rowCells(w, m.slideRow, T.slide.rows);
      for (const i of cells) { g.tmp[i] = Math.max(g.tmp[i], T.slide.height); w.sandbags.set(i, T.slide.seconds * T.tps); }
      w.events.disaster = { kind: 'slide', cells };
    }
  }
  if (now.kind === 'storm') {
    // the storm rains on the whole valley, not only upstream
    const per = T.storm.rainPerTick / (W * H);
    for (let i = 0; i < W * H; i++) g.w[i] += per;
    w.inflow += T.storm.rainPerTick;
  }
  if (w.jamTicks > 0) {
    // drifting ice packs into a dam (water → ice, nothing lost); when it gives way it all comes at once
    freezeCells(g, rowCells(w, m.jamRow, T.jam.rows), T.jam.frac);
    if (--w.jamTicks === 0) {
      const cells: number[] = [];
      for (let y = m.jamRow - 1; y <= m.jamRow + T.jam.rows; y++) for (let x = 0; x < W; x++) { const i = at(x, y); if (g.ice[i] > 0) { g.w[i] += g.ice[i]; g.ice[i] = 0; cells.push(i); } }
      w.events.disaster = { kind: 'burst', cells };
    }
  }
}
function rowCells(w: HydroWorld, row: number, rows: number): number[] {
  const out: number[] = [];
  for (let y = row; y < row + rows; y++) for (let x = 0; x < W; x++) if (w.channel[at(x, y)]) out.push(at(x, y));
  return out;
}
function loseHeart(w: HydroWorld, why: 'blackout' | 'flood') {
  w.hearts--; w.events.lostHeart = why;
  if (why === 'flood') w.record.floodHearts++; else w.record.blackoutHearts++;
}

// ---- spirits (auto skills) -----------------------------------------------------------
function spirits(w: HydroWorld, mul: number): void {
  const g = w.g, VILLAGE = w.map.village, riverX = w.map.river;
  if (w.skill.sand > 0 && --w.spiritTimer.sand <= 0) {
    const L = w.skill.sand - 1;
    w.spiritTimer.sand = T.sand.every[L] * T.tps;
    // the most dangerous overflow: water outside the channel, weighted towards the village.
    // Water held in a reservoir is not overflow, and its cut to the river must stay open.
    const keep = reservoirZone(w);
    let best = -1, bi = -1;
    for (let i = 0; i < W * H; i++) {
      if (w.channel[i] || w.village[i] || g.w[i] < 0.03 || keep.has(i)) continue;
      const y = (i / W) | 0, x = i % W;
      const near = 1 / (1 + Math.hypot(x - (VILLAGE.x0 + VILLAGE.x1) / 2, y - VILLAGE.y0) / 10);
      const v = g.w[i] * (0.3 + near);
      if (v > best) { best = v; bi = i; }
    }
    if (bi >= 0) {
      const y0 = (bi / W) | 0, side = (bi % W) > riverX(y0) ? 1 : -1, cells: number[] = [];
      for (let k = 0; k < T.sand.cells[L]; k++) {
        const y = y0 - (T.sand.cells[L] >> 1) + k;
        if (y < 1 || y >= H - 1) continue;
        const i = at(Math.round(riverX(y) + side * 3.5), y);
        if (keep.has(i)) continue;
        g.tmp[i] = Math.max(g.tmp[i], T.sand.height); w.sandbags.set(i, T.sand.seconds * T.tps); cells.push(i);
      }
      w.events.spirit = { kind: 'sand', cells };
    } else w.spiritTimer.sand = T.tps; // nothing to do: look again in a second
  }
  if (w.skill.ice > 0 && --w.spiritTimer.ice <= 0) {
    const L = w.skill.ice - 1;
    if (mul >= 1.4) {
      w.spiritTimer.ice = T.ice.every[L] * T.tps;
      // freeze the deepest water in the upper river: an ice store that melts back in a drought
      const cand: number[] = [];
      for (let i = 0; i < (H >> 1) * W; i++) if (w.channel[i] && g.w[i] > 0.2) cand.push(i);
      cand.sort((a, b) => g.w[b] - g.w[a] || a - b);
      const cells = cand.slice(0, T.ice.cells[L]);
      freezeCells(g, cells, T.ice.frac[L]);
      w.events.spirit = { kind: 'ice', cells };
    } else w.spiritTimer.ice = T.tps;
  }
  if (w.skill.rain > 0 && --w.spiritTimer.rain <= 0) {
    const L = w.skill.rain - 1;
    if (mul < 0.6) {
      // rain from the sky over the upper river (new water: it counts as inflow)
      w.spiritTimer.rain = T.rain.every[L] * T.tps;
      const cells: number[] = [];
      for (let i = 0; i < 30 * W; i++) if (w.channel[i]) cells.push(i);
      const per = T.rain.amount[L] / cells.length;
      for (const i of cells) g.w[i] += per;
      w.inflow += T.rain.amount[L];
      w.events.spirit = { kind: 'rain', cells: cells.filter((_, k) => k % 3 === 0) };
    } else w.spiritTimer.rain = T.tps;
  }
  if (w.skill.sun > 0 && --w.spiritTimer.sun <= 0) {
    const L = w.skill.sun - 1;
    if (mul >= 1.4) {
      // evaporate flood water off the river (vapour leaves the board), deepest first
      w.spiritTimer.sun = T.sun.every[L] * T.tps;
      const cand: number[] = [];
      for (let i = 0; i < W * H; i++) if (!w.channel[i] && g.w[i] > 0.01) cand.push(i);
      cand.sort((a, b) => g.w[b] - g.w[a] || a - b);
      let left = T.sun.amount[L];
      const cells: number[] = [];
      for (const i of cand) { if (left <= 0) break; const d = Math.min(g.w[i], left, 0.3); g.w[i] -= d; w.drained += d; left -= d; cells.push(i); }
      w.events.spirit = { kind: 'sun', cells };
    } else w.spiritTimer.sun = T.tps;
  }
}
/** Water cells of every reservoir bowl (radius 5 around built reservoir sites, off the river and village). */
export function reservoirCells(w: HydroWorld): number[] {
  const out: number[] = [];
  w.map.sites.forEach((s, id) => { if (w.built[id] === 'reservoir') out.push(...siteBowl(w, s)); });
  return out;
}
/**
 * Automatic sluices (docs/REDESIGN_V4_HYDRO.md §4): in a drought, or while the village is short of power,
 * the gates open and each bowl drains by gravity into the river a few rows downstream, where the bed is lower.
 * Water only moves (bowl → river); nothing is created or lost.
 */
function sluices(w: HydroWorld, mul: number): void {
  const g = w.g, S = T.sluice;
  w.sluiceOpen.length = 0;
  const short = w.tick > T.tps && w.lastSecPower < demand(w);
  if (mul >= S.droughtMul && !short) return;
  w.map.sites.forEach((s, id) => {
    if (w.built[id] !== 'reservoir') return;
    const oy = Math.min(H - 2, s.y + S.rowsDown), out: number[] = [];
    for (let x = 0; x < W; x++) if (w.channel[at(x, oy)]) out.push(at(x, oy));
    const bowl = siteBowl(w, s).filter(i => g.w[i] > 0.005);
    if (!bowl.length || !out.length) return;
    let have = 0, head = 0, outHead = 0;
    for (const i of bowl) { have += g.w[i]; head += g.h[i] + g.w[i]; }
    for (const i of out) outHead += g.h[i] + g.w[i];
    head /= bowl.length; outHead /= out.length;
    const q = Math.min(S.max, have, S.k * Math.max(0, head - outHead));
    if (q <= 1e-9) return;
    for (const i of bowl) g.w[i] -= q * (g.w[i] / have);
    for (const i of out) g.w[i] += q / out.length;
    w.sluiceOpen.push(id);
  });
}
function siteBowl(w: HydroWorld, s: Site): number[] {
  const out: number[] = [];
  for (let y = s.y - 5; y <= s.y + 5; y++) for (let x = s.x - 5; x <= s.x + 5; x++) {
    if (x < 1 || x > W - 2 || y < 1 || y > H - 2 || (x - s.x) ** 2 + (y - s.y) ** 2 > 25) continue;
    const i = at(x, y); if (!w.channel[i] && !w.village[i]) out.push(i);
  }
  return out;
}
/** Every reservoir's bowl plus the cut that joins it to the river (cells the sand spirit leaves alone). */
export function reservoirZone(w: HydroWorld): Set<number> {
  const out = new Set(reservoirCells(w));
  w.map.sites.forEach((s, id) => {
    if (w.built[id] !== 'reservoir') return;
    const rx = Math.round(w.map.river(s.y));
    for (let x = Math.min(s.x, rx) - 1; x <= Math.max(s.x, rx) + 1; x++) for (const y of [s.y - 1, s.y, s.y + 1, s.y + 2]) {
      const i = at(x, y); if (x > 0 && x < W - 1 && !w.channel[i]) out.add(i);
    }
  });
  return out;
}
function startSpirit(w: HydroWorld, c: CardId): void {
  if (c === 'sand' || c === 'ice' || c === 'rain' || c === 'sun') w.spiritTimer[c] = T.tps;
}

// ---- level up -----------------------------------------------------------------------
export const CARD_MAX: Record<CardId, number> = { sand: 5, ice: 5, eta: 5, tough: 3, coins: 99, cheap: 3, rain: 5, sun: 5, penstock: 1 };
/** Evolution (survivors-style): 좋은 터빈 ★5 + 3 wheels → 도수관. */
export const canEvolvePenstock = (w: HydroWorld) => w.skill.eta >= CARD_MAX.eta && w.skill.penstock === 0 && w.plants.length >= 3;
/** Bonus skills (rain, sun) only join the level-up pool once a stage clear unlocked them. */
const BONUS: CardId[] = ['rain', 'sun'];
function cardLevel(w: HydroWorld, c: CardId): number { return c === 'coins' ? 0 : w.skill[c]; }
function levelUp(w: HydroWorld): void {
  w.xp -= xpNeed(w.level);
  w.level++;
  const pool = (Object.keys(CARD_MAX) as CardId[]).filter(c => c !== 'penstock' && cardLevel(w, c) < CARD_MAX[c] && (!BONUS.includes(c) || w.unlocked.includes(c)));
  const pick: CardId[] = [];
  // an evolution, once its conditions are met, is always on offer (first card)
  if (canEvolvePenstock(w)) pick.push('penstock');
  // the first level always offers the spirits you do not have yet, so a new player meets them early
  if (w.level === 2) for (const c of ['sand', 'ice'] as CardId[]) if (pool.includes(c) && pick.length < 2) pick.push(c);
  while (pick.length < 3 && pick.length < pool.length + (pick.includes('penstock') ? 1 : 0)) {
    const c = pool[w.rng.int(pool.length)];
    if (!pick.includes(c)) pick.push(c);
  }
  w.cards = pick;
  w.phase = 'levelup';
}
export function chooseCard(w: HydroWorld, c: CardId): boolean {
  if (w.phase !== 'levelup' || !w.cards.includes(c)) return false;
  if (c === 'coins') w.coins += 60; else w.skill[c]++;
  w.cards = [];
  w.phase = 'run';
  startSpirit(w, c);
  return true;
}

// ---- checks & look-ahead -----------------------------------------------------------
/** inflow − drained − (water + ice); 0 up to rounding. */
export function balance(w: HydroWorld): number {
  let s = 0;
  for (let i = 0; i < W * H; i++) s += w.g.w[i] + w.g.ice[i];
  return w.inflow - w.drained - s;
}
export function cloneHydro(w: HydroWorld): HydroWorld {
  return {
    ...w, g: cloneGrid(w.g), sc: createFluidScratch(W * H), rng: createRng(w.rng.state()),
    built: w.built.slice(), plants: w.plants.map(p => ({ ...p })), skill: { ...w.skill }, spiritTimer: { ...w.spiritTimer },
    record: { ...w.record }, unlocked: w.unlocked.slice(), costMul: { ...w.costMul },
    nodes: w.nodes.map(n => ({ ...n })), mats: { ...w.mats }, lvl: w.lvl.slice(), rng2: createRng(w.rng2.state()), gains: [], sluiceOpen: [],
    sandbags: new Map(w.sandbags), cards: w.cards.slice(), events: { lostHeart: null, spirit: null, seasonSurvived: null, disaster: null }, seasons: w.seasons.slice(),
  };
}
/** Run a copy ahead (level-ups are skipped) and report what happened. */
function lookAhead(w: HydroWorld, ticks: number): { power: number; hearts: number; flood: number } {
  const c = cloneHydro(w);
  if (c.phase === 'ready') c.phase = 'run';
  let power = 0, flood = 0;
  for (let k = 0; k < ticks && c.phase === 'run'; k++) {
    const xp = c.xp; tick(c); if ((c.phase as Phase) === 'levelup') c.phase = 'run';
    power += Math.max(0, c.xp - xp);
    for (let i = 0; i < W * H; i++) if (c.village[i]) flood += c.g.w[i];
  }
  return { power, hearts: c.hearts, flood };
}
/** Recommended site for `k`: wheels where they make the most power, the rest where they spare the village most. */
export function recommend(w: HydroWorld, k: BuildKind, ticks: number = T.horizon): number | null {
  let best: number | null = null, score = -Infinity;
  for (const s of w.map.sites) {
    if (w.built[s.id] || s.build !== k) continue;
    const c = cloneHydro(w);
    c.coins = 1e9; c.mats = { wood: 1e9, stone: 1e9 };
    placeBuilding(c, s.id, k);
    const r = lookAhead(c, ticks);
    const v = k === 'wheel' ? r.power : -r.flood * 10 + r.power * 0.1 + r.hearts * 100;
    if (v > score + 1e-9) { score = v; best = s.id; }
  }
  return best;
}

/**
 * The star on the map: among the sites you can pay for now, the one that helps most over the next
 * `ticks`, compared with building nothing. Hearts saved count most, then village flood avoided,
 * then power. One rollout per step (`yield`) so a screen can spread the work over frames.
 * Returns null when nothing affordable helps.
 */
export function* recommendSteps(w: HydroWorld, ticks: number = T.horizon): Generator<void, number | null> {
  const base = lookAhead(w, ticks);
  yield;
  let best: number | null = null, score = 0;
  for (const s of w.map.sites) {
    if (!canBuild(w, s.id)) continue;
    const c = cloneHydro(w);
    placeBuilding(c, s.id);
    const r = lookAhead(c, ticks);
    const v = (r.hearts - base.hearts) * 1000 + (base.flood - r.flood) * 10 + (r.power - base.power);
    if (v > score + 1e-9) { score = v; best = s.id; }
    yield;
  }
  return best;
}
export function recommendAny(w: HydroWorld, ticks: number = T.horizon): number | null {
  const it = recommendSteps(w, ticks);
  for (;;) { const r = it.next(); if (r.done) return r.value; }
}
