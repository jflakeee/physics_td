# V4 아트 방향 — 픽셀 물 + 벡터 건물·아이콘 (유사 사례 조사)

- 상태: **조사·제안** (구현 전)
- 작성일: 2026-11-09
- 요청: "물은 픽셀 렌더링, 건물과 아이콘은 해상도 높은 벡터 그래픽 — 유사 사례 딥리서치"
- 대상: `prototypes/v4-hydro/` 화면 (`docs/REDESIGN_V4_HYDRO.md` §3)

---

## 0. 결론

1. **섞는 것은 가능하다. 단, 규칙이 있어야 한다.** 픽셀 아트 쪽에서는 해상도를 섞는 것을 금기("mixels")로 본다. 잘된 사례는 모두 *역할에 따라* 나눈다.
2. 이 게임의 규칙을 하나로 정한다: **시뮬레이션되는 물질은 픽셀, 사람이 만든 것과 정보는 벡터.**
   - 픽셀: 물, 얼음, 모래주머니, 파낸 흙, 지형 — 셀 하나 = 픽셀 하나. 시뮬레이션 격자가 그대로 보인다.
   - 벡터: 물레방아, 저수지 수문, 둑, 마을 집, 정령, 날씨·하트·코인 아이콘, UI.
3. 픽셀 층은 **정수 배율**로만 키운다. 지금은 셀 하나가 화면에서 5.08 px처럼 소수 배율이라 셀 크기가 들쭉날쭉하다.
4. 지금 쓰는 이모지(⚙️🫧💤🔧🏠)는 기기마다 모양이 다르고 비트맵이다. **직접 그린 벡터 아이콘 한 세트**로 바꾼다.

---

## 1. 유사 사례

| 게임 | 물(유체) | 나머지 | 이 게임에 주는 것 |
|---|---|---|---|
| **Creeper World 1–3** (Knuckle Cracker) | 격자 위 셀룰러 오토마타 유체(적 "크리퍼"), 셀 단위로 보임 | 건물·유닛은 따로 그린 스프라이트 | 가장 가까운 선례: **격자 유체 TD**. 유체는 격자 그대로, 건물은 분리된 그림 |
| **Creeper World 4** | 같은 2D 시뮬을 셀당 꼭짓점 하나인 메시로 3D처럼 표현 | 3D 모델 | 시뮬 해상도와 표현 해상도를 분리할 수 있다는 예 |
| **Creeper World IXE / 5** | 픽셀 아트 + 낙하 모래(falling sand) 지형 | — | 시리즈가 다시 **픽셀 유체**로 돌아옴 |
| **Noita** (Nolla Games) | 모든 픽셀이 시뮬레이션되는 낙하 모래 엔진 | 커뮤니티 설명으로는 조명을 낮은 환경 해상도보다 높은 정밀도로 처리 (비공식) | 픽셀 물질 + 고해상도 효과(빛) 조합. 단, 출처가 익명 포럼이라 미확인 |
| **Oxygen Not Included** (Klei) | 타일 격자 액체. 덩어리 하나로 보이게 그리고 가장자리만 윤곽선. 어는점 근처 색조, 끓는점 근처 거품 | 굵은 윤곽선의 손그림 벡터풍 기계·캐릭터. 윤곽선 굵기 = 물체의 밀도·존재감 | **격자 액체 + 벡터풍 건물**의 대표 사례. 상태를 색·효과로 표시하는 방법 |
| **PixelJunk Shooter** (Q-Games) | 입자 유체, 유체 종류별 전용 셰이더. 물 + 용암 = 깨지는 바위 | 매끈한 HD 그래픽 | 유체가 화면의 주인공. 물질 상호작용(용암 + 물 → 바위)의 시각 표현 |
| **Earthblade** (Saint11 블로그) | — | 게임 세계는 픽셀, UI는 고해상도 | **섞는 기준**: 세계 안의 것은 픽셀, 세계 밖 정보(UI 아이콘)는 고해상도. 같은 아이템이 세계에서는 픽셀, UI에서는 고해상도 |
| **HD-2D** (Octopath Traveler 등) | — | 픽셀 캐릭터 + 3D 배경·조명 | 상업적으로 성공한 혼합. 단, "다 비슷해 보인다"는 비판도 있다 |
| **Timberborn** | 격자 물 시뮬을 매끈한 3D 수면으로 | 3D | 격자를 숨기면 생기는 문제(줄무늬·깜박임 버그 보고)가 있다 — 격자를 *보여 주는* 쪽이 오히려 안전 |

