# Physics TD

모바일 우선 웹 기반 **탑뷰 자연재해 방어 시뮬레이션**. 중앙 기지를 네 방향의 홍수로부터 제방·배수펌프·냉각탑으로 보호합니다.

- [웹 게임 실행](https://jflakeee.github.io/physics_td/)
- [통합 설계·조사·구현 자료집](docs/PHYSICS_TD_MASTER_DESIGN.md)
- [설계 검토·장르 벤치마크 리포트 (2026-11)](docs/DESIGN_REVIEW_2026-11.md)
- [모바일 중심 전면 재구현 검토](docs/MOBILE_REBUILD_REVIEW.md)
- [배치 UX가 필요 없는 UI 브레인스토밍](docs/NO_PLACEMENT_UI_BRAINSTORM.md)
- [소스 및 변경 이력](https://github.com/jflakeee/physics_td/commits/main/)
- [자동 테스트 및 배포 결과](https://github.com/jflakeee/physics_td/actions)

## 로컬 검증

```bash
npm test
npm run build
```

GitHub Pages용 정적 웹 프로젝트입니다. Android 빌드/배포는 포함하지 않습니다.

> 현재 물 시뮬레이션은 단순 격자 확산 모델입니다. 지형 고도·수압·제방 내구도 등은 향후 구현 항목입니다.
