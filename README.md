# LedgerAI — AI Business Workspace with Verified PayPal Sandbox Reconciliation

> **PayPal AI Hackathon 2026 Entry**  
> **Core Promise:** *Record what happened. Understand the health of the business. Know what needs attention. Prepare the next action — with the owner in control.*

---

## 1. Executive Summary

**LedgerAI** is an AI-powered financial and operations workspace designed for small retailers, shops, wholesalers, and distributors. It turns disconnected financial records into evidence-backed business answers and owner-approved payment workflows.

Structured financial records and deterministic backend arithmetic are the sole source of truth; AI never hallucinates totals or balances. When an owner asks about upcoming cash risks, LedgerAI identifies overdue customer receivables, prepares a formal collection action with a **genuine PayPal Sandbox payment order**, requires cryptographic owner authorization, and performs server-side idempotent ledger reconciliation.

---

## 2. Key Capabilities & P0 Vertical Slice

| Feature | Description | Architecture / Safety Guardrail |
|---|---|---|
| **Deterministic Ledger** | Invoices, bills, payments, and derived balances with exact 2-decimal arithmetic. | Calculated server-side; outstanding amount = total - valid allocations. Never authored by AI. |
| **Cash-Flow & Shortfall Detection** | Calculates recorded cash vs. upcoming supplier payables within a 14-day horizon. | Detects shortfall dates and deficit amounts using confirmed obligations. |
| **Evidence-Backed AI Assistant** | Answers natural-language business questions like *"Will I have enough cash to pay my supplier this week?"* | Grounded in allowlisted, typed backend tools. Cites exact record IDs and dates. Discloses assumptions. |
| **Owner-Approved Actions** | AI drafts polite collection reminders with PayPal payment orders. | Binds cryptographically to a SHA-256 payload hash. Re-approval required if payload details change. |
| **Financial Decision Engine** | Evaluates 3 feasible alternatives (collection vs. reschedule vs. monitor) for detected cash risks. | Explainable ranking criteria; transparent trade-offs and uncertainty; requires owner authorization to select. |
| **Decision Outcome Ledger** | Persistent audit ledger tracking decisions from recommendation to verified outcome. | Compares predicted impact vs. verified PayPal capture; records exact variance (`actual - estimated`). |
| **Genuine PayPal Sandbox Integration** | Server-side PayPal Orders v2 integration generating checkout links. | Server-side status verification and capture. **Browser redirect alone never marks an invoice paid.** |
| **Idempotent Reconciliation** | Verified PayPal capture updates customer ledger exactly once. | Event deduplication by provider order ID prevents double-counting payments. |
| **Audit Trail & Activity Log** | Full immutable activity register. | Logs all approvals, payment allocations, and reconciliations with actor and timestamp. |


---

## 3. Technology Architecture

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, Glassmorphic responsive dark mode UI.
- **Backend:** Python, FastAPI, SQLAlchemy ORM, Pydantic v2 schemas.
- **Database:** PostgreSQL compatible (defaults to SQLite `sqlite:///./ledgerai.db` for instant, zero-dependency local review).
- **Payment Gateway:** PayPal REST API (Sandbox Orders v2 / Invoicing flow).
- **AI Orchestration:** Tool-based AI assistant with allowlisted typed schemas and deterministic calculation fallback.

---

## 4. Quickstart: Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 1. Backend Setup
```bash
# From repository root
cd backend

# Create and activate virtual environment
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# (Optional) Configure environment variables in .env
# Copy example:
copy .env.example .env

# Run backend API server
uvicorn app.main:app --reload --port 8000
```
Backend API will be live at `http://localhost:8000` (Interactive Swagger docs: `http://localhost:8000/docs`).  
*Note: On first startup, the database is automatically seeded with the deterministic "Apex Retail & Wholesale" demo dataset.*

### 2. Frontend Setup
```bash
# In a new terminal, from repository root
cd frontend

# Install dependencies
npm install

# Run frontend development server
npm run dev
```
Open `http://localhost:3000` in your browser.

---

## 5. Running Automated Tests

