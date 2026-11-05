'use client';

import React, { useState } from 'react';
import { FinancialSummary, Document, Transaction } from '../../types';

interface CashFlowWaveChartProps {
  summary: FinancialSummary | null;
  documents: Document[];
  transactions?: Transaction[];
  currency?: string;
}

export const CashFlowWaveChart: React.FC<CashFlowWaveChartProps> = ({
  summary,
  documents,
  transactions = [],
  currency = 'INR',
}) => {
  const [horizon, setHorizon] = useState<'timeline' | '14d' | '30d'>('timeline');
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  const currentCash = summary ? Number(summary.recorded_cash_balance) : 45000;

  // Generate deterministic cash timeline data points
  const dataPoints = React.useMemo(() => {
    const points: Array<{
      index: number;
      label: string;
      dateStr: string;
      balance: number;
      inflow: number;
      outflow: number;
      events: string[];
      isPast: boolean;
      isToday: boolean;
    }> = [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (horizon === 'timeline') {
      // 30-Day Timeline: 14 Days Past Actuals + Today + 14 Days Forecast
      const startOffset = -14;
      const endOffset = 14;

      // Calculate baseline cash at Day -14
      // We know currentCash at day 0. To find cash at day -14, we subtract inflows and add outflows between day -14 and today.
      let historicalNetChange = 0;
      transactions.forEach((tx) => {
        const txDate = new Date(tx.transaction_date);
        txDate.setHours(0, 0, 0, 0);
        const diff = Math.round((txDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        if (diff >= startOffset && diff <= 0) {
          if (tx.transaction_type === 'inflow') historicalNetChange += Number(tx.amount);
          if (tx.transaction_type === 'outflow') historicalNetChange -= Number(tx.amount);
        }
      });

      let rollingBalance = currentCash - historicalNetChange;

      for (let offset = startOffset; offset <= endOffset; offset++) {
        const d = new Date(today);
        d.setDate(today.getDate() + offset);
        const dateIso = d.toISOString().split('T')[0];
        const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        let dayInflow = 0;
        let dayOutflow = 0;
        const dayEvents: string[] = [];
        const isPast = offset < 0;
        const isToday = offset === 0;

        if (offset <= 0) {
          // Historical transactions matching this day
          transactions.forEach((tx) => {
            const txIso = new Date(tx.transaction_date).toISOString().split('T')[0];
            if (txIso === dateIso) {
              if (tx.transaction_type === 'inflow') {
                dayInflow += Number(tx.amount);
                dayEvents.push(`Received +₹${Number(tx.amount).toLocaleString('en-IN')}: ${tx.description || 'Collection'}`);
              } else if (tx.transaction_type === 'outflow') {
                dayOutflow += Number(tx.amount);
                dayEvents.push(`Paid -₹${Number(tx.amount).toLocaleString('en-IN')}: ${tx.description || 'Merchant payout'}`);
              }
            }
          });
          rollingBalance = rollingBalance + dayInflow - dayOutflow;
        } else {
          // Future projected document due dates
          documents.forEach((doc) => {
            if (!doc.due_date || Number(doc.outstanding_amount) <= 0) return;
            const docDueIso = new Date(doc.due_date).toISOString().split('T')[0];
            if (docDueIso === dateIso) {
              if (doc.document_type === 'invoice') {
                dayInflow += Number(doc.outstanding_amount);
                dayEvents.push(`Due from ${doc.contact_name || 'Customer'}: +₹${Number(doc.outstanding_amount).toLocaleString('en-IN')}`);
              } else if (doc.document_type === 'bill') {
                dayOutflow += Number(doc.outstanding_amount);
                dayEvents.push(`Due to ${doc.contact_name || 'Supplier'}: -₹${Number(doc.outstanding_amount).toLocaleString('en-IN')}`);
              }
            }
          });
          rollingBalance = rollingBalance + dayInflow - dayOutflow;
        }

        points.push({
          index: offset - startOffset,
          label: isToday ? 'Today' : dayLabel,
          dateStr: dayLabel,
          balance: rollingBalance,
          inflow: dayInflow,
          outflow: dayOutflow,
          events: dayEvents,
          isPast,
          isToday,
        });
      }
    } else {
      // Forward Forecast: 14 or 30 days
      const daysCount = horizon === '14d' ? 14 : 30;
      let rollingBalance = currentCash;

      for (let i = 0; i < daysCount; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dateIso = d.toISOString().split('T')[0];
        const dayLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        let dayInflow = 0;
        let dayOutflow = 0;
        const dayEvents: string[] = [];

        documents.forEach((doc) => {
          if (!doc.due_date || Number(doc.outstanding_amount) <= 0) return;
          const docDueIso = new Date(doc.due_date).toISOString().split('T')[0];
          if (docDueIso === dateIso) {
            if (doc.document_type === 'invoice') {
              dayInflow += Number(doc.outstanding_amount);
              dayEvents.push(`Due from ${doc.contact_name || 'Customer'}: +₹${Number(doc.outstanding_amount).toLocaleString('en-IN')}`);
            } else if (doc.document_type === 'bill') {
              dayOutflow += Number(doc.outstanding_amount);
              dayEvents.push(`Due to ${doc.contact_name || 'Supplier'}: -₹${Number(doc.outstanding_amount).toLocaleString('en-IN')}`);
            }
          }
        });

        rollingBalance = rollingBalance + dayInflow - dayOutflow;

        points.push({
          index: i,
          label: i === 0 ? 'Today' : dayLabel,
          dateStr: dayLabel,
          balance: rollingBalance,
          inflow: dayInflow,
          outflow: dayOutflow,
          events: dayEvents,
          isPast: false,
          isToday: i === 0,
        });
      }
    }

    return points;
  }, [currentCash, horizon, documents, transactions]);

  // Chart dimensions - Expanded vertical height to match right-side liquidity widgets
  const width = 840;
  const height = 320;
  const paddingX = 58;
  const paddingY = 36;

  const minVal = Math.min(-15000, ...dataPoints.map((p) => p.balance));
  const maxVal = Math.max(85000, ...dataPoints.map((p) => p.balance));
  const range = maxVal - minVal || 1;

  const getX = (index: number) => paddingX + (index / (dataPoints.length - 1)) * (width - 2 * paddingX);
  const getY = (val: number) => height - paddingY - ((val - minVal) / range) * (height - 2 * paddingY);

  // High-fidelity Fritsch-Carlson Monotone Cubic Spline (Prevents overshooting, smooth financial curves)
  const buildMonotonePath = (pts: Array<{ x: number; y: number }>) => {
    const n = pts.length;
    if (n === 0) return '';
    if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;
    if (n === 2) return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;

    const dxs: number[] = [];
    const dys: number[] = [];
    const slopes: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const dy = pts[i + 1].y - pts[i].y;
      dxs.push(dx);
      dys.push(dy);
      slopes.push(dy / (dx || 1));
    }

    const tangents: number[] = [slopes[0]];
    for (let i = 1; i < n - 1; i++) {
      if (slopes[i - 1] * slopes[i] <= 0) {
        tangents.push(0);
      } else {
        tangents.push((slopes[i - 1] + slopes[i]) / 2);
      }
    }
    tangents.push(slopes[n - 2]);

    for (let i = 0; i < n - 1; i++) {
      if (dys[i] === 0) {
        tangents[i] = 0;
        tangents[i + 1] = 0;
      } else {
        const a = tangents[i] / slopes[i];
        const b = tangents[i + 1] / slopes[i];
        const s = a * a + b * b;
        if (s > 9) {
          const tau = 3 / Math.sqrt(s);
          tangents[i] = tau * a * slopes[i];
          tangents[i + 1] = tau * b * slopes[i];
        }
      }
    }

    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const dx = dxs[i];
      const cp1x = p1.x + dx / 3;
      const cp1y = p1.y + (tangents[i] * dx) / 3;
      const cp2x = p2.x - dx / 3;
      const cp2y = p2.y - (tangents[i + 1] * dx) / 3;
      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return path;
  };

  const balancePoints = dataPoints.map((p, i) => ({ x: getX(i), y: getY(p.balance) }));
  const cashPathD = buildMonotonePath(balancePoints);

  const zeroY = getY(0);
  const bottomY = height - paddingY;

  // Split fill gradient path cleanly
  const cashFillPathD = balancePoints.length > 0
    ? `${cashPathD} L ${balancePoints[balancePoints.length - 1].x} ${bottomY} L ${balancePoints[0].x} ${bottomY} Z`
    : '';

  const todayPoint = dataPoints.find((p) => p.isToday);
  const todayX = todayPoint ? getX(todayPoint.index) : paddingX;

  const activePoint = hoveredPoint !== null ? dataPoints[hoveredPoint] : null;

  // Grid tick levels
  const yTicks = [80000, 40000, 0, -20000].filter((t) => t >= minVal - 5000 && t <= maxVal + 5000);

  // Smooth hover mouse movement tracker anywhere on the chart canvas
  const handleChartMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const clientX = e.clientX - rect.left;
    const svgX = (clientX / rect.width) * width;

    let closestIdx = 0;
    let minDiff = Infinity;
    dataPoints.forEach((_, i) => {
      const diff = Math.abs(getX(i) - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });
    setHoveredPoint(closestIdx);
  };

  return (
    <div className="business-card p-6 flex flex-col justify-between h-full">
      {/* Top Header Controls & Snapshot */}
      <div className="border-b border-slate-100 pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base md:text-lg font-bold text-slate-800">
              Cash Flow &amp; Revenue Wave
            </h3>
            <div className="mt-1.5">
              <span className="inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono font-bold whitespace-nowrap">
                Live Verified Ledger
              </span>
            </div>
          </div>

          {/* Horizon Switcher */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex bg-slate-100 rounded-xl p-1 text-sm font-semibold">
              <button
                onClick={() => {
                  setHorizon('timeline');
                  setHoveredPoint(null);
                }}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  horizon === 'timeline'
                    ? 'bg-white text-indigo-600 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Past + Future (30d)
              </button>
              <button
                onClick={() => {
                  setHorizon('14d');
                  setHoveredPoint(null);
                }}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  horizon === '14d'
                    ? 'bg-white text-indigo-600 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Next 14 Days
              </button>
              <button
                onClick={() => {
                  setHorizon('30d');
                  setHoveredPoint(null);
                }}
                className={`px-3.5 py-1.5 rounded-lg transition-all ${
                  horizon === '30d'
                    ? 'bg-white text-indigo-600 shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Next 30 Days
              </button>
            </div>
          </div>
        </div>

        {/* Live Active Hover Banner with Large Clear Fonts */}
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-sm min-h-[32px]">
          {activePoint ? (
            <div className="flex items-center gap-4 animate-fade-in w-full justify-between flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-bold text-slate-900 text-base">{activePoint.dateStr}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 whitespace-nowrap">
                  {activePoint.isPast ? 'Verified Transaction Record' : activePoint.isToday ? 'Today Live' : 'Projected Due Date'}
                </span>
                {activePoint.events.length > 0 && (
                  <span className="text-xs font-semibold text-indigo-700 truncate max-w-[340px]">
                    &bull; {activePoint.events[0]}
                  </span>
                )}
              </div>
              <div className="font-mono font-bold text-base flex items-center gap-1.5">
                <span className="text-slate-500 font-medium text-sm">Closing Cash:</span>
                <span className={activePoint.balance >= 0 ? 'text-indigo-600 font-black' : 'text-rose-600 font-black'}>
                  ₹{Math.round(activePoint.balance).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end w-full text-slate-600 text-sm">
              <div className="flex items-center gap-6 font-mono text-sm">
                <span>Peak: <strong className="text-emerald-600 font-bold">₹{Math.round(maxVal).toLocaleString('en-IN')}</strong></span>
                <span>Runway Min: <strong className={minVal >= 0 ? 'text-slate-850 font-bold' : 'text-rose-600 font-bold'}>₹{Math.round(minVal).toLocaleString('en-IN')}</strong></span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SVG Canvas Area: Enhanced with Fluid Hover Crosshair & Dynamic Animated Tooltip */}
      <div className="relative w-full flex-1 min-h-[270px] flex items-center justify-center my-2 select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full max-h-[320px] select-none cursor-crosshair"
          onMouseMove={handleChartMouseMove}
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <defs>
            <linearGradient id="cashFillGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.22" />
              <stop offset="60%" stopColor="#6366f1" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
            </linearGradient>

            <linearGradient id="deficitGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.20" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.03" />
            </linearGradient>

            <filter id="tooltipShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0f172a" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* Horizontal Financial Gridlines & Large Clear Currency Labels */}
          {yTicks.map((tickVal, idx) => {
            const yPos = getY(tickVal);
            const isZero = tickVal === 0;

            return (
              <g key={idx}>
                <line
                  x1={paddingX}
                  y1={yPos}
                  x2={width - paddingX}
                  y2={yPos}
                  stroke={isZero ? '#f43f5e' : '#cbd5e1'}
                  strokeDasharray={isZero ? '5 3' : '3 3'}
                  strokeWidth={isZero ? '1.5' : '1'}
                  opacity={isZero ? 0.85 : 0.7}
                />
                <text
                  x={paddingX - 12}
                  y={yPos + 4}
                  textAnchor="end"
                  fill={isZero ? '#e11d48' : '#475569'}
                  fontSize="12"
                  fontFamily="monospace"
                  fontWeight={isZero ? 'bold' : '600'}
                >
                  {tickVal > 0 ? `+₹${tickVal / 1000}k` : tickVal === 0 ? '₹0' : `-₹${Math.abs(tickVal) / 1000}k`}
                </text>
              </g>
            );
          })}

          {/* Deficit Danger Shade Zone (Below Zero Baseline) */}
          {zeroY < bottomY && (
            <rect
              x={paddingX}
              y={zeroY}
              width={width - 2 * paddingX}
              height={bottomY - zeroY}
              fill="url(#deficitGradient)"
              opacity="0.5"
            />
          )}

          {/* Area Fill Under Cash Wave */}
          <path d={cashFillPathD} fill="url(#cashFillGradient)" />

          {/* Today Separator Guide Line */}
          {horizon === 'timeline' && todayPoint && (
            <g>
              <line
                x1={todayX}
                y1={paddingY}
                x2={todayX}
                y2={bottomY}
                stroke="#6366f1"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <rect
                x={todayX - 25}
                y={paddingY - 16}
                width="50"
                height="18"
                rx="5"
                fill="#e0e7ff"
              />
              <text
                x={todayX}
                y={paddingY - 3}
                fill="#3730a3"
                fontSize="11"
                fontWeight="bold"
                textAnchor="middle"
              >
                TODAY
              </text>
            </g>
          )}

          {/* Main Professional Cash Curve */}
          <path
            d={cashPathD}
            fill="none"
            stroke="#4f46e5"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Interactive Crosshair & Floating Animated Value Tooltip */}
          {hoveredPoint !== null && (() => {
            const pt = dataPoints[hoveredPoint];
            const cx = getX(hoveredPoint);
            const cy = getY(pt.balance);

            // Calculate smart tooltip coordinates
            const tooltipWidth = 176;
            const tooltipHeight = pt.events.length > 0 ? 68 : 52;
            let tooltipX = cx - tooltipWidth / 2;
            if (tooltipX < paddingX) tooltipX = paddingX + 5;
            if (tooltipX + tooltipWidth > width - paddingX) tooltipX = width - paddingX - tooltipWidth - 5;

            const tooltipY = cy - tooltipHeight - 12 < paddingY ? cy + 14 : cy - tooltipHeight - 12;

            return (
              <g pointerEvents="none" className="transition-all duration-75">
                {/* Vertical Full-Height Tracking Crosshair Line */}
                <line
                  x1={cx}
                  y1={paddingY}
                  x2={cx}
                  y2={bottomY}
                  stroke="#4f46e5"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  opacity="0.85"
                />

                {/* Pulsing Target Rings */}
                <circle
                  cx={cx}
                  cy={cy}
                  r="14"
                  fill="#4f46e5"
                  opacity="0.18"
                />
                <circle
                  cx={cx}
                  cy={cy}
                  r="6"
                  fill="#4f46e5"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                />

                {/* Floating Glassmorphic Tooltip Card directly on the curve */}
                <g transform={`translate(${tooltipX}, ${tooltipY})`} filter="url(#tooltipShadow)">
                  {/* Card Background */}
                  <rect
                    width={tooltipWidth}
                    height={tooltipHeight}
                    rx="8"
                    fill="#0f172a"
                    stroke="#334155"
                    strokeWidth="1"
                    opacity="0.96"
                  />
                  {/* Date & Type */}
                  <text x="12" y="18" fill="#94a3b8" fontSize="11" fontWeight="600">
                    {pt.dateStr} {pt.isToday ? '• Today' : pt.isPast ? '• Verified' : '• Forecast'}
                  </text>
                  {/* Big Rupee Value */}
                  <text
                    x="12"
                    y="39"
                    fill={pt.balance >= 0 ? '#34d399' : '#fb7185'}
                    fontSize="16"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    ₹{Math.round(pt.balance).toLocaleString('en-IN')}
                  </text>
                  {/* Event Detail if any */}
                  {pt.events.length > 0 && (
                    <text x="12" y="56" fill="#e2e8f0" fontSize="10" fontWeight="500">
                      {pt.inflow > 0
                        ? `+₹${Math.round(pt.inflow).toLocaleString('en-IN')} Receipt`
                        : `-₹${Math.round(pt.outflow).toLocaleString('en-IN')} Payout`}
                    </text>
                  )}
                </g>
              </g>
            );
          })()}

          {/* Key Inflection Indicators on Transaction Days */}
          {dataPoints.map((pt, i) => {
            const cx = getX(i);
            const cy = getY(pt.balance);
            const hasInflow = pt.inflow > 0;
            const hasOutflow = pt.outflow > 0;

            if (!hasInflow && !hasOutflow) return null;

            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r="3.5"
                fill={hasInflow ? '#10b981' : '#f97316'}
                stroke="#ffffff"
                strokeWidth="1.5"
                pointerEvents="none"
              />
            );
          })}

          {/* Date Ticks on X-Axis with Clear Font Size */}
          {dataPoints
            .filter((_, i) => i === 0 || i === dataPoints.length - 1 || i % 5 === 0 || _.isToday)
            .map((pt, i) => (
              <text
                key={i}
                x={getX(pt.index)}
                y={height - 8}
                textAnchor="middle"
                fill={pt.isToday ? '#3730a3' : '#475569'}
                fontSize="12"
                fontWeight={pt.isToday ? 'bold' : '600'}
              >
                {pt.isToday ? 'Today' : pt.dateStr}
              </text>
            ))}
        </svg>
      </div>

      {/* Footer Legend Strip with Large Legible Fonts */}
      <div className="mt-auto pt-3.5 border-t border-slate-100 flex items-center justify-between text-sm text-slate-600 flex-wrap gap-2">
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-2 font-semibold text-slate-750">
            <span className="w-3.5 h-3.5 rounded-full bg-indigo-600"></span>
            Rolling Cash Balance
          </span>
          <span className="flex items-center gap-2 font-semibold text-slate-750">
            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500"></span>
            Revenue Receipt Spike
          </span>
          <span className="flex items-center gap-2 font-semibold text-slate-750">
            <span className="w-3.5 h-3.5 rounded-full bg-orange-500"></span>
            Merchant / Supplier Payout
          </span>
        </div>

        <span className="font-mono text-sm text-slate-600">
          Live Verified Balance: <strong className="text-slate-900 font-black text-base">₹{currentCash.toLocaleString('en-IN')}</strong>
        </span>
      </div>
    </div>
  );
};
