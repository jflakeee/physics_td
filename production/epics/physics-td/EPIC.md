# Epic: physics-td

> **Layer**: Foundation → Presentation (single-epic MVP)
> **Source**: `design/game-brief.md` (workflow: minimal — no GDD/ADR)
> **Status**: Stories written

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
| 001 | 물·얼음 시뮬레이션 코어 | Logic | Ready | N/A |
| 002 | 모바일 한 화면 UI + 구역 탭 조작 | UI | Ready | N/A |
| 003 | 캐릭터 2명 + 공통·특수 스킬 | Logic | Ready | N/A |
| 004 | 지역 2곳 × 맵 2장, 5웨이브, 튜토리얼 | Integration | Ready | N/A |
| 005 | 판 안 레벨업 드래프트 | Logic | Ready | N/A |
| 006 | 결과 점수 + 엔딩 4종 + 도감 + 저장 | Integration | Ready | N/A |
| 007 | 세계 지도 + 서막 텍스트 + 기억 조각 8개 | UI | Ready | N/A |
