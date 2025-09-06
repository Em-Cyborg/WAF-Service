from fastapi import APIRouter, Request, HTTPException, Query, Depends
from fastapi.responses import StreamingResponse
from typing import Optional, List
from services.monitoring_service import MonitoringService
from models.monitoring import (
    LogItem, DomainInfo, TrafficStats, DomainTrafficStats, 
    DomainStatsResponse, MonitoringHealthResponse, DomainBillingInfo, DomainBillingSummary
)
from sqlalchemy.orm import Session
from database import get_db
from schema.user import UserDomain
from services.session_auth import get_current_user_by_session
import logging
from datetime import datetime
import json

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/health", response_model=MonitoringHealthResponse)
async def health_check():
    """모니터링 서버 연결 상태 확인"""
    return await MonitoringService.health_check()

@router.get("/domains", response_model=List[DomainInfo])
async def get_managed_domains(current_user = Depends(get_current_user_by_session), db: Session = Depends(get_db)):
    """관리 중인 도메인 목록 조회 - 로그인 사용자 소유만 표시 (결제 예정 금액 포함)"""
    try:
        # 인증된 사용자 확인
        if not current_user:
            logger.error("인증되지 않은 사용자")
            raise HTTPException(status_code=401, detail="인증이 필요합니다.")
        
        logger.info(f"사용자 {current_user.id}의 도메인 목록 조회 시작")
        
        rows = db.query(UserDomain).filter(
            UserDomain.user_id == current_user.id, 
            UserDomain.deleted_at == None
        ).all()
        
        logger.info(f"사용자 {current_user.id}의 도메인 수: {len(rows)}")
        
        # 각 도메인에 대해 결제 예정 금액 정보 조회
        domain_info_list = []
        for row in rows:
            billing_info = None
            if row.created_at and row.billing_date:
                try:
                    billing_info = await MonitoringService.get_domain_billing_summary(
                        domain=row.domain,
                        created_at=row.created_at.isoformat(),
                        payment_due_date=row.billing_date.isoformat()
                    )
                except Exception as e:
                    logger.warning(f"도메인 {row.domain}의 결제 정보 조회 실패: {e}")
            
            domain_info = DomainInfo(
                domain=row.domain, 
                log_count=0,
                created_at=row.created_at.isoformat() if row.created_at else None,
                target=row.target,
                payment_due_date=row.billing_date.isoformat() if row.billing_date else None,
                waf=row.waf,
                billing_info=billing_info
            )
            domain_info_list.append(domain_info)
        
        logger.info(f"사용자 {current_user.id}의 도메인 목록 {len(domain_info_list)}개 반환 (결제 정보 포함)")
        return domain_info_list
    except Exception as e:
        logger.error(f"도메인 목록 조회 실패: {e}")
        raise HTTPException(status_code=500, detail=f"도메인 목록 조회 실패: {str(e)}")

@router.get("/logs", response_model=List[LogItem])
async def get_all_logs(n: int = Query(20, description="조회할 로그 개수")):
    """전체 최근 로그 조회"""
    return await MonitoringService.get_all_logs(count=n)

@router.get("/logs/{domain}", response_model=List[LogItem])
async def get_domain_logs(
    domain: str, 
    n: int = Query(20, description="조회할 로그 개수")
):
    """특정 도메인의 최근 로그 조회"""
    return await MonitoringService.get_domain_logs(domain=domain, count=n)

@router.get("/stats/{domain}")
async def get_domain_stats(domain: str):
    """특정 도메인의 통계 정보 조회"""
    stats = await MonitoringService.get_domain_stats(domain)
    if stats is None:
        raise HTTPException(status_code=404, detail=f"도메인 '{domain}'의 통계를 찾을 수 없습니다.")
    return stats

