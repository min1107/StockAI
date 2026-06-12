# StockAI — 프로젝트 가이드 (Claude용)

개인 투자자가 기관·세력과 동등한 시야를 갖도록 돕는 AI 투자 비서 앱. 단순 데이터 정렬이 아니라
"일반인이 못 보는 것"을 AI로 해석해 보여주는 게 핵심.

> 이 파일은 협업하는 모든 사람의 Claude가 같은 규칙으로 일하도록 하는 공유 지침서다. 작업 전에 꼭 읽을 것.

---

## ⚠️ 가장 먼저 알아야 할 것

### 1. 이 앱은 네이티브 앱이 아니라 iOS Safari PWA로 쓴다
- 사용자는 웹 빌드를 **iOS Safari에서 "홈 화면에 추가"** 해서 PWA처럼 사용한다. Expo Go/EAS 빌드 아님.
- 그래서 **모든 기능은 "웹(react-native-web)에서 동작하는가"를 먼저 따져야 한다.**
- 알림은 Expo Push가 아니라 **Web Push**(서비스워커 + VAPID). 푸시 코드는 `src/services/webPush.js`, `public/sw.js`.

### 2. 배포 방법 (가장 흔한 실수 지점)
- **앱(클라이언트, `src/**`, `App.js`, `public/**`) → `git push origin main`** 하면 GitHub Actions가
  GitHub Pages로 자동 배포 (`.github/workflows/deploy.yml`). 주소: `min1107.github.io/StockAI/`
  - push 후 **GitHub Actions가 성공했는지 꼭 확인.** 조용히 실패하면 폰엔 옛 버전이 계속 뜬다.
  - PWA 캐시가 강해서, 반영 확인하려면 홈 화면 앱을 완전히 종료 후 재실행.
- **서버(`server/**`) → 반드시 `cd server && vercel --prod`.** git push로는 서버가 배포되지 않는다.
  - ❗ **루트(`/`)에서 `vercel --prod` 하지 말 것.** 루트 `vercel.json`의 cron 설정 때문에
    "Hobby plan cron" 에러로 실패한다. 무조건 `server/` 폴더에서 실행.
- 둘은 완전히 별개 파이프라인이다.

### 3. react-native-web의 `Alert.alert`는 no-op다
- 웹에선 `Alert.alert`가 아무것도 안 한다. `App.js`에서 `Platform.OS === 'web'`일 때
  `window.alert/confirm`으로 **전역 override**해 두었다. 새 Alert 사용처도 이 덕에 웹에서 동작한다.
- "버튼 눌러도 반응 없음 / 확인창 안 뜸" 류 버그는 이걸 의심.

---

## 아키텍처 (어디에 뭐가 있나)

| 부분 | 기술 | 위치 |
|---|---|---|
| 화면 | React Native Web (Expo SDK 54), React Navigation | `src/screens`, `src/components`, `App.js` |
| 서버 | Express on Vercel | `server/`, 프로덕션 `https://server-nine-alpha-95.vercel.app` |
| 인증·DB | Supabase (Auth + `portfolios`/`accounts` 테이블, **RLS 켜져 있음**) | `src/services/supabase.js`, `portfolioAPI.js` |
| 캐시·푸시구독·rate limit | Upstash Redis | `server/lib/*Cache.js`, `pushSubsCache.js`, `rateLimit.js` |
| AI | Groq (llama-3.3-70b) | `server/api/ai/*` |
| 국내 시세 | 한국투자증권(KIS) API | `server/api/kis/*` |
| 미국 시세 | Yahoo Finance | **서버 프록시 `server/api/us/quote.js` 경유 필수** (브라우저 직접 호출은 CORS로 막힘) |
| 환율·매크로 | Yahoo (USD/KRW 등) | `server/api/macro/*` |

- 클라이언트가 서버를 부르는 함수는 `src/services/`(stockAPI, kisAPI, portfolioAPI, webPush 등)에 모여 있다.
- 비밀값(API key 등)은 **전부 Vercel 환경변수에만** 둔다. 코드/깃/프론트에 절대 넣지 말 것.
  (`.env`는 gitignore됨. 공유 샘플은 `server/.env.example`.)

---

## 국내/미국 주식(미장) 처리

- 종목 판별 유틸: `src/utils/market.js`. **6자리 숫자 = 한국, 그 외(알파벳) = 미국.**
- 시세 조회용 심볼: 한국은 `.KS` 부착, 미국은 티커 그대로 (`toSymbol`).
- 표시 통화: 각 종목은 자기 통화(₩/$)로. 합계(총 평가액·계좌별·차트)는 **USD/KRW 환율로 원화 환산**
  (`toKRW`, 환율은 매크로 `usdKrw`).

---

## UI/UX 규칙

- **말투: 증권사 리포트 스타일 존댓말.** 반말/캐주얼 금지.
- **가독성 + 컴팩트**: 핵심 정보(수량·평단가·손익)를 압축해 한눈에. 여백 과하지 않게.
- 손익은 색상으로 +초록/−빨강 구분.
- 웹에서 드래그 리스트(`DraggableFlatList` 같은 중첩 VirtualizedList) 지양 — 스크롤 끊김. 일반 목록 + long-press 메뉴 선호.
- 전문 용어엔 쉬운 설명 병기, AI 발언엔 근거 데이터 함께.

---

## 보안 (이미 적용된 것 — 깨지 말 것)

- cron 엔드포인트는 `CRON_SECRET`으로 fail-closed (내부 호출 `res=null`은 통과).
- `/api/push/test`는 본인 구독으로만 발송.
- rate limiting: IP/분 — AI 30, push 20, 나머지 150 (`server/index.js` 미들웨어 + `lib/rateLimit.js`).
- CORS는 allowlist(github.io + localhost)만. 입력값 형식/크기 검증.

---

## 협업 메모

- `main`에 직접 push하면 바로 배포된다. 동시에 같은 파일 만지면 충돌나니, 가능하면 작업 영역을 나누거나
  브랜치 → Pull Request로 합치기.
- 의존성 추가 시 `package-lock.json`(앱) / `server/package-lock.json`을 **반드시 함께 커밋** (안 하면 배포 빌드가 깨짐).
- 커밋/PR은 한국어로 무엇을·왜 바꿨는지 명확히.
