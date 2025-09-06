// Toss Payments SDK 타입 정의
declare global {
  interface Window {
    TossPayments: any;
    sdkLoadStatus?: {
      v2Standard: boolean;
      v2: boolean;
      v1: boolean;
    };
    sdkLoadFailed?: boolean;
  }
}

// SDK 로드 함수들
const loadSDKV2Standard = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.tosspayments.com/v2/standard';
    script.onload = () => {
      if (window.sdkLoadStatus) {
        window.sdkLoadStatus.v2Standard = true;
      }
      console.log('✅ Toss Payments SDK v2/standard 로드 성공');
      resolve();
    };
    script.onerror = () => {
      console.warn('❌ Toss Payments SDK v2/standard 로드 실패');
      reject();
    };
    document.head.appendChild(script);
  });
};

const loadSDKV2 = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.tosspayments.com/v2';
    script.onload = () => {
      if (window.sdkLoadStatus) {
        window.sdkLoadStatus.v2 = true;
      }
      console.log('✅ Toss Payments SDK v2 로드 성공');
      resolve();
    };
    script.onerror = () => {
      console.warn('❌ Toss Payments SDK v2 로드 실패');
      reject();
    };
    document.head.appendChild(script);
  });
};

const loadSDKV1 = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://js.tosspayments.com/v1';
    script.onload = () => {
      if (window.sdkLoadStatus) {
        window.sdkLoadStatus.v1 = true;
      }
      console.log('✅ Toss Payments SDK v1 로드 성공');
      resolve();
    };
    script.onerror = () => {
      console.warn('❌ Toss Payments SDK v1 로드 실패');
      reject();
    };
    document.head.appendChild(script);
  });
};

// SDK 순차적 로드 시도
export const loadTossPayments = async (): Promise<void> => {
  // SDK 로드 상태 초기화
  window.sdkLoadStatus = {
    v2Standard: false,
    v2: false,
    v1: false
  };

  try {
    await loadSDKV2Standard();
  } catch {
    try {
      await loadSDKV2();
    } catch {
      try {
        await loadSDKV1();
      } catch {
        console.error('❌ 모든 Toss Payments SDK 로드 실패');
        window.sdkLoadFailed = true;
        throw new Error('Toss Payments SDK를 로드할 수 없습니다.');
      }
    }
  }
};
