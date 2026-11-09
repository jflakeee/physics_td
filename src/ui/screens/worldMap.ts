import type { WorldDef } from '../../rules/story.ts';
import type { T } from '../i18n.ts';

/**
 * World map teaser (STORY_WORLD_EXPANSION §3.3, §7): the river homestead grows one hex per
 * cleared map; regions beyond the border show as silhouettes; the glacier opens after the
 * river region is cleared. Hex SVG sized so every tappable hex is ≥ 48 px. No scroll.
 */
export interface WorldMapOptions {
  root: HTMLElement;
  t: T;
  world: WorldDef;
  cells: { hex: [number, number]; map: string | null; label?: string }[];
  open: (regionId: string) => boolean;
  regionName: (regionId: string) => string;
  onRegion: (regionId: string) => void;
  onCodex: () => void;
  onSettings: () => void;
  notices?: string[];
}

const SQ3 = Math.sqrt(3);
const px = ([q, r]: [number, number], s: number): [number, number] => [s * SQ3 * (q + r / 2), s * 1.5 * r];
const hexPoints = (cx: number, cy: number, s: number) =>
  Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 180 * (60 * k - 30); return `${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`; }).join(' ');

export function mountWorldMap(o: WorldMapOptions): { dispose(): void } {
  const { root, t, world } = o;
  root.textContent = '';
  root.className = 'world';
  const ns = 'http://www.w3.org/2000/svg';
  const mk = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

  const head = mk('header', 'world-head');
  head.append(mk('h1', '', t('world.title')), mk('span', 'count', t('world.homestead', { n: o.cells.length })));
  const codex = mk('button', 'codex-btn', '📖 ' + t('world.codex')) as HTMLButtonElement;
  codex.addEventListener('click', o.onCodex);
  const gear = mk('button', 'settings-btn', '⚙') as HTMLButtonElement;
  gear.setAttribute('aria-label', t('world.settings'));
  gear.addEventListener('click', o.onSettings);
  head.append(codex, gear);
  const status = mk('p', 'world-status');
  status.setAttribute('role', 'status');
  status.textContent = (o.notices ?? []).join(' · ');

  const S = 10; // SVG units per hex radius; the viewBox scales it to the screen
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('world-svg');
  svg.setAttribute('role', 'group');
  svg.setAttribute('aria-label', t('world.title'));
  const near = world.regions.filter(r => !r.far);
  const pts = [...near.map(r => r.hex), ...o.cells.map(c => c.hex), ...world.homestead].map(h => px(h, S));
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const pad = S * 0.9;
  svg.setAttribute('viewBox', `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + 2 * pad} ${Math.max(...ys) - Math.min(...ys) + 2 * pad}`);

  const hex = (h: [number, number], cls: string, label: string, onTap?: () => void, icon = '') => {
    const [cx, cy] = px(h, S);
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'hex ' + cls);
    const poly = document.createElementNS(ns, 'polygon');
    poly.setAttribute('points', hexPoints(cx, cy, S));
    g.append(poly);
    if (icon) {
      const tx = document.createElementNS(ns, 'text');
      tx.setAttribute('x', String(cx)); tx.setAttribute('y', String(cy + 3.5));
      tx.setAttribute('text-anchor', 'middle'); tx.textContent = icon;
      g.append(tx);
    }
    if (onTap) {
      g.setAttribute('role', 'button'); g.setAttribute('tabindex', '0'); g.setAttribute('aria-label', label);
      g.addEventListener('click', onTap);
      g.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') onTap(); });
    } else g.setAttribute('aria-hidden', 'true');
    svg.append(g);
    return g;
  };
  const say = (s: string) => { status.textContent = s; };
  for (const c of o.cells) {
    if (!c.map) continue;
    hex(c.hex, 'home-cell', c.label ?? '', () => say(c.label ?? t('world.cellEmpty')));
  }
  for (const r of near) {
    const name = o.regionName(r.id);
    if (!r.released) { hex(r.hex, 'silhouette', name, () => say(`${r.icon} ${t('world.unreleased')}`), r.icon); continue; }
    const open = o.open(r.id);
    const g = hex(r.hex, open ? 'region open' : 'region locked', name, () => {
      if (open) o.onRegion(r.id);
      else say(`${t('world.locked')} — ${t('world.lockedHint', { region: o.regionName(r.unlock!.clearRegion) })}`);
    }, open ? r.icon : '🔒');
    g.dataset.region = r.id;
  }
  const far = mk('div', 'world-far');
  far.setAttribute('aria-hidden', 'true');
  far.textContent = world.regions.filter(r => r.far).map(r => r.icon).join('  ');
  const stage = mk('div', 'world-stage');
  stage.append(svg, far);
  root.append(head, stage, status);
  return { dispose() { root.textContent = ''; } };
}
