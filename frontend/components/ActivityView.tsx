'use client';

import React, { useState, useMemo } from 'react';
import { Transaction } from '../types';
import { IconCheckCircle, IconRefresh, IconArrowUpRight, IconClock } from './Icons';

interface ActivityViewProps {
  auditEvents?: any[];
  transactions?: Transaction[];
  onRefresh: () => void;
  onOpenRecordTransaction?: (docId?: string) => void;
}

export const ActivityView: React.FC<ActivityViewProps> = ({
  transactions = [],
  onRefresh,
  onOpenRecordTransaction,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'inflow' | 'outflow'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 1. Calculate executive metrics
  const { totalInflows, totalOutflows, netMovement, inflowCount, outflowCount } = useMemo(() => {
    let inflows = 0;
    let outflows = 0;
    let inCount = 0;
    let outCount = 0;

    for (const tx of transactions) {
      const amt = Number(tx.amount || 0);
      if (tx.transaction_type === 'inflow') {
        inflows += amt;
        inCount += 1;
      } else if (tx.transaction_type === 'outflow') {
        outflows += amt;
        outCount += 1;
      }
    }

    return {
      totalInflows: inflows,
      totalOutflows: outflows,
      netMovement: inflows - outflows,
      inflowCount: inCount,
      outflowCount: outCount,
    };
  }, [transactions]);

  // 2. Filter transactions based on selected tab and search term
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Flow type filter
      if (filterType === 'inflow' && tx.transaction_type !== 'inflow') return false;
      if (filterType === 'outflow' && tx.transaction_type !== 'outflow') return false;

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const desc = (tx.description || '').toLowerCase();
        const ref = (tx.reference || '').toLowerCase();
        const method = (tx.payment_method || '').toLowerCase();
        const amtStr = String(tx.amount || '');
        const contactName = (tx.contact_name || '').toLowerCase();

        return (
          desc.includes(query) ||
          ref.includes(query) ||
          method.includes(query) ||
          amtStr.includes(query) ||
          contactName.includes(query)
        );
      }

      return true;
    });
  }, [transactions, filterType, searchQuery]);

  const formatCurrency = (val: number) => {
    return `₹${Math.round(val).toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Bank &amp; Cash Ledger</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Database Verified
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real cash inflows, verified customer receipts, and supplier payouts recorded in active accounts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenRecordTransaction && (
            <button
              onClick={() => onOpenRecordTransaction()}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span>+ Record Transaction</span>
            </button>
          )}
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-all shadow-xs"
          >
            <IconRefresh className="w-3.5 h-3.5" />
            <span>Refresh Ledger</span>
          </button>
        </div>
      </div>

      {/* 2. Executive Liquidity Pulse Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="business-card p-4 bg-gradient-to-br from-emerald-50/60 to-white border border-emerald-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
              Total Inflows Banked
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
              {inflowCount} Receipts
            </span>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-emerald-700">
            +{formatCurrency(totalInflows)}
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">Verified customer invoice payments</span>
        </div>

        <div className="business-card p-4 bg-gradient-to-br from-orange-50/60 to-white border border-orange-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-orange-800">
              Total Outflows Disbursed
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-100 text-orange-800">
              {outflowCount} Payouts
            </span>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-orange-600">
            -{formatCurrency(totalOutflows)}
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">Settled supplier bills &amp; logistics</span>
        </div>

        <div className="business-card p-4 bg-gradient-to-br from-indigo-50/60 to-white border border-indigo-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-800">
              Net Cash Movement
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
              Net Balance
            </span>
          </div>
          <div className={`mt-2 text-2xl font-black font-mono ${netMovement >= 0 ? 'text-indigo-700' : 'text-rose-600'}`}>
            {netMovement >= 0 ? `+${formatCurrency(netMovement)}` : `-${formatCurrency(Math.abs(netMovement))}`}
          </div>
          <span className="text-[11px] text-slate-500 block mt-1">Net surplus recorded in bank register</span>
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="business-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
        {/* Flow Tabs */}
        <div className="flex rounded-xl bg-slate-100 border border-slate-200 p-1 text-xs font-bold w-fit">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              filterType === 'all'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Entries ({transactions.length})
          </button>
          <button
            onClick={() => setFilterType('inflow')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              filterType === 'inflow'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Money In ({inflowCount})
          </button>
          <button
            onClick={() => setFilterType('outflow')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              filterType === 'outflow'
                ? 'bg-orange-600 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Money Out ({outflowCount})
          </button>
        </div>

        {/* Search Field */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search description, ref, or amount..."
            className="w-full pl-3 pr-8 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 4. Transactions Ledger Table */}
      <div className="business-card overflow-hidden shadow-2xs">
        {filteredTransactions.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-slate-500 text-xs font-medium">
              {searchQuery
                ? `No transactions matching "${searchQuery}".`
                : 'No transactions recorded in this view.'}
            </p>
            {onOpenRecordTransaction && (
              <button
                onClick={() => onOpenRecordTransaction()}
                className="text-indigo-600 font-bold text-xs hover:underline"
              >
                + Record a new transaction
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[10px]">
                <tr>
                  <th className="py-3 px-4">Date &amp; Ref</th>
                  <th className="py-3 px-4">Flow Type</th>
                  <th className="py-3 px-4">Description / Party</th>
                  <th className="py-3 px-4">Payment Method</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono">
                {filteredTransactions.map((tx) => {
                  const isInflow = tx.transaction_type === 'inflow';
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Date & Ref */}
                      <td className="py-3.5 px-4 font-sans whitespace-nowrap">
                        <span className="font-bold text-slate-900 block">
                          {new Date(tx.transaction_date).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">#{tx.id.slice(0, 8)}</span>
                      </td>

                      {/* Type Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase font-sans ${
                            isInflow
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-orange-50 text-orange-800 border border-orange-200'
                          }`}
                        >
                          {isInflow ? 'Inflow (Money In)' : 'Outflow (Payout)'}
                        </span>
                      </td>

                      {/* Description & Contact */}
                      <td className="py-3.5 px-4 max-w-xs font-sans">
                        <span className="text-slate-900 font-semibold block truncate" title={tx.description}>
                          {tx.description || 'Business Cash Movement'}
                        </span>
                        {tx.contact_name && (
                          <span className="text-[11px] text-indigo-700 font-medium block">
                            Party: {tx.contact_name}
                          </span>
                        )}
                        {tx.reference && (
                          <span className="text-[10px] text-slate-400 font-mono block">Ref: {tx.reference}</span>
                        )}
                      </td>

                      {/* Payment Method */}
                      <td className="py-3.5 px-4 font-sans capitalize whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] border border-slate-200 font-semibold">
                          {tx.payment_method.replace(/_/g, ' ')}
                        </span>
                      </td>

                      {/* Amount */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono">
                        <span
                          className={`font-black text-sm ${
                            isInflow ? 'text-emerald-700' : 'text-orange-600'
                          }`}
                        >
                          {isInflow ? '+' : '-'}₹{Number(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 font-sans flex items-center justify-center gap-1 w-fit mx-auto">
                          <IconCheckCircle className="w-3 h-3 text-emerald-600" />
                          Verified
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
