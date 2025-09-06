from fastapi import APIRouter, HTTPException, Query, Request, Depends
from fastapi.responses import StreamingResponse
from typing import Optional, List
import logging

from models.proxy_and_waf import SubdomainRegisterRequest, SubdomainUnregisterRequest, WAFResponse
from services.proxy_and_waf_service import waf_service
from services.session_auth import get_current_user_by_session
from sqlalchemy.orm import Session
from database import get_db
from schema.user import UserDomain
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# 라우터 생성
router = APIRouter()

# === 프록시/WAF 관리 API ===

@router.post("/register", response_model=WAFResponse)
async def register_subdomain(request: SubdomainRegisterRequest, current_user = Depends(get_current_user_by_session), db: Session = Depends(get_db)):
    """서브도메인을 Cloudflare에 등록하고 WAF 서버에 등록 요청 + DB 기록"""
    try:
        result = await waf_service.register_subdomain(request)
        # DB 저장: user_domains
        full_domain = f"{request.subdomain}.{waf_service.base_domain}"
        now = datetime.now()
        record = UserDomain(
            id=str(now.timestamp()).replace('.', ''),
            user_id=current_user.id,
            domain=full_domain,
            target=request.target,
            waf=request.waf,
            created_at=now,
            billing_date=now + timedelta(days=30),
            deleted_at=None,
        )
        db.add(record)
        db.commit()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/unregister", response_model=WAFResponse)
async def unregister_subdomain(request: SubdomainUnregisterRequest, current_user = Depends(get_current_user_by_session), db: Session = Depends(get_db)):
    """Cloudflare에서 서브도메인을 삭제하고 WAF 서버에 삭제 요청"""
    try:
        result = await waf_service.unregister_subdomain(request)
        # DB 업데이트: 해당 도메인 삭제일 기록
        full_domain = f"{request.subdomain}.{waf_service.base_domain}"
        row = db.query(UserDomain).filter(UserDomain.user_id == current_user.id, UserDomain.domain == full_domain, UserDomain.deleted_at == None).first()
        if row:
            row.deleted_at = datetime.now()
            db.commit()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


