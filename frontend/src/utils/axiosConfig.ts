import axios from 'axios';

// axios 인스턴스 생성
const apiClient = axios.create({
  baseURL: 'http://frontend.domaintesting.org:8000',
  timeout: 10000,
});

// 요청 인터셉터: 세션 ID를 자동으로 헤더에 추가
apiClient.interceptors.request.use(
  (config) => {
    const sessionId = localStorage.getItem('session_id');
    if (sessionId) {
      config.headers.Authorization = `Bearer ${sessionId}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 응답 인터셉터: 401 에러 시 자동 로그아웃
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 세션 ID 제거
      localStorage.removeItem('session_id');
      
      // 페이지 새로고침하여 로그인 상태 초기화
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
