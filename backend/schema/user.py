from sqlalchemy import Column, ForeignKey, String, DateTime, Text, Boolean, Integer
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True)
    email = Column(String(255), unique=True, index=True)
    name = Column(String(255))
    picture = Column(Text)
    google_id = Column(String(64), unique=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now())
    last_login = Column(DateTime, default=datetime.now())
    remaining_points = Column(Integer, default=0, nullable=False)

class UserDomain(Base):
    __tablename__ = "user_domains"

    id = Column(String(36), primary_key=True)
    user_id = Column(String(36), ForeignKey("users.id"))
    domain = Column(String(255))
    target = Column(String(255))
    waf = Column(String(64))
    created_at = Column(DateTime, default=datetime.now())
    billing_date = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)


