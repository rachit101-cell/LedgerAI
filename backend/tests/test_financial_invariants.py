import pytest
import asyncio
from unittest.mock import patch, AsyncMock
from decimal import Decimal
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Business, Contact, Document, DocumentItem, Transaction, PaymentAllocation, ActionDraft
from app.services.financial import calculate_invoice_totals, get_document_balances, get_financial_summary, check_anomalies
from app.services.ai_assistant import AIAssistantService, compute_payload_hash
from app.services.paypal_service import PayPalService
from app.services.seed_data import seed_demo_data

# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture
def db_session():
    engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)

def test_invoice_arithmetic_precision():
    """Validates exact decimal calculation of line items, tax, discounts, and total."""
    items = [
        {"quantity": "3.5", "unit_price": "100.00", "discount": "10.00", "tax": "18.00"},
        {"quantity": "2.0", "unit_price": "250.00", "discount": "0.00", "tax": "25.00"}
    ]
    # Line 1: (3.5 * 100) - 10 = 340 + 18 = 358
    # Line 2: (2.0 * 250) - 0 = 500 + 25 = 525
    # Total: 358 + 525 = 883
    totals = calculate_invoice_totals(items)
    assert totals["subtotal"] == Decimal("840.00")
    assert totals["discount"] == Decimal("10.00")
    assert totals["tax"] == Decimal("43.00")
    assert totals["total"] == Decimal("883.00")

def test_derived_outstanding_balance_and_partial_payments(db_session):
    """Validates that outstanding amount derives strictly from invoice total minus allocations."""
    biz = seed_demo_data(db_session)
    # Check Verma Groceries invoice INV-2026-0039 (Total: 15,000, Paid: 10,000, Outstanding: 5,000)
    inv = db_session.query(Document).filter(Document.document_number == "INV-2026-0039").first()
    assert inv is not None
    balances = get_document_balances(db_session, inv)
    assert balances["paid_amount"] == Decimal("10000.00")
    assert balances["outstanding_amount"] == Decimal("5000.00")

def test_cash_shortfall_detection_matches_demo_scenario(db_session):
    """
    Validates the exact DEMO_SCRIPT.md scenario:
    - Cash on hand: 45,000
    - Upcoming supplier bill (Sunrise Distributors): 65,000
    - Exact projected shortfall: 20,000
    - Overdue invoice (Sharma Traders): 35,000
    """
    biz = seed_demo_data(db_session)
    summary = get_financial_summary(db_session, biz.id, days_ahead=7)
    
    assert summary.recorded_cash_balance == Decimal("45000.00")
    assert summary.total_payables_due == Decimal("65000.00")
    assert summary.shortfall_risk is True
    assert summary.projected_shortfall_amount == Decimal("20000.00")
    
    # Overdue invoice check
    overdue_evidence = [e for e in summary.supporting_evidence if "INV-2026-0042" in e.label]
    assert len(overdue_evidence) == 1
    assert overdue_evidence[0].amount == Decimal("35000.00")

def test_fabricated_paypal_order_id_rejected(db_session):
    """P0-A: Validates that fabricated or mock order IDs are strictly rejected and leave ledger unchanged."""
    biz = seed_demo_data(db_session)
    inv = db_session.query(Document).filter(Document.document_number == "INV-2026-0042").first()
    fake_order_id = "SANDBOX-ORD-FAKE-9999"

    res = asyncio.run(PayPalService.capture_and_reconcile_order(db_session, inv.id, fake_order_id))
    assert res["reconciled"] is False
    assert res["status"] == "invalid_order_id"

    # Ledger must remain unchanged
    db_session.refresh(inv)
    assert inv.status == "overdue"
    balances = get_document_balances(db_session, inv)
    assert balances["outstanding_amount"] == Decimal("35000.00")

