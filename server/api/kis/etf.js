// ============================================================
// 주요 한국 주식 → ETF 편입 정보 (정적 데이터, 2026년 1분기 기준)
// ETF 구성은 시가총액 비중 기준 (분기별 리밸런싱)
// ============================================================
const STOCK_ETF_MAP = {
  // === KOSPI 초대형주 ===
  '005930': [ // 삼성전자
    { code: '069500', name: 'KODEX 200', weight: 32.5, rank: 1 },
    { code: '143850', name: 'TIGER 200', weight: 32.3, rank: 1 },
    { code: '102780', name: 'KODEX 삼성그룹', weight: 38.5, rank: 1 },
    { code: '091180', name: 'KODEX 삼성', weight: 98.5, rank: 1 },
    { code: '091160', name: 'KODEX 반도체', weight: 42.5, rank: 1 },
    { code: '139260', name: 'TIGER 200 IT', weight: 35.2, rank: 1 },
  ],
  '000660': [ // SK하이닉스
    { code: '069500', name: 'KODEX 200', weight: 8.2, rank: 2 },
    { code: '143850', name: 'TIGER 200', weight: 8.1, rank: 2 },
    { code: '091160', name: 'KODEX 반도체', weight: 25.3, rank: 2 },
    { code: '139260', name: 'TIGER 200 IT', weight: 18.5, rank: 2 },
  ],
  '373220': [ // LG에너지솔루션
    { code: '069500', name: 'KODEX 200', weight: 5.1, rank: 3 },
    { code: '143850', name: 'TIGER 200', weight: 5.0, rank: 3 },
    { code: '305720', name: 'KODEX 2차전지산업', weight: 20.5, rank: 1 },
  ],
  '207940': [ // 삼성바이오로직스
    { code: '069500', name: 'KODEX 200', weight: 4.2, rank: 4 },
    { code: '143850', name: 'TIGER 200', weight: 4.1, rank: 4 },
    { code: '244580', name: 'KODEX 바이오', weight: 18.5, rank: 1 },
    { code: '102780', name: 'KODEX 삼성그룹', weight: 8.5, rank: 2 },
  ],
  '005380': [ // 현대차
    { code: '069500', name: 'KODEX 200', weight: 3.5, rank: 5 },
    { code: '143850', name: 'TIGER 200', weight: 3.4, rank: 5 },
    { code: '091170', name: 'KODEX 자동차', weight: 22.3, rank: 1 },
  ],
  '005490': [ // POSCO홀딩스
    { code: '069500', name: 'KODEX 200', weight: 2.6, rank: 6 },
    { code: '143850', name: 'TIGER 200', weight: 2.5, rank: 6 },
  ],
  '035420': [ // NAVER
    { code: '069500', name: 'KODEX 200', weight: 2.5, rank: 7 },
    { code: '143850', name: 'TIGER 200', weight: 2.5, rank: 7 },
    { code: '139260', name: 'TIGER 200 IT', weight: 12.5, rank: 3 },
    { code: '157490', name: 'TIGER 소프트웨어', weight: 8.2, rank: 2 },
  ],
  '006400': [ // 삼성SDI
    { code: '069500', name: 'KODEX 200', weight: 2.4, rank: 8 },
    { code: '143850', name: 'TIGER 200', weight: 2.3, rank: 8 },
    { code: '305720', name: 'KODEX 2차전지산업', weight: 18.2, rank: 2 },
    { code: '102780', name: 'KODEX 삼성그룹', weight: 5.2, rank: 3 },
  ],
  '051910': [ // LG화학
    { code: '069500', name: 'KODEX 200', weight: 2.0, rank: 9 },
    { code: '143850', name: 'TIGER 200', weight: 1.9, rank: 9 },
    { code: '305720', name: 'KODEX 2차전지산업', weight: 15.1, rank: 3 },
    { code: '117460', name: 'KODEX 에너지화학', weight: 22.5, rank: 1 },
  ],
  '000270': [ // 기아
    { code: '069500', name: 'KODEX 200', weight: 2.0, rank: 10 },
    { code: '143850', name: 'TIGER 200', weight: 1.9, rank: 10 },
    { code: '091170', name: 'KODEX 자동차', weight: 18.5, rank: 2 },
  ],
  '009150': [ // 삼성전기
    { code: '069500', name: 'KODEX 200', weight: 1.8, rank: 11 },
    { code: '143850', name: 'TIGER 200', weight: 1.7, rank: 11 },
    { code: '102780', name: 'KODEX 삼성그룹', weight: 4.8, rank: 4 },
    { code: '091160', name: 'KODEX 반도체', weight: 8.2, rank: 4 },
  ],
  '105560': [ // KB금융
    { code: '069500', name: 'KODEX 200', weight: 1.7, rank: 12 },
    { code: '143850', name: 'TIGER 200', weight: 1.6, rank: 12 },
    { code: '091220', name: 'KODEX 은행', weight: 16.5, rank: 1 },
  ],
  '035720': [ // 카카오
    { code: '069500', name: 'KODEX 200', weight: 1.5, rank: 13 },
    { code: '143850', name: 'TIGER 200', weight: 1.5, rank: 13 },
    { code: '139260', name: 'TIGER 200 IT', weight: 7.5, rank: 4 },
  ],
  '055550': [ // 신한지주
    { code: '069500', name: 'KODEX 200', weight: 1.4, rank: 14 },
    { code: '143850', name: 'TIGER 200', weight: 1.3, rank: 14 },
    { code: '091220', name: 'KODEX 은행', weight: 14.2, rank: 2 },
  ],
  '068270': [ // 셀트리온
    { code: '069500', name: 'KODEX 200', weight: 1.2, rank: 15 },
    { code: '143850', name: 'TIGER 200', weight: 1.1, rank: 15 },
    { code: '244580', name: 'KODEX 바이오', weight: 12.3, rank: 2 },
    { code: '227540', name: 'TIGER 바이오TOP10', weight: 15.2, rank: 1 },
  ],
  '086790': [ // 하나금융지주
    { code: '069500', name: 'KODEX 200', weight: 1.1, rank: 16 },
    { code: '143850', name: 'TIGER 200', weight: 1.0, rank: 16 },
    { code: '091220', name: 'KODEX 은행', weight: 12.1, rank: 3 },
  ],
  '096770': [ // SK이노베이션
    { code: '069500', name: 'KODEX 200', weight: 1.0, rank: 17 },
    { code: '143850', name: 'TIGER 200', weight: 0.9, rank: 17 },
    { code: '117460', name: 'KODEX 에너지화학', weight: 18.3, rank: 2 },
  ],
  '017670': [ // SK텔레콤
    { code: '069500', name: 'KODEX 200', weight: 0.9, rank: 18 },
    { code: '143850', name: 'TIGER 200', weight: 0.8, rank: 18 },
  ],
  '066570': [ // LG전자
    { code: '069500', name: 'KODEX 200', weight: 0.9, rank: 19 },
    { code: '143850', name: 'TIGER 200', weight: 0.8, rank: 19 },
  ],
  '012330': [ // 현대모비스
    { code: '069500', name: 'KODEX 200', weight: 0.8, rank: 20 },
    { code: '143850', name: 'TIGER 200', weight: 0.7, rank: 20 },
    { code: '091170', name: 'KODEX 자동차', weight: 8.5, rank: 3 },
  ],
  '316140': [ // 우리금융지주
    { code: '069500', name: 'KODEX 200', weight: 0.7, rank: 21 },
    { code: '143850', name: 'TIGER 200', weight: 0.6, rank: 21 },
    { code: '091220', name: 'KODEX 은행', weight: 9.5, rank: 4 },
  ],
  '003490': [ // 대한항공
    { code: '069500', name: 'KODEX 200', weight: 0.7, rank: 22 },
    { code: '143850', name: 'TIGER 200', weight: 0.6, rank: 22 },
    { code: '140710', name: 'KODEX 운송', weight: 22.5, rank: 1 },
  ],
  '032830': [ // 삼성생명
    { code: '069500', name: 'KODEX 200', weight: 0.7, rank: 23 },
    { code: '143850', name: 'TIGER 200', weight: 0.6, rank: 23 },
    { code: '102780', name: 'KODEX 삼성그룹', weight: 3.5, rank: 5 },
  ],
  '000810': [ // 삼성화재
    { code: '069500', name: 'KODEX 200', weight: 0.6, rank: 24 },
    { code: '143850', name: 'TIGER 200', weight: 0.5, rank: 24 },
    { code: '140700', name: 'KODEX 보험', weight: 18.5, rank: 1 },
    { code: '102780', name: 'KODEX 삼성그룹', weight: 4.2, rank: 4 },
  ],
  '028260': [ // 삼성물산
    { code: '069500', name: 'KODEX 200', weight: 0.6, rank: 25 },
    { code: '143850', name: 'TIGER 200', weight: 0.5, rank: 25 },
    { code: '102780', name: 'KODEX 삼성그룹', weight: 3.2, rank: 6 },
    { code: '117700', name: 'KODEX 건설', weight: 12.5, rank: 2 },
  ],
  '018260': [ // 삼성SDS
    { code: '069500', name: 'KODEX 200', weight: 0.6, rank: 26 },
    { code: '143850', name: 'TIGER 200', weight: 0.5, rank: 26 },
    { code: '102780', name: 'KODEX 삼성그룹', weight: 2.5, rank: 7 },
    { code: '157490', name: 'TIGER 소프트웨어', weight: 5.8, rank: 3 },
  ],
  '034730': [ // SK
    { code: '069500', name: 'KODEX 200', weight: 0.5, rank: 27 },
    { code: '143850', name: 'TIGER 200', weight: 0.5, rank: 27 },
  ],
  '030200': [ // KT
    { code: '069500', name: 'KODEX 200', weight: 0.5, rank: 28 },
    { code: '143850', name: 'TIGER 200', weight: 0.4, rank: 28 },
  ],
  '010130': [ // 고려아연
    { code: '069500', name: 'KODEX 200', weight: 0.6, rank: 29 },
    { code: '143850', name: 'TIGER 200', weight: 0.5, rank: 29 },
  ],
  '010950': [ // S-Oil
    { code: '069500', name: 'KODEX 200', weight: 0.5, rank: 30 },
    { code: '143850', name: 'TIGER 200', weight: 0.4, rank: 30 },
    { code: '117460', name: 'KODEX 에너지화학', weight: 15.2, rank: 3 },
  ],
  '015760': [ // 한국전력
    { code: '069500', name: 'KODEX 200', weight: 0.4, rank: 31 },
    { code: '143850', name: 'TIGER 200', weight: 0.4, rank: 31 },
  ],
  '024110': [ // 기업은행
    { code: '069500', name: 'KODEX 200', weight: 0.4, rank: 32 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 32 },
    { code: '091220', name: 'KODEX 은행', weight: 7.2, rank: 5 },
  ],
  '034220': [ // LG디스플레이
    { code: '069500', name: 'KODEX 200', weight: 0.4, rank: 33 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 33 },
  ],
  '036460': [ // 한국가스공사
    { code: '069500', name: 'KODEX 200', weight: 0.4, rank: 34 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 34 },
  ],
  '003670': [ // 포스코퓨처엠
    { code: '069500', name: 'KODEX 200', weight: 0.5, rank: 35 },
    { code: '143850', name: 'TIGER 200', weight: 0.5, rank: 35 },
    { code: '305720', name: 'KODEX 2차전지산업', weight: 4.2, rank: 4 },
    { code: '229200', name: 'KODEX 코스닥150', weight: 5.2, rank: 2 },
  ],
  '042700': [ // 한미반도체
    { code: '229200', name: 'KODEX 코스닥150', weight: 4.8, rank: 3 },
    { code: '091160', name: 'KODEX 반도체', weight: 5.8, rank: 5 },
  ],

  // === KOSDAQ 대형주 ===
  '247540': [ // 에코프로비엠
    { code: '229200', name: 'KODEX 코스닥150', weight: 8.5, rank: 1 },
    { code: '305720', name: 'KODEX 2차전지산업', weight: 8.5, rank: 5 },
  ],
  '086520': [ // 에코프로
    { code: '229200', name: 'KODEX 코스닥150', weight: 7.2, rank: 2 },
    { code: '305720', name: 'KODEX 2차전지산업', weight: 7.2, rank: 6 },
  ],
  '352820': [ // 하이브
    { code: '229200', name: 'KODEX 코스닥150', weight: 4.5, rank: 4 },
  ],
  '293490': [ // 카카오게임즈
    { code: '229200', name: 'KODEX 코스닥150', weight: 3.8, rank: 5 },
  ],
  '226950': [ // 알테오젠
    { code: '229200', name: 'KODEX 코스닥150', weight: 3.8, rank: 6 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 3.7, rank: 6 },
    { code: '244580', name: 'KODEX 바이오', weight: 4.5, rank: 4 },
    { code: '227540', name: 'TIGER 바이오TOP10', weight: 6.2, rank: 5 },
  ],
  '389470': [ // 인벤티지랩
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.8, rank: 28 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 0.8, rank: 28 },
    { code: '244580', name: 'KODEX 바이오', weight: 1.2, rank: 12 },
  ],
  '228760': [ // 지노믹트리
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.6, rank: 32 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 0.6, rank: 32 },
    { code: '244580', name: 'KODEX 바이오', weight: 1.0, rank: 14 },
    { code: '227540', name: 'TIGER 바이오TOP10', weight: 2.5, rank: 8 },
  ],
  '028300': [ // HLB
    { code: '229200', name: 'KODEX 코스닥150', weight: 3.5, rank: 7 },
    { code: '244580', name: 'KODEX 바이오', weight: 4.2, rank: 5 },
  ],
  '068760': [ // 셀트리온제약
    { code: '229200', name: 'KODEX 코스닥150', weight: 3.2, rank: 8 },
    { code: '244580', name: 'KODEX 바이오', weight: 5.2, rank: 3 },
    { code: '227540', name: 'TIGER 바이오TOP10', weight: 8.5, rank: 4 },
  ],
  '145020': [ // 휴젤
    { code: '229200', name: 'KODEX 코스닥150', weight: 2.8, rank: 9 },
    { code: '228790', name: 'TIGER 화장품', weight: 8.5, rank: 2 },
  ],
  '035900': [ // JYP엔터
    { code: '229200', name: 'KODEX 코스닥150', weight: 2.3, rank: 10 },
  ],
  '041510': [ // 에스엠
    { code: '229200', name: 'KODEX 코스닥150', weight: 2.1, rank: 11 },
  ],
  '263750': [ // 펄어비스
    { code: '229200', name: 'KODEX 코스닥150', weight: 2.5, rank: 12 },
    { code: '157490', name: 'TIGER 소프트웨어', weight: 4.5, rank: 4 },
  ],
  '058470': [ // 리노공업
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.8, rank: 13 },
    { code: '091160', name: 'KODEX 반도체', weight: 1.8, rank: 6 },
  ],
  '196170': [ // 알테오젠(구 코드 - 226950로 통합됨, 혹시 모를 요청 대비)
    { code: '229200', name: 'KODEX 코스닥150', weight: 3.8, rank: 6 },
    { code: '244580', name: 'KODEX 바이오', weight: 4.5, rank: 4 },
  ],

  // === 기타 섹터주 ===
  '139480': [ // 이마트
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 36 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 36 },
  ],
  '271560': [ // 오리온
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 37 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 37 },
  ],
  '004020': [ // 현대제철
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 38 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 38 },
  ],
  '267250': [ // 현대중공업
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 39 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 39 },
  ],
  '180640': [ // 한진칼
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 40 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 40 },
    { code: '140710', name: 'KODEX 운송', weight: 12.5, rank: 2 },
  ],
  '047050': [ // 포스코인터내셔널
    { code: '069500', name: 'KODEX 200', weight: 0.4, rank: 41 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 41 },
  ],
  '012030': [ // DB하이텍
    { code: '091160', name: 'KODEX 반도체', weight: 3.5, rank: 7 },
  ],
  '100840': [ // SNT홀딩스
    { code: '091170', name: 'KODEX 자동차', weight: 2.5, rank: 4 },
  ],

  // === KOSPI 추가 대형주 ===
  '011200': [ // LG생활건강
    { code: '069500', name: 'KODEX 200', weight: 0.6, rank: 42 },
    { code: '143850', name: 'TIGER 200', weight: 0.5, rank: 42 },
    { code: '228790', name: 'TIGER 화장품', weight: 22.5, rank: 1 },
  ],
  '010140': [ // 삼성중공업
    { code: '069500', name: 'KODEX 200', weight: 0.5, rank: 43 },
    { code: '143850', name: 'TIGER 200', weight: 0.4, rank: 43 },
  ],
  '003550': [ // LG
    { code: '069500', name: 'KODEX 200', weight: 0.6, rank: 44 },
    { code: '143850', name: 'TIGER 200', weight: 0.5, rank: 44 },
  ],
  '033780': [ // KT&G
    { code: '069500', name: 'KODEX 200', weight: 0.7, rank: 45 },
    { code: '143850', name: 'TIGER 200', weight: 0.6, rank: 45 },
  ],
  '000100': [ // 유한양행
    { code: '069500', name: 'KODEX 200', weight: 0.5, rank: 46 },
    { code: '143850', name: 'TIGER 200', weight: 0.4, rank: 46 },
    { code: '244580', name: 'KODEX 바이오', weight: 6.5, rank: 6 },
  ],
  '161390': [ // 한국타이어앤테크놀로지
    { code: '069500', name: 'KODEX 200', weight: 0.4, rank: 47 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 47 },
    { code: '091170', name: 'KODEX 자동차', weight: 5.2, rank: 5 },
  ],
  '009830': [ // 한화솔루션
    { code: '069500', name: 'KODEX 200', weight: 0.4, rank: 48 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 48 },
    { code: '117460', name: 'KODEX 에너지화학', weight: 8.5, rank: 4 },
  ],
  '047810': [ // 한국항공우주
    { code: '069500', name: 'KODEX 200', weight: 0.5, rank: 49 },
    { code: '143850', name: 'TIGER 200', weight: 0.4, rank: 49 },
  ],
  '036570': [ // 엔씨소프트
    { code: '069500', name: 'KODEX 200', weight: 0.5, rank: 50 },
    { code: '143850', name: 'TIGER 200', weight: 0.4, rank: 50 },
    { code: '139260', name: 'TIGER 200 IT', weight: 4.5, rank: 5 },
    { code: '157490', name: 'TIGER 소프트웨어', weight: 6.8, rank: 1 },
  ],
  '090430': [ // 아모레퍼시픽
    { code: '069500', name: 'KODEX 200', weight: 0.4, rank: 51 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 51 },
    { code: '228790', name: 'TIGER 화장품', weight: 18.5, rank: 1 },
  ],
  '028050': [ // 삼성엔지니어링
    { code: '069500', name: 'KODEX 200', weight: 0.4, rank: 52 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 52 },
    { code: '102780', name: 'KODEX 삼성그룹', weight: 2.0, rank: 8 },
    { code: '117700', name: 'KODEX 건설', weight: 10.5, rank: 3 },
  ],
  '011070': [ // LG이노텍
    { code: '069500', name: 'KODEX 200', weight: 0.6, rank: 53 },
    { code: '143850', name: 'TIGER 200', weight: 0.5, rank: 53 },
    { code: '091160', name: 'KODEX 반도체', weight: 4.2, rank: 8 },
  ],
  '001450': [ // 현대해상
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 54 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 54 },
    { code: '140700', name: 'KODEX 보험', weight: 12.5, rank: 2 },
  ],
  '000080': [ // 하이트진로
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 55 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 55 },
  ],
  '011170': [ // 롯데케미칼
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 56 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 56 },
    { code: '117460', name: 'KODEX 에너지화학', weight: 10.2, rank: 5 },
  ],
  '032640': [ // LG유플러스
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 57 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 57 },
  ],
  '078930': [ // GS
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 58 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 58 },
  ],
  '097950': [ // CJ제일제당
    { code: '069500', name: 'KODEX 200', weight: 0.4, rank: 59 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 59 },
  ],
  '071050': [ // 한국금융지주
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 60 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 60 },
    { code: '091220', name: 'KODEX 은행', weight: 5.8, rank: 6 },
  ],
  '011780': [ // 금호석유
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 61 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 61 },
    { code: '117460', name: 'KODEX 에너지화학', weight: 6.5, rank: 6 },
  ],
  '138930': [ // BNK금융지주
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 62 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 62 },
    { code: '091220', name: 'KODEX 은행', weight: 4.5, rank: 7 },
  ],
  '251270': [ // 넷마블
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 63 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 63 },
    { code: '157490', name: 'TIGER 소프트웨어', weight: 3.5, rank: 5 },
  ],
  '128940': [ // 한미약품
    { code: '069500', name: 'KODEX 200', weight: 0.4, rank: 64 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 64 },
    { code: '244580', name: 'KODEX 바이오', weight: 5.8, rank: 7 },
    { code: '227540', name: 'TIGER 바이오TOP10', weight: 7.5, rank: 6 },
  ],
  '023530': [ // 롯데쇼핑
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 65 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 65 },
  ],
  '004370': [ // 농심
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 66 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 66 },
  ],
  '010120': [ // LS ELECTRIC
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 67 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 67 },
  ],
  '004990': [ // 롯데지주
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 68 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 68 },
  ],
  '000880': [ // 한화
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 69 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 69 },
  ],
  '021240': [ // 코웨이
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 70 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 70 },
  ],
  '006800': [ // 미래에셋증권
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 71 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 71 },
  ],
  '000720': [ // 현대건설
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 72 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 72 },
    { code: '117700', name: 'KODEX 건설', weight: 16.5, rank: 1 },
  ],
  '001040': [ // CJ
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 73 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 73 },
  ],
  '005830': [ // DB손해보험
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 74 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 74 },
    { code: '140700', name: 'KODEX 보험', weight: 14.5, rank: 3 },
  ],
  '004170': [ // 신세계
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 75 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 75 },
  ],
  '012750': [ // 에스원
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 76 },
    { code: '102780', name: 'KODEX 삼성그룹', weight: 1.8, rank: 9 },
  ],
  '008770': [ // 호텔신라
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 77 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 77 },
  ],
  '016360': [ // 삼성증권
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 78 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 78 },
    { code: '102780', name: 'KODEX 삼성그룹', weight: 2.2, rank: 10 },
  ],
  '018880': [ // 한온시스템
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 79 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 79 },
    { code: '091170', name: 'KODEX 자동차', weight: 3.5, rank: 6 },
  ],
  '002790': [ // 아모레G
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 80 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 80 },
    { code: '228790', name: 'TIGER 화장품', weight: 8.5, rank: 3 },
  ],
  '011790': [ // SKC / SK스퀘어
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 81 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 81 },
  ],
  '001120': [ // LX인터내셔널
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 82 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 82 },
  ],
  '003230': [ // 삼양식품
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 83 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 83 },
  ],
  '005940': [ // NH투자증권
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 84 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 84 },
  ],
  '051600': [ // 한전KPS
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 85 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 85 },
  ],
  '005935': [ // 삼성전자우
    { code: '102780', name: 'KODEX 삼성그룹', weight: 3.0, rank: 11 },
  ],
  '005385': [ // 현대자동차우
    { code: '091170', name: 'KODEX 자동차', weight: 2.0, rank: 7 },
  ],
  '000150': [ // 두산
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 86 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 86 },
  ],
  '034020': [ // 두산에너빌리티
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 87 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 87 },
  ],
  '241560': [ // 두산밥캣
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 88 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 88 },
  ],
  '000120': [ // CJ대한통운
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 89 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 89 },
    { code: '140710', name: 'KODEX 운송', weight: 8.5, rank: 3 },
  ],
  '010620': [ // 현대미포조선
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 90 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 90 },
  ],
  '326030': [ // SK바이오팜
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 91 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 91 },
    { code: '244580', name: 'KODEX 바이오', weight: 4.5, rank: 8 },
  ],
  '377300': [ // 카카오페이
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 92 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 92 },
    { code: '139260', name: 'TIGER 200 IT', weight: 3.5, rank: 6 },
  ],
  '259960': [ // 크래프톤
    { code: '069500', name: 'KODEX 200', weight: 0.5, rank: 93 },
    { code: '143850', name: 'TIGER 200', weight: 0.4, rank: 93 },
    { code: '157490', name: 'TIGER 소프트웨어', weight: 4.2, rank: 6 },
  ],
  '302440': [ // SK바이오사이언스
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 94 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 94 },
    { code: '244580', name: 'KODEX 바이오', weight: 3.8, rank: 9 },
  ],
  '112040': [ // 위메이드
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 95 },
    { code: '157490', name: 'TIGER 소프트웨어', weight: 2.5, rank: 7 },
  ],
  '282330': [ // BGF리테일
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 96 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 96 },
  ],
  '161890': [ // 한국콜마
    { code: '228790', name: 'TIGER 화장품', weight: 6.5, rank: 4 },
  ],
  '192820': [ // 코스맥스
    { code: '228790', name: 'TIGER 화장품', weight: 5.5, rank: 5 },
  ],
  '204320': [ // 만도
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 97 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 97 },
    { code: '091170', name: 'KODEX 자동차', weight: 4.5, rank: 8 },
  ],
  '022100': [ // 포스코DX
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 98 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 98 },
  ],
  '285130': [ // SK케미칼
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 99 },
    { code: '117460', name: 'KODEX 에너지화학', weight: 5.5, rank: 7 },
  ],
  '018670': [ // SK가스
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 100 },
    { code: '117460', name: 'KODEX 에너지화학', weight: 4.2, rank: 8 },
  ],
  '267260': [ // HD현대일렉트릭
    { code: '069500', name: 'KODEX 200', weight: 0.5, rank: 101 },
    { code: '143850', name: 'TIGER 200', weight: 0.4, rank: 101 },
  ],
  '185750': [ // 종근당
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 102 },
    { code: '244580', name: 'KODEX 바이오', weight: 3.5, rank: 10 },
  ],
  '020150': [ // 롯데에너지머티리얼즈
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 103 },
    { code: '305720', name: 'KODEX 2차전지산업', weight: 3.5, rank: 7 },
  ],
  '006360': [ // GS건설
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 104 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 104 },
    { code: '117700', name: 'KODEX 건설', weight: 9.5, rank: 4 },
  ],
  '010060': [ // OCI
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 105 },
    { code: '117460', name: 'KODEX 에너지화학', weight: 4.8, rank: 9 },
  ],
  '020560': [ // 아시아나항공
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 106 },
    { code: '140710', name: 'KODEX 운송', weight: 6.5, rank: 4 },
  ],
  '012450': [ // 한화에어로스페이스
    { code: '069500', name: 'KODEX 200', weight: 0.5, rank: 107 },
    { code: '143850', name: 'TIGER 200', weight: 0.4, rank: 107 },
  ],
  '011210': [ // 현대위아
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 108 },
    { code: '091170', name: 'KODEX 자동차', weight: 3.2, rank: 9 },
  ],
  '006280': [ // 녹십자
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 109 },
    { code: '244580', name: 'KODEX 바이오', weight: 3.2, rank: 11 },
  ],
  '014680': [ // 한솔케미칼
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 110 },
    { code: '091160', name: 'KODEX 반도체', weight: 2.8, rank: 9 },
  ],
  '002380': [ // KCC
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 111 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 111 },
  ],
  '002350': [ // 넥센타이어
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 112 },
    { code: '091170', name: 'KODEX 자동차', weight: 2.5, rank: 10 },
  ],
  '001230': [ // 동국제강
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 113 },
  ],
  '079160': [ // CJ CGV
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 114 },
  ],
  '008930': [ // 한미사이언스
    { code: '244580', name: 'KODEX 바이오', weight: 2.8, rank: 12 },
  ],
  '004800': [ // 효성
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 115 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 115 },
  ],
  '005300': [ // 롯데칠성
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 116 },
  ],
  '001740': [ // SK네트웍스
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 117 },
  ],
  '078340': [ // 컴투스
    { code: '157490', name: 'TIGER 소프트웨어', weight: 2.2, rank: 8 },
  ],
  '357780': [ // 솔브레인
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 118 },
    { code: '091160', name: 'KODEX 반도체', weight: 2.5, rank: 10 },
  ],

  // === KOSDAQ 추가 종목 ===
  '091990': [ // 셀트리온헬스케어
    { code: '229200', name: 'KODEX 코스닥150', weight: 2.5, rank: 14 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 2.4, rank: 14 },
    { code: '244580', name: 'KODEX 바이오', weight: 4.8, rank: 13 },
  ],
  '214150': [ // 클래시스
    { code: '229200', name: 'KODEX 코스닥150', weight: 2.2, rank: 15 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 2.1, rank: 15 },
    { code: '228790', name: 'TIGER 화장품', weight: 4.5, rank: 6 },
  ],
  '214450': [ // 파마리서치
    { code: '229200', name: 'KODEX 코스닥150', weight: 2.0, rank: 16 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 1.9, rank: 16 },
    { code: '228790', name: 'TIGER 화장품', weight: 3.8, rank: 7 },
  ],
  '086900': [ // 메디톡스
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.8, rank: 17 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 1.7, rank: 17 },
    { code: '228790', name: 'TIGER 화장품', weight: 3.2, rank: 8 },
  ],
  '248070': [ // 솔루엠
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.5, rank: 18 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 1.4, rank: 18 },
  ],
  '066970': [ // 엘앤에프
    { code: '229200', name: 'KODEX 코스닥150', weight: 2.8, rank: 19 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 2.7, rank: 19 },
    { code: '305720', name: 'KODEX 2차전지산업', weight: 5.5, rank: 8 },
  ],
  '039030': [ // 이오테크닉스
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.5, rank: 20 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 1.4, rank: 20 },
    { code: '091160', name: 'KODEX 반도체', weight: 2.2, rank: 11 },
  ],
  '112610': [ // 씨에스윈드
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.8, rank: 21 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 1.7, rank: 21 },
  ],
  '095340': [ // ISC
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.3, rank: 22 },
    { code: '091160', name: 'KODEX 반도체', weight: 1.8, rank: 12 },
  ],
  '036930': [ // 주성엔지니어링
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.2, rank: 23 },
    { code: '091160', name: 'KODEX 반도체', weight: 1.5, rank: 13 },
  ],
  '067160': [ // 아프리카TV
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.5, rank: 24 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 1.4, rank: 24 },
  ],
  '046890': [ // 서울반도체
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.2, rank: 25 },
    { code: '091160', name: 'KODEX 반도체', weight: 1.5, rank: 14 },
  ],
  '036710': [ // 심텍
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.0, rank: 26 },
    { code: '091160', name: 'KODEX 반도체', weight: 1.2, rank: 15 },
  ],
  '403870': [ // HPSP
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.5, rank: 27 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 1.4, rank: 27 },
    { code: '091160', name: 'KODEX 반도체', weight: 2.0, rank: 16 },
  ],
  '060250': [ // NHN
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.0, rank: 29 },
    { code: '157490', name: 'TIGER 소프트웨어', weight: 2.0, rank: 9 },
  ],
  '194480': [ // 데브시스터즈
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.9, rank: 30 },
  ],
  '041830': [ // 인바디
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.8, rank: 31 },
  ],
  '053800': [ // 안랩
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.7, rank: 33 },
    { code: '157490', name: 'TIGER 소프트웨어', weight: 1.5, rank: 10 },
  ],
  '056190': [ // 에스에프에이
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.7, rank: 34 },
    { code: '091160', name: 'KODEX 반도체', weight: 1.0, rank: 17 },
  ],
  '101490': [ // 에스앤에스텍
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.6, rank: 35 },
    { code: '091160', name: 'KODEX 반도체', weight: 0.8, rank: 18 },
  ],
  '064760': [ // 티씨케이
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.6, rank: 36 },
    { code: '091160', name: 'KODEX 반도체', weight: 0.8, rank: 19 },
  ],
  '084370': [ // 유진테크
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.5, rank: 37 },
    { code: '091160', name: 'KODEX 반도체', weight: 0.7, rank: 20 },
  ],
  '095610': [ // 테스
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.5, rank: 38 },
    { code: '091160', name: 'KODEX 반도체', weight: 0.6, rank: 21 },
  ],
  '043370': [ // 피에스케이
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.5, rank: 39 },
    { code: '091160', name: 'KODEX 반도체', weight: 0.6, rank: 22 },
  ],
  '064260': [ // 다날
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.4, rank: 40 },
  ],

  // === KOSPI 추가 섹터 ===
  '081660': [ // 휠라홀딩스
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 119 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 119 },
  ],
  '004000': [ // 롯데정밀화학
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 120 },
    { code: '117460', name: 'KODEX 에너지화학', weight: 3.5, rank: 10 },
  ],
  '010780': [ // 아이에스동서
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 121 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 121 },
  ],
  '001680': [ // 대상
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 122 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 122 },
  ],
  '005420': [ // 코스모화학
    { code: '069500', name: 'KODEX 200', weight: 0.2, rank: 123 },
    { code: '117460', name: 'KODEX 에너지화학', weight: 2.5, rank: 11 },
  ],
  '005850': [ // 에스엘
    { code: '091170', name: 'KODEX 자동차', weight: 2.0, rank: 11 },
  ],
  '009280': [ // 현대글로비스
    { code: '069500', name: 'KODEX 200', weight: 0.5, rank: 125 },
    { code: '143850', name: 'TIGER 200', weight: 0.4, rank: 125 },
    { code: '140710', name: 'KODEX 운송', weight: 18.5, rank: 2 },
  ],
  '000060': [ // 메리츠화재
    { code: '069500', name: 'KODEX 200', weight: 0.4, rank: 126 },
    { code: '143850', name: 'TIGER 200', weight: 0.3, rank: 126 },
    { code: '140700', name: 'KODEX 보험', weight: 10.5, rank: 4 },
  ],
  '029780': [ // 삼성카드
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 127 },
    { code: '143850', name: 'TIGER 200', weight: 0.2, rank: 127 },
    { code: '102780', name: 'KODEX 삼성그룹', weight: 1.5, rank: 12 },
  ],
  '178920': [ // PI첨단소재
    { code: '069500', name: 'KODEX 200', weight: 0.3, rank: 129 },
    { code: '091160', name: 'KODEX 반도체', weight: 2.2, rank: 23 },
  ],

  // === KOSDAQ 추가 섹터 ===
  '272290': [ // 이녹스첨단소재
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.8, rank: 42 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 0.7, rank: 42 },
    { code: '091160', name: 'KODEX 반도체', weight: 1.0, rank: 24 },
  ],
  '131970': [ // 티엘비
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.6, rank: 43 },
    { code: '091160', name: 'KODEX 반도체', weight: 0.8, rank: 25 },
  ],
  '348210': [ // 넥스틴
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.7, rank: 44 },
    { code: '091160', name: 'KODEX 반도체', weight: 0.9, rank: 26 },
  ],
  '089030': [ // 테크윙
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.6, rank: 45 },
    { code: '091160', name: 'KODEX 반도체', weight: 0.8, rank: 27 },
  ],
  '131290': [ // 티에스이
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.6, rank: 46 },
    { code: '091160', name: 'KODEX 반도체', weight: 0.7, rank: 28 },
  ],
  '066790': [ // 이엔에프테크놀로지
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.5, rank: 47 },
    { code: '091160', name: 'KODEX 반도체', weight: 0.6, rank: 29 },
  ],
  '200130': [ // 콜마비앤에이치
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.5, rank: 48 },
    { code: '228790', name: 'TIGER 화장품', weight: 2.5, rank: 9 },
  ],
  '115960': [ // 연우
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.4, rank: 49 },
    { code: '228790', name: 'TIGER 화장품', weight: 2.0, rank: 10 },
  ],
  '095700': [ // 제넥신
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.4, rank: 50 },
    { code: '244580', name: 'KODEX 바이오', weight: 1.5, rank: 15 },
  ],
  '064550': [ // 바이오니아
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.4, rank: 51 },
    { code: '244580', name: 'KODEX 바이오', weight: 1.2, rank: 16 },
  ],
  '065650': [ // 메디포스트
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.3, rank: 52 },
    { code: '244580', name: 'KODEX 바이오', weight: 1.0, rank: 17 },
  ],
  '206640': [ // 바디텍메드
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.3, rank: 53 },
    { code: '244580', name: 'KODEX 바이오', weight: 0.8, rank: 18 },
  ],
  '099190': [ // 아이센스
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.3, rank: 54 },
    { code: '244580', name: 'KODEX 바이오', weight: 0.7, rank: 19 },
  ],
  '095660': [ // 네오위즈
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.4, rank: 55 },
    { code: '157490', name: 'TIGER 소프트웨어', weight: 1.2, rank: 11 },
  ],
  '043150': [ // 바텍
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.3, rank: 56 },
  ],
  '065510': [ // 휴비츠
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.3, rank: 57 },
    { code: '244580', name: 'KODEX 바이오', weight: 0.6, rank: 20 },
  ],
  '141080': [ // 리가켐바이오
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.2, rank: 58 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 1.1, rank: 58 },
    { code: '244580', name: 'KODEX 바이오', weight: 3.5, rank: 14 },
    { code: '227540', name: 'TIGER 바이오TOP10', weight: 5.5, rank: 7 },
  ],
  '298380': [ // 에이비엘바이오
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.8, rank: 59 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 0.7, rank: 59 },
    { code: '244580', name: 'KODEX 바이오', weight: 2.2, rank: 15 },
  ],
  '253450': [ // 스튜디오드래곤
    { code: '229200', name: 'KODEX 코스닥150', weight: 1.0, rank: 60 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 0.9, rank: 60 },
  ],
  '096530': [ // 씨젠
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.6, rank: 61 },
    { code: '244580', name: 'KODEX 바이오', weight: 1.0, rank: 16 },
  ],
  '278280': [ // 천보
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.8, rank: 62 },
    { code: '232080', name: 'TIGER 코스닥150', weight: 0.7, rank: 62 },
    { code: '305720', name: 'KODEX 2차전지산업', weight: 3.2, rank: 9 },
  ],
  '237690': [ // 에스티팜
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.5, rank: 63 },
    { code: '244580', name: 'KODEX 바이오', weight: 1.5, rank: 17 },
  ],
  '039200': [ // 오스코텍
    { code: '229200', name: 'KODEX 코스닥150', weight: 0.4, rank: 64 },
    { code: '244580', name: 'KODEX 바이오', weight: 0.8, rank: 18 },
  ],
};

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: '종목코드(code) 필요' });

    const etfs = STOCK_ETF_MAP[code] || [];

    if (etfs.length === 0) {
      console.log(`ℹ️ [${code}] ETF 편입 정보 없음`);
    } else {
      console.log(`✅ [${code}] ETF 정보: ${etfs.length}개`);
    }

    // weightChange, returnRate, price는 클라이언트(kisAPI.js)에서 처리
    const result = etfs
      .map(etf => ({ ...etf, weightChange: 0 }))
      .sort((a, b) => b.weight - a.weight);

    res.status(200).json(result);
  } catch (error) {
    console.error('ETF 조회 실패:', error.message);
    res.status(200).json([]);
  }
};
