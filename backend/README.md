# KST Project Backend

FastAPI 기반의 백엔드 서비스로, 토스 페이먼츠와 WAF 자동화 기능을 제공합니다.

## 기술 스택

- **웹 프레임워크**: FastAPI 0.104.1
- **데이터베이스**: MariaDB (SQLAlchemy 2.0.23 ORM)
- **인증**: Google OAuth 2.0, JWT
- **결제**: 토스 페이먼츠 API
- **DNS 관리**: Cloudflare API
- **모니터링**: 실시간 로그 수집 및 SSE 스트리밍
- **개발 도구**: Python 3.8+, uvicorn, httpx

## 프로젝트 구조

```
backend/
├── main.py                           # 메인 애플리케이션 (FastAPI 앱)
├── database.py                       # 데이터베이스 연결 설정
├── models/                          # Pydantic 모델 (API 스키마)
│   ├── __init__.py
│   ├── proxy_and_waf.py            # WAF/프록시 관련 모델
│   └── monitoring.py               # 모니터링 관련 모델
├── schema/                          # SQLAlchemy ORM 모델
│   ├── __init__.py
│   ├── user.py                     # 사용자 테이블 모델
│   ├── payment.py                  # 결제 API 스키마
│   └── payment_db.py               # 결제 DB 테이블 모델
├── services/                        # 비즈니스 로직 서비스
│   ├── __init__.py
│   ├── google_auth_service.py      # Google OAuth 인증
│   ├── jwt_service.py              # JWT 토큰 관리
│   ├── session_service.py          # 세션 관리
│   ├── session_auth.py             # 세션 기반 인증
│   ├── payment_service.py          # 토스 페이먼츠 결제
│   ├── proxy_and_waf_service.py    # WAF/프록시 자동화
│   └── monitoring_service.py       # 모니터링 서비스
├── routers/                         # API 라우터
│   ├── __init__.py
│   ├── auth.py                     # 인증 API
│   ├── payments.py                 # 결제 API
│   ├── proxy_and_waf_automation.py # WAF 자동화 API
│   └── monitoring.py               # 모니터링 API
├── config/                          # 설정 파일
│   └── env_example.txt             # 환경변수 예제
├── requirements.txt                 # 의존성 패키지
├── README.md
├── README_ENV.md                    # 환경변수 설정 가이드
└── .env                            # 환경변수 파일 (직접 생성 필요)
```

## 설치 및 실행

1. 의존성 설치:
```bash
pip install -r requirements.txt
```

2. 환경변수 설정:
```bash
# .env 파일 생성 (자세한 내용은 README_ENV.md 참조)
cp .env.example .env
# .env 파일을 편집하여 실제 값으로 수정
```

3. 서버 실행:
```bash
python main.py
```

또는 uvicorn으로 직접 실행:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## API 엔드포인트

### 인증 관련 API (`/api/auth`)
- `POST /api/auth/google/login` - Google OAuth 로그인
- `POST /api/auth/logout` - 로그아웃
- `GET /api/auth/validate` - 세션 유효성 검증
- `POST /api/auth/refresh` - 세션 갱신
- `GET /api/auth/me` - 현재 사용자 정보 조회

### 결제 관련 API (`/api/payments`)
- `POST /api/payments/payment/prepare` - 결제 준비
- `GET /api/payments/user/balance` - 사용자 잔액 조회
- `POST /api/payments/user/deduct-points` - 포인트 차감
- `GET /api/payments/success` - 결제 성공 처리
- `GET /api/payments/fail` - 결제 실패 처리

#### 관리자 디버깅 API
- `GET /api/payments/debug/payment-status/{order_id}` - 결제 상태 확인
- `GET /api/payments/debug/user-points/{user_id}` - 사용자 포인트 확인
- `POST /api/payments/admin/manual-add-points` - 수동 포인트 충전
- `GET /api/payments/admin/check-payment/{order_id}` - 결제 상태 확인 및 수동 처리
- `POST /api/payments/admin/recover-failed-payment/{order_id}` - 실패한 결제 복구
- `GET /api/payments/admin/list-failed-payments` - 실패한 결제 목록 조회

