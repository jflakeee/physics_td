/**
 * Run state machine (docs/DETAILED_DESIGN_V2.md 10, launch subset): prep -> wave ->
 * prep ... -> result, wave -> defeat -> (retry) prep. The level-up settlement is not a phase:
 * a `prep` with `draft.pending > 0` shows the card screen and `beginWave` refuses until it is 0
 * (docs/DETAILED_DESIGN_V2.md 10; briefing arrives with Story 007). Pure logic, no DOM: the play screen and the balance bots drive
 * the same functions.
 */
import type { SimState } from '../core/types.ts';
import { createRngStreams } from '../core/rng.ts';
import type { RngStreams } from '../core/rng.ts';
import { startWave as simStartWave } from '../sim/inflow.ts';
import { step } from '../sim/step.ts';
import { setGate } from '../sim/structures.ts';
import { WAVE_COUNT, planMapWave } from '../sim/waves.ts';
import { advanceSkills, createSkillRuntime, onWaveEnd, pumpUpkeep, togglePump, useSkill } from '../rules/skills.ts';
import type { CanUse, SkillData, SkillRuntime, UseResult, UseTarget } from '../rules/skills.ts';
import type { DraftData } from '../rules/cards.ts';
import { accrueScore, createDraft, drafting, waveEndScore } from '../rules/leveling.ts';
import type { DraftState } from '../rules/leveling.ts';
import { restoreCheckpoint, saveCheckpoint } from './checkpoint.ts';
import type { Checkpoint } from './checkpoint.ts';
import { createMapSim } from './maps.ts';
import type { MapData } from './maps.ts';

/** Run phases. `prep` = sim frozen, building allowed; `wave` = sim running. */
export type Phase = 'prep' | 'wave' | 'defeat' | 'result';

/** Transition table: allowed `from -> to` moves (anything else is a bug). */
export const TRANSITIONS: Readonly<Record<Phase, readonly Phase[]>> = {
  prep: ['wave'],
  wave: ['prep', 'defeat', 'result'],
  defeat: ['prep'],
  result: [],
};

/** One run on one map. */
export interface Run {
  map: MapData;
  state: SimState;
  rt: SkillRuntime;
  seed: number;
  rng: RngStreams;
  phase: Phase;
  /** Current (wave phase) or last finished wave, 0 before wave 1. */
  wave: number;
  waveMax: number;
  cash: number;
  level: number;
  retries: number;
  /** Level-up draft progress (XP, pending picks, pity, reroll); null when the run has no draft data. */
  draft: DraftState | null;
  draftData: DraftData | null;
  /** Fusion ids discovered (minimal codex record; Story 006 persists and shows it). Survives retries. */
  codex: string[];
  /** Snapshot taken at the start of the current wave. */
  checkpoint: Checkpoint | null;
}

/** What one `tickRun` call changed. */
export type TickEvent = 'none' | 'waveEnd' | 'defeat' | 'result';

function go(run: Run, to: Phase): void {
  if (!TRANSITIONS[run.phase].includes(to)) throw new Error(`machine: ${run.phase} -> ${to} not allowed`);
  run.phase = to;
}

/**
 * Create a run in `prep` before wave 1. Cash and level come from the map's `start`;
 * the pump cap comes from `data/skills/pump.json`; glacier maps use the glacier skill variant.
 * @param draftData Level-up rules and fusions; without it the run has no XP or cards.
 * @example const run = createRun(map, skillData, 'dike-keeper', 7, draftData);
 */
export function createRun(map: MapData, data: SkillData, characterId: string, seed: number, draftData: DraftData | null = null): Run {
  const state = createMapSim(map, data.skills.get('pump')?.pump?.maxConcurrent);
  const rt = createSkillRuntime(data, characterId, state, map.region === 'glacier' ? 'glacier' : null);
  return {
    map, state, rt, seed, rng: createRngStreams(seed), phase: 'prep', wave: 0, waveMax: WAVE_COUNT,
    cash: map.start.cash, level: map.start.level, retries: 0,
    draft: draftData ? createDraft(draftData.rules, state) : null, draftData, codex: [], checkpoint: null,
  };
}

