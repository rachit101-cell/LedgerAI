'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Business, Document, Transaction } from '../types';
import { IconShieldCheck, IconPayPal } from './Icons';

interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  pendingApprovalsCount: number;
  onRefresh?: () => void;
  onOpenPendingApproval?: () => void;
  business?: Business | null;
  documents?: Document[];
  transactions?: Transaction[];
  onSearchInvoices?: (query: string) => void;
  onSelectDocument?: (doc: Document) => void;
  onSelectTransaction?: (tx: Transaction) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  pendingApprovalsCount,
  onRefresh,
  onOpenPendingApproval,
  business,
  documents = [],
  transactions = [],
  onSearchInvoices,
  onSelectDocument,
  onSelectTransaction,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Esc
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Filter matching records live
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { docs: [], txs: [] };

    const matchingDocs = documents.filter((doc) => {
      const numMatch = doc.document_number?.toLowerCase().includes(q);
      const contactMatch = doc.contact_name?.toLowerCase().includes(q);
      const notesMatch = doc.notes?.toLowerCase().includes(q);
      const statusMatch = doc.status?.toLowerCase().includes(q);
      const typeMatch = doc.document_type?.toLowerCase().includes(q);
      const totalMatch = String(doc.total).includes(q);
      return numMatch || contactMatch || notesMatch || statusMatch || typeMatch || totalMatch;
    });

    const matchingTxs = transactions.filter((tx) => {
      const descMatch = tx.description?.toLowerCase().includes(q);
      const refMatch = tx.reference?.toLowerCase().includes(q);
      const contactMatch = tx.contact_name?.toLowerCase().includes(q);
      const typeMatch = tx.transaction_type?.toLowerCase().includes(q);
      const amountMatch = String(tx.amount).includes(q);
      return descMatch || refMatch || contactMatch || typeMatch || amountMatch;
    });

    return {
      docs: matchingDocs.slice(0, 4),
      totalDocs: matchingDocs.length,
      txs: matchingTxs.slice(0, 3),
      totalTxs: matchingTxs.length,
    };
  }, [searchQuery, documents, transactions]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setIsDropdownOpen(false);
    if (onSearchInvoices) {
      onSearchInvoices(q);
    } else {
      setActiveTab('invoices');
    }
  };

  const handleSelectDoc = (doc: Document) => {
    setIsDropdownOpen(false);
    if (onSelectDocument) {
      onSelectDocument(doc);
    } else if (onSearchInvoices) {
      onSearchInvoices(doc.document_number);
    } else {
      setActiveTab('invoices');
    }
  };

  const handleSelectTx = (tx: Transaction) => {
    setIsDropdownOpen(false);
    if (onSelectTransaction) {
      onSelectTransaction(tx);
    } else {
      setActiveTab('activity');
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Left Title - Clean & Dynamic */}
          <div className="flex items-center gap-3 shrink-0">
            <h1 className="text-base font-bold text-slate-900 tracking-tight">
              {business?.name || 'Apex Enterprises'}
            </h1>
          </div>

          {/* Center Search Input with Instant Dropdown */}
          <div ref={searchContainerRef} className="flex-1 max-w-lg relative">
            <form onSubmit={handleSearchSubmit} className="relative">
              <input
                type="text"
                value={searchQuery}
                onFocus={() => {
                  if (searchQuery.trim()) setIsDropdownOpen(true);
                }}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsDropdownOpen(true);
                }}
                placeholder="Search invoices, supplier bills, payment records..."
                className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/15 transition-all"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>

              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setIsDropdownOpen(false);
                    if (onSearchInvoices) onSearchInvoices('');
                  }}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs p-0.5 rounded"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </form>

            {/* Interactive Live Search Dropdown */}
            {isDropdownOpen && searchQuery.trim() && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 text-xs animate-fade-in max-h-96 overflow-y-auto">
                {searchResults.docs.length === 0 && searchResults.txs.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">
                    <p className="font-semibold text-slate-600">No records found</p>
                    <p className="text-[11px] mt-0.5 text-slate-400">No invoices, bills, or transactions match &quot;{searchQuery}&quot;</p>
                  </div>
                ) : (
                  <div>
                    {/* Invoices & Bills Section */}
                    {searchResults.docs.length > 0 && (
                      <div className="p-2 border-b border-slate-100">
                        <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Invoices &amp; Supplier Bills ({searchResults.totalDocs})
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {searchResults.docs.map((doc) => (
                            <button
                              key={doc.id}
                              onClick={() => handleSelectDoc(doc)}
                              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-indigo-50/70 flex items-center justify-between transition-colors group"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                                      doc.document_type === 'invoice'
                                        ? 'bg-indigo-100 text-indigo-700'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {doc.document_type === 'invoice' ? 'INV' : 'BILL'}
                                  </span>
                                  <span className="font-bold text-slate-800 group-hover:text-indigo-600 truncate">
                                    {doc.document_number}
                                  </span>
                                  <span className="text-slate-400">•</span>
                                  <span className="text-slate-600 truncate">{doc.contact_name}</span>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  Due: {new Date(doc.due_date).toLocaleDateString('en-IN')}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-mono font-bold text-slate-900">
                                  ₹{Number(doc.total).toLocaleString('en-IN')}
                                </div>
                                <span
                                  className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded-full inline-block mt-0.5 ${
                                    doc.status === 'paid'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : doc.status === 'overdue'
                                      ? 'bg-rose-50 text-rose-700'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {doc.status}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ledger Transactions Section */}
                    {searchResults.txs.length > 0 && (
                      <div className="p-2 border-b border-slate-100">
                        <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Bank &amp; Cash Ledger ({searchResults.totalTxs})
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {searchResults.txs.map((tx) => (
                            <button
                              key={tx.id}
                              onClick={() => handleSelectTx(tx)}
                              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-50 flex items-center justify-between transition-colors group"
                            >
                              <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${
                                      tx.transaction_type === 'inflow'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {tx.transaction_type}
                                  </span>
                                  <span className="font-semibold text-slate-800 group-hover:text-indigo-600 truncate">
                                    {tx.description || tx.reference || 'Transaction'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {new Date(tx.transaction_date).toLocaleDateString('en-IN')} • {tx.payment_method}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div
                                  className={`font-mono font-bold ${
                                    tx.transaction_type === 'inflow' ? 'text-emerald-700' : 'text-slate-800'
                                  }`}
                                >
                                  {tx.transaction_type === 'inflow' ? '+' : '-'}₹{Number(tx.amount).toLocaleString('en-IN')}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Footer Submit Action */}
                    <div className="p-2 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Press <kbd className="px-1 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-mono">↵ Enter</kbd> to open Invoices</span>
                      <button
                        onClick={handleSearchSubmit}
                        className="font-bold text-indigo-600 hover:text-indigo-800"
                      >
                        View all in Invoices &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Status Indicators & Refresh */}
          <div className="flex items-center gap-2.5 shrink-0">
            {pendingApprovalsCount > 0 && onOpenPendingApproval && (
              <button
                onClick={onOpenPendingApproval}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold transition-all shadow-xs animate-pulse"
                title="Review and authorize AI-prepared payment action"
              >
                <span>⚡ {pendingApprovalsCount} Action to Authorize</span>
              </button>
            )}

            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
              <IconShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Verified Ledger</span>
            </div>

            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[#0070ba] text-xs font-semibold">
              <IconPayPal className="w-3.5 h-3.5 text-[#0070ba]" />
              <span className="hidden sm:inline">PayPal Sandbox</span>
            </div>

            {onRefresh && (
              <button
                onClick={onRefresh}
                title="Refresh balances & records from backend"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all shadow-sm active:scale-95"
              >
                <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="hidden sm:inline">Sync Data</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
