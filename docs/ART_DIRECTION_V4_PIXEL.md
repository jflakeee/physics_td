# V4 아트 방향 — 고해상도 픽셀 (벡터 제외)

- 상태: **검토·제안** (구현 전)
- 작성일: 2026-11-09
- 이력:
  1. 첫 요청 "물은 픽셀, 건물·아이콘은 고해상도 벡터" → 유사 사례 조사(§1)
  2. 이어진 요청 "벡터 이미지 제외, 고해상도 픽셀 검토" → 이 문서의 결론(§0, §3–§6). 벡터안은 §7에 폐기안으로 남김
- 대상: `prototypes/v4-hydro/` 화면 (`docs/REDESIGN_V4_HYDRO.md` §3)

---

## 0. 결론

1. **모든 그림을 한 가지 픽셀 크기로 그린다.** 물, 지형, 건물, 아이콘이 같은 크기의 픽셀 격자 위에 있다. 해상도를 섞지 않으므로 픽셀 아트에서 금기로 보는 "mixels" 문제가 처음부터 없다.
2. **시뮬레이션 해상도와 그림 해상도를 분리한다.** 물리는 지금처럼 64×96 셀. 그림은 **셀 1개 = 3×3 아트 픽셀**, 즉 192×288 아트 픽셀. 고해상도 픽셀 게임들(Owlboy, Eastward 등)의 일반적인 화면 해상도인 640×360, 480×270과 같은 급이다.
3. **물은 셀 값을 보간해서 3배로 키운다.** 물가 경계는 대각선을 따라가고, 깊이는 디더링 단계로, 물가는 1픽셀 윤곽선으로 그린다. 물리 계산 비용은 그대로다.
4. **화면에는 정수 배율로만** 키운다. 아이폰 SE 기준 2배, 일반 폰 5–6배. 남는 공간은 여백.
5. 건물·아이콘은 **코드 안의 팔레트 문자열 스프라이트**(예: 18×18)로 그린다. 외부 이미지 파일이 필요 없다.
6. **글자는 예외로 시스템 글꼴**을 쓴다. 한글 픽셀 글꼴은 작은 크기에서 아이들이 읽기 어렵고, 글꼴 파일 크기도 크다.

비교 이미지: `production/qa/evidence/v4-hires-pixel-compare-2026-11-09.png` — 같은 게임 상태를 지금 방식(셀 1개 = 픽셀 1개)과 제안 방식(3×3, 보간 + 디더 + 물가 윤곽)으로 그린 것. 오른쪽은 강 가장자리가 계단 대신 대각선을 따르고, 깊이가 단계적으로 보이며, 저수지가 둥글다.

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


### 1.1 고해상도 픽셀 사례 (추가 조사)

| 게임 | 화면 해상도 (비공식 측정) | 참고할 점 |
|---|---|---|
| **Owlboy** | 640×360 | "Hi-Bit"라는 말을 만든 게임. 16비트보다 세밀하고 32비트에 가까운 픽셀 아트 |
| **Hyper Light Drifter** | 480×270 | 고해상도 픽셀의 대표작. 아름답지만 제작비가 매우 크다는 평 |
| **Eastward, Sea of Stars, Kingdom Two Crowns** | 640×360 | 큰 스프라이트(32–128 px), 넓은 팔레트, 서브픽셀 애니메이션 |
| **Terraria** | 타일 16 px | 액체 양을 타일마다 0–255로 저장하고 타일 안에서 높이로 그린다. 즉 **시뮬 격자(타일)보다 세밀하게 물을 그린다** — 이 문서의 3배 보간과 같은 생각. 다만 정확한 그리기 공식은 공개 자료에서 확인 못 함 |

- 해상도 수치는 GitHub의 비공식 측정 자료라 개발사 공식 수치로 확인되지 않았다.
- 거친 격자로 시뮬하고 고운 해상도로 표면을 그리는 방식은 영상·VFX 유체에서 일반적인 기법이다(저해상도 물리 + 고해상도 표면).

