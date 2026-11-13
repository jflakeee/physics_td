import {
  canBuild, canUpgrade, chooseCard, continueEndless, createHydro, demand, gather, lacking, placeBuilding, recommendSteps, repair, seasonAt, seconds, start,
  upgrade, upgradeCost, type Gain,
  tick, W, H, waiting, weatherAt, xpNeed, type BuildKind, type CardId, type CharId, type HydroWorld, type PowerupId,
} from './core.ts';
import { AH, AW, createArt, paintSprites, paintTerrain, paintWater, S as ART, seasonKey } from './art.ts';
import { rgbOf, sprite, type SpriteName } from './sprites.ts';
import { CHARS, POWERUPS, STAGES, T } from './tuning.ts';
import { createSfx } from './audio.ts';
import { buyPowerup, clearRun, finishRun, loadMeta, loadRun, openStages, runOptions, saveMeta, saveRun, type StorageLike } from './meta.ts';

/**
 * V4 hydro prototype screen (docs/REDESIGN_V4_HYDRO.md §3, docs/ART_DIRECTION_V4_PIXEL.md):
 * one pixel grid (192×288 art px) scaled by a whole number; icons use the same pixel size.
 * Text uses the system font (§0-6). No emoji.
 */

const STR = {
  title: '강가 발전소', lead: '강물로 전기를 만들어 마을을 밝혀요',
  start: '시작', ready: '나무·돌을 눌러 모으고, 동그라미를 눌러 지어요', noCoins: '코인이 모자라요', repaired: '고쳤어요!',
  need: '더 필요해요', upgraded: '더 좋아졌어요!', upNeed: '업그레이드에 필요', maxLevel: '가장 좋은 단계예요',
  matName: { coins: '코인', wood: '나무', stone: '돌' } as Record<'coins' | 'wood' | 'stone', string>,
  built: { wheel: '물레방아를 지었어요!', reservoir: '저수지를 팠어요!', wall: '둑을 쌓았어요!' } as Record<BuildKind, string>,
  levelUp: '레벨 업!', won: '두 계절을 버텼어요!', lost: '마을이 버티지 못했어요',
  lostBlackout: '정전! 물레방아를 더 지어요', lostFlood: '마을이 잠겼어요! 둑을 쌓아요',
  again: '다시', resume: '계속', speed: '빠르게', home: '메인으로', paused: '잠깐 멈춤', soon: '곧 와요', sound: '소리', on: '켜짐', off: '꺼짐',
  cont: '계속하기', newRun: '새로 시작', chars: '캐릭터', skills: '스킬', items: '아이템', records: '기록', back: '뒤로',
  pickStage: '어디를 지킬까?', pickChar: '누구와 갈까?', locked: '잠김', gems: '보석', buy: '사기', max: '최고 단계',
  next: '다음 스테이지', bonus: '보너스 스킬 획득!', newChar: '새 친구!', earned: '보석', unlockHint: '버티면 열려요',
  bonusHint: '버티면 레벨업 카드에 나와요', evoHint: '좋은 터빈 ★5 + 물레방아 3개', allClear: '모든 계곡을 지켰어요!',
  jam: '얼음 댐이 강을 막았어요!', burst: '얼음 댐이 터졌어요! 큰물이 와요', slide: '산사태! 강이 막혀 넘쳐요', grid: '물레방아',
  keepGoing: '계속하기', keepHint: '다음 계절이 와요 · 마을이 더 커져요', survived: '도 버텼어요!', endlessOver: '계절을 더 버텼어요',
};
const STAT_ROWS: [keyof ReturnType<typeof loadMeta>['stats'], string][] = [
  ['runs', '플레이'], ['wins', '버틴 판'], ['losses', '진 판'], ['bestLevel', '최고 레벨'], ['power', '만든 전기'],
  ['bestSeasons', '가장 오래 버틴 계절'], ['builds', '지은 건물'], ['floodHearts', '홍수로 잃은 하트'], ['blackoutHearts', '정전으로 잃은 하트'], ['seconds', '플레이 시간(초)'],
];
const CHAR_ICON: Record<CharId, SpriteName> = { miller: 'wheel0', granny: 'sandSpirit', frost: 'iceSpirit' };
const PU_ICON: Record<PowerupId, SpriteName> = { turbine: 'wheel0', purse: 'coin', builder: 'hammer', heart: 'heart' };
const store: StorageLike | null = (() => { try { return globalThis.localStorage; } catch { return null; } })();
// sound effects: one player for the whole app, created silent until the first tap makes a sound
const sfx = createSfx(() => { const C = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; return C ? new C() : null; }, loadMeta(store).sound);
const B: Record<BuildKind, SpriteName> = { wheel: 'wheel0', reservoir: 'gate', wall: 'stakes' };
const CARD: Record<CardId, { icon: SpriteName; name: string; desc: string }> = {
  sand: { icon: 'sandSpirit', name: '모래 정령', desc: '넘치는 곳에 모래를 쌓아요' },
  ice: { icon: 'iceSpirit', name: '얼음 정령', desc: '큰물을 얼려 두었다가 가뭄에 녹여요' },
  eta: { icon: 'wheel0', name: '좋은 터빈', desc: '전기가 더 많이 나와요' },
  tough: { icon: 'shield', name: '튼튼한 발전소', desc: '물에 잠겨도 덜 상해요' },
  coins: { icon: 'coin', name: '코인 주머니', desc: '코인 60개' },
  cheap: { icon: 'hammer', name: '솜씨 좋은 일꾼', desc: '짓는 값이 싸져요' },
  rain: { icon: 'rainSpirit', name: '비구름 정령', desc: '가뭄에 비를 내려요' },
  sun: { icon: 'sunSpirit', name: '햇볕 정령', desc: '큰물 때 넘친 물을 말려요' },
  penstock: { icon: 'penstock', name: '도수관', desc: '진화! 더 위에서 물을 끌어와 낙차가 커져요 (전기 크게 증가)' },
};
const WX: Record<string, { icon: SpriteName; name: string }> = {
  clear: { icon: 'sun', name: '맑음' }, rain: { icon: 'rain', name: '장마' }, drought: { icon: 'drought', name: '가뭄' },
  thaw: { icon: 'thaw', name: '눈 녹음' }, storm: { icon: 'storm', name: '태풍' }, freeze: { icon: 'snow', name: '한파' },
  jam: { icon: 'jam', name: '얼음 댐' }, slide: { icon: 'slide', name: '산사태' },
};

