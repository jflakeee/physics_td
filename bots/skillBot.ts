import type { LoadedMap, MapData } from '../src/game/map.ts';
import { loadMap } from '../src/game/map.ts';
import { advance, createPlay, send, TICK_MS } from '../src/game/play.ts';
import type { Play } from '../src/game/play.ts';
import { canUse, createRules } from '../src/rules/skills.ts';
import { CHARACTERS, ECONOMY, FUSIONS, SKILLS } from '../src/data/catalog.ts';
import { baseFlood } from '../src/sim/metrics.ts';
import { inletPaths } from '../src/game/validate.ts';
import type { CharacterDef } from '../src/rules/types.ts';
import { affinityOf } from '../src/game/result.ts';

/**
 * Skill-playing balance bot (DETAILED §21 "home"/"challenge"): plays only through player
 * commands — zone skills, pump toggles, cards — like a reasonable player:
 *   prepare: build the levee lines nearest the base, then raise them (re-cast) up to 0.45,
 *            while cash ≥ reserve; run the 2 pumps
 *            closest to the inlet paths; open fields / restore wetland as the wetland researcher
 *   wave (every 10 ticks): freeze the zone in front of the base when it floods, sandbag
 *            across the main inlet path, ultimate at 100
 *   draft: challenge character: the home character's basic skill first; then a new own
 *          tactical/ultimate; then own cards (challenge: cross cards).
 */

export interface SkillBotResult { map: string; char: string; seed: number; result: 'clear' | 'defeat'; wave: number; hp: number; score: number; level: number; levees: number; }

function pumpOrder(m: LoadedMap): number[] {
  const W = m.terrain.grid.width, paths = inletPaths(m).flat();
  const dist = (cell: number) => Math.min(...paths.map(c => Math.max(Math.abs(c % W - cell % W), Math.abs(((c / W) | 0) - ((cell / W) | 0)))));
  const bx = m.terrain.baseX, by = m.terrain.baseY;
  return m.world.pumps.map(p => ({ id: p.id, d: dist(p.cell) + Math.hypot(p.cell % W - bx, ((p.cell / W) | 0) - by) / 10 })).sort((a, b) => a.d - b.d).map(x => x.id);
}

function prepare(p: Play, reserve: number, maxLineDist: number, raiseTo: number): void {
  const rs = p.rules!, w = p.world;
  // pumps: the two best sites on
  const order = pumpOrder(p.map);
  for (const id of order.slice(0, w.cfg.pumpMaxOn)) if (!w.pumps[id].on) send(p, { t: 'toggle', kind: 'pump', id });
  // zone skills
  const zones = p.map.zones.zones;
  const have = (id: string) => rs.owned.some(o => o.id === id);
  if (have('open-floodplain')) for (const z of zones) if (canUse(rs, 'open-floodplain', false, z.id) === null) send(p, { t: 'skill', id: 'open-floodplain', zone: z.id });
  if (have('restore-wetland')) {
    // the zone nearest the base: a wetland next to the base soaks the flood before it arrives
    const bx = p.map.terrain.baseX, by = p.map.terrain.baseY;
    const d = (zz: typeof zones[number]) => Math.hypot(zz.center[0] - bx, zz.center[1] - by);
    const z = zones.filter(zz => canUse(rs, 'restore-wetland', false, zz.id) === null).sort((a, b) => d(a) - d(b))[0];
    if (z && (w.cash ?? 0) >= reserve + 30) send(p, { t: 'skill', id: 'restore-wetland', zone: z.id });
  }
  if (have('build-levee')) {
    // nearest unbuilt line first (a player closes the ring around the base before outer lines)
    const W = w.grid.width, bx = p.map.terrain.baseX, by = p.map.terrain.baseY;
    const lineDist = (cells: Uint32Array) => { const c = cells[cells.length >> 1]; return Math.max(Math.abs(c % W - bx), Math.abs(((c / W) | 0) - by)); };
    for (let guard = 0; guard < 30 && (w.cash ?? 0) >= reserve + 20; guard++) {
      // unbuilt near lines first, then raise the lowest near line (re-cast: +0.1, durability reset)
      let best: { zone: number; key: number } | null = null;
      for (const z of zones) {
        if (canUse(rs, 'build-levee', false, z.id) !== null) continue;
        const lines = p.map.leveeLines[z.id - 1].filter(l => lineDist(l.cells) <= maxLineDist);
        if (!lines.length) continue;
        const unbuilt = lines.find(l => !rs.builtLines.has(l.id));
        const low = Math.min(...lines.map(l => w.grid.wall[l.cells[0]]));
        if (!unbuilt && (low >= raiseTo || p.map.leveeLines[z.id - 1].some(l => !rs.builtLines.has(l.id)))) continue;
        const key = unbuilt ? -1 / lineDist(unbuilt.cells) : low;
        if (!best || key < best.key) best = { zone: z.id, key };
      }
      if (!best) break;
      send(p, { t: 'skill', id: 'build-levee', zone: best.zone });
    }
  }
}

