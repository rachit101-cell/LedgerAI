'use client';

import React from 'react';
import { FinancialSummary, AuditEvent, Document, Transaction, ActionDraft } from '../types';
import { IconWallet, IconAlertTriangle, IconFileText, IconPayPal, IconCheckCircle, IconArrowUpRight, IconBot, IconShieldCheck } from './Icons';
import { CashFlowWaveChart } from './charts/CashFlowWaveChart';
import { CashCalendarWidget } from './charts/CashCalendarWidget';
import { CashFlowBarChart } from './charts/CashFlowBarChart';
import { ExpenseDonutChart } from './charts/ExpenseDonutChart';
import { CashRunwayGauge } from './charts/CashRunwayGauge';
import { AgingProgressBar } from './charts/AgingProgressBar';

interface OverviewProps {
  summary: FinancialSummary | null;
  documents?: Document[];
  transactions?: Transaction[];
  actionDrafts?: ActionDraft[];
  auditEvents: AuditEvent[];
  onOpenAI: (initialQuery?: string) => void;
  onOpenInvoices: () => void;
  onOpenDecisions?: () => void;
  onOpenReports?: () => void;
  onOpenRecordTransaction?: (docId?: string) => void;
  onOpenRecordOrder?: () => void;
  onOpenReviewModal?: (draft: ActionDraft) => void;
}