---

## 2. 섞을 때의 위험과 대응

| 위험 | 출처 | 대응 |
|---|---|---|
| 해상도가 섞이면 아마추어처럼 보인다 | Saint11 "Consistency" | 역할 규칙(§0-2)을 한 줄로 정하고 예외를 만들지 않는다 |
| 소수 배율이면 픽셀 크기가 2 px, 3 px로 들쭉날쭉 | MDN, Josh on Design | 픽셀 층은 기기 픽셀 기준 정수 배율. 남는 공간은 테두리로 |
| 브라우저 확대·축소 때 devicePixelRatio가 바뀌어 픽셀이 뭉개짐 | MDN | 크기가 바뀔 때마다 배율 다시 계산(지금 ResizeObserver에 추가) |
| 벡터가 흐릿하다 | 고 DPI 캔버스 자료 | 벡터 층은 `devicePixelRatio`만큼 큰 캔버스에 그린다(지금도 그렇게 함) |
| 이모지는 기기마다 모양·크기가 다르다 | — | 직접 그린 벡터 아이콘 세트 |

---

## 3. 이 게임의 규칙

### 3.1 무엇이 픽셀이고 무엇이 벡터인가

| 픽셀 층 (격자 64×96, 정수 배율, 보간 없음) | 벡터 층 (기기 해상도, 매끈한 선) |
|---|---|
| 물 (깊이에 따라 4단계 색) | 물레방아 (회전), 수문, 둑 머리 |
| 얼음, 모래주머니, 파낸 흙 | 마을 집 (불 켜짐/꺼짐) |
| 지형 높낮이 음영, 강바닥 | 정령 (모래·얼음), 효과 화살표 |
| 물 가장자리 1셀 윤곽선 (ONI처럼 덩어리로 읽히게) | 빈터 [+], 추천 ★, 상태 배지(잠김·멈춤·고장) |
| | 상단 HUD 아이콘, 카드 그림 |

- **둑**은 경계 사례다. 둑의 *몸체*(흙 셀, 높이가 시뮬에 들어감)는 픽셀, 위에 얹는 *표지*(말뚝·판자)는 벡터. 시뮬이 쓰는 것은 픽셀이라는 규칙을 지킨다.

### 3.2 벡터 아이콘 스타일

- 굵은 단색 윤곽선(ONI처럼 크기가 클수록 굵게) + 평면 색 2–3개. 그러데이션 없음.
- 윤곽선 색은 픽셀 지형의 가장 어두운 색과 맞춰 두 층을 묶는다.
- 아이콘은 코드 안의 Path2D(또는 인라인 SVG 경로)로. 외부 이미지 파일·글꼴 없음 → 오프라인·기기 차이 없음.
- 최소 크기: 맵 위 아이콘은 셀 6개(약 30 px) 이상, 상태 배지는 셀 3개 이상.

### 3.3 픽셀 층 표시

- 셀 하나의 기기 픽셀 크기 `cell = floor(보드 폭 × dpr / 64)`. 보드 실제 크기는 `64 × cell / dpr`, 남는 폭은 가운데 정렬 여백.
- `imageSmoothingEnabled = false` + 정수 배율로 `drawImage`. CSS는 `image-rendering: pixelated`.
- 물 가장자리 윤곽: 물 셀 옆에 마른 셀이 있으면 한 단계 어둡게.
- 얼음: 흰 픽셀 테두리, 모래주머니: 2색 체크무늬로 질감을 픽셀로만 표현.

---

## 4. 구현 계획 (V4 프로토타입 기준)

