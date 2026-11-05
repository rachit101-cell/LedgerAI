# LedgerAI Frontend — Next.js 15 Client Architecture

[![Next.js: 15](https://img.shields.io/badge/Next.js-15-black.svg?logo=next.js&logoColor=white)](https://nextjs.org/)
[![React: 19](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript: 5](https://img.shields.io/badge/TypeScript-5-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS: 4](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)

> **High-performance, glassmorphic financial management interface built with Next.js 15 (App Router), TypeScript, and Tailwind CSS.**

---

## 🧭 Overview

The LedgerAI frontend is designed to deliver a modern, intuitive, and mathematically rigorous experience for business owners. It provides real-time visibility into working capital, cash runways, pending receivables, supplier obligations, and interactive decision modeling.

---

## 📐 Architecture & Key Components

```
frontend/
├── app/
│   ├── layout.tsx              # Root HTML wrapper, metadata, and font declarations
│   ├── page.tsx                # Dynamic view orchestrator and top-level tab state
│   └── globals.css             # Tailwind CSS tokens, theme variables, glassmorphic styling
├── components/
│   ├── Navbar.tsx              # Live cash ticker, business switcher, and system alerts
│   ├── Sidebar.tsx             # Workspace navigation (Overview, Invoices, Decisions, Reports, Settings)
│   ├── Overview.tsx            # Executive KPI cards, cash runway chart, and deficit warnings
│   ├── DecisionsView.tsx       # Cash Bridge Engine interactive comparison & discount simulators
│   ├── InvoicesView.tsx        # Customer invoices & supplier bills with status badges
│   ├── FinancialReportsView.tsx# P&L, balance sheets, and cash movement analysis
│   ├── ActionApprovalModal.tsx # Cryptographic SHA-256 owner approval modal
│   ├── PayPalCheckoutModal.tsx # Server-verified PayPal Sandbox checkout interface
│   ├── RecordTransactionModal.tsx # Manual transaction entry with double-entry validation
│   └── ChatAssistant.tsx       # Grounded AI chat interface with structured tool responses
└── lib/
    └── api.ts                  # Resilient API client with automatic production/local fallback
```

---

## 💡 Key UI Capabilities

1. **Interactive Cash Bridge Simulator (`DecisionsView.tsx`):**
   - Side-by-side trade-off matrix: Option 1 (Full Face Collection), Option 2 (Cash Bridge Discount), Option 3 (Supplier Rescheduling).
   - Dynamic simulation buttons: **2.0% Prompt Cash**, **3.5% Fast Cash**, and **5.0% Urgent Bridge**.
   - Multi-customer target selector supporting dynamic calculations across customer profiles (e.g., Sharma Traders ₹35,000, Mehta Supermart ₹18,500).
   - Real-time buffer forecasting showing net cash impact after 100% full supplier payment.

2. **Cryptographic Owner Authorization (`ActionApprovalModal.tsx`):**
   - Displays clear legal recipient, discount terms, and net expected cash inflow.
   - Computes and verifies SHA-256 payload checksums before enabling the dispatch trigger.
   - Enforces human-in-the-loop governance for all external payment demands.

3. **Server-Verified PayPal Checkout (`PayPalCheckoutModal.tsx`):**
   - Seamlessly generates real PayPal Sandbox Orders v2.
   - Embeds PayPal Sandbox checkout actions and handles return URL tokens (`token`, `PayerID`).
   - Displays server-side capture verification and instant ledger reconciliation status.

4. **Executive Financial Summary (`Overview.tsx` & `FinancialReportsView.tsx`):**
   - Indian currency notation (`₹` / `en-IN`) across all monetary representations.
   - Clear visual indicators for overdue receivables and upcoming supplier due dates.
   - 14-day cash runway projection with automated deficit detection.

---

## 🛠️ Getting Started

### Prerequisites
- Node.js 18.18+ or 20.x
- npm, pnpm, or yarn

### Installation
```bash
# From frontend directory
npm install
```

### Environment Configuration
Create a `.env.local` file in `frontend/` (optional, defaults to `http://localhost:8000` for local development):
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```
*For production builds, set `NEXT_PUBLIC_API_URL` to your hosted backend (e.g., `https://ledgerai-backend-0ive.onrender.com`).*

### Development Mode
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

### Production Build & Typecheck
```bash
# Typecheck
npx tsc --noEmit

# Production Build
npm run build

# Start Production Server
npm run start
```

---

## 🎨 Design System & Styling
- **Typography:** Inter & Geist Mono.
- **Color Palette:** Slate neutrals, emerald accents for positive cash flow, rose accents for obligations, and indigo highlights for Cash Bridge interventions.
- **Glassmorphism:** Subdued borders (`border-white/10` or `border-slate-200/80`), backdrops (`backdrop-blur-md`), and high-contrast typography ensuring complete readability in all lighting environments.

---

## 📄 License
This project is part of LedgerAI and is released under the [MIT License](../LICENSE).
