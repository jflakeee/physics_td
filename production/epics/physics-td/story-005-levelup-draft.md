# Story 005: 판 안 레벨업 드래프트

> **Epic**: physics-td
> **Status**: Done
> **Layer**: Feature
> **Type**: Logic
> **Estimate**: M
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: 2026-11-08

## Context

**GDD**: `design/game-brief.md`
**Requirement**: Brief MVP feature 6

**ADR Governing Implementation**: N/A (minimal — no ADRs)
**ADR Decision Summary**: N/A (minimal — no ADRs)
**ADR Version**: N/A (minimal — no ADRs)

**Engine**: custom web engine (TypeScript + Canvas2D) | **Risk**: NOT ASSESSED (no VERSION.md risk rating)
**Engine Notes**: none (no ADR engine-compatibility analysis at minimal)

**Control Manifest Rules (this layer)**: N/A (minimal — no control manifest)

---

## Acceptance Criteria

*From the brief's Core loop (정산) and MVP feature 6. Detail: `docs/DETAILED_DESIGN_V2.md` §7, `docs/GAME_DESIGN_V2.md` §6.*

- [x] 플레이 점수 = 경험치(1:1), 필요 경험치 `round(100 × 1.35^(Lv−1))`, 평균 플레이에서 판당 레벨업 5~6회
- [x] 웨이브 중 레벨업은 대기 배지로만 표시, 웨이브 끝 정산에서 연속 선택. 마지막 웨이브 중 레벨업은 레벨당 +50 결과 점수로 전환
- [x] 카드 3장 = 자기 1 + 교차 2. 다른 캐릭터 궁극기는 절대 등장하지 않고, 교차 액티브는 최대 2칸, 교차 스킬은 Rank1 고정
- [x] 희귀도 70/25/5 (출시 범위는 전설 → 희귀 강등), 확률은 카드 화면 ⓘ에 공개
- [x] 융합 카드 없이 레벨업 4회가 지나면 5번째에 융합 카드 보장, Lv3에 자기 전술기·Lv5에 자기 궁극기(미보유 시) 보장
- [x] 도전 상성 캐릭터는 정석 캐릭터 가중(×1.5) 미적용
- [x] 같은 시드 재도전 → 같은 카드·희귀도, 다시 뽑기 판당 1회, 건너뛰기 자금 +40
- [x] 융합 "녹색 제방"(제방 쌓기 + 습지 복원) 발동 시 1회 적용되고 도감에 기록

---

## Implementation Notes

- 난수는 카드·사건·날씨 3스트림 분리(다시 뽑기가 다른 스트림에 영향 없음).
- 융합 카드는 희귀도와 무관하게 ✨ 배지로만 표시. 상세 `docs/DETAILED_DESIGN_V2.md` §7.2~7.4.

---

## Out of Scope

- Story 003: 스킬 자체의 효과
- Story 006: 빌드 보너스 점수 계산

---

## Files

- `src/rules/leveling.ts`, `src/rules/cards.ts`, `src/rules/fusion.ts`, `data/fusions.json`
- `src/ui/screens/levelUp.ts`
- `tests/unit/draft/draft_test.ts`

---

## QA Test Cases

*N/A — no qa-lead specs at this tier; implement against the Acceptance Criteria above*

---

## Test Evidence

*`qa.level: minimal`: tests are waived (advisory).*

**Story Type**: Logic
**Required evidence**:
- Logic: `tests/unit/draft/draft_test.ts` — must exist (advisory at minimal)

**Status**: [x] Created — `tests/unit/draft/draft_test.ts` (14 tests), e2e draft flow + `production/qa/evidence/story-002-*-6-levelup-2026-11-08.png`

---

## Implementation Notes (2026-11-08)

| AC | 근거 |
|---|---|
| 점수 = 경험치 | `src/rules/leveling.ts`: 배수 ×0.3·차단 ×0.35·생태 최고치 1%당 +8·무피해 +60·클리어 +100 (계수는 `data/economy.json`). 혼합 봇 4맵 점수 1,096~1,388, **레벨업 5회**(Lv6) (LVL-01, 봇 테스트) |
| 대기·막판 성장 | 웨이브 중 레벨업 → HUD 대기 배지(⬆●), 웨이브 끝 `levelup` 단계에서 연속 선택. 마지막 웨이브 레벨업은 `lateLevels`(레벨당 +50, 결과 점수는 Story 006) (LVL-02) |
| 카드 구성 | 자기 1 + 교차 2, 다른 캐릭터 궁극기 제외, 교차 액티브 2칸이면 교차 액티브 제외, 교차는 Rank 1·일반 고정 (CRD-01/02, 2,000 시드) |
| 희귀도 | 70/25/5 ±0.5%p (10만 회), 전설 → 희귀 강등, 확률 ⓘ 공개 (CRD-07) |
| 천장·스파이크 | 융합 카드 없이 4회 → 5번째 보장(300 시드), Lv3 자기 전술기·Lv5 자기 궁극기 (CRD-04/05) |
| 상성 | 맵 스타일(평야 → 둑지기, 범람원 → 습지 연구원)의 정석 가중 ×1.5는 도전 캐릭터일 때 꺼짐 (CRD-03) |
| 시드·다시 뽑기·건너뛰기 | 같은 시드 → 같은 카드(`rng.cards` 상태가 체크포인트에 포함), 다시 뽑기 판당 1회, 건너뛰기 +40 (CRD-06) |
| 녹색 제방 | 제방 쌓기 + 습지 복원 보유 시 1회 발동, 제방 안쪽 셀 0.003/tick 흡수, 도감(`codex`) 기록 (FUS-01) |

**결정·차이**
- **"융합 카드"**: 융합을 완성하는 카드가 우선, 없으면 융합 재료 카드도 ✨로 표시하고 천장에 포함. 습지 연구원은 제방 쌓기(교차)와 습지 복원(자기 전술기)을 둘 다 얻어야 해서, 한 장으로 완성되는 카드가 없을 때가 많다.
- **정석 가중**은 출시 범위(캐릭터 2명)에서 교차 후보가 늘 한 캐릭터 것이라 실제 분포에 영향이 없다. 빙하 맵은 정석 캐릭터가 아직 없어 가중 없음.
- **다시 뽑기**도 천장 카운트에 1회로 센다.
- 대체 카드(보급 +60 / 응급 보수 HP +10 / 정비 공통 쿨다운 −15%, 최대 2회)는 후보가 모자랄 때만 나온다.
- 레벨업 배지 탭으로 웨이브 중 즉시 선택(설정 옵션)은 미구현 — 웨이브 끝 정산만.
- 런 시드는 화면 계층에서 `crypto`로 정하고(`?seed=`로 고정 가능), 시뮬레이션·규칙은 시드만 받는다.
- 튜토리얼 5단계는 이제 실제 카드 선택/건너뛰기로 진행(W1에 레벨업이 없으면 탭).

## Dependencies

- Depends on: `production/epics/physics-td/story-003-characters-and-skills.md`
- Unlocks: `production/epics/physics-td/story-006-result-ending-save.md`
