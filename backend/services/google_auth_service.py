import os
import httpx
from fastapi import HTTPException
from schema.user import User
from sqlalchemy.orm import Session
import uuid
from datetime import datetime
from services.jwt_service import JWTService

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../config', '.env'))

class GoogleAuthService:
    def __init__(self):
        print(f"DEBUG: ===== GoogleAuthService 초기화 시작 =====")
        self.client_id = os.getenv("GOOGLE_CLIENT_ID")
        print(f"DEBUG: GOOGLE_CLIENT_ID: {self.client_id}")
        self.client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        print(f"DEBUG: GOOGLE_CLIENT_SECRET: {self.client_secret[:10] if self.client_secret else 'None'}...")
        self.jwt_service = JWTService()
        print(f"DEBUG: JWTService 인스턴스: {self.jwt_service}")
        print(f"DEBUG: ===== GoogleAuthService 초기화 완료 =====")
    
    async def verify_google_token(self, id_token: str) -> dict:
        """Google ID 토큰 검증"""
        try:
            print(f"DEBUG: ===== Google 토큰 검증 시작 =====")
            print(f"DEBUG: 입력 id_token 길이: {len(id_token)}")
            print(f"DEBUG: 입력 id_token 미리보기: {id_token[:50]}...")
            print(f"DEBUG: Google API URL: https://oauth2.googleapis.com/tokeninfo?id_token={id_token[:30]}...")
            
            async with httpx.AsyncClient(timeout=10.0) as client:
                print(f"DEBUG: HTTP 요청 시작")
                resp = await client.get(
                    f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
                )
                print(f"DEBUG: HTTP 응답 상태 코드: {resp.status_code}")
                print(f"DEBUG: HTTP 응답 헤더: {dict(resp.headers)}")
                
                try:
                    resp.raise_for_status()
                    print(f"DEBUG: HTTP 응답 성공")
                except httpx.HTTPStatusError as he:
                    print(f"DEBUG: HTTP 응답 실패: {he}")
                    detail = resp.text[:500]
                    print(f"DEBUG: 응답 내용: {detail}")
                    raise HTTPException(status_code=400, detail=f"Google tokeninfo HTTP {resp.status_code}: {detail}") from he
                
                data = resp.json()
                print(f"DEBUG: Google API 응답 데이터: {data}")
                
                # 필수 필드 확인
                aud = data.get("aud")
                iss = data.get("iss")
                email_verified = str(data.get("email_verified", "false")).lower() in ("true", "1")
                
                print(f"DEBUG: aud (client_id): {aud}")
                print(f"DEBUG: iss (issuer): {iss}")
                print(f"DEBUG: email_verified: {email_verified}")
                print(f"DEBUG: 예상 client_id: {self.client_id}")
                
                if not aud:
                    print("DEBUG: aud 필드 누락")
                    raise HTTPException(status_code=400, detail="Token missing 'aud' claim")
                if aud != self.client_id:
                    print(f"DEBUG: client_id 불일치 - 예상: {self.client_id}, 실제: {aud}")
                    raise HTTPException(status_code=400, detail=f"Invalid client ID (aud mismatch). expected={self.client_id}, got={aud}")
                if iss not in ("https://accounts.google.com", "accounts.google.com"):
                    print(f"DEBUG: issuer 불일치: {iss}")
                    raise HTTPException(status_code=400, detail=f"Invalid issuer: {iss}")
                if not email_verified:
                    print("DEBUG: 이메일 미인증")
                    raise HTTPException(status_code=400, detail="Email not verified on Google account")
                
                print(f"DEBUG: ===== Google 토큰 검증 성공 =====")
                return data
        except HTTPException:
            print(f"DEBUG: HTTPException 발생 - 재발생")
            raise
        except Exception as e:
            print(f"DEBUG: 예상치 못한 에러: {str(e)}")
            print(f"DEBUG: 에러 타입: {type(e)}")
            raise HTTPException(status_code=400, detail=f"Token verification failed: {str(e)}")
    
    async def get_or_create_user(self, db: Session, google_data: dict) -> User:
        """사용자 조회 또는 생성"""
        # 기존 사용자 검색
        user = db.query(User).filter(User.google_id == google_data["sub"]).first()
        
        if user:
            # 마지막 로그인 시간 업데이트
            user.last_login = datetime.utcnow()
            db.commit()
            return user
        
        # 새 사용자 생성
        new_user = User(
            id=str(uuid.uuid4()),
            email=google_data["email"],
            name=google_data.get("name", google_data.get("email", "")),
            picture=google_data.get("picture"),
            google_id=google_data["sub"]
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        return new_user
    
    def create_access_token(self, user: User) -> str:
        """사용자 정보로 JWT 액세스 토큰 생성"""
        return self.jwt_service.create_access_token(data={"sub": user.id})