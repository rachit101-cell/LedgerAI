'use client';

import React, { useState } from 'react';
import { FinancialSummary, Document, Transaction } from '../../types';

interface CashFlowBarChartProps {
  summary: FinancialSummary | null;
  documents?: Document[];
  transactions?: Transaction[];
  currency?: string;
}

export const CashFlowBarChart: React.FC<CashFlowBarChartProps> = ({
  summary,
  documents = [],
  transactions = [],
  currency = 'INR',
}) => {
  const [timelineMode, setTimelineMode] = useState<'historical' | 'upcoming'>('historical');

  // Aggregate real database records into 4 weekly cash flow buckets
  const barData = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (timelineMode === 'historical') {
      // Historical 4 Weeks (Past 28 Days)
      const pastWeeks = [
        { label: '4 Wks Ago', startOffset: -28, endOffset: -22, moneyIn: 0, moneyOut: 0 },
        { label: '3 Wks Ago', startOffset: -21, endOffset: -15, moneyIn: 0, moneyOut: 0 },
        { label: '2 Wks Ago', startOffset: -14, endOffset: -8, moneyIn: 0, moneyOut: 0 },
        { label: 'Past 7 Days', startOffset: -7, endOffset: 0, moneyIn: 0, moneyOut: 0 },
      ];

      // Group verified transactions into past week buckets
      transactions.forEach((tx) => {
        const txDate = new Date(tx.transaction_date);
        txDate.setHours(0, 0, 0, 0);
        const diffDays = Math.round((txDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        pastWeeks.forEach((wk) => {
          if (diffDays >= wk.startOffset && diffDays <= wk.endOffset) {
            if (tx.transaction_type === 'inflow') {
              wk.moneyIn += Number(tx.amount);
            } else if (tx.transaction_type === 'outflow') {
              wk.moneyOut += Number(tx.amount);
            }
          }
        });
      });

      return pastWeeks;
    } else {
      // Upcoming 4 Weeks (Scheduled Collections vs Bills)
      const upcomingWeeks = [
        { label: 'Wk 1 (0-7d)', startDay: 0, endDay: 7, moneyIn: 0, moneyOut: 0 },
        { label: 'Wk 2 (8-14d)', startDay: 8, endDay: 14, moneyIn: 0, moneyOut: 0 },
        { label: 'Wk 3 (15-21d)', startDay: 15, endDay: 21, moneyIn: 0, moneyOut: 0 },
        { label: 'Wk 4 (22-28d)', startDay: 22, endDay: 28, moneyIn: 0, moneyOut: 0 },
      ];

      documents.forEach((doc) => {
        if (!doc.due_date || Number(doc.outstanding_amount) <= 0) return;
        const dueDate = new Date(doc.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        const bucketIndex = diffDays <= 7 ? 0 : diffDays <= 14 ? 1 : diffDays <= 21 ? 2 : 3;

        if (doc.document_type === 'invoice') {
          upcomingWeeks[bucketIndex].moneyIn += Number(doc.outstanding_amount);
        } else if (doc.document_type === 'bill') {
          upcomingWeeks[bucketIndex].moneyOut += Number(doc.outstanding_amount);
        }
      });

      return upcomingWeeks;
    }
  }, [documents, transactions, timelineMode]);

  const maxVal = Math.max(
    ...barData.map((d) => Math.max(d.moneyIn, d.moneyOut)),
    10000
  );

  const totalIn = barData.reduce((sum, d) => sum + d.moneyIn, 0);
  const totalOut = barData.reduce((sum, d) => sum + d.moneyOut, 0);

  return (
    <div className="business-card p-6 flex flex-col justify-between h-full">
      {/* Header with Timeline Switcher */}
      <div className="border-b border-slate-100 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-850">
              {timelineMode === 'historical' ? 'Historical Revenue & Merchant Payouts' : 'Upcoming Cash Flow (4 Weeks)'}
            </h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono font-bold shrink-0">
              Database Sourced
            </span>
          </div>

          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-bold shrink-0">
            <button
              onClick={() => setTimelineMode('historical')}
              className={`px-3 py-1 rounded-md transition-all ${
                timelineMode === 'historical'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Past Records
            </button>
            <button
              onClick={() => setTimelineMode('upcoming')}
              className={`px-3 py-1 rounded-md transition-all ${
                timelineMode === 'upcoming'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Upcoming
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 text-xs font-medium text-slate-500">
          <span>
            {timelineMode === 'historical'
              ? 'Past 28 days of verified bank transfers, UPI receipts & payouts'
              : 'Forward projection of verified invoice due dates & supplier bills'}
          </span>

          <div className="flex items-center gap-4 shrink-0">
            <span className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-600"></span>
              In: ₹{Math.round(totalIn).toLocaleString('en-IN')}
            </span>
            <span className="flex items-center gap-1.5 text-slate-700 font-semibold text-xs">
              <span className="w-2.5 h-2.5 rounded-xs bg-orange-500"></span>
              Out: ₹{Math.round(totalOut).toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Grouped Bars Area: Roomy h-48 container occupying vertical space cleanly */}
      <div className="pt-6 pb-2">
        {/* Bars Container */}
        <div className="grid grid-cols-4 gap-4 items-end h-48 border-b border-slate-100 pb-1">
          {barData.map((item, idx) => {
            const inHeightPercent = item.moneyIn > 0 ? Math.max(10, (item.moneyIn / maxVal) * 100) : 4;
            const outHeightPercent = item.moneyOut > 0 ? Math.max(10, (item.moneyOut / maxVal) * 100) : 4;

            return (
              <div key={idx} className="flex flex-col items-center justify-end h-full group relative">
                {/* Amounts Tooltip on Hover */}
                <div className="absolute -top-7 text-[11px] font-mono text-slate-700 bg-white px-2 py-0.5 rounded-md shadow-md border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                  +{Math.round(item.moneyIn / 1000)}k / -{Math.round(item.moneyOut / 1000)}k
                </div>

                {/* Side-by-Side Dual Bars */}
                <div className="w-full flex items-end justify-center gap-2 h-full">
                  {/* Money In Bar */}
                  <div
                    style={{ height: `${inHeightPercent}%` }}
                    className="w-1/2 max-w-[28px] rounded-t-md bg-indigo-600 hover:bg-indigo-700 transition-all cursor-pointer shadow-xs"
                    title={`Money In: ₹${item.moneyIn.toLocaleString('en-IN')}`}
                  ></div>

                  {/* Money Out Bar */}
                  <div
                    style={{ height: `${outHeightPercent}%` }}
                    className="w-1/2 max-w-[28px] rounded-t-md bg-orange-500 hover:bg-orange-600 transition-all cursor-pointer shadow-xs"
                    title={`Money Out: ₹${item.moneyOut.toLocaleString('en-IN')}`}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dedicated Distinct X-Axis Labels Row */}
        <div className="grid grid-cols-4 gap-4 mt-3">
          {barData.map((item, idx) => (
            <div key={idx} className="text-center">
              <span className="text-xs font-semibold text-slate-700 block truncate">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Info Strip */}
      <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>
          Net Flow: <strong className={totalIn >= totalOut ? 'text-emerald-600' : 'text-orange-600'}>
            {totalIn >= totalOut ? '+' : '-'}₹{Math.abs(totalIn - totalOut).toLocaleString('en-IN')}
          </strong>
        </span>
        <span className="font-mono text-[11px] text-slate-400">Database Verified Aggregation</span>
      </div>
    </div>
  );
};
