# Story 002: 모바일 한 화면 UI + 구역 탭 조작

> **Epic**: physics-td
> **Status**: Done
> **Layer**: Presentation
> **Type**: UI
> **Estimate**: L
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-08

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

- [x] iPhone SE(320×568)·iPhone 13(390×664)·가로(750×342)에서 문서 스크롤 0 (세로 한 화면: HUD / 보드 / 스킬 바)
- [x] 모든 터치 대상 ≥ 48px, 스킬 버튼 ≥ 56px
- [x] 구역 탭 → 하이라이트. 좌표 선택·방향키 미세조정 UI 없음
- [x] 스킬 버튼 탭 → 사용 가능한 대상 구역만 밝게, 빈 곳 탭 = 취소. 궁극기는 길게 눌러 실행
- [x] 펌프·수문 탭 = 토글
- [x] HUD: HP·자금·웨이브·Lv·기지 수위 게이지, 값이 바뀔 때만 DOM 쓰기
- [x] 일시정지, 배속 1×·2×, 백그라운드 전환 시 자동 일시정지
- [x] 렌더 프레임 < 6ms (물은 ImageData → drawImage 1회)

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

**Status**: [x] Created — 12 screenshots (3 viewports × prepare / zone highlight / targeting / wave) in `production/qa/evidence/story-002-*-2026-11-08.png`

---

## Implementation Notes (2026-11-08)

| AC | 근거 |
|---|---|
| 스크롤 0 | `npm run e2e`: 320×568 · 390×664 · 750×342 모두 scrollHeight = innerHeight, scrollWidth = innerWidth |
| 터치 크기 | 보이는 모든 버튼 ≥ 48px·화면 안, 액티브 스킬 56px (공통 스킬은 §15.3대로 48px) |
| 구역 탭 | 탭 → 외곽선 하이라이트. 좌표 선택·방향키 UI 없음 |
| 대상 선택 | 스킬 탭 → 유효 구역만 밝게(나머지 어둡게), 무효/빈 곳 탭 = 취소, 궁극기는 탭 시 안내·450ms 길게 누름으로 실행 |
| 펌프·수문 | 탭 토글(펌프 반경 2셀 > 수문 > 구역). 3대째는 거부 토스트 |
| HUD | ❤·💰·🌊·Lv·기지 수위 게이지, 값이 바뀔 때만 DOM 쓰기(단위 테스트로 쓰기 횟수 확인) |
| 일시정지·배속·백그라운드 | ⏸, 1×/2×(프레임당 2/4 step, 누적 상한 실시간 100ms), `visibilitychange` 숨김 시 자동 일시정지 |
| 렌더 < 6ms | JS 측 drawBoard 평균 0.27~0.30ms, p95 ≤ 0.5ms (headless Chromium, 3초). 물은 64×96 ImageData → drawImage 1회 |

**결정·차이**
- **v2는 `dist/v2/`에 배포**: 스킬 효과(003)·맵 선택(004) 전이라 v1을 루트에 유지. v2가 완성되면 §22대로 v2를 루트, v1을 `dist/legacy/`로 옮긴다.
- **HUD 배치**: 320px 폭에서 ❤·💰·🌊 + 💧⏸1× 버튼이 한 줄에 들어가지 않아 Lv를 수위 게이지 줄로 옮겼다. 💧(전체 펌프 정지)는 GD §5.1대로 HUD에 둔다.
- **▶ 웨이브 시작**은 준비 단계에만 보드 하단 중앙 64px 원형 버튼(스킬 바 폭 부족 + 엄지 영역).
- **구역 자동 분할**: 8방위 × 2링 섹터의 4-연결 타일 묶음, 타입은 다수결(GD §26.1의 "지형 타입 경계로 다시 자름"은 생략 — 둑마을은 거의 평지라 차이 없음). 구역 수·크기 검증은 Story 004.
- **스킬 버튼**은 `src/ui/skillViews.ts`의 표시용 정의(둑지기 3개 + 빈 슬롯 1, 공통 결빙). 효과는 Story 003이 `SkillHandler`로 연결한다(지금은 "사용" 토스트만).
- 일시정지·배속 명령은 시뮬 결과에 영향이 없어 큐를 거치지 않고 즉시 적용한다.
- DOM 금지 범위(sim·game·input)는 DOM 타입 없이 따로 타입 검사한다(`tsconfig.nodom.json`).

## Dependencies

- Depends on: `production/epics/physics-td/story-001-water-ice-sim-core.md`
- Unlocks: `production/epics/physics-td/story-003-characters-and-skills.md`
