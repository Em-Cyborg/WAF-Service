import apiClient from './axiosConfig';

export interface ProxyCreateRequest {
  subdomain: string;
  target: string;
  waf: string; // "yes" | "no"
}

export interface ProxyCreateResponse {
  message: string;
  cloudflare_status: string;
  cloudflare_result?: any;
  waf_status: {
    status: string;
    message: string;
  };
}

export interface DomainBillingSummary {
  domain: string;
  traffic_gb: number;
  points: number;
  amount_krw: number;
  days_until_billing: number;
}

export interface DomainInfo {
  domain: string;
  log_count: number;
  created_at?: string;
  target?: string;
  payment_due_date?: string;
  waf?: string;
  billing_info?: DomainBillingSummary;
}

export interface TrafficSummary {
  requests: number;
  bytes: number;
  mb: number;
}

export interface DomainTrafficStats {
  domain: string;
  today: TrafficSummary;
  last_hour: TrafficSummary;
  week?: TrafficSummary;
  month?: TrafficSummary;
}

// 프록시 생성
export const createProxy = async (request: ProxyCreateRequest): Promise<ProxyCreateResponse> => {
  try {
    const response = await apiClient.post('/api/waf/register', request);
    return response.data;
  } catch (error: any) {
    if (error.response) {
      throw new Error(error.response.data.detail || '프록시 생성에 실패했습니다.');
    }
    throw new Error('프록시 생성 중 오류가 발생했습니다.');
  }
};

// 도메인 목록 조회
export const getDomains = async (): Promise<DomainInfo[]> => {
  try {
    const response = await apiClient.get('/api/monitoring/domains');
    return response.data;
  } catch (error: any) {
    console.error('도메인 목록 조회 실패:', error);
    throw new Error('도메인 목록을 조회하는 중 오류가 발생했습니다.');
  }
};

// 도메인별 로그 조회
export const getDomainLogs = async (domain: string, count: number = 20) => {
  try {
    const response = await apiClient.get(`/api/monitoring/logs/${domain}?n=${count}`);
    return response.data;
  } catch (error: any) {
    console.error('도메인 로그 조회 실패:', error);
    throw new Error('도메인 로그를 조회하는 중 오류가 발생했습니다.');
  }
};

// 도메인별 트래픽 통계 조회
export const getDomainTraffic = async (
  domain: string, 
  interval: string = 'day', 
  period: number = 7
) => {
  try {
    const response = await apiClient.get(
      `/api/monitoring/traffic/${domain}?interval=${interval}&period=${period}`
    );
    return response.data;
  } catch (error: any) {
    console.error('도메인 트래픽 조회 실패:', error);
    throw new Error('도메인 트래픽을 조회하는 중 오류가 발생했습니다.');
  }
};

// 전체 트래픽 요약 조회
export const getTrafficSummary = async (): Promise<DomainTrafficStats[]> => {
  try {
    const response = await apiClient.get('/api/monitoring/traffic/summary');
    return response.data;
  } catch (error: any) {
    console.error('트래픽 요약 조회 실패:', error);
    throw new Error('트래픽 요약을 조회하는 중 오류가 발생했습니다.');
  }
};

// 도메인별 결제 예정 금액 요약 조회
export const getBillingSummary = async (): Promise<DomainBillingSummary[]> => {
  try {
    const response = await apiClient.get('/api/monitoring/billing/summary');
    return response.data;
  } catch (error: any) {
    console.error('결제 예정 금액 요약 조회 실패:', error);
    throw new Error('결제 예정 금액을 조회하는 중 오류가 발생했습니다.');
  }
};

// 특정 도메인의 결제 예정 상세 정보 조회
export const getDomainBillingInfo = async (domain: string) => {
  try {
    const response = await apiClient.get(`/api/monitoring/billing/${encodeURIComponent(domain)}`);
    return response.data;
  } catch (error: any) {
    console.error('도메인 결제 예정 상세 정보 조회 실패:', error);
    throw new Error('도메인 결제 예정 상세 정보를 조회하는 중 오류가 발생했습니다.');
  }
};

// 도메인 삭제 (프록시 해제)
export const deleteDomain = async (domain: string): Promise<void> => {
  try {
    const subdomain = domain.split('.')[0];
    await apiClient.post('/api/waf/unregister', { subdomain });
  } catch (error: any) {
    if (error.response) {
      throw new Error(error.response.data.detail || '도메인 삭제에 실패했습니다.');
    }
    throw new Error('도메인 삭제 중 오류가 발생했습니다.');
  }
};
