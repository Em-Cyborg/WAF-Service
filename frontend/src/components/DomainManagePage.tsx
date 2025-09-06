import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getDomains, getDomainLogs, getDomainTraffic, getTrafficSummary, getBillingSummary, type DomainInfo, type DomainTrafficStats } from '../utils/proxyService';
import { deleteDomain } from '../utils/proxyService';
import { useAuth } from '../contexts/AuthContext';

const DomainManagePage: React.FC = () => {
  const { registerLogoutCallback, unregisterLogoutCallback } = useAuth();
  const [domains, setDomains] = useState<DomainInfo[]>([]);
  const [trafficSummary, setTrafficSummary] = useState<DomainTrafficStats[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [domainLogs, setDomainLogs] = useState<any[]>([]);
  const [domainTraffic, setDomainTraffic] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [trafficLoading, setTrafficLoading] = useState<boolean>(false);
  const sseRef = useRef<EventSource | null>(null);
  // 실시간 그래프용 시계열 (최근 60포인트) - 도메인별로 독립 관리
  const [inboundSeries, setInboundSeries] = useState<number[]>([]);
  const [outboundSeries, setOutboundSeries] = useState<number[]>([]);
  // 누적 값이 오는 경우 증분 계산용 참조값 - 도메인별로 독립 관리
  const prevReqTotalRef = useRef<number>(0);
  const prevResTotalRef = useRef<number>(0);
  // 로그 기반 초당 집계를 위한 누적기와 타이머 - 도메인별로 독립 관리
  const accReqRef = useRef<number>(0);
  const accResRef = useRef<number>(0);
  const tickTimerRef = useRef<number | null>(null);
  // 현재 모니터링 중인 도메인 추적
  const currentMonitoringDomainRef = useRef<string>('');
  // 필터 상태
  const [filterMethod, setFilterMethod] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL'); // ALL/2xx/3xx/4xx/5xx
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [filterWAF, setFilterWAF] = useState<string>('ALL'); // ALL/checked/bypassed
  // 고급 필터 상태
  const [showAdvancedFilters, setShowAdvancedFilters] = useState<boolean>(false);
  const [filterIP, setFilterIP] = useState<string>('');
  const [filterResponseTime, setFilterResponseTime] = useState<string>('');
  const [filterResponseTimeRange, setFilterResponseTimeRange] = useState<[number, number]>([0, 10000]);
  const [filterTrafficSize, setFilterTrafficSize] = useState<string>('');
  const [filterTrafficSizeRange, setFilterTrafficSizeRange] = useState<[number, number]>([0, 1000000]);
  const [filterDateRange, setFilterDateRange] = useState<[string, string]>(['', '']);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  // 로그아웃 시 모든 상태 초기화 함수
  const resetAllState = useCallback(() => {
    setDomains([]);
    setTrafficSummary([]);
    setSelectedDomain('');
    setDomainLogs([]);
    setDomainTraffic(null);
    setIsLoading(false);
    setLogsLoading(false);
    setTrafficLoading(false);
    setInboundSeries([]);
    setOutboundSeries([]);
    setFilterMethod('ALL');
    setFilterStatus('ALL');
    setFilterSearch('');
    setFilterWAF('ALL');
    setShowAdvancedFilters(false);
    setFilterIP('');
    setFilterResponseTime('');
    setFilterResponseTimeRange([0, 10000]);
    setFilterTrafficSize('');
    setFilterTrafficSizeRange([0, 1000000]);
    setFilterDateRange(['', '']);
    setActiveFilters(new Set());
    
    // ref 초기화
    prevReqTotalRef.current = 0;
    prevResTotalRef.current = 0;
    accReqRef.current = 0;
    accResRef.current = 0;
    currentMonitoringDomainRef.current = '';
    
    // SSE 연결 해제
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
    
    // 타이머 정리
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    
  }, []);

  useEffect(() => {
    loadInitialData();
    
    // 로그아웃 콜백 등록
    registerLogoutCallback(resetAllState);
    
    // 컴포넌트 언마운트 시 콜백 해제
    return () => {
      unregisterLogoutCallback(resetAllState);
    };
  }, [registerLogoutCallback, unregisterLogoutCallback, resetAllState]);



  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      const [domainsData, trafficData, billingData] = await Promise.all([
        getDomains(),
        getTrafficSummary(),
        getBillingSummary()
      ]);
      
      // 도메인 데이터에 결제 정보 병합
      const domainsWithBilling = domainsData.map(domain => {
        const billingInfo = billingData.find(billing => billing.domain === domain.domain);
        return {
          ...domain,
          billing_info: billingInfo
        };
      });
      
      setDomains(domainsWithBilling);
      setTrafficSummary(trafficData);
    } catch (error) {
      console.error('초기 데이터 로드 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDomainDetails = async (domain: string) => {
    if (selectedDomain === domain) {
      // 이미 선택된 도메인이면 닫기
      setSelectedDomain('');
      setDomainLogs([]);
      setDomainTraffic(null);
      setInboundSeries([]);
      setOutboundSeries([]);
      // 현재 모니터링 도메인 초기화
      currentMonitoringDomainRef.current = '';
      return;
    }

    setSelectedDomain(domain);
    setTrafficLoading(true);

    try {
      // 도메인 변경 시 그래프 데이터 완전 초기화
      setInboundSeries(Array(60).fill(0));
      setOutboundSeries(Array(60).fill(0));
      
      // 누적값 완전 초기화
      accReqRef.current = 0;
      accResRef.current = 0;
      prevReqTotalRef.current = 0;
      prevResTotalRef.current = 0;
      
      
      // 여러 기간의 트래픽 데이터를 병렬로 조회
      const [logs, dayTraffic, weekTraffic, monthTraffic] = await Promise.all([
        getDomainLogs(domain, 50),
        getDomainTraffic(domain, 'day', 1),
        getDomainTraffic(domain, 'day', 7),
        getDomainTraffic(domain, 'day', 30)
      ]);

      setDomainLogs(logs);
      
      // 통합된 트래픽 데이터 생성
      const integratedTraffic = {
        ...dayTraffic,
        day_stats: {
          total_requests: dayTraffic.total_requests || 0,
          total_bytes: dayTraffic.total_bytes || 0,
          total_mb: dayTraffic.total_mb || 0
        },
        week_stats: weekTraffic,
        month_stats: monthTraffic
      };
      
      setDomainTraffic(integratedTraffic);
      
    } catch (error) {
      alert('도메인 상세 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setTrafficLoading(false);
    }
  };

  // SSE 시작/해제 함수
  const startSSE = (domain: string) => {
    try {
      // SSE 시작 시 현재 모니터링 도메인 설정
      currentMonitoringDomainRef.current = domain;
      
      const es = new EventSource(`/api/monitoring/events/${encodeURIComponent(domain)}`);
      sseRef.current = es;

      // 초당 플러시 타이머 시작
      if (tickTimerRef.current) {
        window.clearInterval(tickTimerRef.current);
      }
      tickTimerRef.current = window.setInterval(() => {
        const incReq = accReqRef.current;
        const incRes = accResRef.current;
        accReqRef.current = 0;
        accResRef.current = 0;
        
        setInboundSeries((prev) => {
          const next = [...prev, incReq];
          return next.length > 60 ? next.slice(next.length - 60) : next;
        });
        setOutboundSeries((prev) => {
          const next = [...prev, incRes];
          return next.length > 60 ? next.slice(next.length - 60) : next;
        });
      }, 1000);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // 현재 모니터링 중인 도메인의 트래픽만 처리
          if (data?.type === 'log' && data.payload && currentMonitoringDomainRef.current === domain) {
            
            // 로그 누적 (초당 합산)
            setDomainLogs((prev) => [data.payload, ...prev].slice(0, 100));
            const t = data.payload?.traffic || {};
            const addReq = toFiniteNumber(t.request_size) || toFiniteNumber(t.content_length) || 0;
            const addRes = toFiniteNumber(t.response_size) || toFiniteNumber(t.body_bytes_sent) || 0;
            
            // 그래프용 누적값 (1초마다 리셋됨) - 현재 도메인만
            accReqRef.current += addReq;
            accResRef.current += addRes;
            
            // 도메인별 상세 트래픽도 실시간 업데이트 - 현재 도메인만
            setDomainTraffic((prev: any) => {
              if (prev && prev.domain === domain) {
                // 현재 로그의 트래픽 정보 추출
                const t = data.payload?.traffic || {};
                const currentAddReq = toFiniteNumber(t.request_size) || toFiniteNumber(t.content_length) || 0;
                const currentAddRes = toFiniteNumber(t.response_size) || toFiniteNumber(t.body_bytes_sent) || 0;

                return {
                  ...prev,
                  // 최근 1일 통계 (독립적으로 누적)
                  day_stats: {
                    ...prev.day_stats,
                    total_requests: (prev.day_stats?.total_requests || 0) + 1, // 요청 수는 1씩 증가
                    total_bytes: (prev.day_stats?.total_bytes || 0) + currentAddReq + currentAddRes, // 바이트는 실제 크기만큼 증가
                    total_mb: ((prev.day_stats?.total_bytes || 0) + currentAddReq + currentAddRes) / (1024 * 1024)
                  },
                  // 1주일 통계 (독립적으로 누적)
                  week_stats: {
                    ...prev.week_stats,
                    total_requests: (prev.week_stats?.total_requests || 0) + 1, // 요청 수는 1씩 증가
                    total_bytes: (prev.week_stats?.total_bytes || 0) + currentAddReq + currentAddRes, // 바이트는 실제 크기만큼 증가
                    total_mb: ((prev.week_stats?.total_bytes || 0) + currentAddReq + currentAddRes) / (1024 * 1024)
                  },
                  // 1달 통계 (독립적으로 누적)
                  month_stats: {
                    ...prev.month_stats,
                    total_requests: (prev.month_stats?.total_requests || 0) + 1, // 요청 수는 1씩 증가
                    total_bytes: (prev.month_stats?.total_bytes || 0) + currentAddReq + currentAddRes, // 바이트는 실제 크기만큼 증가
                    total_mb: ((prev.month_stats?.total_bytes || 0) + currentAddReq + currentAddRes) / (1024 * 1024)
                  }
                };
              }
              return prev;
            });
            
          } else if (data?.type === 'traffic' && data.payload && currentMonitoringDomainRef.current === domain) {
            setDomainTraffic((prev: any) => ({
              ...(prev || {}),
              ...data.payload,
            }));
          }
        } catch (e) {
          console.error('SSE 메시지 파싱 실패:', e);
        }
      };
    } catch (e) {
      console.error('SSE 연결 실패:', e);
    }
  };

  const stopSSE = () => {
    try {
      if (sseRef.current) {
        sseRef.current.close();
      }
    } finally {
      sseRef.current = null;
      if (tickTimerRef.current) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
      // 모든 누적값과 그래프 데이터 완전 초기화
      accReqRef.current = 0;
      accResRef.current = 0;
      prevReqTotalRef.current = 0;
      prevResTotalRef.current = 0;
      // 그래프 데이터도 초기화
      setInboundSeries(Array(60).fill(0));
      setOutboundSeries(Array(60).fill(0));
    }
  };

  // 선택된 도메인이 변경되면 SSE 연결 관리
  useEffect(() => {
    if (selectedDomain) {
      startSSE(selectedDomain);
    }
    return () => {
      // 도메인 변경 또는 언마운트 시 해제
      stopSSE();
    };
  }, [selectedDomain]);



  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getOptimalUnit = (values: number[]): { unit: string; divisor: number } => {
    if (!Array.isArray(values) || values.length === 0) {
      return { unit: 'B', divisor: 1 };
    }

    const positives = values.filter((v) => Number.isFinite(v) && v > 0);
    if (positives.length === 0) {
      return { unit: 'B', divisor: 1 };
    }

    const maxVal = Math.max(...positives);
    if (!Number.isFinite(maxVal) || maxVal <= 0) {
      return { unit: 'B', divisor: 1 };
    }

    const k = 1024;
    const units = ['B', 'KB', 'MB', 'GB'];
    const raw = Math.log(maxVal) / Math.log(k);
    const i = Math.floor(Number.isFinite(raw) ? raw : 0);
    const idx = Math.max(0, Math.min(i, units.length - 1));
    const unit = units[idx];
    const divisor = Math.pow(k, idx);

    if (!Number.isFinite(divisor) || divisor <= 0) {
      return { unit: 'B', divisor: 1 };
    }

    return { unit, divisor };
  };

  const formatValueWithUnit = (value: number, unit: string, divisor: number): string => {
    return (value / divisor).toFixed(2) + ' ' + unit;
  };

  const formatMB = (bytes?: number, fallbackMB?: number): string => {
    if (typeof bytes === 'number') {
      return (bytes / (1024 * 1024)).toFixed(2) + 'MB';
    }
    if (typeof fallbackMB === 'number') {
      return fallbackMB.toFixed(2) + 'MB';
    }
    return '-';
  };

  // 다양한 키 이름을 가진 트래픽 페이로드에서 안전하게 숫자를 추출하기 위한 유틸
  const toFiniteNumber = (v: any): number => {
    const n = typeof v === 'string' ? Number(v) : v;
    return Number.isFinite(n) ? n : 0;
  };

  const num = (n?: number, digits = 0) =>
    typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : '-';

  const formatTime = (timeStr: string): string => {
    try {
      return new Date(timeStr).toLocaleString('ko-KR');
    } catch {
      return timeStr;
    }
  };

  // 실시간 검색 디바운싱
  const [debouncedSearch, setDebouncedSearch] = useState(filterSearch);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filterSearch);
    }, 300);

    return () => clearTimeout(timer);
  }, [filterSearch]);

  // 필터링된 로그를 debouncedSearch로 필터링
  const filteredLogs = domainLogs.filter((log) => {
    // 메서드 필터
    if (filterMethod !== 'ALL' && (log.method || '').toUpperCase() !== filterMethod) return false;
    
    // 상태 코드 클래스 필터
    if (filterStatus !== 'ALL') {
      const s = Number(log.status || 0);
      const cls = `${Math.floor(s / 100)}xx`;
      if (cls !== filterStatus) return false;
    }
    
    // WAF 동작 필터
    if (filterWAF !== 'ALL') {
      const wafAction = (log.waf_action || '').toLowerCase();
      
      if (filterWAF === 'pass') {
        // PASS 필터링: bypassed 또는 pass인 경우만 통과
        if (wafAction !== 'bypassed' && wafAction !== 'pass') {
          return false;
        }
      } else if (filterWAF === 'block') {
        // BLOCK 필터링: block인 경우만 통과
        if (wafAction !== 'block') {
          return false;
        }
      }
    }
    
    // 검색어 필터 (uri/host/user_agent) - 디바운싱 적용
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const hay = `${log.uri || ''} ${log.host || ''} ${log.user_agent || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    
    // IP 주소 필터
    if (filterIP) {
      const clientIP = log.client_ip || '';
      if (!clientIP.includes(filterIP)) return false;
    }
    
    // 응답 시간 필터
    if (filterResponseTime && filterResponseTime !== '') {
      const responseTime = Number(log?.traffic?.response_time) || 0;
      if (responseTime < filterResponseTimeRange[0] || responseTime > filterResponseTimeRange[1]) {
        return false;
      }
    }
    
    // 트래픽 크기 필터
    if (filterTrafficSize && filterTrafficSize !== '') {
      const totalBytes = Number(log?.traffic?.total_bytes) || 0;
      if (totalBytes < filterTrafficSizeRange[0] || totalBytes > filterTrafficSizeRange[1]) {
        return false;
      }
    }
    
    // 날짜 범위 필터
    if (filterDateRange[0] && filterDateRange[1]) {
      const logTime = new Date(log.timestamp || log.received_at).getTime();
      const startTime = new Date(filterDateRange[0]).getTime();
      const endTime = new Date(filterDateRange[1]).getTime();
      // 종료 날짜까지 포함하도록 수정 (endTime 이전이 아닌 endTime까지)
      if (logTime < startTime || logTime > endTime) return false;
    }
    
    return true;
  });

  // 필터 초기화
  const resetFilters = () => {
    setFilterMethod('ALL');
    setFilterStatus('ALL');
    setFilterSearch('');
    setFilterWAF('ALL');
    setFilterIP('');
    setFilterResponseTime('');
    setFilterResponseTimeRange([0, 10000]);
    setFilterTrafficSize('');
    setFilterTrafficSizeRange([0, 1000000]);
    setFilterDateRange(['', '']);
    setActiveFilters(new Set());
  };

  // 활성 필터 업데이트
  useEffect(() => {
    const active = new Set<string>();
    if (filterMethod !== 'ALL') active.add(`메서드: ${filterMethod}`);
    if (filterStatus !== 'ALL') active.add(`상태: ${filterStatus}`);
    if (filterSearch) active.add(`검색: ${filterSearch}`);
    if (filterWAF !== 'ALL') {
      if (filterWAF === 'block') active.add(`WAF: BLOCK`);
      else if (filterWAF === 'checked') active.add(`WAF: PASS`);
    }
    if (filterIP) active.add(`IP: ${filterIP}`);
    if (filterResponseTime) active.add(`응답시간: ${filterResponseTimeRange[0]}-${filterResponseTimeRange[1]}ms`);
    if (filterTrafficSize) active.add(`트래픽: ${formatBytes(filterTrafficSizeRange[0])}-${formatBytes(filterTrafficSizeRange[1])}`);
    if (filterDateRange[0] && filterDateRange[1]) active.add(`날짜: ${new Date(filterDateRange[0]).toLocaleDateString()}-${new Date(filterDateRange[1]).toLocaleDateString()}`);
    
    setActiveFilters(active);
  }, [filterMethod, filterStatus, filterSearch, filterWAF, filterIP, filterResponseTime, filterResponseTimeRange, filterTrafficSize, filterTrafficSizeRange, filterDateRange]);

  const renderLineChart = (series: number[], color: string, label: string, timestamps?: string[]) => {
    const width = 300;
    const height = 120; // 높이를 늘려서 날짜 표시 공간 확보
    const padding = 24;
    const innerW = width - padding * 2;
    const innerH = height - padding * 2 - 20; // 날짜 표시 공간 확보

    const safeSeries = Array.isArray(series)
      ? series.map((v) => (Number.isFinite(v) && v >= 0 ? v : 0))
      : [];


    const { unit, divisor } = getOptimalUnit(safeSeries);
    const denom = Number.isFinite(divisor) && divisor > 0 ? divisor : 1;
    const maxVal = Math.max(1, ...safeSeries.map((v) => v / denom));
    const stepX = safeSeries.length > 1 ? innerW / (safeSeries.length - 1) : innerW;


    const toXY = (v: number, i: number) => {
      const x = padding + i * stepX;
      const y = padding + (innerH - ((v / denom) / maxVal) * innerH);
      return { x, y };
    };

    const pathPoints = safeSeries.map((v, i) => toXY(v, i));
    const lineD = pathPoints
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(' ');

    const gridY1 = padding + innerH * 0.5;
    const gridY2 = padding + innerH;
    const lastVal = safeSeries.length ? safeSeries[safeSeries.length - 1] : 0;

    // 날짜/시간 표시를 위한 포인트 생성
    const timePoints = [];
    if (timestamps && timestamps.length > 0) {
      const step = Math.max(1, Math.floor(timestamps.length / 5)); // 5개 정도의 시간 포인트만 표시
      for (let i = 0; i < timestamps.length; i += step) {
        if (i < timestamps.length) {
          const x = padding + (i / (timestamps.length - 1)) * innerW;
          const timeStr = formatTime(timestamps[i]);
          timePoints.push({ x, time: timeStr });
        }
      }
    }

    return (
      <svg width={width} height={height} className="block">
        {/* axes */}
        <line x1={padding} y1={gridY2} x2={padding + innerW} y2={gridY2} stroke="#e5e7eb" />
        <line x1={padding} y1={gridY1} x2={padding + innerW} y2={gridY1} stroke="#f3f4f6" />
        
        {/* line */}
        <path d={lineD} fill="none" stroke={color} strokeWidth={2} />
        
                 {/* data points */}
         {safeSeries.map((v, i) => {
           const point = toXY(v, i);
           return (
             <g key={i}>
               <circle 
                 cx={point.x} 
                 cy={point.y} 
                 r="3" 
                 fill={color}
                 className="transition-all duration-200"
               />
             </g>
           );
         })}
        
        {/* time labels */}
        {timePoints.map((point, i) => (
          <g key={i}>
            <line 
              x1={point.x} 
              y1={gridY2} 
              x2={point.x} 
              y2={gridY2 + 5} 
              stroke="#9ca3af" 
              strokeWidth="1" 
            />
            <text 
              x={point.x} 
              y={gridY2 + 15} 
              fontSize="8" 
              fill="#6b7280" 
              textAnchor="middle"
              className="select-none"
            >
              {point.time}
            </text>
          </g>
        ))}
        
        {/* label */}
        <text x={padding} y={padding - 6} fontSize="10" fill="#6b7280">{label}</text>
        <text x={padding + innerW} y={padding} fontSize="10" fill="#374151" textAnchor="end">
          {formatValueWithUnit(lastVal, unit, denom)}
        </text>
      </svg>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-gray-600">도메인 정보를 불러오는 중...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
             <div className="max-w-6xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-green-600 to-blue-600 p-6 text-white">
            <h1 className="text-2xl font-bold text-center">도메인 관리</h1>
            <p className="text-green-100 text-center mt-2">등록된 도메인 현황 및 모니터링</p>
          </div>
        </div>

        {/* 트래픽 요약 */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">📊 트래픽 요약</h2>
          
          {/* 종합 트래픽 현황 */}
          <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-800 mb-3">🌐 종합 트래픽 현황</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white p-3 rounded-lg border border-blue-100">
                <div className="text-sm text-blue-600 font-medium">최근 1일</div>
                <div className="text-2xl font-bold text-blue-800">
                  {trafficSummary.reduce((sum, stats) => sum + (stats.today?.requests || 0), 0).toLocaleString()}회
                </div>
                <div className="text-sm text-blue-600">
                  {formatBytes(trafficSummary.reduce((sum, stats) => sum + (stats.today?.bytes || 0), 0))}
                </div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-green-100">
                <div className="text-sm text-green-600 font-medium">최근 1주일</div>
                <div className="text-2xl font-bold text-green-800">
                  {trafficSummary.reduce((sum, stats) => sum + (stats.week?.requests || stats.today?.requests * 7 || 0), 0).toLocaleString()}회
                </div>
                <div className="text-sm text-green-600">
                  {formatBytes(trafficSummary.reduce((sum, stats) => sum + (stats.week?.bytes || stats.today?.bytes * 7 || 0), 0))}
                </div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-purple-100">
                <div className="text-sm text-purple-600 font-medium">최근 1달</div>
                <div className="text-2xl font-bold text-purple-800">
                  {trafficSummary.reduce((sum, stats) => sum + (stats.month?.requests || stats.today?.requests * 30 || 0), 0).toLocaleString()}회
                </div>
                <div className="text-sm text-purple-600">
                  {formatBytes(trafficSummary.reduce((sum, stats) => sum + (stats.month?.bytes || stats.today?.bytes * 30 || 0), 0))}
                </div>
              </div>
            </div>
          </div>
        </div>

                 {/* 도메인 목록 */}
         <div className="bg-white rounded-2xl shadow-lg p-6">
           <div className="flex justify-between items-center mb-6">
             <h2 className="text-xl font-bold text-gray-800">🌐 등록된 도메인</h2>
             <div className="text-sm text-gray-500">
               총 {domains.length}개 도메인
             </div>
           </div>
           {domains.length === 0 ? (
             <div className="text-center py-12">
               <div className="text-gray-400 text-6xl mb-4">🌐</div>
               <p className="text-gray-500 text-lg">등록된 도메인이 없습니다.</p>
               <p className="text-gray-400 text-sm mt-2">새로운 도메인을 등록해보세요!</p>
             </div>
           ) : (
             <div className="space-y-4">
               {domains.map((domain) => (
                 <div key={domain.domain} className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
                   <div
                     onClick={() => loadDomainDetails(domain.domain)}
                     className="p-5 cursor-pointer group"
                   >
                     {/* 도메인 헤더 */}
                     <div className="flex items-start justify-between mb-4">
                       <div className="flex-1">
                         <h3 className="text-lg font-semibold text-gray-800 group-hover:text-blue-600 transition-colors">
                           {domain.domain}
                         </h3>
                         {domain.target && (
                           <p className="text-sm text-gray-600 mt-1 flex items-center">
                             <span className="text-blue-500 mr-2">🎯</span>
                             {domain.target}
                           </p>
                         )}
                       </div>
                       <div className="flex items-center gap-2">
                         <button
                           className="text-red-500 hover:text-red-700 text-sm border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all duration-200 opacity-0 group-hover:opacity-100"
                           onClick={(e) => {
                             e.stopPropagation();
                             const ok = window.confirm(`${domain.domain} 도메인을 삭제하시겠습니까?\nCloudflare DNS와 WAF 등록이 해제됩니다.`);
                             if (!ok) return;
                             (async () => {
                               try {
                                 await deleteDomain(domain.domain);
                                 // 선택된 도메인이면 상세/그래프/연결 초기화
                                 if (selectedDomain === domain.domain) {
                                   stopSSE();
                                   setSelectedDomain('');
                                   setDomainLogs([]);
                                   setDomainTraffic(null);
                                   setInboundSeries([]);
                                   setOutboundSeries([]);
                                 }
                                 // 목록 새로고침
                                 const [domainsData, trafficData, billingData] = await Promise.all([
                                   getDomains(),
                                   getTrafficSummary(),
                                   getBillingSummary()
                                 ]);
                                 
                                 // 도메인 데이터에 결제 정보 병합
                                 const domainsWithBilling = domainsData.map(domain => {
                                   const billingInfo = billingData.find(billing => billing.domain === domain.domain);
                                   return {
                                     ...domain,
                                     billing_info: billingInfo
                                   };
                                 });
                                 
                                 setDomains(domainsWithBilling);
                                 setTrafficSummary(trafficData);
                                 alert('도메인이 삭제되었습니다.');
                               } catch (err: any) {
                                 alert(err?.message || '도메인 삭제 중 오류가 발생했습니다.');
                               }
                             })();
                           }}
                         >
                           삭제
                         </button>
                         <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                           selectedDomain === domain.domain 
                             ? 'bg-blue-100 text-blue-600 rotate-180' 
                             : 'bg-gray-100 text-gray-400'
                         }`}>
                           <span className="text-lg">▼</span>
                         </div>
                       </div>
                     </div>

                     {/* 도메인 정보 */}
                     <div className="grid grid-cols-3 gap-4 mb-4">
                       {domain.created_at && (
                         <div className="bg-white p-3 rounded-lg border border-gray-100">
                           <div className="flex items-center text-gray-500 mb-1">
                             <span className="text-sm mr-2">📅</span>
                             <span className="text-xs font-medium">생성일</span>
                           </div>
                           <p className="text-sm font-medium text-gray-700">
                             {new Date(domain.created_at).toLocaleDateString('ko-KR')}
                           </p>
                         </div>
                       )}
                       {domain.payment_due_date && (
                         <div className="bg-white p-3 rounded-lg border border-gray-100">
                           <div className="flex items-center text-gray-500 mb-1">
                             <span className="text-sm mr-2">💳</span>
                             <span className="text-xs font-medium">결제예정일</span>
                           </div>
                           <p className="text-sm font-medium text-gray-700">
                             {new Date(domain.payment_due_date).toLocaleDateString('ko-KR')}
                           </p>
                         </div>
                       )}
                                               <div className="bg-white p-3 rounded-lg border border-gray-100">
                          <div className="flex items-center text-gray-500 mb-1">
                            <span className="text-sm mr-2">🛡️</span>
                            <span className="text-xs font-medium">서비스 타입</span>
                          </div>
                                                     <p className="text-sm font-medium text-gray-700">
                             {domain.waf === 'on' ? 'WAF' : '프록시'}
                           </p>
                        </div>
                     </div>

                     {/* 결제 정보 */}
                     {domain.billing_info && (
                       <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
                         <div className="flex items-center justify-between mb-3">
                           <p className="text-sm font-semibold text-blue-800">💰 결제 예정 금액</p>
                           <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                             {domain.billing_info.days_until_billing}일 남음
                           </span>
                         </div>
                                                   <div className="grid grid-cols-2 gap-3">
                            <div className="text-center">
                              <div className="text-lg font-bold text-blue-800">
                                {domain.billing_info.traffic_gb.toFixed(2)}
                              </div>
                              <div className="text-xs text-blue-600">GB</div>
                            </div>
                            <div className="text-center">
                              <div className="text-lg font-bold text-blue-800">
                                {domain.billing_info.points.toLocaleString()}
                              </div>
                              <div className="text-xs text-blue-600">포인트</div>
                            </div>
                          </div>
                       </div>
                     )}
                   </div>
                  
                  {/* 도메인 세부 정보 */}
                  {selectedDomain === domain.domain && (
                    <div className="border-t bg-gray-50 p-4 space-y-4">
                      {/* 트래픽 통계 */}
                      <div>
                        <h4 className="font-medium text-gray-700 mb-2">📈 트래픽 통계</h4>
                        
                        {trafficLoading ? (
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-gray-500">로딩 중...</span>
                          </div>
                        ) : domainTraffic ? (
                          <div className="space-y-4">
                            {/* 도메인별 트래픽 요약 카드 */}
                            <div className="bg-gradient-to-r from-gray-50 to-blue-50 p-4 rounded-lg border border-gray-200">
                              <h5 className="text-sm font-medium text-gray-700 mb-3">📊 {domain.domain} 트래픽 요약</h5>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="bg-white p-3 rounded border border-blue-100">
                                  <div className="text-xs text-blue-600 font-medium">최근 1일</div>
                                  <div className="text-lg font-bold text-blue-800">
                                    {domainTraffic.day_stats?.total_requests || '0'}회
                                  </div>
                                  <div className="text-xs text-blue-600">
                                    {formatMB(domainTraffic.day_stats?.total_bytes, domainTraffic.day_stats?.total_mb)}
                                  </div>
                                </div>
                                <div className="bg-white p-3 rounded border border-green-100">
                                  <div className="text-xs text-green-600 font-medium">최근 1주일</div>
                                  <div className="text-lg font-bold text-green-800">
                                    {domainTraffic.week_stats?.total_requests || '0'}회
                                  </div>
                                  <div className="text-xs text-green-600">
                                    {formatMB(domainTraffic.week_stats?.total_bytes, domainTraffic.week_stats?.total_mb)}
                                  </div>
                                </div>
                                <div className="bg-white p-3 rounded border border-purple-100">
                                  <div className="text-xs text-purple-600 font-medium">최근 1달</div>
                                  <div className="text-lg font-bold text-purple-800">
                                    {domainTraffic.month_stats?.total_requests || '0'}회
                                  </div>
                                  <div className="text-xs text-purple-600">
                                    {formatMB(domainTraffic.month_stats?.total_bytes, domainTraffic.month_stats?.total_mb)}
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* 기존 상세 트래픽 통계 */}
                            <div className="bg-white p-3 rounded border">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-gray-600">총 요청:</span>
                                  <span className="font-medium ml-2">{num(domainTraffic.total_requests)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">총 트래픽:</span>
                                  <span className="font-medium ml-2">{formatMB(domainTraffic.total_bytes, domainTraffic.total_mb)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">인바운드(요청):</span>
                                  <span className="font-medium ml-2">{formatMB(domainTraffic.total_request_bytes, domainTraffic.total_request_mb)}</span>
                                </div>
                                <div>
                                  <span className="text-gray-600">아웃바운드(응답):</span>
                                  <span className="font-medium ml-2">{formatMB(domainTraffic.total_response_bytes, domainTraffic.total_response_mb)}</span>
                                </div>
                              </div>
                            </div>
                            {/* 실시간 상태 그래프 */}
                             <div className="mt-4 grid grid-cols-2 gap-4">
                               <div className="bg-gray-50 border rounded p-2">
                                 {renderLineChart(
                                   inboundSeries, 
                                   '#2563eb', 
                                   'Inbound (Req)',
                                   domainTraffic?.timeline?.map((item: any) => item.time) || []
                                 )}
                               </div>
                               <div className="bg-gray-50 border rounded p-2">
                                 {renderLineChart(
                                   outboundSeries, 
                                   '#16a34a', 
                                   'Outbound (Res)',
                                   domainTraffic?.timeline?.map((item: any) => item.time) || []
                                 )}
                               </div>
                             </div>
                            <div className="mt-2 text-xs text-gray-500 text-center">
                              그래프 단위: {getOptimalUnit([...inboundSeries, ...outboundSeries]).unit}
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-500">트래픽 데이터를 불러올 수 없습니다.</p>
                        )}
                      </div>

                      {/* 최근 로그 */}
                      <div>
                        <h4 className="font-medium text-gray-700 mb-2">📝 최근 로그 (최근 50개)</h4>
                        
                        {/* 고급 필터 시스템 */}
                        <div className="bg-gray-50 border rounded-lg p-4 mb-4">
                          {/* 필터 헤더 */}
                          <div className="flex items-center justify-between mb-4">
                            <h5 className="font-medium text-gray-700">🔍 고급 로그 필터</h5>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                                className="text-sm px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                              >
                                {showAdvancedFilters ? '간단 모드' : '고급 모드'}
                              </button>
                              <button
                                onClick={resetFilters}
                                className="text-sm px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                              >
                                필터 초기화
                              </button>
                            </div>
                          </div>

                          {/* 필터 프리셋 - 빠른 필터 기능 제거됨 */}

                          {/* 기본 필터 */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">HTTP 메서드</label>
                              <select 
                                className="w-full text-xs border rounded px-2 py-1.5" 
                                value={filterMethod} 
                                onChange={(e) => setFilterMethod(e.target.value)}
                              >
                                <option value="ALL">전체 메서드</option>
                                <option value="GET">GET</option>
                                <option value="POST">POST</option>
                                <option value="PUT">PUT</option>
                                <option value="DELETE">DELETE</option>
                                <option value="PATCH">PATCH</option>
                                <option value="OPTIONS">OPTIONS</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">상태 코드</label>
                              <select 
                                className="w-full text-xs border rounded px-2 py-1.5" 
                                value={filterStatus} 
                                onChange={(e) => setFilterStatus(e.target.value)}
                              >
                                <option value="ALL">전체 상태</option>
                                <option value="2xx">2xx (성공)</option>
                                <option value="3xx">3xx (리다이렉트)</option>
                                <option value="4xx">4xx (클라이언트 오류)</option>
                                <option value="5xx">5xx (서버 오류)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 mb-1">WAF 동작</label>
                              <select 
                                className="w-full text-xs border rounded px-2 py-1.5" 
                                value={filterWAF} 
                                onChange={(e) => setFilterWAF(e.target.value)}
                              >
                                <option value="ALL">WAF 전체</option>
                                <option value="block">BLOCK</option>
                                <option value="pass">PASS</option>
                              </select>
                            </div>
                          </div>

                          {/* 고급 필터 */}
                          {showAdvancedFilters && (
                            <div className="space-y-4 border-t pt-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* IP 주소 필터 */}
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">클라이언트 IP</label>
                                  <input
                                    className="w-full text-xs border rounded px-2 py-1.5"
                                    placeholder="IP 주소 또는 일부"
                                    value={filterIP}
                                    onChange={(e) => setFilterIP(e.target.value)}
                                  />
                                </div>

                                {/* 응답 시간 필터 */}
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">응답 시간 (ms)</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      className="w-20 text-xs border rounded px-2 py-1.5"
                                      placeholder="최소"
                                      value={filterResponseTimeRange[0]}
                                      onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setFilterResponseTimeRange([value, filterResponseTimeRange[1]]);
                                        if (value !== 0 || filterResponseTimeRange[1] !== 10000) {
                                          setFilterResponseTime('custom');
                                        } else {
                                          setFilterResponseTime('');
                                        }
                                      }}
                                    />
                                    <span className="text-xs text-gray-500">~</span>
                                    <input
                                      type="number"
                                      className="w-20 text-xs border rounded px-2 py-1.5"
                                      placeholder="최대"
                                      value={filterResponseTimeRange[1]}
                                      onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setFilterResponseTimeRange([filterResponseTimeRange[0], value]);
                                        if (filterResponseTimeRange[0] !== 0 || value !== 10000) {
                                          setFilterResponseTime('custom');
                                        } else {
                                          setFilterResponseTime('');
                                        }
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* 트래픽 크기 필터 */}
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">트래픽 크기 (bytes)</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      className="w-20 text-xs border rounded px-2 py-1.5"
                                      placeholder="최소"
                                      value={filterTrafficSizeRange[0]}
                                      onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setFilterTrafficSizeRange([value, filterTrafficSizeRange[1]]);
                                        if (value !== 0 || filterTrafficSizeRange[1] !== 1000000) {
                                          setFilterTrafficSize('custom');
                                        } else {
                                          setFilterTrafficSize('');
                                        }
                                      }}
                                    />
                                    <span className="text-xs text-gray-500">~</span>
                                    <input
                                      type="number"
                                      className="w-20 text-xs border rounded px-2 py-1.5"
                                      placeholder="최대"
                                      value={filterTrafficSizeRange[1]}
                                      onChange={(e) => {
                                        const value = Number(e.target.value);
                                        setFilterTrafficSizeRange([filterTrafficSizeRange[0], value]);
                                        if (filterTrafficSizeRange[0] !== 0 || value !== 1000000) {
                                          setFilterTrafficSize('custom');
                                        } else {
                                          setFilterTrafficSize('');
                                        }
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* 날짜 범위 필터 */}
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">시작 날짜</label>
                                  <input
                                    type="datetime-local"
                                    className="w-full text-xs border rounded px-2 py-1.5"
                                    value={filterDateRange[0]}
                                    onChange={(e) => setFilterDateRange([e.target.value, filterDateRange[1]])}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">종료 날짜 (해당 시간까지 포함)</label>
                                  <input
                                    type="datetime-local"
                                    className="w-full text-xs border rounded px-2 py-1.5"
                                    value={filterDateRange[1]}
                                    onChange={(e) => setFilterDateRange([filterDateRange[0], e.target.value])}
                                  />
                                  <div className="text-xs text-gray-500 mt-1">
                                    종료 날짜의 해당 시간까지 포함하여 조회됩니다
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 활성 필터 표시 */}
                          {activeFilters.size > 0 && (
                            <div className="border-t pt-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium text-gray-600">활성 필터:</span>
                                <span className="text-xs text-gray-500">({activeFilters.size}개)</span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {Array.from(activeFilters).map((filter, index) => (
                                  <span
                                    key={index}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full"
                                  >
                                    {filter}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 필터 결과 요약 */}
                          <div className="border-t pt-3">
                            <div className="flex items-center justify-between text-xs text-gray-600">
                              <span>
                                총 {domainLogs.length}개 로그 중 <span className="font-medium text-blue-600">{filteredLogs.length}개</span> 표시
                              </span>
                              <span>
                                필터링 비율: {domainLogs.length > 0 ? ((filteredLogs.length / domainLogs.length) * 100).toFixed(1) : 0}%
                              </span>
                            </div>
                          </div>
                        </div>
                        {logsLoading ? (
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-gray-500">로딩 중...</span>
                          </div>
                        ) : filteredLogs.length > 0 ? (
                          <div className="bg-white border rounded max-h-[28rem] overflow-auto">
                            {/* 필터링된 결과 요약 */}
                            <div className="bg-blue-50 border-b p-3">
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-4">
                                  <span className="text-blue-700 font-medium">
                                    🔍 필터링 결과: {filteredLogs.length}개 로그
                                  </span>
                                  {activeFilters.size > 0 && (
                                    <span className="text-blue-600 text-xs">
                                      활성 필터: {Array.from(activeFilters).join(', ')}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-blue-600">
                                  {domainLogs.length > 0 ? ((filteredLogs.length / domainLogs.length) * 100).toFixed(1) : 0}% 표시
                                </div>
                              </div>
                            </div>
                            
                            {/* 통계 정보를 맨 위로 이동 */}
                            {filteredLogs.length > 0 && (
                              <div className="bg-gray-50 border-b p-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
                                  <div>
                                    <span className="font-medium">평균 응답시간:</span>
                                    <span className="ml-2">
                                      {(filteredLogs.reduce((sum, log) => sum + (Number(log?.traffic?.response_time) || 0), 0) / filteredLogs.length).toFixed(1)}ms
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium">총 트래픽:</span>
                                    <span className="ml-2">
                                      {formatBytes(filteredLogs.reduce((sum, log) => sum + (Number(log?.traffic?.total_bytes) || 0), 0))}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium">WAF 검사율:</span>
                                    <span className="ml-2">
                                      {((filteredLogs.filter(log => log.waf_action === 'checked').length / filteredLogs.length) * 100).toFixed(1)}%
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium">에러율:</span>
                                    <span className="ml-2">
                                      {((filteredLogs.filter(log => (log.status || 0) >= 400).length / filteredLogs.length) * 100).toFixed(1)}%
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            <table className="min-w-full text-xs font-mono">
                              <thead className="sticky top-0 bg-gray-100">
                                <tr className="text-left">
                                  <th className="px-3 py-2">Status</th>
                                  <th className="px-3 py-2">Method</th>
                                  <th className="px-3 py-2">Client IP</th>
                                  <th className="px-3 py-2">Action</th>
                                  <th className="px-3 py-2">Req</th>
                                  <th className="px-3 py-2">Res</th>
                                  <th className="px-3 py-2">Total</th>
                                  <th className="px-3 py-2">RespTime</th>
                                  <th className="px-3 py-2">Time</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredLogs.slice(0, 50).map((log, i) => (
                                  <tr key={i} className="border-t hover:bg-gray-50 transition-colors">
                                    <td className="px-3 py-2">
                                      <span className={`px-2 py-1 rounded text-white text-xs font-medium ${
                                        log.status >= 200 && log.status < 300 ? 'bg-green-500' :
                                        log.status >= 300 && log.status < 400 ? 'bg-yellow-500' :
                                        log.status >= 400 && log.status < 500 ? 'bg-orange-500' :
                                        'bg-red-500'
                                      }`}>{log.status ?? '-'}</span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                                        log.method === 'GET' ? 'bg-blue-100 text-blue-700' :
                                        log.method === 'POST' ? 'bg-green-100 text-green-700' :
                                        log.method === 'PUT' ? 'bg-yellow-100 text-yellow-700' :
                                        log.method === 'DELETE' ? 'bg-red-100 text-red-700' :
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                        {(log.method || '-').toUpperCase()}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className="text-gray-700 font-mono">{log.client_ip ?? '-'}</span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                                        log.waf_action === 'block' ? 'bg-red-100 text-red-700' :
                                        log.waf_action === 'checked' ? 'bg-blue-100 text-blue-700' :
                                        log.waf_action === 'bypassed' ? 'bg-orange-100 text-orange-700' :
                                        'bg-gray-100 text-gray-600'
                                      }`}>
                                                                                 {log.waf_action === 'block' ? 'BLOCK' :
                                          log.waf_action === 'checked' ? 'PASS' :
                                          log.waf_action === 'bypassed' ? 'PASS' : 'PASS'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <span className="text-gray-600 font-mono">
                                        {formatBytes(log?.traffic?.request_size || 0)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <span className="text-gray-600 font-mono">
                                        {formatBytes(log?.traffic?.response_size || 0)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <span className="font-medium text-gray-800">
                                        {formatBytes(log?.traffic?.total_bytes || 0)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                                        (log?.traffic?.response_time || 0) > 1000 ? 'bg-red-100 text-red-700' :
                                        (log?.traffic?.response_time || 0) > 500 ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-green-100 text-green-700'
                                      }`}>
                                        {log?.traffic?.response_time ? `${log.traffic.response_time}ms` : '-'}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span className="text-gray-600 text-xs">
                                        {formatTime(log.timestamp || log.received_at)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-gray-500">로그가 없습니다.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DomainManagePage;
