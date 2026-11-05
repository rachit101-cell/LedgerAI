import pytest
from unittest.mock import patch, AsyncMock
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.main import app
from app.database import Base, get_db
from app.config import settings
from app.services.seed_data import seed_demo_data
from tests.helpers import test_engine, TestingSessionLocal, reset_test_db, client, OWNER_AUTH
from app.models import Business, Document, ActionDraft

@pytest.fixture(autouse=True)
def setup_db():
    reset_test_db()
    yield

def test_health_endpoint():
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["project"] == "LedgerAI"

def test_active_business_and_contacts():
    res = client.get("/api/v1/businesses/active")


    assert res.status_code == 200
    biz = res.json()
    assert biz["name"] == "Apex Retail & Wholesale"

    res_contacts = client.get("/api/v1/contacts")
    assert res_contacts.status_code == 200
    contacts = res_contacts.json()
    assert len(contacts) >= 3

def test_financial_summary_reports():
    res = client.get("/api/v1/reports/summary?days_ahead=7")
    assert res.status_code == 200
    data = res.json()
    assert float(data["recorded_cash_balance"]) == 45000.0
    assert float(data["total_payables_due"]) == 65000.0
    assert data["shortfall_risk"] is True
    assert float(data["projected_shortfall_amount"]) == 20000.0

def test_ai_chat_cash_and_prepare_action():
    # 1. Ask the cash question matching DEMO_SCRIPT.md
    res = client.post("/api/v1/ai/chat", json={"message": "Will I have enough cash to pay my supplier this week?"})
    assert res.status_code == 200
    data = res.json()
    assert "insufficient" in data["answer"].lower() or "shortfall" in data["answer"].lower()
    assert len(data["evidence"]) > 0

    # 2. Ask to prepare collection action
    res_act = client.post("/api/v1/ai/chat", json={"message": "Prepare a collection action for Sharma Traders invoice"})
    assert res_act.status_code == 200
    act_data = res_act.json()
    assert act_data["action_draft"] is not None
    draft = act_data["action_draft"]
    assert draft["status"] == "awaiting_approval"

    # 3. Approve action draft with verified owner token
    res_app = client.post(
        f"/api/v1/action-drafts/{draft['id']}/approve",
        headers=OWNER_AUTH,
        json={"approved_by": "Owner", "expected_payload_hash": draft["payload_hash"]}
    )
    assert res_app.status_code == 200
    assert res_app.json()["status"] == "approved"

def test_browser_supplied_role_header_cannot_escalate_privilege():
    """
    CRITICAL SECURITY INVARIANT:
    Setting browser-supplied role header (e.g. X-Actor-Role: owner) without the server secret token
    is strictly untrusted and rejected with 403.
    """
    db = TestingSessionLocal()
    draft = db.query(ActionDraft).filter(ActionDraft.status == "awaiting_approval").first()
    draft_id = draft.id
    payload_hash = draft.payload_hash
    db.close()

    # Browser attempts spoofing via X-Actor-Role: owner header alone
    res = client.post(
        f"/api/v1/action-drafts/{draft_id}/approve",
        headers={"X-Actor-Role": "owner"},
        json={"approved_by": "Owner", "expected_payload_hash": payload_hash}
    )
    assert res.status_code == 403
    assert "Browser-supplied role headers are not trusted" in res.json()["detail"]

def test_unauthorized_action_approval_rejected():
    """P0-D: An unauthenticated/viewer actor cannot approve action drafts."""
    db = TestingSessionLocal()
    draft = db.query(ActionDraft).filter(ActionDraft.status == "awaiting_approval").first()
    draft_id = draft.id
    payload_hash = draft.payload_hash
    db.close()

    res = client.post(
        f"/api/v1/action-drafts/{draft_id}/approve",
        headers={"X-Actor-Role": "viewer"},
        json={"approved_by": "Viewer", "expected_payload_hash": payload_hash}
    )
    assert res.status_code == 403
    assert "Explicit owner authorization" in res.json()["detail"]