const q = new URLSearchParams(location.search);
const app = document.getElementById('app') as HTMLElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (ms: number) => { try { navigator.vibrate?.(ms); } catch { /* unsupported */ } };
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
};

// ---- pixel size shared by the board and every icon (CSS px per art px) ----
const root = document.documentElement;
const setPixel = (cssPerArt: number) => root.style.setProperty('--px', `${cssPerArt}px`);
setPixel(2 / Math.min(2, devicePixelRatio || 1));

/** A sprite as a tiny canvas; CSS scales it by the shared pixel size (`--px`), nearest neighbour. */
function icon(name: SpriteName, cls = ''): HTMLCanvasElement {
  const s = sprite(name), c = el('canvas', 'pi ' + cls);
  c.width = s.w; c.height = s.h;
  c.style.setProperty('--w', String(s.w)); c.style.setProperty('--h', String(s.h));
  const ctx = c.getContext('2d') as CanvasRenderingContext2D, img = ctx.createImageData(s.w, s.h);
  for (let i = 0; i < s.px.length; i++) { const v = s.px[i]; if (!v) continue; const [r, g, b] = rgbOf(v); img.data.set([r, g, b, 255], i * 4); }
  ctx.putImageData(img, 0, 0);
  c.setAttribute('aria-hidden', 'true');
  return c;
}

let stop: (() => void) | null = null;

/** Shared menu frame: header with back button, title and gems; returns the body element. */
function frame(title: string, onBack: (() => void) | null): HTMLElement {
  stop?.(); stop = null;
  app.className = 'menu'; app.textContent = '';
  const m = loadMeta(store), head = el('header', 'mhead');
  if (onBack) { const b = el('button', 'back', STR.back); b.addEventListener('click', onBack); head.append(b); }
  head.append(el('h1', '', title));
  const g = el('span', 'gems'); g.append(icon('gem'), el('b', '', String(m.gems))); g.setAttribute('aria-label', `${STR.gems} ${m.gems}`);
  head.append(g);
  const body = el('div', 'mbody');
  app.append(head, body);
  return body;
}
const row = (cls: string, ic: SpriteName, title: string, desc: string, right?: HTMLElement) => {
  const b = el('button', 'mrow ' + cls); const t = el('span', 'mt');
  t.append(el('b', '', title), el('span', 'desc', desc));
  // every row icon fills the same box: about 36 art px, whatever the sprite size
  const k = Math.max(2, Math.min(4, Math.round(36 / sprite(ic).w)));
  const box = el('span', 'mi'); box.append(icon(ic, 'x' + k));
  b.append(box, t); if (right) b.append(right);
  return b;
};