@router.get("/traffic/summary", response_model=List[DomainTrafficStats])
async def get_traffic_summary(
    current_user = Depends(get_current_user_by_session), 
    db: Session = Depends(get_db)
):
    """사용자별 트래픽 요약 조회 - 사용자가 소유한 도메인만"""
    try:
        # 인증된 사용자 확인
        if not current_user:
            logger.error("인증되지 않은 사용자")
            raise HTTPException(status_code=401, detail="인증이 필요합니다.")
        
        print(f"사용자 {current_user.id}의 트래픽 요약 조회 시작")
        
        # 현재 사용자가 소유한 도메인 목록 조회
        user_domains = db.query(UserDomain).filter(
            UserDomain.user_id == current_user.id,
            UserDomain.deleted_at == None
        ).all()
        
        print(f"사용자 {current_user.id}의 도메인 수: {len(user_domains)}")
        
        if not user_domains:
            print(f"사용자 {current_user.id}의 도메인이 없음")
            return []
        
        # 사용자 도메인들의 트래픽 데이터만 조회
        domain_names = [domain.domain for domain in user_domains]
        
        # 모니터링 서비스에서 사용자 도메인들의 트래픽 데이터 조회
        all_traffic = await MonitoringService.get_traffic_summary()
        
        # 사용자가 소유한 도메인의 트래픽만 필터링
        user_traffic = []
        for traffic in all_traffic:
            if traffic.domain in domain_names:
                user_traffic.append(traffic)
        
        print(f"사용자 {current_user.id}의 트래픽 데이터 {len(user_traffic)}개 반환")
        return user_traffic
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"트래픽 요약 조회 실패: {e}")
        raise HTTPException(status_code=500, detail="트래픽 요약 조회 중 오류가 발생했습니다.")

@router.get("/traffic/{domain}", response_model=TrafficStats)
async def get_domain_traffic(
    domain: str,
    interval: str = Query("day", description="시간 간격 (realtime, hour, day, week, month)"),
    period: int = Query(7, description="조회할 기간 수")
):
    """특정 도메인의 트래픽 통계 조회"""
    # 간격별 최대 기간 제한 검증
    max_periods = {
        "realtime": 60,
        "hour": 8760,  # 1년
        "day": 365,    # 1년
        "week": 52,    # 1년
        "month": 12    # 1년
    }
    
    if interval not in max_periods:
        raise HTTPException(
            status_code=400, 
            detail=f"지원되지 않는 간격입니다. 사용 가능한 간격: {list(max_periods.keys())}"
        )
    
    if period > max_periods[interval]:
        raise HTTPException(
            status_code=400,
            detail=f"{interval} 간격의 최대 기간은 {max_periods[interval]}입니다."
        )
    
    traffic_stats = await MonitoringService.get_domain_traffic(
        domain=domain, 
        interval=interval, 
        period=period
    )
    
    if traffic_stats is None:
        raise HTTPException(
            status_code=404, 
            detail=f"도메인 '{domain}'의 트래픽 통계를 찾을 수 없습니다."
        )
    
    return traffic_stats

@router.get("/billing/summary", response_model=List[DomainBillingSummary])
async def get_billing_summary(
    current_user = Depends(get_current_user_by_session), 
    db: Session = Depends(get_db)
):
    """사용자별 도메인별 결제 예정 금액 요약 조회 - 사용자가 소유한 도메인만"""
    try:
        # 인증된 사용자 확인
        if not current_user:
            logger.error("인증되지 않은 사용자")
            raise HTTPException(status_code=401, detail="인증이 필요합니다.")
        
        print(f"사용자 {current_user.id}의 결제 예정 금액 요약 조회 시작")
        
        # 현재 사용자가 소유한 도메인 목록 조회
        user_domains = db.query(UserDomain).filter(
            UserDomain.user_id == current_user.id,
            UserDomain.deleted_at == None
        ).all()
        
        print(f"사용자 {current_user.id}의 도메인 수: {len(user_domains)}")
        
        if not user_domains:
            print(f"사용자 {current_user.id}의 도메인이 없음")
            return []
        
        # 사용자 도메인들의 결제 예정 금액 데이터만 조회
        domain_names = [domain.domain for domain in user_domains]
        
        # 사용자 도메인들의 결제 예정 금액 데이터 조회
        user_billing_summary = []
        for user_domain in user_domains:
            if user_domain.created_at and user_domain.billing_date:
                billing_summary = await MonitoringService.get_domain_billing_summary(
                    domain=user_domain.domain,
                    created_at=user_domain.created_at.isoformat(),
                    payment_due_date=user_domain.billing_date.isoformat()
                )
                
                if billing_summary:
                    user_billing_summary.append(billing_summary)
        
        print(f"사용자 {current_user.id}의 결제 예정 금액 데이터 {len(user_billing_summary)}개 반환")
        return user_billing_summary
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"결제 예정 금액 요약 조회 실패: {e}")
        raise HTTPException(status_code=500, detail="결제 예정 금액 요약 조회 중 오류가 발생했습니다.")

