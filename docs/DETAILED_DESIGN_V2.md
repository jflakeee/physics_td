# Physics TD v2 — 상세 설계서

> 작성일: 2026-11-08 · 기준: [v2.2 통합 설계서](GAME_DESIGN_V2.md) · v2.2: [부족분 검토](DESIGN_GAP_REVIEW_V2.md) 반영 (규칙·수치의 원본) · 본 문서: **구현 단위 명세**
> 표기: `코드`는 식별자, **[GD x.y]** = 통합 설계서 해당 절. 수치가 통합 설계서와 다르면 통합 설계서가 우선.

---

## 1. 공통 규약

| 항목 | 규약 |
|---|---|
| 언어/빌드 | TypeScript 5 `strict`, esbuild 번들(ESM), 대상 ES2020 |
| 테스트 | `node --test` + `tsx`(TS 실행), e2e는 Playwright |
| 좌표 | 시뮬 셀 `(x, y)`, `0 ≤ x < 64`, `0 ≤ y < 96`, 인덱스 `i = y*64 + x`. y는 아래로 증가(북=0) |
| 타일 | 맵 저작 단위 8×8 셀. 타일 좌표 `(tx, ty)`, `0 ≤ tx < 8`, `0 ≤ ty < 12` |
| 시간 | 1 tick = 1/30 게임 초. 문서의 "초" = 30 tick [GD 3.1] |
| 수치 타입 | 시뮬 배열 `Float32Array`, 점수·자금·경험치는 정수(반올림은 tick 누적 후 웨이브 종료 시 1회) |
| 결정성 | 같은 `seed` + 같은 명령 로그 → 같은 결과. 반복 순서 고정, `Math.random` 금지, 시간 의존 금지. **보장 범위 = 같은 기기·같은 빌드**. 노이즈는 정수 해시(`Math.sin` 금지), 성장 계수(1.35^n)는 상수 표 |
| 난수 | `sfc32` PRNG, 용도별 **독립 스트림** 3개: `rng.cards`, `rng.events`, `rng.weather` (다시 뽑기를 써도 사건 순서가 바뀌지 않게) |
| 의존 방향 | `ui → game → rules → sim`, `render → (game 읽기 전용)`, `input → game(명령만)`. **sim·rules는 DOM 금지** |
| 문자열 | 모든 UI 문자열은 `i18n/ko.json` 키로. 코드에 한국어 하드코딩 금지 |

---

## 2. 디렉터리와 모듈

```
src/
  main.ts                 부트스트랩, 루프
  core/rng.ts             sfc32, 스트림 분리, 상태 직렬화
  core/types.ts           공통 타입 (3장)
  sim/
    grid.ts               SimGrid 생성/복제, 인덱스 유틸
    terrain.ts            타일 → 높이맵·구역·제방선 생성 (11.2)
    fluid.ts              흐름 (4.2)
    structures.ts         제방 내구도·붕괴, 수문, 임시벽 수명 (4.3)
    sinks.ts              펌프·배출구·증발·흡수 (4.4)
    ice.ts                결빙·융해
    inflow.ts             유입 펄스 (4.5)
    metrics.ts            지표 누적 (4.7)
    step.ts               tick 파이프라인 (4.1)
  rules/
    skills.ts             스킬 실행·검증 (6장)
    effects.ts            효과 op 레지스트리 (6.3)
    leveling.ts           경험치·레벨 (7.1)
    cards.ts              카드 생성 (7.2)
    fusion.ts             융합 판정 (7.4)
    scoring.ts            결과 점수 (8장)
    endings.ts            성향 축·엔딩 판정 (9장)
    events.ts             돌발 사건·예보·위험 계약 (5장)
  game/
    state.ts              RunState 생성·스냅샷
    machine.ts            상태 머신 (10장)
    commands.ts           명령 검증·적용·로그 (12장)
    checkpoint.ts         웨이브 체크포인트
  render/
    canvas.ts             크기·DPR
    terrainLayer.ts  waterLayer.ts  overlayLayer.ts  fx.ts
  input/
    gestures.ts           제스처 인식 (14.1)
    hit.ts                화면 → 셀 → 구역 (14.2)
    targeting.ts          대상 선택 모드 (14.3)
  ui/
    screens/mapSelect.ts briefing.ts play.ts levelUp.ts result.ts defeat.ts settings.ts
    widgets/hud.ts skillBar.ts toast.ts compass.ts card.ts sheet.ts
  save/storage.ts         저장·마이그레이션 (16장)
  audio/sfx.ts  haptics.ts
data/
  maps/*.json  characters/*.json  skills/*.json  fusions.json  events.json  endings.json
i18n/ko.json
tests/ (20장)   bots/ (21장)
```

---

## 3. 핵심 타입

```ts
// core/types.ts
export type ZoneType = 'plain'|'forest'|'hill'|'field'|'wetland'|'reservoir'|'base';
export type Axis = 'safety'|'conquest'|'harmony'|'harvest';
export type CharId = 'dike-keeper'|'wetland-researcher'|'engineer'|'hydro-tech';
export type SkillSlot = 'passive'|'basic'|'tactical'|'ultimate';
export type Rarity = 'common'|'rare'|'legendary';
export type Affinity = 'home'|'neutral'|'challenge';

export interface SimGrid {
  w: Float32Array;      // 물
  ice: Float32Array;    // 얼음
  h: Float32Array;      // 지면고
  wall: Float32Array;   // 제방 높이 (영구)
  tmp: Float32Array;    // 임시벽 높이 (모래주머니)
  tmpTtl: Uint16Array;  // 임시벽 남은 tick
  dur: Float32Array;    // 제방 내구도 0..1.6
  zone: Uint8Array;     // 구역 id (0 = 없음)
  health: Float32Array; // 숲·습지 건강도 0..1
  flags: Uint8Array;    // 비트: 1 outlet, 2 inlet, 4 baseCore, 8 gateCell
  floodTicks: Uint16Array; // 수위 ≥0.1 연속 tick (숲 피해용)
  flowBias: Float32Array;   // 셀별 (bx,by) ×2, 확장(물길 돌리기)용 — 출시 범위 0
  store: Float32Array;      // 저류량, 확장(수로 기술자)용
}

export interface Zone { id: number; type: ZoneType; cells: Uint32Array;
  tiles: [number, number][]; leveeLines: LeveeLine[]; center: [number, number];
  opened?: boolean;          // 범람원 개방 여부
  convertTtl?: number;       // 습지 전환 남은 tick
}
export interface LeveeLine { id: number; cells: Uint32Array; facing: [number, number]; built: boolean; }
export interface Gate { id: number; cells: Uint32Array; kind: 'normal'|'reservoir'; open: boolean; }
export interface Pump { id: number; cell: number; on: boolean; }

export interface OwnedSkill { id: string; rank: 1|2|3; borrowed: boolean; cd: number; }
export interface RunState {
  mapId: string; charId: CharId; seed: number; affinity: Affinity;
  sim: SimGrid; zones: Zone[]; gates: Gate[]; pumps: Pump[];
  phase: 'prepare'|'wave'|'levelup'|'result'|'defeat';
  wave: number; waveTick: number; speed: 1|2; paused: boolean;
  hp: number; cash: number; tick: number;
  xp: number; level: number; pendingLevelUps: number; rerollsLeft: number;
  skills: OwnedSkill[]; commonCd: { freeze: number }; ultGauge: number;
  modifiers: Record<string, number>;   // 패시브·융합·정비 카드 누적
  axes: Record<Axis, number>;
  fusions: string[]; skips: number; retries: number; lateLevels: number;
  contract: { active: boolean; damageThisWave: number; wins: number };
  events: { scheduled: ScheduledEvent|null; log: string[] };
  forecast: Forecast[];
  metrics: Metrics; playScore: number;
  cardsSinceFusionOffer: number;
  rngState: { cards: number[]; events: number[]; weather: number[] };
}
```

