import type { RulesState } from '../../rules/skills.ts';
import { zoneTargetable } from '../../rules/skills.ts';
import type { SkillDef } from '../../rules/types.ts';

/**
 * Level-up card preview (Water TD benchmark B6): a small map of this board showing where the
 * skill acts — target zones bright, others dim; levee skills also draw their lines; global /
 * passive skills light every non-base zone faintly. Drawn once per card (no animation).
 */
const TW = 8, TH = 12, PX = 6; // tiles, px per tile

export function drawCardPreview(c: HTMLCanvasElement, rs: RulesState, def: SkillDef): void {
  c.width = TW * PX; c.height = TH * PX;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const zones = rs.map.zones.zones;
  const zoneTarget = def.target === 'zone';
  for (const z of zones) {
    const ok = z.type !== 'base' && (zoneTarget ? zoneTargetable(rs, def.id, z.id) || targetsIfOwned(rs, def, z.id) : true);
    ctx.fillStyle = z.type === 'base' ? '#b9b0a4' : ok ? (zoneTarget ? '#7fe9dc' : '#4b7a8f') : '#1c2b3a';
    for (const [tx, ty] of z.tiles) ctx.fillRect(tx * PX, ty * PX, PX, PX);
  }
  // zone borders for shape
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1;
  for (const z of zones) for (const [tx, ty] of z.tiles) ctx.strokeRect(tx * PX + 0.5, ty * PX + 0.5, PX - 1, PX - 1);
  if (def.ranks.some(r => r.ops.some(o => o.op === 'buildLevee' || o.op === 'iceLevee' || o.op === 'iceWall'))) {
    ctx.fillStyle = '#c98a3a';
    const W = rs.world.grid.width, s = PX / 8;
    rs.map.leveeLines.forEach((lines, k) => {
      if (zoneTarget && !(zoneTargetable(rs, def.id, k + 1) || targetsIfOwned(rs, def, k + 1))) return;
      for (const l of lines) for (const cell of l.cells) ctx.fillRect((cell % W) * s, ((cell / W) | 0) * s, Math.max(1, s), Math.max(1, s));
    });
  }
}

/** Zone check for a skill the player does not own yet (cards offer unowned skills). */
function targetsIfOwned(rs: RulesState, def: SkillDef, zoneId: number): boolean {
  const z = rs.map.zones.zones[zoneId - 1];
  if (z.type === 'base') return false;
  if (def.zoneTypes.length && !def.zoneTypes.includes(z.type)) return false;
  if (def.needs === 'leveeLine' && rs.map.leveeLines[zoneId - 1].length === 0) return false;
  return true;
}
