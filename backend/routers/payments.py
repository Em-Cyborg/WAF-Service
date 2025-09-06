from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse

from schema.payment import PaymentPrepareRequest, PaymentPrepareResponse, UserBalance, DeductPointsRequest
from services.payment_service import payment_service
from services.session_auth import get_current_user_by_session
from sqlalchemy.orm import Session
from database import get_db

# 라우터 생성
router = APIRouter()

"""결제 성공 페이지 - 결제 승인 후 React 앱으로 리다이렉트"""
@router.get("/success")
async def payment_success(request: Request, db: Session = Depends(get_db)):
    # URL 파라미터 추출
    payment_key = request.query_params.get('paymentKey')
    order_id = request.query_params.get('orderId')
    amount = request.query_params.get('amount')
    
    if not all([payment_key, order_id, amount]):
        return RedirectResponse(url="http://localhost:5173/", status_code=302)
    
    try:
        # 결제 승인 처리
        success = await payment_service.confirm_payment(db, payment_key, order_id, int(amount))
            
    except Exception as e:
        import traceback
        print(f"스택 트레이스: {traceback.format_exc()}")
    
    # 결과와 상관없이 React 앱으로 리다이렉트
    return RedirectResponse(url="http://localhost:5173/", status_code=302)

"""결제 실패 페이지 - React 앱으로 리다이렉트"""
@router.get("/fail")
async def payment_fail():
    return RedirectResponse(url="http://localhost:5173/", status_code=302)

