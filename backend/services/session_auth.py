# services/session_auth.py
from fastapi import Depends, HTTPException, status, Header
from typing import Optional
from services.session_service import session_service
from schema.user import User
from database import get_db
from sqlalchemy.orm import Session

async def get_current_user_by_session(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """세션을 통해 현재 사용자 정보를 가져오는 의존성 함수"""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header가 필요합니다"
        )
    
    # Bearer token 형식 확인
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="올바른 Authorization 형식이 아닙니다"
        )
    
    session_id = authorization.replace("Bearer ", "")
    
    # 세션 검증
    session = session_service.validate_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 세션입니다"
        )
    
    # 데이터베이스에서 사용자 정보 가져오기 (remaining_points 포함)
    user = db.query(User).filter(User.id == session["user_id"]).first()
    if not user:
        # 데이터베이스에 사용자가 없으면 세션 정보로 생성
        user = User(
            id=session["user_id"],
            email=session["email"],
            name=session["name"],
            picture=session["picture"],
            remaining_points=0  # 기본값 설정
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    
    return user

async def get_current_session_id(
    authorization: Optional[str] = Header(None)
) -> str:
    """현재 세션 ID를 가져오는 의존성 함수"""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header가 필요합니다"
        )
    
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="올바른 Authorization 형식이 아닙니다"
        )
    
    session_id = authorization.replace("Bearer ", "")
    
    # 세션 존재 여부만 확인 (사용자 정보는 필요 없음)
    if not session_service.validate_session(session_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않거나 만료된 세션입니다"
        )
    
    return session_id