---

## 4. 시뮬레이션 상세

### 4.1 tick 파이프라인 (`sim/step.ts`)
`phase === 'wave' && !paused`일 때만 실행. 순서 고정.

| 순서 | 단계 | 함수 |
|---|---|---|
| 1 | 예약 사건 발동 체크 | `events.tick` |
| 2 | 유입 펄스 | `inflow.apply` |
| 3 | 흐름 계산·적용 | `fluid.step` |
| 4 | 결빙(긴급 결빙은 즉시형이라 여기선 없음)·융해 | `ice.melt` |
| 5 | 싱크: 펌프(상한) → 배출구 → 습지/숲 흡수 → 증발(수심 비례) | `sinks.apply` |
| 6 | 구조물: 제방 내구도·붕괴, 임시벽 수명, 습지 전환 진행 | `structures.update` |
| 7 | 숲 건강도 갱신 | `metrics.ecology` |
| 8 | 기지 피해 | `damage.apply` |
| 9 | 지표·플레이 점수·경험치·궁극기 게이지·쿨다운 감소 | `metrics.accumulate`, `leveling.addXp` |
| 10 | 종료 판정: HP 0 → defeat (우선) / `waveTick ≥ waveLen` → 웨이브 종료 | `step` |

### 4.2 흐름 (`sim/fluid.ts`) — 순서 무관·질량 보존
가상 파이프 방식의 단순화. 2패스로 **반복 순서에 따른 편향 제거**.
```
H_i = h_i + wall_i + tmp_i + ice_i + w_i                      // 수두
gateCell 닫힘이면 wall 대신 0.8 사용 [GD 3.0]
flowBias(확장): out_ij *= 1 + dot(bias_i, dir_ij) (출시 범위에서는 항상 0)
pass 1: 각 셀 i, 4이웃 j에 대해
   out_ij = max(0, H_i − H_j) × K                              // K = 0.20
   total_i = Σ_j out_ij
   s_i = total_i > w_i ? w_i / total_i : 1                      // 가진 물보다 많이 못 보냄
pass 2: w'_i = w_i − Σ_j out_ij·s_i + Σ_j out_ji·s_j
```
- 맵 경계 밖은 벽(유출 없음). 유출은 배출구 셀로만.
- 안정성: `K × 4 ≤ 1` 이므로 진동 없음(테스트 SIM-04).
- 비용: 6144셀 × 4이웃 × 2패스 ≈ 5만 연산/tick → 목표 < 0.5ms.

### 4.3 구조물 (`sim/structures.ts`)
```
제방 셀 c (wall_c > 0):
  pressure = max_j∈이웃 clamp(h_j + w_j − h_c, 0, wall_c)
  dur_c −= 0.02 × pressure / 30 × (1 / mod.wallDurabilityMul)     // 초당 0.02×압력
  dur_c ≤ 0 → wall_c = 0, dur_c = 0, fx('collapse', c), highlight 기록
임시벽: tmpTtl_c−−, 0이면 tmp_c = 0
습지 전환: zone.convertTtl−−, 0이면 type='wetland', 셀 h −= 0.3, health = 1
```
- 제방 생성 시 `dur = 1.0`. 둑지기 패시브는 `mod.wallDurabilityMul = 1.3 / 1.45 / 1.6` (Rank1~3).

### 4.4 싱크 (`sim/sinks.ts`)
| 싱크 | 식 (tick당) | 지표 |
|---|---|---|
| 펌프(on) | 반경 3셀 원 내 셀을 고정 순서로 `d = min(w, 0.015, budget)` 제거. `budget = 0.25 × I_3 / waveLen_3` (펌프당 tick 상한). 자금 −1/30 누적. 동시 가동 최대 2대 | `drained` |
| 배출구 셀 | `d = min(w, 0.05)` | `drained` |
| 습지 흡수 | `wetland` 셀 `d = min(w, 0.004 × mod.absorbMul)` (패시브 보유 시만, 강의 숨 ×3) | `drained` |
| 숲 흡수 | `forest` 셀 `d = min(w, 0.004 × mod.absorbMul × 0.5)` (패시브 보유 시만) | `drained` |
| 녹색 제방(융합) | 제방 셀의 **안쪽 이웃**(기지 거리장 값이 더 작은 이웃) `d = min(w, 0.003)` | `drained` |
| 증발 | 모든 셀 `d = w × 0.00002` | (지표 제외) |

- 자금이 0이 되면 모든 펌프 `on=false` + 토스트 `toast.cashEmptyPumps`.

### 4.5 유입 (`sim/inflow.ts`)
```
웨이브 w의 총 유입량 I_w = map.I1 × GROWTH[w] × (contract.active ? 1.3 : 1) × peakMul(w)   // GROWTH = [1, 1.35, 1.8225, 2.4604, 3.3215]
강우 비율 r = peak 발생 웨이브면 0.4, 아니면 map.rain(기본 0.2)
펄스 주기 P = map.pulseEvery (tick), 펄스 수 N = floor(waveLen / P)
펄스 1회 유입구 k의 양 = I_w × (1−r) / N × weight_k(w) / Σ weight(w)
펄스 1회 강우 = I_w × r / N / 6144 (전 셀 균등)
유입구 셀(3셀 폭)에 균등 분배, 셀당 상한 w ≤ 2.0
```
- `waveLen = 30 × (40 + 7.5 × (w−1))` → W1 1200 tick, W5 2100 tick, 합계 8250 tick [GD 17, v2.2].
- `peakMul(w)`: 예보된 피크 이벤트가 이번 웨이브에 발생하면 `map.peak.mul`(기본 1.5), 아니면 1.

### 4.6 기지 피해
```
flood = Σ baseCore 3×3 셀의 w
dmgPerTick = max(0, flood − 1.2) × 2 / 30
hpAcc += dmgPerTick; 정수부가 생기면 hp −= 정수부   (HP는 정수, 누적 소수부 유지)
contract.damageThisWave += 정수부
```

### 4.7 지표 (`sim/metrics.ts`) [GD 16]
| 지표 | 누적 방식 | 플레이 점수 변환 [GD 6.1] |
|---|---|---|
| `drained` | 싱크 제거량 합 (증발 제외) | 1.0당 +0.3 |
| `noDamageWave` | 웨이브 피해 정수부 0 | 웨이브당 +60 (기지 이동 중 웨이브는 0) |
| `blocked` | `Σ_제방셀 min(인접 최대 수심, wall) × 0.01` | 1.0당 +0.35 |
| `ecology` | `Σhealth(숲·습지) / 초기 숲·습지 셀 수 × 100`, 최대 150 | **최고치 갱신분** 1%당 +8 |
| `waveClear` | 웨이브 종료 | +100 |

- 점수는 float로 누적(`playScoreF`), 정수 증가분만큼 `xp`에도 동일 가산.
- 위험 계약 웨이브: 이 웨이브에 발생한 경험치 증가분 × 1.5 (점수는 ×1 — **점수와 경험치가 갈라지는 유일한 예외**).

### 4.8 궁극기 게이지
| 캐릭터 | 충전원 | 충전량 |
|---|---|---|
| 둑지기 | `blocked` | 1.0당 +0.5 (판당 약 2회 충전, v2.2 보정) |
| 습지 연구원 | `ecology` 최고치 갱신 | 1%당 +5 |
| (확장) 공병대장 | 자재 획득 | 1당 +2 |
| (확장) 수로 기술자 | 저류량 | 1.0당 +4 |
- 0~100, 100이면 사용 가능. 교차 스킬은 궁극기가 없으므로 게이지는 자기 캐릭터 기준만.
- 목표: 정석 플레이 판당 궁극기 2회(W2·W4 무렵). 충전 계수는 봇으로 보정.

