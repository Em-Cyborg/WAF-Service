from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from datetime import datetime
from schema.user import Base


class PaymentOrderORM(Base):
    __tablename__ = "payment_orders"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    order_id = Column(String(64), unique=True, index=True, nullable=False)
    amount = Column(Integer, nullable=False)
    order_name = Column(String(255), nullable=False)
    status = Column(String(32), default="READY")
    payment_key = Column(String(128), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)


