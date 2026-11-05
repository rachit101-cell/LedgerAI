import json
from decimal import Decimal
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.database import get_db
from app.models import Business, Document, ActionDraft, DecisionCase, Contact
from tests.helpers import TestingSessionLocal, reset_test_db, client, OWNER_AUTH

OTHER_AUTH = {
    "X-Owner-Auth-Token": "owner-secret-token",
    "X-Workspace-Id": "ws-other-002"
}

@pytest.fixture(autouse=True)
def setup_database():
    reset_test_db()
    yield

def test_cb1_exact_decimal_discount_arithmetic():
    """Verify exact decimal calculation for early-payment discount (Option B)."""
    # 2.0% discount on ₹35,000.00 outstanding invoice
    res = client.post(
        "/api/v1/decisions/evaluate",
        json={"discount_rate": 0.02},
        headers=OWNER_AUTH
    )
    assert res.status_code == 200
    data = res.json()
    assert data["calculation_version"] == "cb_v1.0"

    opt_b = next((o for o in data["options"] if o["id"] == "opt_early_discount"), None)
    assert opt_b is not None
    assert opt_b["option_type"] == "early_payment_discount"
    assert opt_b["availability"] == "available"
    assert Decimal(str(opt_b["discount_rate"])) == Decimal("0.02")
    # 35,000.00 * 0.02 = 700.00
    assert Decimal(str(opt_b["discount_amount"])) == Decimal("700.00")
    # 35,000.00 - 700.00 = 34,300.00
    assert Decimal(str(opt_b["net_expected_receipt"])) == Decimal("34300.00")
    assert Decimal(str(opt_b["known_direct_cost"])) == Decimal("700.00")
    assert Decimal(str(opt_b["estimated_financial_impact"])) == Decimal("34300.00")

def test_cb1_unconfirmed_discount_is_conditional():
    """Without owner-confirmed discount terms, Option B is conditional with missing inputs."""
    res = client.post("/api/v1/decisions/evaluate", headers=OWNER_AUTH)
    assert res.status_code == 200
    data = res.json()

    opt_b = next((o for o in data["options"] if o["id"] == "opt_early_discount"), None)
    assert opt_b is not None
    assert opt_b["availability"] == "conditional"
    assert "Requires explicit owner-confirmed discount terms" in opt_b["availability_reason"]
    assert len(opt_b["missing_inputs"]) > 0
    assert opt_b["known_direct_cost"] is None

def test_cb1_supplier_extension_gated_on_explicit_agreement():
    """Option C is unavailable unless explicit supplier agreement is recorded."""
    # 1. Unconfirmed agreement -> unavailable with missing evidence rationale
    res1 = client.post(
        "/api/v1/decisions/evaluate",
        json={"supplier_agreement_confirmed": False},
        headers=OWNER_AUTH
    )
    assert res1.status_code == 200
    data1 = res1.json()
    opt_c1 = next((o for o in data1["options"] if o["id"] == "opt_reschedule_obligation"), None)
    assert opt_c1 is not None
    assert opt_c1["option_type"] == "supplier_extension"
    assert opt_c1["availability"] == "unavailable"
    assert "Missing evidence" in opt_c1["availability_reason"]
    assert "supplier_written_agreement" in opt_c1["missing_inputs"]
    assert opt_c1["known_direct_cost"] is None

    # 2. Confirmed agreement with 21-day extension and ₹500 fee -> available
    res2 = client.post(
        "/api/v1/decisions/evaluate",
        json={
            "supplier_agreement_confirmed": True,
            "supplier_extension_days": 21,
            "supplier_extension_fee": 500.00
        },
        headers=OWNER_AUTH
    )
    assert res2.status_code == 200
    data2 = res2.json()
    opt_c2 = next((o for o in data2["options"] if o["id"] == "opt_reschedule_obligation"), None)
    assert opt_c2 is not None
    assert opt_c2["availability"] == "available"
    assert Decimal(str(opt_c2["known_direct_cost"])) == Decimal("500.00")
    assert "+21 days" in opt_c2["expected_timing"]

