'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function InvoicesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to home with invoices tab and preserve any paypal params
    const params = new URLSearchParams(window.location.search);
    params.set('tab', 'invoices');
    router.replace(`/?${params.toString()}`);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#090d16] text-slate-400">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Returning to LedgerAI Invoices...</span>
      </div>
    </div>
  );
}
