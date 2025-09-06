# services/jwt_service.py
from datetime import datetime, timedelta
from multiprocessing.resource_tracker import getfd
from jose import JWTError, jwt
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from schema.user import User
from database import get_db
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../config', '.env'))

# 기본 HTTPBearer 사용
security = HTTPBearer()

class JWTService:
    def __init__(self):
        print(f"DEBUG: JWTService 초기화 시작")
        
        self.secret_key = os.getenv("JWT_SECRET_KEY")
        print(f"DEBUG: JWT_SECRET_KEY: {self.secret_key[:20] if self.secret_key else 'None'}...")
        
        self.algorithm = os.getenv("JWT_ALGORITHM")
        print(f"DEBUG: JWT_ALGORITHM: {self.algorithm}")
        
        self.access_token_expire_minutes = int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES"))
        print(f"DEBUG: JWT_ACCESS_TOKEN_EXPIRE_MINUTES: {self.access_token_expire_minutes}")
        
        print(f"DEBUG: JWTService 초기화 완료")
    
    def create_access_token(self, data: dict) -> str:
        """JWT 액세스 토큰 생성"""
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(minutes=self.access_token_expire_minutes)
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        return encoded_jwt
    
    def verify_token(self, token: str) -> dict:
        """JWT 토큰 검증"""
        try:
            print(f"DEBUG: ===== verify_token 시작 =====")
            print(f"DEBUG: 입력 토큰 타입: {type(token)}")
            print(f"DEBUG: 입력 토큰 길이: {len(token)}")
            print(f"DEBUG: 입력 토큰 전체: {token}")
            print(f"DEBUG: 입력 토큰 미리보기: {token[:50]}...")
            
            print(f"DEBUG: ===== JWT 설정 확인 =====")
            print(f"DEBUG: secret_key 타입: {type(self.secret_key)}")
            print(f"DEBUG: secret_key 길이: {len(self.secret_key) if self.secret_key else 0}")
            print(f"DEBUG: secret_key 미리보기: {self.secret_key[:20] if self.secret_key else 'None'}...")
            print(f"DEBUG: algorithm: {self.algorithm}")
            print(f"DEBUG: algorithm 타입: {type(self.algorithm)}")
            
            print(f"DEBUG: ===== JWT 디코딩 시작 =====")
            print(f"DEBUG: jwt.decode 호출 파라미터:")
            print(f"DEBUG:   - token: {token[:30]}...")
            print(f"DEBUG:   - secret_key: {self.secret_key[:20] if self.secret_key else 'None'}...")
            print(f"DEBUG:   - algorithms: [{self.algorithm}]")
            
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            print(f"DEBUG: ===== JWT 디코딩 성공 =====")
            print(f"DEBUG: 디코딩된 페이로드: {payload}")
            print(f"DEBUG: 페이로드 타입: {type(payload)}")
            print(f"DEBUG: 페이로드 키들: {list(payload.keys()) if isinstance(payload, dict) else 'Not a dict'}")
            
            if isinstance(payload, dict):
                for key, value in payload.items():
                    print(f"DEBUG:   {key}: {value} (타입: {type(value)})")
            
            return payload
            
        except JWTError as e:
            print(f"DEBUG: ===== JWT 디코딩 실패 (JWTError) =====")
            print(f"DEBUG: JWT 에러 메시지: {str(e)}")
            print(f"DEBUG: JWT 에러 타입: {type(e)}")
            print(f"DEBUG: JWT 에러 클래스: {e.__class__.__name__}")
            import traceback
            print(f"DEBUG: JWT 에러 스택 트레이스: {traceback.format_exc()}")
            raise HTTPException(status_code=401, detail="Invalid token")
        except Exception as e:
            print(f"DEBUG: ===== verify_token에서 예상치 못한 에러 =====")
            print(f"DEBUG: 에러 메시지: {str(e)}")
            print(f"DEBUG: 에러 타입: {type(e)}")
            print(f"DEBUG: 에러 클래스: {e.__class__.__name__}")
            import traceback
            print(f"DEBUG: 에러 스택 트레이스: {traceback.format_exc()}")
            raise HTTPException(status_code=401, detail="Invalid token")
    
    def get_current_user(self, token: str = Depends(security), db: Session = Depends(get_db)) -> User:
        """현재 인증된 사용자 조회"""
        print(f"DEBUG: ===== get_current_user 함수 진입 =====")
        print(f"DEBUG: 함수 시작 시점")
        
        try:
            print(f"DEBUG: ===== JWT 토큰 검증 시작 =====")
            print(f"DEBUG: 토큰 객체 타입: {type(token)}")
            print(f"DEBUG: 토큰 credentials 타입: {type(token.credentials)}")
            print(f"DEBUG: 토큰 전체: {token.credentials}")
            print(f"DEBUG: 토큰 길이: {len(token.credentials)}")
            print(f"DEBUG: 토큰 미리보기: {token.credentials[:50]}...")
            
            print(f"DEBUG: ===== verify_token 호출 시작 =====")
            payload = self.verify_token(token.credentials)
            print(f"DEBUG: ===== verify_token 완료 =====")
            print(f"DEBUG: 토큰 페이로드: {payload}")
            print(f"DEBUG: 페이로드 타입: {type(payload)}")
            
            user_id = payload.get("sub")
            print(f"DEBUG: 추출된 user_id: {user_id}")
            print(f"DEBUG: user_id 타입: {type(user_id)}")
            
            if user_id is None:
                print("DEBUG: user_id가 None - 토큰 검증 실패")
                raise HTTPException(status_code=401, detail="Invalid token")
            
            print(f"DEBUG: ===== 데이터베이스 사용자 조회 시작 =====")
            print(f"DEBUG: DB 세션 타입: {type(db)}")
            print(f"DEBUG: User 모델 타입: {type(User)}")
            
            user = db.query(User).filter(User.id == user_id).first()
            print(f"DEBUG: DB 쿼리 결과: {user}")
            print(f"DEBUG: 결과 타입: {type(user)}")
            
            if user is None:
                print("DEBUG: 사용자를 찾을 수 없음 - 데이터베이스에 사용자 없음")
                print(f"DEBUG: 검색한 user_id: {user_id}")
                raise HTTPException(status_code=401, detail="User not found")
            
            print(f"DEBUG: ===== 사용자 정보 상세 =====")
            print(f"DEBUG: 사용자 ID: {user.id}")
            print(f"DEBUG: 사용자 이메일: {user.email}")
            print(f"DEBUG: 사용자 이름: {user.name}")
            print(f"DEBUG: 사용자 remaining_points: {user.remaining_points}")
            print(f"DEBUG: 사용자 remaining_points 타입: {type(user.remaining_points)}")
            print(f"DEBUG: 사용자 생성일: {user.created_at}")
            print(f"DEBUG: 사용자 마지막 로그인: {user.last_login}")
            
            # remaining_points가 None인 경우 0으로 설정
            if user.remaining_points is None:
                print(f"DEBUG: WARNING - remaining_points가 None입니다! 0으로 설정합니다.")
                user.remaining_points = 0
                db.commit()
                print(f"DEBUG: remaining_points를 0으로 업데이트했습니다.")
            
            print(f"DEBUG: 최종 remaining_points: {user.remaining_points}")
            print(f"DEBUG: 최종 remaining_points 타입: {type(user.remaining_points)}")
            
            print(f"DEBUG: ===== 인증 성공 - 사용자 반환 =====")
            return user
            
        except Exception as e:
            print(f"DEBUG: ===== get_current_user에서 에러 발생 =====")
            print(f"DEBUG: 에러 메시지: {str(e)}")
            print(f"DEBUG: 에러 타입: {type(e)}")
            print(f"DEBUG: 에러 클래스: {e.__class__.__name__}")
            import traceback
            print(f"DEBUG: 스택 트레이스: {traceback.format_exc()}")
            print(f"DEBUG: ===== 에러 상세 정보 끝 =====")
            raise

# 싱글톤 인스턴스
print(f"DEBUG: JWTService 인스턴스 생성 시작")
jwt_service_instance = JWTService()
print(f"DEBUG: JWTService 인스턴스 생성 완료: {jwt_service_instance}")
print(f"DEBUG: JWTService 인스턴스 타입: {type(jwt_service_instance)}")

# Depends에서 사용할 함수
def get_current_user(token: str = Depends(security), db: Session = Depends(get_db)) -> User:
    print(f"DEBUG: ===== get_current_user 함수 호출됨 =====")
    print(f"DEBUG: 함수 시작 시점")
    print(f"DEBUG: token 파라미터: {token}")
    print(f"DEBUG: db 파라미터: {db}")
    
    try:
        result = jwt_service_instance.get_current_user(token, db)
        print(f"DEBUG: ===== get_current_user 함수 완료 =====")
        print(f"DEBUG: 반환 결과: {result}")
        return result
    except Exception as e:
        print(f"DEBUG: ===== get_current_user 함수에서 에러 발생 =====")
        print(f"DEBUG: 에러 메시지: {str(e)}")
        print(f"DEBUG: 에러 타입: {type(e)}")
        import traceback
        print(f"DEBUG: 스택 트레이스: {traceback.format_exc()}")
        raise