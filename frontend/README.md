# WAF Management Frontend

웹 애플리케이션 방화벽(WAF) 관리 시스템의 프론트엔드 애플리케이션입니다.

## 기술 스택

- **프레임워크**: React 19.1.1 + TypeScript 5.8.3
- **빌드 도구**: Vite 7.1.2
- **스타일링**: Tailwind CSS 3.4.0
- **라우팅**: React Router DOM 7.8.1
- **인증**: Google OAuth 2.0 (@react-oauth/google 0.12.2)
- **HTTP 클라이언트**: Axios 1.11.0
- **결제**: 토스 페이먼츠 SDK
- **개발 도구**: ESLint, PostCSS, Autoprefixer

## 프로젝트 구조

```
frontend/
├── src/
│   ├── components/           # React 컴포넌트
│   │   ├── MainPage.tsx     # 메인 페이지 (랜딩 페이지)
│   │   ├── GoogleLoginPage.tsx # Google OAuth 로그인
│   │   ├── Navigation.tsx   # 네비게이션 바
│   │   ├── ProtectedRoute.tsx # 인증 보호 라우트
│   │   ├── DomainManagePage.tsx # 도메인 관리 페이지
│   │   ├── PaymentPage.tsx  # 결제 페이지
│   │   ├── ProxyCreatePage.tsx # 프록시 생성 페이지
│   │   ├── BalanceSection.tsx # 잔액 표시 섹션
│   │   ├── ChargeSection.tsx # 충전 섹션
│   │   └── PaymentSection.tsx # 결제 섹션
│   ├── contexts/            # React Context
│   │   └── AuthContext.tsx  # 인증 상태 관리
│   ├── utils/               # 유틸리티 함수
│   │   ├── api.ts          # API 요청 헬퍼
│   │   ├── axiosConfig.ts  # Axios 설정
│   │   ├── paymentService.ts # 결제 서비스
│   │   ├── proxyService.ts # 프록시 서비스
│   │   └── tossPayments.ts # 토스 페이먼츠 SDK
│   ├── App.tsx             # 메인 앱 컴포넌트
│   ├── main.tsx            # 앱 진입점
│   ├── index.css           # 글로벌 스타일
│   └── vite-env.d.ts       # Vite 타입 정의
├── public/                 # 정적 파일
├── dist/                   # 빌드 결과물
├── package.json            # 의존성 및 스크립트
├── vite.config.ts          # Vite 설정
├── tailwind.config.js      # Tailwind CSS 설정
├── tsconfig.json           # TypeScript 설정
├── eslint.config.js        # ESLint 설정
├── env_example.txt         # 환경변수 예제
└── README.md
```

## 주요 기능

### 🔐 인증 시스템
- **Google OAuth 2.0**: Google 계정으로 로그인
- **세션 관리**: JWT 토큰 기반 세션 관리
- **자동 갱신**: 세션 자동 갱신 및 검증
- **보호된 라우트**: 인증이 필요한 페이지 보호

### 🌐 도메인 관리
- **도메인 목록**: 등록된 도메인 현황 조회
- **실시간 모니터링**: SSE를 통한 실시간 로그 스트리밍
- **트래픽 통계**: 도메인별 트래픽 통계 및 그래프
- **고급 필터링**: 로그 필터링 (메서드, 상태코드, IP, 응답시간 등)
- **도메인 삭제**: Cloudflare DNS 및 WAF 등록 해제

### 💳 결제 시스템
- **포인트 충전**: 토스 페이먼츠를 통한 포인트 충전
- **잔액 조회**: 실시간 포인트 잔액 확인
- **결제 내역**: 결제 성공/실패 처리
- **빠른 충전**: 미리 설정된 금액으로 빠른 충전

### 🛡️ 프록시 생성
- **서브도메인 등록**: 새로운 서브도메인 생성
- **WAF 설정**: 웹 애플리케이션 방화벽 활성화/비활성화
- **비용 계산**: 프록시 생성 비용 자동 계산
- **포인트 차감**: 생성 시 자동 포인트 차감

## 페이지 구성

### 1. 메인 페이지 (`/`)
- **랜딩 페이지**: 서비스 소개 및 Google 로그인
- **로그인 상태**: 이미 로그인된 사용자는 도메인 관리로 리다이렉트

### 2. 도메인 관리 페이지 (`/domains`)
- **도메인 목록**: 등록된 모든 도메인 표시
- **트래픽 요약**: 전체 트래픽 통계
- **실시간 모니터링**: 선택한 도메인의 실시간 로그 및 트래픽
- **고급 필터**: 로그 검색 및 필터링 기능
- **도메인 삭제**: 도메인 삭제 기능

### 3. 결제 페이지 (`/charge`)
- **잔액 표시**: 현재 포인트 잔액
- **충전 금액**: 충전할 포인트 입력
- **빠른 충전**: 미리 설정된 금액 버튼
- **토스 페이먼츠**: 결제 처리

