# StockAI — 프로젝트 가이드 (Claude용)

개인 투자자가 기관·세력과 동등한 시야를 갖도록 돕는 AI 투자 비서 앱.
단순 데이터 정렬이 아니라 AI 해석으로 "일반인이 못 보는 것"을 보여주는 게 핵심.

> 이 파일은 협업하는 모든 사람의 Claude가 같은 규칙으로 일하도록 하는 공유 지침서다. 작업 전 꼭 읽을 것.
> 📘 앱이 뭐가 있고 어디까지 됐는지(기능·진행도·로드맵)는 **`docs/PROJECT.md`** 참고.

---

## ⚠️ 가장 먼저 알아야 할 것

### 1. 플랫폼: 지금은 iOS PWA, 목표는 네이티브 앱까지
- **현재**: iOS Safari에서 "홈 화면에 추가"한 PWA로 사용 (Expo Go/EAS 빌드 아님).
- **목표**: 같은 코드로 EAS 빌드 → iOS/안드로이드 **정식 앱(앱스토어·플레이)** 확장.
  그래서 **네이티브 설정(eas.json, app.json의 ios/android, expo 모듈)은 지우지 말 것.**
- 단, 기능 만들 땐 **"웹(react-native-web)에서도 되는가"를 항상 먼저 확인.**
- 알림은 현재 **Web Push**(서비스워커+VAPID). 네이티브 전환 시 네이티브 푸시로 더 안정화 가능.

### 2. 배포 (가장 흔한 실수 지점)
- **앱(src/**, App.js, public/**) → `git push origin main`** → GitHub Pages 자동 배포.
  push 후 GitHub Actions 성공 확인. PWA 캐시 강하니 반영 안 보이면 앱 종료 후 재실행.
- **서버(server/**) → 반드시 `cd server && vercel --prod`.** (git push로는 서버 배포 안 됨)
  ❗ 루트에서 vercel 하면 cron 때문에 "Hobby plan" 에러로 실패 → 꼭 server/ 폴더에서.

### 3. react-native-web의 Alert.alert는 no-op
- 웹에선 Alert가 아무것도 안 함 → App.js에서 window.alert/confirm으로 전역 override해 둠.
  "버튼 눌러도 반응 없음" 류 버그는 이걸 의심.

---

## 아키텍처
| 부분 | 기술 | 위치 |
|---|---|---|
| 화면 | React Native Web (Expo SDK 54) | src/screens, src/components, App.js |
| 서버 | Express on Vercel | server/ (server-nine-alpha-95.vercel.app) |
| 인증·DB | Supabase (RLS 켜짐) | src/services/supabase.js, portfolioAPI.js |
| 캐시·푸시구독·rate limit | Upstash Redis | server/lib/*Cache.js, rateLimit.js |
| AI | Groq (llama-3.3-70b) | server/api/ai/* |
| 국내 시세 | KIS API | server/api/kis/* |
| 미국 시세 | Yahoo → **서버 프록시 us/quote 경유 필수** (브라우저 직접=CORS 막힘) | server/api/us/quote.js |

- 비밀값(API key 등)은 **전부 Vercel 환경변수에만**. 코드/깃/프론트에 절대 금지. (.env는 gitignore)

## 국내·미국(미장) 처리
- `src/utils/market.js`: **6자리 숫자=한국, 그 외=미국 티커.**
- 시세 심볼: 한국 `.KS` 부착 / 미국 티커 그대로(`toSymbol`).
- 표시: 각 종목은 자기 통화(₩/$), 합계는 환율로 **원화 환산**(`toKRW`, 매크로 usdKrw).

## UI/UX 규칙
- 말투: **증권사 리포트 존댓말** (반말 금지). 가독성+컴팩트. 손익은 색상 구분.
- 웹에서 중첩 드래그 리스트 지양(스크롤 끊김) → 일반 목록 + long-press 메뉴.

## 보안 (건드리지 말 것)
- cron fail-closed(CRON_SECRET) / push/test 본인만 / rate limit / CORS allowlist / 입력검증.

## 협업 규칙
- main에 push하면 바로 배포됨. 동시 작업 충돌 피하려면 영역 나누거나 브랜치→PR.
- 의존성 추가 시 package-lock.json 함께 커밋(안 하면 배포 빌드 깨짐).
