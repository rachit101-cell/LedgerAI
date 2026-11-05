from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, model_validator

# Base & Shared
class BusinessRead(BaseModel):
    id: str
    name: str
    business_type: str
    country: str
    default_currency: str
    timezone: str
    opening_cash_balance: Decimal
    created_at: datetime

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True



class ContactBase(BaseModel):
    name: str
    contact_type: str = "customer"  # customer, supplier, both
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    credit_limit: Decimal = Decimal("0.00")
    default_payment_terms_days: int = 15

class ContactCreate(ContactBase):
    pass

class ContactRead(ContactBase):
    id: str
    business_id: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True



class ProductBase(BaseModel):
    sku: str
    name: str
    unit: str = "pcs"
    sales_price: Decimal = Decimal("0.00")
    purchase_cost: Decimal = Decimal("0.00")
    current_stock: Decimal = Decimal("0.00")
    reorder_threshold: Decimal = Decimal("10.00")
    active: bool = True

class ProductCreate(ProductBase):
    pass

class ProductRead(ProductBase):
    id: str
    business_id: str
    created_at: datetime

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True



class DocumentItemCreate(BaseModel):
    product_id: Optional[str] = None
    description: str
    quantity: Decimal = Decimal("1.00")
    unit_price: Decimal = Decimal("0.00")
    discount: Decimal = Decimal("0.00")
    tax: Decimal = Decimal("0.00")

class DocumentItemRead(BaseModel):
    id: str
    product_id: Optional[str] = None
    description: str
    quantity: Decimal
    unit_price: Decimal
    discount: Decimal
    tax: Decimal
    line_total: Decimal

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True



class DocumentCreate(BaseModel):
    document_type: str = "invoice"  # invoice, bill, quotation
    document_number: str
    contact_id: str
    issue_date: Optional[datetime] = None
    due_date: Optional[datetime] = None
    currency: str = "INR"
    notes: Optional[str] = None
    items: List[DocumentItemCreate]

class PaymentAllocationRead(BaseModel):
    id: str
    transaction_id: str
    document_id: str
    allocated_amount: Decimal
    created_at: datetime

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True



class DocumentRead(BaseModel):
    id: str
    business_id: str
    document_type: str
    document_number: str
    contact_id: str
    contact_name: Optional[str] = None
    issue_date: datetime
    due_date: datetime
    currency: str
    subtotal: Decimal
    discount: Decimal
    tax: Decimal
    total: Decimal
    paid_amount: Decimal
    outstanding_amount: Decimal
    status: str
    notes: Optional[str] = None
    items: List[DocumentItemRead] = []
    allocations: List[PaymentAllocationRead] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True



class PaymentCreate(BaseModel):
    document_id: Optional[str] = None
    contact_id: Optional[str] = None
    amount: Decimal
    currency: str = "INR"
    payment_method: str = "cash"  # paypal, bank_transfer, cash, upi
    reference: Optional[str] = None
    description: Optional[str] = None
    transaction_date: Optional[datetime] = None

class TransactionRead(BaseModel):
    id: str
    business_id: str
    transaction_type: str
    amount: Decimal
    currency: str
    transaction_date: datetime
    payment_method: str
    status: str
    reference: Optional[str] = None
    provider: Optional[str] = None
    provider_payment_id: Optional[str] = None
    contact_id: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True



class EvidenceRecord(BaseModel):
    record_type: str  # document, transaction, contact, product
    id: str
    label: str
    amount: Optional[Decimal] = None
    date: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[str] = None

class FinancialSummaryRead(BaseModel):
    recorded_cash_balance: Decimal
    currency: str
    period: str
    total_sales_invoiced: Decimal
    total_collections: Decimal
    total_supplier_bills: Decimal
    total_expenses_paid: Decimal
    total_receivables: Decimal
    total_payables_due: Decimal
    net_cash_movement: Decimal
    shortfall_risk: bool
    projected_shortfall_amount: Decimal
    shortfall_date: Optional[str] = None
    reporting_basis: str = "Cash accounting basis for movements; Invoiced basis for receivables/payables."
    assumptions: List[str]
    supporting_evidence: List[EvidenceRecord]


# AI Assistant & Action Drafts
class ActionDraftPayload(BaseModel):
    action_type: str
    contact_id: str
    contact_name: str
    document_id: Optional[str] = None
    document_number: Optional[str] = None
    amount: Decimal
    currency: str
    message: str
    payment_link_type: str = "paypal_sandbox"
    expected_financial_effect: str

class ActionDraftCreate(BaseModel):
    action_type: str
    target_contact_id: Optional[str] = None
    document_id: Optional[str] = None
    payload: ActionDraftPayload

