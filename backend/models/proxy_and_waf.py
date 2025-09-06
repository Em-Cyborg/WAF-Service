from pydantic import BaseModel, Field
from typing import List, Optional, Dict

# DNS 서브도메인 관리용 모델
class SubdomainRegisterRequest(BaseModel):
    subdomain: str
    target: str
    waf: str

class SubdomainUnregisterRequest(BaseModel):
    subdomain: str

class WAFResponse(BaseModel):
    message: str
    cloudflare_status: str
    cloudflare_result: Optional[dict] = None
    waf_status: dict

# 기존 WAF 관리용 모델 (향후 확장용)
class WAFRuleRequest(BaseModel):
    domain: str
    rule_type: str  # "block_ip", "block_country", "rate_limit", "custom"
    rule_value: str
    description: Optional[str] = None

class WAFRuleResponse(BaseModel):
    rule_id: str
    domain: str
    rule_type: str
    rule_value: str
    description: Optional[str] = None
    created_at: str
    status: str

class WAFConfigRequest(BaseModel):
    domain: str
    ssl_enabled: bool = False
    rate_limit: Optional[int] = None
    blocked_ips: List[str] = []
    blocked_countries: List[str] = []
    custom_rules: List[str] = []

class WAFConfigResponse(BaseModel):
    domain: str
    config_id: str
    ssl_enabled: bool
    rate_limit: Optional[int]
    blocked_ips: List[str]
    blocked_countries: List[str]
    custom_rules: List[str]
    status: str
    created_at: str

class WAFStatusResponse(BaseModel):
    domain: str
    status: str  # "active", "inactive", "error"
    last_updated: str
    rules_count: int
