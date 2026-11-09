# Story 004: 지역 2곳 × 맵 2장, 5웨이브, 튜토리얼

> **Epic**: physics-td
> **Status**: Done
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-08

## Context

**GDD**: `design/game-brief.md`
**Requirement**: Brief MVP feature 4

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: custom web engine (TypeScript + Canvas2D) | **Risk**: NOT ASSESSED (no VERSION.md risk rating)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**: N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's MVP feature 4 and Player goal & fail state. Detail: `docs/DETAILED_DESIGN_V2.md` §5, §11, `docs/GAME_DESIGN_V2.md` §17~18, §26.*

- [x] 맵 4장(강 유역 2·빙하시대 2)이 타일 + 구역 레이어 데이터로 로드됨
- [x] 로드 시 맵 가이드 검증 위반 0 (구역 6~12개·구역당 4~16타일·펌프가 유입 경로 밖·유입 경로 ≥ 30셀)
- [x] 웨이브 5개: 길이 40→70초, 유입 ×1.35씩 증가, 강우 20%
- [x] 맵별 고정 배치 봇 7전략: 단일 수단 전략은 모두 패배, 혼합 전략은 클리어
- [x] 튜토리얼 6단계가 둑마을 첫 플레이에서 순서대로 진행, 건너뛰기 가능, 실패해도 단계 유지
- [x] 패배 시 웨이브 시작 시점 체크포인트로 재도전, 같은 시드 → 같은 상태
- [x] 첫 실행 시 둑마을에 "여기부터" 배지
- [x] 빙하 맵에서 빙하호 붕괴가 웨이브 중 예고(3초 전)되고 발생함

---

## Implementation Notes

- 맵 데이터: `tiles` 12줄×8자 + `zones` 레이어 + 유입·펌프·수문 좌표. 기지는 최저 지대(집수 분지).
- `I1`·`pulseEvery`는 봇으로 보정(둑마을 120, 범람원 계열 +15% 시작값).
- 빙하 지역 동작은 Story 001의 빙하호 보정 결과를 사용.

---

## Out of Scope

- Story 005: 레벨업 카드
- Story 007: 세계 지도에서 맵을 고르는 화면(여기서는 맵 선택 목록만)

---

## Files

- `data/maps/*.json`, `src/sim/waves.ts`, `src/game/machine.ts`, `src/game/checkpoint.ts`
- `tests/integration/maps/maps_test.ts`, `bots/*.ts`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above*

---

## Test Evidence

*`qa.level: minimal`: tests are waived (advisory).*

**Story Type**: Integration
**Required evidence**:
- Integration: `tests/integration/maps/maps_test.ts` OR playtest doc

**Status**: [x] Created — `tests/integration/maps/` (maps 5 + bots 4×7 = 33 tests), `tests/unit/game/tutorial_test.ts` (3), e2e flows and screenshots `production/qa/evidence/story-004-*.png`

---

## Implementation Notes (2026-11-08)

| AC | 근거 |
|---|---|
| 맵 4장 | `data/maps/`: 둑마을(I1 120)·버드나무 들(138)·얼음 목초지(110)·빙하호 계곡(95). 타일 + 구역 레이어(11구역). 2026-11-09: 저작 제방선(기지 둘레 사각형), 들판 구역 추가, 버드나무 들 구역 재배치 — EPIC.md "Balance through player commands" |
| 검증 0 | `src/game/validate.ts`: 구역 6~12·구역당 4~16타일, 유입구 2~4·기지까지 ≥ 30셀, 펌프 거점 2~4·유입 경로에서 3~6셀, 빙하호가 로드 시 넘치지 않음. 4장 모두 위반 0 |
| 웨이브 | 5개, 40→70초, ×1.35, 강우 20% (맵 데이터 `waves`·`rain`, Story 001 sim) |
| 봇 7전략 | `bots/strategies.ts`, `npm run bots`. 4장 모두 단일 수단 5전략 패배·혼합 2전략 클리어 (링+펌프 HP: 둑마을 48, 버드나무 26, 목초지 20, 계곡 13) |
| 튜토리얼 | `src/game/tutorial.ts` 6단계, 순서·조건·건너뛰기, 재도전·새로고침 후에도 단계 유지(localStorage) |
| 체크포인트 | 웨이브 시작 직전 상태 저장 → 패배 시 [이 웨이브부터]로 복원, 같은 입력 → 같은 `stateHash` |
| 여기부터 | 첫 실행(클리어 없음·튜토리얼 미완료) 맵 선택에서 둑마을에만 배지 |
| 빙하호 | 테두리 최소 두께가 `breakAt`까지 90 tick(3초) 남으면 예고 토스트, 도달 시 테두리 전체가 물로 붕괴. 두 빙하 맵 모두 W3에 붕괴(통합 테스트) |

**결정·차이**
- **빙하호 붕괴는 호수 로직만 결정**: 빙하 플래그 셀은 일반 얼음 파열 규칙에서 제외(예고 없이 터지는 것 방지). 결빙 스킬로 테두리에 얼음을 다시 얹으면 붕괴가 늦어지고 예고도 다시 나온다.
- **빙하호 크기**: 테두리 얼음 자체가 물이라(Story 001 결정 2), 계곡의 호수는 2×2 타일·테두리 0.9/1.1로 줄였다. 3×3·1.0×2개면 I1을 80까지 내려도 링+펌프가 패배했다.
- **봇은 자기 펌프 위치를 쓴다**(프로토타입과 같은 기지 기준 배치). 맵의 펌프 거점은 플레이어용이며 가이드(경로에서 3~6셀)를 따른다.
- **튜토리얼 5단계(카드 선택)**는 레벨업 카드(Story 005) 전까지 "다음" 탭으로 진행. 다른 캐릭터 첫 사용 말풍선(GD §18 끝)은 미구현.
- **진행 저장**은 `src/save/local.ts`(클리어 맵·튜토리얼 단계)만. 정식 저장·마이그레이션은 Story 006.
- 맵 선택은 목록 + 캐릭터 칩(브리핑 화면은 범위 밖). 빙하 맵 해금 조건은 Story 007 세계 지도에서.
- 피크 이벤트(GD §17 W4/W5 폭우)는 브리프에서 돌발 사건과 함께 출시 후로 미뤄 넣지 않았다.

## Dependencies

- Depends on: `production/epics/physics-td/story-001-water-ice-sim-core.md`, `production/epics/physics-td/story-002-mobile-ui-zone-control.md`, `production/epics/physics-td/story-003-characters-and-skills.md`
- Unlocks: `production/epics/physics-td/story-006-result-ending-save.md`
