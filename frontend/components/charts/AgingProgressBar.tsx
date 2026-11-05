'use client';

import React from 'react';
import { FinancialSummary, Document } from '../../types';

interface AgingProgressBarProps {
  summary: FinancialSummary | null;
  documents: Document[];
  currency?: string;
}

export const AgingProgressBar: React.FC<AgingProgressBarProps> = ({
  summary,
  documents,
  currency = 'INR',
}) => {
  // Aggregate customer receivables from real documents
  let receivablesPaid = 0;
  let receivablesPending = 0;
  let receivablesOverdue = 0;

  // Aggregate supplier payables from real documents
  let payablesPaid = 0;
  let payablesUpcoming = 0;

  documents.forEach((doc) => {
    if (doc.document_type === 'invoice') {
      receivablesPaid += Number(doc.paid_amount || 0);
      if (doc.status === 'overdue') {
        receivablesOverdue += Number(doc.outstanding_amount || 0);
      } else {
        receivablesPending += Number(doc.outstanding_amount || 0);
      }
    } else if (doc.document_type === 'bill') {
      payablesPaid += Number(doc.paid_amount || 0);
      payablesUpcoming += Number(doc.outstanding_amount || 0);
    }
  });

  const totalReceivables = receivablesPaid + receivablesPending + receivablesOverdue || 1;
  const pctRecPaid = Math.round((receivablesPaid / totalReceivables) * 100);
  const pctRecPending = Math.round((receivablesPending / totalReceivables) * 100);
  const pctRecOverdue = Math.max(0, 100 - pctRecPaid - pctRecPending);

  const totalPayables = payablesPaid + payablesUpcoming || 1;
  const pctPayPaid = Math.round((payablesPaid / totalPayables) * 100);
  const pctPayUpcoming = Math.max(0, 100 - pctPayPaid);

  return (
    <div className="business-card p-6 space-y-6">
      {/* Executive Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-base md:text-lg font-bold text-slate-800">
              Aging &amp; Settlement Progress
            </h3>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-mono font-bold">
              Live Ledger Status
            </span>
          </div>
          <p className="text-xs md:text-sm font-medium text-slate-500 mt-0.5">
            Real-time fulfillment tracking across customer sales invoices and supplier obligations
          </p>
        </div>

        {/* Global Real-Time Ratio Badge */}
        <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200/80 text-xs font-semibold text-slate-700 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Collections Coverage:</span>
          <strong className="text-indigo-600 font-mono font-bold text-sm">
            {Math.round((receivablesPaid / (payablesPaid || 1)) * 100)}%
          </strong>
        </div>
      </div>

      {/* 2-Column Professional Comparison Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card 1: Customer Receivables (Money In) */}
        <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-4 hover:border-slate-300 transition-all">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 font-bold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-850">Customer Receivables (Money In)</h4>
                <span className="text-xs text-slate-500">Sales Invoices &amp; Buyer Collections</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-base font-black font-mono text-slate-900">
                ₹{receivablesPaid.toLocaleString('en-IN')}
                <span className="text-xs font-normal text-slate-400 ml-1">
                  / ₹{totalReceivables.toLocaleString('en-IN')}
                </span>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {pctRecPaid}% Collected
              </span>
            </div>
          </div>

          {/* Segmented Progress Bar */}
          <div className="h-3 w-full bg-slate-200/70 rounded-full overflow-hidden flex p-0.5 gap-0.5">
            <div
              style={{ width: `${pctRecPaid}%` }}
              className="bg-emerald-500 h-full rounded-l-full transition-all duration-500"
              title={`Collected: ₹${receivablesPaid.toLocaleString('en-IN')} (${pctRecPaid}%)`}
            />
            <div
              style={{ width: `${pctRecPending}%` }}
              className="bg-indigo-500 h-full transition-all duration-500"
              title={`Pending Net 15: ₹${receivablesPending.toLocaleString('en-IN')} (${pctRecPending}%)`}
            />
            <div
              style={{ width: `${pctRecOverdue}%` }}
              className="bg-rose-500 h-full rounded-r-full transition-all duration-500"
              title={`Overdue: ₹${receivablesOverdue.toLocaleString('en-IN')} (${pctRecOverdue}%)`}
            />
          </div>

          {/* 3 Metric Value Cards */}
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            <div className="p-2.5 rounded-xl bg-white border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                <span>Collected</span>
              </div>
              <div className="text-sm font-bold font-mono text-slate-900 mt-1">
                ₹{receivablesPaid.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-emerald-600 font-semibold">{pctRecPaid}% of total</span>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0"></span>
                <span>Pending</span>
              </div>
              <div className="text-sm font-bold font-mono text-slate-900 mt-1">
                ₹{receivablesPending.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-indigo-600 font-semibold">{pctRecPending}% on terms</span>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                <span>Overdue</span>
              </div>
              <div className="text-sm font-bold font-mono text-rose-600 mt-1">
                ₹{receivablesOverdue.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-rose-600 font-semibold">{pctRecOverdue}% action due</span>
            </div>
          </div>
        </div>

        {/* Card 2: Supplier Obligations & Payables (Money Out) */}
        <div className="p-5 rounded-2xl bg-slate-50/70 border border-slate-200/80 space-y-4 hover:border-slate-300 transition-all">
          {/* Header Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-100 text-orange-800 font-bold">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-850">Supplier Payables (Money Out)</h4>
                <span className="text-xs text-slate-500">Vendor Invoices &amp; Merchant Commitments</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-base font-black font-mono text-slate-900">
                ₹{payablesPaid.toLocaleString('en-IN')}
                <span className="text-xs font-normal text-slate-400 ml-1">
                  / ₹{totalPayables.toLocaleString('en-IN')}
                </span>
              </div>
              <span className="text-[11px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                {pctPayPaid}% Settled
              </span>
            </div>
          </div>

          {/* Segmented Progress Bar */}
          <div className="h-3 w-full bg-slate-200/70 rounded-full overflow-hidden flex p-0.5 gap-0.5">
            <div
              style={{ width: `${pctPayPaid}%` }}
              className="bg-emerald-500 h-full rounded-l-full transition-all duration-500"
              title={`Settled: ₹${payablesPaid.toLocaleString('en-IN')} (${pctPayPaid}%)`}
            />
            <div
              style={{ width: `${pctPayUpcoming}%` }}
              className="bg-amber-500 h-full rounded-r-full transition-all duration-500"
              title={`Due to Suppliers: ₹${payablesUpcoming.toLocaleString('en-IN')} (${pctPayUpcoming}%)`}
            />
          </div>

          {/* 2 Metric Value Cards */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-2.5 rounded-xl bg-white border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                <span>Settled to Merchants</span>
              </div>
              <div className="text-sm font-bold font-mono text-slate-900 mt-1">
                ₹{payablesPaid.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-emerald-600 font-semibold">{pctPayPaid}% cleared</span>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-slate-200/70">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                <span>Outstanding Payables</span>
              </div>
              <div className="text-sm font-bold font-mono text-amber-700 mt-1">
                ₹{payablesUpcoming.toLocaleString('en-IN')}
              </div>
              <span className="text-[10px] text-amber-600 font-semibold">{pctPayUpcoming}% upcoming</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


