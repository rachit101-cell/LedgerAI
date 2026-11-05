'use client';

import dynamic from 'next/dynamic';

const App = dynamic(() => import('../components/App'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-[#090d16] text-slate-400">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Loading LedgerAI workspace...</span>
      </div>
    </div>
  ),
});

export default function Page() {
  return <App />;
}
