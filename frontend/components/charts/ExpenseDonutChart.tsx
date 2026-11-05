'use client';

import React, { useState } from 'react';
import { FinancialSummary, Document, Transaction } from '../../types';

interface ExpenseDonutChartProps {
  summary: FinancialSummary | null;
  documents?: Document[];
  transactions?: Transaction[];
  currency?: string;
}

const PALETTE = ['#4f46e5', '#f97316', '#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'];

export const ExpenseDonutChart: React.FC<ExpenseDonutChartProps> = ({
  summary,
  documents = [],
  transactions = [],
  currency = 'INR',
}) => {
  const [viewMode, setViewMode] = useState<'expenses' | 'revenue'>('expenses');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Extract actual payables/expenses OR revenue sources directly from database records
  const categories = React.useMemo(() => {
    const catMap: Record<string, number> = {};

    if (viewMode === 'expenses') {
      // 1. Group from actual bill line items
      const bills = documents.filter((d) => d.document_type === 'bill');
      bills.forEach((bill) => {
        if (bill.items && bill.items.length > 0) {
          bill.items.forEach((item) => {
            const desc = item.description || (bill.contact_name ? `Bill (${bill.contact_name})` : 'Supplier Bill');
            catMap[desc] = (catMap[desc] || 0) + Number(item.line_total || item.unit_price * item.quantity);
          });
        } else {
          const party = bill.contact_name || 'Supplier Obligation';
          catMap[party] = (catMap[party] || 0) + Number(bill.total);
        }
      });

      // 2. Include actual outflow transactions
      transactions
        .filter((t) => t.transaction_type === 'outflow')
        .forEach((t) => {
          const desc = t.description || 'Merchant Payout';
          catMap[desc] = (catMap[desc] || 0) + Number(t.amount);
        });
    } else {
      // REVENUE MODE: Group by Customer / Source
      const invoices = documents.filter((d) => d.document_type === 'invoice');
      invoices.forEach((inv) => {
        const client = inv.contact_name || 'Direct Wholesale Buyer';
        catMap[client] = (catMap[client] || 0) + Number(inv.total);
      });

      // Include standalone inflow transactions not linked to docs
      transactions
        .filter((t) => t.transaction_type === 'inflow' && !t.contact_id)
        .forEach((t) => {
          const src = t.description || 'Direct Cash Inflow';
          catMap[src] = (catMap[src] || 0) + Number(t.amount);
        });
    }

    const total = Object.values(catMap).reduce((sum, val) => sum + val, 0) || 1;

    return Object.entries(catMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5) // top 5 for clean visual presentation
      .map(([label, amount], idx) => ({
        label,
        amount,
        percentage: Math.round((amount / total) * 100),
        color: PALETTE[idx % PALETTE.length],
      }));
  }, [documents, transactions, viewMode]);

  const totalAmount = categories.reduce((sum, c) => sum + c.amount, 0);

  const formatCategoryName = (raw: string) => {
    if (!raw) return 'Miscellaneous';
    if (/basmati/i.test(raw)) return 'Basmati Rice 100kg';
    if (/cooking oil|sunflower/i.test(raw)) return 'Cooking Oil 5L';
    if (/grain transport/i.test(raw)) return 'Grain Transport';
    if (/warehouse|lease|apex/i.test(raw)) return 'Warehouse Bay Lease';
    if (/freight|logistics/i.test(raw)) return 'Freight Logistics';
    if (/packaging/i.test(raw)) return 'Packaging Material';
    if (/sharma/i.test(raw)) return 'Sharma Traders';
    if (/verma/i.test(raw)) return 'Verma Groceries';
    if (/gupta/i.test(raw)) return 'Gupta Dept Store';
    if (/mehta/i.test(raw)) return 'Mehta Supermart';
    if (/sunrise/i.test(raw)) return 'Sunrise Dist.';
    if (/kisan/i.test(raw)) return 'Kisan Agro';
    return raw.length > 22 ? raw.slice(0, 20) + '...' : raw;
  };

  // SVG Donut calculations - Generous proportions filling card with crisp sharp ends
  const size = 160;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  // Pre-calculate precise non-overlapping slice geometry
  const sliceGeometry = React.useMemo(() => {
    const total = categories.reduce((sum, c) => sum + c.amount, 0) || 1;
    let runningOffset = 0;

    return categories.map((cat) => {
      const fraction = cat.amount / total;
      const arcLength = fraction * circumference;
      const offset = runningOffset;
      runningOffset += arcLength;

      return {
        ...cat,
        fraction,
        arcLength,
        offset,
      };
    });
  }, [categories, circumference]);

  const activeCategory = hoveredIndex !== null ? categories[hoveredIndex] : null;

  return (
    <div className="business-card p-6 flex flex-col justify-between h-full">
      {/* Header with Mode Toggle */}
      <div className="border-b border-slate-100 pb-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-800">
            {viewMode === 'expenses' ? 'Expenses & Merchant Payouts' : 'Revenue by Customer'}
          </h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono font-bold">
            Real DB
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5">
          <p className="text-xs text-slate-500">
            {viewMode === 'expenses'
              ? 'Derived directly from supplier bills & merchant payouts'
              : 'Derived directly from customer invoices & collections'}
          </p>

          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-bold shrink-0">
            <button
              onClick={() => {
                setViewMode('expenses');
                setHoveredIndex(null);
              }}
              className={`px-3 py-1 rounded-md transition-all ${
                viewMode === 'expenses'
                  ? 'bg-white text-orange-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Payouts
            </button>
            <button
              onClick={() => {
                setViewMode('revenue');
                setHoveredIndex(null);
              }}
              className={`px-3 py-1 rounded-md transition-all ${
                viewMode === 'revenue'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Revenue
            </button>
          </div>
        </div>
      </div>

      {/* Donut & Stats Area: Balanced 12-col layout filling available horizontal & vertical space */}
      <div className="py-5 grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
        {/* SVG Ring (Centered in 5 cols with Sharp Slices & Distinct Hover Interaction) */}
        <div className="sm:col-span-5 flex justify-center items-center">
          <div className="relative flex items-center justify-center">
            <svg width={size} height={size} className="transform -rotate-90 overflow-visible">
              {/* Background Track */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke="#f1f5f9"
                strokeWidth={strokeWidth}
                fill="none"
              />
              {/* Slices with Crisp Sharp Ends & Strict Pointer Target Bounds */}
              {sliceGeometry.map((cat, idx) => {
                const isHovered = hoveredIndex === idx;
                const strokeDasharray = `${cat.arcLength} ${circumference}`;
                const strokeDashoffset = -cat.offset;

                return (
                  <circle
                    key={idx}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={cat.color}
                    strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                    strokeLinecap="butt"
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    fill="none"
                    style={{ pointerEvents: 'stroke' }}
                    opacity={hoveredIndex !== null && !isHovered ? 0.45 : 1}
                    onMouseEnter={() => setHoveredIndex(idx)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className="cursor-pointer transition-all duration-150"
                  />
                );
              })}
            </svg>

            {/* Dynamic Center Label (Updates cleanly without mixing or truncation) */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-1 pointer-events-none transition-all duration-200">
              {activeCategory ? (
                <div className="flex flex-col items-center animate-fade-in">
                  <span
                    className="text-[11px] font-bold truncate max-w-[110px]"
                    style={{ color: activeCategory.color }}
                  >
                    {formatCategoryName(activeCategory.label)}
                  </span>
                  <span className="text-sm font-black font-mono text-slate-900 mt-0.5">
                    ₹{Math.round(activeCategory.amount).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full mt-0.5">
                    {activeCategory.percentage}% of total
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {viewMode === 'expenses' ? 'Total Costs' : 'Total Revenue'}
                  </span>
                  <span className="text-sm font-black font-mono text-slate-900 mt-1">
                    ₹{Math.round(totalAmount).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium mt-0.5">
                    {categories.length} Categories
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Legend List (Interactive on Hover, highlighting slices and showing amounts) */}
        <div className="sm:col-span-7 space-y-1 w-full">
          {categories.slice(0, 5).map((cat, idx) => {
            const isHovered = hoveredIndex === idx;

            return (
              <div
                key={idx}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className={`flex items-center justify-between text-xs py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
                  isHovered
                    ? 'bg-slate-100 shadow-xs font-bold'
                    : hoveredIndex !== null
                    ? 'opacity-40 hover:opacity-80'
                    : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 pr-2">
                  <span
                    className={`w-3 h-3 rounded-md shrink-0 shadow-xs transition-transform ${isHovered ? 'scale-125' : ''}`}
                    style={{ backgroundColor: cat.color }}
                  />
                  <span className="truncate text-xs text-slate-800" title={cat.label}>
                    {formatCategoryName(cat.label)}
                  </span>
                </div>
                <div className="text-right font-mono font-bold text-slate-900 shrink-0 text-xs whitespace-nowrap">
                  ₹{Math.round(cat.amount).toLocaleString('en-IN')}
                  <span className="text-[11px] text-slate-400 font-normal ml-1.5">
                    ({cat.percentage}%)
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Audit Pill */}
      <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <span>Active Categories: {categories.length}</span>
        <span className="font-semibold text-indigo-600">
          {viewMode === 'expenses' ? 'Direct Merchant Payouts' : 'Wholesale Buyer Accounts'}
        </span>
      </div>
    </div>
  );
};
