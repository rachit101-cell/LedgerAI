import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LedgerAI — Business Cash Flow & Working Capital Command Center",
  description: "Executive Working Capital & Cash Flow management command center for business owners, with real-time liquidity forecasting, stock procurement, and verified PayPal reconciliation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body className="bg-[#f3f5fa] text-slate-900 min-h-screen font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
