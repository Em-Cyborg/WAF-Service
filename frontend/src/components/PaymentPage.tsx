import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import BalanceSection from './BalanceSection';
import ChargeSection from './ChargeSection';
import PaymentSection from './PaymentSection';
import { loadTossPayments } from '../utils/tossPayments';
import { getUserBalance } from '../utils/paymentService';
import { useAuth } from '../contexts/AuthContext';

const PaymentPage: React.FC = () => {
  const { registerLogoutCallback, unregisterLogoutCallback } = useAuth();
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [chargeAmount, setChargeAmount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const location = useLocation();

  // 로그아웃 시 상태 초기화 함수
  const resetState = useCallback(() => {
    setCurrentBalance(0);
    setChargeAmount(0);
    setIsLoading(false);
    console.log('PaymentPage 상태 초기화 완료');
  }, []);

  useEffect(() => {
    // 백엔드에서 잔액 조회
    loadUserBalance();

    // Toss Payments SDK 로드
    loadTossPayments();
    
    // 로그아웃 콜백 등록
    registerLogoutCallback(resetState);
    
    // 컴포넌트 언마운트 시 콜백 해제
    return () => {
      unregisterLogoutCallback(resetState);
    };
  }, [registerLogoutCallback, unregisterLogoutCallback, resetState]); // 빈 의존성 배열로 변경

  useEffect(() => {
    // URL 파라미터 정리 (결제 완료 후 URL 정리용)
    if (location.search) {
      cleanupURLParams();
    }
  }, [location.search]); // location.search만 의존성으로 사용

  const loadUserBalance = async () => {
    try {
      const balance = await getUserBalance();
      setCurrentBalance(balance);
    } catch (error) {
      console.error('잔액 조회 실패:', error);
      // 오류 시 기본값 0으로 설정
      setCurrentBalance(0);
    }
  };

  const cleanupURLParams = () => {
    // URL에 쿼리 파라미터가 있으면 정리 (결제 완료 후 리다이렉트된 경우)
    window.history.replaceState({}, '', '/');
    // 잔액 새로고침 (결제 완료 후일 가능성이 높으므로)
    setTimeout(() => loadUserBalance(), 100);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        <BalanceSection balance={currentBalance} />
        <div className="p-6 space-y-6">
          <ChargeSection 
            chargeAmount={chargeAmount}
            setChargeAmount={setChargeAmount}
          />
          <PaymentSection 
            chargeAmount={chargeAmount}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
          />
        </div>
      </div>
    </div>
  );
};

export default PaymentPage;