### 4.9 확장 훅 (출시 범위에서는 비활성, 구조만 구현)
| 훅 | 용도 | 출시 상태 |
|---|---|---|
| `baseCore` 가변 배열 | 기지 이전(`moveBase` op) — 피해 판정·거리장 재계산 | 고정 |
| `flowBias` 벡터장 | 물길 돌리기(`biasFlow` op) | 0 |
| `store` / 저류 수문 | 저류(`storeWater` op), 저류 → 자금 | 미사용 |

---

## 5. 웨이브·사건·예보·위험 계약 (`rules/events.ts`)

### 5.1 런 시작 시 결정(`rng.weather`)
```
for each map.peak (예: {wave:4, prob:0.6, mul:1.5, kind:'storm'}):
   occurs = rng.weather() < prob
forecast[w] = { arrows: 방향별 weight, peak: {kind, prob} }   // 실제 발생 여부는 숨김
```

### 5.2 돌발 사건 (출시 4종) [GD 24.4]
웨이브 시작 시 `rng.events() < 0.20`이면 사건 1개 예약. 종류는 맵 스타일 풀에서 균등 추첨, 발동 tick은 웨이브 길이의 20~70% 구간 균등.

| id | 종류 | 효과 | 예고 |
|---|---|---|---|
| `crack` | 위기 | 압력(4.3) 최대 제방 셀 주변 5셀의 `dur −= 0.4` | 3초 전 해당 제방 깜빡임 |
| `landslide` | 위기 | 남은 웨이브 동안 유입구 하나의 weight를 시계방향 이웃 유입구로 이전 | 3초 전 화살표 이동 애니메이션 |
| `beaver` | 도움 | 무작위 `forest` 구역의 제방선 1개에 높이 0.6 제방 무료 생성 | 3초 전 비버 아이콘 |
| `birds` | 도움 | `ecology` +10 (최대 150) | 3초 전 새 그림자 |
- 풀 구성: 평야형 [crack, landslide, beaver(숲 있을 때), birds], 범람원형 [crack, landslide, birds, birds]. 도움:위기 ≈ 1:1 [GD 24.4].
- 사건 발동 시 `events.log`에 기록, 결과 화면 "이번 판의 사건" 표시.

### 5.3 위험 계약
- 준비 단계 UI 토글(기본 OFF). 웨이브 시작 시 `contract.active` 고정, 웨이브 중 변경 불가.
- 웨이브 종료 시 `contract.damageThisWave === 0`이면 `contract.wins++` (결과 점수 +80/회).

---

## 6. 스킬 시스템

### 6.1 스킬 데이터 스키마 (`data/skills/*.json`)
```json
{
  "id": "build-levee",
  "owner": "dike-keeper",
  "slot": "basic",
  "axis": "safety",
  "target": "zone",                 // zone | gate | swipe | global | none(passive)
  "zoneTypes": ["plain"],
  "cooldown": 0,                     // 초
  "cost": 20,
  "borrowable": true,
  "ranks": [
    { "ops": [{ "op": "buildLevee", "height": 0.3 }] },
    { "ops": [{ "op": "buildLevee", "height": 0.4 }] },
    { "ops": [{ "op": "buildLevee", "height": 0.5 }] }
  ],
  "icon": "levee", "i18n": "skill.buildLevee"
}
```

### 6.2 출시 스킬 전체 (10개)
| id | 소유 | 슬롯 | target | 쿨다운 | 비용 | Rank1 / 2 / 3 |
|---|---|---|---|---|---|---|
| `pump` | 공통 | — | pump 오브젝트 | — | 1/초 | (강화 없음) |
| `freeze` | 공통 | — | zone(all) | 60 | 0 | 구역 물 50% → 얼음 |
| `dike-passive` | 둑지기 | passive | none | — | — | 내구도 ×1.30 / 1.45 / 1.60 |
| `build-levee` | 둑지기 | basic | zone[plain] | 0 | 20 | 높이 0.3 / 0.4 / 0.5 |
| `sandbag` | 둑지기 | tactical | swipe | 25 | 0 | 높이 0.25, 지속 8 / 11 / 14초 |
| `night-repair` | 둑지기 | ultimate | global | 게이지 | 0 | 전 제방 dur=max, 높이 +0.1(웨이브 종료 시 원복) / +0.15 / +0.2 |
| `wetland-passive` | 습지 | passive | none | — | — | 흡수 `absorbMul` 1.0 / 1.4 / 1.75 (기준 0.004) |
| `open-floodplain` | 습지 | basic | zone[field] | 0 | 0 | 구역 h −0.15, `opened=true` (들판 수입 0) / −0.2 / −0.25 |
| `restore-wetland` | 습지 | tactical | zone[field, plain] | 30 | 30 | 10초 후 wetland 전환 / 8초 / 6초 |
| `river-breath` | 습지 | ultimate | global | 게이지 | 0 | 10초간 `absorbMul ×3` / 12초 / 14초 |

### 6.3 효과 op 레지스트리 (`rules/effects.ts`)
| op | 인자 | 동작 |
|---|---|---|
| `buildLevee` | height | 대상 구역 제방선 선택(6.4) → 선 셀 `wall = max(wall, height)`, `dur = 1`. 모든 선이 지어졌으면 최저 선 `wall += 0.1` (상한 0.6) |
| `tempWallPath` | height, ttl | 스와이프 경로 셀(6.5)에 `tmp = height`, `tmpTtl = ttl` |
| `repairAll` | addHeight | 모든 제방 `dur = mod.wallDurabilityMul`, `wall += addHeight`, 원복 예약 |
| `lowerZone` | dh | 구역 셀 `h −= dh`, `zone.opened = true` |
| `convertZone` | to, ttl | `zone.convertTtl = ttl` (4.3에서 진행) |
| `modifier` | key, value, mode(set/mul/add), ttl? | `modifiers[key]` 갱신, ttl 있으면 만료 예약 |
| `freezeZone` | ratio | 구역 셀 `ice += w × ratio`, `w −= w × ratio` |

- 새 스킬은 op 조합으로만 정의 → 확장 캐릭터 추가 시 op만 늘리면 됨.

### 6.4 제방선 선택 규칙
```
후보 = zone.leveeLines.filter(!built)
후보 없음 → 최저 wall 선 높이 +0.1 (상한 0.6)
dir = 다음(또는 현재) 웨이브 유입 weight 최대 유입구 → 기지 방향 벡터
선택 = argmax_line dot(line.facing, −dir)   // 물이 오는 쪽을 향한 선
```

### 6.5 스와이프 → 셀 경로
- 화면 경로를 8px 간격으로 샘플 → 셀 변환 → 연속 셀 사이 Bresenham 보간 → 폭 2(경로 법선 방향 1셀 추가).
- 길이 상한 24셀(초과분 버림), `flags.inlet`·`baseCore` 3셀 이내 셀 제외.

### 6.6 사용 검증 (`skills.canUse`) — 실패 사유 enum
| 코드 | 조건 | 토스트 키 |
|---|---|---|
| `NOT_OWNED` | 스킬 미보유 | — (버튼 없음) |
| `COOLDOWN` | cd > 0 | `toast.cooldown` |
| `NO_CASH` | cash < cost | `toast.noCash` |
| `NO_GAUGE` | 궁극기 게이지 < 100 | `toast.noGauge` |
| `BAD_TARGET` | 구역 타입 불일치 | `toast.badTarget` |
| `NO_TARGET_IN_MAP` | 맵에 대상 타입 없음 | `toast.noTargetInMap` (버튼 비활성) |
| `PAUSED` | 일시정지 중 | `toast.paused` |
| `ALREADY_DONE` | 이미 개방된 들판 등 | `toast.alreadyDone` |

