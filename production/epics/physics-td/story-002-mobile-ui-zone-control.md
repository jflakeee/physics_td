# Story 002: 모바일 한 화면 UI + 구역 탭 조작

> **Epic**: physics-td
> **Status**: Ready
> **Layer**: Presentation
> **Type**: UI
> **Estimate**: L
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: — (set by /dev-story when implementation begins)

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

- `src/render/*.ts`, `src/input/*.ts`, `src/ui/**/*.ts`, `index.html`, `i18n/ko.json`

---

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