## 2. 위험과 대응

| 위험 | 대응 |
|---|---|
| 정수 배율이면 기기마다 여백이 생긴다 | 아트 해상도를 기기 표에 맞춰 고른다(§4). 192×288이면 대부분 폰에서 보드가 화면 폭의 89–99% |
| 보간한 물이 물리와 다르게 보인다(물이 없는 곳이 젖어 보임) | 경계 기준을 깊이 0.04로 잡고, 보간은 이웃 4셀만. 셀 하나 안에서만 모양이 바뀐다 |
| 스프라이트 제작 비용 | 1차는 20개 남짓(§5). 코드 안 문자열로 그려서 도구·파일 없이 바로 수정 |
| 매 프레임 그리기 비용 | 192×288 = 약 5.5만 픽셀. 지금(6,144픽셀)의 9배지만 단순 반복이라 1–2 ms 수준 예상. 구현 때 측정 |
| 고해상도 픽셀은 제작비가 크다는 평(Hyper Light Drifter) | 캐릭터 애니메이션이 없는 게임이라 해당 부담이 작다. 회전 바퀴 4프레임, 정령 2프레임 정도 |

---

## 3. 그림 규칙

### 3.1 한 격자

- **아트 픽셀 1개 = 셀의 1/3.** 맵 전체 192×288 아트 픽셀.
- 물, 얼음, 모래, 흙, 지형, 건물, 정령, 상태 배지 모두 이 격자 위에 그린다. 반 픽셀·회전 보간 없음.
- 물레방아 회전은 **미리 그린 4프레임**을 바꿔 보여 준다(돌려서 그리면 픽셀이 뭉개짐).

### 3.2 물

- 아트 픽셀 중심에서 이웃 4셀의 물 깊이를 보간한다.
- 깊이 0.04 이하 = 마른 땅. 그 위는 4단계 색 + 4×4 베이어 디더로 단계 사이를 섞는다.
- 물 옆에 마른 땅이 있으면 그 물 픽셀은 밝은 물가 색(윤곽).
- 얼음은 흰색 + 푸른 윤곽, 펌프·흡수 중인 물은 v2 색조(B3)를 그대로.
- 흐름 반짝임(선택): 셀 간 유출량 방향으로 밝은 픽셀 몇 개가 흘러간다. 움직임 줄이기 설정이면 끔.

### 3.3 스프라이트

- 팔레트 16색 이내(물 4, 땅 4, 건물 4, 강조 4). 윤곽선은 가장 어두운 땅색.
- 크기: 물레방아 18×18, 집 12×12, 정령 12×12, 상태 배지 9×9, 빈터 표시 9×9.
- 코드 안에 문자열로 저장: 한 글자 = 팔레트 번호 하나.

```
// 예: 상태 배지 '잠김' 9×9 (. = 투명)
'..11111..',
'.1222221.',
...
```

### 3.4 화면 밖 UI

- 상단·하단 바의 아이콘(하트, 코인, 날씨, 짓기)도 같은 스프라이트를 **같은 배율**로 쓴다.
- 글자는 시스템 글꼴(예외).

---

## 4. 기기별 배율

보드가 쓸 수 있는 영역 기준 대략치(상·하단 바 제외).

| 기기 (CSS 폭 × DPR) | 보드 기기 픽셀 폭 | 128×192 (셀당 2) | **192×288 (셀당 3)** | 256×384 (셀당 4) |
|---|---|---|---|---|
| iPhone SE 1세대 (320 × 2) | 약 510 | 3배 → 75% | **2배 → 75%** | 1배 → 50% ✗ |
| iPhone 13 (390 × 3) | 약 1158 | 9배 → 99% | **6배 → 99%** | 4배 → 88% |
| 갤럭시 일반 (360 × 3) | 약 1080 | 8배 → 95% | **5배 → 89%** | 4배 → 95% |

