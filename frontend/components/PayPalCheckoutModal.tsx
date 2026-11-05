'use client';

import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { Document } from '../types';
import { IconPayPal, IconShieldCheck, IconAlertTriangle, IconCheckCircle, IconArrowUpRight } from './Icons';

interface PayPalCheckoutModalProps {
  documentId: string;
  document?: Document | null;
  onClose: () => void;
  onPaymentSuccess: () => void;
}

export const PayPalCheckoutModal: React.FC<PayPalCheckoutModalProps> = ({
  documentId,
  document: doc,
  onClose,
  onPaymentSuccess,
}) => {
  const [loading, setLoading] = useState(true);
  const [orderData, setOrderData] = useState<{
    order_id: string;
    approval_url: string;
    amount: number | string;
    currency: string;
    paypal_amount?: number | string;
    paypal_currency?: string;
    exchange_rate?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reconciledResult, setReconciledResult] = useState<{
    reconciled: boolean;
    paid_amount: number | string;
    outstanding_amount: number | string;
    message: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    const initOrder = async () => {
      try {
        setLoading(true);
        const data = await api.createPayPalOrder(documentId);
        if (mounted) {
          setOrderData(data);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Failed to initiate customer PayPal payment order');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    initOrder();
    return () => {
      mounted = false;
    };
  }, [documentId]);

  const handleCaptureAndReconcile = async () => {
    if (!orderData) return;
    setCapturing(true);
    setError(null);
    try {
      const res = await api.capturePayPalOrder(orderData.order_id, documentId);
      setReconciledResult(res);
      onPaymentSuccess();
    } catch (err: any) {
      setError(err.message || 'Payment verification failed. Check if customer has approved the transaction on PayPal.');
    } finally {
      setCapturing(false);
    }
  };

  const handleCopyLink = () => {
    if (!orderData?.approval_url) return;
    navigator.clipboard.writeText(orderData.approval_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const customerName = doc?.contact_name || 'Customer (Sharma Traders)';
  const docNumber = doc?.document_number || 'INV-2026-0042';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="business-card max-w-xl w-full border-slate-200 bg-white p-6 space-y-5 rounded-2xl shadow-2xl relative text-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 text-[#0070ba] border border-blue-200">
              <IconPayPal className="w-6 h-6 text-[#0070ba]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Customer Payment Link Center</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold font-mono">
                  Merchant Workspace
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Collecting funds for <strong className="text-slate-800">Apex Enterprises</strong> from <strong className="text-indigo-700">{customerName}</strong>
              </p>
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
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-bold">
              <IconAlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              <span>Payment Status Notice</span>
            </div>
            <p className="text-[11px] leading-relaxed text-rose-700 pl-6">
              {error}
            </p>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-slate-500 space-y-3">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs">Generating secure PayPal collection link for {customerName}...</p>
          </div>
        ) : reconciledResult ? (
          /* Reconciled Success View */
          <div className="py-6 space-y-4 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center mx-auto shadow-sm">
              <IconCheckCircle className="w-8 h-8" />
            </div>
            <div>
              <h4 className="text-lg font-bold text-emerald-800">Customer Payment Received & Reconciled!</h4>
              <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto leading-relaxed">
                {customerName} has successfully remitted payment for invoice <strong className="text-slate-900">{docNumber}</strong>. Funds have been deposited into your cash ledger.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 text-left font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Beneficiary (Your Business):</span>
                <span className="text-slate-900 font-bold">Apex Enterprises</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payer (Customer):</span>
                <span className="text-indigo-700 font-bold">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Credited into Cash Ledger:</span>
                <span className="text-emerald-700 font-bold">
                  ₹{Number(reconciledResult.paid_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Customer Remaining Balance:</span>
                <span className="text-slate-900 font-bold">
                  ₹{Number(reconciledResult.outstanding_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-slate-200 text-[11px]">
                <span className="text-slate-500">Reconciliation:</span>
                <span className="text-emerald-700 flex items-center gap-1 font-semibold">
                  <IconShieldCheck className="w-3.5 h-3.5" /> Automated & Exactly Once (Idempotent)
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-sm"
            >
              Done & Return to Ledger Dashboard
            </button>
          </div>
        ) : (
          /* Payment Link Dispatch View */
          orderData && (
            <div className="space-y-4">
              {/* Context Summary */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                <div className="flex justify-between items-center border-b border-slate-200/80 pb-2">
                  <span className="text-slate-500">Receiving Merchant (You):</span>
                  <span className="text-slate-900 font-bold">Apex Enterprises</span>
                </div>
                <div className="flex justify-between items-center border-b border-slate-200/80 pb-2">
                  <span className="text-slate-500">Customer (Payer):</span>
                  <span className="text-indigo-700 font-bold">{customerName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Amount Due from Customer:</span>
                  <span className="text-slate-900 font-bold font-mono text-sm">
                    {orderData.currency} {Number(orderData.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {orderData.paypal_amount && orderData.paypal_currency && (
                  <div className="flex justify-between text-indigo-700">
                    <span className="text-slate-500">PayPal Converted Value:</span>
                    <span className="font-mono font-semibold">
                      ${Number(orderData.paypal_amount).toFixed(2)} {orderData.paypal_currency}
                      {orderData.exchange_rate && (
                        <span className="text-[10px] text-slate-500 ml-1">(@ ₹{orderData.exchange_rate}/USD)</span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Step 1: Send link to customer */}
              <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs space-y-3">
                <div className="font-bold text-indigo-900 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-[10px]">1</span>
                    Customer Payment Link (Send to {customerName}):
                  </span>
                  {copied && (
                    <span className="text-emerald-700 text-[11px] font-bold flex items-center gap-1">
                      <IconCheckCircle className="w-3.5 h-3.5 text-emerald-600" /> Link Copied to Clipboard!
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={orderData.approval_url}
                    className="flex-1 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-800 text-[11px] font-mono focus:outline-none select-all shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-all shadow-sm flex items-center gap-1.5 whitespace-nowrap active:scale-95"
                  >
                    <span>{copied ? 'Copied' : 'Copy Link'}</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Send this link to <strong className="text-indigo-800">{customerName}</strong> via WhatsApp, SMS, or Email. When they click the link on their device, they will pay directly to your account.
                </p>
              </div>

              {/* Step 2: Sandbox Demo Testing Instructions */}
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-xs space-y-2.5">
                <div className="font-bold text-blue-900 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px]">2</span>
                  <span>Demo Testing: Simulate Customer Paying You</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  To demonstrate the workflow, click below to open PayPal Sandbox <strong>as the customer ({customerName})</strong> and complete the payment using your sandbox buyer account.
                </p>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <a
                    href={orderData.approval_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[#0070ba] hover:bg-[#005ea6] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <IconPayPal className="w-4 h-4" />
                    <span>Simulate Customer Payment (Open as {customerName})</span>
                    <IconArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Step 3: Reconcile payment */}
              <div className="space-y-1.5 pt-1">
                <button
                  onClick={handleCaptureAndReconcile}
                  disabled={capturing}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 active:scale-95"
                >
                  <IconShieldCheck className="w-4 h-4" />
                  <span>{capturing ? 'Verifying with PayPal Server...' : 'Check & Reconcile Customer Payment Status'}</span>
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