def test_idempotent_paypal_reconciliation_and_accounting(db_session):
    """
    Validates P0-A & P0-B:
    - Verified capture reconciles invoice exactly once.
    - Currency conversion follows documented exchange rate policy.
    - Repeated calls return already_reconciled with zero duplicate transactions.
    """
    biz = seed_demo_data(db_session)
    inv = db_session.query(Document).filter(Document.document_number == "INV-2026-0042").first()
    order_id = "5C872134L4902131A"
    
    # Outstanding 35,000 INR @ 85.00 rate = 411.76 USD
    mock_capture_payload = {
        "status": "COMPLETED",
        "purchase_units": [
            {
                "custom_id": inv.document_number,
                "reference_id": inv.id,
                "payments": {
                    "captures": [
                        {
                            "id": "CAP-88771122",
                            "status": "COMPLETED",
                            "amount": {
                                "currency_code": "USD",
                                "value": "411.76"
                            }
                        }
                    ]
                }
            }
        ]
    }

    mock_response = AsyncMock()
    mock_response.status_code = 201
    mock_response.json = lambda: mock_capture_payload

    with patch("app.services.paypal_service.PayPalService.get_access_token", new_callable=AsyncMock) as mock_token:
        mock_token.return_value = "fake_access_token"
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response

            # First reconciliation
            res1 = asyncio.run(PayPalService.capture_and_reconcile_order(db_session, inv.id, order_id))
            assert res1["reconciled"] is True
            assert res1["status"] == "success"
            assert res1["outstanding_amount"] == Decimal("0.00")

            # Document must now be paid
            db_session.refresh(inv)
            assert inv.status == "paid"

            # Second reconciliation with SAME order_id (Simulated duplicate webhook or repeated status check)
            res2 = asyncio.run(PayPalService.capture_and_reconcile_order(db_session, inv.id, order_id))
            assert res2["reconciled"] is True
            assert res2["status"] == "already_reconciled"

            # Assert exactly 1 transaction was created
            tx_count = db_session.query(Transaction).filter(Transaction.provider_payment_id == order_id).count()
            assert tx_count == 1

def test_currency_and_amount_mismatch_rejected(db_session):
    """P0-B: Validates that mismatched currency or amount rejects reconciliation and leaves ledger unchanged."""
    biz = seed_demo_data(db_session)
    inv = db_session.query(Document).filter(Document.document_number == "INV-2026-0042").first()
    order_id = "5C872134L4902131B"

    # Mismatched currency (EUR instead of USD)
    mock_mismatch_payload = {
        "status": "COMPLETED",
        "purchase_units": [
            {
                "custom_id": inv.document_number,
                "reference_id": inv.id,
                "payments": {
                    "captures": [
                        {
                            "id": "CAP-88771123",
                            "status": "COMPLETED",
                            "amount": {
                                "currency_code": "EUR",
                                "value": "100.00"
                            }
                        }
                    ]
                }
            }
        ]
    }
    mock_response = AsyncMock()
    mock_response.status_code = 201
    mock_response.json = lambda: mock_mismatch_payload

    with patch("app.services.paypal_service.PayPalService.get_access_token", new_callable=AsyncMock) as mock_token:
        mock_token.return_value = "fake_access_token"
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response

            res = asyncio.run(PayPalService.capture_and_reconcile_order(db_session, inv.id, order_id))
            assert res["reconciled"] is False
            assert res["status"] == "currency_mismatch"

            # Ledger remains unpaid
            db_session.refresh(inv)
            assert inv.status == "overdue"

def test_action_draft_tamper_proofing(db_session):
    """P0-D: Validates that modifying payload details invalidates approval (canonical payload hash match)."""
    biz = seed_demo_data(db_session)
    inv = db_session.query(Document).filter(Document.document_number == "INV-2026-0042").first()
    
    payload = {
        "action_type": "collection_reminder",
        "amount": "35000.00",
        "recipient": "Sharma Traders"
    }
    original_hash = compute_payload_hash(payload)

    draft = ActionDraft(
        business_id=biz.id,
        action_type="collection_reminder",
        document_id=inv.id,
        payload_json='{"action_type": "collection_reminder", "amount": "35000.00", "recipient": "Sharma Traders"}',
        payload_hash=original_hash,
        status="awaiting_approval"
    )
    db_session.add(draft)
    db_session.commit()

    # Attempt approval with tampered hash
    tampered_hash = "fake_tampered_hash_123"
    res_tampered = AIAssistantService.approve_action_draft(
        db=db_session,
        business_id=biz.id,
        draft_id=draft.id,
        actor="Owner",
        expected_hash=tampered_hash
    )
    assert res_tampered["success"] is False
    assert "Security error" in res_tampered["message"]

    # Now approve with correct hash
    res_valid = AIAssistantService.approve_action_draft(
        db=db_session,
        business_id=biz.id,
        draft_id=draft.id,
        actor="Owner",
        expected_hash=original_hash
    )
    assert res_valid["success"] is True
    assert res_valid["status"] == "approved"
