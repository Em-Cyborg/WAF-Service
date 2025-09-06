// src/utils/api.ts
const API_BASE = 'http://frontend.domaintesting.org:8000';

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  status: number;
}

export const apiRequest = async <T = any>(
  endpoint: string, 
  options: RequestInit = {}
): Promise<ApiResponse<T>> => {
  const sessionId = localStorage.getItem('session_id');
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(sessionId && { 'Authorization': `Bearer ${sessionId}` }),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    // 401 응답 시 자동 로그아웃
    if (response.status === 401) {
      // localStorage에서 세션 제거
      localStorage.removeItem('session_id');
      
      // 페이지 새로고침하여 로그인 상태 초기화
      window.location.reload();
      
      throw new Error('Unauthorized - 세션이 만료되었습니다');
    }

    const data = await response.json();

    return {
      data,
      status: response.status,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다',
      status: 500,
    };
  }
};

// GET 요청
export const apiGet = <T = any>(endpoint: string): Promise<ApiResponse<T>> => {
  return apiRequest<T>(endpoint, { method: 'GET' });
};

// POST 요청
export const apiPost = <T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> => {
  return apiRequest<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
};

// PUT 요청
export const apiPut = <T = any>(endpoint: string, body?: any): Promise<ApiResponse<T>> => {
  return apiRequest<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
};

// DELETE 요청
export const apiDelete = <T = any>(endpoint: string): Promise<ApiResponse<T>> => {
  return apiRequest<T>(endpoint, { method: 'DELETE' });
};
