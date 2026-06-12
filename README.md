# 📈 StockAI

한국·미국 주식을 위한 **AI 기반 주식 분석 앱**.
한국투자증권(KIS) OpenAPI로 실시간 시세·수급·차트를 가져오고, AI가 종목을 진단·추천하며, 기관/외국인 수급 이상과 배당락 임박 종목을 자동으로 발굴합니다.

> Expo(React Native) 앱 + Vercel 서버리스 백엔드로 구성된 모노레포. iOS / Android / 웹(PWA)에서 동작합니다.

---

## 🏗️ 아키텍처

```
┌──────────────────────────┐      ┌───────────────────────────┐
│  모바일 / PWA (Expo RN)   │ ──▶  │  서버리스 백엔드 (Vercel)   │
│  App.js + src/           │ HTTP │  server/api/*             │
└──────────────────────────┘      └─────────────┬─────────────┘
        │                                        │
   Supabase (인증/DB)              ┌──────────────┼──────────────┐
   AsyncStorage (로컬)         KIS API      Groq (LLM)     Naver 뉴스
                              한국투자증권    Gemini       Upstash Redis(캐시)
```

- **프론트엔드**: `App.js` + `src/` (화면·컴포넌트·서비스). 서버 API를 호출해 데이터를 받아 렌더링.
- **백엔드**: `server/api/` (Vercel 서버리스 함수). KIS·AI·뉴스·수급을 중계하고 캐싱.
- 데이터 흐름: 프론트는 직접 증권사 API를 부르지 않고 **반드시 백엔드를 경유**합니다 (키 보호 + 캐싱).

---

## 📁 폴더 구조

```
StockAI/
├── App.js                  # 앱 진입점 (네비게이션 + 4개 탭 정의)
├── src/
│   ├── screens/            # 화면: Home, Portfolio, Opportunity, StockDetail, Settings, Auth, Onboarding
│   ├── components/         # AIAnalysis, AIChatModal, PriceChart, NewsList, ETFList, QuantAnalysis, InstitutionalTrade
│   ├── services/           # 백엔드/외부 API 호출 (kisAPI, stockAPI, newsAPI, groqAPI, portfolioAPI, supabase ...)
│   ├── context/            # AuthContext (로그인 상태)
│   ├── data/               # koreanStocks.json, onboardingStocks.js
│   └── utils/              # market, aiChatStorage
│
├── server/                 # ── Vercel 서버리스 백엔드 (독립 package.json) ──
│   ├── api/
│   │   ├── kis/            # 한국투자증권: price, chart, investor, intraday, etf, sectors, search ...
│   │   ├── ai/             # analyze, recommend, conservative, aggressive, portfolio, ocr-portfolio, chat
│   │   ├── market/         # opportunity (수급 이상 + 배당락 발굴)
│   │   ├── macro/          # 거시지표 수집 + AI 컨텍스트
│   │   ├── us/             # 미국 주식 시세 프록시
│   │   ├── cron/           # 주기 작업: news, supply, screen
│   │   └── push/           # 웹푸시 구독/발송
│   ├── lib/                # KIS 인증·요청, 캐시 레이어(*Cache.js)
│   ├── data/               # 종목 DB, 스크리닝 후보
│   ├── dev-server.js       # 로컬 개발 서버 (Express, 포트 3000)
│   └── index.js            # Vercel 프로덕션 엔트리
│
├── components/             # Expo 템플릿 잔여 컴포넌트 (themed-*, ui/) — 현재 거의 미사용
└── vercel.json             # 서버 cron 스케줄 정의
```

---

## 🚀 빠른 시작

### 0. 사전 준비
- Node.js 18+ / npm
- (모바일 테스트 시) 휴대폰에 **Expo Go** 앱 설치
- API 키들 (아래 "환경 변수" 참고)

### 1. 백엔드 실행 (`server/`)

```bash
cd server
npm install
cp .env.example .env.local      # 그리고 키 값 채우기
npm run dev                     # http://localhost:3000
```

시작하면 콘솔에 키 로딩 상태(`KIS: OK / GROQ: OK ...`)와 모바일 접속용 LAN 주소가 출력됩니다.

### 2. 프론트엔드 실행 (루트)

```bash
npm install
cp .env.example .env            # 그리고 값 채우기 (아래 참고)
npm start                       # Expo Dev Server
```

- 터미널에서 `w`(웹) / `i`(iOS) / `a`(Android) / QR 스캔(Expo Go)
- 환경변수 변경 후에는 캐시 클리어 재시작 필요: `npx expo start -c` (→ `RESTART_GUIDE.md` 참고)

> 📱 **실기기에서 로컬 백엔드 붙이기**: 폰과 PC가 같은 Wi-Fi여야 하고, 프론트 `.env`의 `API_BASE_URL`을 `http://<내-PC-IP>:3000` 으로 설정하세요. (PC IP 확인: `ipconfig getifaddr en0`)

---

## 🔑 환경 변수

> ⚠️ 키는 절대 커밋하지 마세요. `.env`, `.env*.local`은 `.gitignore`에 포함되어 있습니다.

### 백엔드 — `server/.env.local`
| 변수 | 용도 | 발급처 |
|------|------|--------|
| `KIS_APP_KEY` / `KIS_APP_SECRET` | 한국투자증권 시세·수급 (핵심) | [KIS Developers](https://apiportal.koreainvestment.com) |
| `GROQ_API_KEY` | AI 분석·채팅 (Llama) | [Groq Console](https://console.groq.com) |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | 뉴스 검색 | [Naver Developers](https://developers.naver.com) |
| `UPSTASH_REDIS_REST_URL` / `..._TOKEN` | 캐시 (프로덕션) | [Upstash](https://upstash.com) |

### 프론트엔드 — 루트 `.env` (`react-native-dotenv`, `@env`로 import)
| 변수 | 용도 |
|------|------|
| `API_BASE_URL` | 백엔드 주소 (미설정 시 `localhost:3000` 또는 운영 서버로 폴백) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | 로그인/사용자 데이터 |

---

## 🤖 AI 동작 방식

- 종목 진단·자유 채팅은 백엔드 `server/api/ai/*`에서 처리.
- 현재 LLM은 **Groq `llama-3.3-70b-versatile`** 사용 (OCR 등 일부는 Gemini).
- 답변 품질을 위해 **매크로·뉴스·수급 데이터를 시스템 프롬프트에 주입**해 컨텍스트 기반으로 답합니다.

---

## ⏱️ 자동 수집 (Cron)

`vercel.json`에 정의된 주기 작업 (프로덕션):

| 작업 | 주기 | 내용 |
|------|------|------|
| `macro/collect` | 15분 | 거시경제 지표 |
| `cron/news` | 1시간 | 뉴스 |
| `cron/supply` | 30분 | 기관/외국인 수급 |
| `cron/screen` | 매일 23시 | 종목 스크리닝 |

> 로컬 `dev-server.js`는 동일 작업을 `setInterval`로 직접 돌립니다.

---

## 📚 추가 문서
- `HOW_TO_ADD_ETF_STOCKS.md` — 관심 종목 ETF 편입 정보 추가법
- `RESTART_GUIDE.md` — 환경변수 변경 후 재시작 가이드
- `CLAUDE.md` — AI(Claude Code) 협업 규칙 및 개발 컨벤션

---

## 🚢 배포
- 백엔드: Vercel (`server/` → `cd server && npm run deploy` 또는 `.github/workflows/deploy.yml` 자동 배포)
- 프론트(웹/PWA): Expo web 빌드
- 모바일 빌드: EAS (`eas.json`, projectId 설정됨)
