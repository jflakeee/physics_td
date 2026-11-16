/**
 * Fixed-placement balance bots (docs/GAME_DESIGN_V2.md 25-26.2, docs/DETAILED_DESIGN_V2.md 21;
 * reference: prototypes/v2-calibrate.mjs). Levees are placed in prep only (fixed placement);
 * pumps, gates and freezing act in prep and every 10 wave ticks, through the same run-machine calls the player uses (cash, cooldowns, pump cap).
 * Single-means strategies must lose; mixed strategies must clear.
 */
import type { Run } from '../src/game/machine.ts';
import { runSkill, runToggleGate, runTogglePump } from '../src/game/machine.ts';
import { zoneType } from '../src/input/hit.ts';
import { TILES_X, TILES_Y, ZONE } from '../src/sim/constants.ts';
import { waveSeconds } from '../src/sim/waves.ts';
import { resolveSkill } from '../src/rules/skills.ts';
import { meltingIceLine } from '../src/rules/effects.ts';
import type { BuildLeveeOp } from '../src/rules/effects.ts';

/** A bot: `act` is called once per prep phase and every 10 ticks of a wave. */
export interface Strategy {
  name: string;
  /** true = mixed means (must clear), false = single means (must lose). */
  mixed: boolean;
  act(run: Run): void;
}

/** Zones grouped by ring distance from the base zone (tile adjacency BFS): [ring1, ring2, ...]. */
export function zoneRings(run: Run): number[][] {
  const { tileZone, count } = run.state.zones;
  const baseZone = run.state.grid.zoneId[run.state.base[4]];
  const adj: Set<number>[] = Array.from({ length: count }, () => new Set());
  for (let ty = 0; ty < TILES_Y; ty++) {
    for (let tx = 0; tx < TILES_X; tx++) {
      const a = tileZone[ty * TILES_X + tx];
      for (const [nx, ny] of [[tx + 1, ty], [tx, ty + 1]]) {
        if (nx >= TILES_X || ny >= TILES_Y) continue;
        const b = tileZone[ny * TILES_X + nx];
        if (a >= 0 && b >= 0 && a !== b) {
          adj[a].add(b);
          adj[b].add(a);
        }
      }
    }
  }
  const dist = new Array<number>(count).fill(-1);
  dist[baseZone] = 0;
  const queue = [baseZone];
  for (let q = 0; q < queue.length; q++) for (const n of adj[queue[q]]) if (dist[n] < 0) queue.push(n), (dist[n] = dist[queue[q]] + 1);
  const rings: number[][] = [];
  dist.forEach((d, z) => {
    if (d > 0) (rings[d - 1] ??= []).push(z);
  });
  return rings;
}

/**
 * Cast build-levee round-robin over the zones (all lines first, then top-ups) while the
 * cash stays above the upkeep reserve of `pumpsKept` pumps for the next wave.
 */
function levees(run: Run, zones: readonly number[], pumpsKept = 0): void {
  const cost = resolveSkill(run.rt, 'build-levee').cost;
  const reserve = pumpsKept * (run.rt.data.skills.get('pump')?.pump?.costPerSec ?? 0) * waveSeconds(run.wave + 1);
  for (let any = true; any; ) {
    any = false;
    for (const z of zones) if (run.cash - cost >= reserve && runSkill(run, 'build-levee', { zone: z }).ok) any = true;
  }
}

/** Water depth at a pump spot above which the bot runs it (below it the pump would mostly burn cash). */
const PUMP_WET = 0.01;

/** Run the first `n` pump spots while their cell is wet, stop them while dry. */
function pumps(run: Run, n: number): void {
  for (let k = 0; k < run.state.pumps.length && k < n; k++) {
    const p = run.state.pumps[k];
    if (p.on !== run.state.grid.w[p.cell] >= PUMP_WET) runTogglePump(run, k);
  }
}

/** Close every gate once. */
function gates(run: Run): void {
  run.state.gates.forEach((g, k) => g.open && runToggleGate(run, k));
}

/** Freeze the wettest ring-1 zone whenever the cooldown allows. */
function freeze(run: Run): void {
  let best = -1;
  let most = 0;
  for (const z of zoneRings(run)[0]) {
    if (zoneType(run.state, z) === ZONE.base) continue;
    let s = 0;
    for (const c of run.state.zones.cells[z]) s += run.state.grid.w[c];
    if (s > most) (most = s), (best = z);
  }
  if (best >= 0) runSkill(run, 'freeze', { zone: best });
}

const inWave = (run: Run): boolean => run.phase === 'wave';

/**
 * Ice-dam maps: re-freeze the thinnest melting ice line among the zones (one cast per call),
 * keeping the upkeep reserve of `pumpsKept` pumps. No-op for wall levees.
 */
function refreeze(run: Run, zones: readonly number[], pumpsKept: number): void {
  const def = resolveSkill(run.rt, 'build-levee');
  const op = def.ranks[(run.rt.owned.get(def.id) ?? 1) - 1].ops.find((o): o is BuildLeveeOp => o.op === 'buildLevee');
  if (!op || op.material !== 'ice') return;
  const reserve = pumpsKept * (run.rt.data.skills.get('pump')?.pump?.costPerSec ?? 0) * 10;
  let zone = -1;
  let worst = Infinity;
  for (const z of zones) {
    const line = meltingIceLine(run.state, run.rt.env, run.state.zones.lines[z], op.refreezeBelow);
    if (!line) continue;
    const r = line.cells.reduce((m, c) => Math.min(m, run.state.grid.ice[c] / (run.rt.env.iceBuilt.get(c) ?? 1)), Infinity);
    if (r < worst) (worst = r), (zone = z);
  }
  if (zone >= 0 && run.cash - def.cost >= reserve) runSkill(run, 'build-levee', { zone });
}

/** The 7 strategies. */
export const STRATEGIES: readonly Strategy[] = [
  { name: 'idle', mixed: false, act: () => {} },
  { name: 'pumpsOnly', mixed: false, act: (r) => inWave(r) && pumps(r, r.state.maxPumpsOn) },
  { name: 'leveesOnly', mixed: false, act: (r) => !inWave(r) && levees(r, zoneRings(r).slice(0, 2).flat()) },
  { name: 'gatesOnly', mixed: false, act: (r) => gates(r) },
  { name: 'iceOnly', mixed: false, act: (r) => freeze(r) },
  {
    name: 'leveePump', mixed: true,
    act: (r) => {
      if (inWave(r)) {
        pumps(r, 1);
        refreeze(r, zoneRings(r)[0], 1);
      } else levees(r, zoneRings(r)[0], 1);
    },
  },
  {
    name: 'fullMix', mixed: true,
    act: (r) => {
      gates(r);
      if (inWave(r)) {
        pumps(r, r.state.maxPumpsOn);
        freeze(r);
        refreeze(r, zoneRings(r)[0], r.state.maxPumpsOn);
      } else {
        levees(r, zoneRings(r)[0], r.state.maxPumpsOn);
      }
    },
  },
];