def test_cross_workspace_isolation():
    """P0-E: Querying another workspace's document must return 404."""
    # Create another business
    db = TestingSessionLocal()
    other_biz = Business(
        name="Other Store Ltd",
        business_type="Retail",
        country="India",
        default_currency="INR",
        opening_cash_balance=Decimal("10000.00")
    )
    db.add(other_biz)
    db.commit()
    other_biz_id = other_biz.id

    inv = db.query(Document).filter(Document.document_number == "INV-2026-0042").first()
    apex_doc_id = inv.id
    db.close()

    # Attempt to access Apex's invoice from Other Store workspace
    res = client.get(
        f"/api/v1/documents/{apex_doc_id}",
        headers={"X-Workspace-Id": other_biz_id}
    )
    assert res.status_code == 404

def test_unauthorized_demo_reset_blocked():
    """P0-E: Spoofed browser headers cannot reset demo database."""
    res = client.post(
        "/api/v1/demo/reset",
        headers={"X-Actor-Role": "owner"}  # Untrusted header
    )
    assert res.status_code == 403

def test_paypal_create_order_without_credentials():
    """P0-A: Unconfigured PayPal credentials must return 503 rather than fabricating order IDs."""
    db = TestingSessionLocal()
    inv = db.query(Document).filter(Document.document_number == "INV-2026-0042").first()
    doc_id = inv.id
    db.close()

    with patch("app.services.paypal_service.PayPalService.get_access_token", new_callable=AsyncMock) as mock_tok:
        mock_tok.return_value = None
        res_order = client.post(
            "/api/v1/integrations/paypal/create-order",
            headers=OWNER_AUTH,
            json={"document_id": doc_id}
        )
        assert res_order.status_code == 503
        assert "not configured" in res_order.json()["detail"]

