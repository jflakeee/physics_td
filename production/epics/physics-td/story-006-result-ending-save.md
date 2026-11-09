# Story 006: 결과 점수 + 엔딩 4종 + 도감 + 저장

> **Epic**: physics-td
> **Status**: Done
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-09

## Context

**GDD**: `design/game-brief.md`
**Requirement**: Brief MVP feature 7

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: custom web engine (TypeScript + Canvas2D) | **Risk**: NOT ASSESSED (no VERSION.md risk rating)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**: N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Player goal & fail state and MVP feature 7. Detail: `docs/DETAILED_DESIGN_V2.md` §8~9, §16, `docs/GAME_DESIGN_V2.md` §7~8, §20.*

- [x] 결과 점수 = 플레이 점수 + 클리어 500 + 상성 보정(0/100/200) + 빌드 보너스 + 남은 HP×2 + 첫 조합 50 + 완주 100 + 막판 성장 (위험 계약·뮤테이터 항목은 이번 범위 아님)
- [x] 어떤 입력에도 감점 항목이 없음(모든 항목 ≥ 0)
- [x] 빌드 보너스 정규화: 장인·융합·절제 각 이론 최대 입력 시 정확히 300
- [x] 엔딩 4종 판정: 플레이 캐릭터 + 부 성향(주 성향의 30% 이상일 때만)
- [x] 결과 화면: 에필로그 2장(얻은 것/잃은 것) → 항목별 점수(0인 항목 숨김) → 별 → "다음 목표" 카드, [같은 맵 다시] 버튼이 최상단
- [x] 도감에 엔딩·융합 기록
- [x] 준비 단계 진입·레벨업 선택·결과·백그라운드 전환 시 상태 스냅샷 저장, 복원 시 `dataVersion` 일치 확인, 불일치면 폐기 + 안내
- [x] localStorage 예외·손상 JSON에서 크래시 없이 메모리 모드로 진행하고 1회 토스트

---

## Implementation Notes

- 저장 키 `physics-td:v2`, 모든 접근 try/catch, 스키마 버전 필드와 `migrate()`.
- 스냅샷은 TypedArray → base64(약 300KB). 명령 로그는 디버그용이며 재개에는 쓰지 않음.

---

## Out of Scope

- Story 007: 세계 지도·기억 조각
- 위험 계약, 뮤테이터 배율, 비밀 엔딩 (brief out of scope)

---

## Files

- `src/rules/scoring.ts`, `src/rules/endings.ts`, `src/save/storage.ts`
- `src/ui/screens/result.ts`, `src/ui/screens/defeat.ts`
- `tests/integration/result-save/result-save_test.ts`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above*

---

## Test Evidence

*`qa.level: minimal`: tests are waived (advisory).*

**Story Type**: Integration
**Required evidence**:
- Integration: `tests/integration/result-save/result-save_test.ts` OR playtest doc

**Status**: [x] Created — `tests/integration/result-save/result-save_test.ts` (13 tests), e2e result/save/storage-failure flows, screenshots `production/qa/evidence/story-006-*.png`

---

## Implementation Notes (2026-11-09)

| AC | 근거 |
|---|---|
| 결과 점수 | `src/rules/scoring.ts` (§8): 플레이 + 클리어 500 + 상성 0/100/200 + 빌드 + HP×2 + 첫 조합 50 + 완주 100 + 막판 성장 ×50. 계수는 `data/economy.json` `result` (SCO-01) |
| 감점 없음 | 무작위 입력 5,000개에서 모든 항목 ≥ 0 (SCO-02) |
| 빌드 정규화 | 이론 최대를 데이터에서 계산: 장인 240·융합 180·절제 540 → 각 최대 입력에서 정확히 300 (SCO-03) |
| 엔딩 | `src/rules/endings.ts` + `data/endings.json`: 부 성향은 주 성향의 30% 이상일 때만(0.29 → 단독, 0.30 → 부) (END-01/02) |
| 결과 화면 | 엔딩 제목 → 에필로그 2장(얻은 것 → 잃은 것, 탭) → [같은 맵 다시](최상단)·다른 캐릭터로·다음 맵·맵 선택 → 점수표(0 항목 숨김) → 별 → 다음 목표 → 엔딩 도감 n/4 |
| 도감 | 클리어 시 엔딩, 발동 시 융합을 저장 `progress.endings`·`fusions`에 기록 |
| 스냅샷 저장·복원 | 키 `physics-td:v2`, 스키마 `v: 1` + `migrate()`. 준비 단계 진입·웨이브 시작·카드 선택·백그라운드 전환 때 저장, 결과 시 판 삭제. 재개는 `dataVersion`(데이터 JSON 해시) 일치 시만, 불일치면 폐기 + 안내 (SAV-03) |
| 저장소 장애 | 예외 → 메모리 모드, 손상 JSON → 기본값, 각각 1회 안내, 크래시 없음 (SAV-01/02, e2e) |

**결정·차이**
- **스냅샷 형식**: 체크포인트 형식 + 단계·대기 카드·재도전 수. TypedArray는 0 바이트 RLE 후 base64 → 3웨이브 뒤 약 100KB(설계 추정 300KB). 웨이브 중에는 그 웨이브 시작 상태를 저장하므로, 재개하면 그 웨이브의 준비 단계로 돌아간다(진행 중 웨이브 이어하기 없음). 재도전용 체크포인트는 저장하지 않는다(다음 웨이브 시작 시 다시 생성).
- **⭐3 기준** `star3Score`는 4맵 모두 임시값 2300(혼합 봇 결과 점수 근처). 봇 기반 맵별 보정은 밸런스 단계에서.
- **위험 계약·뮤테이터·비밀 엔딩(합류)**은 브리프 범위 밖이라 넣지 않았다.
- 패배 화면의 침수 원인 히트맵(§15.5)은 미구현 — 버튼 3개만.
- Story 004/005의 임시 저장(`ptd.v2.progress`)은 새 저장으로 1회 이전 후 쓰지 않는다.
- 설정(햅틱·사운드·모션)은 스키마만 있고 화면은 없다.

## Dependencies

- Depends on: `production/epics/physics-td/story-004-regions-maps-waves-tutorial.md`, `production/epics/physics-td/story-005-levelup-draft.md`
- Unlocks: `production/epics/physics-td/story-007-world-map-prologue-memory.md`
