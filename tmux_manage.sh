#!/bin/bash

# tmux 세션 관리 스크립트

case "$1" in
    "attach")
        echo "tmux 세션에 연결 중..."
        tmux attach -t waf-services
        ;;
    "status")
        echo "tmux 세션 상태 확인 중..."
        tmux list-sessions 2>/dev/null | grep waf-services
        if [ $? -eq 0 ]; then
            echo "✅ waf-services 세션이 실행 중입니다."
            echo ""
            echo "윈도우 목록:"
            tmux list-windows -t waf-services
        else
            echo "❌ waf-services 세션이 실행되지 않았습니다."
        fi
        ;;
    "logs")
        echo "실시간 로그 확인 중..."
        echo "백엔드 로그:"
        tmux capture-pane -t waf-services:backend -p
        echo ""
        echo "프론트엔드 로그:"
        tmux capture-pane -t waf-services:frontend -p
        ;;
    "backend")
        echo "백엔드 윈도우로 이동..."
        tmux attach -t waf-services:backend
        ;;
    "frontend")
        echo "프론트엔드 윈도우로 이동..."
        tmux attach -t waf-services:frontend
        ;;
    "help")
        echo "tmux 세션 관리 도구"
        echo ""
        echo "사용법: $0 [명령어]"
        echo ""
        echo "명령어:"
        echo "  attach    - tmux 세션에 연결"
        echo "  status    - 세션 상태 확인"
        echo "  logs      - 로그 확인"
        echo "  backend   - 백엔드 윈도우로 직접 이동"
        echo "  frontend  - 프론트엔드 윈도우로 직접 이동"
        echo "  help      - 이 도움말 표시"
        ;;
    *)
        echo "사용법: $0 [attach|status|logs|backend|frontend|help]"
        echo "자세한 도움말: $0 help"
        ;;
esac