### 6.7 쿨다운·성향 축
- 쿨다운은 `wave` 단계 tick에만 감소 [GD 3.1]. 준비 단계에 사용한 스킬은 즉시 효과(제방 등)가 적용되고 쿨다운은 다음 웨이브부터 감소.
- 성향 축 [GD 8.1]: 획득 +3, 강화 +1, 사용 시 `+cooldown/10`(쿨다운 0인 비용형은 +1), 패시브 보유 웨이브 종료마다 +1. 공통 스킬·대체 카드 0.

---

## 7. 경험치·카드·융합

### 7.1 레벨 (`rules/leveling.ts`)
```ts
export const xpToNext = (lv: number) => Math.round(100 * 1.35 ** (lv - 1));
addXp(run, n):
  run.xp += n
  while run.xp >= xpToNext(run.level):
     run.xp -= xpToNext(run.level); run.level++
     if run.wave === 5 && run.phase === 'wave': run.lateLevels++   // 막판 성장 [GD 6.2]
     else run.pendingLevelUps++
```

### 7.2 카드 생성 (`rules/cards.ts`)
```
rollCards(run): Card[3]
  own   = ownCandidates(run)          // 미보유 자기 스킬(궁극 포함) + Rank<3 자기 스킬 강화
  cross = crossCandidates(run)        // 다른 캐릭터의 passive/basic/tactical, 미보유,
                                      // 교차 액티브 2칸 찼으면 액티브 제외, 맵에 대상 없는 스킬 제외
  // 스파이크 보장
  if level ∈ {3} and 자기 tactical 미보유 → own 슬롯 = 자기 tactical
  if level ∈ {5} and 자기 ultimate 미보유 → own 슬롯 = 자기 ultimate
  // 상성 가중: affinity!=='challenge' 이면 맵 정석 캐릭터 소유 cross 가중 1.5 [GD 6.4]
  // 천장: cardsSinceFusionOffer ≥ 4 이면 cross 중 하나를 '융합 완성 카드'로 강제
  slots = [own 1장, cross 2장]   (cross 부족 시 own 추가 → 그래도 부족 시 대체 카드)
  각 카드 rarity = rollRarity(rng.cards)   // 70/25/5
  rarity 적용:
     rare      : 강화 카드면 +2 Rank(최대 3) / 신규 카드면 Rank2로 획득(교차는 Rank1 고정이라 rare 미적용 → common으로 재추첨)
     ※ 융합 완성 여부는 희귀도와 무관하게 ✨ 배지로만 표시 (v2.2, 희귀도 = 효과 강도)
     legendary : 숙련 해금 변형 카드로 교체(출시 범위에는 변형 없음 → rare로 강등)
  융합 완성 카드가 포함되면 cardsSinceFusionOffer = 0, 아니면 +1
```
- 다시 뽑기: `rerollsLeft−−` 후 같은 `rng.cards` 스트림으로 재생성.
- 대체 카드(보급·응급 보수·정비) [GD 6.4]는 rarity 없음.

### 7.3 카드 선택 적용
```
pick(card):
  신규 액티브 & 액티브 4칸 가득 → UI가 교체 대상 선택 → 교체된 스킬 제거(축 점수는 유지)
  borrowed 스킬은 rank 1 고정 (rare여도 1)
  axes[skill.axis] += 3 (신규) 또는 +1 (강화)
  fusion.check(run)
  pendingLevelUps−−
skip(): cash += 40, skips++, pendingLevelUps−−
```

### 7.4 융합 (`rules/fusion.ts`)
```json
// data/fusions.json
[{ "id": "green-levee", "requires": ["build-levee", "restore-wetland"],
   "ops": [{ "op": "modifier", "key": "greenLevee", "value": 1, "mode": "set" }],
   "hidden": true }]
```
- 보유 스킬 집합이 `requires`를 포함하면 즉시 발동(1회), `fusions`에 추가, 첫 발견이면 도감 기록 + 연출.
- `hidden: true`면 카드에는 "✨ 무언가 일어날 것 같다"만 표시 [GD 24.4].

---

## 8. 점수 (`rules/scoring.ts`)

```ts
result =
  playScore
  + 500                                            // 클리어
  + { home: 0, neutral: 100, challenge: 200 }[affinity]
  + buildBonus(run)                                // 8.1
  + hp * 2
  + (firstCombo ? 50 : 0)
  + (retries === 0 ? 100 : 0)
  + lateLevels * 50
  + contract.wins * 80
// 뮤테이터 배율(확장)은 마지막에 곱
```

### 8.1 빌드 보너스 정규화
```
raw.artisan  = Σ 자기 스킬 rank × 30                  (교차 0개일 때)
raw.fusion   = 교차 출처 캐릭터 수 × 80 + 발동 융합 수 × 100  (교차 ≥ 2개)
raw.restraint= skips × 90                              (skips ≥ 2)
raw.none     = 교차 스킬 수 × 60
max.artisan  = min(자기 스킬 수 × 3, 시작 Rank합 + 기대 레벨업 수) × 30
max.fusion   = min(캐릭터 수 − 1, 교차 슬롯 허용 출처 수) × 80 + 출시 융합 수 × 100
max.restraint= 기대 레벨업 수 × 90
bonus = max over 해당 유형 of min(300, 300 × raw / max)
```
- `기대 레벨업 수 = 6` (상수, 밸런스 후 조정). 출시 범위 값: max.artisan = min(12, 2+6)×30 = 240, max.fusion = 1×80 + 1×100 = 180, max.restraint = 540.
- 테스트 SCO-03: 각 유형 이론 최대 입력 시 정확히 300.

### 8.2 별
- ⭐1 클리어, ⭐2 hp ≥ 70, ⭐3 result ≥ `map.star3Score`.

---

## 9. 엔딩 (`rules/endings.ts`)

```ts
main = AXIS_OF[charId]
others = axes 중 main 제외
sub = argmax(others); subOk = axes[sub] >= 0.3 * axes[main]
endingId = subOk ? `${charId}+${sub}` : `${charId}`
secret 'confluence': 모든 보유 캐릭터 축(출시: 2축) 값의 (max−min)/max ≤ 0.2 && 무피해 클리어
   → secret이면 endingId = 'confluence' (도감 별도 칸)
```
| endingId (출시) | i18n 키 |
|---|---|
| `dike-keeper` | `ending.dikeSolo` |
| `dike-keeper+harmony` | `ending.dikeHarmony` |
| `wetland-researcher` | `ending.wetSolo` |
| `wetland-researcher+safety` | `ending.wetSafety` |
| `confluence` | `ending.confluence` |

- 나침반: `axes` 4값을 극좌표 벡터 합으로 바늘 방향 계산, 탭 시 `resolveEnding(run)` 결과를 "예상 엔딩"으로 표시.

---

## 10. 상태 머신 (`game/machine.ts`)

