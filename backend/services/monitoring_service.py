import asyncio
import json
import os
from typing import List, Optional, Dict, Any
import httpx
from fastapi import Request
from models.monitoring import LogItem, DomainInfo, TrafficStats, DomainTrafficStats, DomainBillingInfo, DomainBillingSummary
from dotenv import load_dotenv
from models.monitoring import TrafficSummary
from datetime import datetime, timedelta
import math

load_dotenv(os.path.join(os.path.dirname(__file__), '../config', '.env'))

# 로그 서버 URL 설정 (환경변수 우선, 없으면 기본값 사용)
MONITOR_BASE_URL = os.getenv("LOG_MONITORING_SERVER_BASE_URL", "http://115.90.100.34:30148")
RECONNECT_BACKOFF = 1.0
MAX_BACKOFF = 10.0

class MonitoringService:
    """로그 서버와 연동하는 모니터링 서비스"""

    @staticmethod
    async def get_domains() -> List[DomainInfo]:
        """등록된 모든 도메인 목록 조회"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{MONITOR_BASE_URL}/domains")
                response.raise_for_status()
                data = response.json()
                return [DomainInfo(**domain) for domain in data.get("domains", [])]
        except Exception as e:
            print(f"도메인 목록 조회 실패: {e}")
            return []

    @staticmethod
    async def get_domain_logs(domain: str, count: int = 20) -> List[LogItem]:
        """특정 도메인의 최근 로그 조회"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{MONITOR_BASE_URL}/recent/{domain}?n={count}")
                response.raise_for_status()
                data = response.json()
                return [LogItem(**log) for log in data.get("logs", [])]
        except Exception as e:
            print(f"도메인 로그 조회 실패: {e}")
            return []

    @staticmethod
    async def get_all_logs(count: int = 20) -> List[LogItem]:
        """전체 최근 로그 조회"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{MONITOR_BASE_URL}/recent?n={count}")
                response.raise_for_status()
                data = response.json()
                return [LogItem(**log) for log in data.get("logs", [])]
        except Exception as e:
            print(f"전체 로그 조회 실패: {e}")
            return []

    @staticmethod
    async def get_domain_stats(domain: str) -> Optional[Dict[str, Any]]:
        """특정 도메인의 통계 정보 조회"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{MONITOR_BASE_URL}/stats/{domain}")
                response.raise_for_status()
                return response.json()
        except Exception as e:
            print(f"도메인 통계 조회 실패: {e}")
            return None

    @staticmethod
    async def get_traffic_summary() -> List[DomainTrafficStats]:
        """전체 도메인 트래픽 요약 조회"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{MONITOR_BASE_URL}/traffic/summary")
                response.raise_for_status()
                data = response.json()
                
                # 데이터 변환 및 검증 로직 추가
                converted_stats = []
                
                for stats in data:
                    try:
                        # 모니터링 서버 응답 구조에 맞게 변환
                        if isinstance(stats, dict):
                            # domain 필드가 없거나 잘못된 경우 처리
                            domain = stats.get('domain', '')
                            if not domain or domain == 'accurate' or domain == '211.45.204.26' or ':' in domain:
                                # 잘못된 도메인 데이터는 건너뛰기
                                continue
                            
                            # today와 last_hour 데이터 검증 및 변환
                            today_data = stats.get('today', {})
                            last_hour_data = stats.get('last_hour', {})
                            
                            # 필수 필드가 없는 경우 기본값 설정
                            today = TrafficSummary(
                                requests=today_data.get('requests', 0),
                                bytes=today_data.get('bytes', 0),
                                mb=today_data.get('mb', 0.0)
                            )
                            
                            last_hour = TrafficSummary(
                                requests=last_hour_data.get('requests', 0),
                                bytes=last_hour_data.get('bytes', 0),
                                mb=last_hour_data.get('mb', 0.0)
                            )
                            
                            # 실제 기간별 데이터 조회 (1주일, 1달)
                            try:
                                # 1주일 데이터 조회
                                week_response = await client.get(f"{MONITOR_BASE_URL}/traffic/{domain}?interval=day&period=7")
                                if week_response.status_code == 200:
                                    week_data = week_response.json()
                                    week_requests = week_data.get('total_requests', 0)
                                    week_bytes = week_data.get('total_bytes', 0)
                                    week_mb = week_data.get('total_mb', 0.0)
                                else:
                                    week_requests = today.requests * 7  # 폴백
                                    week_bytes = today.bytes * 7
                                    week_mb = today.mb * 7
                                
                                # 1달 데이터 조회
                                month_response = await client.get(f"{MONITOR_BASE_URL}/traffic/{domain}?interval=day&period=30")
                                if month_response.status_code == 200:
                                    month_data = month_response.json()
                                    month_requests = month_data.get('total_requests', 0)
                                    month_bytes = month_data.get('total_bytes', 0)
                                    month_mb = month_data.get('total_mb', 0.0)
                                else:
                                    month_requests = today.requests * 30  # 폴백
                                    month_bytes = today.bytes * 30
                                    month_mb = today.mb * 30
                                
                            except Exception as e:
                                print(f"도메인 {domain} 기간별 데이터 조회 실패: {e}")
                                # 폴백: 단순 곱셈
                                week_requests = today.requests * 7
                                week_bytes = today.bytes * 7
                                week_mb = today.mb * 7
                                month_requests = today.requests * 30
                                month_bytes = today.bytes * 30
                                month_mb = today.mb * 30
                            
                            # week와 month 데이터를 TrafficSummary 객체로 변환
                            week = TrafficSummary(
                                requests=week_requests,
                                bytes=week_bytes,
                                mb=week_mb
                            )
                            
                            month = TrafficSummary(
                                requests=month_requests,
                                bytes=month_bytes,
                                mb=month_mb
                            )
                            
                            # DomainTrafficStats 객체 생성
                            domain_stats = DomainTrafficStats(
                                domain=domain,
                                today=today,
                                last_hour=last_hour,
                                week=week,
                                month=month
                            )
                            
                            converted_stats.append(domain_stats)
                            
                    except Exception as e:
                        print(f"도메인 통계 변환 실패: {e}")
                        continue
                
                return converted_stats
                
        except Exception as e:
            print(f"트래픽 요약 조회 실패: {e}")
            return []

    @staticmethod
    async def get_domain_traffic(
        domain: str, 
        interval: str = "day", 
        period: int = 7
    ) -> Optional[TrafficStats]:
        """특정 도메인의 트래픽 통계 조회"""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(
                    f"{MONITOR_BASE_URL}/traffic/{domain}?interval={interval}&period={period}"
                )
                response.raise_for_status()
                data = response.json()
                return TrafficStats(**data)
        except Exception as e:
            print(f"도메인 트래픽 조회 실패: {e}")
            return None

    @staticmethod
    async def _sse_stream_from_monitor(domain: Optional[str] = None):
        """모니터 서버에서 SSE 스트림 수신 - 개선된 버전"""
        backoff = RECONNECT_BACKOFF
        
        # 도메인별 또는 전체 이벤트 URL 구성
        events_url = f"{MONITOR_BASE_URL}/events"
        if domain:
            events_url += f"?domain={domain}"
            
        while True:
            try:
                async with httpx.AsyncClient(timeout=None) as client:
                    async with client.stream("GET", events_url) as resp:
                        if resp.status_code != 200:
                            raise RuntimeError(f"monitor server returned status {resp.status_code}")
                        
                        buffer: List[str] = []
                        async for raw_line in resp.aiter_lines():
                            line = raw_line.rstrip("\r\n")
                            
                            # 빈 줄이면 이벤트 완료
                            if line == "":
                                if buffer:
                                    # data: 로 시작하는 라인들만 처리
                                    data_lines = [l[5:].lstrip() for l in buffer if l.startswith("data:")]
                                    if data_lines:
                                        for data_line in data_lines:
                                            yield data_line
                                    buffer = []
                            else:
                                buffer.append(line)
                        
                        # 마지막 버퍼 처리
                        if buffer:
                            data_lines = [l[5:].lstrip() for l in buffer if l.startswith("data:")]
                            if data_lines:
                                for data_line in data_lines:
                                    yield data_line
                                
                backoff = RECONNECT_BACKOFF
                await asyncio.sleep(1)  # 재연결 전 잠시 대기
                
            except Exception as e:
                print(f"SSE 스트림 오류: {e}")
                err = json.dumps({"type": "error", "error": str(e)})
                yield err
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF)

    @classmethod
    async def event_generator(cls, request: Request, domain: Optional[str] = None):
        """SSE 이벤트 생성기 (도메인별 필터링 지원)"""
        async for data in cls._sse_stream_from_monitor(domain):
            if await request.is_disconnected():
                break
            
            try:
                parsed = json.loads(data)
            except Exception:
                parsed = {"type": "raw", "payload": data}

            # 로그 이벤트 검증
            if parsed.get("type") == "log" and isinstance(parsed.get("payload"), dict):
                try:
                    _ = LogItem(**parsed["payload"])
                except Exception:
                    pass

            s = json.dumps(parsed, ensure_ascii=False)
            yield f"data: {s}\n\n"
            await asyncio.sleep(0)

    @staticmethod
    async def health_check() -> Dict[str, Any]:
        """로그 서버 연결 상태 확인"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{MONITOR_BASE_URL}/health")
                response.raise_for_status()
                return {
                    "status": "healthy",
                    "monitor_server": "connected",
                    "response": response.json()
                }
        except Exception as e:
            return {
                "status": "unhealthy", 
                "monitor_server": "disconnected",
                "error": str(e)
            }

    @staticmethod
    async def calculate_domain_billing(
        domain: str,
        created_at: str,
        payment_due_date: str
    ) -> Optional[DomainBillingInfo]:
        """도메인별 결제 예정 금액 계산"""
        try:
            # 생성일부터 결제 예정일까지의 기간 계산
            created_dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            due_dt = datetime.fromisoformat(payment_due_date.replace('Z', '+00:00'))
            
            # 기간이 유효하지 않은 경우
            if due_dt <= created_dt:
                return None
            
            # 생성일부터 결제 예정일까지의 트래픽 조회
            days_diff = (due_dt - created_dt).days
            
            # 트래픽 데이터 조회 (기간별로 조회하여 합산)
            total_bytes = 0
            total_requests = 0
            
            # 기간이 30일 이하인 경우
            if days_diff <= 30:
                traffic_stats = await MonitoringService.get_domain_traffic(
                    domain=domain,
                    interval="day",
                    period=days_diff
                )
                if traffic_stats:
                    total_bytes = traffic_stats.total_bytes
                    total_requests = traffic_stats.total_requests
            else:
                # 30일 단위로 나누어 조회
                remaining_days = days_diff
                current_date = created_dt
                
                while remaining_days > 0:
                    period = min(30, remaining_days)
                    traffic_stats = await MonitoringService.get_domain_traffic(
                        domain=domain,
                        interval="day",
                        period=period
                    )
                    
                    if traffic_stats:
                        total_bytes += traffic_stats.total_bytes
                        total_requests += traffic_stats.total_requests
                    
                    remaining_days -= period
                    current_date += timedelta(days=period)
            
            # GB 단위로 변환 (1GB = 1,073,741,824 bytes)
            total_traffic_gb = total_bytes / (1024 * 1024 * 1024)
            
            # 포인트 계산 (1GB당 10,000 포인트)
            billing_points = math.ceil(total_traffic_gb * 10000)
            
            # 원화 계산 (1포인트 = 1원)
            billing_amount_krw = billing_points
            
            return DomainBillingInfo(
                domain=domain,
                created_at=created_at,
                payment_due_date=payment_due_date,
                total_traffic_gb=round(total_traffic_gb, 2),
                total_requests=total_requests,
                billing_points=billing_points,
                billing_amount_krw=billing_amount_krw
            )
            
        except Exception as e:
            print(f"도메인 {domain} 결제 계산 실패: {e}")
            return None

    @staticmethod
    async def get_domain_billing_summary(
        domain: str,
        created_at: str,
        payment_due_date: str
    ) -> Optional[DomainBillingSummary]:
        """도메인별 결제 요약 정보 조회"""
        try:
            billing_info = await MonitoringService.calculate_domain_billing(
                domain=domain,
                created_at=created_at,
                payment_due_date=payment_due_date
            )
            
            if not billing_info:
                return None
            
            # 결제일까지 남은 일수 계산
            due_dt = datetime.fromisoformat(payment_due_date.replace('Z', '+00:00'))
            current_dt = datetime.now(due_dt.tzinfo)
            days_until_billing = (due_dt - current_dt).days
            
            return DomainBillingSummary(
                domain=domain,
                traffic_gb=billing_info.total_traffic_gb,
                points=billing_info.billing_points,
                amount_krw=billing_info.billing_amount_krw,
                days_until_billing=max(0, days_until_billing)
            )
            
        except Exception as e:
            print(f"도메인 {domain} 결제 요약 조회 실패: {e}")
            return None

    @staticmethod
    async def get_user_domains_billing_summary(
        domains: List[DomainInfo]
    ) -> List[DomainBillingSummary]:
        """사용자 소유 도메인들의 결제 요약 정보 조회"""
        billing_summaries = []
        
        for domain_info in domains:
            if domain_info.created_at and domain_info.payment_due_date:
                billing_summary = await MonitoringService.get_domain_billing_summary(
                    domain=domain_info.domain,
                    created_at=domain_info.created_at,
                    payment_due_date=domain_info.payment_due_date
                )
                
                if billing_summary:
                    billing_summaries.append(billing_summary)
        
        return billing_summaries

    @staticmethod
    async def get_billing_summary() -> List[DomainBillingSummary]:
        """전체 도메인의 결제 요약 정보 조회"""
        try:
            # 모든 도메인 목록 조회
            domains = await MonitoringService.get_domains()
            
            billing_summaries = []
            for domain_info in domains:
                if domain_info.created_at and domain_info.payment_due_date:
                    billing_summary = await MonitoringService.get_domain_billing_summary(
                        domain=domain_info.domain,
                        created_at=domain_info.created_at,
                        payment_due_date=domain_info.payment_due_date
                    )
                    
                    if billing_summary:
                        billing_summaries.append(billing_summary)
            
            return billing_summaries
            
        except Exception as e:
            print(f"전체 도메인 결제 요약 조회 실패: {e}")
            return []

    @staticmethod
    async def get_domain_billing_info(domain: str) -> Optional[DomainBillingInfo]:
        """특정 도메인의 결제 예정 상세 정보 조회"""
        try:
            # 도메인 정보 조회
            domains = await MonitoringService.get_domains()
            domain_info = next((d for d in domains if d.domain == domain), None)
            
            if not domain_info or not domain_info.created_at or not domain_info.payment_due_date:
                return None
            
            return await MonitoringService.calculate_domain_billing(
                domain=domain,
                created_at=domain_info.created_at,
                payment_due_date=domain_info.payment_due_date
            )
            
        except Exception as e:
            print(f"도메인 {domain} 결제 예정 상세 정보 조회 실패: {e}")
            return None

    @staticmethod
    async def get_realtime_logs_fallback(domain: str, last_log_id: str = None):
        """실시간 로그 폴백 메커니즘 - 모니터링 서버 연결 실패 시 로그 폴링"""
        try:
            # 최근 로그를 주기적으로 폴링하여 실시간 효과 시뮬레이션
            logs = await MonitoringService.get_domain_logs(domain, count=5)
            
            if logs:
                # 로그를 실시간 이벤트 형태로 변환
                for log in logs:
                    event = {
                        "type": "log",
                        "payload": log.dict(),
                        "timestamp": datetime.now().isoformat()
                    }
                    yield json.dumps(event, ensure_ascii=False)
            
            # 5초 후 다시 폴링
            await asyncio.sleep(5)
            
        except Exception as e:
            print(f"실시간 로그 폴백 실패: {e}")
            yield json.dumps({
                "type": "error",
                "error": f"로그 폴링 실패: {str(e)}"
            }, ensure_ascii=False)

    @staticmethod
    async def enhanced_event_generator(request: Request, domain: Optional[str] = None):
        """향상된 이벤트 생성기 - 실시간 스트리밍 + 폴백"""
        try:
            # 먼저 모니터링 서버에서 실시간 스트림 시도
            async for data in MonitoringService._sse_stream_from_monitor(domain):
                if await request.is_disconnected():
                    break
                
                try:
                    parsed = json.loads(data)
                except Exception:
                    parsed = {"type": "raw", "payload": data}

                # 로그 이벤트 검증
                if parsed.get("type") == "log" and isinstance(parsed.get("payload"), dict):
                    try:
                        _ = LogItem(**parsed["payload"])
                    except Exception:
                        pass

                s = json.dumps(parsed, ensure_ascii=False)
                yield f"data: {s}\n\n"
                await asyncio.sleep(0)
                
        except Exception as e:
            print(f"실시간 스트림 실패, 폴백 모드로 전환: {e}")
            
            # 폴백: 로그 폴링 모드
            if domain:
                async for log_data in MonitoringService.get_realtime_logs_fallback(domain):
                    if await request.is_disconnected():
                        break
                    yield f"data: {log_data}\n\n"