### WAF 자동화 API (`/api/waf`)
- `POST /api/waf/register` - 서브도메인 등록 (Cloudflare + WAF)
- `POST /api/waf/unregister` - 서브도메인 삭제 (Cloudflare + WAF)

### 모니터링 API (`/api/monitoring`)
- `GET /api/monitoring/health` - 모니터링 서버 헬스 체크
- `GET /api/monitoring/domains` - 관리 중인 도메인 목록
- `GET /api/monitoring/logs` - 전체 최근 로그 조회
- `GET /api/monitoring/logs/{domain}` - 특정 도메인 로그 조회
- `GET /api/monitoring/stats/{domain}` - 도메인 통계 정보
- `GET /api/monitoring/traffic/summary` - 트래픽 요약
- `GET /api/monitoring/traffic/{domain}` - 도메인별 트래픽 통계
- `GET /api/monitoring/billing/summary` - 결제 예정 금액 요약
- `GET /api/monitoring/billing/{domain}` - 도메인별 결제 상세 정보
- `GET /api/monitoring/events` - 실시간 이벤트 스트림 (SSE)
- `GET /api/monitoring/events/{domain}` - 도메인별 실시간 이벤트 스트림

## 환경 설정

`.env` 파일을 생성하여 환경변수를 설정하세요. 자세한 내용은 [README_ENV.md](README_ENV.md)를 참조하세요.

### 필수 환경변수
- `DATABASE_URL`: MariaDB 연결 URL
- `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`: JWT 설정
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: Google OAuth 설정
- `TOSS_CLIENT_KEY`, `TOSS_SECRET_KEY`, `TOSS_API_URL`: 토스 페이먼츠 설정
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`: Cloudflare 설정
- `BASE_DOMAIN`, `WAF_SERVER_IP`: WAF 자동화 설정
- `LOG_MONITORING_SERVER_BASE_URL`: 로그 모니터링 서버 URL
- `DEBUG`, `HOST`, `PORT`, `CORS_ORIGINS`: 서버 설정

## 기능

### 인증 시스템
- Google OAuth 2.0 로그인
- JWT 토큰 기반 인증
- 세션 관리 및 갱신
- 사용자 정보 관리

### 토스 페이먼츠
- 결제 준비 및 승인
- 사용자 포인트 관리
- 결제 성공/실패 처리
- 결제 내역 조회
- 결제 취소 기능
- 관리자 디버깅 도구

### WAF 자동화
- 서브도메인 등록/해제
- Cloudflare DNS 레코드 자동 관리
- WAF 서버 연동 및 알림
- 도메인별 프록시 설정

### 모니터링 시스템
- 실시간 로그 수집 및 스트리밍
- 도메인별 트래픽 통계
- 결제 예정 금액 계산
- SSE(Server-Sent Events) 실시간 이벤트
- 로그 서버와의 연동

### 데이터베이스
- MariaDB를 통한 영구 데이터 저장
- 사용자, 도메인, 결제 정보 관리
- SQLAlchemy ORM 사용

## 데이터베이스 스키마

### users 테이블
- `id`: 사용자 고유 ID (UUID)
- `email`: 이메일 주소 (유니크)
- `name`: 사용자 이름
- `picture`: 프로필 이미지 URL
- `google_id`: Google OAuth ID (유니크)
- `is_active`: 활성 상태
- `created_at`: 생성일시
- `last_login`: 마지막 로그인
- `remaining_points`: 잔여 포인트

### user_domains 테이블
- `id`: 도메인 고유 ID (UUID)
- `user_id`: 사용자 ID (외래키)
- `domain`: 도메인명
- `target`: 프록시 대상 서버
- `waf`: WAF 설정
- `created_at`: 생성일시
- `billing_date`: 결제 예정일
- `deleted_at`: 삭제일시

### payment_orders 테이블
- `id`: 주문 고유 ID (UUID)
- `user_id`: 사용자 ID (외래키)
- `order_id`: 주문 ID (유니크)
- `amount`: 결제 금액
- `order_name`: 주문명
- `status`: 주문 상태 (READY, DONE, FAILED, CANCELLED)
- `payment_key`: 토스 페이먼츠 키
- `created_at`: 생성일시
- `approved_at`: 승인일시