1. **두 캔버스 겹치기**: 아래는 픽셀 층(정수 배율, `pixelated`), 위는 벡터 층(DPR 해상도, 투명 배경). 입력은 위 캔버스에서 받는다.
2. 정수 배율 계산 + 확대·축소 때 다시 계산.
3. 물 가장자리 윤곽, 얼음·모래 픽셀 질감.
4. 벡터 아이콘 세트: 물레방아(회전), 저수지 수문, 둑 말뚝, 집(켜짐·꺼짐), 모래 정령, 얼음 정령, 잠김(물방울), 멈춤(Z), 고장(렌치), 빈터, 추천 별, 날씨 5종, 하트, 코인. 이모지 전부 교체.
5. e2e: 셀 크기가 정수 기기 픽셀인지, 벡터 층 캔버스 크기가 DPR 배인지 검사. 스크린샷을 `production/qa/evidence/`에 남긴다.

---

## 5. 출처

- [Creeper World (Wikipedia)](https://en.wikipedia.org/wiki/Creeper_World)
- [Fluid Simulation Like In Creeper World 1 And 3 (GameDev.net)](https://gamedev.net/forums/topic/681026-fluid-simulation-like-in-creeper-world-1-and-3/)
- [Creeper World 4 — Fluid simulation (Steam discussion)](https://steamcommunity.com/app/848480/discussions/0/592888305856593367/)
- [Crafting the Creep of Creeper World (Game Wisdom)](https://game-wisdom.com/critical/crafting-the-creep)
- [Creeper World 5 announcement](https://allthings.how/creeper-world-5-announcement-trailer-reveals-multiple-creeper-types-and-map-tools/)
- [Noita: every pixel is simulated (PC Gamer)](https://www.pcgamer.com/au/noita-is-a-hilarious-horrifying-wizard-death-experiment-where-every-pixel-is-simulated)
- [Noita, a game based on falling sand simulation (80.lv)](https://80.lv/articles/noita-a-game-based-on-falling-sand-simulation/)
- [Visual Traits of the Oxygen Not Included Art Style (Klei forums)](https://forums.kleientertainment.com/forums/topic/118425-visual-traits-of-the-oxygen-not-included-art-style/)
- [Liquid — Oxygen Not Included Wiki](https://oxygennotincluded.wiki.gg/wiki/Liquid)
- [Rendering fluids in a 2D pixel art style game (Unity Discussions)](https://discussions.unity.com/t/rendering-fluids-in-a-2d-pixel-art-style-game/1571593)
- [Optimising PixelJunk Shooter (Game Developer)](https://gamedeveloper.com/programming/optimising-pixeljunk-shooter-and-giving-it-the-ultimate-look)
- [Fluid dynamics and lighting in PixelJunk Shooter 2 (SIGGRAPH)](https://history.siggraph.org/learning/fluid-dynamics-and-lighting-implementation-in-pixeljunk-shooter-2-by-kessler-carabaich-and-kinoshita)
- [PixelJunk Shooter review (Co-Optimus)](https://www.co-optimus.com/review/367/page/1/pixeljunk-shooter.html)
- [Consistency — Saint11](https://saint11.art/blog/consistency/)
- [HD-2D (Wikipedia)](https://en.wikipedia.org/wiki/HD-2D)
- [Are HD-2D Graphics Improving Pixel Art or Holding It Back? (CBR)](https://www.cbr.com/hd2d-graphics-holding-pixel-art-back/)
- [Timberborn Update 6 press release (Mechanistry)](https://mechanistry.com/press/wonders-of-water-timberborn-update-6-adds-3d-water-physics-new-skyward-engineering-and-official-mod-support)
- [Timberborn: new water gives blocky artefacts (feature upvote)](https://timberborn.featureupvote.com/suggestions/562954/comment/632806)
- [Crisp pixel art look with image-rendering (MDN)](https://developer.mozilla.org/en-US/docs/Games/Techniques/Crisp_pixel_art_look)
- [Canvas Scaling and Smoothing Tricks (Josh on Design)](https://joshondesign.com/2023/04/15/canvas_scale_smooth)
- [High DPI canvas (web.dev)](https://web.dev/articles/canvas-hidipi)

- 원문 대부분은 이 세션 네트워크에서 직접 열 수 없어 검색 요약으로 확인했다. Noita의 고해상도 조명은 익명 포럼 주장이라 미확인이다.
- Where's My Water?의 물 렌더링 방식은 이번 검색에서 출처를 찾지 못해 표에서 뺐다.
