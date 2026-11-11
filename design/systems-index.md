# Physics TD — 시스템 인덱스

> 2026-11-11 기준 저장소 파일 존재 여부로 분류한 개발 현황. 파일 존재는 기능 완성이나 실기 검증을 뜻하지 않는다.

## 기준 문서 및 엔진 경로
- 게임 설계의 우선 기준: [GAME_DESIGN_V2.md](../docs/GAME_DESIGN_V2.md)
- 구현 명세: [DETAILED_DESIGN_V2.md](../docs/DETAILED_DESIGN_V2.md)
- 플레이 흐름 요약: [game-brief.md](game-brief.md)
- **메인 배포**: `src/main.ts` → GitHub Pages `/`
- **별도 탑뷰 프로토타입**: `topview-engine.js` + `src.js` → `/legacy/`
- P1-A 고도·P1-B 제방 내구도는 **legacy 프로토타입 전용**이며 메인 v2에 반영된 것으로 표시하지 않는다.

## 시스템별 추적

| ID | 시스템 | 메인 코드 근거 | 상태 | 후속 검증 |
|---|---|---|---|---|
| SIM-01 | 물 확산·수위 | `src/sim/fluid.ts`, `src/sim/step.ts` | 코드 존재 | 질량 보존·재현성·성능 |
| SIM-02 | 지형·고도·유입 | `src/sim/terrain.ts`, `src/sim/inflow.ts` | 코드 존재 | 고도 경계·4방향 유입 |
| SIM-03 | 제방·수문·시설 | `src/sim/leveeLines.ts`, `src/sim/structures.ts` | 코드 존재 | 내구도·누수·파괴 구현 범위 확인 |
| SIM-04 | 배출·저류·얼음 | `src/sim/sinks.ts`, `src/game/lakes.ts`, `src/sim/ice.ts` | 코드 존재 | 펌프 처리량·배출 경로 확인 |
| GAME-01 | 맵·웨이브·플레이 | `src/game/map.ts`, `src/game/play.ts` | 코드 존재 | 5웨이브 진행·밸런스 |
| GAME-02 | 캐릭터·스킬·융합 | `src/rules/skills.ts`, `src/rules/fusion.ts` | 코드 존재 | 조합·밸런스·예외 |
| GAME-03 | 성장·결말·점수 | `src/rules/leveling.ts`, `src/rules/endings.ts`, `src/rules/scoring.ts` | 코드 존재 | 공정성·엔딩 조건 |
| UX-01 | 모바일 입력·타깃 | `src/input/gestures.ts`, `src/input/targeting.ts` | 코드 존재 | 터치 실기·오입력 |
| UX-02 | 화면·HUD·시각화 | `src/ui/screens/play.ts`, `src/ui/widgets/hud.ts`, `src/render/waterLayer.ts` | 코드 존재 | 가독성·작은 화면 |
| DATA-01 | 저장·체크포인트 | `src/save/storage.ts`, `src/game/checkpoint.ts` | 코드 존재 | 이전 저장 호환성 |
| QA-01 | 자동 테스트·배포 | `tests/`, `.github/workflows/pages.yml` | 자동화 존재 | 브라우저 실기·배포 SHA 일치 |

## 우선 개발 작업
1. **P0:** 메인 v2와 legacy 프로토타입의 기능 차이 문서화. 어떤 시스템을 제품 기준으로 삼을지 결정.
2. **P1-C:** 배수펌프 유량 상한·전력·배출 목적지. 먼저 메인 `src/sim/sinks.ts` 구현과 기존 설계의 차이를 검사.
3. **P1-B 통합 검토:** legacy 제방 내구도 구현을 메인에 단순 복사하지 않고 기존 `leveeLines.ts` 규칙과 충돌 검사.
4. **P2:** 모바일 실기 테스트, 게임 밸런스, 5~7분 세션 검증.

## 완료 판정 원칙
- 설계 완료 / 코드 존재 / 테스트 통과 / Git 커밋 / Pages 배포 성공 / 브라우저 실기 검증을 별도로 기록.
- 자동 CI 성공만으로 물리 정확도나 UX 품질을 보증하지 않는다.
- 구체적 테스트 실행 결과가 없는 항목은 **미검증**으로 유지한다.
