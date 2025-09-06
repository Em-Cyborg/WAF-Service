#!/bin/bash

# tmux + systemd 서비스 설정 스크립트

echo "tmux + systemd 서비스 설정 중..."

# 서비스 파일을 systemd 디렉토리로 복사
sudo cp /waf_service/waf-tmux.service /etc/systemd/system/

# systemd 데몬 리로드
sudo systemctl daemon-reload

# 서비스 활성화
sudo systemctl enable waf-tmux.service

echo "tmux + systemd 서비스가 설정되었습니다."
echo ""
echo "사용법:"
echo "  서비스 시작: sudo systemctl start waf-tmux"
echo "  서비스 중지: sudo systemctl stop waf-tmux"
echo "  서비스 상태: sudo systemctl status waf-tmux"
echo "  서비스 재시작: sudo systemctl restart waf-tmux"
echo ""
echo "tmux 세션 관리:"
echo "  세션 연결: ./tmux_manage.sh attach"
echo "  상태 확인: ./tmux_manage.sh status"
echo "  로그 확인: ./tmux_manage.sh logs"
echo "  백엔드만: ./tmux_manage.sh backend"
echo "  프론트엔드만: ./tmux_manage.sh frontend"
echo ""
echo "systemd 로그 확인:"
echo "  sudo journalctl -u waf-tmux -f"
