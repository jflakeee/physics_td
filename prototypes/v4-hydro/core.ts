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

// ---- map: 작은 계곡 ----------------------------------------------------------------
/** River centre line. */
export const riverX = (y: number) => 30 + 9 * Math.sin(y / 15);
/** Valley floor (river bed) height: gentle with two rapids. */
export function bed(y: number): number {
  let z = 7 - 0.05 * y;
  z -= 0.1 * Math.max(0, Math.min(y, 32) - 22); // rapid 1: rows 22–32
  z -= 0.1 * Math.max(0, Math.min(y, 64) - 56); // rapid 2: rows 56–64
  return z;
}
export const BANK = 0.7;
export const VILLAGE = { x0: 36, x1: 52, y0: 78, y1: 92 } as const;
export const inChannel = (x: number, y: number) => Math.abs(x - riverX(y)) <= 2.5;
export const inVillage = (x: number, y: number) => x >= VILLAGE.x0 && x <= VILLAGE.x1 && y >= VILLAGE.y0 && y <= VILLAGE.y1;

export type SiteKind = 'river' | 'bank';
export type BuildKind = 'wheel' | 'reservoir' | 'wall';
/**
 * Build spots. Each spot has one building, so a tap is enough (no build menu): river spots take a
 * water wheel, bank spots by a bend take a reservoir, bank spots by the village or a wheel take a wall.
 */
export interface Site { id: number; kind: SiteKind; build: BuildKind; x: number; y: number; side: -1 | 1 }
export const SITES: readonly Site[] = (() => {
  const s: Site[] = [];
  for (const y of [10, 27, 40, 60, 72, 86]) s.push({ id: s.length, kind: 'river', build: 'wheel', x: Math.round(riverX(y)), y, side: 1 });
  for (const [y, side, build] of [[18, -1, 'reservoir'], [46, -1, 'reservoir'], [66, 1, 'reservoir'], [80, 1, 'wall'], [90, 1, 'wall'], [33, 1, 'wall']] as const) {
    s.push({ id: s.length, kind: 'bank', build, x: Math.round(riverX(y) + side * 8), y, side });
  }
  return s;
})();
export interface Plant { site: number; hp: number; power: number; drown: number; spin: number }
export type Phase = 'ready' | 'run' | 'levelup' | 'won' | 'lost';

export interface HydroWorld {
  g: SimGrid; sc: FluidScratch; rng: Rng;
  channel: Uint8Array; village: Uint8Array;
  built: (BuildKind | null)[]; plants: Plant[];
  tick: number; phase: Phase;
  xp: number; level: number; coins: number; hearts: number;
  /** Power made during the current second, and the last full second. */
  secPower: number; lastSecPower: number; blackout: number;
  inflow: number; drained: number;
  skill: { sand: number; ice: number; eta: number; tough: number; cheap: number; rain: number; sun: number };
  spiritTimer: { sand: number; ice: number; rain: number; sun: number };
  /** Stage index into STAGES, its seasons and length, the character and the bonuses brought in. */
  stage: number; seasons: Season[]; totalSec: number; char: CharId;
  etaBonus: number; costMul: Record<BuildKind, number>;
  /** Bonus skills unlocked by clearing stages: they join the level-up pool. */
  unlocked: CardId[];
  /** Run record for the stats screen. */
  record: { builds: number; floodHearts: number; blackoutHearts: number; power: number };
  /** Endless play after a clear: extra seasons survived (0 = not endless). */
  endless: boolean; extraSeasons: number;
  /** Power already paid out in gems (a cleared run is booked before it goes on). */
  bookedPower: number; bookedTicks: number;
  /** How this run was created (to rebuild it when a saved run is continued). */
  origin: { seed: number; opt: RunOptions };
  /** Temporary sandbag cells and their remaining ticks. */
  sandbags: Map<number, number>;
  cards: CardId[];
  events: { lostHeart: 'blackout' | 'flood' | null; spirit: { kind: 'sand' | 'ice' | 'rain' | 'sun'; cells: number[] } | null; seasonSurvived: string | null };
  /** Ticks before the next flood heart can be lost. */
  floodCooldown: number;
  /** Village edge cell where the last flood came in (−1 = none), for the arrow on screen. */
  floodFrom: number;
}

