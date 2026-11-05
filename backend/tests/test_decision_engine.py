import pytest
from decimal import Decimal
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import Base, get_db
from app.config import settings
from app.models import Business, Document, Contact, Transaction, ActionDraft, DecisionCase, AuditEvent
from app.services.seed_data import seed_demo_data
from app.services.decision_service import DecisionService
from app.services.ai_assistant import AIAssistantService

from tests.helpers import test_engine, TestingSessionLocal, reset_test_db, client, OWNER_AUTH

@pytest.fixture(autouse=True)
def setup_db():
    reset_test_db()
    yield

def test_1_financial_risk_generates_decision_case_with_valid_evidence():

    """1. A supported financial risk generates a decision case with valid evidence."""
    res = client.post("/api/v1/decisions/evaluate", headers=OWNER_AUTH)
    assert res.status_code == 200
    data = res.json()
    assert data["problem_type"] == "cash_shortfall_risk"
    assert data["severity"] == "critical"
    records_str = json_or_str(data["supporting_records"])
    assert "INV-2026-0042" in records_str
    assert "BILL-2026-0108" in records_str
    assert len(data["options"]) >= 2
    assert data["recommended_option_id"] == "opt_collect_overdue"

def test_2_insufficient_or_missing_financial_data_does_not_produce_fabricated_conclusions():
    """2. Insufficient or missing financial data does not produce fabricated conclusions."""
    db = TestingSessionLocal()
    biz = db.query(Business).first()
    # Delete all documents to simulate empty/insufficient records
    db.query(Document).filter(Document.business_id == biz.id).delete()
    db.commit()
    db.close()

    res = client.post("/api/v1/decisions/evaluate", headers=OWNER_AUTH)
    assert res.status_code == 200
    data = res.json()
    # Without obligations or overdue invoices, no fake shortfall is invented
    assert data["problem_type"] == "liquidity_surplus_evaluation"
    assert data["severity"] == "info"
    assert data["calculations"]["upcoming_obligations"] == 0.0
    assert data["calculations"]["net_projected_deficit"] == 0.0

def test_3_action_alternatives_use_correct_deterministic_calculations():
    """3. Action alternatives use correct deterministic calculations."""
    res = client.post("/api/v1/decisions/evaluate", headers=OWNER_AUTH)
    assert res.status_code == 200
    data = res.json()
    opt_collect = next(o for o in data["options"] if o["id"] == "opt_collect_overdue")
    opt_reschedule = next(o for o in data["options"] if o["id"] == "opt_reschedule_obligation")
    opt_monitor = next(o for o in data["options"] if o["id"] == "opt_monitor_without_action")

    # Exact invoice amount (₹35,000.00)
    assert float(opt_collect["estimated_financial_impact"]) == 35000.0
    # Exact bill amount (₹65,000.00)
    assert float(opt_reschedule["estimated_financial_impact"]) == 65000.0
    # Monitor action has 0 financial effect
    assert float(opt_monitor["estimated_financial_impact"]) == 0.0

def test_4_recommendations_explain_supporting_evidence_and_uncertainty():
    """4. Recommendations explain their supporting evidence and uncertainty."""
    res = client.post("/api/v1/decisions/evaluate", headers=OWNER_AUTH)
    assert res.status_code == 200
    data = res.json()
    rationale = data["recommendation_rationale"]
    assert "Option 1" in rationale
    assert "35,000" in rationale or "Sharma" in rationale
    assert "Uncertainty" in rationale or "Risk" in rationale
    # Every option has documented risks and assumptions
    for opt in data["options"]:
        assert len(opt["risks_and_assumptions"]) > 10

def test_5_unauthorized_users_cannot_access_restricted_decisions_or_approve_actions():
    """5. Unauthorized users cannot access restricted decisions or approve actions."""
    db = TestingSessionLocal()
    case = db.query(DecisionCase).first()
    case_id = case.id
    db.close()

    # Browser-supplied untrusted header cannot authorize option selection
    res_select = client.post(
        f"/api/v1/decisions/{case_id}/select-option",
        headers={"X-Actor-Role": "owner"},
        json={"option_id": "opt_collect_overdue"}
    )
    assert res_select.status_code == 403

    # Cross-workspace isolation
    res_cross = client.get(
        f"/api/v1/decisions/{case_id}",
        headers={"X-Workspace-Id": "non-existent-workspace-id"}
    )
    assert res_cross.status_code == 404

def test_6_approval_cannot_be_reused_after_approved_action_details_change():
    """6. Approval cannot be reused after the approved action details change."""
    db = TestingSessionLocal()
    biz = db.query(Business).first()
    case = DecisionService.evaluate_decision(db, biz.id)
    # Select option to generate action draft
    selected = DecisionService.select_option(db, biz.id, case.id, "opt_collect_overdue")
    draft_id = selected.action_draft_id
    draft = db.query(ActionDraft).filter(ActionDraft.id == draft_id).first()
    original_hash = draft.payload_hash

    # Tamper with the draft payload (e.g. attacker changes amount to 50000)
    draft.payload_json = draft.payload_json.replace("35000", "50000")
    db.commit()
    db.close()

    # Approval with original hash must fail due to payload hash mismatch
    res_approve = client.post(
        f"/api/v1/action-drafts/{draft_id}/approve",
        headers=OWNER_AUTH,
        json={"expected_payload_hash": original_hash}
    )
    assert res_approve.status_code == 400
    assert "Payload hash mismatch" in res_approve.json()["detail"]

