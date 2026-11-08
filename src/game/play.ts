import type { SimWorld } from '../core/types.ts';
import type { LoadedMap } from './map.ts';
import { startWave, stepSim } from '../sim/step.ts';
import { pumpsOff, setPump } from '../sim/sinks.ts';
import { setGate } from '../sim/structures.ts';
import { baseFlood } from '../sim/metrics.ts';
import { rulesTick, rulesWaveEnd, rulesWaveStart, useSkill } from '../rules/skills.ts';
import type { RulesState } from '../rules/skills.ts';
import { tickLakes } from './lakes.ts';
import { createScore, scoreTick, scoreWaveEnd } from '../rules/leveling.ts';
import type { ScoreState } from '../rules/leveling.ts';
import { createDraft, pickCard, reroll, rollCards, skipDraft } from '../rules/cards.ts';
import type { DraftState } from '../rules/cards.ts';
import type { FusionDef } from '../rules/types.ts';
import { createStreams } from '../core/rng.ts';
import { restoreCheckpoint, takeCheckpoint } from './checkpoint.ts';
import type { Checkpoint } from './checkpoint.ts';
import type { LakeEvent } from './lakes.ts';

/**
 * Play-screen controller (DETAILED_DESIGN_V2 §10 subset, §12 commands, §18 step budget).
 * No DOM. Commands queue and apply before the next tick; in `prepare` they apply at once.
 */

export type Phase = 'prepare' | 'wave' | 'levelup' | 'result' | 'defeat';

export type PlayCommand =
  | { t: 'toggle'; kind: 'pump' | 'gate'; id: number }
  | { t: 'pumpsOff' }
  | { t: 'startWave' }
  | { t: 'pause'; on: boolean }
  | { t: 'speed'; x: 1 | 2 }
  | { t: 'retry' }
  | { t: 'pick'; index: number; replace?: string }
  | { t: 'skip' }
  | { t: 'reroll' }
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
  | { t: 'income'; amount: number }
  | { t: 'zoneChanged' }
  | LakeEvent
  | { t: 'retried'; wave: number }
  | { t: 'levelUp'; level: number; late: boolean }
  | { t: 'cardPicked' }
  | { t: 'fusion'; id: string }
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
  /** Skill rules (story 003); absent in bare sim/UI tests. */
  rules: RulesState | null;
  /** State right before the current wave started (defeat → retry). */
  checkpoint: Checkpoint | null;
  retries: number;
  /** Play score / XP / level (needs rules). */
  score: ScoreState | null;
  /** Level-up draft (needs rules). */
  draft: DraftState | null;
  fusions: readonly FusionDef[];
  seed: number;
}

export const TICK_MS = 1000 / 30;
/** Max accumulated time simulated per frame (§18). */
export const ACC_CAP_MS = 100;

export interface PlayOptions {
  /** Skill rules; when given, skills run through `useSkill`. */
  rules?: (play: Play) => RulesState;
  /** Run seed (card stream etc., §1). */
  seed?: number;
  /** Characters (for the map's 정석 weighting) and fusions, for the draft. */
  chars?: readonly { id: string; homeStyles: string[] }[];
  fusions?: readonly FusionDef[];
  /** Custom handler (tests / placeholder UI) when no rules are given. */
  skill?: SkillHandler;
  waves?: number;
}

/** Skill handler backed by the rules layer. */
const rulesHandler: SkillHandler = (p, id, zone, path) => {
  const r = useSkill(p.rules as RulesState, id, p.paused, zone, path);
  if (!r) {
    p.events.push({ t: 'skill', id, zone });
    if ((p.rules as RulesState).zoneChanged) { (p.rules as RulesState).zoneChanged = false; p.events.push({ t: 'zoneChanged' }); }
  }
  return r;
};