def test_cb1_financing_simulation_hypothetical_only():
    """Option D is strictly simulation_only, never calls a lender, and requires explicit inputs."""
    # Without inputs -> unavailable / inputs needed
    res1 = client.post("/api/v1/decisions/evaluate", headers=OWNER_AUTH)
    assert res1.status_code == 200
    data1 = res1.json()
    opt_d1 = next((o for o in data1["options"] if o["id"] == "opt_financing_simulation"), None)
    assert opt_d1 is not None
    assert opt_d1["simulation_only"] is True
    assert opt_d1["availability"] == "unavailable"
    assert "Unpriced simulation" in opt_d1["availability_reason"]
    assert len(opt_d1["missing_inputs"]) > 0

    # With hypothetical inputs -> available with simulation labels
    res2 = client.post(
        "/api/v1/decisions/evaluate",
        json={
            "financing_simulation_inputs": {
                "principal": 20000.00,
                "fee": 600.00,
                "repayment_period_days": 30
            }
        },
        headers=OWNER_AUTH
    )
    assert res2.status_code == 200
    data2 = res2.json()
    opt_d2 = next((o for o in data2["options"] if o["id"] == "opt_financing_simulation"), None)
    assert opt_d2 is not None
    assert opt_d2["simulation_only"] is True
    assert opt_d2["availability"] == "available"
    assert Decimal(str(opt_d2["cash_amount"])) == Decimal("20000.00")
    assert Decimal(str(opt_d2["known_direct_cost"])) == Decimal("600.00")
    assert "[SIMULATION ONLY]" in opt_d2["description"]

def test_cb1_cannot_select_unavailable_option():
    """Attempting to select an unavailable option is rejected with HTTP 400."""
    eval_res = client.post("/api/v1/decisions/evaluate", headers=OWNER_AUTH)
    case_id = eval_res.json()["id"]

    # In default evaluation, opt_reschedule_obligation is unavailable (missing supplier consent)
    sel_res = client.post(
        f"/api/v1/decisions/{case_id}/select-option",
        json={"option_id": "opt_reschedule_obligation"},
        headers=OWNER_AUTH
    )
    assert sel_res.status_code == 400
    assert "unavailable" in sel_res.json()["detail"].lower()

def test_cb1_stale_data_detection():
    """If underlying invoice status changes (e.g. paid), case is flagged stale and selection is blocked."""
    eval_res = client.post("/api/v1/decisions/evaluate", headers=OWNER_AUTH)
    case_id = eval_res.json()["id"]
    target_doc_id = eval_res.json()["target_document_id"]

    # Verify initially not stale
    get_res1 = client.get(f"/api/v1/decisions/{case_id}", headers=OWNER_AUTH)
    assert get_res1.json()["is_stale"] is False

    # Mark target invoice as paid in DB
    db = TestingSessionLocal()
    doc = db.query(Document).filter(Document.id == target_doc_id).first()
    doc.status = "paid"
    db.commit()
    db.close()

    # Now decision case must be detected as stale
    get_res2 = client.get(f"/api/v1/decisions/{case_id}", headers=OWNER_AUTH)
    assert get_res2.json()["is_stale"] is True
    assert "already paid" in get_res2.json()["stale_reason"]

    # Selecting option on stale case must be blocked
    sel_res = client.post(
        f"/api/v1/decisions/{case_id}/select-option",
        json={"option_id": "opt_collect_overdue"},
        headers=OWNER_AUTH
    )
    assert sel_res.status_code == 400
    assert "stale" in sel_res.json()["detail"].lower()

def test_cb1_early_discount_creates_tamper_proof_draft():
    """Selecting early-payment discount creates an ActionDraft with canonical SHA-256 payload."""
    eval_res = client.post(
        "/api/v1/decisions/evaluate",
        json={"discount_rate": 0.03},
        headers=OWNER_AUTH
    )
    case_id = eval_res.json()["id"]

    sel_res = client.post(
        f"/api/v1/decisions/{case_id}/select-option",
        json={"option_id": "opt_early_discount"},
        headers=OWNER_AUTH
    )
    assert sel_res.status_code == 200
    data = sel_res.json()
    assert data["status"] == "awaiting_approval"
    assert data["action_draft_id"] is not None

    db = TestingSessionLocal()
    draft = db.query(ActionDraft).filter(ActionDraft.id == data["action_draft_id"]).first()
    assert draft is not None
    assert draft.action_type == "early_payment_discount_offer"
    payload = json.loads(draft.payload_json)
    assert payload["discount_rate"] == 0.03
    assert payload["discount_amount"] == 1050.0  # 35000 * 0.03
    assert payload["net_amount"] == 33950.0
    db.close()

