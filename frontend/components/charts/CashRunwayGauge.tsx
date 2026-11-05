'use client';

import React from 'react';
import { FinancialSummary } from '../../types';

interface CashRunwayGaugeProps {
  summary: FinancialSummary | null;
  onOpenAdvisor?: () => void;
  currency?: string;
}

export const CashRunwayGauge: React.FC<CashRunwayGaugeProps> = ({
  summary,
  onOpenAdvisor,
  currency = '₹',
}) => {
  const symbol = (currency === 'INR' || !currency || currency === '₹') ? '₹' : currency;
  const cash = summary ? Number(summary.recorded_cash_balance) : 80000;
  const payables = summary ? Number(summary.total_payables_due) : 65000;

  // Coverage percentage
  const coverageRatio = payables > 0 ? Math.min(150, Math.round((cash / payables) * 100)) : 100;
  const displayPercent = Math.min(100, coverageRatio);

  const isShortfall = summary?.shortfall_risk ?? (cash < payables);
  const shortfallAmount = summary?.projected_shortfall_amount ? Number(summary.projected_shortfall_amount) : 0;

  // Approximate runway days (assuming current daily obligation burn)
  const estimatedDays = payables > 0 ? Math.round((cash / (payables / 14))) : 30;

  // SVG Gauge calculations
  const size = 150;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (displayPercent / 100) * circumference;

  const strokeColor = isShortfall ? '#f59e0b' : '#10b981';

  return (
    <div className="business-card p-5 flex flex-col justify-between text-center">
      {/* Header */}
      <div className="border-b border-slate-100 pb-2">
        <h3 className="text-sm font-bold text-slate-800">Cash Runway & Coverage</h3>
        <p className="text-[11px] text-slate-500">Liquidity sufficiency against obligations</p>
      </div>

      {/* Circular Gauge */}
      <div className="py-4 flex flex-col items-center justify-center">
        <div className="relative flex items-center justify-center">
          <svg width={size} height={size} className="transform -rotate-90">
            {/* Background track */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#f1f5f9"
              strokeWidth={strokeWidth}
              fill="transparent"
            />
            {/* Progress arc */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              fill="transparent"
              strokeLinecap="round"
              className="transition-all duration-700 ease-out"
            />
          </svg>

          {/* Center stats */}
          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-2xl font-bold font-mono text-slate-900">{coverageRatio}%</span>
            <span className="text-[10px] font-semibold text-slate-400">Coverage</span>
          </div>
        </div>

        {/* Status description */}
        <div className="mt-3">
          <span
            className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
              isShortfall
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {isShortfall ? `Deficit Warning (-${symbol}${shortfallAmount.toLocaleString('en-IN')})` : 'Safe Working Capital Runway'}
          </span>
          <p className="text-xs text-slate-600 mt-1 font-medium">
            Est. <strong className="text-slate-900 font-bold">{estimatedDays} Days</strong> Runway
          </p>
        </div>
      </div>

      {/* Action Button */}
      {onOpenAdvisor && (
        <button
          onClick={onOpenAdvisor}
          className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all active:scale-95"
        >
          {isShortfall ? '⚡ Solve Shortfall' : 'Simulate Scenarios'}
        </button>
      )}
    </div>
  );
};

