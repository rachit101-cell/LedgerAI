# LedgerAI Backend — Deterministic Accounting & Cash Bridge Engine

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Python: 3.12](https://img.shields.io/badge/Python-3.12+-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0+-D71F00.svg?logo=sqlalchemy&logoColor=white)](https://www.sqlalchemy.org/)
[![Pydantic: v2](https://img.shields.io/badge/Pydantic-v2-E92063.svg?logo=pydantic&logoColor=white)](https://docs.pydantic.dev/)
[![Pytest: 33 Passed](https://img.shields.io/badge/Pytest-33%20Passed-brightgreen.svg?logo=pytest&logoColor=white)](https://docs.pytest.org/)

> **High-performance Python backend powering zero-hallucination deterministic financial operations, Cash Bridge liquidity solutions, and PayPal Sandbox payment reconciliation.**

---

## 🧭 Overview

The LedgerAI backend is engineered to act as an infallible financial system of record for small businesses. It guarantees:
1. **Zero AI Financial Arithmetic:** All balances, taxes, discounts, and runway forecasts are calculated in pure Python using exact `Decimal` arithmetic with strict rounding.
2. **Autonomous Cash Bridge Decision Engine:** Deterministically identifies projected cash deficits across a 14-day horizon and formulates comparative, owner-authorized strategies.
3. **Verified PayPal Integration:** Direct, server-side PayPal REST Orders v2 generation, status capture, and idempotent ledger updates.

---

## 📐 Architecture & Key Modules

```
backend/
├── app/
│   ├── main.py                     # FastAPI application factory, middleware, CORS & routes
│   ├── config.py                   # Environment configuration & PayPal credential management
│   ├── database.py                 # SQLAlchemy DB engine, session makers & connection pool
│   ├── models.py                   # Relational ORM models (Businesses, Documents, Actions, Decisions)
│   ├── schemas.py                  # Pydantic v2 data transfer objects & request/response contracts
│   ├── auth.py                     # Cryptographic hashing & signature verification
│   └── services/
│       ├── decision_service.py     # Cash Bridge Decision Engine (deterministic alternatives)
│       ├── financial.py            # Financial summaries, runway projections, and invariant checks
│       ├── paypal_service.py       # PayPal REST Orders v2 client and server-side capture
│       ├── ai_assistant.py         # Grounded AI assistant with allowlisted tool definitions
│       └── seed_data.py            # Canonical Apex Enterprises demo dataset seeder
├── tests/                          # Comprehensive automated test suite
│   ├── test_financial_invariants.py# 7 tests: Decimal precision, balance derivations, tampering
│   ├── test_api_endpoints.py       # 15 tests: Multi-tenant security, webhooks, auth gating
│   ├── test_decision_engine.py     # Decision case generation & outcome ledger auditing
│   └── test_cash_bridge_engine.py  # Cash Bridge math, discount scaling & supplier invariants
├── pytest.ini                      # Pytest runner configuration
├── requirements.txt                # Pinned production dependencies
└── run_server.py                   # Resilient dev runner with port fallback
```

---

## 🔒 Financial Safety Invariants

- **Exact Decimal Arithmetic:** Float types are forbidden in financial calculation paths. All currency values use Python's `Decimal` class with `ROUND_HALF_UP` to two decimal places.
- **Derived Balances:** Outstanding invoice balances are strictly computed as:
  $$\text{Outstanding Balance} = \text{Total} - \sum(\text{Valid Allocations})$$
- **Shortfall Invariant:** Liquidity deficit is strictly:
  $$\text{Shortfall Amount} = \max(0, \text{Upcoming Obligations} - \text{Recorded Cash})$$
- **Tamper-Proof Action Drafts:** Any action draft dispatched to a customer carries a SHA-256 payload digest. If the client or a malicious actor alters the monetary amount or recipient, the server rejects approval.
- **Untrusted Browser Redirects:** A client returning with `?paypal_success=true` is never trusted. The backend connects directly to PayPal's API to confirm `status == 'COMPLETED'` before booking payment.

---

## 🛠️ Local Development & Setup

### Prerequisites
- Python 3.10 or higher (Python 3.12 recommended)
- SQLite3 or PostgreSQL

### Installation
```bash
# From backend directory
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Linux / macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

| Key | Description | Default |
|:---|:---|:---|
| `DATABASE_URL` | SQLAlchemy connection string | `sqlite:///./ledgerai.db` |
| `ENVIRONMENT` | Environment name | `development` |
| `PAYPAL_MODE` | PayPal environment | `sandbox` |
| `PAYPAL_CLIENT_ID` | PayPal REST App Client ID | *(PayPal Sandbox)* |
| `PAYPAL_CLIENT_SECRET` | PayPal REST App Secret | *(PayPal Sandbox)* |
| `CORS_ORIGINS` | Permitted browser origins | `http://localhost:3000,...` |

### Running the API Server
```bash
python run_server.py
```
- API Endpoint: `http://localhost:8000`
- Interactive OpenAPI Docs: `http://localhost:8000/docs`
- ReDoc Docs: `http://localhost:8000/redoc`

---

## 🧪 Running Automated Tests

Run the full automated test suite (33 tests):
```bash
python -m pytest -v
```

To run individual test modules:
```bash
# Financial Invariants Test
pytest tests/test_financial_invariants.py -v

# Cash Bridge & Decision Engine Tests
pytest tests/test_cash_bridge_engine.py -v
pytest tests/test_decision_engine.py -v

# API & Security Tests
pytest tests/test_api_endpoints.py -v
```

---

## 📄 License
This project is part of LedgerAI and is released under the [MIT License](../LICENSE).

