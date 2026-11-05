export interface Business {
  id: string;
  name: string;
  business_type: string;
  country: string;
  default_currency: string;
  timezone: string;
  opening_cash_balance: number;
}

export interface Contact {
  id: string;
  name: string;
  contact_type: 'customer' | 'supplier' | 'both';
  email?: string;
  phone?: string;
  address?: string;
  credit_limit: number;
  default_payment_terms_days: number;
  status: string;
}

export interface Product {
  id: string;
  business_id?: string;
  sku: string;
  name: string;
  unit: string;
  sales_price: number;
  purchase_cost: number;
  current_stock: number;
  reorder_threshold: number;
  active: boolean;
}

export interface Transaction {
  id: string;
  business_id: string;
  transaction_type: 'inflow' | 'outflow' | 'transfer' | 'adjustment' | string;
  amount: number;
  currency: string;
  transaction_date: string;
  payment_method: 'paypal' | 'bank_transfer' | 'cash' | 'upi' | string;
  status: 'pending' | 'verified' | 'reconciled' | 'failed' | string;
  reference?: string;
  provider?: string;
  provider_payment_id?: string;
  contact_id?: string;
  contact_name?: string;
  description?: string;
  created_at: string;
}

export interface DocumentItem {
  id: string;
  product_id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  line_total: number;
}

export interface Document {
  id: string;
  business_id: string;
  document_type: 'invoice' | 'bill' | 'quotation';
  document_number: string;
  contact_id: string;
  contact_name?: string;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid_amount: number;
  outstanding_amount: number;
  status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'overdue' | 'voided';
  notes?: string;
  items: DocumentItem[];
}

export interface EvidenceRecord {
  record_type: string;
  id: string;
  label: string;
  amount?: number;
  date?: string;
  status?: string;
  due_date?: string;
}

export interface FinancialSummary {
  recorded_cash_balance: number;
  currency: string;
  period: string;
  total_sales_invoiced: number;
  total_collections: number;
  total_supplier_bills: number;
  total_expenses_paid: number;
  total_receivables: number;
  total_payables_due: number;
  net_cash_movement: number;
  shortfall_risk: boolean;
  projected_shortfall_amount: number;
  shortfall_date?: string;
  reporting_basis: string;
  assumptions: string[];
  supporting_evidence: EvidenceRecord[];
}

export interface ActionDraftPayload {
  action?: string;
  action_type?: string;
  contact_id?: string;
  contact_name?: string;
  document_id?: string;
  document_number?: string;
  amount?: number;
  original_amount?: number;
  discount_rate?: number;
  discount_amount?: number;
  net_amount?: number;
  currency?: string;
  message?: string;
  payment_link_type?: string;
  payment_provider?: string;
  expected_financial_effect?: string;
  decision_id?: string;
}

export interface ActionDraft {
  id: string;
  business_id: string;
  action_type: string;
  target_contact_id?: string;
  document_id?: string;
  payload_json: string;
  payload_hash: string;
  status: 'draft' | 'awaiting_approval' | 'approved' | 'executed' | 'rejected' | 'expired';
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  expires_at?: string;
  execution_result?: string;
  created_at: string;
}

export interface AIChatResponse {
  answer: string;
  tools_used: string[];
  evidence: EvidenceRecord[];
  assumptions: string[];
  action_draft?: ActionDraft;
}

export interface AuditEvent {
  id: string;
  business_id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  reason?: string;
  safe_metadata?: string;
  timestamp: string;
}

export interface DecisionOption {
  id: string;
  title: string;
  action_type: string;
  option_type?: string;
  availability?: 'available' | 'conditional' | 'unavailable' | string;
  availability_reason?: string;
  description?: string;
  rationale?: string;
  currency?: string;
  cash_amount?: number;
  expected_timing?: string;
  known_direct_cost?: number;
  unknown_cost_fields?: string[];
  estimated_financial_impact: number;
  estimated_gap_effect?: string;
  assumptions?: string[];
  risks?: string[];
  missing_inputs?: string[];
  evidence_supporting?: string;
  supporting_evidence_ref?: string;
  risks_and_assumptions?: string;
  requires_approval?: boolean;
  requires_owner_approval?: boolean;
  feasibility?: string;
  simulation_only?: boolean;
  discount_rate?: number;
  discount_amount?: number;
  net_expected_receipt?: number;
  target_document_id?: string;
  target_contact_id?: string;
}