/** What a run brings in from the main menu: stage, character, power-up ranks, unlocked bonus skills. */
export interface RunOptions { stage?: number; char?: CharId; powerups?: Partial<Record<PowerupId, number>>; unlocked?: CardId[] }

/** New game. One wheel is already turning at the first rapid. */
export function createHydro(seed = 1, opt: RunOptions = {}): HydroWorld {
  const stage = Math.max(0, Math.min(STAGES.length - 1, opt.stage ?? 0)), st = STAGES[stage];
  const ch = CHARS.find(c => c.id === (opt.char ?? 'miller')) ?? CHARS[0], pu = opt.powerups ?? {};
  const builder = 1 - 0.05 * (pu.builder ?? 0);
  const g = createGrid(W, H);
  const channel = new Uint8Array(W * H), village = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = at(x, y), z = bed(y), d = Math.abs(x - riverX(y));
    if (inChannel(x, y)) { channel[i] = 1; g.h[i] = z; }
    else if (inVillage(x, y)) { village[i] = 1; g.h[i] = z + BANK - 0.15; }
    else g.h[i] = z + BANK + 0.012 * (d - 2.5);
  }
  const w: HydroWorld = {
    g, sc: createFluidScratch(W * H), rng: createRng(seedState(seed, 4)), channel, village,
    built: SITES.map(() => null), plants: [], tick: 0, phase: 'ready',
    xp: 0, level: 1, coins: T.startCoins + 20 * (pu.purse ?? 0), hearts: T.hearts + (pu.heart ?? 0),
    secPower: 0, lastSecPower: 0, blackout: 0, inflow: 0, drained: 0,
    skill: { sand: 0, ice: 0, eta: 0, tough: 0, cheap: 0, rain: 0, sun: 0 }, spiritTimer: { sand: 0, ice: 0, rain: 0, sun: 0 },
    sandbags: new Map(), cards: [], events: { lostHeart: null, spirit: null, seasonSurvived: null }, floodCooldown: 0, floodFrom: -1,
    endless: false, extraSeasons: 0, bookedPower: 0, bookedTicks: 0,
    stage, seasons: st.seasons, totalSec: st.seasons.reduce((a, x) => a + x.seconds, 0), char: ch.id,
    etaBonus: ch.eta + 0.05 * (pu.turbine ?? 0),
    costMul: { wheel: ch.costMul.wheel * builder, reservoir: ch.costMul.reservoir * builder, wall: ch.costMul.wall * builder },
    unlocked: [...(opt.unlocked ?? [])], record: { builds: 0, floodHearts: 0, blackoutHearts: 0, power: 0 },
    origin: { seed, opt: { ...opt, powerups: { ...(opt.powerups ?? {}) }, unlocked: [...(opt.unlocked ?? [])] } },
  };
  if (ch.startSkill && ch.startSkill !== 'coins') { w.skill[ch.startSkill] = 1; startSpirit(w, ch.startSkill); }
  // start with a little water in the river so the first wheel turns at once
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (channel[at(x, y)]) g.w[at(x, y)] = 0.25;
  for (let i = 0; i < W * H; i++) w.inflow += g.w[i];
  placeBuilding(w, 1, 'wheel', true);
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
export function canBuild(w: HydroWorld, site: number, k: BuildKind = SITES[site]?.build): boolean {
  const s = SITES[site];
  if (!s || w.built[site] || w.phase === 'won' || w.phase === 'lost') return false;
  if (k !== s.build) return false;
  return w.coins >= cost(w, k);
}
/** A free site whose building you cannot pay for yet (drawn dimmed). */
export const waiting = (w: HydroWorld, site: number) => !w.built[site] && w.phase !== 'won' && w.phase !== 'lost' && w.coins < cost(w, SITES[site].build);
/** Plant row cells (the channel across the site row). */
export function plantCells(site: number): number[] {
  const s = SITES[site], out: number[] = [];
  for (let x = 0; x < W; x++) if (inChannel(x, s.y)) out.push(at(x, s.y));
  return out;
}