/**
 * prep -> wave: save the checkpoint, then install the next wave's inflow plan.
 * @returns false outside `prep` or while level-up picks are pending.
 * @example if (beginWave(run)) toast('wave');
 */
export function beginWave(run: Run): boolean {
  if (run.phase !== 'prep' || (run.draft !== null && run.draft.pending > 0)) return false;
  run.checkpoint = saveCheckpoint(run);
  run.wave++;
  run.rt.env.nextWeights = undefined;
  simStartWave(run.state, planMapWave(run.map.waves, run.wave));
  go(run, 'wave');
  return true;
}

/**
 * Advance one tick in the `wave` phase: sim step, pump upkeep, skill timers, then the
 * end checks (hp 0 -> defeat; wave length reached -> prep with wave income, or result after the last wave).
 * @example const ev = tickRun(run); if (ev === 'defeat') showDefeat();
 */
export function tickRun(run: Run): TickEvent {
  if (run.phase !== 'wave') return 'none';
  const { state } = run;
  step(state);
  run.cash = pumpUpkeep(run.rt, state, run.cash);
  advanceSkills(run.rt, state, 'wave');
  if (state.hp <= 0) {
    go(run, 'defeat');
    return 'defeat';
  }
  if (drafting(run)) accrueScore(run);
  if (state.inflow && state.waveTick >= state.inflow.len) {
    if (drafting(run)) waveEndScore(run);
    onWaveEnd(run.rt, state);
    if (run.wave >= run.waveMax) {
      go(run, 'result');
      return 'result';
    }
    run.cash += run.map.start.waveIncome;
    go(run, 'prep');
    return 'waveEnd';
  }
  return 'none';
}

/**
 * defeat -> prep: restore the wave-start checkpoint (same state as when the wave began).
 * @returns false when not defeated.
 * @example retryWave(run); beginWave(run);
 */
export function retryWave(run: Run): boolean {
  if (run.phase !== 'defeat' || run.checkpoint === null) return false;
  restoreCheckpoint(run, run.checkpoint);
  run.retries++;
  go(run, 'prep');
  return true;
}

/** Whether the player may act (skills, pumps, gates): prep or wave. */
const acting = (run: Run): boolean => run.phase === 'prep' || run.phase === 'wave';

/**
 * Use a skill and pay for it.
 * @example const r = runSkill(run, 'build-levee', { zone: 3 }, paused);
 */
export function runSkill(run: Run, id: string, target: UseTarget, paused = false): UseResult {
  if (!acting(run)) return { ok: false, reason: 'PAUSED', toast: 'toast.gameOver' };
  const r = useSkill(run.rt, run.state, id, { cash: run.cash, paused }, target);
  if (r.ok) run.cash -= r.spent;
  return r;
}

/**
 * Toggle pump `k` (rules: cap, cash, pause).
 * @example runTogglePump(run, 0, false);
 */
export function runTogglePump(run: Run, k: number, paused = false): CanUse {
  if (!acting(run)) return { ok: false, reason: 'PAUSED', toast: 'toast.gameOver' };
  return togglePump(run.rt, run.state, k, { cash: run.cash, paused });
}

/**
 * Toggle gate `k` open/closed (free; not while paused or after the run ended).
 * @example runToggleGate(run, 0, false);
 */
export function runToggleGate(run: Run, k: number, paused = false): CanUse {
  const gate = run.state.gates[k];
  if (!gate) return { ok: false, reason: 'BAD_TARGET', toast: 'toast.badTarget' };
  if (!acting(run)) return { ok: false, reason: 'PAUSED', toast: 'toast.gameOver' };
  if (paused) return { ok: false, reason: 'PAUSED', toast: 'toast.paused' };
  setGate(run.state.grid, gate, !gate.open);
  return { ok: true };
}