class ActionDraftRead(BaseModel):
    id: str
    business_id: str
    action_type: str
    target_contact_id: Optional[str] = None
    document_id: Optional[str] = None
    payload_json: str
    payload_hash: str
    status: str
    created_by: str
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    execution_result: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True



class ActionApproveRequest(BaseModel):
    approved_by: str = "Owner"
    expected_payload_hash: str  # Must match stored payload_hash strictly!

class AIChatRequest(BaseModel):
    message: str
    conversation_history: Optional[List[Dict[str, str]]] = []

class AIChatResponse(BaseModel):
    answer: str
    tools_used: List[str]
    evidence: List[EvidenceRecord]
    assumptions: List[str]
    action_draft: Optional[ActionDraftRead] = None


# PayPal Integration
class PayPalCreateOrderRequest(BaseModel):
    document_id: str

class PayPalCreateOrderResponse(BaseModel):
    order_id: str
    approval_url: str
    status: str
    environment: str = "sandbox"
    document_id: str
    amount: Decimal
    currency: str
    paypal_amount: Optional[Decimal] = None
    paypal_currency: Optional[str] = None
    exchange_rate: Optional[str] = None

class PayPalCaptureOrderRequest(BaseModel):
    order_id: str
    document_id: Optional[str] = None

class PayPalReconcileResponse(BaseModel):
    reconciled: bool
    status: str
    document_id: str
    paid_amount: Decimal
    outstanding_amount: Decimal
    transaction_id: Optional[str] = None
    message: str


# Audit
class AuditEventRead(BaseModel):
    id: str
    business_id: str
    actor: str
    action: str
    entity_type: str
    entity_id: str
    reason: Optional[str] = None
    safe_metadata: Optional[str] = None
    timestamp: datetime

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True



class DecisionOption(BaseModel):
    id: str
    title: str
    action_type: str
    option_type: str = "general"  # collection_reminder, early_payment_discount, supplier_extension, financing_simulation, monitor_only
    availability: str = "available"  # available, conditional, unavailable
    availability_reason: Optional[str] = None
    description: str
    rationale: str
    currency: str = "INR"
    cash_amount: Decimal = Decimal("0.00")
    expected_timing: str = "collection timing unknown"
    known_direct_cost: Optional[Decimal] = Decimal("0.00")
    unknown_cost_fields: List[str] = []
    estimated_financial_impact: Decimal
    estimated_gap_effect: str = ""
    assumptions: List[str] = []
    risks: List[str] = []
    missing_inputs: List[str] = []
    evidence_supporting: str
    risks_and_assumptions: str = ""
    requires_approval: bool = True
    feasibility: str = "high"  # high, medium, low
    simulation_only: bool = False
    discount_rate: Optional[Decimal] = None
    discount_amount: Optional[Decimal] = None
    net_expected_receipt: Optional[Decimal] = None
    target_document_id: Optional[str] = None
    target_contact_id: Optional[str] = None


class DecisionEvaluateRequest(BaseModel):
    discount_rate: Optional[Decimal] = None  # e.g. Decimal("0.02") for 2% early discount
    supplier_agreement_confirmed: Optional[bool] = False
    supplier_extension_days: Optional[int] = 14
    supplier_extension_fee: Optional[Decimal] = None
    financing_simulation_inputs: Optional[Dict[str, Any]] = None


class DecisionCaseRead(BaseModel):
    id: str
    business_id: str
    title: str
    problem_type: str
    severity: str
    urgency: str
    time_horizon: str
    problem_statement: str
    supporting_records: List[Dict[str, Any]]
    calculations: Dict[str, Any]
    assumptions: List[str]
    status: str
    calculation_version: str = "cb_v1.0"
    as_of: Optional[datetime] = None
    is_stale: bool = False
    stale_reason: Optional[str] = None
    missing_data_warnings: List[str] = []
    recommended_option_id: str
    recommendation_rationale: str
    options: List[DecisionOption]
    selected_option_id: Optional[str] = None
    action_draft_id: Optional[str] = None
    target_document_id: Optional[str] = None
    target_contact_id: Optional[str] = None
    approved_at: Optional[datetime] = None
    executed_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    outcome_status: str
    authoritative_source: Optional[str] = None
    estimated_financial_impact: Decimal
    actual_financial_impact: Optional[Decimal] = None
    variance_amount: Optional[Decimal] = None
    outcome_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True



class DecisionSelectOptionRequest(BaseModel):
    option_id: Optional[str] = None
    selected_option_id: Optional[str] = None

    @model_validator(mode="after")
    def resolve_option_id(self):
        if not self.option_id and self.selected_option_id:
            self.option_id = self.selected_option_id
        if not self.option_id:
            raise ValueError("option_id is required")
        return self


