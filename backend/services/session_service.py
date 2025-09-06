# services/session_service.py
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import json
from fastapi import HTTPException, status

class SessionService:
    def __init__(self):
        # 실제 운영환경에서는 Redis나 데이터베이스 사용 권장
        self.sessions: Dict[str, Dict[str, Any]] = {}
    
    def create_session(self, user_id: str, email: str, name: str, picture: Optional[str] = None) -> str:
        """새로운 세션 생성"""
        session_id = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=24)
        
        session_data = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.utcnow().isoformat()
        }
        
        self.sessions[session_id] = session_data
        return session_id
    
    def validate_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """세션 유효성 검증"""
        if session_id not in self.sessions:
            return None
        
        session = self.sessions[session_id]
        expires_at = datetime.fromisoformat(session["expires_at"])
        
        if datetime.utcnow() > expires_at:
            # 만료된 세션 삭제
            self.delete_session(session_id)
            return None
        
        return session
    
    def delete_session(self, session_id: str) -> bool:
        """세션 삭제"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            return True
        return False
    
    def refresh_session(self, session_id: str) -> Optional[str]:
        """세션 갱신 (24시간 연장)"""
        session = self.validate_session(session_id)
        if not session:
            return None
        
        # 새로운 세션 ID 생성
        new_session_id = secrets.token_urlsafe(32)
        expires_at = datetime.utcnow() + timedelta(hours=24)
        
        session_data = {
            "user_id": session["user_id"],
            "email": session["email"],
            "name": session["name"],
            "picture": session["picture"],
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.utcnow().isoformat()
        }
        
        # 기존 세션 삭제 후 새 세션 생성
        self.delete_session(session_id)
        self.sessions[new_session_id] = session_data
        
        return new_session_id
    
    def get_user_sessions(self, user_id: str) -> list:
        """사용자의 모든 활성 세션 조회"""
        active_sessions = []
        for session_id, session in self.sessions.items():
            if session["user_id"] == user_id and self.validate_session(session_id):
                active_sessions.append({
                    "session_id": session_id,
                    "created_at": session["created_at"],
                    "expires_at": session["expires_at"]
                })
        return active_sessions
    
    def cleanup_expired_sessions(self):
        """만료된 세션 정리"""
        expired_sessions = []
        for session_id, session in self.sessions.items():
            expires_at = datetime.fromisoformat(session["expires_at"])
            if datetime.utcnow() > expires_at:
                expired_sessions.append(session_id)
        
        for session_id in expired_sessions:
            self.delete_session(session_id)
        
        return len(expired_sessions)

# 전역 인스턴스
session_service = SessionService()
