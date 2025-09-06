// src/components/Navigation.tsx
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GoogleLoginPage } from './GoogleLoginPage';
import { Link } from 'react-router-dom';

export const Navigation: React.FC = () => {
  const { user, logout, isAuthenticated, login } = useAuth();

  return (
    <nav className="bg-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center py-4">
          <div className="text-xl font-bold text-gray-800">
            WAF Management
          </div>
          {isAuthenticated ? (
            <div className="hidden md:flex items-center space-x-6">
              <Link to="/domains" className="text-gray-700 hover:text-blue-600">도메인 관리</Link>
              <Link to="/proxy/create" className="text-gray-700 hover:text-blue-600">프록시 생성</Link>
              <Link to="/charge" className="text-gray-700 hover:text-blue-600">포인트 충전</Link>
            </div>
          ) : (
            <div className="hidden md:flex items-center space-x-6">
              <Link to="/" className="text-gray-700 hover:text-blue-600">홈</Link>
              <span className="text-gray-400">로그인하여 서비스 이용</span>
            </div>
          )}

          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <>
                <div className="flex items-center space-x-2">
                  {user?.picture && (
                    <img 
                      src={user.picture} 
                      alt={user.name} 
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <span className="text-gray-700">{user?.name}</span>
                </div>
                <button
                  onClick={logout}
                  className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <GoogleLoginPage onLoginSuccess={(userData, sessionId) => login(userData, sessionId)} />
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};