# database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from schema import Base  # ORM Base
from schema import PaymentOrderORM  # noqa: F401 ensure model import
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), './config', '.env'))

DATABASE_URL = os.getenv("DATABASE_URL")
print(DATABASE_URL)
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 테이블 생성
Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()