A comprehensive suite of 33 automated tests verifies all financial invariants, idempotency, decimal precision, API contracts, and the Decision Engine:

```bash
# From repository root
cd backend
venv\Scripts\python -m pytest -v
```
All 33 tests cover:
- **Financial Invariants (7 tests):** Decimal precision, invoice balance derivation, cash shortfall arithmetic, fabricated order ID rejection, idempotent reconciliation, currency validation, payload hash tamper-proofing.
- **API Endpoints & Security (15 tests):** Health checks, workspace tenant isolation, untrusted browser role header rejection, unauthorized action approval rejection, cryptographic webhook verification, idempotent event delivery.
- **Decision Engine & Outcome Ledger (11 tests):** Deterministic shortfall case generation, handling of missing records without hallucination, comparative options calculation, explainable recommendation criteria, owner authorization enforcement, approval modification invalidation, execution verification gating, failure preservation, idempotent outcome synchronization, authoritative source auditing, and predicted vs. actual variance tracking.

---

## 6. End-to-End Demo Walkthrough (under 3 minutes)

This workflow matches `DEMO_SCRIPT.md` exactly:

1. **Dashboard Overview:**  
   Open `http://localhost:3000`. You see **Apex Retail & Wholesale**:
   - Recorded Cash on Hand: **₹45,000.00**
   - Upcoming Supplier Bill: **₹65,000.00** (Due in few days)
   - **High Attention Banner:** Projected cash shortfall of **-₹20,000.00** detected.

2. **Evaluate Decision Engine & Compare Options:**  
   Click **"Compare Decision Options"** on the banner (or navigate to the **"Decisions & Outcomes"** tab):  
   - Inspect the structured Decision Case with verified supporting records (INV-2026-0042 for ₹35,000 and BILL-2026-0108 for ₹65,000).  
   - Compare 3 feasible alternatives side-by-side: Option A (accelerate overdue collection via PayPal), Option B (reschedule supplier bill), Option C (monitor).  
   - Read the explainable recommendation rationale and transparent uncertainties.

3. **Select Option & Owner Authorization:**  
   Click **"Select This Action"** on Option A.  
   - LedgerAI generates a cryptographically bound Action Draft (SHA-256 payload hash).  
   - Inspect recipient, invoice number, amount, payment channel (PayPal Sandbox), and click **"Approve & Create PayPal Sandbox Link"**.

4. **PayPal Sandbox Payment & Reconcile:**  
   - The PayPal Checkout Modal opens with genuine PayPal Sandbox Order ID.  
   - Click **"Open PayPal Sandbox Hosted Checkout"** or **"Confirm Sandbox Payment & Reconcile"**.  
   - Backend calls PayPal API server-side, verifies payment status, idempotently records transaction inflow, and updates invoice INV-2026-0042 to **Paid (₹0.00 outstanding)**.

5. **Updated Ledger Outlook:**  
   Return to Overview.  
   - Recorded Cash balance increases from **₹45,000.00** to **₹80,000.00**!  
   - The cash shortfall alert clears; the supplier bill can now be paid with ₹15,000 surplus remaining!  

6. **Inspect Decision Outcome Ledger:**  
   Navigate to **"Decisions & Outcomes"** to inspect the permanent **Decision Outcome Ledger**:  
   - Predicted Impact: **+₹35,000.00**  
   - Verified Actual Impact: **₹35,000.00**  
   - Variance: **₹0.00**  
   - Authoritative Source: **`paypal_sandbox_capture`**  
   - Status: **`VERIFIED SUCCESSFUL`**  
   - Full immutable record logged in Activity & Audit Trail.


---

## 7. AI Disclosure

- **Models & Tools:** LedgerAI uses a modular AI orchestrator supporting Google Gemini (e.g., `gemini-1.5-flash`), OpenAI, or local tool runners.
- **Role of AI:** Explanation of verified ledger records, translation of business questions to allowlisted tool calls, and drafting of owner-approved collection actions.
- **Guardrails:** AI has no direct SQL, filesystem, or shell access. Consequential financial writes and external messages require cryptographic owner approval.

---

## 8. License

This project is licensed under the [MIT License](LICENSE).