| 현재 | 이벤트 | 가드 | 다음 | 동작 |
|---|---|---|---|---|
| `boot` | loaded | 이어하기 데이터 있음 | `resumePrompt` | |
| `boot` | loaded | 없음 | `mapSelect` | |
| `mapSelect` | selectMap | 해금됨 | `briefing` | 마지막 캐릭터 선택 |
| `briefing` | start | 캐릭터 해금됨 | `prepare` | `createRun(seed)`, 튜토리얼 체크 |
| `prepare` | startWave | — | `wave` | 체크포인트 저장, 사건 예약, 계약 고정 |
| `prepare` | — | pendingLevelUps > 0 | `levelUp` | 진입 즉시 |
| `levelUp` | pick/skip | pending = 0 | `prepare` | 자동 저장 |
| `wave` | tick | hp = 0 | `defeat` | |
| `wave` | tick | 웨이브 종료 & wave < 5 | `prepare` | 수입, 패시브 축 +1, 계약 정산 |
| `wave` | tick | 웨이브 종료 & wave = 5 | `result` | 점수·엔딩·진행 저장 |
| `wave` | badgeTap | 옵션 ON & pending > 0 | `levelUp`(일시정지) | 끝나면 `wave`로 복귀 |
| `defeat` | retry | — | `prepare` | 체크포인트 복원, `retries++` |
| `defeat` | restart | — | `prepare` | 새 seed |
| `result` | again/otherChar/next/map | — | `briefing`/`mapSelect` | |
| 모든 진행 상태 | hidden | — | (pause) | 자동 일시정지·저장 |

---

## 11. 맵 데이터

### 11.1 스키마 (`data/maps/*.json`)
```json
{
  "id": "dike-village", "style": "plain", "order": 1,
  "tiles": ["PPPIPPPO", "..."],                 // 12줄 × 8자
  "heightNoise": { "amp": 0.15, "seedSalt": 11 },
  "inlets":  [{ "tile": [3,0], "dir": "N", "weights": [1,1,1.2,1.4,1.2] }],
  "pumps":   [[2,5], [5,6]],                     // 타일 좌표 → 타일 중심 셀
  "gates":   [{ "tiles": [[1,8]], "kind": "normal", "open": true }],
  "relocation": null,
  "zones": ["aabbbbcc", "..."],                // 12줄 × 8자, 구역 레이어 [GD 26.1]
  "I1": 120, "rain": 0.2, "pulseEvery": 45,
  "peaks": [{ "wave": 4, "prob": 0.6, "mul": 1.5, "kind": "storm" }],
  "start": { "cash": 150, "hp": 100 },
  "star3Score": 0,                               // M5 봇으로 산정
  "unlock": null
}
```

### 11.2 타일 → 시뮬 변환 (`sim/terrain.ts`)
| 문자 | 타입 | 기본 h | 비고 |
|---|---|---|---|
| `P` | plain | 0 | |
| `F` | forest | +0.05 | health=1 |
| `H` | hill | +0.4 | |
| `D` | field | −0.08 | 들판 수입 |
| `W` | wetland | −0.12 | health=1 |
| `R` | reservoir | −0.2 | |
| `B` | base | 0 | 4타일(2×2)의 중앙 3×3 셀 = baseCore |
| `I` | inlet | 0 | 맵 가장자리 쪽 4셀 `flags.inlet` |
| `O` | outlet | −0.1 | 가장자리 쪽 4셀 `flags.outlet` |

(v2.2) "기본 h" 열은 **타입 보정값**. 실제 지면고 = `0.6 + 0.8 × dist(기지 중심)/dmax + 보정 + (hash(x,y)−0.5)×0.04` [GD 3.0]

- 노이즈는 정수 해시 `hash(x,y)` (엔진 간 동일).
- **구역** = `zones` 레이어의 같은 문자 타일 묶음, 타입은 구성 타일 다수결 [GD 26.1]. `zones` 생략 시 기지 중심 8방위 × 2링 자동 섹터. base는 구역이지만 스킬 대상 아님.
- 로드 시 검증: 구역 수 6~12, 구역당 4~16타일, 펌프 거점이 유입 최단 경로 위에 없음 [GD 26.2] → 위반 시 개발 빌드에서 에러.
- **기지 거리장** `distToBase`: baseCore에서 BFS (녹색 제방 안쪽 판정, 제방선 방향 계산에 사용).
- **제방선**: 구역 경계의 타일 변 중 `distToBase`가 큰 쪽(바깥)을 향한 변들을 연결해 선분화, 길이 내림차순 최대 3개. 각 선은 경계 바로 안쪽 1셀 두께, `facing` = 바깥 법선.

### 11.3 출시 맵 4장 (타일 원안, 튜닝 전)
```
둑마을 (평야, I1=120)      운하 교차로 (평야, I1=130)
PPPIPPPO                    PPPPOPPP
PPFPPPPP                    PPFPPPPP
PPPPPPFP                    PPPPPPPP
PDPPPPPP                    PPPPPPPP
PPPPPPPP                    PPPPPPFP
IPPBBPPP                    IPPBBPPI
PPPBBPPI                    PPPBBPPP
PPPPPPPP                    PPPPPPPP
PPFPPPDP                    PFPPPPPP
PPPPPPPP                    PPPPPPPP
PPPPFPPP                    PPPPPPPP
OPPPIPPP                    PPPOPPPP
유입 N·S·W·E 균등            유입 W·E (가중 1.5), 배출 N·S, 수문 2

버드나무 들 (범람원, I1=140)  갈대 삼각주 (범람원, I1=150)
PPPOPPPP                    WWPOPPWW
PFPPPPFP                    WDDPPDDW
PPPPPPPP                    PDDPPDDP
PDDPPDDP                    PPPPPPPP
PDDPPDDP                    IPPPPPPI
PPPBBPPP                    PPPBBPPP
PPPBBPPP                    PPPBBPPP
PDDPPDDP                    PWWPPWWP
PDDPPWWP                    PDDPPDDP
PWWPPWWP                    PDDPPDDP
PPPPPPPP                    WWPPPPWW
PPPIIPPP                    PPPIIPPP
유입 S(대량)                 유입 W·E·S, W4 폭우 prob 0.8
```
- 펌프·수문·피크 상세 좌표와 `zones` 레이어는 M2에서 데이터 파일로 확정, [GD 25] 7전략 봇 기준(단일 수단 패배·혼합 클리어) 충족까지 `I1`·`pulseEvery` 조정. I1 초기값은 보정 결과(둑마을 120, 범람원 +15%) 기준.

---

## 12. 명령·리플레이 (`game/commands.ts`)

```ts
type Command =
  | { t: 'skill'; id: string; zone?: number; path?: [number, number][] }   // path는 셀 좌표
  | { t: 'toggle'; kind: 'gate'|'pump'; id: number }
  | { t: 'pumpsOff' }
  | { t: 'pick'; index: 0|1|2; replace?: string } | { t: 'skip' } | { t: 'reroll' }
  | { t: 'contract'; on: boolean }
  | { t: 'startWave' } | { t: 'speed'; x: 1|2 } | { t: 'pause'; on: boolean };
interface LoggedCommand { tick: number; phaseSeq: number; cmd: Command }
```
- 적용 시점: 입력은 큐에 쌓이고 **다음 tick 시작 전**에 적용(준비 단계는 즉시). 로그에는 적용된 tick 기록.
- 검증 실패 명령은 로그에 남기지 않는다.
- `stateHash(run)`: `w`·`hp`·`cash`·`level`·`axes`를 FNV-1a로 해시 → 리플레이 결정성 테스트(CMD-02).
- 저장된 판 재개 = `createRun(seed)` 후 로그 재생(준비 단계까지 빠른 실행).

---

## 13. 렌더링

| 레이어 | 갱신 | 구현 |
|---|---|---|
| 지형 | 구역 타입·h 변경 시만 | 오프스크린 캔버스, 셀당 색 = 타입 팔레트 × 명암(h), 등고선(0.5 간격) |
| 물 | 매 프레임 | 64×96 `ImageData`(셀=1px, RGBA: 수심→색표) → `drawImage`로 확대, `imageSmoothingEnabled=true` |
| 구조물 | 매 프레임 | 제방(wall>0) 셀을 묶은 선, 높이=두께, 내구도<0.3 붉은 균열 무늬(색+패턴), 임시벽 점선 |
| 오브젝트 | 매 프레임 | 펌프(on 회전 애니메이션), 수문(열림/닫힘 아이콘) |
| 오버레이 | 매 프레임 | 대상 선택 하이라이트, 예고 화살표, 사건 예고, 토스트 위치 |
| FX | 매 프레임 | 파티클 상한 200(물보라·붕괴·비버·새), `prefers-reduced-motion`이면 0 |

