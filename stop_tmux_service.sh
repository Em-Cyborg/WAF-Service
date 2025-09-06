#!/bin/bash

# systemd에서 호출되는 tmux 서비스 중지 스크립트

# 세션 정보 읽기
if [ -f "/waf_service/logs/tmux-session.txt" ]; then
    SESSION_NAME=$(cat /waf_service/logs/tmux-session.txt)
    
    # tmux 세션 종료
    tmux kill-session -t $SESSION_NAME 2>/dev/null
    
    # 세션 정보 파일 삭제
    rm -f /waf_service/logs/tmux-session.txt
    
    echo "tmux 서비스가 중지되었습니다."
else
    echo "tmux 세션 정보를 찾을 수 없습니다."
fi