@router.get("/billing/{domain}", response_model=DomainBillingInfo)
async def get_domain_billing_info(
    domain: str,
    current_user = Depends(get_current_user_by_session), 
    db: Session = Depends(get_db)
):
    """특정 도메인의 결제 예정 상세 정보 조회"""
    try:
        # 인증된 사용자 확인
        if not current_user:
            logger.error("인증되지 않은 사용자")
            raise HTTPException(status_code=401, detail="인증이 필요합니다.")
        
        print(f"사용자 {current_user.id}의 도메인 '{domain}' 결제 예정 상세 정보 조회 시작")
        
        # 현재 사용자가 소유한 도메인인지 확인
        user_domain = db.query(UserDomain).filter(
            UserDomain.user_id == current_user.id,
            UserDomain.domain == domain,
            UserDomain.deleted_at == None
        ).first()
        
        if not user_domain:
            print(f"사용자 {current_user.id}는 도메인 '{domain}'을 소유하지 않습니다.")
            raise HTTPException(status_code=403, detail=f"도메인 '{domain}'을 소유하지 않습니다.")
        
        billing_info = await MonitoringService.calculate_domain_billing(
            domain=domain,
            created_at=user_domain.created_at.isoformat(),
            payment_due_date=user_domain.billing_date.isoformat()
        )
        
        if billing_info is None:
            raise HTTPException(
                status_code=404, 
                detail=f"도메인 '{domain}'의 결제 예정 상세 정보를 찾을 수 없습니다."
            )
        
        return billing_info
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"도메인 결제 예정 상세 정보 조회 실패: {e}")
        raise HTTPException(status_code=500, detail="도메인 결제 예정 상세 정보 조회 중 오류가 발생했습니다.")

@router.get("/events")
async def sse_events(request: Request):
    """전체 도메인 실시간 이벤트 스트림 (SSE) - 향상된 버전"""
    event_gen = MonitoringService.enhanced_event_generator(request)
    headers = {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",  # nginx 사용시 buffer 방지
        "Connection": "keep-alive"
    }
    return StreamingResponse(event_gen, headers=headers, media_type="text/event-stream")

@router.get("/events/{domain}")
async def sse_domain_events(request: Request, domain: str):
    """특정 도메인 실시간 이벤트 스트림 (SSE) - 향상된 버전"""
    event_gen = MonitoringService.enhanced_event_generator(request, domain=domain)
    headers = {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream", 
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive"
    }
    return StreamingResponse(event_gen, headers=headers, media_type="text/event-stream")

@router.get("/test/realtime/{domain}")
async def test_realtime_monitoring(domain: str):
    """실시간 모니터링 테스트 - 최근 로그를 실시간으로 시뮬레이션"""
    import asyncio
    
    async def generate_test_events():
        """테스트용 실시간 이벤트 생성"""
        for i in range(10):
            test_event = {
                "type": "log",
                "payload": {
                    "timestamp": datetime.now().isoformat(),
                    "domain": domain,
                    "client_ip": f"192.168.1.{i+1}",
                    "method": "GET",
                    "uri": f"/test/page/{i}",
                    "status": 200,
                    "message": f"테스트 로그 #{i+1}"
                }
            }
            yield f"data: {json.dumps(test_event, ensure_ascii=False)}\n\n"
            await asyncio.sleep(2)  # 2초마다 이벤트 생성
    
    headers = {
        "Cache-Control": "no-cache",
        "Content-Type": "text/event-stream",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive"
    }
    
    return StreamingResponse(
        generate_test_events(), 
        headers=headers, 
        media_type="text/event-stream"
    )

# 레거시 엔드포인트 (하위 호환성)
@router.get("/sse")
async def sse_logs(request: Request):
    """
    레거시 SSE 엔드포인트 (하위 호환성)
    /events로 리다이렉트
    """
    return await sse_events(request)