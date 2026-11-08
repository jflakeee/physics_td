# Story 006: 결과 점수 + 엔딩 4종 + 도감 + 저장

> **Epic**: physics-td
> **Status**: Ready
> **Layer**: Feature
> **Type**: Integration
> **Estimate**: L
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: — (set by /dev-story when implementation begins)

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

- [ ] 결과 점수 = 플레이 점수 + 클리어 500 + 상성 보정(0/100/200) + 빌드 보너스 + 남은 HP×2 + 첫 조합 50 + 완주 100 + 막판 성장 (위험 계약·뮤테이터 항목은 이번 범위 아님)
- [ ] 어떤 입력에도 감점 항목이 없음(모든 항목 ≥ 0)
- [ ] 빌드 보너스 정규화: 장인·융합·절제 각 이론 최대 입력 시 정확히 300
- [ ] 엔딩 4종 판정: 플레이 캐릭터 + 부 성향(주 성향의 30% 이상일 때만)
- [ ] 결과 화면: 에필로그 2장(얻은 것/잃은 것) → 항목별 점수(0인 항목 숨김) → 별 → "다음 목표" 카드, [같은 맵 다시] 버튼이 최상단
- [ ] 도감에 엔딩·융합 기록
- [ ] 준비 단계 진입·레벨업 선택·결과·백그라운드 전환 시 상태 스냅샷 저장, 복원 시 `dataVersion` 일치 확인, 불일치면 폐기 + 안내
- [ ] localStorage 예외·손상 JSON에서 크래시 없이 메모리 모드로 진행하고 1회 토스트

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

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/physics-td/story-004-regions-maps-waves-tutorial.md`, `production/epics/physics-td/story-005-levelup-draft.md`
- Unlocks: `production/epics/physics-td/story-007-world-map-prologue-memory.md`
