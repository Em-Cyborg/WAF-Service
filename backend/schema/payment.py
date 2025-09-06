from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class PaymentPrepareRequest(BaseModel):
    amount: int
    orderName: str

class PaymentPrepareResponse(BaseModel):
    orderId: str
    orderName: str
    clientKey: str

class PaymentOrder(BaseModel):
    orderId: str
    amount: int
    orderName: str
    status: str
    createdAt: str
    paymentKey: Optional[str] = None
    approvedAt: Optional[str] = None

class UserBalance(BaseModel):
    balance: int = 0  # 기본값 0으로 설정

class DeductPointsRequest(BaseModel):
    amount: int
