#!/bin/bash

# systemd에서 호출되는 tmux 서비스 시작 스크립트

# 로그 디렉토리 생성
mkdir -p /waf_service/logs

# 기존 세션이 있으면 종료
tmux kill-session -t waf-services 2>/dev/null

# 새로운 tmux 세션 생성 (detached 모드)
tmux new-session -d -s waf-services

# 백엔드 실행을 위한 새 윈도우 생성
tmux new-window -t waf-services:1 -n backend
tmux send-keys -t waf-services:backend "cd /waf_service/backend" Enter
tmux send-keys -t waf-services:backend "source venv/bin/activate" Enter
tmux send-keys -t waf-services:backend "python main.py" Enter

# 프론트엔드 실행을 위한 새 윈도우 생성
tmux new-window -t waf-services:2 -n frontend
tmux send-keys -t waf-services:frontend "cd /waf_service/frontend" Enter
tmux send-keys -t waf-services:frontend "npm run dev" Enter

# 세션 정보를 파일에 저장
echo "waf-services" > /waf_service/logs/tmux-session.txt

echo "tmux 서비스가 시작되었습니다."