export interface DecisionCase {
  id: string;
  business_id: string;
  title?: string;
  problem_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | string;
  urgency: 'immediate' | 'upcoming' | 'normal' | 'low' | 'medium' | 'high' | string;
  time_horizon: string;
  problem_statement: string;
  supporting_records: any;
  calculations: any;
  assumptions: string[];
  status: string;
  calculation_version?: string;
  as_of?: string;
  is_stale?: boolean;
  stale_reason?: string;
  missing_data_warnings?: string[];
  recommended_option_id: string;
  recommendation_rationale: string;
  options: DecisionOption[];
  selected_option_id?: string;
  action_draft_id?: string;
  target_document_id?: string;
  target_contact_id?: string;
  approved_at?: string;
  executed_at?: string;
  verified_at?: string;
  outcome_status: string;
  authoritative_source?: string;
  estimated_financial_impact?: number;
  actual_financial_impact?: number;
  variance_amount?: number;
  outcome_notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface DecisionOutcomeLedgerItem {
  decision_id: string;
  title?: string;
  created_at: string;
  problem_type?: string;
  problem_statement?: string;
  status: string;
  outcome_status: string;
  selected_option_id?: string;
  selected_option_title?: string;
  calculation_version?: string;
  action_draft_id?: string;
  approval_status?: string;
  authoritative_source?: string;
  estimated_financial_impact: number;
  actual_financial_impact?: number;
  variance_amount?: number;
  verified_at?: string;
  outcome_notes?: string;
}

export interface AIBusinessPriority {
  rank: number;
  title: string;
  urgency: 'critical' | 'high' | 'medium';
  rationale: string;
  action_suggestion: string;
  target_page?: string;
}

export interface AIDailyBriefing {
  headline: string;
  executive_summary: string;
  recorded_cash: number;
  total_receivables: number;
  overdue_receivables: number;
  total_payables_due: number;
  projected_shortfall: number;
  shortfall_date?: string | null;
  net_working_capital: number;
  quick_ratio: number;
  recent_changes: string[];
  top_priorities: AIBusinessPriority[];
  provider_used: string;
  ai_model: string;
  generated_at: string;
}

export interface HealthScoreFactor {
  category: string;
  label: string;
  score: number;
  max_score: number;
  metric_value: string;
  status: 'excellent' | 'good' | 'warning' | 'critical';
  explanation: string;
  tactical_tip: string;
}

export interface FinancialHealthScore {
  overall_score: number;
  rating: string;
  summary_verdict: string;
  factors: HealthScoreFactor[];
  key_strengths: string[];
  immediate_improvements: string[];
  calculated_at: string;
}

export interface FinancialRiskItem {
  id: string;
  risk_type: string;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  impact_amount: number;
  evidence: Array<{
    record_type: string;
    id: string;
    label: string;
    amount?: number;
    date?: string;
    due_date?: string;
    status?: string;
  }>;
  suggested_action: string;
  action_draft_available: boolean;
}

export interface FinancialRisksResponse {
  risks: FinancialRiskItem[];
  total_at_risk_amount: number;
  critical_risk_count: number;
}

export interface AIRecommendationItem {
  id: string;
  title: string;
  category: 'cash_flow' | 'collections' | 'supplier_terms' | 'cost_control';
  impact_amount: number;
  impact_type: 'cash_boost' | 'deficit_clear' | 'cost_savings';
  urgency: 'immediate' | 'this_week' | 'upcoming';
  description: string;
  action_label: string;
  target_page: string;
  document_id?: string;
  contact_name?: string;
}

export interface AIRecommendationsResponse {
  recommendations: AIRecommendationItem[];
  potential_liquidity_unlocked: number;
}

export interface WhatIfSimulationRequest {
  scenario_title?: string;
  customer_payment_amount?: number;
  customer_payment_day_offset?: number;
  delay_supplier_days?: number;
  delayed_supplier_bill_id?: string;
  extra_expense_amount?: number;
  revenue_growth_percent?: number;
}

export interface WhatIfSimulationResponse {
  scenario_title: string;
  baseline_cash: number;
  simulated_ending_cash: number;
  baseline_deficit: number;
  simulated_deficit: number;
  deficit_resolved: boolean;
  cash_variance: number;
  baseline_quick_ratio: number;
  simulated_quick_ratio: number;
  executive_narrative: string;
  actionable_takeaway: string;
  daily_trajectory_baseline: Array<{ date: string; cash: number }>;
  daily_trajectory_simulated: Array<{ date: string; cash: number }>;
}

export interface AIReport {
  id: string;
  business_id: string;
  report_type: string;
  title: string;
  health_score: number;
  rating: string;
  summary_markdown: string;
  metrics: {
    overall_health_score?: number;
    rating?: string;
    recorded_cash?: number;
    receivables?: number;
    payables?: number;
    net_cushion?: number;
    projected_shortfall?: number;
  };
  priorities: Array<{ rank: number; title: string }>;
  risks: Array<{ title: string; severity: string; impact: number }>;
  recommendations: Array<{ title: string; category: string; impact: number }>;
  created_at: string;
}

