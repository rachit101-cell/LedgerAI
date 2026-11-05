'use client';

import React, { useState } from 'react';
import { Business } from '../types';
import { api } from '../lib/api';
import {
  IconShieldCheck,
  IconPayPal,
  IconFileText,
  IconWallet,
  IconBot,
  IconAlertTriangle,
  IconRefresh,
} from './Icons';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingApprovalsCount: number;
  onRefresh?: () => void;
  onResetDatabase?: () => Promise<void>;
  business?: Business | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingApprovalsCount,
  onRefresh,
  onResetDatabase,
  business,
}) => {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleConfirmReset = async () => {
    setIsResetting(true);
    try {
      if (onResetDatabase) {
        await onResetDatabase();
      } else {
        await api.resetDemoData();
        if (onRefresh) onRefresh();
      }
      setShowResetConfirm(false);
    } catch (err: any) {
      alert(`Reset failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsResetting(false);
    }
  };
  interface MenuItem {
    id: string;
    label: string;
    description: string;
    badge?: number;
    icon: React.ReactNode;
  }

  const menuItems: MenuItem[] = [
    {
      id: 'overview',
      label: 'Cash Flow Dashboard',
      description: 'Runway wave, inflows & outflows',
      icon: (
        <svg className="w-5 h-5 shrink-0" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      id: 'invoices',
      label: 'Receivables & Payables',
      description: 'Customer invoices & supplier bills',
      icon: (
        <svg className="w-5 h-5 shrink-0" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'reports',
      label: 'Financial Records',
      description: 'P&L, working capital & balance sheet',
      icon: (
        <svg className="w-5 h-5 shrink-0" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'ai-assistant',
      label: 'Financial Advisor',
      description: 'Cash gap intelligence & advisor',
      icon: (
        <svg className="w-5 h-5 shrink-0" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      id: 'decisions',
      label: 'Cash Bridge Solutions',
      description: 'Discounts, extensions & scenarios',
      icon: (
        <svg className="w-5 h-5 shrink-0" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: 'activity',
      label: 'Bank & Cash Ledger',
      description: 'Cash inflows, payouts & register',
      icon: (
        <svg className="w-5 h-5 shrink-0" width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 min-h-screen">
      {/* Top Branding */}
      <div>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* World-Class Fintech Logo Mark: Ledger L-Matrix + AI Spark */}
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-800 flex items-center justify-center shadow-md shadow-indigo-600/30 shrink-0 ring-1 ring-white/20">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                {/* Top-Left: Ledger Balance Block */}
                <rect x="3.5" y="3.5" width="7" height="7" rx="2" fill="white" />
                {/* Bottom-Left: Ledger Base Block */}
                <rect x="3.5" y="13.5" width="7" height="7" rx="2" fill="white" />
                {/* Bottom-Right: Ledger Settlement Block */}
                <rect x="13.5" y="13.5" width="7" height="7" rx="2" fill="white" />
                {/* Top-Right: Upward Financial Growth & Cash Flow Arrow */}
                <path
                  d="M14 10L19.5 4.5M15 4.5H19.5V9"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <span className="text-base font-black text-slate-900 tracking-tight block leading-tight">
                Ledger<span className="text-indigo-600">AI</span>
              </span>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Financial OS</p>
            </div>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh ledger records from backend"
              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all text-xs"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>

        {/* Active Business Context Bar - Clean & Perfectly Aligned */}
        <div className="mx-3.5 my-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-indigo-100/80 border border-indigo-200 flex items-center justify-center text-indigo-700 shrink-0">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18M3 7v14M21 7v14M6 7V3h12v4M9 11h2m-2 4h2m4-4h2m-2 4h2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block leading-none">
                  Workspace
                </span>
                <span className="text-xs font-black text-slate-900 truncate block mt-1 leading-tight">
                  Apex Enterprises
                </span>
              </div>
            </div>

            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live
            </span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="px-3 space-y-1">
          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isActive ? 'text-white' : 'text-slate-400'}>{item.icon}</span>
                  <div className="text-left">
                    <span className="block leading-tight">{item.label}</span>
                  </div>
                </div>

                {item.badge && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-white text-indigo-700' : 'bg-amber-500 text-white'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Hackathon Judge Database Reset Option */}
          <div className="pt-2 mt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              disabled={isResetting}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50/80 transition-all border border-rose-200/70 bg-rose-50/40 group active:scale-95 shadow-2xs"
              title="Reset database to initial demo state after testing payments"
            >
              <div className="flex items-center gap-3">
                <span className="text-rose-500 group-hover:rotate-180 transition-transform duration-500">
                  <svg className={`w-5 h-5 shrink-0 ${isResetting ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </span>
                <div className="text-left">
                  <span className="block leading-tight font-bold">Reset Demo Database</span>
                  <span className="text-[10px] text-rose-500/80 font-normal">Original baseline state</span>
                </div>
              </div>

              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">
                Judge
              </span>
            </button>
          </div>
        </nav>
      </div>

      {/* Footer / PayPal Sandbox Status */}
      <div className="p-4 border-t border-slate-100 space-y-2">
        <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs flex items-center gap-2">
          <IconPayPal className="w-4 h-4 text-[#0070ba] shrink-0" />
          <div className="text-[11px]">
            <span className="font-bold text-slate-800 block">PayPal Sandbox</span>
            <span className="text-slate-500">Live Dual-Path Active</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
          <span>Ledger Status</span>
          <span className="text-emerald-600 font-semibold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Verified
          </span>
        </div>
      </div>

      {/* Judge Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="business-card max-w-md w-full border-slate-200 bg-white p-6 space-y-4 rounded-2xl shadow-2xl relative text-slate-900">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-slate-900">Reset to Original Demo State?</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Designed for hackathon judges to reset all test data after testing sandbox payments, supplier bills, and collections.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 text-slate-700">
              <div className="font-semibold text-slate-900">This 1-click action will:</div>
              <ul className="space-y-1.5 text-[11px] list-disc list-inside text-slate-600">
                <li>Restore recorded bank cash to <strong className="text-slate-900">₹45,000.00</strong></li>
                <li>Restore upcoming supplier bills (<strong className="text-slate-900">₹65,000</strong> to Sunrise Distributors)</li>
                <li>Restore overdue receivables (<strong className="text-slate-900">₹35,000</strong> Sharma Traders, <strong className="text-slate-900">₹18,500</strong> Mehta Supermart)</li>
                <li>Clear sandbox test transactions, PayPal order captures, and payment logs</li>
                <li>Reset Cash Bridge solutions and runway charts to the initial baseline</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Resetting Database...</span>
                  </>
                ) : (
                  <span>Confirm &amp; Reset Database</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