/** Main menu (survivors-like hub). */
function showMain(): void {
  stop?.(); stop = null;
  app.className = 'title'; app.textContent = '';
  const m = loadMeta(store), saved = loadRun(store);
  const logo = el('div', 'logo');
  logo.append(icon('wheel0', 'x4'), icon('rain', 'x4'), icon('house', 'x4'));
  const g = el('span', 'gems'); g.append(icon('gem'), el('b', '', String(m.gems)));
  app.append(logo, el('h1', '', STR.title), g);
  const nav = el('div', 'mainnav');
  if (saved && (saved.phase === 'run' || saved.phase === 'levelup' || saved.phase === 'ready')) {
    const st = STAGES[saved.stage], sn = saved.seasons[seasonAt(seconds(saved), saved.seasons).si].name;
    const c = el('button', 'big cont'); c.append(icon('play', 'x2'), el('span', '', `${STR.cont}`), el('small', '', `${st.name} · ${sn}`));
    c.addEventListener('click', () => { const w = loadRun(store); if (w) showPlay(w); });
    nav.append(c);
  }
  const go = el('button', saved ? 'big alt' : 'big'); go.append(icon('play', 'x2'), el('span', '', saved ? STR.newRun : STR.start));
  go.addEventListener('click', showStages);
  nav.append(go);
  const grid = el('div', 'subnav');
  for (const [label, ic, fn] of [[STR.chars, 'wheel0', showChars], [STR.skills, 'sandSpirit', showSkills], [STR.items, 'gem', showItems], [STR.records, 'star', showRecords]] as [string, SpriteName, () => void][]) {
    const b = el('button', 'sub'); b.append(icon(ic, 'x2'), el('span', '', label)); b.addEventListener('click', fn); grid.append(b);
  }
  nav.append(grid);
  app.append(nav);
}

function showStages(): void {
  const body = frame(STR.pickStage, showMain), m = loadMeta(store), open = openStages(m);
  STAGES.forEach((st, k) => {
    const rec = m.stages[st.id], hearts = el('span', 'hs');
    for (let h = 0; h < 3; h++) hearts.append(icon(rec?.cleared && h < rec.bestHearts ? 'heart' : 'heartEmpty'));
    const seasons = st.seasons.map(x => x.name).join(' · ');
    const b = row(k < open ? '' : 'locked', k < open ? (k === 0 ? 'sun' : k === 1 ? 'rain' : 'snow') : 'lock', st.name, k < open ? seasons : `${STAGES[k - 1].name} ${STR.unlockHint}`, hearts);
    b.disabled = k >= open;
    b.addEventListener('click', () => showCharPick(k));
    body.append(b);
  });
}

function showCharPick(stage: number): void {
  const body = frame(STR.pickChar, showStages), m = loadMeta(store);
  for (const c of CHARS) {
    const have = m.chars.includes(c.id), from = STAGES.find(st => st.unlockChar === c.id);
    const b = row(have ? '' : 'locked', have ? CHAR_ICON[c.id] : 'lock', c.name, have ? c.desc : `${from?.name ?? ''} ${STR.unlockHint}`);
    b.disabled = !have;
    b.addEventListener('click', () => { clearRun(store); showPlay(createHydro(Date.now() % 100000, runOptions(m, stage, c.id))); });
    body.append(b);
  }
}

function showChars(): void {
  const body = frame(STR.chars, showMain), m = loadMeta(store);
  for (const c of CHARS) {
    const have = m.chars.includes(c.id), from = STAGES.find(st => st.unlockChar === c.id);
    const b = row(have ? 'info' : 'locked info', have ? CHAR_ICON[c.id] : 'lock', c.name, have ? c.desc : `${from?.name ?? ''} ${STR.unlockHint}`);
    b.tabIndex = -1; body.append(b);
  }
}

function showSkills(): void {
  const body = frame(STR.skills, showMain), m = loadMeta(store);
  for (const id of Object.keys(CARD) as CardId[]) {
    const bonusOf = STAGES.find(st => st.bonusSkill === id), have = !bonusOf || m.skills.includes(id);
    // the evolution is always listed with how to get it
    const desc = id === 'penstock' ? `${STR.evoHint} · ${CARD[id].desc.replace(/^진화! /, '')}` : have ? CARD[id].desc : `${bonusOf?.name ?? ''} ${STR.bonusHint}`;
    const b = row(have ? 'info' + (id === 'penstock' ? ' evo' : '') : 'locked info', have ? CARD[id].icon : 'lock', CARD[id].name, desc);
    b.tabIndex = -1; body.append(b);
  }
}

function showItems(): void {
  const body = frame(STR.items, showMain), m = loadMeta(store);
  for (const p of POWERUPS) {
    const rank = m.powerups[p.id] ?? 0, price = p.cost[rank];
    const right = el('span', 'price');
    if (price === undefined) right.append(el('span', '', STR.max));
    else right.append(icon('gem'), el('b', '', String(price)));
    const stars = '★'.repeat(rank) + '☆'.repeat(p.cost.length - rank);
    const b = row(price !== undefined && m.gems >= price ? 'buyable' : '', PU_ICON[p.id], `${p.name} ${stars}`, p.desc, right);
    b.disabled = price === undefined || m.gems < price;
    b.addEventListener('click', () => { const mm = loadMeta(store); if (buyPowerup(mm, p.id)) { saveMeta(store, mm); buzz(15); showItems(); } });
    body.append(b);
  }
}

