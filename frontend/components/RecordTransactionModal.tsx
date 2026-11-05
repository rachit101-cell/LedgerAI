'use client';

import React, { useState } from 'react';
import { Document } from '../types';
import { api } from '../lib/api';
import { IconShieldCheck, IconAlertTriangle, IconCheckCircle, IconWallet } from './Icons';

interface RecordTransactionModalProps {
  documents: Document[];
  preselectedDocId?: string | null;
  availableCash?: number;
  onClose: () => void;
  onTransactionRecorded: () => void;
  onNavigateToDecisions?: () => void;
  currency?: string;
}

export const RecordTransactionModal: React.FC<RecordTransactionModalProps> = ({
  documents,
  preselectedDocId,
  availableCash,
  onClose,
  onTransactionRecorded,
  onNavigateToDecisions,
  currency = 'INR',
}) => {
  const [selectedDocId, setSelectedDocId] = useState<string>(preselectedDocId || '');
  const [amount, setAmount] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('bank_transfer');
  const [reference, setReference] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDoc = documents.find((d) => d.id === selectedDocId);
  const isSupplierBill = selectedDoc?.document_type === 'bill';
  const numAmount = parseFloat(amount) || 0;
  const isInsufficientCash = isSupplierBill && availableCash !== undefined && numAmount > availableCash;
  const cashShortfall = isInsufficientCash && availableCash !== undefined ? numAmount - availableCash : 0;

  // Set default amount when a document is selected
  React.useEffect(() => {
    if (selectedDoc) {
      setAmount(String(selectedDoc.outstanding_amount));
      setDescription(
        selectedDoc.document_type === 'invoice'
          ? `Settlement collection for ${selectedDoc.document_number} from ${selectedDoc.contact_name || 'Customer'}`
          : `Procurement payment for ${selectedDoc.document_number} to ${selectedDoc.contact_name || 'Supplier'}`
      );
    }
  }, [selectedDocId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      setError('Please enter a valid payment amount greater than zero.');
      return;
    }

    if (selectedDoc && val > Number(selectedDoc.outstanding_amount)) {
      setError(`Amount cannot exceed the document's outstanding balance of ₹${selectedDoc.outstanding_amount.toLocaleString('en-IN')}`);
      return;
    }

    if (isSupplierBill && availableCash !== undefined && val > availableCash) {
      setError(
        `Insufficient bank balance: Available cash is ₹${availableCash.toLocaleString('en-IN')}, which is not enough to pay ₹${val.toLocaleString('en-IN')} to ${selectedDoc?.contact_name || 'supplier'}. Bridge the cash deficit first by collecting customer receivables!`
      );
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.recordPayment({
        document_id: selectedDocId || undefined,
        contact_id: selectedDoc?.contact_id || undefined,
        amount: val,
        payment_method: paymentMethod,
        reference: reference.trim() || undefined,
        description: description.trim() || undefined,
      });

      onTransactionRecorded();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record transaction in database.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="business-card max-w-lg w-full bg-white p-6 space-y-5 rounded-2xl shadow-2xl relative text-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200">
              <IconWallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Record Real Business Transaction</h3>
              <p className="text-xs text-slate-500">Persists an authenticated ledger entry & updates cash balance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-sm p-1 rounded-lg"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <IconAlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Businessman Liquidity Check for Supplier Bills */}
        {isSupplierBill && (
          <div className={`p-4 rounded-xl border text-xs ${isInsufficientCash ? 'bg-rose-50 border-rose-200 text-rose-950' : 'bg-emerald-50 border-emerald-200 text-emerald-950'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold flex items-center gap-1.5 text-xs">
                <IconShieldCheck className={`w-4 h-4 ${isInsufficientCash ? 'text-rose-600' : 'text-emerald-600'}`} />
                Bank Liquidity Verification
              </span>
              <span className="font-mono font-bold text-[11px] px-2.5 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-800 shadow-2xs">
                Available Cash: ₹{(availableCash ?? 0).toLocaleString('en-IN')}
              </span>
            </div>

            {isInsufficientCash ? (
              <div className="space-y-2.5">
                <p className="leading-relaxed text-slate-800">
                  <span className="font-bold text-rose-700">Outflow Exceeds Bank Cash:</span> You have{' '}
                  <strong className="font-mono font-bold">₹{(availableCash ?? 0).toLocaleString('en-IN')}</strong> recorded in bank cash, but paying{' '}
                  <strong className="font-mono font-bold">₹{numAmount.toLocaleString('en-IN')}</strong> will cause a cash deficit of{' '}
                  <strong className="font-mono font-bold text-rose-600">-₹{cashShortfall.toLocaleString('en-IN')}</strong>.
                </p>
                <div className="p-2.5 bg-white/90 rounded-lg border border-rose-200 text-[11px] text-slate-700 leading-snug">
                  💡 <strong>Businessman's Prudent Policy:</strong> Suppliers must be paid 100% in full without bouncing payments. Accelerate customer receivables first by offering a prompt-payment discount to bridge the gap!
                </div>
                {onNavigateToDecisions && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onNavigateToDecisions();
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-98 text-xs"
                  >
                    <span>⚡ Open Cash Bridge Solutions to Collect Receivables &rarr;</span>
                  </button>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-emerald-800 font-medium">
                ✓ Verified bank balance available (₹{(availableCash ?? 0).toLocaleString('en-IN')}) to pay this supplier bill in full.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Target Document Selector */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Link to Invoice / Supplier Bill (Optional):
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              <option value="">General Cash Movement (No linked document)</option>
              {documents
                .filter((d) => d.outstanding_amount > 0)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.document_number} — {d.contact_name || 'Contact'} ({d.document_type === 'invoice' ? 'Customer Invoice' : 'Supplier Bill'}) • Due: ₹{Number(d.outstanding_amount).toLocaleString('en-IN')}
                  </option>
                ))}
            </select>
          </div>

          {/* Amount and Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Transaction Amount ({currency}):
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 15000"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-mono font-bold text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Payment Method:
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="bank_transfer">Bank Transfer / NEFT / RTGS</option>
                <option value="upi">UPI (Instant Remittance)</option>
                <option value="cash">Direct Cash</option>
                <option value="paypal">PayPal Sandbox</option>
              </select>
            </div>
          </div>

          {/* Reference / UTR Number */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Payment Reference / UTR Number:
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. UTR-20261104-987456 or Receipt #54"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800 text-xs font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Ledger Memo / Notes */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Transaction Memo / Ledger Note:
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Settlement for grain stock delivered to shop"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* Accounting Impact Preview */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-1 font-mono text-slate-600">
            <div className="flex justify-between">
              <span>Ledger Impact:</span>
              <span className="font-bold text-slate-900">
                {selectedDoc?.document_type === 'bill'
                  ? `Cash Outflow (-₹${amount || '0'})`
                  : `Cash Inflow (+₹${amount || '0'})`}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Idempotent Allocation:</span>
              <span className="text-emerald-700 font-semibold">
                {selectedDoc ? `Linked to ${selectedDoc.document_number}` : 'Unallocated General Movement'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || isInsufficientCash}
              className={`px-5 py-2 rounded-xl font-bold flex items-center gap-2 shadow-sm transition-all ${
                isInsufficientCash
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
              }`}
            >
              <IconCheckCircle className="w-4 h-4" />
              <span>
                {saving
                  ? 'Posting to Ledger...'
                  : isInsufficientCash
                  ? `Insufficient Balance (-₹${cashShortfall.toLocaleString('en-IN')})`
                  : 'Post & Commit Transaction'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

