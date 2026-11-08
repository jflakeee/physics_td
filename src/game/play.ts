import type { SimWorld } from '../core/types.ts';
import type { LoadedMap } from './map.ts';
import { startWave, stepSim } from '../sim/step.ts';
import { pumpsOff, setPump } from '../sim/sinks.ts';
import { setGate } from '../sim/structures.ts';
import { baseFlood } from '../sim/metrics.ts';

/**
 * Play-screen controller (DETAILED_DESIGN_V2 §10 subset, §12 commands, §18 step budget).
 * No DOM. Commands queue and apply before the next tick; in `prepare` they apply at once.
 */

export type Phase = 'prepare' | 'wave' | 'result' | 'defeat';

export type PlayCommand =
  | { t: 'toggle'; kind: 'pump' | 'gate'; id: number }
  | { t: 'pumpsOff' }
  | { t: 'startWave' }
  | { t: 'pause'; on: boolean }
  | { t: 'speed'; x: 1 | 2 }
  | { t: 'skill'; id: string; zone?: number; path?: [number, number][] };

/** Feedback for the UI (toasts, haptics). Cleared by the UI after reading. */
export type PlayEvent =
  | { t: 'refused'; reason: string }
  | { t: 'toggled'; kind: 'pump' | 'gate'; id: number; on: boolean }
  | { t: 'waveStart'; wave: number }
  | { t: 'waveEnd'; wave: number }
  | { t: 'damageStart' } | { t: 'damageEnd' }
  | { t: 'collapse'; count: number }
  | { t: 'skill'; id: string; zone?: number }
  | { t: 'defeat' } | { t: 'result' };

/** Applies a skill (story 003 plugs in effects). Returns a refusal code or null. */
export type SkillHandler = (play: Play, id: string, zone?: number, path?: [number, number][]) => string | null;

export interface Play {
  map: LoadedMap;
  world: SimWorld;
  phase: Phase;
  paused: boolean;
  speed: 1 | 2;
  waves: number;
  /** Player level (leveling arrives with story 005). */
  level: number;
  queue: PlayCommand[];
  events: PlayEvent[];
  /** ms not yet simulated. */
  acc: number;
  damaging: boolean;
  skill: SkillHandler;
}

export const TICK_MS = 1000 / 30;
/** Max accumulated time simulated per frame (§18). */
export const ACC_CAP_MS = 100;

/** Create a play session in the prepare phase of wave 1. */
export function createPlay(map: LoadedMap, skill?: SkillHandler, waves = 5): Play {
  return {
    map, world: map.world, phase: 'prepare', paused: false, speed: 1, waves, level: 1,
    queue: [], events: [], acc: 0, damaging: false,
    skill: skill ?? ((p, id, zone) => { p.events.push({ t: 'skill', id, zone }); return null; }),
  };
}

/**
 * Queue a command for the next tick. Applied at once in prepare/result/defeat, and always
 * for pause/speed (they change the clock, not the sim, so replays are unaffected).
 */
export function send(p: Play, cmd: PlayCommand): void {
  if (p.phase === 'wave' && cmd.t !== 'pause' && cmd.t !== 'speed') p.queue.push(cmd); else apply(p, cmd);
}

function apply(p: Play, cmd: PlayCommand): void {
  const w = p.world;
  switch (cmd.t) {
    case 'toggle': {
      if (cmd.kind === 'pump') {
        const pump = w.pumps[cmd.id];
        if (!pump) return;
        const r = setPump(w, cmd.id, !pump.on);
        if (r) p.events.push({ t: 'refused', reason: r });
        else p.events.push({ t: 'toggled', kind: 'pump', id: cmd.id, on: pump.on });
      } else {
        const gate = w.gates[cmd.id];
        if (!gate) return;
        setGate(w, cmd.id, !gate.open);
        p.events.push({ t: 'toggled', kind: 'gate', id: cmd.id, on: gate.open });
      }
      return;
    }
    case 'pumpsOff': pumpsOff(w); return;
    case 'pause': p.paused = cmd.on; return;
    case 'speed': p.speed = cmd.x; return;
    case 'startWave':
      if (p.phase !== 'prepare') return;
      startWave(w, w.wave + 1);
      p.phase = 'wave'; p.paused = false; p.acc = 0;
      p.events.push({ t: 'waveStart', wave: w.wave });
      return;
    case 'skill': {
      if (p.paused) { p.events.push({ t: 'refused', reason: 'PAUSED' }); return; }
      const r = p.skill(p, cmd.id, cmd.zone, cmd.path);
      if (r) p.events.push({ t: 'refused', reason: r });
      return;
    }
  }
}

/** One sim tick with queued commands applied first. */
export function tick(p: Play): void {
  for (const c of p.queue) apply(p, c);
  p.queue.length = 0;
  if (p.phase !== 'wave' || p.paused) return;
  const r = stepSim(p.world);
  const w = p.world;
  if (w.events.collapsed.length) p.events.push({ t: 'collapse', count: w.events.collapsed.length });
  if (w.events.cashEmpty) p.events.push({ t: 'refused', reason: 'cashEmptyPumps' });
  const dmg = baseFlood(w) > w.cfg.floodThreshold;
  if (dmg !== p.damaging) { p.damaging = dmg; p.events.push({ t: dmg ? 'damageStart' : 'damageEnd' }); }
  if (r === 'defeat') { p.phase = 'defeat'; p.events.push({ t: 'defeat' }); }
  else if (r === 'waveEnd') {
    p.events.push({ t: 'waveEnd', wave: w.wave });
    if (w.wave >= p.waves) { p.phase = 'result'; p.events.push({ t: 'result' }); } else p.phase = 'prepare';
  }
}

/**
 * Advance by `dtMs` of real time. Steps are fixed (33.3 ms); at most 2 per frame at 1×,
 * 4 at 2×; the backlog is capped at 100 ms (§18). Returns the ticks run.
 */
export function advance(p: Play, dtMs: number): number {
  if (p.queue.length && (p.phase !== 'wave' || p.paused)) { for (const c of p.queue) apply(p, c); p.queue.length = 0; }
  if (p.phase !== 'wave' || p.paused) { p.acc = 0; return 0; }
  p.acc = Math.min(ACC_CAP_MS * p.speed, p.acc + dtMs * p.speed); // cap is 100 ms of real time
  const max = p.speed === 2 ? 4 : 2;
  let n = 0;
  while (p.acc >= TICK_MS && n < max && p.phase === 'wave') { tick(p); p.acc -= TICK_MS; n++; }
  if (n === max) p.acc = Math.min(p.acc, TICK_MS); // drop backlog beyond the frame budget
  return n;
}
