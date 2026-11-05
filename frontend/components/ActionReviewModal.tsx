import React, { useState } from 'react';
import { ActionDraft, ActionDraftPayload } from '../types';
import { api } from '../lib/api';
import { IconPayPal, IconShieldCheck, IconAlertTriangle, IconCheckCircle } from './Icons';

interface ActionReviewModalProps {
  draft: ActionDraft | null;
  onClose: () => void;
  onApproved: (documentId: string) => void;
}

export const ActionReviewModal: React.FC<ActionReviewModalProps> = ({
  draft,
  onClose,
  onApproved,
}) => {
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!draft) return null;

  let payload: ActionDraftPayload;
  try {
    payload = JSON.parse(draft.payload_json);
  } catch (e) {
    return null;
  }

  const handleApprove = async () => {
    setApproving(true);
    setError(null);
    try {
      // If already approved, directly dispatch payment modal
      if (draft.status === 'approved' && draft.document_id) {
        onApproved(draft.document_id);
        return;
      }
      const res = await api.approveActionDraft(draft.id, draft.payload_hash, 'Owner');
      if (res.success && res.document_id) {
        onApproved(res.document_id);
      } else {
        setError(res.message || 'Approval failed');
      }
    } catch (err: any) {
      setError(err.message || 'Error approving action');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    setRejecting(true);
    setError(null);
    try {
      await api.rejectActionDraft(draft.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error rejecting action');
    } finally {
      setRejecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="business-card max-w-xl w-full border-slate-200 bg-white p-6 space-y-5 rounded-2xl shadow-2xl relative text-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
              <IconShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Review & Dispatch Customer Terms</h3>
              <p className="text-xs text-slate-500">Owner Authorization to transmit payment terms to customer</p>
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
            <IconAlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Details Table */}
        <div className="space-y-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200/80">
          <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-200/60">
            <span className="text-slate-500">Sender (Your Business):</span>
            <span className="col-span-2 font-bold text-slate-900">
              Apex Enterprises (Merchant)
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-200/60">
            <span className="text-slate-500">Action Type:</span>
            <span className="col-span-2 font-semibold text-slate-800 capitalize">
              {(draft.action_type || payload.action_type || payload.action || 'Action Draft').replace(/_/g, ' ')}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-200/60">
            <span className="text-slate-500">Recipient Customer:</span>
            <span className="col-span-2 font-bold text-indigo-700">
              {payload.contact_name || 'Customer'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-200/60">
            <span className="text-slate-500">Target Invoice:</span>
            <span className="col-span-2 font-mono text-indigo-700 font-bold">
              {payload.document_number || 'N/A'}
            </span>
          </div>

          {payload.discount_rate !== undefined && payload.discount_rate !== null ? (
            <>
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-200/60">
                <span className="text-slate-500">Original Balance:</span>
                <span className="col-span-2 font-mono text-slate-700">
                  ₹{(payload.original_amount ?? payload.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-200/60">
                <span className="text-slate-500">Discount Offered:</span>
                <span className="col-span-2 font-mono text-amber-700 font-semibold">
                  {(payload.discount_rate * 100).toFixed(1)}% (-₹{(payload.discount_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })})
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-200/60">
                <span className="text-slate-500">Net Expected Cash:</span>
                <span className="col-span-2 font-mono text-emerald-700 font-bold text-sm">
                  ₹{(payload.net_amount ?? payload.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-200/60">
              <span className="text-slate-500">Outstanding Amount:</span>
              <span className="col-span-2 font-mono text-emerald-700 font-bold text-sm">
                ₹{(payload.amount ?? payload.original_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 py-1.5 border-b border-slate-200/60">
            <span className="text-slate-500">Payment Channel:</span>
            <span className="col-span-2 text-[#0070ba] font-semibold flex items-center gap-1.5">
              <IconPayPal className="w-3.5 h-3.5" /> PayPal Developer Sandbox
            </span>
          </div>

          {payload.message ? (
            <div className="py-2 border-b border-slate-200/60">
              <span className="text-slate-500 block mb-1">Reviewed Message Text:</span>
              <div className="p-2.5 rounded-lg bg-white text-slate-700 italic border border-slate-200 text-[11px] leading-relaxed">
                &ldquo;{payload.message.replace(/INR\s*/g, '₹')}&rdquo;
              </div>
            </div>
          ) : (
            <div className="py-2 border-b border-slate-200/60">
              <span className="text-slate-500 block mb-1">Settlement Offer Terms:</span>
              <div className="p-2.5 rounded-lg bg-white text-slate-700 border border-slate-200 text-[11px] leading-relaxed">
                Offer {((payload.discount_rate ?? 0) * 100).toFixed(1)}% early payment reduction on invoice {payload.document_number} for expedited remittance.
              </div>
            </div>
          )}

          <div className="py-1.5">
            <span className="text-slate-500 block mb-1">Expected Financial Effect:</span>
            <span className="text-emerald-700 font-medium text-[11px] block">
              {(payload.expected_financial_effect ? payload.expected_financial_effect.replace(/INR\s*/g, '₹') : null) ||
                (payload.net_amount
                  ? `Recovers net cash of ₹${payload.net_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} at an agreed direct discount of ₹${(payload.discount_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}.`
                  : `Cures projected cash shortfall of ₹${(payload.amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} upon customer settlement.`)}
            </span>
          </div>
        </div>

        {/* Cryptographic Payload Hash */}
        <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-between text-[11px] font-mono text-slate-600">
          <span>Payload SHA-256:</span>
          <span className="text-emerald-700 font-bold truncate max-w-[280px]">
            {draft.payload_hash}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={handleReject}
            disabled={rejecting || approving}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all disabled:opacity-40"
          >
            {rejecting ? 'Rejecting...' : 'Reject Communication'}
          </button>

          <button
            onClick={handleApprove}
            disabled={approving || rejecting}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-40 active:scale-95"
          >
            <IconCheckCircle className="w-4 h-4" />
            <span>
              {approving
                ? 'Authorizing & Dispatching...'
                : draft.status === 'approved'
                ? `Dispatch ${(payload.discount_rate !== undefined && payload.discount_rate !== null ? (payload.discount_rate * 100).toFixed(1) + '%' : '')} Discount Link to ${payload.contact_name || 'Customer'} →`
                : (payload.discount_rate !== undefined && payload.discount_rate !== null)
                ? `Approve & Dispatch ${(payload.discount_rate * 100).toFixed(1)}% Discount to ${payload.contact_name || 'Customer'}`
                : `Approve & Dispatch Payment Link to ${payload.contact_name || 'Customer'}`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
