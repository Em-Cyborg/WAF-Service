// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

interface AuthContextType {
  user: User | null;
  login: (userData: User, sessionId: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
  registerLogoutCallback: (callback: () => void) => void;
  unregisterLogoutCallback: (callback: () => void) => void;
  validateSession: () => Promise<boolean>;
  refreshSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [logoutCallbacks, setLogoutCallbacks] = useState<Set<() => void>>(new Set());

  const apiBase = 'http://localhost:8000';

  // 세션 유효성 검증 함수
  const validateSession = useCallback(async (): Promise<boolean> => {
    const currentSessionId = localStorage.getItem('session_id');
    
    if (!currentSessionId) {
      return false;
    }

    try {
      const response = await fetch(`${apiBase}/api/auth/validate`, {
        headers: {
          'Authorization': `Bearer ${currentSessionId}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.valid) {
          setUser(data.user);
          setSessionId(currentSessionId);
          return true;
        } else {
          // 세션이 유효하지 않음
          logout();
          return false;
        }
      } else {
        // 세션이 유효하지 않음
        logout();
        return false;
      }
    } catch (error) {
      console.error('세션 검증 실패:', error);
      logout();
      return false;
    }
  }, []);

  // 세션 갱신 함수
  const refreshSession = useCallback(async (): Promise<boolean> => {
    const currentSessionId = localStorage.getItem('session_id');
    
    if (!currentSessionId) {
      return false;
    }

    try {
      const response = await fetch(`${apiBase}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSessionId}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const newSessionId = data.session_id;
        
        // 새로운 세션 ID로 업데이트
        localStorage.setItem('session_id', newSessionId);
        setSessionId(newSessionId);
        
        console.log('세션이 갱신되었습니다.');
        return true;
      } else {
        console.error('세션 갱신 실패');
        return false;
      }
    } catch (error) {
      console.error('세션 갱신 중 오류:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    // 페이지 로드 시 세션 검증
    validateSession();
    
    // 주기적으로 세션 검증 (5분마다)
    const interval = setInterval(validateSession, 5 * 60 * 1000);
    
    // 세션 갱신 시도 (10분마다)
    const refreshInterval = setInterval(refreshSession, 10 * 60 * 1000);
    
    return () => {
      clearInterval(interval);
      clearInterval(refreshInterval);
    };
  }, [validateSession, refreshSession]);

  const registerLogoutCallback = useCallback((callback: () => void) => {
    setLogoutCallbacks(prev => new Set(prev).add(callback));
  }, []);

  const unregisterLogoutCallback = useCallback((callback: () => void) => {
    setLogoutCallbacks(prev => {
      const newSet = new Set(prev);
      newSet.delete(callback);
      return newSet;
    });
  }, []);

  const login = (userData: User, newSessionId: string) => {
    setUser(userData);
    setSessionId(newSessionId);
    localStorage.setItem('session_id', newSessionId);
  };

  const logout = useCallback(async () => {
    // 서버에 로그아웃 요청
    if (sessionId) {
      try {
        await fetch(`${apiBase}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${sessionId}`
          }
        });
      } catch (error) {
        console.error('서버 로그아웃 실패:', error);
      }
    }

    // 모든 등록된 로그아웃 콜백 실행
    logoutCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('로그아웃 콜백 실행 중 오류:', error);
      }
    });

    // 상태 초기화
    setUser(null);
    setSessionId(null);
    localStorage.removeItem('session_id');
    sessionStorage.clear();
    
    console.log('로그아웃 완료: 모든 상태가 초기화되었습니다.');
  }, [logoutCallbacks, sessionId]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      login, 
      logout, 
      isAuthenticated: !!user,
      registerLogoutCallback,
      unregisterLogoutCallback,
      validateSession,
      refreshSession
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};