/** Build on `site` (its own building unless `k` is given). `free` skips the cost (starting wheel). */
export function placeBuilding(w: HydroWorld, site: number, k: BuildKind = SITES[site].build, free = false): boolean {
  if (!free && !canBuild(w, site, k)) return false;
  const s = SITES[site], g = w.g;
  if (!free) { w.coins -= cost(w, k); w.record.builds++; }
  w.built[site] = k;
  if (k === 'wheel') w.plants.push({ site, hp: 1, power: 0, drown: 0, spin: 0 });
  else if (k === 'reservoir') {
    // a bowl beside the river, joined to it by a short cut whose floor sits a little above the bed:
    // high water spills in, and drains back out when the river falls (passive storage)
    const r = 5, z = bed(s.y);
    for (let y = s.y - r; y <= s.y + r; y++) for (let x = s.x - r; x <= s.x + r; x++) {
      if (x < 1 || x > W - 2 || y < 1 || y > H - 2) continue;
      const i = at(x, y), d2 = (x - s.x) ** 2 + (y - s.y) ** 2;
      if (d2 > r * r || w.channel[i] || w.village[i]) continue;
      g.h[i] = Math.min(g.h[i], z + 0.05 + 0.25 * d2 / (r * r));
    }
    for (let x = Math.min(s.x, Math.round(riverX(s.y))); x <= Math.max(s.x, Math.round(riverX(s.y))); x++) {
      for (const y of [s.y, s.y + 1]) { const i = at(x, y); if (!w.channel[i]) g.h[i] = Math.min(g.h[i], z + 0.2); }
    }
  } else {
    // raise the bank on the site's side for 15 rows
    for (let y = s.y - 7; y <= s.y + 7; y++) {
      const x = Math.round(riverX(y) + s.side * 3.5);
      for (const xx of [x, x + s.side]) if (xx > 0 && xx < W - 1) g.wall[at(xx, y)] = Math.max(g.wall[at(xx, y)], 0.5);
    }
  }
  return true;
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
  for (const p of w.plants) {
    const row = SITES[p.site].y;
    let q = 0, depth = 0, n = 0, up = 0, dn = 0;
    for (let x = 0; x < W; x++) {
      if (!inChannel(x, row)) continue;
      const i = at(x, row), j = i + W;
      q += out[i * 4 + 2] * s[i] - out[j * 4 + 3] * s[j];
      depth += g.w[i]; n++;
      const iu = at(x, row - 3), id = at(x, row + 3);
      up += g.h[iu] + g.w[iu]; dn += g.h[id] + g.w[id];
    }
    depth /= n;
    const head = Math.max(0, (up - dn) / n);
    p.drown = Math.max(0, Math.min(1, (depth - T.drownFrom) / (T.drownTo - T.drownFrom)));
    if (p.drown > 0 && p.hp > 0) p.hp = Math.max(0, p.hp - T.plantWear * p.drown / (1 + 0.5 * w.skill.tough));
    p.power = p.hp > 0 ? T.powerScale * eta(w) * Math.max(0, q) * head * (1 - p.drown) : 0;
    p.spin += p.power * 0.05;
    total += p.power;
  }
  return total;
}

