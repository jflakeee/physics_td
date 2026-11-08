# Story 005: 판 안 레벨업 드래프트

> **Epic**: physics-td
> **Status**: Ready
> **Layer**: Feature
> **Type**: Logic
> **Estimate**: M
> **Manifest Version**: N/A (minimal — no control manifest)
> **Last Updated**: — (set by /dev-story when implementation begins)

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

- [ ] 플레이 점수 = 경험치(1:1), 필요 경험치 `round(100 × 1.35^(Lv−1))`, 평균 플레이에서 판당 레벨업 5~6회
- [ ] 웨이브 중 레벨업은 대기 배지로만 표시, 웨이브 끝 정산에서 연속 선택. 마지막 웨이브 중 레벨업은 레벨당 +50 결과 점수로 전환
- [ ] 카드 3장 = 자기 1 + 교차 2. 다른 캐릭터 궁극기는 절대 등장하지 않고, 교차 액티브는 최대 2칸, 교차 스킬은 Rank1 고정
- [ ] 희귀도 70/25/5 (출시 범위는 전설 → 희귀 강등), 확률은 카드 화면 ⓘ에 공개
- [ ] 융합 카드 없이 레벨업 4회가 지나면 5번째에 융합 카드 보장, Lv3에 자기 전술기·Lv5에 자기 궁극기(미보유 시) 보장
- [ ] 도전 상성 캐릭터는 정석 캐릭터 가중(×1.5) 미적용
- [ ] 같은 시드 재도전 → 같은 카드·희귀도, 다시 뽑기 판당 1회, 건너뛰기 자금 +40
- [ ] 융합 "녹색 제방"(제방 쌓기 + 습지 복원) 발동 시 1회 적용되고 도감에 기록

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

**Status**: [ ] Not yet created

---

## Dependencies

- Depends on: `production/epics/physics-td/story-003-characters-and-skills.md`
- Unlocks: `production/epics/physics-td/story-006-result-ending-save.md`