function inWave(p: Play): void {
  const rs = p.rules!, w = p.world;
  if (rs.gauge >= rs.eco.gaugeMax) send(p, { t: 'skill', id: rs.char.skills.ultimate });
  const flood = baseFlood(w);
  if (flood > w.cfg.floodThreshold * 0.6) {
    // freeze the zone just outside the base on the main inlet side
    const path = inletPaths(p.map)[0], W = w.grid.width;
    const cell = path[Math.max(0, path.length - 14)];
    const zid = p.map.zones.zoneOf[cell];
    if (zid && canUse(rs, 'freeze', false, zid) === null) send(p, { t: 'skill', id: 'freeze', zone: zid });
    if (rs.owned.some(o => o.id === 'sandbag') && canUse(rs, 'sandbag', false) === null) {
      const c = path[Math.max(0, path.length - 10)], x = c % W, y = (c / W) | 0;
      const dx = path[path.length - 1] % W - path[0] % W, dy = ((path[path.length - 1] / W) | 0) - ((path[0] / W) | 0);
      const n = Math.hypot(dx, dy) || 1, px = -dy / n, py = dx / n;
      send(p, { t: 'skill', id: 'sandbag', path: [[Math.round(x - px * 10), Math.round(y - py * 10)], [Math.round(x + px * 10), Math.round(y + py * 10)]] });
    }
  }
}

export function runSkillBot(data: MapData, char: CharacterDef, seed: number, reserve = 40, maxLineDist = 16, raiseTo = 0.45, start?: string[]): SkillBotResult {
  const map = loadMap(data);
  const p = createPlay(map, { seed, chars: CHARACTERS, fusions: FUSIONS, rules: pp => createRules(map, SKILLS, char, ECONOMY, () => pp.phase === 'wave', start) });
  let k = 0;
  while (p.phase !== 'result' && p.phase !== 'defeat') {
    if (p.phase === 'levelup') {
      const offer = p.draft!.offer!;
      // home / neutral: own cards first; challenge: the 정석 character's cross cards first (§21)
      const challenge = affinityOf(char, data.style, CHARACTERS) === 'challenge';
      const rsNow = p.rules!;
      const spike = offer.findIndex(c => c.kind === 'skill' && c.side === 'own' && !c.upgrade && ['tactical', 'ultimate'].includes(rsNow.defs.get(c.skill)!.slot));
      const want = offer.findIndex(c => c.kind === 'skill' && c.side === (challenge ? 'cross' : 'own'));
      // a challenge pick borrows the home character's basic skill first (it is what the map is built for)
      const crossBasic = challenge ? offer.findIndex(c => c.kind === 'skill' && c.side === 'cross' && rsNow.defs.get(c.skill)!.slot === 'basic') : -1;
      const idx = crossBasic >= 0 ? crossBasic : spike >= 0 ? spike : want >= 0 ? want : 0;
      const c = offer[idx];
      const replace = c.kind === 'skill' ? p.rules!.owned.find(o => !['dike-passive', 'wetland-passive'].includes(o.id) && o.borrowed)?.id : undefined;
      send(p, { t: 'pick', index: idx, replace });
      if (p.phase === 'levelup' && p.draft!.offer === offer) send(p, { t: 'skip' });
      continue;
    }
    if (p.phase === 'prepare') { prepare(p, reserve, maxLineDist, raiseTo); send(p, { t: 'startWave' }); continue; }
    if (k++ % 10 === 0) inWave(p);
    advance(p, TICK_MS);
  }
  const levees = p.rules!.builtLines.size;
  return { map: data.id, char: char.id, seed, result: p.phase === 'result' ? 'clear' : 'defeat', wave: p.world.wave, hp: p.world.hp, score: Math.floor(p.score!.scoreF), level: p.score!.level, levees };
}
