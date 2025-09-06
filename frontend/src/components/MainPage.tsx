import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GoogleLoginPage } from './GoogleLoginPage';
import { Link } from 'react-router-dom';

const MainPage: React.FC = () => {
  const { isAuthenticated, login } = useAuth();

  if (isAuthenticated) {
    // 이미 로그인된 사용자는 도메인 관리 페이지로 리다이렉트
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="text-6xl mb-6">🎉</div>
            <h1 className="text-3xl font-bold text-gray-800 mb-4">이미 로그인되어 있습니다!</h1>
            <p className="text-gray-600 mb-6">도메인 관리 페이지로 이동하여 서비스를 이용하세요.</p>
            <Link
              to="/domains"
              className="inline-block bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-3 rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              도메인 관리으로 이동
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">

      {/* 메인 콘텐츠 */}
      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* 히어로 섹션 */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-800 mb-6">
            웹 보안의 새로운 기준
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            WAF Management로 웹 애플리케이션을 안전하게 보호하고, 
            실시간 모니터링으로 트래픽을 효율적으로 관리하세요.
          </p>
          <div className="flex justify-center space-x-4">
            <GoogleLoginPage onLoginSuccess={(userData, sessionId) => login(userData, sessionId)} />
          </div>
        </div>
      </div>
      {/* 푸터 */}
      <div className="bg-gray-800 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-gray-400">
            © 2024 WAF Management. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
};

export default MainPage;
