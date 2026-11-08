# Story 003: 캐릭터 2명 + 공통·특수 스킬

> **Epic**: physics-td
> **Status**: Done
> **Layer**: Core
> **Type**: Logic
> **Estimate**: L
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-08

## Context

**GDD**: `design/game-brief.md`
**Requirement**: Brief MVP feature 3

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: custom web engine (TypeScript + Canvas2D) | **Risk**: NOT ASSESSED (no VERSION.md risk rating)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**: N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's MVP feature 3. Skill table: `docs/DETAILED_DESIGN_V2.md` §6.2.*

- [x] 공통 스킬 2(펌프 가동·긴급 결빙)와 둑지기·습지 연구원 특수 스킬 4씩, 총 10종이 JSON 데이터로 정의되어 동작 (gameplay 값 하드코딩 없음)
- [x] 사용 불가 사유 8종(미보유·쿨다운·자금·게이지·대상 불일치·맵에 대상 없음·일시정지·이미 완료) 각각 올바른 코드와 토스트 키
- [x] 쿨다운은 게임 시간(tick) 기준이고 준비 단계에서는 감소하지 않음
- [x] 펌프 동시 가동 최대 2대, 1대 처리량 상한 적용
- [x] 제방 쌓기: 예고 방향 쪽 제방선 선택, 같은 구역 반복 시 다음 선 → 모두 지어지면 최저 선 +0.1(상한 0.6)
- [x] 모래주머니 스와이프: 경로 24셀 상한·폭 2·기지/유입구 3셀 이내 제외
- [x] 궁극기 게이지 충전, 100에서 사용 가능, 사용 시 0
- [x] 빙하 지역에서 스킬 표현이 데이터로 변형됨 (예: 제방 쌓기 → 얼음 둑)

---

## Implementation Notes

- 효과는 op 레지스트리(buildLevee, tempWallPath, repairAll, lowerZone, convertZone, modifier, freezeZone) 조합으로만 정의.
- 성향 축: 획득 +3, 강화 +1, 액티브 사용 시 쿨다운/10, 패시브 웨이브당 +1.
- 상세 `docs/DETAILED_DESIGN_V2.md` §6, `docs/GAME_DESIGN_V2.md` §5.

---

## Out of Scope

- Story 005: 레벨업 카드로 스킬 획득·교차 스킬 규칙
- Story 004: 맵별 구역·제방선 데이터

---

## Files

- `src/rules/skills.ts`, `src/rules/effects.ts`
- `data/characters/*.json`, `data/skills/*.json`
- `tests/unit/skills/skills_test.ts`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above*

---

## Test Evidence

*`qa.level: minimal`: tests are waived (advisory).*

**Story Type**: Logic
**Required evidence**:
- Logic: `tests/unit/skills/skills_test.ts` — must exist (advisory at minimal)

**Status**: [x] Created — 17 tests in `tests/unit/skills/skills_test.ts`, all passing; e2e checks skill-bar variants (`story-003-*.png` in `production/qa/evidence/`)

---

## Implementation Notes (2026-11-08)

| AC | 근거 |
|---|---|
| 10종 JSON | `data/skills/*.json` 10개, `data/characters/*.json` 2개, `data/economy.json`. 효과는 op 조합만(`src/rules/effects.ts`). 펌프 수치도 `pump.json`에서 sim 설정으로 주입 |
| 사용 불가 8종 | `canUse` 순서 NOT_OWNED → PAUSED → COOLDOWN → NO_GAUGE → NO_CASH → NO_TARGET_IN_MAP → BAD_TARGET/ALREADY_DONE, 각 토스트 키 존재 (SKL-01) |
| 쿨다운 | tick 단위, `rulesTick`은 웨이브 tick에만 호출 → 준비 단계 불변 (SKL-05, 게임 루프 통합 테스트) |
| 펌프 | 동시 2대·처리량 상한(Story 001) + 값은 `pump.json` |
| 제방 쌓기 | 예고 방향(다음 웨이브 최대 가중 유입구 → 기지)을 향한 선 → 다음 선 → 최저 선 +0.1(상한 0.6) (SKL-02) |
| 모래주머니 | Bresenham 경로, 24셀 상한, 폭 2, 유입구·기지 3셀 이내 제외 (SKL-03: 30셀 → 48셀) |
| 궁극기 게이지 | 둑지기 차단량 ×0.5, 습지 연구원 생태 최고치 1%당 +5, 100에서 사용·0으로 초기화 |
| 빙하 변형 | 스킬 JSON `regions.glacier`로 아이콘·이름·op 교체: 제방 쌓기 → 얼음 둑(`iceLevee`: 구역 물을 제방선에 얼림), 모래주머니 → 눈 벽, 습지 복원 → 이끼 습원 |

**설계서와 다르게 / 새로 정한 부분**
- **제방선 자동 생성**(§11.2): BFS 거리 비교는 나침반 섹터의 옆면까지 "바깥"으로 잡아서, 기지→타일 방사 방향과 60° 이내인 경계 변만 쓴다. 둑마을 자동 구역에서는 바깥 링 구역(맵 가장자리)에 선이 없어 제방 대상이 아니다 → 맵별 제방선은 Story 004 데이터로 확정.
- **긴급 결빙** = 구역 물을 그 구역의 위협 방향 제방선에 높이 0.4 얼음 벽으로 얼림(Story 001 결정 2), 제방선이 없으면 §6.3대로 물 50% → 얼음.
- **궁극기 사용 시 성향 축 +1** (설계서에 궁극기 축 점수가 없어 비용형 기본기와 같이 처리).
- **경제**(GD §15): 웨이브 클리어 +60, 온전한 들판 +8(웨이브 평균 수위 < 0.05, 개방 안 함). 결과·레벨업 연동은 Story 005·006.
- **습지 흡수·생태 지수**(GD §16): sim에 셀 타입·건강도·침수 tick 배열 추가, 숲은 수위 ≥ 0.1이 10초 지속되면 −0.1/초.
- 시작 스킬은 Lv1 규칙(패시브 + 기본기). 전술기·궁극기는 레벨업(Story 005) 전까지 개발용 URL `?kit=all`로 확인. 캐릭터 선택은 `?char=`, 지역은 `?region=glacier`(브리핑 화면은 Story 004).

## Dependencies

- Depends on: `production/epics/physics-td/story-001-water-ice-sim-core.md`, `production/epics/physics-td/story-002-mobile-ui-zone-control.md`
- Unlocks: `production/epics/physics-td/story-004-regions-maps-waves-tutorial.md`, `production/epics/physics-td/story-005-levelup-draft.md`
