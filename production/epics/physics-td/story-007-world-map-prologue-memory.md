# Story 007: 세계 지도 + 서막 텍스트 + 기억 조각 8개

> **Epic**: physics-td
> **Status**: Ready
> **Layer**: Presentation
> **Type**: UI
> **Estimate**: M
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: — (set by /dev-story when implementation begins)

## Context

**GDD**: `design/game-brief.md`
**Requirement**: Brief MVP feature 5

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: custom web engine (TypeScript + Canvas2D) | **Risk**: NOT ASSESSED (no VERSION.md risk rating)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**: N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Core loop (확장) and MVP feature 5. Detail: `docs/STORY_WORLD_EXPANSION.md` §3, §5, §7.*

- [ ] 세계 지도에 강 유역 터전과 경계 너머 지역 실루엣이 보이고, 맵을 클리어할 때마다 터전 칸이 추가됨
- [ ] 강 유역을 클리어하면 빙하 경계가 열려 빙하시대 맵이 해금됨
- [ ] 서막 브리핑·웨이브 대사·복선 대사가 i18n 키로 표시됨 (위협은 현상으로만 표현)
- [ ] 기억 조각 8개(철학 4 × 지역 2)의 획득 조건이 판정되고, 한 캐릭터의 조각 4개가 모이면 회상 카드가 열림
- [ ] 도감에 "기억" 탭, 획득한 조각만 표시되고 나머지는 실루엣 + 힌트
- [ ] 세계 지도 화면도 스크롤 0, 터치 대상 ≥ 48px

---

## Implementation Notes

- 조각 조건은 기존 시스템을 재사용: 무피해 웨이브, 생태 지수, 구역 상태(범람원 개방), 재도전, 맵 비밀.
- 철학 × 캐릭터: 사랑=둑지기, 자연보호=습지 연구원, 등가교환=공병대장, 교훈=수로 기술자. 출시 캐릭터가 2명이라 나머지 철학의 조각은 맵 비밀·재도전 조건으로 획득.
- 서술은 설교하지 않는다: 장면당 1~3문장 우화체.

---

## Out of Scope

- 지역 3곳 이상(화산·심해·산사태·외계·기계), 3~5막, 창조 모드 (brief out of scope)

---

## Files

- `src/ui/screens/worldMap.ts`, `src/ui/screens/codex.ts`
- `data/story/*.json`, `i18n/ko.json`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above*

---

## Test Evidence

*`qa.level: minimal`: tests waived, but a UI story's retained screenshot is not.*

**Story Type**: UI
**Required evidence**: 세계 지도·도감 "기억" 탭·회상 카드 스크린샷을 `production/qa/evidence/`에 보존

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/physics-td/story-006-result-ending-save.md`
- Unlocks: None