def test_7_approved_action_is_not_marked_successful_before_execution_and_verification():
    """7. An approved action is not marked successful before execution and verification."""
    db = TestingSessionLocal()
    biz = db.query(Business).first()
    case = DecisionService.evaluate_decision(db, biz.id)
    selected = DecisionService.select_option(db, biz.id, case.id, "opt_collect_overdue")
    draft_id = selected.action_draft_id
    draft = db.query(ActionDraft).filter(ActionDraft.id == draft_id).first()

    # Owner approves
    AIAssistantService.approve_action_draft(db, biz.id, draft.id, "owner", draft.payload_hash)
    case_orm = db.query(DecisionCase).filter(DecisionCase.id == case.id).first()
    # Status is approved, NOT verified_successful!
    assert case_orm.status == "approved"
    assert case_orm.outcome_status == "pending"
    assert case_orm.actual_financial_impact is None
    db.close()

def test_8_failed_action_remains_unsuccessful():
    """8. A failed action remains unsuccessful."""
    db = TestingSessionLocal()
    doc = db.query(Document).filter(Document.document_number == "INV-2026-0042").first()
    # Directly test capture attempt when order is NOT approved on PayPal
    with patch("app.services.paypal_service.PayPalService.get_access_token", new_callable=AsyncMock) as mock_tok:
        mock_tok.return_value = "token"
        mock_res = AsyncMock()
        mock_res.status_code = 200
        mock_res.json = lambda: {"id": "ORD-FAILED", "status": "CREATED"}  # Not approved!
        with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_res
            res = client.post(
                "/api/v1/integrations/paypal/capture-order",
                headers=OWNER_AUTH,
                json={"document_id": doc.id, "order_id": "ORD-FAILED"}
            )
            # Must fail and not settle
            assert res.status_code == 400
            db.refresh(doc)
            assert doc.status != "paid"
    db.close()

def test_9_repeated_processing_of_same_outcome_does_not_duplicate_financial_effects():
    """9. Repeated processing of the same outcome does not duplicate financial effects."""
    db = TestingSessionLocal()
    biz = db.query(Business).first()
    doc = db.query(Document).filter(Document.document_number == "INV-2026-0042").first()

    # First outcome sync
    DecisionService.sync_decision_outcome(
        db, biz.id, doc.id, Decimal("35000.00"), "paypal_sandbox_capture", "ORD-1"
    )
    # Second identical outcome sync
    DecisionService.sync_decision_outcome(
        db, biz.id, doc.id, Decimal("35000.00"), "paypal_sandbox_capture", "ORD-1"
    )
    # Still 1 outcome record updated, no duplicated transactions created by sync
    case = db.query(DecisionCase).filter(DecisionCase.target_document_id == doc.id).first()
    assert case.status == "verified_successful"
    assert float(case.actual_financial_impact) == 35000.0
    assert float(case.variance_amount) == 0.0
    db.close()

def test_10_verified_payment_outcomes_reference_trustworthy_existing_records():
    """10. Verified payment outcomes reference trustworthy existing payment records or verified events."""
    db = TestingSessionLocal()
    biz = db.query(Business).first()
    doc = db.query(Document).filter(Document.document_number == "INV-2026-0042").first()

    synced = DecisionService.sync_decision_outcome(
        db, biz.id, doc.id, Decimal("35000.00"), "paypal_sandbox_capture", "ORD-REAL-789"
    )
    assert synced.authoritative_source == "paypal_sandbox_capture"
    assert "ORD-REAL-789" in synced.outcome_notes
    assert synced.outcome_status == "verified_successful"

    # Audit trail verifies trustworthy source
    audit = db.query(AuditEvent).filter(
        AuditEvent.action == "verify_decision_outcome",
        AuditEvent.entity_id == synced.id
    ).first()
    assert audit is not None
    assert "paypal_sandbox_capture" in audit.safe_metadata
    db.close()

def test_11_estimated_and_actual_financial_impacts_are_compared_correctly():
    """11. Estimated and actual financial impacts are compared correctly when both are available."""
    db = TestingSessionLocal()
    biz = db.query(Business).first()
    case = DecisionService.evaluate_decision(db, biz.id)
    doc = db.query(Document).filter(Document.document_number == "INV-2026-0042").first()

    # Estimated impact is ₹35,000.00
    assert float(case.estimated_financial_impact) == 35000.0

    # Simulate actual partial settlement of ₹30,000.00
    synced = DecisionService.sync_decision_outcome(
        db, biz.id, doc.id, Decimal("30000.00"), "paypal_sandbox_capture", "ORD-PARTIAL-123"
    )
    # Variance = Actual (30,000) - Estimated (35,000) = -5,000
    assert float(synced.actual_financial_impact) == 30000.0
    assert float(synced.variance_amount) == -5000.0
    assert "Variance: INR -5,000.00" in synced.outcome_notes

    # Outcome Ledger endpoint exposes this comparison
    res_ledger = client.get("/api/v1/decisions/ledger/outcomes", headers=OWNER_AUTH)
    assert res_ledger.status_code == 200
    ledger_items = res_ledger.json()
    item = next(it for it in ledger_items if it["decision_id"] == case.id)
    assert float(item["variance_amount"]) == -5000.0
    assert item["authoritative_source"] == "paypal_sandbox_capture"
    db.close()

def json_or_str(val):
    import json
    if isinstance(val, (dict, list)):
        return json.dumps(val)
    return str(val)