/** Advance one tick (only while running). */
export function tick(w: HydroWorld): void {
  if (w.phase !== 'run') return;
  const g = w.g, sec = seconds(w);
  w.events.lostHeart = null; w.events.spirit = null; w.events.seasonSurvived = null;
  const { mul, now } = weatherAt(sec, w.seasons);
  // inflow at the top of the channel
  const top: number[] = [];
  for (let x = 0; x < W; x++) if (w.channel[at(x, 0)]) top.push(at(x, 0));
  const add = T.baseInflow * mul / top.length;
  for (const i of top) g.w[i] += add;
  w.inflow += add * top.length;
  fluidStep(g, T.K, w.sc);
  const power = plantPower(w);
  // ice: in a freeze the river skins over (water → ice, no melting); otherwise it melts slowly,
  // faster in a drought (stored flood water comes back)
  if (now.freeze) { for (let i = 0; i < W * H; i++) if (w.channel[i] && g.w[i] > 0.02) { const f = Math.min(g.w[i] - 0.02, now.freeze); g.w[i] -= f; g.ice[i] += f; } }
  else meltIce(g, mul < 0.6 ? T.ice.droughtMelt : T.iceMelt, 1e-6);
  // bottom edge drains
  for (let x = 0; x < W; x++) { const i = at(x, H - 1); const d = Math.min(g.w[i], T.outletRate); g.w[i] -= d; w.drained += d; }
  // sandbags expire
  for (const [i, t] of w.sandbags) { if (t <= 1) { g.tmp[i] = 0; w.sandbags.delete(i); } else w.sandbags.set(i, t - 1); }
  spirits(w, mul);
  // XP and the village
  w.xp += power; w.secPower += power; w.record.power += power;
  if ((w.tick + 1) % T.tps === 0) {
    w.lastSecPower = w.secPower;
    if (w.secPower >= demand(w)) { w.coins += T.coinPerSec; w.blackout = 0; }
    else if (++w.blackout >= T.blackoutSeconds) { w.blackout = 0; loseHeart(w, 'blackout'); }
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
function loseHeart(w: HydroWorld, why: 'blackout' | 'flood') {
  w.hearts--; w.events.lostHeart = why;
  if (why === 'flood') w.record.floodHearts++; else w.record.blackoutHearts++;
}

// ---- spirits (auto skills) -----------------------------------------------------------
function spirits(w: HydroWorld, mul: number): void {
  const g = w.g;
  if (w.skill.sand > 0 && --w.spiritTimer.sand <= 0) {
    const L = w.skill.sand - 1;
    w.spiritTimer.sand = T.sand.every[L] * T.tps;
    // the most dangerous overflow: water outside the channel, weighted towards the village
    let best = -1, bi = -1;
    for (let i = 0; i < W * H; i++) {
      if (w.channel[i] || w.village[i] || g.w[i] < 0.03) continue;
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
function startSpirit(w: HydroWorld, c: CardId): void {
  if (c === 'sand' || c === 'ice' || c === 'rain' || c === 'sun') w.spiritTimer[c] = T.tps;
}

// ---- level up -----------------------------------------------------------------------
export const CARD_MAX: Record<CardId, number> = { sand: 5, ice: 5, eta: 5, tough: 3, coins: 99, cheap: 3, rain: 5, sun: 5 };
/** Bonus skills (rain, sun) only join the level-up pool once a stage clear unlocked them. */
const BONUS: CardId[] = ['rain', 'sun'];
function cardLevel(w: HydroWorld, c: CardId): number { return c === 'coins' ? 0 : w.skill[c]; }
function levelUp(w: HydroWorld): void {
  w.xp -= xpNeed(w.level);
  w.level++;
  const pool = (Object.keys(CARD_MAX) as CardId[]).filter(c => cardLevel(w, c) < CARD_MAX[c] && (!BONUS.includes(c) || w.unlocked.includes(c)));
  const pick: CardId[] = [];
  // the first level always offers the spirits you do not have yet, so a new player meets them early
  if (w.level === 2) for (const c of ['sand', 'ice'] as CardId[]) if (pool.includes(c) && pick.length < 2) pick.push(c);
  while (pick.length < 3 && pick.length < pool.length) {
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
    sandbags: new Map(w.sandbags), cards: w.cards.slice(), events: { lostHeart: null, spirit: null, seasonSurvived: null }, seasons: w.seasons.slice(),
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
  for (const s of SITES) {
    if (w.built[s.id] || s.build !== k) continue;
    const c = cloneHydro(w);
    c.coins = 1e9;
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
  for (const s of SITES) {
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