function showRecords(): void {
  const body = frame(STR.records, showMain), m = loadMeta(store);
  const tbl = el('table', 'stats');
  for (const [k, label] of STAT_ROWS) { const tr = el('tr'); tr.append(el('th', '', label), el('td', '', String(m.stats[k]))); tbl.append(tr); }
  body.append(tbl);
  for (const st of STAGES) {
    const rec = m.stages[st.id], hearts = el('span', 'hs');
    for (let h = 0; h < 3; h++) hearts.append(icon(rec?.cleared && h < rec.bestHearts ? 'heart' : 'heartEmpty'));
    const b = row('info', rec?.cleared ? 'star' : 'site', st.name, `${rec?.plays ?? 0}판 · ${rec?.cleared ? '버팀' : '아직'}`, hearts);
    b.tabIndex = -1; body.append(b);
  }
}

function showPlay(w: HydroWorld): void {
  stop?.();
  if (q.has('dev')) (globalThis as Record<string, unknown>).__v4 = { w, tick, start, chooseCard, placeBuilding, upgrade, gather, sfx, saveRun: () => saveRun(store, w) };
  app.className = 'play'; app.textContent = '';
  const maxHearts = T.hearts + (w.origin.opt.powerups?.heart ?? 0);
  // the run in progress is saved every 10 s and when the app is hidden (계속하기 on the main menu)
  let lastSave = 0;
  const autosave = () => { if (w.phase === 'run' || w.phase === 'levelup') saveRun(store, w); };
  const onHide = () => { if (document.visibilityState === 'hidden') autosave(); };
  document.addEventListener('visibilitychange', onHide);

  // ---- top: level/xp · coins · hearts / weather · village power · pause
  const top = el('header', 'top');
  const lv = el('span', 'lv'), xp = el('div', 'meter xp'), xpFill = el('i'); xp.append(xpFill);
  const coins = el('span', 'coins'), coinNum = el('b');
  const wood = el('span', 'coins'), woodNum = el('b'), stone = el('span', 'coins'), stoneNum = el('b');
  wood.append(icon('log'), woodNum); stone.append(icon('stone'), stoneNum);
  wood.setAttribute('aria-label', '나무'); stone.setAttribute('aria-label', '돌');
  coins.append(icon('coin'), coinNum);
  const hearts = el('span', 'hearts');
  const row1 = el('div', 'row'); row1.append(lv, xp, coins, wood, stone);
  const wx = el('div', 'wx'), wxSeason = el('span', 'season'), wxNow = el('span', 'now'), wxNext = el('span', 'next'), wxBar = el('div', 'meter soon'), wxFill = el('i');
  wxBar.append(wxFill); wx.append(wxSeason, wxNow, wxNext, wxBar);
  const town = el('div', 'town'), townBar = el('div', 'meter power'), townFill = el('i');
  townBar.append(townFill); town.append(icon('house'), townBar);
  town.setAttribute('aria-label', '마을 전기');
  const pause = el('button', 'pause', 'Ⅱ'); pause.setAttribute('aria-label', STR.paused);
  const row2 = el('div', 'row'); row2.append(wx, hearts, town, pause);
  top.append(row1, row2);

  const wrap = el('div', 'board'), cv = el('canvas', 'art'), toast = el('div', 'toast'), center = el('div', 'center');
  toast.setAttribute('role', 'status');
  wrap.append(cv, toast, center);
  // no build menu: the map's circles are the buttons. The bottom bar only holds 시작, then goes.
  const bar = el('nav', 'bar');
  app.append(top, wrap, bar);

  let rec: number | null = null;
  let speed = 1, paused = false, terrainDirty = true;
  const popups: { x: number; y: number; text: string; rgb: readonly [number, number, number]; born: number }[] = [];
  let frameNow = 0;
  const flashes: { cells: number[]; kind: 'sand' | 'ice' | 'rain' | 'sun'; until: number }[] = [];

  const say = (t: string, ic: SpriteName | null = null, ms = 1800) => {
    toast.textContent = '';
    if (ic) toast.append(icon(ic));
    toast.append(el('span', '', t));
    toast.classList.add('on');
    clearTimeout((toast as unknown as { t: number }).t);
    (toast as unknown as { t: number }).t = window.setTimeout(() => toast.classList.remove('on'), ms);
  };
  // the star: recomputed in the background (one look-ahead per frame) when coins or buildings change
  let recJob: Generator<void, number | null> | null = null, recKey = '', recAt = -1e9;
  const recKeyNow = () => `${w.built.join()}|${w.map.sites.filter(st => canBuild(w, st.id)).map(st => st.id).join()}`;
  const stepRecommendation = (now: number) => {
    const key = recKeyNow();
    if (!recJob && (key !== recKey || now - recAt > 3000) && w.phase !== 'won' && w.phase !== 'lost') { recJob = recommendSteps(w); recKey = key; recAt = now; }
    if (!recJob) return;
    const t0 = performance.now();
    while (recJob && performance.now() - t0 < 3) { const r = recJob.next(); if (r.done) { rec = r.value; recJob = null; needDraw = true; } }
  };
  pause.addEventListener('click', () => { paused = true; showPause(); });

  // ---- board: one art buffer, shown at a whole-number scale of device pixels
  cv.width = AW; cv.height = AH;
  const ctx = cv.getContext('2d') as CanvasRenderingContext2D;
  const art = createArt(), frameImg = new ImageData(art.rgba as Uint8ClampedArray<ArrayBuffer>, AW, AH); // shares the art buffer: no per-frame copy
  let scale = 1, shownBags = 0, shownSeason = -1;
  /** Repaint only when something changed: a sim tick, building mode (pulsing star), spirit flashes, a resize. */
  let needDraw = true;
  const fit = () => {
    const r = wrap.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    scale = Math.max(1, Math.floor(Math.min((r.width * dpr) / AW, (r.height * dpr) / AH)));
    cv.style.width = `${(AW * scale) / dpr}px`; cv.style.height = `${(AH * scale) / dpr}px`;
    cv.dataset.scale = String(scale);
    setPixel(scale / dpr);
    needDraw = true;
  };
  const ro = new ResizeObserver(fit); ro.observe(wrap); fit();
  const dprWatch = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
  dprWatch.addEventListener?.('change', fit);

  const draw = (frame: number) => {
    if (seasonKey(seconds(w), w.seasons) !== shownSeason) { shownSeason = seasonKey(seconds(w), w.seasons); terrainDirty = true; }
    for (let k = popups.length - 1; k >= 0; k--) if (frame > popups[k].born + 40) popups.splice(k, 1);
    // numbers only rise 1 px every 3 frames: with nothing else changing, redraw for them every 3rd frame
    // the star pulses every 8 frames and numbers rise 1 px every 3: with nothing else changing, redraw only then
    const anim = (rec !== null && frame % 8 === 0) || (popups.length > 0 && frame % 3 === 0);
    if (!needDraw && !flashes.length && !terrainDirty && !anim) return;
    needDraw = false;
    // repaint the ground only when it changes (building, spirits, a sandbag expiring)
    if (terrainDirty || w.sandbags.size !== shownBags) { paintTerrain(art, w); terrainDirty = false; shownBags = w.sandbags.size; }
    paintWater(art, w, reduced ? 0 : Math.floor(w.tick / 2));
    for (let k = flashes.length - 1; k >= 0; k--) if (frame > flashes[k].until) flashes.splice(k, 1);
    paintSprites(art, w, {
      rec: rec !== null && canBuild(w, rec) ? rec : null, canBuild: st => canBuild(w, st), waiting: st => waiting(w, st), frame, reduced,
      lit: w.lastSecPower >= demand(w) || w.tick < T.tps, flashes,
      floodArrow: w.floodCooldown > 0 ? w.floodFrom : -1,
      canUpgrade: st => canUpgrade(w, st),
      popups: popups.map(p => ({ x: p.x, y: p.y - Math.floor((frame - p.born) / 3), text: p.text, rgb: p.rgb })),
      storm: w.phase === 'run' && weatherAt(Math.min(seconds(w), w.totalSec - 1e-6), w.seasons).now.kind === 'storm',
    });
    ctx.putImageData(frameImg, 0, 0);
  };

  // ---- input: tap a site (sites are in cell coordinates)
  // numbers that float up where something was gained
  const POP: Record<Gain['what'], readonly [number, number, number]> = { power: [125, 226, 255], coins: [255, 209, 102], wood: [215, 155, 82], stone: [195, 204, 211] };
  const pop = (g: Gain) => {
    const text = '+' + g.amount, cx = (g.cell % W) * ART + 1, cy = ((g.cell / W) | 0) * ART + 1;
    popups.push({ x: Math.max(1, Math.min(AW - text.length * 8 - 1, cx - text.length * 4)), y: Math.max(14, cy - 18), text, rgb: POP[g.what], born: frameNow });
    if (popups.length > 40) popups.shift();
    needDraw = true;
  };
  const needText = (n: { coins?: number; wood: number; stone: number }) => (['coins', 'wood', 'stone'] as const).filter(k => (n[k] ?? 0) > 0).map(k => `${STR.matName[k]} ${n[k]}`).join(' · ');

  // ---- input: tap a build spot, a building (upgrade / repair), or a tree, rock, flower, bush (gather)
  cv.addEventListener('click', e => {
    const r = cv.getBoundingClientRect();
    const gx = ((e.clientX - r.left) / r.width) * W, gy = ((e.clientY - r.top) / r.height) * H;
    let best = -1, bd = 12;
    for (const st of w.map.sites) { const d = (st.x - gx) ** 2 + (st.y - gy) ** 2; if (d < bd) { bd = d; best = st.id; } }
    if (best < 0) {
      // gatherables are drawn standing on their cell, so aim a little above it
      let node = -1, nd = 9;
      w.nodes.forEach((n, k) => { if (!n.kind) return; const d = ((n.cell % W) - gx) ** 2 + (((n.cell / W) | 0) - 1.2 - gy) ** 2; if (d < nd) { nd = d; node = k; } });
      if (node < 0) return;
      const g = gather(w, node);
      if (g) { pop(g); buzz(10); sfx.play(g.what === 'wood' ? 'wood' : g.what === 'stone' ? 'stone' : 'coin'); }
      return;
    }
    const st = w.map.sites[best];
    if (!w.built[best]) {
      if (placeBuilding(w, best)) { const nw = w.plants.length; say(st.build === 'wheel' && nw > 1 ? `${STR.grid} ${nw}개 · 전기 +${Math.round(T.synergy * (nw - 1) * 100)}%` : STR.built[st.build], B[st.build]); buzz(15); sfx.play('build'); terrainDirty = true; needDraw = true; rec = null; }
      else if (w.phase !== 'won' && w.phase !== 'lost') { const n = lacking(w, best); say(`${needText(n)} ${STR.need}`, n.coins ? 'coin' : n.wood ? 'log' : 'stone'); buzz(30); sfx.play('deny'); }
      return;
    }
    const p = w.plants.find(pp => pp.site === best);
    if (p && p.hp <= 0) { if (repair(w, best)) { say(STR.repaired, 'wheel0'); buzz(15); sfx.play('build'); } else { say(STR.noCoins, 'coin'); sfx.play('deny'); } return; }
    // a standing building: upgrade it with wood and stone
    const c = upgradeCost(w, best);
    if (!c) { say(STR.maxLevel, B[st.build]); return; }
    if (upgrade(w, best)) { say(`${STR.built[st.build].split(/[를을]/)[0]} ★${w.lvl[best]} ${STR.upgraded}`, 'up'); buzz(15); sfx.play('upgrade'); terrainDirty = true; needDraw = true; }
    else { say(`${STR.upNeed}: ${needText(c)}`, 'up'); buzz(30); sfx.play('deny'); }
  });

  // ---- overlays
  const overlay = (cls: string, ...kids: HTMLElement[]) => { center.textContent = ''; center.className = 'center on ' + cls; center.append(...kids); };
  const clearOverlay = () => { center.textContent = ''; center.className = 'center'; };
  const startBtn = el('button', 'go'); startBtn.append(icon('play', 'x2'), el('span', '', STR.start));
  startBtn.addEventListener('click', () => { start(w); bar.remove(); buzz(15); sfx.play('start'); });
  const showReady = () => { clearOverlay(); bar.append(startBtn); say(STR.ready, 'star', 4000); };
  const showLevel = () => {
    const kids: HTMLElement[] = [el('h2', '', STR.levelUp)];
    for (const c of w.cards) {
      const evo = c === 'penstock', b = el('button', 'card' + (evo ? ' evo' : ''));
      const lvNow = c === 'coins' ? 0 : w.skill[c];
      b.append(icon(CARD[c].icon, 'x3 ic'), el('b', '', CARD[c].name + (c === 'coins' || evo ? '' : ' ' + '★'.repeat(lvNow + 1))), el('span', 'desc', CARD[c].desc));
      b.addEventListener('click', () => { chooseCard(w, c); clearOverlay(); lastOverlay = ''; buzz(10); sfx.play('card'); });
      kids.push(b);
    }
    overlay('level', ...kids);
    sfx.play('levelup');
    buzz(20);
  };
  const showEnd = () => {
    // book the run once: gems, records, first-clear unlocks; the saved run is finished
    const meta = loadMeta(store), res = finishRun(meta, w);
    saveMeta(store, meta); clearRun(store);
    const won = w.phase === 'won', last = w.stage + 1 >= STAGES.length;
    const title = won ? (last ? STR.allClear : STR.won) : w.endless ? `${w.extraSeasons} ${STR.endlessOver}` : STR.lost;
    const kids: HTMLElement[] = [el('h2', '', title)];
    const hs = el('p', 'starline');
    for (let k = 0; k < maxHearts; k++) hs.append(icon(k < w.hearts ? 'heart' : 'heartEmpty', 'x2'));
    const sum = el('p', 'sum'); sum.append(el('span', '', `Lv ${w.level}`), icon('wheel0'), el('span', '', String(w.plants.length)), icon('gem'), el('span', '', `+${res.gems}`));
    kids.push(hs, sum);
    if (res.newSkill) { const c = el('div', 'card bonus'); c.append(icon(CARD[res.newSkill].icon, 'x2 ic'), el('b', '', `${STR.bonus} ${CARD[res.newSkill].name}`), el('span', 'desc', CARD[res.newSkill].desc)); kids.push(c); }
    if (res.newChar) { const ch = CHARS.find(c => c.id === res.newChar)!; const c = el('div', 'card bonus'); c.append(icon(CHAR_ICON[ch.id], 'x2 ic'), el('b', '', `${STR.newChar} ${ch.name}`), el('span', 'desc', ch.desc)); kids.push(c); }
    // ways on, in one row: the main choice (다음 스테이지 when there is one) sits in the middle and is the biggest
    const next = (won || w.endless) && !last;
    const mk = (label: string, primary: boolean, fn: () => void, play = false) => {
      const b = el('button', 'big' + (primary ? ' primary' : ' alt'));
      if (play) b.append(icon('play', 'x2'));
      b.append(el('span', '', label)); b.addEventListener('click', fn); return b;
    };
    const keepBtn = won ? mk(STR.keepGoing, !next, () => { continueEndless(w); clearOverlay(); lastOverlay = ''; terrainDirty = true; say(STR.keepHint, 'sun', 2600); buzz(15); }) : null;
    const nextBtn = next ? mk(STR.next, true, () => showPlay(createHydro(Date.now() % 100000, runOptions(loadMeta(store), w.stage + 1, w.char)))) : null;
    const againBtn = !won && !w.endless ? mk('↻ ' + STR.again, true, () => showPlay(createHydro(Date.now() % 100000, runOptions(loadMeta(store), w.stage, w.char)))) : null;
    const homeBtn = mk(STR.home, false, showMain);
    const main = nextBtn ?? keepBtn ?? againBtn;
    const side = [keepBtn && keepBtn !== main ? keepBtn : null, homeBtn].filter(Boolean) as HTMLButtonElement[];
    const rowEl = el('div', 'btnrow ' + (side.length === 2 ? 'three' : 'two'));
    if (side.length === 2) rowEl.append(side[0], main!, side[1]);
    else rowEl.append(main!, side[0]);
    kids.push(rowEl);
    overlay(won ? 'won' : 'lost', ...kids);
    sfx.play(won ? 'win' : 'lose');
  };
  const showPause = () => {
    const resume = el('button', 'big'); resume.append(icon('play', 'x2'), el('span', '', STR.resume)); resume.addEventListener('click', () => { paused = false; clearOverlay(); lastOverlay = ''; });
    const fast = el('button', 'big alt', `${STR.speed} ${speed === 1 ? '2×' : '1×'}`);
    fast.addEventListener('click', () => { speed = speed === 1 ? 2 : 1; fast.textContent = `${STR.speed} ${speed === 1 ? '2×' : '1×'}`; });
    // 메인으로 keeps the run: the main menu offers 계속하기
    const home = el('button', 'big alt', STR.home); home.addEventListener('click', () => { saveRun(store, w); showMain(); });
    // sound on / off (kept between runs)
    const snd = el('button', 'big alt'); snd.setAttribute('role', 'switch');
    const syncSnd = () => { snd.textContent = `${STR.sound} ${sfx.on ? STR.on : STR.off}`; snd.setAttribute('aria-checked', String(sfx.on)); };
    snd.addEventListener('click', () => { sfx.setOn(!sfx.on); const m = loadMeta(store); m.sound = sfx.on; saveMeta(store, m); syncSnd(); sfx.play('card'); });
    syncSnd();
    overlay('pause', el('h2', '', STR.paused), resume, fast, snd, home);
  };

  // ---- HUD (icons rebuilt only when what they show changes)
  let lastForecast: unknown = null, shownHearts = -1, shownNow = '', shownNext = '';
  const hud = () => {
    lv.textContent = `Lv ${w.level}`;
    xpFill.style.width = `${Math.min(100, (100 * w.xp) / xpNeed(w.level))}%`;
    coinNum.textContent = String(w.coins); woodNum.textContent = String(w.mats.wood); stoneNum.textContent = String(w.mats.stone);
    if (shownHearts !== w.hearts) {
      shownHearts = w.hearts; hearts.textContent = '';
      for (let k = 0; k < maxHearts; k++) hearts.append(icon(k < w.hearts ? 'heart' : 'heartEmpty'));
      hearts.setAttribute('aria-label', `하트 ${Math.max(0, w.hearts)}개`);
    }
    const sec = seconds(w), f = weatherAt(Math.min(sec, w.totalSec - 1e-6), w.seasons);
    wxSeason.textContent = w.seasons[seasonAt(Math.min(sec, w.totalSec - 1e-6), w.seasons).si].name;
    if (shownNow !== f.now.kind) { shownNow = f.now.kind; wxNow.textContent = ''; wxNow.append(icon(WX[f.now.kind].icon)); wxNow.setAttribute('aria-label', WX[f.now.kind].name); }
    const soon = !!f.next && f.nextIn <= T.forecastSeconds;
    const nextKey = soon && f.next ? f.next.kind + (f.next.boss ? '!' : '') : '';
    if (shownNext !== nextKey) {
      shownNext = nextKey; wxNext.textContent = '';
      if (soon && f.next) { wxNext.append(el('span', 'arrow', '→'), icon(WX[f.next.kind].icon)); if (f.next.boss) wxNext.append(el('span', 'boss', '!')); }
    }
    wxBar.hidden = !soon;
    if (soon) wxFill.style.width = `${100 * (1 - f.nextIn / T.forecastSeconds)}%`;
    if (soon && f.next && lastForecast !== f.next) { lastForecast = f.next; say(`${WX[f.next.kind].name}${f.next.boss ? '!!' : ''} ${STR.soon}`, WX[f.next.kind].icon); sfx.play('forecast'); }
    const ratio = w.tick < T.tps ? 1 : w.lastSecPower / demand(w);
    townFill.style.width = `${Math.min(100, ratio * 100)}%`;
    town.classList.toggle('short', ratio < 1);
  };

  // ---- loop
  let raf = 0, acc = 0, last = performance.now(), frame = 0, lastOverlay = '';
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused && w.phase === 'run') {
      acc += dt * T.tps * speed;
      let n = 0;
      while (acc >= 1 && n++ < 8 && w.phase === 'run') {
        tick(w); acc -= 1; needDraw = true;
        for (const g of w.gains) pop(g);
        if (w.events.spirit) { flashes.push({ cells: w.events.spirit.cells, kind: w.events.spirit.kind, until: frame + 40 }); terrainDirty = true; sfx.play('spirit'); }
        if (w.events.disaster) {
          const d = w.events.disaster;
          say(d.kind === 'jam' ? STR.jam : d.kind === 'burst' ? STR.burst : STR.slide, d.kind === 'slide' ? 'slide' : 'jam', 2800);
          flashes.push({ cells: d.cells, kind: d.kind === 'slide' ? 'sand' : 'ice', until: frame + 30 }); terrainDirty = true; buzz(60); sfx.play('disaster');
        }
        if (w.events.seasonSurvived) { say(`${w.events.seasonSurvived}${STR.survived}`, 'star', 2600); buzz(20); sfx.play('season'); terrainDirty = true; }
        if (w.events.lostHeart) { say(w.events.lostHeart === 'blackout' ? STR.lostBlackout : STR.lostFlood, w.events.lostHeart === 'blackout' ? 'houseDark' : 'drown', 2600); buzz(80); sfx.play('heart'); }
      }
      if (n >= 8) acc = 0;
    } else acc = 0;
    const want = paused ? 'pause' : w.phase === 'ready' ? 'ready' : w.phase === 'levelup' ? 'level' : w.phase === 'won' || w.phase === 'lost' ? 'end' : '';
    if (want !== lastOverlay) {
      lastOverlay = want;
      needDraw = true;
      if (want === 'ready') showReady(); else if (want === 'level') showLevel(); else if (want === 'end') showEnd();
      else if (want === '') clearOverlay();
    }
    if (w.phase !== 'ready' && bar.isConnected) bar.remove();
    stepRecommendation(now);
    if (now - lastSave > 10000) { lastSave = now; autosave(); }
    hud(); frameNow = frame; draw(frame++);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  stop = () => { cancelAnimationFrame(raf); ro.disconnect(); dprWatch.removeEventListener?.('change', fit); document.removeEventListener('visibilitychange', onHide); };
}

// ?play starts stage 1 at once (tests); ?stage=n&char=id picks; otherwise the main menu
if (q.has('play')) {
  const m = loadMeta(store), st = Number(q.get('stage') ?? 1) - 1, ch = (q.get('char') as CharId | null) ?? 'miller';
  showPlay(createHydro(Number(q.get('seed') ?? 1), runOptions(m, Math.max(0, st), ch)));
} else showMain();
