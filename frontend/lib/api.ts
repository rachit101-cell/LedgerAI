import {
  Business, Contact, Document, FinancialSummary, AIChatResponse,
  ActionDraft, AuditEvent, DecisionCase, DecisionOutcomeLedgerItem,
  Product, Transaction, AIDailyBriefing, FinancialHealthScore,
  FinancialRisksResponse, AIRecommendationsResponse,
  WhatIfSimulationRequest, WhatIfSimulationResponse, AIReport
} from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api/v1';

const OWNER_TOKEN = process.env.NEXT_PUBLIC_OWNER_TOKEN || 'ledgerai-owner-token-secret-2026';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OWNER_TOKEN}`,
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export const api = {
  getHealth: () => fetchJson<{ status: string; paypal_mode: string; ai_provider: string }>('/health'),
  getActiveBusiness: () => fetchJson<Business>('/businesses/active'),
  getContacts: (type?: string) => fetchJson<Contact[]>(type ? `/contacts?contact_type=${type}` : '/contacts'),
  getProducts: () => fetchJson<Product[]>('/products'),
  getDocuments: (type?: string, status?: string) => {
    const params = new URLSearchParams();
    if (type) params.append('document_type', type);
    if (status) params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return fetchJson<Document[]>(`/documents${query}`);
  },
  getDocument: (id: string) => fetchJson<Document>(`/documents/${id}`),
  createDocument: (data: any) => fetchJson<Document>('/documents', { method: 'POST', body: JSON.stringify(data) }),
  voidDocument: (id: string) => fetchJson<Document>(`/documents/${id}/void`, { method: 'POST' }),
  getFinancialSummary: (daysAhead = 14) => fetchJson<FinancialSummary>(`/reports/summary?days_ahead=${daysAhead}`),
  getAnomalies: () => fetchJson<any[]>('/reports/anomalies'),
  chatWithAI: (message: string) => fetchJson<AIChatResponse>('/ai/chat', { method: 'POST', body: JSON.stringify({ message }) }),
  getActionDrafts: () => fetchJson<ActionDraft[]>('/action-drafts'),
  approveActionDraft: (draftId: string, payloadHash: string, approvedBy = 'Owner') =>
    fetchJson<{ success: boolean; message: string; document_id?: string }>(`/action-drafts/${draftId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approved_by: approvedBy, expected_payload_hash: payloadHash }),
    }),
  rejectActionDraft: (draftId: string) =>
    fetchJson<{ success: boolean; message: string }>(`/action-drafts/${draftId}/reject`, { method: 'POST' }),
  createPayPalOrder: (documentId: string) =>
    fetchJson<{
      order_id: string;
      approval_url: string;
      amount: number;
      currency: string;
      paypal_amount?: number;
      paypal_currency?: string;
      exchange_rate?: string;
    }>(
      '/integrations/paypal/create-order',
      { method: 'POST', body: JSON.stringify({ document_id: documentId }) }
    ),
  capturePayPalOrder: (orderId: string, documentId?: string) =>
    fetchJson<{ reconciled: boolean; paid_amount: number; outstanding_amount: number; message: string }>(
      '/integrations/paypal/capture-order',
      { method: 'POST', body: JSON.stringify({ order_id: orderId, document_id: documentId || undefined }) }
    ),
  reconcileDocumentPayPal: (documentId: string) =>
    fetchJson<{ reconciled: boolean; paid_amount: number; outstanding_amount: number; message: string }>(
      `/integrations/paypal/reconcile/${documentId}`,
      { method: 'POST' }
    ),
  getAuditEvents: () => fetchJson<AuditEvent[]>('/audit-events'),
  resetDemoData: () => fetchJson<Business>('/demo/reset', { method: 'POST' }),
  getDecisions: () => fetchJson<DecisionCase[]>('/decisions'),
  evaluateDecision: (req?: {
    discount_rate?: number;
    supplier_agreement_confirmed?: boolean;
    supplier_extension_days?: number;
    supplier_extension_fee?: number;
    financing_simulation_inputs?: any;
  }) =>
    fetchJson<DecisionCase>('/decisions/evaluate', {
      method: 'POST',
      body: req ? JSON.stringify(req) : undefined,
    }),
  getDecision: (id: string) => fetchJson<DecisionCase>(`/decisions/${id}`),
  selectDecisionOption: (decisionId: string, optionId: string) =>
    fetchJson<DecisionCase>(`/decisions/${decisionId}/select-option`, {
      method: 'POST',
      body: JSON.stringify({ option_id: optionId, selected_option_id: optionId }),
    }),
  recordDecisionOutcome: (decisionId: string, outcomeStatus: string, notes?: string) =>
    fetchJson<DecisionCase>(
      `/decisions/${decisionId}/record-outcome?outcome_status=${encodeURIComponent(outcomeStatus)}${notes ? `&notes=${encodeURIComponent(notes)}` : ''}`,
      { method: 'POST' }
    ),
  getDecisionOutcomeLedger: () => fetchJson<DecisionOutcomeLedgerItem[]>('/decisions/ledger/outcomes'),
  getTransactions: () => fetchJson<Transaction[]>('/payments'),
  recordPayment: (data: {
    document_id?: string;
    contact_id?: string;
    amount: number;
    payment_method?: string;
    reference?: string;
    description?: string;
  }) =>
    fetchJson<Transaction>('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // AI Co-Pilot & Financial Advisor API Endpoints
  getAIBriefing: () => fetchJson<AIDailyBriefing>('/ai/briefing'),
  getFinancialHealthScore: () => fetchJson<FinancialHealthScore>('/ai/health-score'),
  getFinancialRisks: () => fetchJson<FinancialRisksResponse>('/ai/risks'),
  getAIRecommendations: () => fetchJson<AIRecommendationsResponse>('/ai/recommendations'),
  simulateWhatIfScenario: (data: WhatIfSimulationRequest) =>
    fetchJson<WhatIfSimulationResponse>('/ai/simulate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getAIReports: () => fetchJson<AIReport[]>('/ai/reports'),
  saveAIReport: (title?: string, reportType = 'daily_briefing') =>
    fetchJson<AIReport>('/ai/reports/save', {
      method: 'POST',
      body: JSON.stringify({ title, report_type: reportType }),
    }),
};

