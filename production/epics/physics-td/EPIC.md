# Epic: physics-td

> **Layer**: Foundation → Presentation (single-epic MVP)
> **Source**: `design/game-brief.md` (workflow: minimal — no GDD/ADR)
> **Status**: Done (2026-11-09) — all 7 stories Done

## Goal
막아낼수록 터전이 넓어지고 낯선 재해와 맞닿는다 — 신념이 다른 네 사람의 방식으로 홍수와 빙하를 다루는 모바일 웹 물리 디펜스.

## Scope (brief MVP)
1. 물·얼음 시뮬레이션 코어
2. 모바일 한 화면 UI + 구역 탭 조작
3. 캐릭터 2명 + 공통·특수 스킬
4. 지역 2곳 × 맵 2장, 5웨이브, 튜토리얼
5. 진영 확장 세계 지도 + 서막 + 기억 조각 8개
6. 판 안 레벨업 드래프트
7. 결과 점수 + 엔딩 4종 + 도감 + 저장

## Order (brief Build order)
시뮬레이션 코어(빙하호 보정 포함) → UI → 스킬 → 맵 → 드래프트 → 결과·저장 → 세계 지도

## References
- Rules and numbers: `docs/GAME_DESIGN_V2.md` (v2.2), `docs/DETAILED_DESIGN_V2.md`
- Story and regions: `docs/STORY_WORLD_EXPANSION.md`
- Scale prototype: `prototypes/v2-calibrate.mjs`
- Brief overrides the "launch = prologue only" line of design appendix C (flood + glacier at launch; risk contract and surprise events deferred).

## Stories

| # | Story | Type | Status | ADR |
|---|-------|------|--------|-----|
| 001 | 물·얼음 시뮬레이션 코어 | Logic | Done | N/A |
| 002 | 모바일 한 화면 UI + 구역 탭 조작 | UI | Done | N/A |
| 003 | 캐릭터 2명 + 공통·특수 스킬 | Logic | Done | N/A |
| 004 | 지역 2곳 × 맵 2장, 5웨이브, 튜토리얼 | Integration | Done | N/A |
| 005 | 판 안 레벨업 드래프트 | Logic | Done | N/A |
| 006 | 결과 점수 + 엔딩 4종 + 도감 + 저장 | Integration | Done | N/A |
| 007 | 세계 지도 + 서막 텍스트 + 기억 조각 8개 | UI | Done | N/A |

## Post-epic polish (2026-11-09)
- Build: v2 is the site root (`dist/`), v1 stays playable at `dist/legacy/` (DETAILED §22). Deploys on merge to `main`.
- ⭐3 thresholds per map from the 숙련 bot (`npm run bots -- --star3`): 둑마을 2150, 버드나무 들 2050, 얼음 목초지 2150, 빙하호 계곡 2150.
- Settings screen: haptics, reduced motion (auto/on/off), left-hand skill bar, tutorial replay, link to v1.

## Balance through player commands (2026-11-09)
A skill-playing bot (`bots/skillBot.ts`, `npm run bots -- --skill`) plays only through zone skills,
pump taps and cards. It showed the fixed-placement calibration did not carry over: with the
automatic levee lines (outer edge of the inner zones, ~24 cells out) every map was lost in W3.
Changes:
- **Authored levee lines** (`leveeLines` in map data): a square around the base, radius 12
  (빙하호 계곡 14). They replace the zone's automatic lines, so a second cast raises the line
  (+0.1) instead of building a useless far edge. Rank 1 (0.3) overflows; 0.4 holds.
- **Field zones on every map** (GD §26.2 "each character has ≥ 2 target zones", now validated):
  둑마을 and both glacier maps got two edge columns of fields.
- **얼음 둑** (glacier build-levee) is a presentation variant of the levee: freezing zone water
  left nothing to freeze in the prepare phase.
- **Tactical spike moved Lv3 → Lv2** (`economy.draft.spike.tactical`): the wetland researcher
  needs 습지 복원 before W3 on maps without fields.

Skill-bot results (5 seeds; clears / avg HP): 정석 둑지기 @ 둑마을 5/5 HP 68 · 정석 습지 @ 버드나무 5/5 HP 83 ·
도전 습지 @ 둑마을 4/5 · 도전 둑지기 @ 버드나무 1/5 · 중립 둑지기 @ 목초지 5/5 HP 72 · 중립 습지 @ 목초지 5/5 HP 60 ·
중립 둑지기 @ 계곡 5/5 HP ≈ 77 · 중립 습지 @ 계곡 0/5. Fixed-placement bots stay on target on all maps.

## Still open
- **도전 둑지기 @ 버드나무 들 (1/5)** — the inner zones there are fields, so the levee square can
  only be closed on one side. Options: plain inner zones on that map, or let build-levee target fields.
- **습지 연구원 @ 빙하호 계곡 (0/5)** — two glacier lakes (≈ 120 units incl. rim ice) outweigh
  wetland absorption; the bot does not upkeep the dams. Options: smaller lakes, or dam upkeep in play.
- Defeat cause heatmap (DETAILED §15.5), text size 120% (§15.6), sound (no audio assets yet).
