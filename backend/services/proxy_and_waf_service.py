import os
import requests
import cloudflare
from cloudflare import APIError
from typing import Optional
from dotenv import load_dotenv

from models.proxy_and_waf import SubdomainRegisterRequest, SubdomainUnregisterRequest, WAFResponse

# .env 파일 경로를 명시적으로 지정
load_dotenv(os.path.join(os.path.dirname(__file__), '../config', '.env'))

class WAFService:
    """WAF 자동화 관련 비즈니스 로직을 처리하는 서비스 클래스"""
    
    def __init__(self):
        # 환경변수에서 설정 로드
        self.cloudflare_api_token = os.getenv("CLOUDFLARE_API_TOKEN")
        self.cloudflare_zone_id = os.getenv("CLOUDFLARE_ZONE_ID")
        self.base_domain = os.getenv("BASE_DOMAIN")
        self.waf_server_ip = os.getenv("WAF_SERVER_IP")
        
        # Cloudflare 클라이언트 초기화
        self.cf = None
        if self.cloudflare_api_token:
            try:
                self.cf = cloudflare.Cloudflare(api_token=self.cloudflare_api_token)
            except Exception as e:
                print(f"Cloudflare 클라이언트 초기화 실패: {e}")
        else:
            print("경고: CLOUDFLARE_API_TOKEN이 설정되지 않았습니다.")
    
    def _validate_settings(self) -> bool:
        """필수 설정값 검증"""
        required_settings = [
            self.cloudflare_api_token,
            self.cloudflare_zone_id,
            self.base_domain,
            self.waf_server_ip
        ]
        
        if not all(required_settings):
            missing = []
            if not self.cloudflare_api_token:
                missing.append("CLOUDFLARE_API_TOKEN")
            if not self.cloudflare_zone_id:
                missing.append("CLOUDFLARE_ZONE_ID")
            if not self.base_domain:
                missing.append("BASE_DOMAIN")
            if not self.waf_server_ip:
                missing.append("WAF_SERVER_IP")
            
            print(f"경고: 다음 환경변수가 설정되지 않았습니다: {', '.join(missing)}")
            return False
        
        return True
    
    def _notify_waf(self, action: str, host: str, target: str = None, waf: str = None) -> dict:
        """WAF 서버에 등록 또는 해제 요청을 보냅니다."""
        if not self.waf_server_ip:
            return {"status": "warning", "message": "WAF 서버 IP가 설정되지 않았습니다."}
        
        try:
            if action == "register":
                url = f"http://{self.waf_server_ip}/manage?action=register&host={host}&target={target}&waf={waf}"
            elif action == "unregister":    
                url = f"http://{self.waf_server_ip}/manage?action=unregister&host={host}&target={target}&waf={waf}"
            else:
                return {"status": "error", "message": "잘못된 WAF 액션입니다."}
                
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            return {"status": "success", "message": f"WAF 서버에 '{action}' 요청을 성공적으로 보냈습니다."}
        except requests.exceptions.RequestException as e:
            return {"status": "warning", "message": f"WAF 서버 '{action}' 요청에 실패했습니다: {e}"}
    
    async def register_subdomain(self, request: SubdomainRegisterRequest) -> WAFResponse:
        """서브도메인을 Cloudflare에 등록하고 WAF 서버에 알립니다."""
        # 설정 검증
        if not self._validate_settings() or not self.cf:
            raise Exception("Cloudflare 설정이 올바르지 않습니다.")
        
        full_domain = f"{request.subdomain}.{self.base_domain}"
        
        try:
            print(type(self.cloudflare_zone_id))
            # 1. Cloudflare에 DNS A 레코드 추가
            created_record = self.cf.dns.records.create(
                zone_id=self.cloudflare_zone_id,
                type = "A",
                name = request.subdomain,
                content = self.waf_server_ip,
                ttl = 3600,
                proxied = False
            )
            
            # 2. WAF 서버에 등록 요청
            waf_result = self._notify_waf("register", full_domain, target=request.target, waf=request.waf)
            
            return WAFResponse(
                message=f"'{full_domain}' 처리가 완료되었습니다.",
                cloudflare_status="success",
                cloudflare_result=created_record.model_dump(),
                waf_status=waf_result
            )
            
        except APIError as e:
            # 81058 에러는 도메인이 이미 존재하는 경우
            if hasattr(e, 'body') and isinstance(e.body, dict):
                error_code = e.body.get('errors', [{}])[0].get('code', 0)
                if error_code == 81058:
                    raise Exception(f"도메인 '{full_domain}'이 이미 존재합니다. 다른 서브도메인을 사용해주세요.")
        except Exception as e:
            raise Exception(f"서브도메인 등록 중 오류: {str(e)}")
    
    async def unregister_subdomain(self, request: SubdomainUnregisterRequest) -> WAFResponse:
        """Cloudflare에서 서브도메인을 삭제하고 WAF 서버에 알립니다."""
        # 설정 검증
        if not self._validate_settings() or not self.cf:
            raise Exception("Cloudflare 설정이 올바르지 않습니다.")
        
        full_domain = f"{request.subdomain}.{self.base_domain}"
        
        try:
            # 1. 삭제할 DNS 레코드 ID 찾기
            records = self.cf.dns.records.list(
                zone_id=self.cloudflare_zone_id,
            )
            matches = [r for r in records.result if r.name == full_domain]
            
            record_id = matches[0].id
            
            if not records:
                raise Exception(f"'{full_domain}'에 해당하는 DNS 레코드를 찾을 수 없습니다.")
            
            # 2. Cloudflare에서 DNS 레코드 삭제
            self.cf.dns.records.delete(
                dns_record_id=record_id,
                zone_id=self.cloudflare_zone_id
            )
            
            # 3. WAF 서버에 해제 요청
            waf_result = self._notify_waf("unregister", full_domain)
            
            return WAFResponse(
                message=f"'{full_domain}' 삭제 처리가 완료되었습니다.",
                cloudflare_status="success",
                waf_status=waf_result
            )
            
        except APIError as e:
            raise Exception(f"Cloudflare API 오류: {e.body}")
        except Exception as e:
            raise Exception(f"서브도메인 삭제 중 오류: {str(e)}")

# 싱글톤 인스턴스
waf_service = WAFService()