def test_cb1_deterministic_repeatability():
    """Running evaluation twice with identical inputs produces identical results."""
    res1 = client.post(
        "/api/v1/decisions/evaluate",
        json={"discount_rate": 0.02},
        headers=OWNER_AUTH
    )
    res2 = client.post(
        "/api/v1/decisions/evaluate",
        json={"discount_rate": 0.02},
        headers=OWNER_AUTH
    )
    assert res1.status_code == 200
    assert res2.status_code == 200
    d1 = res1.json()
    d2 = res2.json()

    assert d1["calculations"]["calculation_version"] == "cb_v1.0"
    assert d2["calculations"]["calculation_version"] == "cb_v1.0"
    assert d1["calculations"]["recorded_cash_balance"] == d2["calculations"]["recorded_cash_balance"]
    assert d1["calculations"]["upcoming_obligations"] == d2["calculations"]["upcoming_obligations"]
    assert d1["calculations"]["net_projected_deficit"] == d2["calculations"]["net_projected_deficit"]
    assert d1["calculations"]["projected_buffer_after_resolution"] == d2["calculations"]["projected_buffer_after_resolution"]
    assert len(d1["options"]) == len(d2["options"])
    assert d1["recommended_option_id"] == d2["recommended_option_id"]
    for o1, o2 in zip(d1["options"], d2["options"]):
        assert o1["id"] == o2["id"]
        assert o1["availability"] == o2["availability"]
        assert o1["estimated_financial_impact"] == o2["estimated_financial_impact"]

