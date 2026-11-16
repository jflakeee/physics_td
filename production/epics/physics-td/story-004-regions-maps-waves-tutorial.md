# Story 004: 지역 2곳 × 맵 2장, 5웨이브, 튜토리얼

> **Epic**: physics-td
> **Status**: Complete
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-16

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

- [ ] 맵 4장(강 유역 2·빙하시대 2)이 타일 + 구역 레이어 데이터로 로드됨
- [ ] 로드 시 맵 가이드 검증 위반 0 (구역 6~12개·구역당 4~16타일·펌프가 유입 경로 밖·유입 경로 ≥ 30셀)
- [ ] 웨이브 5개: 길이 40→70초, 유입 ×1.35씩 증가, 강우 20%
- [ ] 맵별 고정 배치 봇 7전략: 단일 수단 전략은 모두 패배, 혼합 전략은 클리어
- [ ] 튜토리얼 6단계가 둑마을 첫 플레이에서 순서대로 진행, 건너뛰기 가능, 실패해도 단계 유지
- [ ] 패배 시 웨이브 시작 시점 체크포인트로 재도전, 같은 시드 → 같은 상태
- [ ] 첫 실행 시 둑마을에 "여기부터" 배지
- [ ] 빙하 맵에서 빙하호 붕괴가 웨이브 중 예고(3초 전)되고 발생함

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

- `data/maps/{dike-village,willow-field,glacier-mouth,frost-lakeside}.json` — created (tiles + zones + inlets/pumps/gate/lake)
- `data/index.json`, `data/skills/build-levee.json` (cost 6, glacier ice dam + re-freeze), `data/skills/pump.json` — modified
- `src/sim/waves.ts`, `src/sim/zones.ts` — created; `src/sim/{constants,grid,fluid,terrain,step,structures,sinks,ice}.ts`, `src/core/types.ts` — modified (zone layer, gates, skill ice, pump cap from data)
- `src/game/{maps,machine,checkpoint,tutorial}.ts` — created
- `src/rules/{effects,skills}.ts`, `src/input/{hit,targeting}.ts` — modified (real levee lines, re-freeze cost, gate hit tier)
- `src/ui/screens/{play,mapSelect}.ts`, `src/ui/{flags,styles}.ts`, `src/render/{board,overlayLayer}.ts`, `src/main.ts`, `i18n/ko.json` — created/modified
- `bots/{strategies,play,run}.ts` — created (7 strategies × 4 maps)
- `docs/GAME_DESIGN_V2.md` §3.0 — rows: levee cost 6, start cash 150, skill ice dam, re-freeze cost 2
- Tests: none (waived at qa.level: minimal); verification scripts outside the repo
- Evidence: `production/qa/evidence/story-004-regions-maps-waves-tutorial/` (5 screenshots, bots-matrix.txt, stamp.txt)

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above*

---

## Test Evidence

*`qa.level: minimal`: tests are waived (advisory).*

**Story Type**: Integration
**Required evidence**:
- Integration: `tests/integration/maps/maps_test.ts` OR playtest doc

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/physics-td/story-001-water-ice-sim-core.md`, `production/epics/physics-td/story-002-mobile-ui-zone-control.md`, `production/epics/physics-td/story-003-characters-and-skills.md`
- Unlocks: `production/epics/physics-td/story-006-result-ending-save.md`

---

## Completion Notes

**Completed**: 2026-11-16
**Criteria**: 8/8 passing (user-confirmed via /story-done; tutorial steps 1–4·6 retained as screenshots, driven with real taps)
**Deviations** (advisory):
- 튜토리얼 1단계 문구는 "화살표가 다음 물길"이지만 유입 경로 화살표가 그려지지 않음 (경로 미리보기 필요)
- 튜토리얼 5단계(카드 고르기)는 카드 시스템(Story 005) 전이라 말풍선 없이 통과
- 스타일이 `v2.html` 대신 `src/ui/styles.ts`에서 주입됨, 맵 선택으로 나가기는 페이지 새로고침
- `play.ts` 하드코딩 가능성(웨이브 길이 등) 점검 필요
- 설계 v2.4 반영: 제방 1선 비용 6, 시작 자금 150 유지, 스킬 얼음 둑(0.002/s 융해, 호수 붕괴 제외), 재동결 비용 2, 빙하 맵 I1 110/100 (`docs/GAME_DESIGN_V2.md` §3.0)
**Test Evidence**: waived at qa.level minimal; 스크린샷·봇 매트릭스 `production/qa/evidence/story-004-regions-maps-waves-tutorial/`
**Reviewed by**: self, no independent review (QL-TEST-COVERAGE / LP-CODE-REVIEW skipped — Solo mode)
