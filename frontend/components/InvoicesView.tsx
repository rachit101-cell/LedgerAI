'use client';

import React, { useState, useMemo } from 'react';
import { Document } from '../types';
import { IconPayPal, IconShieldCheck, IconAlertTriangle, IconFileText, IconCheckCircle, IconWallet } from './Icons';

interface InvoicesViewProps {
  documents: Document[];
  availableCash?: number;
  initialSearchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onInitiatePayPal: (document: Document) => void;
  onReconcilePayPal: (documentId: string) => void;
  onRefresh: () => void;
  onSimulateExtension?: (docId?: string) => void;
  onOpenRecordTransaction?: (docId?: string) => void;
  onOpenRecordOrder?: () => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  documents,
  availableCash,
  initialSearchQuery,
  onSearchQueryChange,
  onInitiatePayPal,
  onReconcilePayPal,
  onRefresh,
  onSimulateExtension,
  onOpenRecordTransaction,
  onOpenRecordOrder,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'invoice' | 'bill'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'issued' | 'partially_paid' | 'paid'>('all');
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery || '');
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  // Sync external search query if provided
  React.useEffect(() => {
    if (initialSearchQuery !== undefined) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  // Financial calculations from live verified documents
  const invoices = useMemo(() => documents.filter((d) => d.document_type === 'invoice'), [documents]);
  const bills = useMemo(() => documents.filter((d) => d.document_type === 'bill'), [documents]);

  const totalReceivablesOutstanding = invoices.reduce((sum, d) => sum + Number(d.outstanding_amount || 0), 0);
  const totalReceivablesPaid = invoices.reduce((sum, d) => sum + Number(d.paid_amount || 0), 0);
  const totalReceivablesInvoiced = invoices.reduce((sum, d) => sum + Number(d.total || 0), 0);

  const overdueReceivables = invoices
    .filter((d) => d.status === 'overdue')
    .reduce((sum, d) => sum + Number(d.outstanding_amount || 0), 0);
  const pendingReceivables = totalReceivablesOutstanding - overdueReceivables;

  const totalPayablesOutstanding = bills.reduce((sum, d) => sum + Number(d.outstanding_amount || 0), 0);
  const totalPayablesPaid = bills.reduce((sum, d) => sum + Number(d.paid_amount || 0), 0);
  const totalPayablesBilled = bills.reduce((sum, d) => sum + Number(d.total || 0), 0);

  const netWorkingCapitalBalance = totalReceivablesOutstanding - totalPayablesOutstanding;
  const collectionRate = Math.round((totalReceivablesPaid / (totalReceivablesInvoiced || 1)) * 100);

  // Filtered list
  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      // Type filter
      if (filterType !== 'all' && doc.document_type !== filterType) return false;

      // Status filter
      if (statusFilter !== 'all' && doc.status !== statusFilter) return false;

      // Search query filter (matches document number, party name, notes, or item description)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesDocNumber = doc.document_number?.toLowerCase().includes(q);
        const matchesContact = doc.contact_name?.toLowerCase().includes(q);
        const matchesNotes = doc.notes?.toLowerCase().includes(q);
        const matchesItems = doc.items?.some((i) => i.description?.toLowerCase().includes(q));
        if (!matchesDocNumber && !matchesContact && !matchesNotes && !matchesItems) return false;
      }

      return true;
    });
  }, [documents, filterType, statusFilter, searchQuery]);

  const countByType = {
    all: documents.length,
    invoice: invoices.length,
    bill: bills.length,
  };

  const countByStatus = {
    all: documents.length,
    overdue: documents.filter((d) => d.status === 'overdue').length,
    issued: documents.filter((d) => d.status === 'issued').length,
    paid: documents.filter((d) => d.status === 'paid').length,
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <IconCheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Paid &amp; Settled
          </span>
        );
      case 'partially_paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            Partially Paid
          </span>
        );
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-300">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            <IconAlertTriangle className="w-3.5 h-3.5 text-rose-600" /> Overdue
          </span>
        );
      case 'issued':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
            Awaiting Payment
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200 capitalize">
            {status}
          </span>
        );
    }
  };

  const getDueDateDisplay = (doc: Document) => {
    if (doc.status === 'paid') {
      return (
        <span className="text-slate-500 font-mono text-xs">
          Settled ({new Date(doc.due_date).toLocaleDateString('en-IN')})
        </span>
      );
    }

    const dueDate = new Date(doc.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDate.setHours(0, 0, 0, 0);
    const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <div className="space-y-0.5">
          <span className="font-mono text-xs font-bold text-rose-600">
            {new Date(doc.due_date).toLocaleDateString('en-IN')}
          </span>
          <span className="text-[10px] block text-rose-600 font-bold uppercase">
            Overdue by {Math.abs(diffDays)}d
          </span>
        </div>
      );
    } else if (diffDays === 0) {
      return (
        <div className="space-y-0.5">
          <span className="font-mono text-xs font-bold text-amber-600">
            {new Date(doc.due_date).toLocaleDateString('en-IN')}
          </span>
          <span className="text-[10px] block text-amber-600 font-bold uppercase">Due Today</span>
        </div>
      );
    } else {
      return (
        <div className="space-y-0.5">
          <span className="font-mono text-xs font-medium text-slate-700">
            {new Date(doc.due_date).toLocaleDateString('en-IN')}
          </span>
          <span className="text-[10px] block text-slate-400 font-medium">Due in {diffDays}d</span>
        </div>
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Primary Management Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Receivables &amp; Payables Ledger</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time fulfillment tracking for customer sales invoices (Money In) and supplier stock obligations (Money Out).
          </p>
        </div>

        {/* Primary Merchant Creation Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {onOpenRecordOrder && (
            <button
              onClick={onOpenRecordOrder}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 active:scale-95 whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M12 4v16m8-8H4" />
              </svg>
              <span>+ Record Customer Order</span>
            </button>
          )}

          {onOpenRecordTransaction && (
            <button
              onClick={() => onOpenRecordTransaction()}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-bold text-xs shadow-xs transition-all flex items-center gap-1.5 active:scale-95 whitespace-nowrap"
            >
              <IconWallet className="w-4 h-4 text-emerald-600" />
              <span>+ Record Payment</span>
            </button>
          )}

          <button
            onClick={onRefresh}
            className="p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-600 hover:text-slate-900 shadow-xs transition-all"
            title="Refresh Ledger Data"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* 2. Executive 4-Metric Financial Summary Deck */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Customer Receivables (Money In) */}
        <div className="business-card p-4 flex flex-col justify-between border-l-4 border-l-indigo-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Customer Receivables</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
              <IconFileText className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black font-mono text-indigo-700">
              ₹{totalReceivablesOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Across {invoices.length} sales invoices (₹{totalReceivablesInvoiced.toLocaleString('en-IN')} total billed)
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-rose-700 font-bold">
              {overdueReceivables > 0 ? `₹${overdueReceivables.toLocaleString('en-IN')} Overdue` : 'Zero Overdue'}
            </span>
            <span className="text-slate-500 font-medium">₹{pendingReceivables.toLocaleString('en-IN')} Current</span>
          </div>
        </div>

        {/* Metric 2: Supplier Payables (Money Out) */}
        <div className="business-card p-4 flex flex-col justify-between border-l-4 border-l-orange-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Supplier Obligations</span>
            <div className="p-1.5 rounded-lg bg-orange-50 text-orange-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black font-mono text-orange-700">
              ₹{totalPayablesOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Across {bills.length} supplier stock bills &amp; warehouse dues
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Paid: ₹{totalPayablesPaid.toLocaleString('en-IN')}</span>
            <span className="text-amber-700 font-bold">Due Oct 15 – 19</span>
          </div>
        </div>

        {/* Metric 3: Net Working Capital Gap */}
        <div className="business-card p-4 flex flex-col justify-between border-l-4 border-l-emerald-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Net Working Capital Balance</span>
            <div className={`p-1.5 rounded-lg ${netWorkingCapitalBalance >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              <IconShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className={`text-2xl font-black font-mono ${netWorkingCapitalBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {netWorkingCapitalBalance >= 0 ? '+' : '-'}₹{Math.abs(netWorkingCapitalBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {netWorkingCapitalBalance >= 0 ? 'Customer receivables exceed supplier dues' : 'Supplier obligations exceed receivables'}
            </p>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Coverage Ratio:</span>
            <span className="font-mono font-bold text-slate-800">
              {Math.round((totalReceivablesOutstanding / (totalPayablesOutstanding || 1)) * 100)}%
            </span>
          </div>
        </div>

        {/* Metric 4: Collections Realization Rate */}
        <div className="business-card p-4 flex flex-col justify-between border-l-4 border-l-blue-600">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Collections Realized</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <IconCheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2">
            <div className="text-2xl font-black font-mono text-slate-900">
              {collectionRate}%
            </div>
            {/* Visual Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex mt-2">
              <div style={{ width: `${collectionRate}%` }} className="bg-emerald-500 h-full transition-all"></div>
              <div style={{ width: `${100 - collectionRate}%` }} className="bg-amber-400 h-full transition-all"></div>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Collected:</span>
            <span className="font-mono font-bold text-emerald-700">₹{totalReceivablesPaid.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* 3. Search & Multi-Filter Control Strip */}
      <div className="business-card p-3.5 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Document Type Tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold border border-slate-200 shrink-0">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                filterType === 'all'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Records ({countByType.all})
            </button>
            <button
              onClick={() => setFilterType('invoice')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                filterType === 'invoice'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
              Receivables ({countByType.invoice})
            </button>
            <button
              onClick={() => setFilterType('bill')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                filterType === 'bill'
                  ? 'bg-white text-orange-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              Payables ({countByType.bill})
            </button>
          </div>

          {/* Search Input Bar */}
          <div className="relative flex-1 max-w-md">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (onSearchQueryChange) onSearchQueryChange(e.target.value);
              }}
              placeholder="Search by invoice #, customer, supplier, or items..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  if (onSearchQueryChange) onSearchQueryChange('');
                }}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100 text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Status:</span>

          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Statuses ({countByStatus.all})
          </button>

          <button
            onClick={() => setStatusFilter('overdue')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              statusFilter === 'overdue'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
            Overdue ({countByStatus.overdue})
          </button>

          <button
            onClick={() => setStatusFilter('issued')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              statusFilter === 'issued'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            Awaiting Payment ({countByStatus.issued})
          </button>

          <button
            onClick={() => setStatusFilter('paid')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              statusFilter === 'paid'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Paid &amp; Settled ({countByStatus.paid})
          </button>

          {(statusFilter !== 'all' || filterType !== 'all' || searchQuery) && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setFilterType('all');
                setSearchQuery('');
              }}
              className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* 4. The Master Ledger Table */}
      <div className="business-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold text-[10px]">
              <tr>
                <th className="py-3.5 px-4">Document / Type</th>
                <th className="py-3.5 px-4">Party</th>
                <th className="py-3.5 px-4">Due Date &amp; Status</th>
                <th className="py-3.5 px-4 text-right">Total Amount</th>
                <th className="py-3.5 px-4 text-right">Balance Due</th>
                <th className="py-3.5 px-4">Payment Status</th>
                <th className="py-3.5 px-4 text-left">Business Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredDocs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <div className="max-w-sm mx-auto space-y-2">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                        <IconFileText className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-bold text-slate-700">No matching records found</p>
                      <p className="text-xs text-slate-400">
                        Try adjusting your search query or reset the filter criteria.
                      </p>
                      <button
                        onClick={() => {
                          setStatusFilter('all');
                          setFilterType('all');
                          setSearchQuery('');
                        }}
                        className="mt-2 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all"
                      >
                        Reset All Filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDocs.map((doc) => {
                  const isInvoice = doc.document_type === 'invoice';
                  const isExpanded = expandedDocId === doc.id;
                  const hasBalance = Number(doc.outstanding_amount || 0) > 0;

                  return (
                    <React.Fragment key={doc.id}>
                      <tr className={`hover:bg-slate-50/80 transition-colors ${isExpanded ? 'bg-indigo-50/20' : ''}`}>
                        {/* Column 1: Document Number & Type Tag */}
                        <td className="py-3.5 px-4 font-mono">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                              className="p-1 rounded-md hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 transition-all"
                              title={isExpanded ? 'Hide invoice items' : 'View invoice items & notes'}
                            >
                              <svg
                                className={`w-3.5 h-3.5 transform transition-transform ${isExpanded ? 'rotate-90 text-indigo-600' : ''}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                            <div>
                              <span className="font-bold text-slate-900 block text-xs">
                                {doc.document_number}
                              </span>
                              <span
                                className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  isInvoice
                                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                    : 'bg-orange-100 text-orange-800 border border-orange-200'
                                }`}
                              >
                                {isInvoice ? 'Sales Invoice' : 'Supplier Bill'}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Column 2: Counterparty */}
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-900 block text-xs">
                            {doc.contact_name || 'N/A'}
                          </span>
                          <span className="text-[10px] text-slate-400 block font-medium">
                            {isInvoice ? 'Buyer (Customer)' : 'Distributor (Supplier)'}
                          </span>
                        </td>

                        {/* Column 3: Due Date & Aging */}
                        <td className="py-3.5 px-4">
                          {getDueDateDisplay(doc)}
                        </td>

                        {/* Column 4: Total Amount */}
                        <td className="py-3.5 px-4 text-right font-mono font-medium text-slate-700 text-xs">
                          ₹{Number(doc.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>

                        {/* Column 5: Balance Due */}
                        <td className="py-3.5 px-4 text-right font-mono text-xs">
                          {hasBalance ? (
                            <span className="font-black text-slate-900">
                              ₹{Number(doc.outstanding_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="font-bold text-emerald-700">₹0.00</span>
                          )}
                        </td>

                        {/* Column 6: Status Badge */}
                        <td className="py-3.5 px-4">
                          {getStatusBadge(doc.status)}
                        </td>

                        {/* Column 7: Relevant Business Actions */}
                        <td className="py-3.5 px-4 text-left">
                          <div className="flex items-center justify-start gap-2">
                            {/* Actions for Customer Invoice (Money In) - Bridge Cash Offer applies to Receivables */}
                            {isInvoice && hasBalance && (
                              <>
                                <button
                                  onClick={() => onInitiatePayPal(doc)}
                                  title="Dispatch online payment link or collect via PayPal sandbox"
                                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 shadow-xs transition-all text-xs whitespace-nowrap active:scale-95"
                                >
                                  <IconPayPal className="w-3.5 h-3.5 text-blue-200" />
                                  <span>Collect via Link</span>
                                </button>

                                {onSimulateExtension && (
                                  <button
                                    onClick={() => onSimulateExtension(doc.id)}
                                    title="Offer prompt cash discount to customer to accelerate inflow"
                                    className="px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-all shadow-2xs whitespace-nowrap active:scale-95"
                                  >
                                    Bridge Gap &rarr;
                                  </button>
                                )}

                                {onOpenRecordTransaction && (
                                  <button
                                    onClick={() => onOpenRecordTransaction(doc.id)}
                                    title="Record payment received directly (Cash, UPI, or Bank Transfer)"
                                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold transition-all shadow-2xs whitespace-nowrap active:scale-95"
                                  >
                                    Record Receipt
                                  </button>
                                )}
                              </>
                            )}

                            {/* Actions for Supplier Bill (Money Out) - Businessman pays suppliers 100% in full */}
                            {!isInvoice && hasBalance && (
                              <div className="flex items-center gap-2">
                                {onOpenRecordTransaction && (
                                  <button
                                    onClick={() => onOpenRecordTransaction(doc.id)}
                                    title="Record payout made to supplier for stock"
                                    className="px-3.5 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs transition-all shadow-xs whitespace-nowrap active:scale-95 flex items-center gap-1.5"
                                  >
                                    <IconWallet className="w-3.5 h-3.5 text-orange-200" />
                                    <span>Pay Supplier</span>
                                  </button>
                                )}
                                {availableCash !== undefined && Number(doc.outstanding_amount) > availableCash && (
                                  <span
                                    title={`Bank balance (₹${availableCash.toLocaleString('en-IN')}) is less than bill amount. Bridge cash gap via receivables!`}
                                    className="px-2 py-1 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold font-mono whitespace-nowrap"
                                  >
                                    Deficit: -₹{(Number(doc.outstanding_amount) - availableCash).toLocaleString('en-IN')}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* State for Fully Settled Documents */}
                            {!hasBalance && (
                              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-bold">
                                <IconShieldCheck className="w-4 h-4 text-emerald-600" />
                                Settled in Ledger
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Line Items & Notes Tray */}
                      {isExpanded && (
                        <tr className="bg-slate-50/70 border-b border-slate-200">
                          <td colSpan={7} className="p-4">
                            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-2xs">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                <span className="text-xs font-bold text-slate-800">
                                  Items Breakdown &bull; {doc.document_number}
                                </span>
                                <span className="text-[11px] text-slate-500 font-mono">
                                  Issued: {new Date(doc.issue_date).toLocaleDateString('en-IN')}
                                </span>
                              </div>

                              {/* Items Table */}
                              {doc.items && doc.items.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="text-slate-400 font-semibold border-b border-slate-100 text-[10px] uppercase">
                                        <th className="pb-1.5">Description</th>
                                        <th className="pb-1.5 text-center">Qty</th>
                                        <th className="pb-1.5 text-right">Unit Price</th>
                                        <th className="pb-1.5 text-right">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {doc.items.map((item, i) => (
                                        <tr key={i} className="text-slate-700">
                                          <td className="py-1.5 font-medium">{item.description}</td>
                                          <td className="py-1.5 text-center font-mono">{item.quantity}</td>
                                          <td className="py-1.5 text-right font-mono">
                                            ₹{Number(item.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                          </td>
                                          <td className="py-1.5 text-right font-mono font-bold text-slate-900">
                                            ₹{Number(item.line_total || (item.quantity * item.unit_price)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400 italic">No specific line items recorded for this document.</p>
                              )}

                              {/* Notes */}
                              {doc.notes && (
                                <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-600 flex items-start gap-1.5">
                                  <span className="font-bold text-slate-700 shrink-0">Notes:</span>
                                  <span>{doc.notes}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