class DecisionOutcomeLedgerItem(BaseModel):
    decision_id: str
    title: str
    created_at: datetime
    problem_type: str
    status: str
    outcome_status: str
    selected_option_id: Optional[str] = None
    calculation_version: str = "cb_v1.0"
    estimated_financial_impact: Decimal
    actual_financial_impact: Optional[Decimal] = None
    variance_amount: Optional[Decimal] = None
    authoritative_source: Optional[str] = None
    verified_at: Optional[datetime] = None
    outcome_notes: Optional[str] = None

    class Config:
        from_attributes = True

    class Config:
        from_attributes = True


# ============================================================================
# Co-Pilot & Financial Advisor Schemas (Features 1 - 7)
# ============================================================================

class AIBusinessPriority(BaseModel):
    rank: int
    title: str
    urgency: str  # critical, high, medium
    rationale: str
    action_suggestion: str
    target_page: Optional[str] = "advisor"


class AIDailyBriefingResponse(BaseModel):
    headline: str
    executive_summary: str
    recorded_cash: Decimal
    total_receivables: Decimal
    overdue_receivables: Decimal
    total_payables_due: Decimal
    projected_shortfall: Decimal
    shortfall_date: Optional[str] = None
    net_working_capital: Decimal
    quick_ratio: float
    recent_changes: List[str]
    top_priorities: List[AIBusinessPriority]
    provider_used: str
    ai_model: str
    generated_at: datetime


class HealthScoreFactor(BaseModel):
    category: str
    label: str
    score: int
    max_score: int = 20
    metric_value: str
    status: str  # excellent, good, warning, critical
    explanation: str
    tactical_tip: str


class FinancialHealthScoreResponse(BaseModel):
    overall_score: int
    rating: str  # Excellent, Stable, Attention Needed, Critical Risk
    summary_verdict: str
    factors: List[HealthScoreFactor]
    key_strengths: List[str]
    immediate_improvements: List[str]
    calculated_at: datetime


class FinancialRiskItem(BaseModel):
    id: str
    risk_type: str
    severity: str  # critical, high, medium
    title: str
    description: str
    impact_amount: Decimal
    evidence: List[EvidenceRecord]
    suggested_action: str
    action_draft_available: bool = False


class FinancialRisksResponse(BaseModel):
    risks: List[FinancialRiskItem]
    total_at_risk_amount: Decimal
    critical_risk_count: int


class AIRecommendationItem(BaseModel):
    id: str
    title: str
    category: str  # cash_flow, collections, supplier_terms, cost_control
    impact_amount: Decimal
    impact_type: str  # cash_boost, deficit_clear, cost_savings
    urgency: str  # immediate, this_week, upcoming
    description: str
    action_label: str
    target_page: str  # overview, invoices, decisions, advisor
    document_id: Optional[str] = None
    contact_name: Optional[str] = None


class AIRecommendationsResponse(BaseModel):
    recommendations: List[AIRecommendationItem]
    potential_liquidity_unlocked: Decimal


class WhatIfSimulationRequest(BaseModel):
    scenario_title: Optional[str] = "Custom Scenario"
    customer_payment_amount: Decimal = Decimal("0.00")
    customer_payment_day_offset: int = 1
    delay_supplier_days: int = 0
    delayed_supplier_bill_id: Optional[str] = None
    extra_expense_amount: Decimal = Decimal("0.00")
    revenue_growth_percent: Decimal = Decimal("0.00")


class WhatIfSimulationResponse(BaseModel):
    scenario_title: str
    baseline_cash: Decimal
    simulated_ending_cash: Decimal
    baseline_deficit: Decimal
    simulated_deficit: Decimal
    deficit_resolved: bool
    cash_variance: Decimal
    baseline_quick_ratio: float
    simulated_quick_ratio: float
    executive_narrative: str
    actionable_takeaway: str
    daily_trajectory_baseline: List[Dict[str, Any]]
    daily_trajectory_simulated: List[Dict[str, Any]]


class AIReportSaveRequest(BaseModel):
    title: Optional[str] = None
    report_type: str = "daily_briefing"
    notes: Optional[str] = None


class AIReportRead(BaseModel):
    id: str
    business_id: str
    report_type: str
    title: str
    health_score: int
    rating: str
    summary_markdown: str
    metrics: Dict[str, Any]
    priorities: List[Dict[str, Any]]
    risks: List[Dict[str, Any]]
    recommendations: List[Dict[str, Any]]
    created_at: datetime

    class Config:
        from_attributes = True