- 캔버스 크기: 가용 높이 기준 `cssH = min(availH, availW × 1.5)`, `cssW = cssH / 1.5`, 내부 해상도 × DPR(최대 2).

### 13.1 가로 레이아웃 (v2.2)
| 조건 | 배치 |
|---|---|
| `innerWidth > innerHeight` | 보드 좌측(높이 100%, 폭 = 높이/1.5), 우측 패널 = HUD(상) + 스킬 2열 그리드(하) + 시작 버튼 |
| 최소 높이 | 340px (iPhone 가로). 미만이면 HUD를 1줄 축약(❤·💰·🌊만) |
| 레벨업·결과 | 모달은 가로에서 카드 3장 **가로 배치** |
- 수심 색표: 0.02 미만 투명, 0.02~0.3 하늘색, 0.3~1.0 청색, 1.0 이상 남색 + 줄무늬 패턴(색약 대비).

---

## 14. 입력

### 14.1 제스처 (`input/gestures.ts`)
| 제스처 | 판정 |
|---|---|
| tap | pointerup까지 이동 < 10px, 시간 < 350ms |
| longPress | 이동 < 10px, 시간 ≥ 450ms (진동 10ms) |
| swipe | 이동 ≥ 24px, 경로 8px 샘플 |
| 멀티터치 | 두 번째 포인터는 무시(출시 범위 줌 없음) |

### 14.2 히트 테스트 (`input/hit.ts`)
```
cell = floor((clientX − rect.left) / rect.width × 64), y 동일
우선순위: 펌프(반경 2셀) > 수문 셀 > 구역
구역 없음(경계·유입구) → 반경 2셀 내 가장 가까운 구역
```

### 14.3 대상 선택 모드 (`input/targeting.ts`)
| 상태 | 입력 | 결과 |
|---|---|---|
| idle | 스킬 버튼 tap | 해당 스킬이 `target: none/global` → 즉시 실행 / 그 외 `selecting(skill)` |
| idle | 구역 tap | 그 구역에 쓸 수 있는 **basic 스킬이 1개**면 즉시 실행, 여러 개면 미니 메뉴(구역 위 원형 버튼), 없으면 구역 정보 토스트. 제방 쌓기는 **선택될 제방선 고스트를 0.4초 표시 후 실행** |
| idle | 구역 longPress (제방 대상) | 제방선 순환 선택 모드: 탭할 때마다 다음 선 고스트, 실행 버튼으로 확정 |
| idle | 펌프/수문 tap | 토글 |
| selecting | 유효 구역 tap / swipe | 실행 → idle |
| selecting | 무효 영역 tap, 같은 버튼 tap, 웨이브 종료 | 취소 → idle |
- 궁극기는 버튼 longPress로만 실행(오발 방지).

---

## 15. 화면 명세 (요소·상태·이벤트)

### 15.1 맵 선택 `ui/screens/mapSelect.ts`
| 요소 | 내용 | 상태 |
|---|---|---|
| 헤더 | ⭐ 합계/최대, 📖 엔딩 도감 수 | |
| 스타일 칩 | 평야, 범람원, (잠금) 산림·계곡, 고원 | selected / locked |
| 맵 카드 | 이름, 별 3, 클리어 캐릭터 아이콘, "여기부터" 배지 | locked(조건 문구) / new / cleared |
| 이벤트 | 카드 tap → `selectMap` | |

### 15.2 브리핑 `briefing.ts`
| 요소 | 내용 |
|---|---|
| 맵 미리보기 | 지형 레이어 + 유입 화살표 + 피크 예보("W4 폭우 60%") |
| 캐릭터 캐러셀 | 좌우 swipe/버튼, 잠긴 캐릭터는 실루엣 + 해금 조건 |
| 상성 배지 | 정석 / 보통 / 도전 · 보정 +0/100/200 |
| 스킬 4칸 | 아이콘 + 1줄, longPress → 상세 시트 |
| 기록 | 이 맵 × 캐릭터 최고점, 획득 엔딩 |
| 시작 버튼 | 64px, 하단 고정 |

### 15.3 플레이 `play.ts` (HUD 위젯)
| 위젯 | 내용 | 갱신 |
|---|---|---|
| `hud` | ❤ hp, 💰 cash, 🌊 wave/5, Lv, 🧭, ⏸, 배속 | 값 변경 시만 DOM 쓰기 |
| 게이지 | 기지 수위(flood/1.2), EXP | 프레임당 1회(width %) |
| 레벨업 배지 | ⬆ + pending 수 / W5면 "점수로 전환" | |
| `skillBar` | 공통 2(48px) + 액티브 4(56px) + 시작 버튼 | 쿨다운 링, 게이지, 비활성 사유 |
| 준비 단계 패널 | [▶ 웨이브 시작], 위험 계약 토글(설명 1줄), 예고 | 준비 단계만 |
| `toast` | 보드 상단, 2초, 최대 2개 큐 | |

### 15.4 레벨업 `levelUp.ts`
| 요소 | 내용 |
|---|---|
| 헤더 | `Lv a ▸ b`, 남은 선택 수 |
| 카드 ×3 | 출처 캐릭터 색 테두리·초상, [자기]/[교차], 희귀도 테두리, 효과 1줄, 축 아이콘, 융합 표시, 교차 카드는 원 소유자 한마디 |
| 하단 | [건너뛰기 · 💰+40], [🎲 n], ⓘ 확률 |
| 교체 시트 | 액티브 4칸 중 교체 대상 선택 |

### 15.5 결과 `result.ts` / 패배 `defeat.ts`
- 결과: 엔딩 일러스트 → 에필로그 2장(탭 넘김) → 점수 내역(8장 항목 순서, 0인 항목 숨김) → 별 → 다음 목표 카드 → 버튼 [같은 맵 다시](최상단) [다른 캐릭터로] [다음 맵] [맵 선택].
- 패배: 침수 원인 히트맵(웨이브 동안 baseCore로 흘러든 물의 출처 유입구 비율) + [이 웨이브부터] [처음부터] [맵 선택].

### 15.6 접근성 체크리스트
- 모든 버튼 `aria-label`, 토스트 `role=status`, 결과 점수 표 `table`.
- 색 + 아이콘/패턴 병행(물 수심, 제방 균열, 상성 배지, 캐릭터).
- 키보드: 1~6 스킬, Tab 구역 순회(오버레이 포커스 링), Enter 실행, Esc 취소, Space 일시정지.
- 설정: **왼손 모드**(스킬 바 좌우 반전), 글자 크기 100/120% (120%에서 레이아웃 깨짐 없음 e2e 검사).

---

## 16. 저장 (`save/storage.ts`)

