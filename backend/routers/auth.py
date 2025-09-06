# routers/auth.py
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from services.google_auth_service import GoogleAuthService
from services.session_service import session_service
from services.session_auth import get_current_user_by_session, get_current_session_id
from schema.user import User
from database import get_db
from pydantic import BaseModel

router = APIRouter()  # 내부 prefix 제거

class GoogleLoginRequest(BaseModel):
    id_token: str

class LoginResponse(BaseModel):
    session_id: str
    user: dict
    expires_at: str

class SessionValidationResponse(BaseModel):
    valid: bool
    user: dict
    expires_at: str

@router.post("/google/login", response_model=LoginResponse)
async def google_login(
    request: GoogleLoginRequest,
    db: Session = Depends(get_db)
):
    """Google 로그인"""
    try:
        
        # Google 토큰 검증
        google_auth = GoogleAuthService()
        
        google_data = await google_auth.verify_google_token(request.id_token)
        
        # 사용자 조회 또는 생성
        user = await google_auth.get_or_create_user(db, google_data)
        
        # 세션 생성
        session_id = session_service.create_session(
            user_id=user.id,
            email=user.email,
            name=user.name,
            picture=user.picture
        )
        
        # 세션 정보 조회
        session = session_service.validate_session(session_id)
        
        response = LoginResponse(
            session_id=session_id,
            user={
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "picture": user.picture
            },
            expires_at=session["expires_at"]
        )
        
        return response
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/logout")
async def logout(
    response: Response,
    session_id: str = Depends(get_current_session_id)
):
    """로그아웃"""
    try:
        # 세션 삭제
        deleted = session_service.delete_session(session_id)
        if deleted:
            return {"message": "로그아웃되었습니다"}
        else:
            raise HTTPException(status_code=400, detail="세션을 찾을 수 없습니다")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/validate", response_model=SessionValidationResponse)
async def validate_session(
    session_id: str = Depends(get_current_session_id)
):
    """세션 유효성 검증"""
    try:
        session = session_service.validate_session(session_id)
        if session:
            return SessionValidationResponse(
                valid=True,
                user={
                    "id": session["user_id"],
                    "email": session["email"],
                    "name": session["name"],
                    "picture": session["picture"]
                },
                expires_at=session["expires_at"]
            )
        else:
            return SessionValidationResponse(
                valid=False,
                user={},
                expires_at=""
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/refresh")
async def refresh_session(
    response: Response,
    session_id: str = Depends(get_current_session_id)
):
    """세션 갱신"""
    try:
        new_session_id = session_service.refresh_session(session_id)
        if new_session_id:
            session = session_service.validate_session(new_session_id)
            return {
                "session_id": new_session_id,
                "expires_at": session["expires_at"]
            }
        else:
            raise HTTPException(status_code=400, detail="세션을 갱신할 수 없습니다")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/me")
async def get_current_user(current_user: User = Depends(get_current_user_by_session)):
    """현재 사용자 정보 조회"""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "picture": current_user.picture
    }