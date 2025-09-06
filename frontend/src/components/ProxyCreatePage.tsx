import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getUserBalance, deductPoints, calculateProxyCost } from '../utils/paymentService';
import { createProxy, type ProxyCreateRequest } from '../utils/proxyService';
import { useAuth } from '../contexts/AuthContext';

interface ProxyFormData {
  subdomain: string;
  targetUrl: string;
  useWAF: boolean;
}

const ProxyCreatePage: React.FC = () => {
  const { registerLogoutCallback, unregisterLogoutCallback } = useAuth();
  const [formData, setFormData] = useState<ProxyFormData>({
    subdomain: '',
    targetUrl: '',
    useWAF: false,
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Partial<ProxyFormData>>({});
  const [currentBalance, setCurrentBalance] = useState<number>(0);
  const [balanceLoading, setBalanceLoading] = useState<boolean>(true);

  // 현재 생성 비용 계산
  const currentCost = calculateProxyCost(formData.useWAF);
  
  // 포인트 부족 여부 확인
  const isInsufficientBalance = currentBalance < currentCost;

  // 로그아웃 시 상태 초기화 함수
  const resetState = useCallback(() => {
    setFormData({
      subdomain: '',
      targetUrl: '',
      useWAF: false,
    });
    setIsLoading(false);
    setErrors({});
    setCurrentBalance(0);
    setBalanceLoading(false);
    console.log('ProxyCreatePage 상태 초기화 완료');
  }, []);

  useEffect(() => {
    loadUserBalance();
    
    // 로그아웃 콜백 등록
    registerLogoutCallback(resetState);
    
    // 컴포넌트 언마운트 시 콜백 해제
    return () => {
      unregisterLogoutCallback(resetState);
    };
  }, [registerLogoutCallback, unregisterLogoutCallback, resetState]);

  const loadUserBalance = async () => {
    try {
      setBalanceLoading(true);
      const balance = await getUserBalance();
      setCurrentBalance(balance);
    } catch (error) {
      console.error('잔액 조회 실패:', error);
      setCurrentBalance(0);
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // 에러 메시지 초기화
    if (errors[name as keyof ProxyFormData]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<ProxyFormData> = {};

    if (!formData.subdomain.trim()) {
      newErrors.subdomain = '서브도메인을 입력해주세요.';
    } else if (!/^[a-z0-9-]+$/.test(formData.subdomain)) {
      newErrors.subdomain = '서브도메인은 영문 소문자, 숫자, 하이픈만 사용 가능합니다.';
    }

    if (!formData.targetUrl.trim()) {
      newErrors.targetUrl = '프록시 대상 도메인을 입력해주세요.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    // 포인트 부족 체크
    if (isInsufficientBalance) {
      alert(`포인트가 부족합니다. ${currentCost.toLocaleString()}P가 필요하지만 ${currentBalance.toLocaleString()}P만 보유하고 있습니다.`);
      return;
    }

    setIsLoading(true);
    
    try {
      // 1. 프록시 생성 API 호출
      const proxyRequest: ProxyCreateRequest = {
        subdomain: formData.subdomain,
        target: formData.targetUrl,
        waf: formData.useWAF ? "on" : "off"
      };
      
      await createProxy(proxyRequest);
      
      // 2. 성공 메시지 표시
      alert(`프록시가 성공적으로 생성되었습니다!\n도메인: ${formData.subdomain}.yourdomain.com\n차감된 포인트: ${currentCost.toLocaleString()}P`);
      
      // 3. 포인트 차감
      await deductPoints(currentCost);
      
      // 4. 잔액 새로고침
      await loadUserBalance();
      
      // 5. 폼 초기화
      setFormData({
        subdomain: '',
        targetUrl: '',
        useWAF: false,
      });
      
    } catch (error) {
      console.error('프록시 생성 실패:', error);
      if (error instanceof Error) {
        // 도메인 중복 에러인 경우 특별한 메시지 표시
        if (error.message.includes('이미 존재합니다')) {
          alert(`❌ 도메인 중복 오류\n\n${error.message}`);
        } else {
          alert(`프록시 생성에 실패했습니다: ${error.message}`);
        }
      } else {
        alert('프록시 생성에 실패했습니다. 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-md mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
          <h1 className="text-2xl font-bold text-center">프록시 생성</h1>
          <p className="text-blue-100 text-center mt-2">새로운 프록시 서버를 생성합니다</p>
        </div>

        {/* 포인트 잔액 표시 */}
        <div className="bg-gray-50 p-4 border-b">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">현재 포인트 잔액</p>
              {balanceLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-lg font-bold text-gray-400">로딩 중...</span>
                </div>
              ) : (
                <p className="text-2xl font-bold text-gray-800">
                  {currentBalance.toLocaleString()}P
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">생성 비용</p>
              <p className={`text-2xl font-bold ${isInsufficientBalance ? 'text-red-600' : 'text-blue-600'}`}>
                {currentCost.toLocaleString()}P
              </p>
              <p className="text-xs text-gray-500">
                {formData.useWAF ? 'WAF 포함' : '기본 프록시'}
              </p>
            </div>
          </div>
          
          {/* 포인트 부족 경고 */}
          {isInsufficientBalance && !balanceLoading && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-red-700 text-sm font-medium">
                  ⚠️ 포인트가 부족합니다. {(currentCost - currentBalance).toLocaleString()}P가 더 필요합니다.
                </p>
                <Link 
                  to="/" 
                  className="text-blue-600 text-sm font-medium hover:text-blue-800 underline"
                >
                  충전하기
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* 폼 */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 서브도메인 입력 */}
            <div>
              <label htmlFor="subdomain" className="block text-sm font-medium text-gray-700 mb-2">
                서브도메인 이름
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="subdomain"
                  name="subdomain"
                  value={formData.subdomain}
                  onChange={handleInputChange}
                  placeholder="example"
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                    errors.subdomain ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
                <div className="absolute right-3 top-3 text-gray-400 text-sm">
                  .yourdomain.com
                </div>
              </div>
              {errors.subdomain && (
                <p className="text-red-500 text-sm mt-1">{errors.subdomain}</p>
              )}
            </div>

            {/* 프록시 대상 URL */}
            <div>
              <label htmlFor="targetUrl" className="block text-sm font-medium text-gray-700 mb-2">
                프록시 대상 도메인
              </label>
              <input
                type="text"
                id="targetUrl"
                name="targetUrl"
                value={formData.targetUrl}
                onChange={handleInputChange}
                placeholder="example.com"
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                  errors.targetUrl ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.targetUrl && (
                <p className="text-red-500 text-sm mt-1">{errors.targetUrl}</p>
              )}
            </div>

            {/* WAF 사용 여부 */}
            <div>
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="useWAF"
                  checked={formData.useWAF}
                  onChange={handleInputChange}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-700">WAF (웹 애플리케이션 방화벽) 사용</span>
                  <p className="text-xs text-gray-500 mt-1">
                    보안 강화를 위해 웹 애플리케이션 방화벽을 활성화합니다
                  </p>
                </div>
              </label>
            </div>

                         {/* 설정 요약 */}
             {(formData.subdomain || formData.targetUrl) && (
               <div className="bg-gray-50 p-4 rounded-lg">
                 <h3 className="text-sm font-medium text-gray-700 mb-2">설정 요약</h3>
                 <div className="space-y-1 text-sm text-gray-600">
                   {formData.subdomain && (
                     <p>도메인: <span className="font-mono">{formData.subdomain}.yourdomain.com</span></p>
                   )}
                   {formData.targetUrl && (
                     <p>대상: <span className="font-mono">{formData.targetUrl}</span></p>
                   )}
                   <p>WAF: <span className={formData.useWAF ? 'text-green-600' : 'text-gray-400'}>
                     {formData.useWAF ? '활성화' : '비활성화'}
                   </span></p>
                   <div className="border-t pt-2 mt-2">
                     <p className="font-medium">예상 비용: <span className={`font-bold ${isInsufficientBalance ? 'text-red-600' : 'text-blue-600'}`}>
                       {currentCost.toLocaleString()}P
                     </span></p>
                     {!balanceLoading && (
                       <p className="text-xs">
                         생성 후 잔액: <span className={`font-medium ${(currentBalance - currentCost) < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                           {Math.max(0, currentBalance - currentCost).toLocaleString()}P
                         </span>
                       </p>
                     )}
                   </div>
                 </div>
               </div>
             )}

            {/* 제출 버튼 */}
            <button
              type="submit"
              disabled={isLoading || isInsufficientBalance || balanceLoading}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                isLoading || isInsufficientBalance || balanceLoading
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>생성 중...</span>
                </div>
              ) : balanceLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>잔액 확인 중...</span>
                </div>
              ) : isInsufficientBalance ? (
                `포인트 부족 (${(currentCost - currentBalance).toLocaleString()}P 필요)`
              ) : (
                `프록시 생성 (${currentCost.toLocaleString()}P 차감)`
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProxyCreatePage;
