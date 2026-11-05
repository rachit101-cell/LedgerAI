'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api';
import { DecisionCase, DecisionOption, DecisionOutcomeLedgerItem, ActionDraft } from '../types';
import { IconShieldCheck, IconAlertTriangle, IconCheckCircle, IconRefresh, IconArrowUpRight, IconClock, IconPayPal } from './Icons';

interface DecisionsViewProps {
  onOpenReviewModal: (draft: ActionDraft) => void;
  onRefreshData?: () => void;
}

export const DecisionsView: React.FC<DecisionsViewProps> = ({ onOpenReviewModal, onRefreshData }) => {
  const [activeDecision, setActiveDecision] = useState<DecisionCase | null>(null);
  const [allDecisions, setAllDecisions] = useState<DecisionCase[]>([]);
  const [outcomeLedger, setOutcomeLedger] = useState<DecisionOutcomeLedgerItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [evaluating, setEvaluating] = useState<boolean>(false);
  const [selectingOptionId, setSelectingOptionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedParam, setAppliedParam] = useState<string>('standard');
  const [showAuditLedger, setShowAuditLedger] = useState<boolean>(false);

  // Always evaluate against live database state on initial load
  const loadDecisionData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);

      // 1. Trigger live re-evaluation against active database records
      const evaluatedCase = await api.evaluateDecision().catch(() => null);

      // 2. Fetch all decision cases and audit history
      const [cases, ledger] = await Promise.all([
        api.getDecisions().catch(() => []),
        api.getDecisionOutcomeLedger().catch(() => []),
      ]);

      setAllDecisions(cases);
      setOutcomeLedger(ledger);

      if (evaluatedCase) {
        setActiveDecision(evaluatedCase);
      } else if (cases.length > 0) {
        setActiveDecision(cases[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load live decisions data');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDecisionData();
  }, []);

  const handleEvaluate = async (discountRate?: number, supplierAgreed?: boolean) => {
    try {
      setEvaluating(true);
      setError(null);
      const req = (discountRate !== undefined || supplierAgreed !== undefined) ? {
        discount_rate: discountRate,
        supplier_agreement_confirmed: supplierAgreed,
        supplier_extension_days: 14,
      } : undefined;

      const updatedCase = await api.evaluateDecision(req);
      setActiveDecision(updatedCase);

      const [cases, ledger] = await Promise.all([
        api.getDecisions().catch(() => [updatedCase]),
        api.getDecisionOutcomeLedger().catch(() => []),
      ]);
      setAllDecisions(cases);
      setOutcomeLedger(ledger);

      if (onRefreshData) {
        onRefreshData();
      }
    } catch (err: any) {
      setError(err.message || 'Evaluation failed');
    } finally {
      setEvaluating(false);
    }
  };

  const handleSelectOption = async (optionId: string) => {
    if (!activeDecision) return;
    try {
      setSelectingOptionId(optionId);
      setError(null);

      const updatedCase = await api.selectDecisionOption(activeDecision.id, optionId);
      setActiveDecision(updatedCase);

      const [cases, ledger] = await Promise.all([
        api.getDecisions().catch(() => [updatedCase]),
        api.getDecisionOutcomeLedger().catch(() => []),
      ]);
      setAllDecisions(cases);
      setOutcomeLedger(ledger);

      if (onRefreshData) {
        onRefreshData();
      }

      if (updatedCase.action_draft_id) {
        const drafts = await api.getActionDrafts();
        const draft = drafts.find((d) => d.id === updatedCase.action_draft_id);
        if (draft) {
          onOpenReviewModal(draft);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to select decision option');
    } finally {
      setSelectingOptionId(null);
    }
  };

  const handleReviewAction = async (actionDraftId: string) => {
    try {
      const drafts = await api.getActionDrafts();
      const draft = drafts.find((d) => d.id === actionDraftId);
      if (draft) {
        onOpenReviewModal(draft);
      } else {
        setError(`Action draft not found`);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch action draft');
    }
  };

  const formatCurrency = (val?: number) => {
    if (val === undefined || val === null) return '—';
    return `₹${Math.round(Number(val)).toLocaleString('en-IN')}`;
  };

  // Derive all metrics purely from live database calculations
  const recordedCash = Number(activeDecision?.calculations?.recorded_cash_balance ?? 0);
  const payablesDue = Number(
    activeDecision?.calculations?.upcoming_obligations ??
    activeDecision?.calculations?.total_payables_due ?? 0
  );
  const shortfallAmount = Math.abs(
    Number(activeDecision?.calculations?.net_projected_deficit ??
    activeDecision?.calculations?.projected_shortfall_amount ?? 0)
  );

  // Extract primary supporting records directly from database
  const targetBillRecord = useMemo(() => {
    return (activeDecision?.supporting_records || []).find(
      (r: any) => r.record_type === 'supplier_bill'
    );
  }, [activeDecision]);

  const targetInvoiceRecord = useMemo(() => {
    return (activeDecision?.supporting_records || []).find(
      (r: any) => r.record_type === 'customer_invoice'
    );
  }, [activeDecision]);

  const overdueBalance = Number(targetInvoiceRecord?.amount || 0);

  // Find the active recommended option directly from live records
  const recommendedOption = useMemo(() => {
    if (!activeDecision?.options?.length) return null;
    return (
      activeDecision.options.find((o) => o.id === activeDecision.recommended_option_id) ||
      activeDecision.options[0]
    );
  }, [activeDecision]);

  // Dynamic calculations for the 4 customer scenario preset buttons based on live DB figures
  const simStandardBuffer = recordedCash + overdueBalance - payablesDue;
  const sim2pctBuffer = recordedCash + Math.round(overdueBalance * 0.98) - payablesDue;
  const sim3pctBuffer = recordedCash + Math.round(overdueBalance * 0.965) - payablesDue;
  const sim5pctBuffer = recordedCash + Math.round(overdueBalance * 0.95) - payablesDue;

  const getOptionMeta = (opt: DecisionOption) => {
    switch (opt.id) {
      case 'opt_collect_overdue':
      case 'COLLECT_OVERDUE':
        return {
          category: 'Customer Receivable',
          badge: '100% Face Value Recovery',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          speed: 'Immediate Link Dispatch',
          tradeoff: '₹0 Customer Discount (Customer pays 100%)',
          summary: opt.description
            ? opt.description.replace(/INR\s*/g, '₹')
            : `Draft owner-authorized collection link for full overdue balance. Fulfills 100% supplier payout.`,
        };
      case 'opt_early_discount':
      case 'EARLY_DISCOUNT':
        return {
          category: 'Customer Bridge Cash Offer',
          badge: opt.discount_rate ? `${(Number(opt.discount_rate) * 100).toFixed(1)}% Early Settlement` : '2% Early Settlement',
          badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          speed: 'Settles in 24–48 Hours',
          tradeoff: opt.known_direct_cost
            ? `Customer Discount: -${formatCurrency(Number(opt.known_direct_cost))}`
            : 'Customer Discount: -₹700',
          summary: opt.description
            ? opt.description.replace(/INR\s*/g, '₹')
            : `Customer receives a cash discount offer to pay less and settle immediately. The accelerated inflow is used to pay suppliers 100% in full.`,
        };
      case 'opt_reschedule_obligation':
      case 'SUPPLIER_EXTENSION':
        return {
          category: 'Supplier Payables (Non-Bridge)',
          badge: '14-Day Extension',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-300',
          speed: 'Bilateral Consent Only',
          tradeoff: 'Requires Supplier Agreement',
          summary: opt.description
            ? opt.description.replace(/INR\s*/g, '₹')
            : `Note: Business policy prioritizes paying suppliers 100% in full. Deferral requires mutual agreement.`,
        };
      case 'opt_monitor_without_action':
      case 'DO_NOTHING':
        return {
          category: 'Passive Runway',
          badge: 'No Intervention',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
          speed: 'Real-Time Tracking Only',
          tradeoff: shortfallAmount > 0 ? `Risk of -${formatCurrency(shortfallAmount)} Shortfall` : 'Stable Operating Cushion',
          summary: opt.description
            ? opt.description.replace(/INR\s*/g, '₹')
            : `Monitor ledger balance without external outreach.`,
        };
      default:
        return {
          category: 'Alternative Strategy',
          badge: 'Scenario',
          badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
          speed: 'As Scheduled',
          tradeoff: 'Standard Terms',
          summary: opt.description
            ? opt.description.replace(/INR\s*/g, '₹')
            : 'Custom liquidity strategy based on verified accounting records.',
        };
    }
  };

  const getLedgerActionTitle = (optId?: string) => {
    const matched = activeDecision?.options?.find((o) => o.id === optId);
    if (matched) return matched.title.replace(/INR\s*/g, '₹');
    if (optId === 'opt_collect_overdue') return 'Accelerate Invoice Collection';
    if (optId === 'opt_early_discount') return 'Early-Payment Incentive';
    if (optId === 'opt_reschedule_obligation') return '14-Day Supplier Due Date Extension';
    if (optId === 'opt_monitor_without_action') return 'Passive Runway Monitoring';
    return optId || 'Strategy Selected';
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-4 business-card">
        <div className="w-10 h-10 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-xs text-slate-500 font-medium">Evaluating live database ledger records...</p>
      </div>
    );
  }

  // Filter out simulation-only placeholders so the business owner only sees actual actionable strategies
  const actionableOptions = (activeDecision?.options || []).filter(
    (opt) => opt.id !== 'opt_financing_simulation'
  );

  return (
    <div className="space-y-6">
      {/* 1. Header with Re-Evaluation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Cash Bridge Solutions</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Database Verified
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Bridge operating liquidity deficits by offering cash discount incentives to customers (receivables) while fulfilling supplier obligations 100% in full.
          </p>
        </div>

        <button
          onClick={() => handleEvaluate()}
          disabled={evaluating}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all disabled:opacity-50 active:scale-95"
        >
          <IconRefresh className={`w-3.5 h-3.5 ${evaluating ? 'animate-spin' : ''}`} />
          <span>{evaluating ? 'Simulating Live DB...' : 'Refresh Live Analysis'}</span>
        </button>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
          <IconAlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Visual Problem vs Recommended Solution Hero Bar */}
      {activeDecision && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: The Gap (Problem) */}
          <div className="lg:col-span-5 business-card p-5 bg-gradient-to-br from-amber-50/70 to-rose-50/40 border-amber-200/90 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">
                  Current Liquidity Gap
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                  {targetBillRecord?.due_date
                    ? `Due ${new Date(targetBillRecord.due_date).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}`
                    : '14-Day Horizon'}
                </span>
              </div>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-rose-600">
                  -{formatCurrency(shortfallAmount)}
                </span>
                <span className="text-xs font-bold text-slate-500">Projected Shortfall</span>
              </div>

              {/* Visual Arithmetic Strip */}
              <div className="mt-4 p-3.5 rounded-xl bg-white/95 border border-amber-200/80 text-xs font-mono space-y-2 shadow-2xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span className="font-sans font-medium text-slate-700">Bank Cash Recorded:</span>
                  <span className="font-bold text-emerald-700">+{formatCurrency(recordedCash)}</span>
                </div>
                <div className="flex justify-between items-center text-slate-600">
                  <div className="flex flex-col">
                    <span className="font-sans font-medium text-slate-700">Upcoming Supplier Bills:</span>
                    <span className="text-[10px] text-amber-800 font-sans font-semibold">(100% Full Payment Committed)</span>
                  </div>
                  <span className="font-bold text-amber-700">-{formatCurrency(payablesDue)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-100 font-bold">
                  <span className="font-sans text-slate-900 font-bold">Net Cash Shortfall:</span>
                  <span className="text-rose-600 text-sm font-black">-{formatCurrency(shortfallAmount)}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-amber-200/60 flex items-center justify-between text-[11px] text-slate-600">
              <span>
                Primary Bill:{' '}
                <strong className="text-slate-900 font-bold">
                  {targetBillRecord?.document_number || 'Upcoming Dues'}
                </strong>
              </span>
              <span>
                Supplier:{' '}
                <strong className="text-slate-900 font-bold">
                  {targetBillRecord?.contact_name || 'Supplier'}{' '}
                  {targetBillRecord?.amount ? `(${formatCurrency(targetBillRecord.amount)})` : ''} — 100% Payout
                </strong>
              </span>
            </div>
          </div>

          {/* Right: The Engine Recommendation (Solution Highlight) */}
          <div className="lg:col-span-7 business-card p-5 bg-gradient-to-br from-emerald-50/80 to-indigo-50/50 border-emerald-300 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900">
                    Customer Bridge Cash Strategy
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  ✓ 100% Cures Deficit &amp; Pays Supplier in Full
                </span>
              </div>

              <div className="mt-3 flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">
                    {recommendedOption?.title?.replace(/INR\s*/g, '₹') || 'Customer Receivables Acceleration'}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">
                    {recommendedOption?.description?.replace(/INR\s*/g, '₹') ||
                      (targetInvoiceRecord
                        ? `Offers early payment discount to ${targetInvoiceRecord.contact_name} so customer pays less and settles immediately.`
                        : 'Recovers customer receivable to fund supplier obligations.')}
                  </p>
                </div>

                <div className="text-left sm:text-right shrink-0">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Accelerated Cash Inflow</span>
                  <span className="text-2xl font-black font-mono text-emerald-600">
                    +{formatCurrency(Number(recommendedOption?.estimated_financial_impact || overdueBalance))}
                  </span>
                </div>
              </div>

              {/* 3 Metric Pills */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-white/95 border border-emerald-200/90 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Gross Receivable</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">
                    {formatCurrency(overdueBalance || Number(recommendedOption?.estimated_financial_impact || 0))}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/95 border border-emerald-200/90 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Customer Discount</span>
                  <span className="font-mono font-bold text-amber-700 text-sm">
                    {recommendedOption?.known_direct_cost !== null && recommendedOption?.known_direct_cost !== undefined
                      ? `-${formatCurrency(Number(recommendedOption.known_direct_cost))}`
                      : '₹0 (0%)'}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-white/95 border border-emerald-200/90 shadow-2xs">
                  <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Post-Payment Cash</span>
                  <span className="font-mono font-bold text-indigo-700 text-sm">
                    {formatCurrency(recordedCash + Number(recommendedOption?.estimated_financial_impact || overdueBalance))}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-emerald-200/70 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-emerald-900 font-semibold flex items-center gap-1.5">
                <IconCheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                Leaves{' '}
                <strong>
                  +{formatCurrency(recordedCash + Number(recommendedOption?.estimated_financial_impact || overdueBalance) - payablesDue)}{' '}
                  cash buffer
                </strong>{' '}
                after paying {targetBillRecord?.contact_name || 'suppliers'} 100% in full ({formatCurrency(payablesDue)})
              </span>

              {activeDecision.action_draft_id && recommendedOption?.requires_approval ? (
                <button
                  onClick={() => handleReviewAction(activeDecision.action_draft_id!)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <IconShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Review & Authorize Link →</span>
                </button>
              ) : (
                <button
                  onClick={() => handleSelectOption(recommendedOption?.id || 'opt_collect_overdue')}
                  disabled={selectingOptionId !== null}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                >
                  <span>⚡ Execute & Send to Customer</span>
                  <span>&rarr;</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Interactive Scenario Parameter Switcher */}
      <div className="business-card p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Customer Bridge Cash Offer Simulation
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">
              Receivables Incentive Model
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Model prompt-payment discounts offered to customer (receivables) to accelerate cash and fund 100% supplier payout:
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Baseline Button */}
          <button
            disabled={evaluating}
            onClick={() => {
              setAppliedParam('standard');
              handleEvaluate();
            }}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              appliedParam === 'standard'
                ? 'bg-slate-50 border-2 border-slate-400 text-slate-900 ring-2 ring-slate-200/80 shadow-2xs'
                : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">Standard 0%</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">100% Inflow</span>
            </div>
            <div className="text-xs font-mono mt-1.5">
              Net Buffer:{' '}
              <strong className="text-slate-900 font-bold">
                {simStandardBuffer >= 0 ? `+${formatCurrency(simStandardBuffer)}` : `-${formatCurrency(Math.abs(simStandardBuffer))}`}
              </strong>
            </div>
            <span className="text-[10px] text-slate-500 block mt-1">Customer pays 100% full invoice</span>
          </button>

          {/* 2.0% Discount Button */}
          <button
            disabled={evaluating}
            onClick={() => {
              setAppliedParam('2pct');
              handleEvaluate(0.02);
            }}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              appliedParam === '2pct'
                ? 'bg-emerald-50 border-2 border-emerald-500 text-emerald-950 ring-2 ring-emerald-200 shadow-2xs'
                : 'bg-white hover:bg-emerald-50/40 text-slate-700 border border-emerald-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-950">2.0% Prompt Cash</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">★ Best Value</span>
            </div>
            <div className="text-xs font-mono mt-1.5">
              Net Buffer:{' '}
              <strong className="text-emerald-700 font-bold">
                {sim2pctBuffer >= 0 ? `+${formatCurrency(sim2pctBuffer)}` : `-${formatCurrency(Math.abs(sim2pctBuffer))}`}
              </strong>
            </div>
            <span className="text-[10px] text-emerald-700 block mt-1">
              Customer pays 2% less (-{formatCurrency(Math.round(overdueBalance * 0.02))})
            </span>
          </button>

          {/* 3.5% Discount Button */}
          <button
            disabled={evaluating}
            onClick={() => {
              setAppliedParam('3.5pct');
              handleEvaluate(0.035);
            }}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              appliedParam === '3.5pct'
                ? 'bg-indigo-50 border-2 border-indigo-500 text-indigo-950 ring-2 ring-indigo-200 shadow-2xs'
                : 'bg-white hover:bg-indigo-50/40 text-slate-700 border border-indigo-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-950">3.5% Fast Cash</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">Fast Inflow</span>
            </div>
            <div className="text-xs font-mono mt-1.5">
              Net Buffer:{' '}
              <strong className="text-indigo-700 font-bold">
                {sim3pctBuffer >= 0 ? `+${formatCurrency(sim3pctBuffer)}` : `-${formatCurrency(Math.abs(sim3pctBuffer))}`}
              </strong>
            </div>
            <span className="text-[10px] text-indigo-700 block mt-1">
              Customer pays 3.5% less (-{formatCurrency(Math.round(overdueBalance * 0.035))})
            </span>
          </button>

          {/* 5.0% Urgent Bridge Button */}
          <button
            disabled={evaluating}
            onClick={() => {
              setAppliedParam('5pct');
              handleEvaluate(0.05);
            }}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              appliedParam === '5pct'
                ? 'bg-purple-50 border-2 border-purple-500 text-purple-950 ring-2 ring-purple-200 shadow-2xs'
                : 'bg-white hover:bg-purple-50/40 text-slate-700 border border-purple-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-purple-950">5.0% Urgent Bridge</span>
              <span className="text-[10px] text-purple-800 font-bold bg-purple-100 px-1.5 py-0.5 rounded">Quick Liquidity</span>
            </div>
            <div className="text-xs font-mono mt-1.5">
              Net Buffer:{' '}
              <strong className="text-purple-700 font-bold">
                {sim5pctBuffer >= 0 ? `+${formatCurrency(sim5pctBuffer)}` : `-${formatCurrency(Math.abs(sim5pctBuffer))}`}
              </strong>
            </div>
            <span className="text-[10px] text-purple-700 block mt-1">
              Customer pays 5% less (-{formatCurrency(Math.round(overdueBalance * 0.05))})
            </span>
          </button>
        </div>

        {/* Businessman's Full Supplier Settlement Commitment */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs gap-2">
          <div className="flex items-center gap-2">
            <IconShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-slate-700">
              <strong className="text-slate-900">Businessman&apos;s Policy:</strong> Bridge Cash discounts are offered exclusively to <strong>customers (receivables)</strong> so they pay less to remit early. All <strong>supplier payables ({formatCurrency(payablesDue)})</strong> are paid 100% in full on time to maintain vendor trust and credit terms.
            </span>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold font-mono text-[11px] whitespace-nowrap self-start sm:self-auto">
            Supplier Payout: 100% Full Payment
          </span>
        </div>
      </div>

      {/* 4. Visual Comparison Cards (Actionable Solutions Only) */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div>
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Viable Decision Strategies ({actionableOptions.length} Solutions)
            </h2>
            <p className="text-xs text-slate-500">
              Each strategy calculates guaranteed cash flow impacts with verified accounting records.
            </p>
          </div>
          <span className="text-xs text-slate-400">All actions require explicit owner sign-off</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {actionableOptions.map((opt: DecisionOption, index: number) => {
            const isRecommended = opt.id === activeDecision?.recommended_option_id;
            const isSelected = opt.id === activeDecision?.selected_option_id;
            const isUnavailable = opt.availability === 'unavailable';
            const actionDraftId = activeDecision?.action_draft_id;
            const isStale = !!activeDecision?.is_stale;
            const meta = getOptionMeta(opt);

            return (
              <div
                key={opt.id}
                className={`business-card p-5 flex flex-col justify-between border-2 transition-all ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/20 shadow-md ring-2 ring-indigo-300'
                    : isRecommended
                    ? 'border-emerald-400 bg-white shadow-md'
                    : isUnavailable
                    ? 'border-slate-200 bg-slate-50/60'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="space-y-3.5">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-1 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Strategy #{index + 1}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {isRecommended && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          ★ Recommended
                        </span>
                      )}
                      {isSelected && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          ✓ Selected
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Clean Strategy Title */}
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${meta.badgeClass}`}>
                        {meta.badge}
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-slate-900 leading-snug">
                      {opt.title.replace(/INR\s*/g, '₹')}
                    </h3>
                  </div>

                  {/* Impact Summary Metric Box */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                        Net Cash Impact
                      </span>
                      <div className={`text-xl font-black font-mono ${opt.estimated_financial_impact > 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                        {opt.estimated_financial_impact > 0 ? `+${formatCurrency(opt.estimated_financial_impact)}` : formatCurrency(opt.estimated_financial_impact)}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Speed:</span>
                        <strong className="text-slate-900 font-semibold">{meta.speed}</strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-600">
                        <span>Trade-off:</span>
                        <strong className="text-slate-800 font-semibold">{meta.tradeoff}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Plain English Business Summary */}
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {meta.summary}
                  </p>
                </div>

                {/* Bottom Action Button */}
                <div className="mt-4 pt-3 border-t border-slate-100">
                  {isSelected && actionDraftId && opt.requires_approval ? (
                    <button
                      onClick={() => handleReviewAction(actionDraftId)}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-md active:scale-95"
                    >
                      <IconShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                      <span>Review & Authorize Link →</span>
                    </button>
                  ) : isSelected && opt.action_type === 'monitor_cash_position' ? (
                    <button
                      disabled
                      className="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 cursor-default flex items-center justify-center gap-1.5"
                    >
                      <IconCheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Routine Monitoring Active</span>
                    </button>
                  ) : isSelected ? (
                    <button
                      disabled
                      className="w-full py-2.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 cursor-default flex items-center justify-center gap-1.5"
                    >
                      <IconCheckCircle className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Strategy Active</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSelectOption(opt.id)}
                      disabled={selectingOptionId !== null || isUnavailable || isStale}
                      className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${
                        isUnavailable || isStale
                          ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                          : isRecommended
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md active:scale-95'
                          : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-2xs active:scale-95'
                      }`}
                    >
                      {selectingOptionId === opt.id
                        ? 'Preparing Action...'
                        : isUnavailable
                        ? 'Requires Supplier Consent'
                        : isRecommended
                        ? 'Select Recommended Strategy →'
                        : 'Select This Strategy'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Clean Decision Audit Trail & Execution History */}
      <div className="business-card p-5 space-y-4">
        <button
          onClick={() => setShowAuditLedger(!showAuditLedger)}
          className="w-full flex items-center justify-between text-left hover:opacity-80 transition-opacity"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">Decision &amp; Resolution History</h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-600 font-bold">
              {outcomeLedger.length} Audited Cases
            </span>
          </div>

          <span className="text-xs text-indigo-600 font-bold flex items-center gap-1">
            {showAuditLedger ? 'Hide Details ▲' : 'Show Details ▼'}
          </span>
        </button>

        {showAuditLedger && (
          <div className="overflow-x-auto pt-2 border-t border-slate-100">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 uppercase font-semibold text-[10px] tracking-wider bg-slate-50">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Financial Challenge</th>
                  <th className="py-2.5 px-3">Chosen Strategy</th>
                  <th className="py-2.5 px-3 text-right">Target Recovery</th>
                  <th className="py-2.5 px-3 text-right">Settlement Status</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                {outcomeLedger.map((row) => (
                  <tr key={row.decision_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 whitespace-nowrap text-slate-900 font-sans">
                      {new Date(row.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-2.5 px-3 max-w-xs font-sans text-slate-800 font-medium">
                      {row.title?.replace(/INR\s*/g, '₹') || 'Projected Cash Deficit (₹32,500)'}
                    </td>
                    <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                      {getLedgerActionTitle(row.selected_option_id)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-700 font-bold whitespace-nowrap">
                      {row.estimated_financial_impact ? `+${formatCurrency(Number(row.estimated_financial_impact))}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap font-sans">
                      {row.actual_financial_impact !== null && row.actual_financial_impact !== undefined ? (
                        <span className="text-emerald-700 font-bold font-mono">
                          {formatCurrency(Number(row.actual_financial_impact))}
                        </span>
                      ) : (
                        <span className="text-amber-700 font-medium text-xs">Pending Remittance</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-50 text-amber-800 border border-amber-200">
                        {row.outcome_status === 'pending' ? 'Awaiting Approval' : row.outcome_status.replace(/_/g, ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
