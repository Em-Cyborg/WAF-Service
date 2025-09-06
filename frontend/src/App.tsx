// src/App.tsx
import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { Navigation } from './components/Navigation';
import MainPage from './components/MainPage';
import DomainManagePage from './components/DomainManagePage';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PaymentPage from './components/PaymentPage';
import ProxyCreatePage from './components/ProxyCreatePage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  const googleClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined;

  if (!googleClientId) {
    console.error('[Google OAuth] VITE_GOOGLE_CLIENT_ID 환경변수가 설정되지 않았습니다.');
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId ?? ''}>
      <AuthProvider>
        <BrowserRouter>
          <div className="App">
            <Navigation />
            <Routes>
              {/* 메인 페이지 - 로그인하지 않은 사용자용 */}
              <Route path="/" element={<MainPage />} />
              
              {/* 보호된 라우트들 - 로그인한 사용자만 접근 가능 */}
              <Route path="/domains" element={
                <ProtectedRoute>
                  <DomainManagePage />
                </ProtectedRoute>
              } />
              <Route path="/charge" element={
                <ProtectedRoute>
                  <PaymentPage />
                </ProtectedRoute>
              } />
              <Route path="/proxy/create" element={
                <ProtectedRoute>
                  <ProxyCreatePage />
                </ProtectedRoute>
              } />
              
              {/* 404 페이지 - 메인 페이지로 리다이렉트 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;