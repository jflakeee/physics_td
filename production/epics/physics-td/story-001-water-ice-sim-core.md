# Story 001: 물·얼음 시뮬레이션 코어

> **Epic**: physics-td
> **Status**: In Progress (AC 7 빙하호 보정 미완 — 설계 결정 대기)
> **Layer**: Foundation
> **Type**: Logic
> **Estimate**: L
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-08

## Context

**GDD**: `design/game-brief.md`
**Requirement**: Brief MVP feature 1

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: custom web engine (TypeScript + Canvas2D) | **Risk**: NOT ASSESSED (no VERSION.md risk rating)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**: N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Player goal & fail state and MVP feature 1. Numbers: `docs/GAME_DESIGN_V2.md` §3.0 scale table, `docs/DETAILED_DESIGN_V2.md` §4.*

- [x] 같은 시드·같은 입력이면 같은 결과 (보장 범위 = 같은 기기·같은 빌드, `Math.random`·`Math.sin` 미사용)
- [x] 유입·싱크 없이 1만 tick 실행 시 총 물량 변화 < 1e-4 (질량 보존)
- [x] 좌우 대칭 지형에서 대칭 셀 수위 차 < 1e-6
- [x] 제방보다 수위가 높으면 월류, 낮으면 통과 0. 압력으로 내구도가 줄어 0이 되면 제방 붕괴
- [x] 기지 3×3 수위 합이 1.2를 넘은 만큼 HP 감소(HP는 정수, 소수부 누적), HP 0 = 패배
- [x] 둑마을 기준 보정 재현: 방어 없음 W2 패배 · 펌프 1대(물길 위) 단독 클리어 불가 · 제방 링 + 펌프 1대 클리어
- [ ] 얼음은 흐름을 막고 0.0008/tick로 녹는다. **빙하호 붕괴**(얼음 댐이 녹으며 저수량이 한꺼번에 방출)가 위협이자 대응 수단으로 동작함을 프로토타입으로 보정(빌드 순서 2번)
- [x] 10만 tick 랜덤 지형에서 NaN·음수·진동 없음
- [ ] sim step < 1.0ms(데스크톱), 4× CPU 스로틀에서 < 2.0ms — 데스크톱 0.27ms 통과, 스로틀 미측정

---

## Implementation Notes

- 흐름: 2패스 가상 파이프(K=0.20), 수두 = 지면 + 제방 + 얼음 + 수심. 상세 `docs/DETAILED_DESIGN_V2.md` §4.1~4.7.
- 스케일 표(§3.0): 기지가 최저 지대인 집수 분지, 제방 0.3/0.4/0.5, 증발 수심 비례, 강우 20%, 펌프 처리량 상한·동시 2대.
- 참고 구현·보정 스크립트: `prototypes/v2-calibrate.mjs`(결과는 설계서 §25).
- sim 코드는 DOM 금지, 시드 난수 3스트림 분리.

---

## Out of Scope

*Handled by neighbouring stories — do not implement here:*

- Story 002: 화면·입력
- Story 003: 스킬 (펌프·제방 건설 명령은 sim 인터페이스만 제공)
- Story 004: 맵 데이터·웨이브 곡선 튜닝

---

## Files

- `src/core/rng.ts`, `src/core/types.ts`
- `src/sim/*.ts` (grid, terrain, fluid, structures, sinks, ice, inflow, metrics, step)
- `tests/unit/sim/sim-core_test.ts`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above*

---

## Test Evidence

*`qa.level: minimal`: tests are waived (advisory).*

**Story Type**: Logic
**Required evidence**:
- Logic: `tests/unit/sim/sim-core_test.ts` — must exist (advisory at minimal)

**Status**: [x] Created — 22 tests, all passing (`npm test`)

---

## Implementation Notes (2026-11-08)

| AC | 상태 | 근거 |
|---|---|---|
| 결정성 | 통과 | 바이트 해시 비교 테스트, `src/`에 `Math.random`·`Math.sin`·DOM 없음, 3스트림 독립 테스트 |
| 질량 보존 | 통과 | 1만 tick 드리프트 ≈ 3e-11 |
| 대칭 | 통과 | 합산을 (E+W)+(S+N)로 묶어 비트 단위 대칭 |
| 월류·붕괴 | 통과 | SIM-03, SIM-05(1500 tick ± 1) |
| 기지 피해 | 통과 | SIM-08, HP 정수·소수부 누적, HP 0 → defeat |
| 둑마을 보정 | 통과 (조건부) | 7전략 모두 §25와 같은 승패. 단 **웨이브마다 제방 보수**가 전제 (아래 1) |
| 빙하호 | **미완** | `prototypes/v2-glacier-lake.mjs`: 위협은 확인, 대응 수단은 미성립 (아래 2) |
| 안정성 | 통과 | 10만 tick, 연속 부호 교대 최대 12 tick(감쇠) < 30 |
| 성능 | 데스크톱 통과, 스로틀 미측정 | `npm run bench:sim`: 평균 0.27ms, p95 0.32ms (Xeon 2.1GHz). 4× 스로틀은 Node에서 측정 불가(단순 환산 ≈ 1.1ms) → 브라우저 측정은 Story 002에서 |

**설계서와 다르게 구현한 부분**

1. **제방 내구도 vs 보정**: `v2-calibrate.mjs`에는 내구도가 없다. §4.3 내구도(초당 0.02×압력)를 넣으면 "링 + 펌프 1대"가 W5에 제방 31셀 붕괴로 패배한다. 웨이브 사이에 제방을 다시 쌓는(내구도 복구) 봇이면 §25와 같은 결과(클리어, HP 48)다. 보정 테스트는 이 봇 기준.
2. **빙하호**: 융해 0.0008/tick에서 댐 수명 = 두께 / 0.0008이라, 늦게 터지는 댐일수록 **얼음 자체가 많은 물**이다(W4까지 버티는 1셀 두께 링 60셀 ≈ 물 200). 빙하호가 있으면 터지는 시점과 무관하게 "링 + 펌프"가 패배(위협 성립). 긴급 결빙(구역 물 50% → 얼음)은 얼음이 수두에 남아 흐름을 거의 못 바꿔 대응 수단이 되지 못했다. 또 순수 융해만으로는 방출이 마루 하강 속도에 묶여 점진적이라, 월류 순간 얼음 셀이 깨지는 `iceFractureHead`(기본 0.1, 0 = 끔) 규칙을 추가했다(1셀 댐 시험에서 방출 3배 이상 빨라짐, 분지 지형의 링 댐에서는 차이 작음). 확정에는 설계 결정 필요.
3. **물·얼음 배열 Float64**: §3은 Float32지만, 큰 셀이 얇은 셀로 ulp 미만 양을 보낼 때 손실만 반올림돼 tick당 ≈ 4e-6씩 질량이 늘었다(SIM-01 실패).
4. **제방 압력**: §4.3 `h_j + w_j − h_c`는 경사에서 마른 오르막 이웃만으로도 압력이 생긴다. 두 지면 중 높은 쪽 위의 수면으로 계산(평지에서는 같은 값).
5. **유입 펄스 수**: 프로토타입은 `t % P == 0`으로 N+1번 펄스가 나가 웨이브 총량이 I_w × 27/26이었다. SIM-07에 맞춰 정확히 N번.
6. 미구현(다른 스토리 범위): 구역·제방선(§11.2 후반), 습지·숲 흡수, 생태, 이벤트, 점수·경험치.

## Dependencies

- Depends on: None
- Unlocks: `production/epics/physics-td/story-002-mobile-ui-zone-control.md`, `production/epics/physics-td/story-003-characters-and-skills.md`