/** Create a play session in the prepare phase of wave 1. */
export function createPlay(map: LoadedMap, opt: PlayOptions = {}): Play {
  const p: Play = {
    map, world: map.world, phase: 'prepare', paused: false, speed: 1, waves: opt.waves ?? map.data.waves ?? 5, level: 1,
    queue: [], events: [], acc: 0, damaging: false, rules: null, checkpoint: null, retries: 0,
    score: null, draft: null, fusions: opt.fusions ?? [], seed: opt.seed ?? 1,
    skill: opt.skill ?? ((pp, id, zone) => { pp.events.push({ t: 'skill', id, zone }); return null; }),
  };
  if (opt.rules) {
    p.rules = opt.rules(p); p.skill = rulesHandler;
    p.score = createScore(p.world);
    p.draft = createDraft(createStreams(p.seed).cards, p.rules, map.data.style, opt.chars ?? []);
  }
  return p;
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
    case 'retry':
      if (p.phase !== 'defeat' || !p.checkpoint) return;
      restoreCheckpoint(p, p.checkpoint);
      p.phase = 'prepare'; p.paused = false; p.retries++;
      p.events.push({ t: 'retried', wave: w.wave + 1 });
      return;
    case 'pick': case 'skip': case 'reroll': {
      if (p.phase !== 'levelup' || !p.draft || !p.rules) return;
      const ctx = { rs: p.rules, fusions: p.fusions };
      if (cmd.t === 'reroll') { const r = reroll(p.draft, ctx); if (!r.ok) p.events.push({ t: 'refused', reason: r.reason }); return; }
      if (cmd.t === 'skip') skipDraft(p.draft, p.rules);
      else {
        const r = pickCard(p.draft, ctx, cmd.index, cmd.replace);
        if (!r.ok) { p.events.push({ t: 'refused', reason: r.reason }); return; }
        for (const id of r.fused) p.events.push({ t: 'fusion', id });
      }
      p.score!.pending--;
      p.events.push({ t: 'cardPicked' });
      nextDraft(p);
      return;
    }
    case 'startWave':
      if (p.phase !== 'prepare') return;
      p.checkpoint = takeCheckpoint(p);
      startWave(w, w.wave + 1);
      p.phase = 'wave'; p.paused = false; p.acc = 0;
      if (p.rules) rulesWaveStart(p.rules);
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

function levelEvents(p: Play, ups: number, late: boolean): void {
  for (let k = ups - 1; k >= 0; k--) p.events.push({ t: 'levelUp', level: p.score!.level - k, late });
  p.level = p.score!.level;
}

/** Open the next draft, or return to prepare when none are pending. */
function nextDraft(p: Play): void {
  if (p.score && p.draft && p.rules && p.score.pending > 0) { p.phase = 'levelup'; rollCards(p.draft, { rs: p.rules, fusions: p.fusions }); }
  else if (p.phase === 'levelup') p.phase = 'prepare';
}

/** One sim tick with queued commands applied first. */
export function tick(p: Play): void {
  for (const c of p.queue) apply(p, c);
  p.queue.length = 0;
  if (p.phase !== 'wave' || p.paused) return;
  const r = stepSim(p.world);
  const w = p.world;
  if (p.map.lakes.length) tickLakes(w, p.map.lakes, p.events as LakeEvent[]);
  const last = w.wave >= p.waves;
  if (p.rules) {
    rulesTick(p.rules);
    if (p.rules.zoneChanged) { p.rules.zoneChanged = false; p.events.push({ t: 'zoneChanged' }); }
    if (p.score) levelEvents(p, scoreTick(p.score, w, p.rules.eco, last), last);
  }
  if (w.events.collapsed.length) p.events.push({ t: 'collapse', count: w.events.collapsed.length });
  if (w.events.cashEmpty) p.events.push({ t: 'refused', reason: 'cashEmptyPumps' });
  const dmg = baseFlood(w) > w.cfg.floodThreshold;
  if (dmg !== p.damaging) { p.damaging = dmg; p.events.push({ t: dmg ? 'damageStart' : 'damageEnd' }); }
  if (r === 'defeat') { p.phase = 'defeat'; p.events.push({ t: 'defeat' }); }
  else if (r === 'waveEnd') {
    p.events.push({ t: 'waveEnd', wave: w.wave });
    if (p.rules) p.events.push({ t: 'income', amount: rulesWaveEnd(p.rules) });
    if (p.score && p.rules) levelEvents(p, scoreWaveEnd(p.score, w, p.rules.eco, last), last);
    if (last) { p.phase = 'result'; p.events.push({ t: 'result' }); } else { p.phase = 'prepare'; nextDraft(p); }
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
