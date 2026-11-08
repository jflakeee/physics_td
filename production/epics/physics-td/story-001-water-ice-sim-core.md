# Story 001: 물·얼음 시뮬레이션 코어

> **Epic**: physics-td
> **Status**: Ready
> **Layer**: Foundation
> **Type**: Logic
> **Estimate**: L
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: — (set by /dev-story when implementation begins)

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

- [ ] 같은 시드·같은 입력이면 같은 결과 (보장 범위 = 같은 기기·같은 빌드, `Math.random`·`Math.sin` 미사용)
- [ ] 유입·싱크 없이 1만 tick 실행 시 총 물량 변화 < 1e-4 (질량 보존)
- [ ] 좌우 대칭 지형에서 대칭 셀 수위 차 < 1e-6
- [ ] 제방보다 수위가 높으면 월류, 낮으면 통과 0. 압력으로 내구도가 줄어 0이 되면 제방 붕괴
- [ ] 기지 3×3 수위 합이 1.2를 넘은 만큼 HP 감소(HP는 정수, 소수부 누적), HP 0 = 패배
- [ ] 둑마을 기준 보정 재현: 방어 없음 W2 패배 · 펌프 1대(물길 위) 단독 클리어 불가 · 제방 링 + 펌프 1대 클리어
- [ ] 얼음은 흐름을 막고 0.0008/tick로 녹는다. **빙하호 붕괴**(얼음 댐이 녹으며 저수량이 한꺼번에 방출)가 위협이자 대응 수단으로 동작함을 프로토타입으로 보정(빌드 순서 2번)
- [ ] 10만 tick 랜덤 지형에서 NaN·음수·진동 없음
- [ ] sim step < 1.0ms(데스크톱), 4× CPU 스로틀에서 < 2.0ms

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

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: None
- Unlocks: `production/epics/physics-td/story-002-mobile-ui-zone-control.md`, `production/epics/physics-td/story-003-characters-and-skills.md`