export const Overview: React.FC<OverviewProps> = ({
  summary,
  documents = [],
  transactions = [],
  actionDrafts = [],
  auditEvents,
  onOpenAI,
  onOpenInvoices,
  onOpenDecisions,
  onOpenReports,
  onOpenRecordTransaction,
  onOpenRecordOrder,
  onOpenReviewModal,
}) => {
  if (!summary) {
    return (
      <div className="p-12 text-center text-slate-400 business-card animate-pulse">
        Loading visual cash flow and deterministic ledger records...
      </div>
    );
  }

  const currency = (summary.currency === 'INR' || !summary.currency) ? '₹' : summary.currency;
  const isShortfall = summary.shortfall_risk;
  const cash = Number(summary.recorded_cash_balance);
  const payables = Number(summary.total_payables_due);
  const receivables = Number(summary.total_receivables);

  return (
    <div className="space-y-6">
      {/* 1. Unified Executive Resolution Card (Cash Gap + Recommended AI Solution) */}
      {isShortfall && (
        <div
          className="p-4 md:p-5 border-2 border-amber-400 rounded-2xl space-y-3 shadow-md"
          style={{
            background: 'linear-gradient(135deg, #FEF08A 0%, #FDE047 100%)',
            boxShadow: '0 4px 20px -2px rgba(245, 158, 11, 0.25)',
          }}
        >
          {/* Tier 1: The Urgent Deficit & Context */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 pb-3 border-b-2 border-amber-400/80">
            {/* Left: Critical Deficit & Due Date */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-600 text-white shadow-xs">
                Critical Alert
              </span>
              <span className="text-sm sm:text-base font-bold text-slate-950 tracking-tight">
                Projected Cash Gap: <strong className="text-rose-700 font-black font-mono text-base sm:text-lg">-₹{summary.projected_shortfall_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-300 text-amber-950 font-black border border-amber-500/70 whitespace-nowrap shadow-2xs">
                Due {summary.shortfall_date || '2026-10-19'}
              </span>
            </div>

            {/* Right: Cash on Hand vs Supplier Dues Context */}
            <div className="text-xs text-slate-900 font-semibold sm:text-right shrink-0">
              Cash on hand: <strong className="text-slate-950 font-black">₹{cash.toLocaleString('en-IN')}</strong>
              <span className="mx-2 text-amber-600 font-bold">&bull;</span>
              Supplier dues: <strong className="text-rose-700 font-black">₹{payables.toLocaleString('en-IN')}</strong>
            </div>
          </div>

          {/* Tier 2: The Recommended Solution & Executive Actions */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            {/* Solution Description */}
            <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-950 flex-wrap sm:flex-nowrap min-w-0">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-950 font-black text-xs shrink-0 border border-emerald-500/70 inline-flex items-center gap-1.5 shadow-2xs">
                <svg className="w-3.5 h-3.5 text-emerald-700 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Recommended Fix Ready
              </span>
              <span className="text-slate-950 text-xs sm:text-sm font-semibold">
                Collect <strong className="text-slate-950 font-black">₹35,000</strong> from <strong className="text-slate-950 font-black">Sharma Traders</strong> via 2% Early Pay settlement.
              </span>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap sm:flex-nowrap">
              {(() => {
                const pendingDraft = actionDrafts.find((d) => d.status === 'awaiting_approval');
                if (pendingDraft && onOpenReviewModal) {
                  return (
                    <button
                      onClick={() => onOpenReviewModal(pendingDraft)}
                      className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md shadow-rose-600/30 ring-2 ring-amber-400/50 transition-all active:scale-95 whitespace-nowrap"
                    >
                      <svg className="w-4 h-4 text-amber-300 fill-amber-300" viewBox="0 0 24 24">
                        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      <span>Review &amp; Authorize Fix</span>
                    </button>
                  );
                }
                return null;
              })()}

              {onOpenDecisions && (
                <button
                  onClick={onOpenDecisions}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-amber-50 border-2 border-amber-400 text-slate-950 font-bold text-xs shadow-xs transition-all active:scale-95 whitespace-nowrap"
                >
                  <span>Simulate Other Scenarios &rarr;</span>
                </button>
              )}

              <button
                onClick={() => onOpenAI('Will I have enough cash to pay my supplier this week?')}
                className="p-2 rounded-xl bg-white hover:bg-amber-50 border-2 border-amber-400 text-slate-800 hover:text-amber-950 transition-all shadow-xs"
                title="Ask AI Financial Advisor"
              >
                <IconBot className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Top Metric KPI Cards with Built-in Visual Indicators & Sparklines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Available Cash on Hand */}
        <div className="business-card p-5 business-card-hover flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Available Cash</span>
            <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-600">
              <IconWallet className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2 flex items-baseline justify-between">
            <div className="text-2xl font-black font-mono text-slate-900">
              {currency}{cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            {/* Visual Mini Trend Sparkline */}
            <svg width="44" height="20" className="stroke-emerald-500 fill-none" strokeWidth="2.5">
              <path d="M 2 16 Q 14 12, 22 14 T 42 4" />
              <circle cx="42" cy="4" r="2.5" className="fill-emerald-500" />
            </svg>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Net Movement</span>
            <span className="font-mono font-bold text-emerald-600 flex items-center gap-0.5">
              +{currency}{Math.abs(summary.net_cash_movement).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Card 2: Customer Receivables (Money In) */}
        <div className="business-card p-5 business-card-hover flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Money In (Receivables)</span>
            <div className="p-1.5 rounded-xl bg-indigo-50 text-indigo-600">
              <IconFileText className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2 flex items-baseline justify-between">
            <div className="text-2xl font-black font-mono text-indigo-600">
              {currency}{receivables.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            {/* Visual Mini Progress Bar */}
            <div className="w-12 h-2 rounded-full bg-slate-100 overflow-hidden flex">
              <div style={{ width: '40%' }} className="bg-emerald-500 h-full"></div>
              <div style={{ width: '60%' }} className="bg-indigo-500 h-full"></div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Owed by 2 Buyers</span>
            <button
              onClick={onOpenInvoices}
              className="text-indigo-600 hover:text-indigo-800 font-bold"
            >
              Collect &rarr;
            </button>
          </div>
        </div>

        {/* Card 3: Supplier Payables (Money Out) */}
        <div className="business-card p-5 business-card-hover flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Money Out (Supplier Payables)</span>
            <div className="p-1.5 rounded-xl bg-orange-50 text-orange-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>

          <div className="my-2 flex items-baseline justify-between">
            <div className="text-2xl font-black font-mono text-orange-600">
              {currency}{payables.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
              Sunrise Dist.
            </span>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Due: Oct 15</span>
            {onOpenDecisions && (
              <button
                onClick={onOpenDecisions}
                className="text-orange-600 hover:text-orange-800 font-bold"
              >
                Bridge Gap &rarr;
              </button>
            )}
          </div>
        </div>

        {/* Card 4: Operating Runway Status */}
        <div className="business-card p-5 business-card-hover flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Runway Health</span>
            <div className={`p-1.5 rounded-xl ${isShortfall ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <IconShieldCheck className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2 flex items-baseline justify-between">
            <div className={`text-2xl font-black font-mono ${isShortfall ? 'text-amber-600' : 'text-emerald-600'}`}>
              {Math.round((cash / (payables || 1)) * 100)}%
            </div>
            {/* Visual Status Indicator Pill */}
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isShortfall ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
              {isShortfall ? 'Deficit Risk' : 'Healthy Buffer'}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Coverage Horizon</span>
            <span className="font-semibold text-slate-700">Next 14 Days</span>
          </div>
        </div>
      </div>

      {/* 3. Quick Visual Action Toolbar (Genuinely Useful Actions & Section Navigation) */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap pl-1">
          Quick Actions:
        </span>

        {onOpenRecordOrder && (
          <button
            onClick={onOpenRecordOrder}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-95"
            title="Record today's wholesale/retail order or customer sale"
          >
            <IconCheckCircle className="w-3.5 h-3.5" />
            <span>+ Record Today&apos;s Order / Sale</span>
          </button>
        )}

        {onOpenRecordTransaction && (
          <button
            onClick={() => onOpenRecordTransaction()}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-95"
            title="Log instant cash receipt, UPI transfer, or supplier payout"
          >
            <IconCheckCircle className="w-3.5 h-3.5" />
            <span>+ Record Cash / UPI Transaction</span>
          </button>
        )}

        {onOpenDecisions && (
          <button
            onClick={onOpenDecisions}
            className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-indigo-700 font-semibold text-xs shadow-xs flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-95"
            title="Navigate to Cash Bridge Solutions & Scenario Modeling"
          >
            <span>⚡ Cash Bridge Solutions</span>
          </button>
        )}

        {onOpenReports && (
          <button
            onClick={onOpenReports}
            className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs shadow-xs flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-95"
            title="View Executive P&L Statement and Working Capital Breakdown"
          >
            <IconFileText className="w-3.5 h-3.5 text-indigo-600" />
            <span>📊 Financial Statement &amp; P&amp;L</span>
          </button>
        )}

        <button
          onClick={onOpenInvoices}
          className="px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs shadow-xs flex items-center gap-1.5 transition-all whitespace-nowrap active:scale-95"
          title="Review all customer receivables, overdue invoices, and supplier bills"
        >
          <IconPayPal className="w-3.5 h-3.5 text-blue-600" />
          <span>📄 Invoices &amp; Receivables</span>
        </button>
      </div>

      {/* 4. Visual Dashboard Center: Top Runway Wave Chart & Liquidity Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Left Column (2 Cols): Cash Runway Wave Chart (Extended to match height of right widgets) */}
        <div className="lg:col-span-2 flex flex-col">
          <CashFlowWaveChart summary={summary} documents={documents} transactions={transactions} currency={currency} />
        </div>

        {/* Right Column (1 Col): Cash Runway Gauge + Interactive Calendar */}
        <div className="space-y-6 flex flex-col">
          <CashRunwayGauge summary={summary} onOpenAdvisor={onOpenDecisions} currency={currency} />
          <CashCalendarWidget documents={documents} currency={currency} />
        </div>
      </div>

      {/* 5. Full-Width Financial Cash Flow & Expense Distribution (Occupying 100% of horizontal space) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CashFlowBarChart summary={summary} documents={documents} transactions={transactions} currency={currency} />
        <ExpenseDonutChart summary={summary} documents={documents} transactions={transactions} currency={currency} />
      </div>

      {/* 6. Receivables vs Payables Aging & Settlement Progress Bar */}
      <AgingProgressBar summary={summary} documents={documents} currency={currency} />

      {/* 7. Immediate Obligations & Collections (Visual Cards, Zero Fluff) */}
      <div className="business-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">Immediate Cash Actions</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold font-mono">
              {summary.supporting_evidence.length} Priority Items
            </span>
          </div>

          <button
            onClick={onOpenInvoices}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
          >
            View All Records &rarr;
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {summary.supporting_evidence.map((item) => {
            const isBill = item.record_type === 'bill';
            const initials = (item.label || 'Doc').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

            return (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all flex items-center justify-between gap-4 shadow-sm"
              >
                {/* Left: Visual Avatar & Party Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      isBill
                        ? 'bg-orange-100 text-orange-800 border border-orange-200'
                        : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                    }`}
                  >
                    {initials}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                          isBill ? 'bg-orange-50 text-orange-700' : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {isBill ? 'Money Out' : 'Money In'}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">Due: {item.due_date || 'Soon'}</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 truncate mt-0.5">{item.label}</h4>
                  </div>
                </div>

                {/* Right: Big Amount & Instant Action */}
                <div className="text-right shrink-0 space-y-1.5">
                  <div className={`text-base font-black font-mono ${isBill ? 'text-orange-600' : 'text-slate-900'}`}>
                    {isBill ? '-' : '+'}{currency}{Number(item.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>

                  {!isBill && (
                    <div className="flex items-center gap-1.5 justify-end">
                      <button
                        onClick={onOpenInvoices}
                        className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95"
                      >
                        Send Link
                      </button>
                      {onOpenRecordTransaction && (
                        <button
                          onClick={() => onOpenRecordTransaction(item.id)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all"
                        >
                          Record Receipt
                        </button>
                      )}
                    </div>
                  )}

                  {isBill && (
                    <div className="flex items-center gap-1.5 justify-end">
                      {onOpenRecordTransaction && (
                        <button
                          onClick={() => onOpenRecordTransaction(item.id)}
                          className="px-3 py-1 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95"
                        >
                          Pay Bill
                        </button>
                      )}
                      {onOpenDecisions && (
                        <button
                          onClick={onOpenDecisions}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs transition-all"
                        >
                          Extension
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
