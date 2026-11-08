# Story 003: 캐릭터 2명 + 공통·특수 스킬

> **Epic**: physics-td
> **Status**: Ready
> **Layer**: Core
> **Type**: Logic
> **Estimate**: L
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: — (set by /dev-story when implementation begins)

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

- [ ] 공통 스킬 2(펌프 가동·긴급 결빙)와 둑지기·습지 연구원 특수 스킬 4씩, 총 10종이 JSON 데이터로 정의되어 동작 (gameplay 값 하드코딩 없음)
- [ ] 사용 불가 사유 8종(미보유·쿨다운·자금·게이지·대상 불일치·맵에 대상 없음·일시정지·이미 완료) 각각 올바른 코드와 토스트 키
- [ ] 쿨다운은 게임 시간(tick) 기준이고 준비 단계에서는 감소하지 않음
- [ ] 펌프 동시 가동 최대 2대, 1대 처리량 상한 적용
- [ ] 제방 쌓기: 예고 방향 쪽 제방선 선택, 같은 구역 반복 시 다음 선 → 모두 지어지면 최저 선 +0.1(상한 0.6)
- [ ] 모래주머니 스와이프: 경로 24셀 상한·폭 2·기지/유입구 3셀 이내 제외
- [ ] 궁극기 게이지 충전, 100에서 사용 가능, 사용 시 0
- [ ] 빙하 지역에서 스킬 표현이 데이터로 변형됨 (예: 제방 쌓기 → 얼음 둑)

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

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/physics-td/story-001-water-ice-sim-core.md`, `production/epics/physics-td/story-002-mobile-ui-zone-control.md`
- Unlocks: `production/epics/physics-td/story-004-regions-maps-waves-tutorial.md`, `production/epics/physics-td/story-005-levelup-draft.md`
