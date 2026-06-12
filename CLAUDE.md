# CLAUDE.md — StockAI 개발 가이드

이 파일은 Claude Code(및 AI 협업 도구)가 이 저장소에서 작업할 때 따르는 규칙입니다.
사람 개발자도 읽으면 좋습니다. 전체 개요는 `README.md` 참고.

## 프로젝트 한 줄 요약
한국·미국 주식 AI 분석 앱. **Expo(React Native) 프론트엔드 + Vercel 서버리스 백엔드** 모노레포.

## 가장 중요한 구조 규칙
- 이 저장소는 **두 개의 독립된 Node 프로젝트**입니다.
  - 루트 = 프론트엔드 (Expo). `package.json` 따로.
  - `server/` = 백엔드 (Express/Vercel). `package.json` 따로, `node_modules`도 따로.
  - → 의존성 설치/실행은 **각 폴더에서 별도로** (`npm install`을 양쪽 다).
- 프론트엔드는 증권사 API를 직접 호출하지 않습니다. **모든 외부 데이터는 `server/api/*`를 경유**합니다.
  - 새 데이터 소스가 필요하면: 백엔드에 엔드포인트 추가 → 프론트 `src/services/*`에서 호출.

## 실행 방법 (검증용)
```bash
# 백엔드
cd server && npm install && npm run dev      # 포트 3000

# 프론트엔드 (루트)
npm install && npm start                     # Expo
npm run lint                                 # ESLint (expo lint)
```
- 자동화된 테스트 스위트는 **아직 없음**. 변경 검증은 `npm run lint` + 실제 실행으로 확인.
- 환경변수 바꾸면 `npx expo start -c`로 캐시 클리어 후 재시작 (Hot reload로 `.env` 반영 안 됨).

## 디렉터리 맵
| 경로 | 역할 |
|------|------|
| `App.js` | 진입점, 네비게이션, 4개 탭(홈/발굴/포트폴리오/설정) |
| `src/screens/` | 화면 단위 컴포넌트 |
| `src/components/` | 화면 내부 재사용 컴포넌트 (AI, 차트, 뉴스 등) |
| `src/services/` | 백엔드/외부 API 클라이언트 |
| `src/context/AuthContext.js` | 로그인 상태 전역 관리 |
| `server/api/kis/` | 한국투자증권 OpenAPI 연동 |
| `server/api/ai/` | AI 분석·추천·채팅 |
| `server/api/market/` | 수급 이상·배당락 발굴 |
| `server/lib/` | KIS 인증·요청 래퍼, 캐시 레이어 |
| `components/`, `web/`, `public/` | Expo 템플릿 잔여물 — 신규 작업은 여기 말고 `src/`에 |

## 코드 컨벤션 (기존 코드 따라가기)
- 언어: **JavaScript(ESM은 프론트, CommonJS `require/module.exports`는 server/)**. 새 TS 파일 임의 도입 금지 — 주변 코드 스타일에 맞출 것.
- 주석은 한국어로 작성 (기존 코드가 그러함).
- 백엔드 핸들러 패턴: `module.exports = async (req, res) => { ... }`, `OPTIONS` 프리플라이트 처리, 에러는 `res.status(5xx).json({ error })`.
- UI 다크 테마 색상: 배경 `#0A0E27` / 카드 `#1A1F3A` / 포인트 `#00D9FF` / 보조 텍스트 `#8A9BAE`. 새 UI도 이 팔레트 유지.
- 사용자 대면 문자열은 한국어.

## AI/LLM 관련
- 현재 백엔드 AI는 **Groq `llama-3.3-70b-versatile`** + 일부 **Gemini**(OCR) 사용.
- 프론트 `package.json`에 `@anthropic-ai/sdk`가 있으나 **실제로는 미사용**. Claude를 붙일 경우 최신 모델 ID는 `claude-opus-4-8`(고품질) / `claude-haiku-4-5`(저비용·빠름) 사용.
- AI 답변은 매크로·뉴스·수급 컨텍스트를 시스템 프롬프트에 주입하는 패턴을 따름 (`server/api/ai/chat.js` 참고).

## 절대 하지 말 것 (보안)
- **API 키/시크릿을 코드나 커밋에 절대 넣지 말 것.** 키는 `server/.env.local`(백엔드), 루트 `.env`(프론트)에만.
- `.env*`는 `.gitignore`에 있음 — 새 시크릿 파일 추가 시 반드시 gitignore 확인.
- KIS 토큰·Supabase 키 등을 로그로 출력하지 말 것 (존재 여부 `OK/MISSING`만 출력하는 기존 방식 유지).

## 변경 시 주의 포인트
- `koreanStocks.json` 종목 DB가 **루트(`src/data/`)와 서버(`server/data/`) 양쪽에 존재** — 한쪽만 고치면 불일치. 동기화 의도 확인 후 작업.
- `server/dev-server.js`에 LAN IP가 하드코딩되어 있을 수 있음 — 환경마다 다르니 그대로 신뢰하지 말 것.
- cron 스케줄은 `vercel.json`(프로덕션)과 `dev-server.js`의 `setInterval`(로컬) **두 곳**에 정의됨 — 주기 바꾸면 양쪽 확인.

## 협업 규칙
- 큰 변경 전에는 작은 단위 커밋으로 나눌 것. 커밋 메시지는 기존 스타일(영어, 명령형 한 줄) 따름.
- 이 파일(`CLAUDE.md`)이나 README를 바꾸면 두 협업자 모두에게 영향 → 변경 시 공유.
