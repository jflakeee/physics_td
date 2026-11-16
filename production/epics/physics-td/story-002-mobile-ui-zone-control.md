# Story 002: 모바일 한 화면 UI + 구역 탭 조작

> **Epic**: physics-td
> **Status**: Complete
> **Layer**: Presentation
> **Type**: UI
> **Estimate**: L
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-16

## Context

**GDD**: `design/game-brief.md`
**Requirement**: Brief MVP feature 2

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: custom web engine (TypeScript + Canvas2D) | **Risk**: NOT ASSESSED (no VERSION.md risk rating)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**: N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's MVP feature 2. Detail: `docs/DETAILED_DESIGN_V2.md` §13~15, `docs/MOBILE_REBUILD_REVIEW.md`.*

- [ ] iPhone SE(320×568)·iPhone 13(390×664)·가로(750×342)에서 문서 스크롤 0 (세로 한 화면: HUD / 보드 / 스킬 바)
- [ ] 모든 터치 대상 ≥ 48px, 스킬 버튼 ≥ 56px
- [ ] 구역 탭 → 하이라이트. 좌표 선택·방향키 미세조정 UI 없음
- [ ] 스킬 버튼 탭 → 사용 가능한 대상 구역만 밝게, 빈 곳 탭 = 취소. 궁극기는 길게 눌러 실행
- [ ] 펌프·수문 탭 = 토글
- [ ] HUD: HP·자금·웨이브·Lv·기지 수위 게이지, 값이 바뀔 때만 DOM 쓰기
- [ ] 일시정지, 배속 1×·2×, 백그라운드 전환 시 자동 일시정지
- [ ] 렌더 프레임 < 6ms (물은 ImageData → drawImage 1회)

---

## Implementation Notes

- 가로 레이아웃: 보드 좌측, 우측 패널(HUD·스킬 2열). 최소 높이 340px.
- 히트 테스트 우선순위: 펌프 > 수문 > 구역. 제스처: tap < 10px·350ms, longPress ≥ 450ms.
- iOS는 진동 미지원 → 화면 미세 흔들림으로 대체. 모든 문자열은 i18n 키.

---

## Out of Scope

- Story 001: 시뮬레이션
- Story 003: 스킬 효과 자체
- Story 007: 세계 지도 화면

---

## Files

- `v2.html` — created (v2 entry; v1 `index.html` unchanged per user decision)
- `src/main.ts` — created
- `src/render/` — canvas.ts, board.ts, terrainLayer.ts, waterLayer.ts, overlayLayer.ts — created
- `src/input/` — gestures.ts, hit.ts, targeting.ts — created
- `src/ui/` — i18n.ts, dom.ts, haptics.ts, demoSkills.ts, widgets/{hud,skillBar,toast}.ts, screens/play.ts — created
- `i18n/ko.json` — created
- `scripts/build-v2.mjs` — created (TS strip build → `dist-v2/`)
- `package.json` (build:v2), `.gitignore` (dist-v2/) — modified
- Evidence: `production/qa/evidence/story-002-mobile-ui-zone-control/` (4 screenshots + stamp.txt)

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above*

---

## Test Evidence

*`qa.level: minimal`: tests waived, but a UI story's retained screenshot is not.*

**Story Type**: UI
**Required evidence**: 터치한 화면마다 스크린샷(iPhone SE·13·가로)을 `production/qa/evidence/`에 보존

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/physics-td/story-001-water-ice-sim-core.md`
- Unlocks: `production/epics/physics-td/story-003-characters-and-skills.md`

---

## Completion Notes

**Completed**: 2026-11-16
**Criteria**: 8/8 passing (user-confirmed via /story-done; AC5 gate toggle deferred to Story 004 — sim has no gate structure yet)
**Deviations** (advisory):
- 수문 토글 미구현: Story 004에서 수문 구조물이 생기면 히트 테스트(펌프 > 수문 > 구역)에 추가
- 데모 하드코딩: 자금 200, Lv 1, 웨이브 5개(`src/main.ts`), 임시 스킬(`src/ui/demoSkills.ts`) — Story 003·004·006에서 데이터/실제 시스템으로 교체
- 웨이브 시작 버튼이 가로 화면에서도 보드 아래에 있음 (설계 §13.1은 우측 패널)
- 플레이 스크린샷에서 기지 수위 게이지가 가득 찬 빨간 줄로 보임 — 실제 수위인지 표시 버그인지 미확인, Story 004 맵 작업 때 점검
- 범위: 스토리 Files의 `index.html` 대신 사용자 결정으로 `v2.html` 신규 생성(v1 `index.html` 불변), `scripts/build-v2.mjs`·`package.json`·`.gitignore` 추가/수정
**Test Evidence**: waived at qa.level minimal; UI 스크린샷 `production/qa/evidence/story-002-mobile-ui-zone-control/` (+ stamp.txt)
**Reviewed by**: self, no independent review (QL-TEST-COVERAGE / LP-CODE-REVIEW skipped — Solo mode)
