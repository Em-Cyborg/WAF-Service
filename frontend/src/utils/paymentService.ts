import apiClient from './axiosConfig';

export interface PaymentPrepareRequest {
  amount: number;
  orderName: string;
}

export interface PaymentPrepareResponse {
  orderId: string;
  orderName: string;
  clientKey: string;
}

export interface PaymentConfirmRequest {
  paymentKey: string;
  orderId: string;
  amount: number;
}

// 결제 준비 API 호출
export const preparePayment = async (amount: number): Promise<PaymentPrepareResponse> => {
  try {
    const response = await apiClient.post('/api/payments/payment/prepare', {
      amount,
      orderName: `포인트 ${amount.toLocaleString()}P 충전`
    });
    return response.data;
  } catch (error) {
    throw new Error('결제 준비 중 오류가 발생했습니다.');
  }
};

// 결제 승인은 백엔드 /success 엔드포인트에서 자동으로 처리됨

// 사용자 잔액 조회
export const getUserBalance = async (): Promise<number> => {
  try {
    const response = await apiClient.get('/api/payments/user/balance');
    return response.data.balance;
  } catch (error) {
    console.error('잔액 조회 오류:', error);
    throw new Error('잔액을 조회하는 중 오류가 발생했습니다.');
  }
};

// 포인트 차감
export const deductPoints = async (amount: number): Promise<void> => {
  try {
    await apiClient.post('/api/payments/user/deduct-points', {
      amount
    });
  } catch (error) {
    console.error('포인트 차감 오류:', error);
    throw new Error('포인트 차감 중 오류가 발생했습니다.');
  }
};

// 프록시 생성 비용 계산
export const calculateProxyCost = (useWAF: boolean): number => {
  const BASE_COST = 3000; // 기본 프록시 비용
  const WAF_COST = 5000;  // WAF 사용 시 비용
  
  return useWAF ? WAF_COST : BASE_COST;
};

// 결제 프로세스 시작
export const initiatePayment = async (amount: number) => {
  try {
    // 1. 결제 준비
    const paymentData = await preparePayment(amount);
    
    // 2. Toss Payments SDK 확인
    if (!window.TossPayments) {
      throw new Error('Toss Payments SDK가 로드되지 않았습니다.');
    }

    // 3. Toss Payments 초기화
    const tossPayments = window.TossPayments(paymentData.clientKey);
    const payment = tossPayments.payment({ customerKey: 'ANONYMOUS' });

    // 4. 결제창 호출
    await payment.requestPayment({
      method: "CARD",
      amount: {
        currency: "KRW",
        value: amount,
      },
      orderId: paymentData.orderId,
      orderName: paymentData.orderName,
      successUrl: `http://frontend.domaintesting.org:8000/api/payments/success`,
      failUrl: `http://frontend.domaintesting.org:8000/api/payments/fail`,
      customerEmail: "customer123@gmail.com",
      customerName: "김토스",
      customerMobilePhone: "01012341234",
      card: {
        useEscrow: false,
        flowMode: "DEFAULT",
        useCardPoint: false,
        useAppCardOnly: false,
      },
    });

  } catch (error) {
    console.error('결제 오류:', error);
    throw error;
  }
};
