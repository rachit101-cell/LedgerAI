'use client';

import React, { useState } from 'react';
import { api } from '../lib/api';
import { IconPayPal, IconShieldCheck, IconAlertTriangle, IconRefresh, IconCheckCircle } from './Icons';

interface SettingsViewProps {
  onResetSuccess: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onResetSuccess }) => {
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    setResetDone(false);
    try {
      await api.resetDemoData();
      setResetDone(true);
      onResetSuccess();
    } catch (err) {
      alert('Failed to reset demo dataset');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Demo Environment & System Status</h2>
        <p className="text-xs text-slate-500 mt-1">
          Review PayPal Sandbox configuration, AI safety guardrails, and restore clean demo state.
        </p>
      </div>

      {/* 1-Click Demo Reset Card */}
      <div className="business-card p-6 border-emerald-200 bg-emerald-50/40 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200">
              <IconRefresh className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Restore Working Capital Baseline</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Resets the database cleanly to the scenario defined in <code className="text-emerald-700 font-mono font-bold">DEMO_SCRIPT.md</code>.
              </p>
            </div>
          </div>

          <button
            onClick={handleReset}
            disabled={resetting}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 active:scale-95 whitespace-nowrap"
          >
            <IconRefresh className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
            <span>{resetting ? 'Resetting Database...' : 'Reset Demo Baseline'}</span>
          </button>
        </div>

        {resetDone && (
          <div className="p-3 rounded-lg bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium">
            <IconCheckCircle className="w-4 h-4 text-emerald-700" />
            <span>Baseline successfully restored! Cash balance: ₹45,000 | Pending stock bill: ₹65,000 | Overdue invoice: ₹35,000.</span>
          </div>
        )}
      </div>

      {/* Environment Config Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="business-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-indigo-700 font-bold text-xs">
            <IconPayPal className="w-4 h-4" />
            <span>PayPal Sandbox Integration</span>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-400">Environment:</span>
              <span className="font-mono font-semibold text-slate-800">Sandbox</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Payment Capture:</span>
              <span className="font-semibold text-emerald-700">Server-Side Verified</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Reconciliation:</span>
              <span className="font-semibold text-emerald-700">Idempotent Webhooks</span>
            </div>
          </div>
        </div>

        <div className="business-card p-5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-xs">
            <IconShieldCheck className="w-4 h-4" />
            <span>Financial Integrity Policies</span>
          </div>
          <div className="space-y-1.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-400">Rounding Mode:</span>
              <span className="font-mono font-semibold text-slate-800">ROUND_HALF_UP</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Approval Hashing:</span>
              <span className="font-mono font-semibold text-slate-800">SHA-256 Strict</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">AI Role:</span>
              <span className="font-semibold text-slate-800">Deterministic Advisor</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