def test_cb2_owner_approval_requires_valid_hash_and_unpaid_invoice():
    """CB-2: Approving an action draft requires exact canonical payload hash and blocks on settled invoice."""
    # 1. Evaluate with 2% discount and select option
    eval_res = client.post(
        "/api/v1/decisions/evaluate",
        json={"discount_rate": 0.02},
        headers=OWNER_AUTH
    )
    case_id = eval_res.json()["id"]
    sel_res = client.post(
        f"/api/v1/decisions/{case_id}/select-option",
        json={"option_id": "opt_early_discount"},
        headers=OWNER_AUTH
    )
    draft_id = sel_res.json()["action_draft_id"]

    db = TestingSessionLocal()
    draft = db.query(ActionDraft).filter(ActionDraft.id == draft_id).first()
    valid_hash = draft.payload_hash
    target_doc_id = draft.document_id
    db.close()

    # 2. Tampered hash -> rejected
    tamper_res = client.post(
        f"/api/v1/action-drafts/{draft_id}/approve",
        json={"expected_payload_hash": "tampered_fake_hash_12345"},
        headers=OWNER_AUTH
    )
    assert tamper_res.status_code == 400
    assert "Payload hash mismatch" in tamper_res.json()["detail"]

    # 3. Valid hash on unpaid invoice -> approved
    approve_res = client.post(
        f"/api/v1/action-drafts/{draft_id}/approve",
        json={"expected_payload_hash": valid_hash},
        headers=OWNER_AUTH
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "approved"

    # Verify decision case status also transitioned to approved
    case_res = client.get(f"/api/v1/decisions/{case_id}", headers=OWNER_AUTH)
    assert case_res.json()["status"] == "approved"
    assert case_res.json()["approved_at"] is not None

def test_cb2_approval_blocked_if_invoice_settled_before_approval():
    """CB-2: If invoice settles between draft preparation and approval, approval is blocked."""
    eval_res = client.post(
        "/api/v1/decisions/evaluate",
        json={"discount_rate": 0.02},
        headers=OWNER_AUTH
    )
    case_id = eval_res.json()["id"]
    sel_res = client.post(
        f"/api/v1/decisions/{case_id}/select-option",
        json={"option_id": "opt_early_discount"},
        headers=OWNER_AUTH
    )
    draft_id = sel_res.json()["action_draft_id"]

    db = TestingSessionLocal()
    draft = db.query(ActionDraft).filter(ActionDraft.id == draft_id).first()
    valid_hash = draft.payload_hash
    # Simulate invoice paid before owner approves
    doc = db.query(Document).filter(Document.id == draft.document_id).first()
    doc.status = "paid"
    db.commit()
    db.close()

    # Attempting to approve must fail
    res = client.post(
        f"/api/v1/action-drafts/{draft_id}/approve",
        json={"expected_payload_hash": valid_hash},
        headers=OWNER_AUTH
    )
    assert res.status_code == 400
    assert "already been settled" in res.json()["detail"]

def test_cb3_record_failed_or_cancelled_outcome_preserves_state():
    """CB-3: Outcome ledger explicitly records and preserves failed/cancelled states without fake success."""
    eval_res = client.post("/api/v1/decisions/evaluate", headers=OWNER_AUTH)
    case_id = eval_res.json()["id"]

    # Record failure event
    fail_res = client.post(
        f"/api/v1/decisions/{case_id}/record-outcome?outcome_status=failed&notes=Customer%20disputed%20obligation",
        headers=OWNER_AUTH
    )
    assert fail_res.status_code == 200
    assert fail_res.json()["status"] == "failed"
    assert fail_res.json()["outcome_status"] == "failed"
    assert "disputed" in fail_res.json()["outcome_notes"]

    # Check ledger outcomes endpoint
    ledger_res = client.get("/api/v1/decisions/ledger/outcomes", headers=OWNER_AUTH)
    assert ledger_res.status_code == 200
    items = ledger_res.json()
    item = next((i for i in items if i["decision_id"] == case_id), None)
    assert item is not None
    assert item["status"] == "failed"
    assert item["calculation_version"] == "cb_v1.0"

def test_cb3_outcome_ledger_preserves_cross_workspace_isolation():
    """CB-3: Decisions and outcomes cannot be accessed across tenant/workspace boundaries."""
    eval_res = client.post("/api/v1/decisions/evaluate", headers=OWNER_AUTH)
    case_id = eval_res.json()["id"]

    # Other workspace attempting to view or record outcome
    other_get = client.get(f"/api/v1/decisions/{case_id}", headers=OTHER_AUTH)
    assert other_get.status_code == 404

    other_post = client.post(
        f"/api/v1/decisions/{case_id}/record-outcome?outcome_status=cancelled",
        headers=OTHER_AUTH
    )
    assert other_post.status_code in [403, 404]

def test_cb1_half_cent_rounding_policy_round_half_up():
    """
    Verify exact half-cent rounding policy: ROUND_HALF_UP (standard arithmetic half-up).
    Note: Under ROUND_HALF_UP, 0.125 rounds to 0.13.
    (Under Banker's rounding / ROUND_HALF_EVEN, 0.125 would round to 0.12).
    """
    # Temporarily set overdue invoice amount to 10.00
    db = TestingSessionLocal()
    doc = db.query(Document).filter(Document.document_type == "invoice", Document.status == "overdue").first()
    assert doc is not None
    original_total = doc.total
    doc.total = Decimal("10.00")
    db.commit()
    db.close()

    try:
        # 10.00 * 0.0125 = 0.125
        res = client.post(
            "/api/v1/decisions/evaluate",
            json={"discount_rate": 0.0125},
            headers=OWNER_AUTH
        )
        assert res.status_code == 200
        data = res.json()
        opt_b = next((o for o in data["options"] if o["id"] == "opt_early_discount"), None)
        assert opt_b is not None
        # 0.125 must round up to 0.13 under ROUND_HALF_UP
        assert Decimal(str(opt_b["discount_amount"])) == Decimal("0.13")
        assert Decimal(str(opt_b["net_expected_receipt"])) == Decimal("9.87")
    finally:
        # Restore original total
        db = TestingSessionLocal()
        doc = db.query(Document).filter(Document.document_type == "invoice", Document.status == "overdue").first()
        doc.total = original_total
        db.commit()
        db.close()

def test_cb1_financing_simulation_invalid_and_malformed_inputs():
    """CB-1: Financing simulation with invalid, negative, or malformed parameters is safely rejected as unpriced."""
    # 1. Negative principal
    res1 = client.post(
        "/api/v1/decisions/evaluate",
        json={"financing_simulation_inputs": {"principal": -5000.00, "fee": 100.00}},
        headers=OWNER_AUTH
    )
    assert res1.status_code == 200
    opt_d1 = next(o for o in res1.json()["options"] if o["id"] == "opt_financing_simulation")
    assert opt_d1["availability"] == "unavailable"
    assert "positive number" in opt_d1["availability_reason"]

    # 2. Negative fee
    res2 = client.post(
        "/api/v1/decisions/evaluate",
        json={"financing_simulation_inputs": {"principal": 10000.00, "fee": -50.00}},
        headers=OWNER_AUTH
    )
    assert res2.status_code == 200
    opt_d2 = next(o for o in res2.json()["options"] if o["id"] == "opt_financing_simulation")
    assert opt_d2["availability"] == "unavailable"
    assert "cannot be negative" in opt_d2["availability_reason"]

    # 3. Non-numeric parameter
    res3 = client.post(
        "/api/v1/decisions/evaluate",
        json={"financing_simulation_inputs": {"principal": "not_a_number", "fee": 100.00}},
        headers=OWNER_AUTH
    )
    assert res3.status_code == 200
    opt_d3 = next(o for o in res3.json()["options"] if o["id"] == "opt_financing_simulation")
    assert opt_d3["availability"] == "unavailable"
    assert "valid numeric values" in opt_d3["availability_reason"]

def test_cb2_approval_blocked_on_voided_invoice():
    """CB-2: If invoice is voided before approval, approval is strictly blocked."""
    eval_res = client.post(
        "/api/v1/decisions/evaluate",
        json={"discount_rate": 0.02},
        headers=OWNER_AUTH
    )
    case_id = eval_res.json()["id"]
    sel_res = client.post(
        f"/api/v1/decisions/{case_id}/select-option",
        json={"option_id": "opt_early_discount"},
        headers=OWNER_AUTH
    )
    draft_id = sel_res.json()["action_draft_id"]

    db = TestingSessionLocal()
    draft = db.query(ActionDraft).filter(ActionDraft.id == draft_id).first()
    valid_hash = draft.payload_hash
    # Void the invoice
    doc = db.query(Document).filter(Document.id == draft.document_id).first()
    doc.status = "void"
    db.commit()
    db.close()

    res = client.post(
        f"/api/v1/action-drafts/{draft_id}/approve",
        json={"expected_payload_hash": valid_hash},
        headers=OWNER_AUTH
    )
    assert res.status_code == 400
    assert "voided" in res.json()["detail"]

def test_cb3_lifecycle_reconciliation_required_and_unknown_outcomes():
    """CB-3: Outcome ledger supports recording reconciliation_required and unknown states."""
    eval_res = client.post("/api/v1/decisions/evaluate", headers=OWNER_AUTH)
    case_id = eval_res.json()["id"]

    # Record reconciliation_required
    rec_res = client.post(
        f"/api/v1/decisions/{case_id}/record-outcome?outcome_status=reconciliation_required&notes=Partial%20unmatched%20payment%20detected",
        headers=OWNER_AUTH
    )
    assert rec_res.status_code == 200
    assert rec_res.json()["status"] == "reconciliation_required"
    assert rec_res.json()["outcome_status"] == "reconciliation_required"

    # Record unknown
    unk_res = client.post(
        f"/api/v1/decisions/{case_id}/record-outcome?outcome_status=unknown&notes=Payment%20gateway%20timeout",
        headers=OWNER_AUTH
    )
    assert unk_res.status_code == 200
    assert unk_res.json()["status"] == "unknown"



