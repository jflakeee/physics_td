# Story 007: 세계 지도 + 서막 텍스트 + 기억 조각 8개

> **Epic**: physics-td
> **Status**: Done
> **Layer**: Presentation
> **Type**: UI
> **Estimate**: M
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-09

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

- [x] 세계 지도에 강 유역 터전과 경계 너머 지역 실루엣이 보이고, 맵을 클리어할 때마다 터전 칸이 추가됨
- [x] 강 유역을 클리어하면 빙하 경계가 열려 빙하시대 맵이 해금됨
- [x] 서막 브리핑·웨이브 대사·복선 대사가 i18n 키로 표시됨 (위협은 현상으로만 표현)
- [x] 기억 조각 8개(철학 4 × 지역 2)의 획득 조건이 판정되고, 한 캐릭터의 조각 4개가 모이면 회상 카드가 열림
- [x] 도감에 "기억" 탭, 획득한 조각만 표시되고 나머지는 실루엣 + 힌트
- [x] 세계 지도 화면도 스크롤 0, 터치 대상 ≥ 48px

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

**Status**: [x] Created — screenshots `production/qa/evidence/story-007-*.png` (prologue, world map ×3 viewports, unlocked world, codex memories + recall); logic tests `tests/unit/story/story_test.ts` (7); e2e checks

---

## Implementation Notes (2026-11-09)

| AC | 근거 |
|---|---|
| 세계 지도 | `src/ui/screens/worldMap.ts` + `data/story/world.json`: 강 유역 터전 + 경계 너머 5지역 실루엣(화산·심해·산사태 + 먼 외계·기계), 클리어한 맵마다 터전 칸 1개(칸 탭 → 그 맵의 엔딩 기록) |
| 빙하 해금 | 강 유역 맵 2장을 모두 클리어하면 빙하 경계가 열리고 해금 장면 2장이 한 번 나온다. 닫힌 동안 탭하면 조건 안내 |
| 서막·대사 | `data/story/prologue.json`: 첫 실행 서막 3장, 웨이브 시작 대사(지역별 5줄), 수로 기술자 복선 대사(웨이브마다 15%, `rng.events` 스트림). 모두 i18n 키, 장면당 1~3문장, 위협은 현상으로만 |
| 기억 조각 | `data/story/memories.json` 8개(철학 4 × 강 유역·빙하). 조건은 기존 시스템 재사용: 무피해(둑지기), 생태 지수, 범람원 개방, 재도전 후 클리어, 빙하호 붕괴 웨이브 무피해, 빙하호 끝까지 지키기. 결과 화면에서 판정·표시 |
| 도감 기억 탭 | 엔딩·융합·기억 탭. 얻은 조각만 글, 나머지는 ??? + 힌트, 회상 카드는 열리면 본문 |
| 스크롤 0·48px | 세계 지도 3개 해상도 모두 문서 스크롤 0, 육각형·버튼 ≥ 48px (e2e) |

**결정·차이**
- **회상 카드 기준을 2개로**: AC는 "한 캐릭터의 조각 4개"지만 출시 조각은 철학당 2개(지역 2곳)라 4개는 모을 수 없다. `recallAt`을 데이터로 두고 출시값 2(= 그 철학의 출시 조각 전부). 지역이 늘면 4로 올리면 된다.
- **등가교환·교훈 조각**(미출시 캐릭터의 철학)은 캐릭터 조건 없이 범람원 개방·빙하호 지키기·재도전 클리어로 얻는다(구현 노트대로).
- **빙하 해금 조건** = 강 유역 맵 전부 클리어(지역 단위). 맵 하나만으로 열려야 한다면 데이터 한 줄 수정.
- **진입 흐름**: 첫 실행 → 서막 → 세계 지도 → 지역 탭 → 맵 목록 → 플레이. `?screen=maps`로 예전 맵 목록, `?screen=codex&tab=memories`로 도감 바로 가기.
- 터전 확장의 대가(확장마다 재해 +10%, 문서 §3.1)는 출시 범위 표(§7)에 없어 넣지 않았다.
- 번들: `dist/v2/app.js` 105KB(gzip 38KB, 데이터·문구 포함) — 예산 60KB gzip 이내.

## Dependencies

- Depends on: `production/epics/physics-td/story-006-result-ending-save.md`
- Unlocks: None
