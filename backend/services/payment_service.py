import os
import requests
import uuid
import base64
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from schema.user import User
from schema.payment_db import PaymentOrderORM
from dotenv import load_dotenv

from schema.payment import PaymentPrepareRequest, PaymentPrepareResponse, PaymentOrder, UserBalance, DeductPointsRequest

load_dotenv(os.path.join(os.path.dirname(__file__), '../config', '.env'))

# 환경변수에서 직접 설정 로드
TOSS_CLIENT_KEY = os.getenv("TOSS_CLIENT_KEY")
TOSS_SECRET_KEY = os.getenv("TOSS_SECRET_KEY")
TOSS_API_URL = os.getenv("TOSS_API_URL")

# 메모리 저장소 제거: DB 사용

class PaymentService:
    """결제 관련 비즈니스 로직을 처리하는 서비스 클래스"""
    
    def __init__(self):
        self.toss_api_url = TOSS_API_URL
        self.toss_client_key = TOSS_CLIENT_KEY
        self.toss_secret_key = TOSS_SECRET_KEY
    
    async def prepare_payment(self, db: Session, user_id: str, request: PaymentPrepareRequest) -> PaymentPrepareResponse:
        """결제 준비 로직"""
        try:
            # 주문 ID 생성
            order_id = f"order_{uuid.uuid4().hex[:12]}"
            # 주문 정보 DB 저장
            orm = PaymentOrderORM(
                id=str(uuid.uuid4()),
                user_id=user_id,
                order_id=order_id,
                amount=request.amount,
                order_name=request.orderName,
                status="READY",
                created_at=datetime.utcnow()
            )
            db.add(orm)
            db.commit()
            
            return PaymentPrepareResponse(
                orderId=order_id,
                orderName=request.orderName,
                clientKey=self.toss_client_key
            )
        
        except Exception as e:
            raise Exception(f"결제 준비 중 오류가 발생했습니다: {str(e)}")
    
    async def confirm_payment(self, db: Session, payment_key: str, order_id: str, amount: int) -> bool:
        """토스 페이먼츠 API를 통한 결제 승인"""
        try:
            # 인증 헤더 생성
            auth_string = base64.b64encode(f"{self.toss_secret_key}:".encode()).decode()
            
            headers = {
                "Authorization": f"Basic {auth_string}",
                "Content-Type": "application/json"
            }
            
            data = {
                "paymentKey": payment_key,
                "orderId": order_id,
                "amount": amount
            }
            
            # 토스 페이먼츠 API 호출
            response = requests.post(
                f"{self.toss_api_url}/confirm",
                headers=headers,
                json=data,
                timeout=30
            )
            
            if response.status_code == 200:
                
                # 주문 조회 및 사용자 식별
                db_order = db.query(PaymentOrderORM).filter(PaymentOrderORM.order_id == order_id).first()
                if db_order:
                    
                    # 포인트 충전 시도 (최대 3회)
                    max_retries = 3
                    for attempt in range(max_retries):
                        try:
                            # 결제 성공 시 포인트 충전 (DB)
                            await self.add_user_points(db, db_order.user_id, amount)
                            
                            # 주문 상태 업데이트 (DB)
                            db_order.status = "DONE"
                            db_order.payment_key = payment_key
                            db_order.approved_at = datetime.utcnow()
                            db.commit()
                            
                            return True
                        except Exception as e:
                            db.rollback()
                            
                            if attempt == max_retries - 1:
                                # 주문 상태를 FAILED로 설정
                                db_order.status = "FAILED"
                                db_order.payment_key = payment_key
                                db.commit()
                                return False
                            else:
                                import time
                                time.sleep(1)  # 1초 대기 후 재시도
                else:
                    return False
            else:
                # 결제 실패 로그
                error_data = response.json() if response.content else {}
                return False
                
        except requests.exceptions.RequestException as e:
            return False
        except Exception as e:
            return False
    
    async def get_user_balance(self, db: Session, user_id: str) -> UserBalance:
        """사용자 포인트 잔액 조회"""
        
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            raise Exception("사용자를 찾을 수 없습니다")
        
        # remaining_points가 None인 경우 데이터베이스에서 직접 업데이트
        if user.remaining_points is None:
            from sqlalchemy import text
            update_query = text("UPDATE users SET remaining_points = 0 WHERE id = :user_id")
            db.execute(update_query, {"user_id": user_id})
            db.commit()
            
            # 사용자 객체 새로고침
            db.refresh(user)
        
        # remaining_points가 None인 경우 0으로 처리
        balance = user.remaining_points if user.remaining_points is not None else 0
        
        # balance가 정수인지 확인하고 변환
        try:
            balance_int = int(balance)
        except (ValueError, TypeError):
            balance_int = 0
        
        result = UserBalance(balance=balance_int)
        return result
    
    async def add_user_points(self, db: Session, user_id: str, amount: int) -> None:
        """사용자 포인트 추가"""
        try:
            user = db.query(User).filter(User.id == user_id).first()
            if user.remaining_points is None:
                from sqlalchemy import text
                update_query = text("UPDATE users SET remaining_points = 0 WHERE id = :user_id")
                db.execute(update_query, {"user_id": user_id})
                db.commit()
                db.refresh(user)
            
            current_points = user.remaining_points if user.remaining_points is not None else 0
            
            new_points = current_points + amount
            user.remaining_points = new_points

            db.commit()
            
        except Exception as e:
            db.rollback()
            raise Exception(f"포인트 추가 실패: {str(e)}")
    
    async def deduct_user_points(self, db: Session, user_id: str, amount: int) -> bool:
        """사용자 포인트 차감"""
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return False
        
        # remaining_points가 None인 경우 0으로 처리
        current_points = user.remaining_points if user.remaining_points is not None else 0
        if current_points < amount:
            return False
        
        user.remaining_points = current_points - amount
        db.commit()
        return True
    
    async def get_payment_order(self, db: Session, order_id: str) -> Optional[PaymentOrder]:
        """주문 정보 조회"""
        orm = db.query(PaymentOrderORM).filter(PaymentOrderORM.order_id == order_id).first()
        if not orm:
            return None
        return PaymentOrder(
            orderId=orm.order_id,
            amount=orm.amount,
            orderName=orm.order_name,
            status=orm.status,
            createdAt=orm.created_at.isoformat() if orm.created_at else None,
            paymentKey=orm.payment_key,
            approvedAt=orm.approved_at.isoformat() if orm.approved_at else None
        )
    
    async def get_payment_history(self, db: Session, user_id: str) -> list:
        """사용자 결제 내역 조회"""
        rows = db.query(PaymentOrderORM).filter(PaymentOrderORM.user_id == user_id).order_by(PaymentOrderORM.created_at.desc()).all()
        return [PaymentOrder(
            orderId=r.order_id,
            amount=r.amount,
            orderName=r.order_name,
            status=r.status,
            createdAt=r.created_at.isoformat() if r.created_at else None,
            paymentKey=r.payment_key,
            approvedAt=r.approved_at.isoformat() if r.approved_at else None
        ) for r in rows]
    
    async def cancel_payment(self, db: Session, user_id: str, payment_key: str, cancel_reason: str) -> bool:
        """결제 취소"""
        try:
            auth_string = base64.b64encode(f"{self.toss_secret_key}:".encode()).decode()
            
            headers = {
                "Authorization": f"Basic {auth_string}",
                "Content-Type": "application/json"
            }
            
            data = {
                "cancelReason": cancel_reason
            }
            
            response = requests.post(
                f"{self.toss_api_url}/{payment_key}/cancel",
                headers=headers,
                json=data,
                timeout=30
            )
            
            if response.status_code == 200:
                db_order = db.query(PaymentOrderORM).filter(PaymentOrderORM.payment_key == payment_key).first()
                if db_order:
                    db_order.status = "CANCELLED"
                    db.commit()
                    # 포인트 환불
                    await self.deduct_user_points(db, user_id, -db_order.amount)  # 환불은 마이너스 차감 = 추가
                
                return True
            else:
                return False
                
        except Exception as e:
            print(f"결제 취소 중 오류: {str(e)}")
            return False

# 싱글톤 인스턴스
payment_service = PaymentService()