```ts
interface SaveV1 {
  v: 1;
  progress: {
    maps: Record<string, { stars: number; best: number; clearedBy: CharId[] }>;
    endings: string[]; fusions: string[]; chars: CharId[];
    mastery: Record<CharId, number>; lastChar: CharId;
    tutorialDone: boolean;
  };
  settings: { speed: 1|2; instantLevelBadge: boolean; haptics: boolean; sound: boolean; reducedMotion: 'auto'|'on'|'off' };
  run?: { dataVersion: string; mapId: string; charId: CharId; seed: number;
         snapshot: string;            // 준비 단계 시점 RunState 직렬화 (TypedArray → base64)
         log?: LoggedCommand[] };     // 디버그·버그 재현용 (재개에는 사용하지 않음)
}
```
- 키 `physics-td:v2`. 모든 접근 try/catch, 실패 시 메모리 저장으로 계속 진행 + 1회 토스트.
- `migrate(raw)`: `v` 없음/손상 → 기본값, 이후 버전 추가 시 단계별 함수.
- 저장 시점: 준비 단계 진입, 레벨업 선택, 결과, 백그라운드 전환.
- 재개: `dataVersion`(데이터 JSON 해시) 일치 시 스냅샷 복원, 불일치 시 판 폐기 + 안내 [GD 20]. 스냅샷 크기 ≈ 6144셀 × 9배열 × 4B ≈ 220KB → base64 ≈ 300KB (localStorage 한도 내).

---

## 17. 오디오·햅틱 매핑

| 게임 이벤트 | 사운드 | 햅틱 |
|---|---|---|
| 스킬 실행 | 스킬별 효과음 | 10ms |

- **iOS 제약**: iOS Safari는 `navigator.vibrate` 미지원 → 햅틱 대신 화면 2px 미세 흔들림(80ms). 오디오는 첫 사용자 터치 후 `AudioContext.resume()`.
| 실행 불가 | 둔탁음 | 30·30ms |
| 기지 피해 시작 | 저음 경고 루프 시작 | 100ms |
| 기지 피해 종료 | 루프 정지 | — |
| 제방 붕괴 | 무너지는 소리 | 60ms |
| 레벨업 | 차임 | 20ms |
| 희귀/전설 카드 공개 | 상승음 | 20·40ms |
| 사건 예고 | 짧은 경보 | 30ms |
| 웨이브 시작/종료 | 빗소리 강도 변경 | — |

---

## 18. 성능·품질 예산

| 항목 | 예산 |
|---|---|
| sim step | < 1.0ms (데스크톱), < 2.0ms (4× CPU 스로틀) |
| 렌더 프레임 | < 6ms |
| 프레임당 최대 sim step | 1×: 1~2, 2×: 2~4 (누적 시간 상한 100ms) |
| GC | 프레임 루프 내 배열·객체 할당 금지(버퍼 재사용) |
| 번들 | < 60KB gzip (데이터 JSON 제외), 데이터 < 40KB |
| 첫 상호작용 | < 2초 (3G Fast) |

---

## 19. i18n 키 규약 (예)
```
screen.mapSelect.title  "맵 선택"
skill.buildLevee.name   "제방 쌓기"
skill.buildLevee.desc   "평지 구역 바깥쪽에 높이 {h} 제방"
toast.noCash            "자금이 부족합니다"
card.cross.quote.wetland-researcher  "내 방식을 써 보겠다고? 좋아."
ending.wetSafety.gain   "마을과 습지가 함께 남았다."
ending.wetSafety.loss   "둑을 지키는 손이 늘 부족하다."
```

---

## 20. 테스트 케이스

| ID | 대상 | 내용 | 기대 |
|---|---|---|---|
| SIM-01 | fluid | 싱크·유입 없이 1만 tick | 총 물량 변화 < 1e-4 |
| SIM-02 | fluid | 좌우 대칭 지형, 중앙 물 1.0 | 대칭 셀 수위 차 < 1e-6 |
| SIM-03 | fluid | 제방 높이 1.0, 반대편 수위 0.5 / 1.5 | 0.5: 통과 0, 1.5: 월류 발생 |
| SIM-04 | fluid | 10만 tick 랜덤 지형 | NaN·음수·진동(같은 셀 부호 반복) 없음 |
| SIM-05 | structures | 압력 1.0 지속 | `dur` 0 도달 tick = 1500 ± 1, 이후 wall=0 |
| SIM-06 | sinks | 펌프 on 1초 | 반경 내 제거량·자금 −1 |
| SIM-07 | inflow | 웨이브 w 종료 | 총 유입(유입구+강우) = I_w ± 1e-3 |
| SIM-09 | sinks | 펌프 1대, 반경 내 물 충분 | tick당 제거량 = 상한 budget |
| SIM-10 | sinks | 펌프 3대째 가동 시도 | 거부(동시 2대) |
| BAL-01 | 보정 | [GD 25] 7전략 × 출시 맵 4장 | 단일 수단 4전략 모두 패배, 혼합 2전략 클리어 |
| BAL-02 | 보정 | 정석 봇 플레이 점수 | 1,100~1,300 |
| TER-03 | terrain | 기지 중심 셀 | 맵 최저 지면고 ± 0.05 |
| TER-04 | terrain | 맵 가이드 검증 [GD 26.2] | 출시 맵 4장 위반 0 |
| SAV-03 | storage | dataVersion 불일치 | 이어하기 미표시, 안내 토스트 |
| SIM-08 | damage | flood 1.7 1초 | hp −1 (0.5×2) |
| TER-01 | terrain | 11.3 맵 4장 | 구역 수, baseCore 9셀, 유입구 3셀 |
| TER-02 | terrain | 제방선 | 각 plain 구역 1~3개, facing 바깥 |
| SKL-01 | skills | 6.6 실패 사유 8종 | 각 조건에서 해당 코드 |
| SKL-02 | build-levee | 같은 구역 4회 | 선 3개 생성 후 최저 선 +0.3 |
| SKL-03 | sandbag | 30셀 스와이프 | 24셀 × 폭 2, 기지 3셀 이내 제외 |
| SKL-04 | open-floodplain | 개방 후 웨이브 종료 | 그 들판 수입 0 |
| SKL-05 | cooldown | 준비 단계 10초 대기 | 쿨다운 불변 |
| LVL-01 | leveling | xp 995 | Lv6 |
| LVL-02 | leveling | W5 중 레벨업 2회 | lateLevels 2, pending 불변 |
| CRD-01 | cards | 다른 캐릭터 궁극기 | 절대 등장 안 함(1만 회) |
| CRD-02 | cards | 교차 액티브 2칸 보유 | 교차 액티브 미등장 |
| CRD-03 | cards | 도전 상성 | 정석 가중 미적용 (분포 검정) |
| CRD-04 | cards | 융합 카드 없이 4회 | 5번째 롤에 융합 카드 포함 |
| CRD-05 | cards | Lv3/Lv5 | 자기 전술기/궁극기 보장 |
| CRD-06 | cards | 같은 시드 재도전 | 동일 카드·희귀도 |
| CRD-07 | cards | 희귀도 10만 회 | 70/25/5 ± 0.5%p (출시: 전설→희귀 강등 반영) |
| FUS-01 | fusion | 두 스킬 보유 | green-levee 1회 발동, 도감 기록 |
| SCO-01 | scoring | 고정 입력 | 8장 공식 값 일치 |
| SCO-02 | scoring | 감점 경로 없음 | 어떤 입력에도 항목별 값 ≥ 0 |
| SCO-03 | scoring | 유형별 이론 최대 | 빌드 보너스 정확히 300 |
| END-01 | endings | 축 비율 0.29 / 0.30 | 단독 / 부 성향 |
| END-02 | endings | 패시브만 교차 보유 5웨이브 | 부 성향 축 = 3 + 5 |
| EVT-01 | events | 같은 시드, 다시 뽑기 사용 유무 | 사건·예보 동일 |
| EVT-02 | events | 위험 계약 | 유입 ×1.3, 경험치 ×1.5, 점수 ×1 |
| CMD-01 | commands | 검증 실패 명령 | 로그 미기록 |
| CMD-02 | commands | 로그 재생 | `stateHash` 동일 |
| FSM-01 | machine | 10장 전이표 전체 | 가드별 다음 상태 일치 |
| FSM-02 | machine | 같은 tick 웨이브 종료 + HP 0 | defeat |
| SAV-01 | storage | 손상 JSON | 기본값 + 토스트, 크래시 없음 |
| SAV-02 | storage | localStorage 예외 | 메모리 모드로 진행 |
| E2E-01 | 모바일 | iPhone SE / 13 / 가로 | 스크롤 0, 터치 대상 ≥ 48px |
| E2E-02 | 흐름 | 재방문 | 맵 tap → 시작 2탭 |
| E2E-03 | 튜토리얼 | 6단계 | 순서대로 진행, 건너뛰기 동작 |