def test_paypal_reconcile_with_verified_capture():
    """P0-A, P0-B: Validates verified capture reconciliation flow with documented exchange policy."""
    db = TestingSessionLocal()
    inv = db.query(Document).filter(Document.document_number == "INV-2026-0042").first()
    doc_id = inv.id
    db.close()

    order_id = "5C872134L4902131A"
    mock_capture_payload = {
        "status": "COMPLETED",
        "purchase_units": [
            {
                "custom_id": "INV-2026-0042",
                "reference_id": doc_id,
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
    mock_resp = AsyncMock()
    mock_resp.status_code = 201
    mock_resp.json = lambda: mock_capture_payload

    with patch("app.services.paypal_service.PayPalService.get_access_token", new_callable=AsyncMock) as mock_tok:
        mock_tok.return_value = "fake_access_token"
        with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_resp

            res = client.post(
                "/api/v1/integrations/paypal/capture-order",
                headers=OWNER_AUTH,
                json={"document_id": doc_id, "order_id": order_id}
            )
            assert res.status_code == 200
            data = res.json()
            assert data["reconciled"] is True
            assert float(data["outstanding_amount"]) == 0.0

def test_invalid_webhook_signature_rejected():
    """P0-C: Webhook without valid signature headers must be rejected with 400."""
    res = client.post(
        "/api/v1/webhooks/paypal",
        json={"id": "WH-TEST-001", "event_type": "PAYMENT.CAPTURE.COMPLETED"}
    )
    assert res.status_code == 400
    assert "signature headers" in res.json()["detail"]

def test_webhook_unconfigured_webhook_id_returns_503():
    """PayPal webhook received when PAYPAL_WEBHOOK_ID is empty must return 503."""
    headers = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
        "paypal-transmission-id": "trans-123",
        "paypal-transmission-sig": "sig-abc",
        "paypal-transmission-time": "2026-10-19T05:00:00Z"
    }
    with patch("app.config.settings.PAYPAL_WEBHOOK_ID", ""):
        res = client.post(
            "/api/v1/webhooks/paypal",
            headers=headers,
            json={"id": "WH-TEST-002", "event_type": "PAYMENT.CAPTURE.COMPLETED"}
        )
        assert res.status_code == 503
        assert "PAYPAL_WEBHOOK_ID is not configured" in res.json()["detail"]

def test_webhook_cryptographic_verification_failure_rejected():
    """Webhook with signature that fails PayPal verify-webhook-signature check must be rejected with 400."""
    headers = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
        "paypal-transmission-id": "trans-123",
        "paypal-transmission-sig": "invalid-signature",
        "paypal-transmission-time": "2026-10-19T05:00:00Z"
    }
    mock_verify_res = AsyncMock()
    mock_verify_res.status_code = 200
    mock_verify_res.json = lambda: {"verification_status": "FAILURE"}

    with patch("app.config.settings.PAYPAL_WEBHOOK_ID", "WH-SANDBOX-TEST-ID"):
        with patch("app.services.paypal_service.PayPalService.get_access_token", new_callable=AsyncMock) as mock_tok:
            mock_tok.return_value = "fake_token"
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_verify_res
                res = client.post(
                    "/api/v1/webhooks/paypal",
                    headers=headers,
                    json={"id": "WH-TEST-003", "event_type": "PAYMENT.CAPTURE.COMPLETED"}
                )
                assert res.status_code == 400
                assert "Invalid PayPal webhook signature" in res.json()["detail"]

def test_webhook_duplicate_event_delivery_is_idempotent():
    """Subsequent delivery of same event ID must return duplicate status without duplicate processing."""
    from app.models import WebhookEvent
    db = TestingSessionLocal()
    existing_wh = WebhookEvent(
        provider="paypal",
        event_id="WH-TEST-DUP-001",
        event_type="PAYMENT.CAPTURE.COMPLETED",
        verification_status="verified",
        processing_status="processed",
        payload_subset="{}"
    )
    db.add(existing_wh)
    db.commit()
    db.close()

    res = client.post(
        "/api/v1/webhooks/paypal",
        json={"id": "WH-TEST-DUP-001", "event_type": "PAYMENT.CAPTURE.COMPLETED"}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "duplicate"
    assert data["event_id"] == "WH-TEST-DUP-001"

def test_webhook_unsupported_or_denied_event_does_not_mark_invoice_paid():
    """Non-settlement events (e.g. PAYMENT.CAPTURE.DENIED) must be recorded but not settle any invoice."""
    headers = {
        "paypal-auth-algo": "SHA256withRSA",
        "paypal-cert-url": "https://api.sandbox.paypal.com/cert",
        "paypal-transmission-id": "trans-123",
        "paypal-transmission-sig": "valid-sig",
        "paypal-transmission-time": "2026-10-19T05:00:00Z"
    }
    mock_verify_res = AsyncMock()
    mock_verify_res.status_code = 200
    mock_verify_res.json = lambda: {"verification_status": "SUCCESS"}

    with patch("app.config.settings.PAYPAL_WEBHOOK_ID", "WH-SANDBOX-TEST-ID"):
        with patch("app.services.paypal_service.PayPalService.get_access_token", new_callable=AsyncMock) as mock_tok:
            mock_tok.return_value = "fake_token"
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_verify_res
                with patch("app.services.paypal_service.PayPalService.capture_and_reconcile_order", new_callable=AsyncMock) as mock_rec:
                    res = client.post(
                        "/api/v1/webhooks/paypal",
                        headers=headers,
                        json={
                            "id": "WH-TEST-DENIED-001",
                            "event_type": "PAYMENT.CAPTURE.DENIED",
                            "resource": {"id": "ORD-123"}
                        }
                    )
                    assert res.status_code == 200
                    assert res.json()["status"] == "success"
                    # capture_and_reconcile_order MUST NOT be called
                    mock_rec.assert_not_called()