### 4. 프록시 생성 페이지 (`/proxy/create`)
- **서브도메인 입력**: 생성할 서브도메인명
- **대상 URL**: 프록시할 대상 도메인
- **WAF 설정**: 웹 방화벽 사용 여부
- **비용 계산**: 생성 비용 및 잔액 확인

## API 연동

### 인증 API
- `POST /api/auth/google/login` - Google OAuth 로그인
- `POST /api/auth/logout` - 로그아웃
- `GET /api/auth/validate` - 세션 유효성 검증
- `POST /api/auth/refresh` - 세션 갱신

### 결제 API
- `POST /api/payments/payment/prepare` - 결제 준비
- `GET /api/payments/user/balance` - 사용자 잔액 조회
- `POST /api/payments/user/deduct-points` - 포인트 차감

### 도메인 관리 API
- `GET /api/monitoring/domains` - 도메인 목록 조회
- `GET /api/monitoring/logs/{domain}` - 도메인별 로그 조회
- `GET /api/monitoring/traffic/{domain}` - 도메인별 트래픽 통계
- `GET /api/monitoring/traffic/summary` - 전체 트래픽 요약
- `GET /api/monitoring/billing/summary` - 결제 예정 금액 요약

### WAF 자동화 API
- `POST /api/waf/register` - 서브도메인 등록
- `POST /api/waf/unregister` - 서브도메인 삭제

### 실시간 모니터링
- `GET /api/monitoring/events/{domain}` - SSE 실시간 이벤트 스트리밍

## 환경 설정

### 필수 환경변수
```bash
# Google OAuth 설정
VITE_GOOGLE_CLIENT_ID=your_google_client_id

# API 기본 URL (선택사항)
VITE_REACT_APP_API_BASE_URL=http://localhost:8000
```

### 환경변수 설정 방법
1. `env_example.txt`를 `.env`로 복사
2. Google OAuth 클라이언트 ID 설정
3. 필요시 API 기본 URL 변경

## 설치 및 실행

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경변수 설정
```bash
cp env_example.txt .env
# .env 파일에서 VITE_GOOGLE_CLIENT_ID 설정
```

### 3. 개발 서버 실행
```bash
npm run dev
```

### 4. 빌드
```bash
npm run build
```

### 5. 빌드 결과 미리보기
```bash
npm run preview
```

## 주요 특징

### 🔄 실시간 업데이트
- **SSE (Server-Sent Events)**: 실시간 로그 스트리밍
- **자동 새로고침**: 트래픽 통계 실시간 업데이트
- **세션 관리**: 자동 세션 갱신 및 검증

### 🎨 사용자 경험
- **반응형 디자인**: 모바일 및 데스크톱 지원
- **다크/라이트 모드**: Tailwind CSS 기반 스타일링
- **로딩 상태**: 모든 비동기 작업에 로딩 표시
- **에러 처리**: 사용자 친화적인 에러 메시지

### 🛡️ 보안
- **JWT 토큰**: 안전한 인증 토큰 사용
- **자동 로그아웃**: 세션 만료 시 자동 로그아웃
- **보호된 라우트**: 인증이 필요한 페이지 보호
- **CORS 설정**: 안전한 API 통신

### 📊 모니터링
- **실시간 그래프**: 트래픽 시각화
- **고급 필터링**: 다양한 조건으로 로그 필터링
- **통계 대시보드**: 종합적인 트래픽 통계
- **결제 예정 금액**: 도메인별 결제 예정 금액 표시

## 개발 가이드

### 컴포넌트 구조
- **함수형 컴포넌트**: React Hooks 사용
- **TypeScript**: 타입 안전성 보장
- **Context API**: 전역 상태 관리
- **커스텀 훅**: 재사용 가능한 로직 분리

### 스타일링
- **Tailwind CSS**: 유틸리티 퍼스트 CSS 프레임워크
- **반응형 디자인**: 모바일 퍼스트 접근
- **컴포넌트 기반**: 재사용 가능한 UI 컴포넌트

### 상태 관리
- **React Context**: 인증 상태 관리
- **로컬 상태**: 컴포넌트별 상태 관리
- **세션 스토리지**: 브라우저 세션 유지

## 문제 해결

### 일반적인 문제
1. **Google OAuth 오류**: `VITE_GOOGLE_CLIENT_ID` 확인
2. **API 연결 오류**: 백엔드 서버 실행 상태 확인
3. **빌드 오류**: Node.js 버전 및 의존성 확인

### 디버깅
- **개발자 도구**: 브라우저 개발자 도구 활용
- **콘솔 로그**: 상세한 에러 로그 확인
- **네트워크 탭**: API 요청/응답 확인

## 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.