---

## 21. 밸런스 봇 (`bots/`)

```ts
interface BotPolicy {
  name: string;
  prepare(run): Command[];          // 준비 단계 행동
  onTick(run): Command | null;      // 웨이브 중 (10 tick마다 호출)
  pickCard(cards, run): 0|1|2|'skip'|'reroll';
}
```
| 봇 | prepare | onTick | pickCard |
|---|---|---|---|
| idle | 없음 | 없음 | skip |
| commonOnly | 펌프 전부 on | 수위 높은 구역 결빙 | skip |
| home | 정석 캐릭터, 제방/개방 우선 | 쿨다운 되면 전술기, 게이지 100이면 궁극기 | 자기 > 교차 |
| challenge | 도전 캐릭터, 동일 | 동일 | 정석 캐릭터 교차 우선 |
| artisan / fusion / restraint | home 기반 | home 기반 | 정책별 |
- 실행: `npm run bots -- --map all --seeds 200` → CSV(맵, 캐릭터, 봇, 클리어, hp, result, level, ending).
- 판정은 [GD 12.2, 17, 24.8] 기준을 스크립트로 검사, 실패 시 종료 코드 1(CI 선택 실행).

---

## 22. 빌드·배포

| 스크립트 | 동작 |
|---|---|
| `npm run dev` | esbuild watch + 정적 서버 |
| `npm test` | `node --test` (sim/rules/game) |
| `npm run e2e` | Playwright 모바일 3종 (`--trace off`) |
| `npm run bots` | 밸런스 봇 |
| `npm run build` | 타입 검사(`tsc --noEmit`) → esbuild → `dist/` (index.html, app.js, data/, i18n/, manifest, sw.js), 구 버전은 `dist/legacy/` |
- GitHub Actions: test → build → (main 브랜치) Pages 배포. 기존 워크플로 확장.

---

## 23. 작업 분해 (출시 범위)

| ID | 마일스톤 | 작업 | 일 |
|---|---|---|---|
| T01 | M0 | TS·esbuild·tsx 설정, 폴더 구조, CI 갱신 | 0.5 |
| T02 | M0 | `core/rng`, `core/types`, `sim/grid` | 0.5 |
| T03 | M0 | `sim/terrain` (타일 변환·구역·거리장·제방선) + TER 테스트 | 1 |
| T04 | M0 | `sim/fluid`·`structures`·`sinks`·`inflow`·`ice`·`step` + SIM 테스트, 성능 측정, **`prototypes/v2-calibrate.mjs` 결과 재현(BAL-01 둑마을)** | 2.5 |
| T05 | M1 | `game/machine`·`state`·`commands`·`checkpoint` + FSM/CMD 테스트 | 1.5 |
| T06 | M1 | `render/*` 레이어, 캔버스 크기·DPR | 1.5 |
| T07 | M1 | `input/*` 제스처·히트·타게팅 | 1 |
| T08 | M1 | 맵 선택·브리핑·HUD·토스트·햅틱, i18n | 1.5 |
| T09 | M2 | `rules/effects`·`skills`, 출시 스킬 10종 + SKL 테스트 | 2 |
| T10 | M2 | 맵 4장 데이터, 들판 수입·경제 | 2 |
| T11 | M2 | 수동 플레이 점검, 버그 수정 | 1 |
| T12 | M3 | `leveling`·`cards`(희귀도·천장·스파이크)·`fusion` + LVL/CRD/FUS 테스트 | 2 |
| T13 | M3 | 레벨업 화면, 교체 시트, 확률 ⓘ | 1.5 |
| T14 | M3 | 위험 계약(UI·정산) + EVT-02 | 0.5 |
| T15 | M4 | `scoring`·`endings` + SCO/END 테스트, 결과·패배 화면, 다음 목표 카드 | 2 |
| T16 | M4 | 저장·재개 + SAV 테스트, 튜토리얼, 스토리 텍스트 | 2 |
| T17 | M5 | 돌발 사건 4종·예보 + EVT-01 | 1 |
| T18 | M5 | 밸런스 봇, 튜닝(`I1`, star3Score 등) | 2 |
| T19 | M5 | PWA, 성능 튜닝, e2e, legacy 이동, 배포 검증 | 1.5 |
| T20 | M2 | 출시 맵 4장 `zones` 레이어 작성 + 가이드 검증(TER-04) | 1 |
| T21 | M5 | 개발자 모드(지표·로그 JSON 내보내기), 가로 레이아웃·왼손 모드 | 1 |
| | | **합계** | **≈ 30일 (약 6주)** |

---

## 24. 상세설계 단계에서 확정한 추가 결정
| 항목 | 결정 | 이유 |
|---|---|---|
| 흐름 알고리즘 | 2패스 가상 파이프(K=0.20) | 순서 무관·대칭·질량 보존을 동시에 만족 |
| 맵 저작 | 8×12 타일 문자열 + 자동 구역·제방선 | 맵 제작 비용 최소화, 데이터만으로 맵 추가 |
| 난수 | 용도별 3스트림 | 다시 뽑기·카드 선택이 사건·날씨를 바꾸지 않게 |
| 점수 vs 경험치 | 위험 계약만 경험치 ×1.5, 점수는 ×1 | 계약의 보상은 성장, 점수 보상은 무피해 시 +80으로 분리 |
| 줌/팬 | 출시 범위 제외 | 64×96 전체가 한 화면에 들어오므로 불필요 |
| 기지 이동 중 무피해 점수 | 0 | 피해 판정이 없는 구간의 무임 점수 방지 |

---

## 25. 출시 에셋 목록 (v2.2)
| 분류 | 항목 | 수량 | 비고 |
|---|---|---|---|
| 일러스트 | 엔딩 (둑지기 단독·+공존, 습지 단독·+수호, 합류) | 5 | 세로 1080×1350 |
| 캐릭터 | 초상 × 표정(기본·걱정·만족) | 2 × 3 | 확장 시 +2명 |
| 아이콘 | 스킬 10, 축 4, 사건 4, 상태(쿨다운·잠금 등) 6 | 24 | SVG 단색 + 캐릭터 색 |
| 지형 | 구역 타입 텍스처 | 7 | 64px 타일, 탑뷰 |
| UI | 카드 테두리(일반·희귀·전설), 배지, 나침반 | 6 | |
| 효과음 | 17장 매핑 | ≈ 15 | |
| 앰비언트 | 빗소리 2단계, 경고 루프 | 3 | |
- 제작 일정은 M1~M4와 병행, M4 종료 시 최종 교체. 임시 에셋(단색 도형)으로 개발 진행.

## 26. 개발자 모드·느긋한 모드
| 기능 | 내용 | 범위 |
|---|---|---|
| 개발자 모드 | URL `?dev=1`: FPS·step ms·지표 실시간 표시, 판 종료 시 `{지표, 명령 로그, 결과}` JSON **내보내기/복사** 버튼 (서버 없이 플레이테스트 수집) | 출시 |
| 느긋한 모드 | 유입 −30%, 결과·기록에 "느긋한" 표시(일반 기록과 분리), 엔딩·도감은 동일 | 확장 |
