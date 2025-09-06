// src/components/GoogleLogin.tsx
import React from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';

interface GoogleLoginProps {
  onLoginSuccess: (userData: any, sessionId: string) => void;
}

export const GoogleLoginPage: React.FC<GoogleLoginProps> = ({ onLoginSuccess }) => {
  const navigate = useNavigate();
  const apiBase = 'http://frontend.domaintesting.org:8000';

  const handleSuccess = async (credentialResponse: any) => {
    try {
      const response = await fetch(`${apiBase}/api/auth/google/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: credentialResponse.credential })
      });
      
      if (!response.ok) {
        throw new Error('Login failed');
      }
      
      const data = await response.json();
      
      // 세션 ID와 사용자 정보만 저장
      localStorage.setItem('session_id', data.session_id);
      
      // 로그인 성공 콜백 (세션 ID 포함)
      onLoginSuccess(data.user, data.session_id);
      
      // 로그인 성공 시 도메인 관리 페이지로 이동
      setTimeout(() => {
        navigate('/domains');
      }, 100);
    } catch (error) {
      console.error('Google 로그인 실패:', error);
      alert('로그인에 실패했습니다.');
    }
  };
  
  return (
    <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || ''}>
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => console.log('Login Failed')}
        theme="filled_blue"
        size="large"
        text="signin_with"
        shape="rectangular"
      />
    </GoogleOAuthProvider>
  );
};