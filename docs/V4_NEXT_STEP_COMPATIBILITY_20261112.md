# Physics TD — V4 우선 개발 및 P1-D 호환성 게이트 (2026-11-12)

## 확인한 main 기준
- `ca8f684`: V4 물레방아 수에 따른 코인 수입 개선 병합. 해당 SHA GitHub Actions 성공(43157681801).
- `5f8b342`: V4 채집·업그레이드·스테이지별 맵·재해·숫자 표시 병합. GitHub Actions 성공(43154183717).
- `f06528c`: 기존 v2 펌프/파이프 P1-D 모바일 경로 미리보기와 포화 경고. GitHub Actions 성공(43136332563).

## 코드 경계
- **V4 플레이:** `prototypes/v4-hydro/{core,main,tuning,meta}.ts`, `tests/unit/v4-hydro/`, `tests/e2e/v4-hydro.e2e.mjs`.
- **v2 펌프/파이프:** `src/sim/{sinks,pipeRoute}.ts`, `src/game/play.ts`, `src/ui/screens/play.ts`, `design/P1_D_PIPE_NETWORK.md`.
- 공통 물리 기반: `src/sim/fluid.ts`, `src/core/types.ts`, `src/sim/grid.ts`.
- V4에 펌프/파이프가 적용되었다는 근거는 아직 없다. 두 코드 경로의 기능을 혼동하지 않는다.

## 권장 P0 다음 단계
1. V4를 현재 기준으로 고정하고 테스트(`npm test`), 타입(`npm run typecheck`), 빌드(`npm run build`), 모바일 E2E(`npm run e2e`) 결과를 각각 기록한다.
2. V4 코인 수입 회귀: 물레방아 1·3·5개, 물 부족으로 멈춘 물레방아, 마을 수요 미충족, 저장/복원 이후 수입을 독립적으로 검증한다.
3. V4 자원 채집/리스폰과 건물 업그레이드의 재화 중복 지급, 다중 탭, 저장 후 재진입을 점검한다.
4. V4 실제 모바일 화면에서 스테이지 이동, 자원 터치, 업그레이드, 클리어 후 버튼 3개를 검증한다.
5. v2 P1-D 파이프를 V4에 이식할지 별도 설계 승인 후 결정한다. 현재 비용 가설(기본 5 + 칸당 2)은 승인 전이며 V4 코인 경제에 적용하지 않는다.

## 완료 판정
- 코드 작성 / Git 커밋 / Actions 성공 / Pages 배포 / 실제 브라우저 검증은 서로 다른 상태로 기록한다.
- GitHub Actions 성공만으로 특정 기능의 실제 모바일 터치 검증 완료를 선언하지 않는다.
- V4 코어의 기존 수력 발전량·물량 보존·저장 호환성을 변경할 경우 반드시 회귀 테스트를 추가한다.
