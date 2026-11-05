'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Business, FinancialSummary, Document, ActionDraft, AuditEvent, Transaction, Contact } from '../types';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';
import { Overview } from './Overview';
import { InvoicesView } from './InvoicesView';
import { FinancialReportsView } from './FinancialReportsView';
import { AIAssistantView } from './AIAssistantView';
import { DecisionsView } from './DecisionsView';
import { ActivityView } from './ActivityView';
import { SettingsView } from './SettingsView';
import { ActionReviewModal } from './ActionReviewModal';
import { PayPalCheckoutModal } from './PayPalCheckoutModal';
import { RecordTransactionModal } from './RecordTransactionModal';
import { RecordOrderModal } from './RecordOrderModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [business, setBusiness] = useState<Business | null>(null);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [actionDrafts, setActionDrafts] = useState<ActionDraft[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string>('');
  const [invoicesSearchQuery, setInvoicesSearchQuery] = useState<string>('');

  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Modals state
  const [selectedReviewDraft, setSelectedReviewDraft] = useState<ActionDraft | null>(null);
  const [payPalDocId, setPayPalDocId] = useState<string | null>(null);
  const [recordTransactionDocId, setRecordTransactionDocId] = useState<string | null | undefined>(undefined);
  const [showRecordOrderModal, setShowRecordOrderModal] = useState<boolean>(false);

  const loadData = async () => {
    try {
      const [bizData, sumData, docsData, txsData, contactsData, draftsData, auditData] = await Promise.all([
        api.getActiveBusiness().catch(() => null),
        api.getFinancialSummary().catch(() => null),
        api.getDocuments().catch(() => []),
        api.getTransactions().catch(() => []),
        api.getContacts().catch(() => []),
        api.getActionDrafts().catch(() => []),
        api.getAuditEvents().catch(() => []),
      ]);

      if (bizData) setBusiness(bizData);
      if (sumData) setSummary(sumData);
      setDocuments(docsData);
      setTransactions(txsData);
      setContacts(contactsData);
      setActionDrafts(draftsData);
      setAuditEvents(auditData);
    } catch (err) {
      console.error('Error loading LedgerAI data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['overview', 'invoices', 'reports', 'ai-assistant', 'decisions', 'activity', 'settings'].includes(tabParam)) {
        setActiveTab(tabParam);
      }

      const paypalSuccess = params.get('paypal_success');
      const orderToken = params.get('token');
      const docIdParam = params.get('doc_id');

      if (paypalSuccess === 'true') {
        const reconcileAuto = async () => {
          try {
            if (orderToken) {
              const res = await api.capturePayPalOrder(orderToken, docIdParam || undefined);
              if (res.reconciled) {
                await loadData();
                setNotification({
                  message: res.message || 'PayPal Sandbox payment confirmed & reconciled! Cash balance and ledger updated.',
                  type: 'success',
                });
              } else {
                setNotification({
                  message: res.message || 'PayPal payment could not be reconciled.',
                  type: 'error',
                });
              }
            } else if (docIdParam) {
              const res = await api.reconcileDocumentPayPal(docIdParam);
              await loadData();
              setNotification({
                message: res.message || 'PayPal Sandbox payment confirmed & reconciled! Cash balance and ledger updated.',
                type: 'success',
              });
            }
          } catch (err: any) {
            console.error('PayPal auto-reconciliation error:', err);
            setNotification({
              message: `Reconciliation notice: ${err.message || 'Could not verify payment.'}`,
              type: 'error',
            });
          } finally {
            // Clean query parameters from URL
            window.history.replaceState({}, document.title, window.location.pathname + (tabParam ? `?tab=${tabParam}` : ''));
          }
        };

        reconcileAuto();
      }

      const onFocus = () => {
        loadData();
      };
      window.addEventListener('focus', onFocus);
      return () => {
        window.removeEventListener('focus', onFocus);
      };
    }
  }, []);

  const handleOpenAIWithPrompt = (prompt?: string) => {
    if (prompt) {
      setAiInitialPrompt(prompt);
    }
    setActiveTab('ai-assistant');
  };

  const handleDraftApproved = (documentId: string) => {
    setSelectedReviewDraft(null);
    setPayPalDocId(documentId);
    loadData();
  };

  const handleReconcilePayPal = async (documentId: string) => {
    try {
      await api.reconcileDocumentPayPal(documentId);
      await loadData();
      setNotification({
        message: 'PayPal order captured & reconciled successfully!',
        type: 'success',
      });
    } catch (e: any) {
      alert(`Reconciliation error: ${e.message}`);
    }
  };

  const handleResetDatabase = async () => {
    try {
      await api.resetDemoData();
      await loadData();
      setNotification({
        message: 'Demo database reset to original baseline state! Original cash (₹45,000), bills, and receivables restored.',
        type: 'success',
      });
    } catch (err: any) {
      alert(`Error resetting database: ${err.message}`);
    }
  };

  const pendingApprovalsCount = actionDrafts.filter(
    (d) => d.status === 'awaiting_approval'
  ).length;

  return (
    <div className="min-h-screen flex bg-[#f3f5fa] text-slate-900 selection:bg-indigo-500 selection:text-white">
      {/* Left Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingApprovalsCount={pendingApprovalsCount}
        onRefresh={loadData}
        onResetDatabase={handleResetDatabase}
        business={business}
      />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          pendingApprovalsCount={pendingApprovalsCount}
          onRefresh={loadData}
          business={business}
          documents={documents}
          transactions={transactions}
          onSearchInvoices={(query) => {
            setInvoicesSearchQuery(query);
            setActiveTab('invoices');
          }}
          onSelectDocument={(doc) => {
            setInvoicesSearchQuery(doc.document_number);
            setActiveTab('invoices');
          }}
          onSelectTransaction={() => {
            setActiveTab('activity');
          }}
          onOpenPendingApproval={() => {
            const pending = actionDrafts.find((d) => d.status === 'awaiting_approval');
            if (pending) setSelectedReviewDraft(pending);
          }}
        />

        {notification && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 w-full">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold animate-fade-in shadow-sm">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>{notification.message}</span>
              </div>
              <button
                onClick={() => setNotification(null)}
                className="text-emerald-700 hover:text-emerald-900 ml-4 font-bold text-sm"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {loading ? (
            <div className="py-24 text-center space-y-4">
              <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p className="text-xs text-slate-500">Loading working capital workspace...</p>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <Overview
                  summary={summary}
                  documents={documents}
                  transactions={transactions}
                  actionDrafts={actionDrafts}
                  auditEvents={auditEvents}
                  onOpenAI={handleOpenAIWithPrompt}
                  onOpenInvoices={() => setActiveTab('invoices')}
                  onOpenDecisions={() => setActiveTab('decisions')}
                  onOpenReports={() => setActiveTab('reports')}
                  onOpenRecordTransaction={(docId?: string) => setRecordTransactionDocId(docId ?? null)}
                  onOpenRecordOrder={() => setShowRecordOrderModal(true)}
                  onOpenReviewModal={(draft) => setSelectedReviewDraft(draft)}
                />
              )}

              {activeTab === 'invoices' && (
                <InvoicesView
                  documents={documents}
                  availableCash={summary?.recorded_cash_balance ?? 0}
                  initialSearchQuery={invoicesSearchQuery}
                  onSearchQueryChange={setInvoicesSearchQuery}
                  onInitiatePayPal={(doc) => setPayPalDocId(doc.id)}
                  onReconcilePayPal={handleReconcilePayPal}
                  onRefresh={loadData}
                  onSimulateExtension={() => setActiveTab('decisions')}
                  onOpenRecordTransaction={(docId?: string) => setRecordTransactionDocId(docId ?? null)}
                  onOpenRecordOrder={() => setShowRecordOrderModal(true)}
                />
              )}

              {activeTab === 'reports' && (
                <FinancialReportsView
                  summary={summary}
                  documents={documents}
                  transactions={transactions}
                  onOpenInvoices={() => setActiveTab('invoices')}
                  onOpenRecordTransaction={(docId?: string) => setRecordTransactionDocId(docId ?? null)}
                  currency={summary?.currency || 'INR'}
                />
              )}

              {activeTab === 'ai-assistant' && (
                <AIAssistantView
                  initialPrompt={aiInitialPrompt}
                  onOpenReviewModal={(draft) => setSelectedReviewDraft(draft)}
                  onRefreshData={loadData}
                  onNavigateToDecisions={() => setActiveTab('decisions')}
                  onNavigateToInvoices={() => setActiveTab('invoices')}
                  onNavigateToOverview={() => setActiveTab('overview')}
                />
              )}

              {activeTab === 'decisions' && (
                <DecisionsView
                  onOpenReviewModal={(draft) => setSelectedReviewDraft(draft)}
                  onRefreshData={loadData}
                />
              )}

              {activeTab === 'activity' && (
                <ActivityView
                  auditEvents={auditEvents}
                  transactions={transactions}
                  onRefresh={loadData}
                  onOpenRecordTransaction={(docId?: string) => setRecordTransactionDocId(docId ?? null)}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView onResetSuccess={loadData} />
              )}
            </>
          )}
        </main>

        {/* Action Review Modal */}
        {selectedReviewDraft && (
          <ActionReviewModal
            draft={selectedReviewDraft}
            onClose={() => setSelectedReviewDraft(null)}
            onApproved={handleDraftApproved}
          />
        )}

        {/* Customer Payment Link Dispatch & Reconciliation Modal */}
        {payPalDocId && (
          <PayPalCheckoutModal
            documentId={payPalDocId}
            document={documents.find((d) => d.id === payPalDocId)}
            onClose={() => setPayPalDocId(null)}
            onPaymentSuccess={loadData}
          />
        )}

        {/* Customer Order Entry Modal (Today's Sales Records) */}
        {showRecordOrderModal && (
          <RecordOrderModal
            contacts={contacts}
            onClose={() => setShowRecordOrderModal(false)}
            onOrderCreated={async () => {
              await loadData();
              setNotification({
                message: "Customer order recorded successfully into database! Financial charts and balances updated.",
                type: 'success',
              });
            }}
          />
        )}

        {/* Real Business Transaction Entry Modal */}
        {recordTransactionDocId !== undefined && (
          <RecordTransactionModal
            documents={documents}
            preselectedDocId={recordTransactionDocId}
            availableCash={summary?.recorded_cash_balance ?? 0}
            onNavigateToDecisions={() => {
              setRecordTransactionDocId(undefined);
              setActiveTab('decisions');
            }}
            onClose={() => setRecordTransactionDocId(undefined)}
            onTransactionRecorded={async () => {
              await loadData();
              setNotification({
                message: 'Transaction successfully committed to ledger & verified in database!',
                type: 'success',
              });
            }}
          />
        )}

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
          <p>LedgerAI Working Capital Command Center • Designed for Business Owners • PayPal Developer Platform</p>
        </footer>
      </div>
    </div>
  );
}
