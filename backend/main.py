from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import os
from routers import payments, monitoring, auth, proxy_and_waf_automation
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), 'config', '.env'))

# 환경변수에서 직접 설정 로드
DEBUG = os.getenv("DEBUG")
HOST = os.getenv("HOST")
PORT = int(os.getenv("PORT"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS").split(",")

# FastAPI 앱 초기화
app = FastAPI(
    title="KST Project API", 
    version="1.0.0",
    description="토스 페이먼츠와 WAF 자동화 시스템"
)

# CORS 미들웨어 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 정적 파일 서빙 설정 - React 빌드 파일
app.mount("/assets", StaticFiles(directory="../frontend/dist/assets"), name="assets")
app.mount("/static", StaticFiles(directory="../frontend/dist"), name="static")

# 라우터 등록
app.include_router(payments.router, prefix="/api/payments", tags=["payments"])
app.include_router(proxy_and_waf_automation.router, prefix="/api/waf", tags=["waf"])
app.include_router(monitoring.router, prefix="/api/monitoring", tags=["monitoring"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])

@app.get("/", response_class=HTMLResponse)
async def read_root():
    """메인 페이지 반환 - React 앱"""
    try:
        with open("./frontend/dist/index.html", "r", encoding="utf-8") as f:
            content = f.read()
        return HTMLResponse(content=content)
    except FileNotFoundError:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="React 앱이 빌드되지 않았습니다. 'npm run build'를 실행해주세요.")

# React Router를 위한 catch-all 라우트
@app.get("/{full_path:path}", response_class=HTMLResponse)
async def catch_all(full_path: str):
    """React Router를 위한 모든 경로를 React 앱으로 리다이렉트"""
    from fastapi import HTTPException
    
    # API 경로는 제외
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API 엔드포인트를 찾을 수 없습니다.")
    
    try:
        with open("frontend/dist/index.html", "r", encoding="utf-8") as f:
            content = f.read()
        return HTMLResponse(content=content)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="React 앱이 빌드되지 않았습니다.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=DEBUG)
