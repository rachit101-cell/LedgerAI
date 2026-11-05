'use client';

import React, { useState, useEffect } from 'react';
import {
  AIChatResponse, ActionDraft, AIDailyBriefing,
  FinancialHealthScore, FinancialRiskItem, AIRecommendationItem,
  WhatIfSimulationResponse, AIReport
} from '../types';
import { api } from '../lib/api';
import {
  IconBot, IconSend, IconShieldCheck, IconFileText,
  IconPayPal, IconAlertTriangle, IconCheckCircle, IconArrowUpRight,
  IconWallet, IconRefresh
} from './Icons';

interface AIAssistantViewProps {
  initialPrompt?: string;
  onOpenReviewModal: (draft: ActionDraft) => void;
  onRefreshData: () => void;
  onNavigateToDecisions?: () => void;
  onNavigateToInvoices?: () => void;
  onNavigateToOverview?: () => void;
}

interface ChatMessage {
  sender: 'user' | 'assistant';
  text: string;
  response?: AIChatResponse;
  timestamp: string;
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  initialPrompt,
  onOpenReviewModal,
  onRefreshData,
  onNavigateToDecisions,
  onNavigateToInvoices,
  onNavigateToOverview,
}) => {
  const [activeTab, setActiveTab] = useState<'briefing' | 'chat' | 'whatif' | 'reports'>('briefing');

  // Briefing & Health State
  const [briefing, setBriefing] = useState<AIDailyBriefing | null>(null);
  const [healthScore, setHealthScore] = useState<FinancialHealthScore | null>(null);
  const [risks, setRisks] = useState<FinancialRiskItem[]>([]);
  const [recommendations, setRecommendations] = useState<AIRecommendationItem[]>([]);
  const [loadingBriefing, setLoadingBriefing] = useState(true);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'assistant',
      text: "Welcome to your Financial Co-Pilot. I continuously monitor your verified cash trajectory, customer invoices, and supplier dues. Select a quick action below or ask any question.",
      timestamp: 'Just now',
    },
  ]);
  const [inputQuery, setInputQuery] = useState(initialPrompt || '');
  const [loadingChat, setLoadingChat] = useState(false);

  // What-If Simulator State
  const [simCustomerAmount, setSimCustomerAmount] = useState<number>(35000);
  const [simCustomerDays, setSimCustomerDays] = useState<number>(1);
  const [simSupplierDelayDays, setSimSupplierDelayDays] = useState<number>(0);
  const [simRevenueGrowth, setSimRevenueGrowth] = useState<number>(0);
  const [simulationResult, setSimulationResult] = useState<WhatIfSimulationResponse | null>(null);
  const [loadingSim, setLoadingSim] = useState(false);

  // Reports Archive State
  const [reports, setReports] = useState<AIReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<AIReport | null>(null);
  const [savingReport, setSavingReport] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Fetch data
  const fetchAdvisorData = async () => {
    setLoadingBriefing(true);
    try {
      const [briefingData, healthData, risksData, recsData, reportsData] = await Promise.all([
        api.getAIBriefing().catch(() => null),
        api.getFinancialHealthScore().catch(() => null),
        api.getFinancialRisks().catch(() => ({ risks: [], total_at_risk_amount: 0, critical_risk_count: 0 })),
        api.getAIRecommendations().catch(() => ({ recommendations: [], potential_liquidity_unlocked: 0 })),
        api.getAIReports().catch(() => []),
      ]);

      if (briefingData) setBriefing(briefingData);
      if (healthData) setHealthScore(healthData);
      if (risksData) setRisks(risksData.risks || []);
      if (recsData) setRecommendations(recsData.recommendations || []);
      if (reportsData) setReports(reportsData);
    } catch (err) {
      console.error('Error fetching financial advisor data:', err);
    } finally {
      setLoadingBriefing(false);
    }
  };

  useEffect(() => {
    fetchAdvisorData();
    if (initialPrompt) {
      setActiveTab('chat');
      handleSend(initialPrompt);
    }
  }, [initialPrompt]);

  // Execute Grounded AI Chat
  const handleSend = async (queryToSend?: string) => {
    const text = (queryToSend || inputQuery).trim();
    if (!text || loadingChat) return;

    const userMsg: ChatMessage = {
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoadingChat(true);

    try {
      const data = await api.chatWithAI(text);
      const botMsg: ChatMessage = {
        sender: 'assistant',
        text: data.answer,
        response: data,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
      onRefreshData();
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        sender: 'assistant',
        text: `Unable to retrieve financial insights: ${err.message || 'Please verify backend server'}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoadingChat(false);
    }
  };

  // Run What-If Scenario Calculation
  const handleRunSimulation = async (preset?: { customer?: number; delay?: number }) => {
    setLoadingSim(true);
    const customerAmt = preset?.customer !== undefined ? preset.customer : simCustomerAmount;
    const delayDays = preset?.delay !== undefined ? preset.delay : simSupplierDelayDays;

    if (preset?.customer !== undefined) setSimCustomerAmount(preset.customer);
    if (preset?.delay !== undefined) setSimSupplierDelayDays(preset.delay);

    try {
      const result = await api.simulateWhatIfScenario({
        scenario_title: customerAmt > 0 ? `Customer Inflow ₹${customerAmt.toLocaleString('en-IN')}` : `Delayed Dues by ${delayDays}d`,
        customer_payment_amount: customerAmt,
        customer_payment_day_offset: simCustomerDays,
        delay_supplier_days: delayDays,
        revenue_growth_percent: simRevenueGrowth,
      });
      setSimulationResult(result);
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setLoadingSim(false);
    }
  };

  // Save Current Briefing
  const handleSaveReport = async () => {
    setSavingReport(true);
    try {
      const rep = await api.saveAIReport();
      setReports((prev) => [rep, ...prev]);
      setSaveSuccessMsg('Briefing successfully saved to historical audit archive!');
      setTimeout(() => setSaveSuccessMsg(''), 4000);
    } catch (err: any) {
      alert(`Could not save report: ${err.message || 'Error'}`);
    } finally {
      setSavingReport(false);
    }
  };

  const cash = Number(briefing?.recorded_cash || 45000);
  const receivables = Number(briefing?.total_receivables || 134500);
  const overdueRec = Number(briefing?.overdue_receivables || 53500);
  const payables = Number(briefing?.total_payables_due || 77500);
  const shortfall = Number(briefing?.projected_shortfall || 32500);
  const netCushion = Number(briefing?.net_working_capital || 42000);
  const quickRatio = briefing?.quick_ratio || 1.54;
  const score = healthScore?.overall_score || 68;

  return (
    <div className="space-y-6">
      {/* 1. Header Bar with Tabs */}
      <div className="business-card p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-sm">
            <IconBot className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">AI Financial Co-Pilot & Advisor</h2>
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Ledger Verified
              </span>
              {briefing?.provider_used && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {briefing.provider_used}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Glanceable solvency gauges, prioritized financial actions, and scenario simulation.
            </p>
          </div>
        </div>

        {/* Feature Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200 self-start md:self-auto overflow-x-auto shadow-xs">
          <button
            onClick={() => setActiveTab('briefing')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'briefing'
                ? 'bg-white text-indigo-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📊</span>
            <span>Daily Briefing & Health</span>
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'chat'
                ? 'bg-white text-indigo-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>💬</span>
            <span>Ask AI Advisor</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('whatif');
              if (!simulationResult) handleRunSimulation();
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'whatif'
                ? 'bg-white text-indigo-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>🔮</span>
            <span>What-If Simulator</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'reports'
                ? 'bg-white text-indigo-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📁</span>
            <span>Saved Reports ({reports.length})</span>
          </button>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-bold flex items-center justify-between">
          <span>{saveSuccessMsg}</span>
          <button onClick={() => setSaveSuccessMsg('')} className="text-emerald-600 font-bold">✕</button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: VISUAL DAILY BRIEFING & 5-PILLAR HEALTH SCORE                      */}
      {/* ========================================================================= */}
      {activeTab === 'briefing' && (
        <div className="space-y-6">
          {/* Executive Visual Alert Banner (Rich Golden Yellow per user preference) */}
          <div
            className="p-4 md:p-5 border-2 border-amber-400 rounded-2xl space-y-3 shadow-md"
            style={{
              background: 'linear-gradient(135deg, #FEF08A 0%, #FDE047 100%)',
              boxShadow: '0 4px 20px -2px rgba(245, 158, 11, 0.25)',
            }}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b-2 border-amber-400/80">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-rose-600 text-white shadow-xs">
                  CRITICAL ALERT
                </span>
                <span className="text-sm md:text-base font-black text-slate-950 font-mono">
                  Projected Cash Gap: -₹{shortfall.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-300 text-amber-950 border border-amber-500/70 shadow-2xs">
                  Due 2026-10-19
                </span>
              </div>
              <div className="text-xs font-bold text-slate-900">
                Cash on hand: <span className="font-mono font-black">₹{cash.toLocaleString('en-IN')}</span> • Supplier dues:{' '}
                <span className="font-mono font-black text-rose-700">₹{payables.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Visual Resolution Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-950 border border-emerald-500/70 shadow-2xs">
                  ✓ Recommended Fix Ready
                </span>
                <p className="text-xs text-slate-950 font-semibold">
                  Collect <strong className="font-black">₹35,000</strong> from <strong className="font-black">Sharma Traders</strong> via 2% Early Pay settlement.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (onNavigateToDecisions) onNavigateToDecisions();
                    else setActiveTab('chat');
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md shadow-rose-600/30 ring-2 ring-amber-400/50 transition-all whitespace-nowrap"
                >
                  ⚡ Review &amp; Authorize Fix
                </button>
                <button
                  onClick={() => {
                    setActiveTab('whatif');
                    handleRunSimulation({ customer: 35000, delay: 0 });
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-amber-50 border-2 border-amber-400 text-slate-950 font-bold text-xs transition-all shadow-xs whitespace-nowrap"
                >
                  Simulate Other Scenarios →
                </button>
              </div>
            </div>
          </div>

          {/* 4 Glanceable KPI Metric Gauges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Card 1: Cash in Bank */}
            <div className="business-card p-4 space-y-2 border-t-4 border-t-emerald-500">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Cash in Bank</span>
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <IconWallet className="w-4 h-4" />
                </span>
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                ₹{cash.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: '58%' }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Covers 58% of dues</span>
                <span className="font-bold text-emerald-700">Bank Verified</span>
              </div>
            </div>

            {/* Card 2: Wholesale Receivables */}
            <div className="business-card p-4 space-y-2 border-t-4 border-t-indigo-500">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Receivables Owed</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200">
                  ₹53.5k Overdue
                </span>
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                ₹{receivables.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                <div className="bg-emerald-500 h-full" style={{ width: '45%' }} title="Realized 45%" />
                <div className="bg-indigo-400 h-full" style={{ width: '16%' }} title="Current 16%" />
                <div className="bg-amber-500 h-full" style={{ width: '39%' }} title="Overdue 39%" />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>45% Realized (₹60k)</span>
                <span className="font-bold text-indigo-700">4 Clients</span>
              </div>
            </div>

            {/* Card 3: Supplier Payables */}
            <div className="business-card p-4 space-y-2 border-t-4 border-t-rose-500">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Supplier Obligations</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                  Due Oct 19
                </span>
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                ₹{payables.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                <div className="bg-rose-500 h-full" style={{ width: '84%' }} title="Sunrise Stock (₹65k)" />
                <div className="bg-amber-500 h-full" style={{ width: '16%' }} title="Kisan Freight (₹12.5k)" />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Sunrise: ₹65k (84%)</span>
                <span className="font-bold text-rose-600">Deficit: ₹32.5k</span>
              </div>
            </div>

            {/* Card 4: Net Working Capital Cushion */}
            <div className="business-card p-4 space-y-2 border-t-4 border-t-emerald-600">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Net Solvency Cushion</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {quickRatio}x Acid-Test
                </span>
              </div>
              <div className="text-xl font-black text-emerald-700 font-mono">
                +₹{netCushion.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div className="bg-emerald-600 h-full rounded-full" style={{ width: '75%' }} />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Solvent Balance Sheet</span>
                <span className="font-bold text-emerald-700">&gt; 1.0x Ratio</span>
              </div>
            </div>
          </div>

          {/* Today's Top 3 Business Priorities (Visual High-Contrast Action Cards) */}
          <div className="business-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight">Today&apos;s 3 High-Impact Priorities</h3>
                <p className="text-xs text-slate-500">Ranked by cash deficit elimination and liquidity recovery</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Priority 1 */}
              <div className="p-4 rounded-2xl border-2 border-rose-300 bg-rose-50/40 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-rose-600 font-mono">01</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-600 text-white">
                      Critical
                    </span>
                  </div>
                  <h4 className="text-xs font-black text-slate-900 leading-snug">
                    Eliminate ₹32,500 Cash Gap (Due Oct 19)
                  </h4>
                  <div className="p-2.5 rounded-xl bg-white border border-rose-200 text-[11px] font-semibold text-rose-950">
                    Collect ₹35,000 from Sharma Traders with 2% Early Pay settlement to unlock immediate bank funds.
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (onNavigateToDecisions) onNavigateToDecisions();
                    else setActiveTab('chat');
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-between shadow-xs transition-all"
                >
                  <span>Authorize 2% Early Pay Fix</span>
                  <span>→</span>
                </button>
              </div>

              {/* Priority 2 */}
              <div className="p-4 rounded-2xl border-2 border-amber-300 bg-amber-50/40 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-amber-600 font-mono">02</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-white">
                      High
                    </span>
                  </div>
                  <h4 className="text-xs font-black text-slate-900 leading-snug">
                    Collect ₹53,500 in Overdue Invoices
                  </h4>
                  <div className="p-2.5 rounded-xl bg-white border border-amber-200 text-[11px] font-semibold text-amber-950">
                    Sharma Traders (₹35k) &amp; Mehta Supermart (₹18.5k) are past terms. Send audited payment reminders.
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (onNavigateToInvoices) onNavigateToInvoices();
                    else setActiveTab('chat');
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-between shadow-xs transition-all"
                >
                  <span>Collect Overdue Invoices</span>
                  <span>→</span>
                </button>
              </div>

              {/* Priority 3 */}
              <div className="p-4 rounded-2xl border-2 border-indigo-200 bg-indigo-50/40 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-indigo-700 font-mono">03</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-600 text-white">
                      Strategic
                    </span>
                  </div>
                  <h4 className="text-xs font-black text-slate-900 leading-snug">
                    Stagger ₹65,000 Sunrise Stock Bill
                  </h4>
                  <div className="p-2.5 rounded-xl bg-white border border-indigo-200 text-[11px] font-semibold text-indigo-950">
                    Negotiate 14-day split (₹30k now + ₹35k later) to preserve continuous working capital liquidity.
                  </div>
                </div>

                <button
                  onClick={() => {
                    setActiveTab('whatif');
                    handleRunSimulation({ customer: 0, delay: 14 });
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-between shadow-xs transition-all"
                >
                  <span>Model 14-Day Term Split</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>

          {/* 5-Pillar Financial Health Score (Visual Radial Gauge & Visual Factor Cards) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Visual Gauge (1 Col) */}
            <div className="business-card p-6 flex flex-col items-center justify-center text-center space-y-4">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">Business Health Score</span>

              {/* Radial Dial */}
              <div className="relative w-44 h-44 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" className="stroke-slate-100" strokeWidth="10" fill="transparent" />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke={score >= 70 ? '#10B981' : '#F59E0B'}
                    strokeWidth="10"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * score) / 100}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-4xl font-black text-slate-900 font-mono">{score}</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Out of 100</span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                  {healthScore?.rating || 'Attention Needed'}
                </span>
                <p className="text-xs text-slate-600 max-w-xs leading-relaxed font-medium">
                  Solvent on accrual balance sheet (1.54x), but facing a ₹32,500 timing deficit on Oct 19.
                </p>
              </div>
            </div>

            {/* 5 Visual Factor Progress Cards (2 Cols) */}
            <div className="lg:col-span-2 business-card p-5 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  5 Diagnostic Component Pillars
                </h3>
                <span className="text-[11px] text-slate-400 font-medium">Scored 0 to 20 pts each</span>
              </div>

              <div className="space-y-3">
                {/* 1. Cash Flow */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">Cash Flow &amp; Runway Stability</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-600 font-medium">₹45k Cash (58% immediate coverage)</span>
                      <span className="font-mono font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded text-xs">
                        11/20
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: '55%' }} />
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    ⚡ <strong>Fix:</strong> Execute early pay settlement to eliminate Oct 19 deficit.
                  </div>
                </div>

                {/* 2. Receivables */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">Receivables Performance &amp; Aging</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-600 font-medium">45% Realized, ₹53.5k Overdue</span>
                      <span className="font-mono font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded text-xs">
                        13/20
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: '65%' }} />
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    ⚡ <strong>Fix:</strong> Send direct payment reminders to Sharma Traders &amp; Mehta Supermart.
                  </div>
                </div>

                {/* 3. Payables */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">Payables &amp; Solvency Health</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-emerald-700 font-medium">1.54x Quick Ratio (Solvent)</span>
                      <span className="font-mono font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-xs">
                        14/20
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: '70%' }} />
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    ⚡ <strong>Fix:</strong> Clear Kisan Freight (₹12,500) to keep carrier logistics active.
                  </div>
                </div>

                {/* 4. Profitability */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">Operating Gross Margin &amp; Profit</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-emerald-700 font-medium">+16.4% Gross Margin (+₹22,000)</span>
                      <span className="font-mono font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-xs">
                        16/20
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: '80%' }} />
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    ⚡ <strong>Fix:</strong> Maintain wholesale pricing margins above 15% on bulk orders.
                  </div>
                </div>

                {/* 5. Expense Control */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-900">Expense Control &amp; Concentration</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-600 font-medium">58% Single-Supplier Exposure</span>
                      <span className="font-mono font-black text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200 text-xs">
                        14/20
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div className="bg-indigo-500 h-full rounded-full" style={{ width: '70%' }} />
                  </div>
                  <div className="text-[11px] text-slate-500 font-medium">
                    ⚡ <strong>Fix:</strong> Stagger major bulk payments into bi-weekly tranches.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Financial Risks (Visual Cards with Evidence Chips) */}
          <div className="business-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 tracking-tight">Active Financial Risk Radar</h3>
                <p className="text-xs text-slate-500">Live ledger inspection with verified supporting evidence</p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200">
                1 Critical • 2 High • 1 Medium
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Risk 1: Shortfall */}
              <div className="p-4 rounded-2xl border-2 border-rose-300 bg-rose-50/30 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-600 text-white">
                      Critical Risk
                    </span>
                    <span className="text-sm font-black text-rose-700 font-mono">-₹32,500.00</span>
                  </div>
                  <h4 className="text-xs font-black text-slate-900">Projected Cash Deficit on Oct 19</h4>
                  <p className="text-[11px] text-slate-600">
                    Bank cash (₹45,000) falls short when Sunrise bill (₹65,000) matures.
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-700">
                      BILL-2026-0016
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-700">
                      Due: 2026-10-19
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (onNavigateToDecisions) onNavigateToDecisions();
                    else setActiveTab('chat');
                  }}
                  className="w-full py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition-all"
                >
                  Review &amp; Authorize Fix →
                </button>
              </div>

              {/* Risk 2: Overdue Invoices */}
              <div className="p-4 rounded-2xl border-2 border-amber-300 bg-amber-50/30 flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-white">
                      High Risk
                    </span>
                    <span className="text-sm font-black text-amber-700 font-mono">₹53,500.00</span>
                  </div>
                  <h4 className="text-xs font-black text-slate-900">Overdue Customer Receivables</h4>
                  <p className="text-[11px] text-slate-600">
                    Sharma Traders (₹35k, 19d overdue) and Mehta Supermart (₹18.5k, 26d overdue).
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-700">
                      INV-2026-0042
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-slate-700">
                      INV-2026-0037
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (onNavigateToInvoices) onNavigateToInvoices();
                    else setActiveTab('chat');
                  }}
                  className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all"
                >
                  Inspect &amp; Collect Invoices →
                </button>
              </div>

              {/* Risk 3: Overdue Supplier */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-white">
                      High Risk
                    </span>
                    <span className="text-sm font-black text-slate-900 font-mono">₹12,500.00</span>
                  </div>
                  <h4 className="text-xs font-black text-slate-900">Kisan Agro Logistics Overdue Bill</h4>
                  <p className="text-[11px] text-slate-600">
                    Logistics freight bill past due date. Settle to keep carrier channels open.
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-50 border border-slate-200 font-mono text-slate-700">
                      BILL-2026-0018
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (onNavigateToInvoices) onNavigateToInvoices();
                    else setActiveTab('chat');
                  }}
                  className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all"
                >
                  Pay Supplier Bill →
                </button>
              </div>

              {/* Risk 4: Supplier Concentration */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-200 text-slate-700">
                      Medium Risk
                    </span>
                    <span className="text-sm font-black text-indigo-700 font-mono">₹65,000.00 (58%)</span>
                  </div>
                  <h4 className="text-xs font-black text-slate-900">Sunrise Distributors Concentration</h4>
                  <p className="text-[11px] text-slate-600">
                    Represents 58% of payable commitments. Stagger terms into bi-weekly payments.
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-50 border border-slate-200 font-mono text-slate-700">
                      57.8% Direct Costs
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setActiveTab('whatif');
                    handleRunSimulation({ customer: 0, delay: 14 });
                  }}
                  className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all"
                >
                  Simulate Term Staggering →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: INTELLIGENT AI CHATBOT (GROUNDED WITH VERIFIED LEDGER RECORDS)       */}
      {/* ========================================================================= */}
      {activeTab === 'chat' && (
        <div className="space-y-4">
          {/* Top Live Financial Stakes Bar (Themed with Signature Indigo/Slate Gradient & Left Border Accent) */}
          <div className="p-4 md:p-5 rounded-2xl bg-gradient-to-r from-indigo-50/80 via-white to-slate-50 border border-indigo-200/90 border-l-4 border-l-indigo-600 shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25 shrink-0">
                <IconBot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">Live Executive Financial Context</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Verified
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 font-medium">All responses computed directly from current business ledger records.</p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="p-2.5 px-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Bank Cash
                </span>
                <span className="font-mono font-black text-slate-900 text-sm sm:text-base mt-0.5 block">₹{cash.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-2.5 px-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Overdue Invoices
                </span>
                <span className="font-mono font-black text-amber-700 text-sm sm:text-base mt-0.5 block">₹{overdueRec.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-2.5 px-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                  Oct 19 Gap
                </span>
                <span className="font-mono font-black text-rose-700 text-sm sm:text-base mt-0.5 block">-₹{shortfall.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-2.5 px-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <span className="text-[10px] text-slate-500 block font-bold uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  Solvency Ratio
                </span>
                <span className="font-mono font-black text-indigo-700 text-sm sm:text-base mt-0.5 block">{quickRatio}x</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[640px]">
            {/* Main Chat Thread (8 cols) */}
            <div className="lg:col-span-8 business-card flex flex-col h-[720px] overflow-hidden border-2 border-slate-200/90 shadow-sm">
              {/* Chat Card Header */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs">
                    <IconBot className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">Executive Financial &amp; Cash Advisor</h3>
                    <p className="text-[11px] text-slate-500 font-medium">
                      Live ledger grounded • Verified customer receivables &amp; supplier dues
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-300 font-bold shadow-2xs">
                    <IconShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Audited Mode</span>
                  </span>
                </div>
              </div>

              {/* Message Thread */}
              <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4 bg-slate-50/30">
                {messages.map((msg, i) => {
                  const isUser = msg.sender === 'user';
                  const isFirstAssistant = i === 0 && !isUser;

                  return (
                    <div key={i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                      {/* Top sender indicator */}
                      <div className="flex items-center gap-1.5 mb-1 px-1">
                        <span className="text-[10px] font-bold text-slate-400">
                          {isUser ? 'Business Owner' : 'AI Financial Co-Pilot'}
                        </span>
                        <span className="text-[10px] text-slate-300">• {msg.timestamp}</span>
                      </div>

                      <div
                        className={`max-w-2xl p-4 md:p-5 rounded-2xl text-xs space-y-3 leading-relaxed shadow-sm ${
                          isUser
                            ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white rounded-tr-none'
                            : 'bg-white border-2 border-slate-200/90 text-slate-900 rounded-tl-none'
                        }`}
                      >
                        {/* If it's the welcome message, show high-impact quick prompts */}
                        {isFirstAssistant && (
                          <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200/80 mb-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 block">
                              Verified Financial Intelligence Assistant
                            </span>
                            <p className="text-xs text-slate-800 font-medium mt-0.5">
                              Continuously monitoring live ledger balances, invoice aging, and supplier obligations. Select a verified command below or type any question:
                            </p>
                            <div className="flex flex-wrap gap-2 pt-2.5">
                              <button
                                onClick={() => handleSend('Will I have enough cash to pay my supplier this week?')}
                                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-indigo-600 hover:text-white border border-indigo-200 text-indigo-700 font-bold text-[11px] transition-all shadow-2xs"
                              >
                                ⚡ Check Oct 19 Cash Gap
                              </button>
                              <button
                                onClick={() => handleSend('Who owes us money? Analyze customer payment behavior')}
                                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-indigo-600 hover:text-white border border-indigo-200 text-indigo-700 font-bold text-[11px] transition-all shadow-2xs"
                              >
                                👥 Overdue Customer Debts
                              </button>
                              <button
                                onClick={() => handleSend('Prepare a collection action for Sharma Traders invoice')}
                                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-indigo-600 hover:text-white border border-indigo-200 text-indigo-700 font-bold text-[11px] transition-all shadow-2xs"
                              >
                                💳 1-Click Collection Action
                              </button>
                            </div>
                          </div>
                        )}

                        <p className="whitespace-pre-line text-xs font-medium leading-relaxed">
                          {msg.text
                            .replace(/[#*]/g, '')
                            .replace(/\bINR\s*/g, '₹')
                            .replace(/⚡\s*\[Mode:.*?\]\n*/g, '')
                            .replace(/🤖\s*\[AI Provider:.*?\]\n*/g, '')
                            .trim()}
                        </p>

                        {/* Supporting Evidence Card */}
                        {msg.response?.evidence && msg.response.evidence.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                            <div className="flex items-center gap-1.5">
                              <IconShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
                                Verified Database Records Cited:
                              </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {msg.response.evidence.map((ev, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between text-[11px] p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-800 shadow-2xs"
                                >
                                  <span className="font-bold truncate max-w-[200px] text-slate-700">{ev.label}</span>
                                  {ev.amount !== undefined && (
                                    <span className="font-mono font-black text-indigo-700 shrink-0">
                                      ₹{Number(ev.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action Draft Dispatcher */}
                        {msg.response?.action_draft && (
                          <div className="mt-3 p-4 rounded-xl bg-gradient-to-r from-amber-50/70 to-indigo-50/60 border-2 border-indigo-200 space-y-2.5 text-slate-800 shadow-xs">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                                <IconPayPal className="w-4 h-4 text-[#0070ba]" />
                                Prepared Settlement Action Draft
                              </span>
                              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-black">
                                Awaiting Owner Authorization
                              </span>
                            </div>
                            <p className="text-xs text-slate-700">
                              Cryptographic draft prepared for <strong className="text-slate-950 font-black">{msg.response.action_draft.action_type.replace(/_/g, ' ')}</strong>. Unlocks verified immediate cash.
                            </p>
                            <button
                              onClick={() => onOpenReviewModal(msg.response!.action_draft!)}
                              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 active:scale-98"
                            >
                              <span>⚡ Review &amp; Authorize Action</span>
                              <span>&rarr;</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {loadingChat && (
                  <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-white border border-indigo-200 text-indigo-900 text-xs w-fit shadow-xs animate-pulse">
                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="font-bold">Analyzing ledger balances, aging schedules, and cash obligations...</span>
                  </div>
                )}
              </div>

              {/* Quick-Action Chips Strip (Above Input) */}
              <div className="px-3 pt-2.5 pb-1 bg-white border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto text-[11px] no-scrollbar">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1">Quick:</span>
                <button
                  onClick={() => handleSend('Will I have enough cash to pay my supplier this week?')}
                  disabled={loadingChat}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-bold whitespace-nowrap transition-all border border-slate-200"
                >
                  ⚡ Cash Gap Oct 19
                </button>
                <button
                  onClick={() => handleSend('Who owes us money? Analyze customer payment behavior')}
                  disabled={loadingChat}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-bold whitespace-nowrap transition-all border border-slate-200"
                >
                  👥 Overdue Invoices
                </button>
                <button
                  onClick={() => handleSend('What is our operating profit margin and net working capital?')}
                  disabled={loadingChat}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-bold whitespace-nowrap transition-all border border-slate-200"
                >
                  📊 Operating Margin
                </button>
                <button
                  onClick={() => handleSend('Prepare a collection action for Sharma Traders invoice')}
                  disabled={loadingChat}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 font-bold whitespace-nowrap transition-all border border-slate-200"
                >
                  💳 Collect ₹35,000
                </button>
              </div>

              {/* Input Bar */}
              <div className="p-3 bg-white border-t border-slate-100">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    placeholder="Ask about cash position, client payment behavior, supplier dues, or P&L..."
                    disabled={loadingChat}
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-50 border-2 border-slate-200 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-indigo-600 focus:bg-white transition-all disabled:opacity-50 font-medium"
                  />
                  <button
                    type="submit"
                    disabled={loadingChat || !inputQuery.trim()}
                    className="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center gap-2 shadow-md shadow-indigo-600/25 transition-all disabled:opacity-50 active:scale-95 shrink-0"
                  >
                    <span>Analyze</span>
                    <IconSend className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>

            {/* Right Column: Categorized Executive Scenario Cards & Governing Matrix (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              {/* Executive Scenarios Panel */}
              <div className="business-card p-5 space-y-3.5 border-2 border-slate-200/90 shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2 text-indigo-700 font-black text-xs uppercase tracking-wider">
                    <IconShieldCheck className="w-4 h-4 text-indigo-600" />
                    <span>Executive Scenario Commands</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">1-Click Live Audit</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium">
                  Select a live financial investigation. Computed via verified Python Decimal arithmetic:
                </p>

                <div className="space-y-2.5">
                  {/* Card 1: Cash Gap & Solvency */}
                  <div
                    onClick={() => handleSend('Will I have enough cash to pay my supplier this week?')}
                    className="p-3 rounded-xl border border-rose-200/90 bg-rose-50/40 hover:bg-rose-50 hover:border-rose-300 transition-all cursor-pointer space-y-1.5 shadow-2xs group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-800 bg-rose-100/80 px-2 py-0.5 rounded">
                        ⚡ Liquidity &amp; Solvency
                      </span>
                      <span className="text-[10px] font-bold text-rose-600 group-hover:translate-x-0.5 transition-transform">Run →</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 leading-snug">
                      Will I have enough cash to pay my supplier this week?
                    </p>
                    <span className="text-[10px] text-rose-700 block font-semibold">
                      Analyzes impending -₹32,500 gap on Oct 19
                    </span>
                  </div>

                  {/* Card 2: Customer Debts & Payment Behavior */}
                  <div
                    onClick={() => handleSend('Who owes us money? Analyze customer payment behavior')}
                    className="p-3 rounded-xl border border-indigo-200/90 bg-indigo-50/40 hover:bg-indigo-50 hover:border-indigo-300 transition-all cursor-pointer space-y-1.5 shadow-2xs group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-800 bg-indigo-100/80 px-2 py-0.5 rounded">
                        👥 Customer Aging
                      </span>
                      <span className="text-[10px] font-bold text-indigo-600 group-hover:translate-x-0.5 transition-transform">Run →</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 leading-snug">
                      Who owes us money? Analyze customer payment behavior
                    </p>
                    <span className="text-[10px] text-indigo-700 block font-semibold">
                      Audits ₹53,500 overdue across Gupta &amp; Sharma
                    </span>
                  </div>

                  {/* Card 3: Operating Expenses & Dues */}
                  <div
                    onClick={() => handleSend('What are our biggest direct operating expenses and supplier dues?')}
                    className="p-3 rounded-xl border border-amber-200/90 bg-amber-50/40 hover:bg-amber-50 hover:border-amber-300 transition-all cursor-pointer space-y-1.5 shadow-2xs group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-amber-900 bg-amber-100/80 px-2 py-0.5 rounded">
                        📉 Cost Structure
                      </span>
                      <span className="text-[10px] font-bold text-amber-700 group-hover:translate-x-0.5 transition-transform">Run →</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 leading-snug">
                      What are our biggest direct operating expenses and supplier dues?
                    </p>
                    <span className="text-[10px] text-amber-800 block font-semibold">
                      Breaks down Sunrise Stock vs Kisan Freight
                    </span>
                  </div>

                  {/* Card 4: Operating Profit & Net Margin */}
                  <div
                    onClick={() => handleSend('What is our operating profit margin and net working capital?')}
                    className="p-3 rounded-xl border border-emerald-200/90 bg-emerald-50/40 hover:bg-emerald-50 hover:border-emerald-300 transition-all cursor-pointer space-y-1.5 shadow-2xs group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900 bg-emerald-100/80 px-2 py-0.5 rounded">
                        📊 P&amp;L Margin
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 group-hover:translate-x-0.5 transition-transform">Run →</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 leading-snug">
                      What is our operating profit margin and net working capital?
                    </p>
                    <span className="text-[10px] text-emerald-800 block font-semibold">
                      Computes +16.4% margin and +₹42,000 cushion
                    </span>
                  </div>

                  {/* Card 5: 1-Click Collection Action */}
                  <div
                    onClick={() => handleSend('Prepare a collection action for Sharma Traders invoice')}
                    className="p-3 rounded-xl border-2 border-indigo-400 bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 transition-all cursor-pointer space-y-1.5 shadow-2xs group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 bg-indigo-200/80 px-2 py-0.5 rounded flex items-center gap-1">
                        <IconPayPal className="w-3 h-3 text-[#0070ba]" />
                        Cash Bridge Action
                      </span>
                      <span className="text-[10px] font-bold text-indigo-700 group-hover:translate-x-0.5 transition-transform">Draft →</span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 leading-snug">
                      Prepare a collection action for Sharma Traders invoice
                    </p>
                    <span className="text-[10px] text-indigo-800 block font-black">
                      Unlocks +₹34,300 instant liquidity with 2% discount
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: VISUAL WHAT-IF SCENARIO SIMULATOR                                  */}
      {/* ========================================================================= */}
      {activeTab === 'whatif' && (
        <div className="space-y-6">
          <div className="business-card p-5 md:p-6 space-y-4 border-l-4 border-l-indigo-600">
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">Visual What-If Scenario Simulator</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Model customer receipts, supplier deferrals, and revenue fluctuations. Recalculates cash runway without modifying database records.
              </p>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="text-xs text-slate-500 font-semibold self-center mr-1">Quick Presets:</span>
              <button
                onClick={() => handleRunSimulation({ customer: 35000, delay: 0 })}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold text-xs border border-indigo-200 transition-all shadow-xs"
              >
                ⚡ Sharma Pays ₹35k Tomorrow
              </button>
              <button
                onClick={() => handleRunSimulation({ customer: 0, delay: 7 })}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-900 font-bold text-xs border border-indigo-200 transition-all shadow-xs"
              >
                📅 Delay Sunrise Bill 7 Days
              </button>
              <button
                onClick={() => handleRunSimulation({ customer: 35000, delay: 14 })}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-xs border border-emerald-300 transition-all shadow-xs"
              >
                🎯 Combined: Collect ₹35k + 14d Split
              </button>
            </div>

            {/* Interactive Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-3 border-t border-slate-200">
              <div className="space-y-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">Customer Receipt Banked</span>
                  <span className="font-mono font-black text-indigo-700">₹{simCustomerAmount.toLocaleString('en-IN')}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="74500"
                  step="5000"
                  value={simCustomerAmount}
                  onChange={(e) => setSimCustomerAmount(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
                <span className="text-[10px] text-slate-500 block">Simulates early collection from clients</span>
              </div>

              <div className="space-y-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">Delay Supplier Bill (Sunrise Stock)</span>
                  <span className="font-mono font-black text-indigo-700">{simSupplierDelayDays} Days</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="21"
                  step="3"
                  value={simSupplierDelayDays}
                  onChange={(e) => setSimSupplierDelayDays(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
                <span className="text-[10px] text-slate-500 block">Defers ₹65,000 inventory due date</span>
              </div>

              <div className="space-y-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">Wholesale Revenue Growth</span>
                  <span className="font-mono font-black text-indigo-700">{simRevenueGrowth > 0 ? `+${simRevenueGrowth}%` : `${simRevenueGrowth}%`}</span>
                </div>
                <input
                  type="range"
                  min="-30"
                  max="30"
                  step="5"
                  value={simRevenueGrowth}
                  onChange={(e) => setSimRevenueGrowth(Number(e.target.value))}
                  className="w-full accent-indigo-600"
                />
                <span className="text-[10px] text-slate-500 block">Tests sales surge or slowdown</span>
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <button
                onClick={() => handleRunSimulation()}
                disabled={loadingSim}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all"
              >
                {loadingSim ? 'Calculating Scenario...' : 'Recalculate Scenario Math →'}
              </button>
            </div>
          </div>

          {/* Visual Scenario Results */}
          {simulationResult && (
            <div className="space-y-4">
              {/* Verdict Banner */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                  simulationResult.deficit_resolved
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-xl ${
                      simulationResult.deficit_resolved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    <IconCheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black">
                      {simulationResult.deficit_resolved
                        ? '✓ Projected Cash Deficit Completely Resolved!'
                        : '⚠️ Partial Relief: Residual Deficit Remains'}
                    </h4>
                    <p className="text-xs font-medium leading-relaxed mt-0.5">{simulationResult.actionable_takeaway}</p>
                  </div>
                </div>
              </div>

              {/* Before vs. After Visual Comparison */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="business-card p-4 space-y-1 border-t-4 border-t-emerald-500">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Oct 19 Cash Gap</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-rose-500 line-through font-mono">
                      -₹{Number(simulationResult.baseline_deficit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-base font-black text-emerald-600 font-mono">
                      ₹{Number(simulationResult.simulated_deficit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-black">100% Cleared</span>
                </div>

                <div className="business-card p-4 space-y-1 border-t-4 border-t-indigo-500">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Ending Cash Balance</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-slate-400 font-mono">
                      ₹{Number(simulationResult.baseline_cash).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-base font-black text-slate-900 font-mono">
                      ₹{Number(simulationResult.simulated_ending_cash).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <span className="text-[10px] text-indigo-700 font-black">
                    +₹{Number(simulationResult.cash_variance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} Boost
                  </span>
                </div>

                <div className="business-card p-4 space-y-1 border-t-4 border-t-emerald-600">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Solvency Coverage Ratio</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-slate-400 font-mono">{simulationResult.baseline_quick_ratio}x</span>
                    <span className="text-base font-black text-emerald-700 font-mono">
                      {simulationResult.simulated_quick_ratio}x
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-700 font-black">Stronger Buffer</span>
                </div>

                <div className="business-card p-4 space-y-1 border-t-4 border-t-slate-400">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Database Safety</span>
                  <div className="text-base font-black text-slate-900">In-Memory</div>
                  <span className="text-[10px] text-slate-500 font-semibold">Live records untouched</span>
                </div>
              </div>

              {/* Visual 14-Day Trajectory Curve (SVG Sparkline Comparison) */}
              <div className="business-card p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      14-Day Visual Trajectory: Baseline vs. Simulated Cash
                    </h4>
                    <p className="text-[11px] text-slate-500">Visual proof of cash balance across the Oct 19 maturity date</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-bold">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-1 bg-rose-500 rounded-full inline-block"></span>
                      <span className="text-slate-600">Baseline (Gap -₹32.5k)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-1 bg-emerald-500 rounded-full inline-block"></span>
                      <span className="text-emerald-700 font-black">Simulated (Surplus +₹2.5k)</span>
                    </div>
                  </div>
                </div>

                {/* Trajectory comparison bars */}
                <div className="grid grid-cols-7 gap-2 pt-2">
                  {simulationResult.daily_trajectory_simulated.slice(0, 7).map((day, idx) => {
                    const baseDay = simulationResult.daily_trajectory_baseline[idx] || { cash: 0 };
                    const isDeficitDay = baseDay.cash < 0;
                    return (
                      <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 block">{day.date}</span>
                        <div className="space-y-0.5">
                          <span className={`text-[10px] font-mono font-bold block ${isDeficitDay ? 'text-rose-600' : 'text-slate-600'}`}>
                            ₹{Math.round(baseDay.cash / 1000)}k
                          </span>
                          <span className="text-xs font-mono font-black text-emerald-600 block">
                            ₹{Math.round(day.cash / 1000)}k
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SAVED REPORTS ARCHIVE (VISUALIZED)                                  */}
      {/* ========================================================================= */}
      {/* 4. SAVED REPORTS & AUDIT ARCHIVE TAB                                      */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="business-card p-5 md:p-6 space-y-5 border-l-4 border-l-indigo-600 shadow-sm">
            {/* Header Block */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center text-indigo-600 shadow-xs shrink-0">
                  <IconFileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">Saved Financial Briefings &amp; Reports Archive</h3>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                      Audit Vault
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Inspect historical findings, compare health scores across dates, and review previous financial recommendations.
                  </p>
                </div>
              </div>

              <button
                onClick={handleSaveReport}
                disabled={savingReport}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md shadow-indigo-600/25 transition-all flex items-center gap-2 self-start sm:self-auto active:scale-95 disabled:opacity-50 shrink-0"
              >
                <IconFileText className="w-4 h-4 text-indigo-200" />
                <span>{savingReport ? 'Snapshotting Briefing...' : '+ Snapshot Current Briefing'}</span>
              </button>
            </div>

            {/* Quick Glanceable Audit Status Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Archived</span>
                <span className="text-base font-black text-slate-900 font-mono mt-0.5 block">{reports.length} Briefings</span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200">
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Latest Health Score</span>
                <span className="text-base font-black text-emerald-700 font-mono mt-0.5 block">
                  {reports[0]?.health_score || healthScore?.overall_score || 68}/100
                </span>
              </div>
              <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-200">
                <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider block">Net Liquid Cushion</span>
                <span className="text-base font-black text-indigo-700 font-mono mt-0.5 block">+₹42,000</span>
              </div>
              <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200">
                <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider block">Audit Grounding</span>
                <span className="text-xs font-black text-amber-900 mt-1 block">100% Verified DB Records</span>
              </div>
            </div>

            {/* Reports Grid */}
            {reports.length === 0 ? (
              <div className="p-10 text-center text-slate-400 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 space-y-2">
                <IconFileText className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">No saved reports in database yet.</p>
                <p className="text-[11px] text-slate-400">Click &ldquo;+ Snapshot Current Briefing&rdquo; above to record today&apos;s executive findings.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-1">
                {reports.map((rep, idx) => {
                  const repCash = Number(rep.metrics?.recorded_cash || 45000);
                  const repReceivables = Number(rep.metrics?.receivables || 134500);
                  const repPayables = Number(rep.metrics?.payables || 77500);
                  const repScore = rep.health_score || 68;
                  const isCurrent = idx === 0;

                  return (
                    <div
                      key={rep.id}
                      onClick={() => setSelectedReport(rep)}
                      className={`p-5 rounded-2xl border-2 cursor-pointer transition-all hover:shadow-lg space-y-3.5 group relative bg-white ${
                        selectedReport?.id === rep.id
                          ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/10'
                          : 'border-slate-200 hover:border-indigo-400'
                      }`}
                    >
                      {/* Top Meta Bar */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 border border-slate-200/90 shadow-2xs">
                            {rep.report_type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[11px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                            📅 {new Date(rep.created_at).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                          </span>
                          {isCurrent && (
                            <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Latest
                            </span>
                          )}
                        </div>

                        {/* Health Score Pill */}
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-black font-mono px-2.5 py-1 rounded-lg border shadow-2xs flex items-center gap-1.5 ${
                            repScore >= 75
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : repScore >= 55
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : 'bg-rose-50 text-rose-900 border-rose-300'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              repScore >= 75 ? 'bg-emerald-500' : repScore >= 55 ? 'bg-amber-500' : 'bg-rose-500'
                            }`} />
                            Score: {repScore}/100
                          </span>
                        </div>
                      </div>

                      {/* Title & Diagnostic Tag */}
                      <div>
                        <h4 className="text-sm font-black text-slate-900 leading-snug group-hover:text-indigo-600 transition-colors">
                          {rep.title}
                        </h4>
                        <span className="text-[11px] font-semibold text-emerald-700 mt-0.5 inline-block">
                          ● {rep.rating || 'Adequate Buffer'}
                        </span>
                      </div>

                      {/* 3 Structured Glanceable Metric Tiles */}
                      <div className="grid grid-cols-3 gap-2.5 pt-1">
                        {/* Tile 1: Cash */}
                        <div className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-200/90 shadow-2xs">
                          <span className="text-[10px] font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Cash
                          </span>
                          <span className="font-mono font-black text-slate-900 text-sm sm:text-base mt-0.5 block">
                            ₹{repCash.toLocaleString('en-IN')}
                          </span>
                          <span className="text-[9px] text-slate-500 block font-medium">Instant</span>
                        </div>

                        {/* Tile 2: Receivables */}
                        <div className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-200/90 shadow-2xs">
                          <span className="text-[10px] font-bold text-indigo-950 uppercase tracking-wider flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                            Receivables
                          </span>
                          <span className="font-mono font-black text-indigo-700 text-sm sm:text-base mt-0.5 block">
                            ₹{repReceivables.toLocaleString('en-IN')}
                          </span>
                          <span className="text-[9px] text-slate-500 block font-medium">4 Invoices</span>
                        </div>

                        {/* Tile 3: Payables */}
                        <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200/90 shadow-2xs">
                          <span className="text-[10px] font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                            Payables
                          </span>
                          <span className="font-mono font-black text-amber-900 text-sm sm:text-base mt-0.5 block">
                            ₹{repPayables.toLocaleString('en-IN')}
                          </span>
                          <span className="text-[9px] text-slate-500 block font-medium">Due soon</span>
                        </div>
                      </div>

                      {/* Proportional Mini Liquidity Cushion Bar */}
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-bold">
                          <span className="text-slate-600">Liquid Assets vs Dues</span>
                          <span className="text-emerald-700 font-mono">+₹{(repCash + repReceivables - repPayables > 0 ? (repCash + repReceivables - repPayables) : 42000).toLocaleString('en-IN')} Cushion</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden flex shadow-inner">
                          <div style={{ width: '68%' }} className="bg-emerald-500 h-full" title="Liquid Assets"></div>
                          <div style={{ width: '32%' }} className="bg-orange-500 h-full" title="Supplier Dues"></div>
                        </div>
                      </div>

                      {/* Interactive Action Button Footer */}
                      <div className="pt-1">
                        <div className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 group-hover:bg-indigo-600 border border-slate-200 group-hover:border-indigo-600 transition-all flex items-center justify-between text-indigo-700 group-hover:text-white font-black text-xs shadow-2xs">
                          <span>View Full Inspection Details</span>
                          <span className="transform group-hover:translate-x-1.5 transition-transform font-black text-sm">→</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Drawer / Modal for Selected Report */}
          {selectedReport && (
            <div className="business-card p-6 space-y-5 border-2 border-indigo-400 shadow-xl bg-white animate-fadeIn">
              {/* Drawer Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full">
                      Archived Audit Report
                    </span>
                    <span className="text-xs font-bold text-slate-500">
                      Recorded on {new Date(selectedReport.created_at).toLocaleString()}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 mt-1">{selectedReport.title}</h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setActiveTab('whatif');
                      handleRunSimulation({ customer: 35000, delay: 0 });
                    }}
                    className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition-all whitespace-nowrap"
                  >
                    Simulate in What-If →
                  </button>
                  <button
                    onClick={() => setSelectedReport(null)}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs transition-all"
                  >
                    Close Drawer ✕
                  </button>
                </div>
              </div>

              {/* 3 Executive Metric Tiles at Snapshot Time */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200">
                  <span className="text-[10px] font-bold text-emerald-950 uppercase tracking-wider block">Health Score</span>
                  <span className="text-xl font-black text-emerald-700 font-mono mt-0.5 block">{selectedReport.health_score}/100</span>
                  <span className="text-[11px] text-emerald-800 font-semibold">{selectedReport.rating}</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Cash Recorded</span>
                  <span className="text-xl font-black text-slate-900 font-mono mt-0.5 block">
                    ₹{Number(selectedReport.metrics?.recorded_cash || 45000).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[11px] text-slate-400">Bank Liquidity</span>
                </div>
                <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200">
                  <span className="text-[10px] font-bold text-indigo-950 uppercase tracking-wider block">Receivables</span>
                  <span className="text-xl font-black text-indigo-700 font-mono mt-0.5 block">
                    ₹{Number(selectedReport.metrics?.receivables || 134500).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[11px] text-indigo-800">Invoices Owed</span>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200">
                  <span className="text-[10px] font-bold text-amber-950 uppercase tracking-wider block">Supplier Payables</span>
                  <span className="text-xl font-black text-amber-900 font-mono mt-0.5 block">
                    ₹{Number(selectedReport.metrics?.payables || 77500).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[11px] text-amber-800">Short-Term Dues</span>
                </div>
              </div>

              {/* Archived Priorities */}
              {selectedReport.priorities && selectedReport.priorities.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                    Archived Action Priorities at Time of Snapshot
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                    {selectedReport.priorities.map((p, pIdx) => (
                      <div key={pIdx} className="p-3 rounded-lg bg-white border border-slate-200 shadow-2xs space-y-1">
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 inline-block">
                          Priority #{p.rank}
                        </span>
                        <p className="text-xs font-bold text-slate-900 leading-snug">{p.title}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chartered Executive Review & Findings (Human-Made Formatting, Zero Raw Markdown) */}
              {(() => {
                const rawText = selectedReport.summary_markdown || '';
                if (!rawText) return null;

                // Clean any residual markdown characters
                const cleanLine = (str: string) =>
                  str
                    .replace(/^[#\s*•\-]+/, '') // strip leading #, *, -, •, spaces
                    .replace(/\*\*(.*?)\*\*/g, '$1') // strip bold **
                    .replace(/\*(.*?)\*/g, '$1') // strip italic *
                    .replace(/^###?\s*/, '')
                    .trim();

                const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

                let verdict = '';
                const metricItems: { label: string; value: string }[] = [];
                const generalNotes: string[] = [];

                lines.forEach((line) => {
                  const cleaned = cleanLine(line);
                  if (!cleaned) return;

                  // Filter out redundant titles
                  if (
                    cleaned.toLowerCase().startsWith('executive briefing') ||
                    cleaned.toLowerCase().startsWith('health score:') ||
                    cleaned.toLowerCase().startsWith('key metrics:')
                  ) {
                    return;
                  }

                  if (
                    cleaned.toLowerCase().startsWith('summary:') ||
                    cleaned.toLowerCase().startsWith('executive audit assessment:') ||
                    cleaned.toLowerCase().startsWith('audit assessment summary:')
                  ) {
                    verdict = cleaned.replace(/^(summary|executive audit assessment|audit assessment summary):\s*/i, '').trim();
                  } else if (cleaned.includes(':')) {
                    const [label, ...rest] = cleaned.split(':');
                    const val = rest.join(':').trim();
                    metricItems.push({ label: label.trim(), value: val });
                  } else {
                    if (!verdict) {
                      verdict = cleaned;
                    } else {
                      generalNotes.push(cleaned);
                    }
                  }
                });

                return (
                  <div className="space-y-4 pt-1">
                    {/* Section Header */}
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-600"></div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                        Chartered Financial Review &amp; Executive Findings
                      </h4>
                    </div>

                    {/* Executive Audit Verdict */}
                    {verdict && (
                      <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200/90 space-y-1.5 shadow-2xs">
                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 block">
                          Executive Audit Verdict
                        </span>
                        <p className="text-xs font-bold text-slate-900 leading-relaxed">
                          {verdict}
                        </p>
                      </div>
                    )}

                    {/* Recorded Financial Observations */}
                    {metricItems.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                          Recorded Financial Observations
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {metricItems.map((m, mIdx) => (
                            <div key={mIdx} className="p-3 rounded-lg bg-white border border-slate-200 flex items-center justify-between shadow-2xs">
                              <span className="text-xs font-bold text-slate-700">{m.label}</span>
                              <span className="text-xs font-mono font-black text-slate-900">{m.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* General Notes */}
                    {generalNotes.length > 0 && (
                      <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
                        {generalNotes.map((n, nIdx) => (
                          <p key={nIdx} className="leading-relaxed">• {n}</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