- 셀당 4픽셀은 작은 폰에서 1배가 되어 너무 작다. 셀당 2픽셀은 디테일이 부족하다. **셀당 3픽셀을 권장**한다.
- 배율 = `floor(보드 기기 픽셀 폭 / 192)`, 최소 1. 크기·확대 비율이 바뀌면 다시 계산.

---

## 5. 구현 계획

1. 아트 버퍼 192×288 `ImageData` 하나. 물·지형·스프라이트를 모두 여기에 그린 뒤 정수 배율로 한 번에 화면에 올린다(`imageSmoothingEnabled = false`, CSS `image-rendering: pixelated`).
2. 물 3배 보간 + 디더 + 물가 윤곽(비교 이미지에 쓴 코드를 정리해 옮김).
3. 스프라이트 약 20개: 물레방아 4프레임, 고장 난 물레방아, 저수지 수문, 둑 말뚝, 집(불 켜짐/꺼짐), 모래 정령, 얼음 정령, 배지 3종(잠김·멈춤·고장), 빈터, 추천 별, 날씨 5종, 하트, 코인, 짓기.
4. 이모지를 모두 스프라이트로 교체.
5. e2e: 배율이 정수인지, 보드 크기가 `192 × 배율`인지, 화면에 이모지 글자가 남지 않았는지 검사. 스크린샷 보관.
6. 그리기 시간 측정(목표: 4배 CPU 감속에서 프레임당 4 ms 이하).

---

## 6. 결정이 필요한 것

1. **셀당 3픽셀(192×288)** 로 갈지. 권장: 예.
2. **글자는 시스템 글꼴 예외**로 둘지. 권장: 예. 픽셀 글꼴은 숫자(레벨·코인)에만 쓰는 것도 가능.
3. **흐름 반짝임**을 넣을지. 권장: 1차에는 빼고, 정적인 화면부터 확인.

---

## 7. 폐기안: 픽셀 물 + 벡터 건물

첫 요청에서 검토한 안. 규칙은 "시뮬레이션되는 물질은 픽셀, 사람이 만든 것과 정보는 벡터"였다(Earthblade의 세계 = 픽셀, UI = 고해상도 기준을 따름). 해상도가 다른 두 층을 겹치므로 두 그림체를 묶는 추가 규칙(윤곽선 색 맞추기 등)이 필요했다. 사용자 결정으로 벡터를 빼고 이 문서의 단일 픽셀 격자안으로 바꿨다.

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

- [Owlboy: What's Hi-Bit pixel art? (Steam)](https://steamcommunity.com/games/115800/announcements/detail/894353421009200862)
- [2D pixel art style guide: from 8-bit to modern HD](https://www.sprite-ai.art/blog/2d-pixel-art-style-guide)
- [Pixel-art games at 256 to 480 art px across (GitHub research issue)](https://github.com/shrujancheruku/look-together/issues/200)
- [Liquids — Terraria Wiki](https://terraria.wiki.gg/wiki/Liquids)
- [Water — Terraria Wiki](https://terraria.wiki.gg/wiki/Water)
- [A Practical Method for High Resolution Embedded Liquid Surfaces](https://www.academia.edu/24976302/A_Practical_Method_for_High_Resolution_Embedded_Liquid_Surfaces)
- [Feature Focus: Display scaling (Construct)](https://construct.net/en/blogs/construct-official-blog-1/feature-focus-display-scaling-1592)
- [Setting up pixel art graphics in Godot 4 (GDQuest)](https://www.gdquest.com/library/pixel_art_setup_godot4/)
- [Pixel art resolution for mobile (Godot forum)](https://forum.godotengine.org/t/what-are-the-right-resolution-aspect-mode-and-scaling-for-pixel-art-games-for-mobile/94804)

- 원문 대부분은 이 세션 네트워크에서 직접 열 수 없어 검색 요약으로 확인했다. Noita의 고해상도 조명은 익명 포럼 주장이라 미확인이다.
- Where's My Water?의 물 렌더링 방식은 이번 검색에서 출처를 찾지 못해 표에서 뺐다.
