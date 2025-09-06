from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class LogItem(BaseModel):
    """WAF 로그 아이템 모델 (새로운 형식 지원)"""
    # 기본 필드
    timestamp: Optional[str] = None
    client_ip: Optional[str] = None
    host: Optional[str] = None
    uri: Optional[str] = None
    method: Optional[str] = None
    status: Optional[int] = None
    proxy_target: Optional[str] = None
    waf_action: Optional[str] = None
    user_agent: Optional[str] = None
    request_id: Optional[str] = None
    rule_id: Optional[str] = None
    log_type: Optional[str] = None
    received_at: Optional[str] = None
    
    # 트래픽 데이터
    traffic: Optional[Dict[str, Any]] = None
    
    # 레거시 필드 (기존 호환성)
    source: Optional[str] = None

    class Config:
        extra = "allow"  # 추가 필드 허용

class TrafficData(BaseModel):
    """트래픽 상세 데이터"""
    request_size: Optional[int] = None
    response_size: Optional[int] = None
    body_bytes_sent: Optional[int] = None
    content_length: Optional[int] = None
    total_bytes: Optional[int] = None
    upstream_bytes_received: Optional[int] = None
    upstream_bytes_sent: Optional[int] = None
    response_time: Optional[float] = None
    upstream_response_time: Optional[float] = None
    connection_requests: Optional[int] = None

class DomainBillingInfo(BaseModel):
    """도메인별 결제 정보"""
    domain: str
    created_at: str
    payment_due_date: str
    total_traffic_gb: float
    total_requests: int
    billing_points: int
    billing_amount_krw: int

class DomainBillingSummary(BaseModel):
    """도메인별 결제 요약"""
    domain: str
    traffic_gb: float
    points: int
    amount_krw: int
    days_until_billing: int

class DomainInfo(BaseModel):
    """도메인 정보"""
    domain: str
    log_count: int
    created_at: Optional[str] = None
    target: Optional[str] = None
    payment_due_date: Optional[str] = None
    waf: Optional[str] = None
    billing_info: Optional[DomainBillingSummary] = None

class TrafficSummary(BaseModel):
    """트래픽 요약 정보"""
    requests: int
    bytes: int
    mb: float

class DomainTrafficStats(BaseModel):
    """도메인별 트래픽 통계"""
    domain: str
    today: TrafficSummary
    last_hour: TrafficSummary
    week: Optional[TrafficSummary] = None
    month: Optional[TrafficSummary] = None

class TrafficTimelineItem(BaseModel):
    """트래픽 타임라인 아이템"""
    time: str
    timestamp: Optional[int] = None
    bytes: int
    second: Optional[int] = None
    formatted_time: Optional[str] = None
    date: Optional[str] = None
    weekday: Optional[str] = None
    requests: Optional[int] = None
    status_codes: Optional[Dict[str, int]] = None
    methods: Optional[Dict[str, int]] = None
    request_bytes: Optional[int] = None
    response_bytes: Optional[int] = None
    total_bytes: Optional[int] = None
    request_mb: Optional[float] = None
    response_mb: Optional[float] = None
    total_mb: Optional[float] = None
    accuracy: Optional[Dict[str, int]] = None

class TrafficStats(BaseModel):
    """트래픽 통계 응답"""
    domain: str
    interval: str
    period: str
    total_requests: int
    total_bytes: int
    total_mb: float
    total_request_bytes: Optional[int] = None
    total_response_bytes: Optional[int] = None
    total_request_mb: Optional[float] = None
    total_response_mb: Optional[float] = None
    accuracy_breakdown: Optional[Dict[str, int]] = None
    timeline: Optional[List[TrafficTimelineItem]] = None
    stats: Optional[List[TrafficTimelineItem]] = None

class DomainStatsResponse(BaseModel):
    """도메인 통계 응답"""
    domain: str
    redis_logs: int
    file_logs: int
    log_file: str

class SSEEvent(BaseModel):
    """SSE 이벤트 모델"""
    type: str  # "log", "traffic", "system_traffic", "error"
    payload: Any

class MonitoringHealthResponse(BaseModel):
    """모니터링 서버 헬스 체크 응답"""
    status: str
    monitor_server: str
    response: Optional[Dict[str, Any]] = None
    error: Optional[str] = None