"""결제 준비"""
@router.post("/payment/prepare", response_model=PaymentPrepareResponse)
async def prepare_payment(request: PaymentPrepareRequest, current_user = Depends(get_current_user_by_session), db: Session = Depends(get_db)):
    try:
        result = await payment_service.prepare_payment(db, current_user.id, request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

"""사용자 포인트 잔액 조회"""
@router.get("/user/balance", response_model=UserBalance)
async def get_user_balance(current_user = Depends(get_current_user_by_session), db: Session = Depends(get_db)):
    try:
        # remaining_points가 None인지 확인
        if current_user.remaining_points is None:
            # 데이터베이스에서 직접 업데이트
            from sqlalchemy import text
            update_query = text("UPDATE users SET remaining_points = 0 WHERE id = :user_id")
            db.execute(update_query, {"user_id": current_user.id})
            db.commit()
            
            # 세션에서 사용자 객체를 새로고침
            db.refresh(current_user)
        
        result = await payment_service.get_user_balance(db, current_user.id)
        
        return result
        
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/debug/payment-status/{order_id}")
async def debug_payment_status(order_id: str, db: Session = Depends(get_db)):
    """결제 상태 디버깅용 엔드포인트"""
    try:
        from schema.payment_db import PaymentOrderORM
        from schema.user import User
        
        # 주문 정보 조회
        order = db.query(PaymentOrderORM).filter(PaymentOrderORM.order_id == order_id).first()
        if not order:
            return {"error": "주문을 찾을 수 없습니다", "order_id": order_id}
        
        # 사용자 정보 조회
        user = db.query(User).filter(User.id == order.user_id).first()
        
        return {
            "order_id": order_id,
            "order_status": order.status,
            "order_amount": order.amount,
            "user_id": order.user_id,
            "user_points": user.remaining_points if user else None,
            "payment_key": order.payment_key,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "approved_at": order.approved_at.isoformat() if order.approved_at else None
        }
    except Exception as e:
        return {"error": str(e)}

@router.get("/debug/user-points/{user_id}")
async def debug_user_points(user_id: str, db: Session = Depends(get_db)):
    """사용자 포인트 디버깅용 엔드포인트"""
    try:
        from schema.user import User
        
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return {"error": "사용자를 찾을 수 없습니다", "user_id": user_id}
        
        return {
            "user_id": user_id,
            "email": user.email,
            "name": user.name,
            "remaining_points": user.remaining_points,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "last_login": user.last_login.isoformat() if user.last_login else None
        }
    except Exception as e:
        return {"error": str(e)}

@router.post("/user/deduct-points")
async def deduct_points(request: DeductPointsRequest, current_user = Depends(get_current_user_by_session), db: Session = Depends(get_db)):
    try:
        ok = await payment_service.deduct_user_points(db, current_user.id, request.amount)
        if not ok:
            raise HTTPException(status_code=400, detail="포인트가 부족합니다.")
    except Exception as e:
        print(f"포인트 차감 중 오류: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/manual-add-points")
async def manual_add_points(user_id: str, amount: int, db: Session = Depends(get_db)):
    """관리자용 수동 포인트 충전 엔드포인트"""
    try:
        print(f"수동 포인트 충전 요청: user_id={user_id}, amount={amount}")
        await payment_service.add_user_points(db, user_id, amount)
        
        # 업데이트된 사용자 정보 조회
        from schema.user import User
        user = db.query(User).filter(User.id == user_id).first()
        
        return {
            "success": True,
            "message": f"포인트 충전 완료: {amount}원",
            "user_id": user_id,
            "current_points": user.remaining_points if user else 0
        }
    except Exception as e:
        print(f"수동 포인트 충전 실패: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@router.get("/admin/check-payment/{order_id}")
async def check_payment_status(order_id: str, db: Session = Depends(get_db)):
    """결제 상태 확인 및 수동 처리 엔드포인트"""
    try:
        from schema.payment_db import PaymentOrderORM
        from schema.user import User
        
        # 주문 정보 조회
        order = db.query(PaymentOrderORM).filter(PaymentOrderORM.order_id == order_id).first()
        if not order:
            return {"error": "주문을 찾을 수 없습니다", "order_id": order_id}
        
        # 사용자 정보 조회
        user = db.query(User).filter(User.id == order.user_id).first()
        
        # 결제가 성공했지만 포인트가 충전되지 않은 경우 수동 처리
        if order.status == "DONE" and user and user.remaining_points is None:
            print(f"결제 성공했지만 포인트가 None인 경우 수동 처리: {order_id}")
            user.remaining_points = order.amount
            db.commit()
            return {
                "message": "포인트 수동 충전 완료",
                "order_id": order_id,
                "amount": order.amount,
                "user_id": order.user_id,
                "current_points": user.remaining_points
            }
        
        return {
            "order_id": order_id,
            "order_status": order.status,
            "order_amount": order.amount,
            "user_id": order.user_id,
            "user_points": user.remaining_points if user else None,
            "payment_key": order.payment_key,
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "approved_at": order.approved_at.isoformat() if order.approved_at else None
        }
    except Exception as e:
        return {"error": str(e)}

@router.post("/admin/recover-failed-payment/{order_id}")
async def recover_failed_payment(order_id: str, db: Session = Depends(get_db)):
    """실패한 결제를 복구하는 관리자 엔드포인트"""
    try:
        from schema.payment_db import PaymentOrderORM
        
        # 주문 정보 조회
        order = db.query(PaymentOrderORM).filter(PaymentOrderORM.order_id == order_id).first()
        if not order:
            return {"error": "주문을 찾을 수 없습니다", "order_id": order_id}
        
        if order.status != "FAILED":
            return {"error": "이 주문은 실패 상태가 아닙니다", "status": order.status}
        
        print(f"실패한 결제 복구 시작: {order_id}")
        
        # 포인트 충전 시도
        await payment_service.add_user_points(db, order.user_id, order.amount)
        
        # 주문 상태를 DONE으로 변경
        order.status = "DONE"
        db.commit()
        
        return {
            "success": True,
            "message": f"결제 복구 완료: {order.amount}원",
            "order_id": order_id,
            "user_id": order.user_id,
            "amount": order.amount
        }
    except Exception as e:
        print(f"결제 복구 실패: {str(e)}")
        return {
            "success": False,
            "error": str(e)
        }

@router.get("/admin/list-failed-payments")
async def list_failed_payments(db: Session = Depends(get_db)):
    """실패한 결제 목록을 조회하는 관리자 엔드포인트"""
    try:
        from schema.payment_db import PaymentOrderORM
        
        failed_orders = db.query(PaymentOrderORM).filter(PaymentOrderORM.status == "FAILED").all()
        
        return {
            "failed_orders": [
                {
                    "order_id": order.order_id,
                    "user_id": order.user_id,
                    "amount": order.amount,
                    "order_name": order.order_name,
                    "created_at": order.created_at.isoformat() if order.created_at else None,
                    "payment_key": order.payment_key
                }
                for order in failed_orders
            ]
        }
    except Exception as e:
        return {"error": str(e)}
