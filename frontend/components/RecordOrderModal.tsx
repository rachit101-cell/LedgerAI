'use client';

import React, { useState } from 'react';
import { Contact, Document } from '../types';
import { api } from '../lib/api';
import { IconShieldCheck, IconCheckCircle, IconAlertTriangle } from './Icons';

interface RecordOrderModalProps {
  contacts: Contact[];
  onClose: () => void;
  onOrderCreated: () => void;
  currency?: string;
}

export const RecordOrderModal: React.FC<RecordOrderModalProps> = ({
  contacts,
  onClose,
  onOrderCreated,
  currency = 'INR',
}) => {
  const customerContacts = contacts.filter((c) => c.contact_type === 'customer' || c.contact_type === 'both');
  
  const [selectedContactId, setSelectedContactId] = useState<string>(customerContacts[0]?.id || '');
  const [orderAmount, setOrderAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('Wholesale Grain & Grocery Order');
  const [paymentOption, setPaymentOption] = useState<'credit_pending' | 'paid_today'>('paid_today');
  const [paymentMethod, setPaymentMethod] = useState<string>('upi');
  const [reference, setReference] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoDocNumber = `INV-2026-${String(Math.floor(Math.random() * 900) + 100)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(orderAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid order amount greater than zero.');
      return;
    }

    if (!selectedContactId) {
      setError('Please select a customer for this order.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const today = new Date();
      const dueDate = new Date();
      dueDate.setDate(today.getDate() + 15);

      // 1. Create the customer invoice in the database
      const newDoc = await api.createDocument({
        document_type: 'invoice',
        document_number: autoDocNumber,
        contact_id: selectedContactId,
        currency: 'INR',
        issue_date: today.toISOString(),
        due_date: dueDate.toISOString(),
        notes: `Order created on ${today.toLocaleDateString('en-IN')}. ${description}`,
        items: [
          {
            description: description.trim() || 'Wholesale Order Supplies',
            quantity: 1,
            unit_price: amountNum,
            discount: 0,
            tax: 0,
          },
        ],
      });

      // 2. If paid today, record the transaction in the ledger immediately
      if (paymentOption === 'paid_today') {
        await api.recordPayment({
          document_id: newDoc.id,
          contact_id: selectedContactId,
          amount: amountNum,
          payment_method: paymentMethod,
          reference: reference.trim() || `ORDER-PAY-${Date.now().toString().slice(-6)}`,
          description: `Payment received for order ${autoDocNumber}`,
        });
      }

      onOrderCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record order in database.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <IconCheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Record Today&apos;s Customer Order</h3>
              <p className="text-[11px] text-slate-500">Adds live sales revenue and order record into the database</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
              <IconAlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Select Customer / Buyer <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              required
            >
              {customerContacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Order Amount & Doc Number */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Order Total (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  placeholder="25000"
                  value={orderAmount}
                  onChange={(e) => setOrderAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-bold font-mono text-slate-900 bg-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Generated Invoice #
              </label>
              <input
                type="text"
                value={autoDocNumber}
                readOnly
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-500 bg-slate-50 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Order Description / Line Items
            </label>
            <input
              type="text"
              placeholder="e.g. 20 Bags Basmati Rice & Cooking Oil"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 bg-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Payment Status Option */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <label className="block text-xs font-bold text-slate-800">
              Payment Terms for This Order:
            </label>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setPaymentOption('paid_today')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  paymentOption === 'paid_today'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 font-medium'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>✓ Paid Immediately</span>
                </div>
                <p className="text-[10px] mt-0.5 opacity-90">Adds to live cash balance</p>
              </button>

              <button
                type="button"
                onClick={() => setPaymentOption('credit_pending')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  paymentOption === 'credit_pending'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs font-bold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 font-medium'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>Pending (Net 15)</span>
                </div>
                <p className="text-[10px] mt-0.5 opacity-90">Adds to Accounts Receivable</p>
              </button>
            </div>

            {paymentOption === 'paid_today' && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white text-slate-800 font-medium"
                  >
                    <option value="upi">Instant UPI (GPay/PhonePe)</option>
                    <option value="bank_transfer">Direct Bank Transfer (NEFT/IMPS)</option>
                    <option value="cash">Counter Cash Receipt</option>
                    <option value="paypal">PayPal Business</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    UTR / Reference #
                  </label>
                  <input
                    type="text"
                    placeholder="UPI-REF-12345"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono bg-white text-slate-800"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-xs transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50"
            >
              {saving ? 'Recording Order...' : 'Confirm & Save Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

