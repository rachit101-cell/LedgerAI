import json
import logging
from decimal import Decimal
from typing import Dict, Any, Optional
import httpx
from sqlalchemy.orm import Session
from fastapi import HTTPException
from ..config import settings
from ..models import Document, Transaction, PaymentAllocation, ProviderInvoice, WebhookEvent, AuditEvent
from .financial import get_document_balances

logger = logging.getLogger("paypal_service")

class PayPalService:
    @classmethod
    def get_exchange_rate(cls) -> Decimal:
        """Documented deterministic INR/USD exchange rate policy for PayPal Sandbox."""
        return Decimal(str(settings.PAYPAL_EXCHANGE_RATE_INR_PER_USD))

    @classmethod
    async def get_access_token(cls) -> Optional[str]:
        """Obtains genuine OAuth2 Bearer Token from PayPal Sandbox using server-side credentials."""
        if not settings.PAYPAL_CLIENT_ID or not settings.PAYPAL_CLIENT_SECRET:
            logger.warning("PayPal Sandbox credentials not configured (PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET missing).")
            return None
            
        url = f"{settings.paypal_api_base}/v1/oauth2/token"
        headers = {
            "Accept": "application/json",
            "Accept-Language": "en_US",
        }
        data = {"grant_type": "client_credentials"}
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    url,
                    auth=(settings.PAYPAL_CLIENT_ID, settings.PAYPAL_CLIENT_SECRET),
                    headers=headers,
                    data=data
                )
                if res.status_code == 200:
                    return res.json().get("access_token")
                logger.error(f"PayPal OAuth failed with status {res.status_code}: {res.text}")
                return None
        except Exception as e:
            logger.error(f"PayPal connection error during OAuth: {str(e)}")
            return None

    @classmethod
    async def create_order_for_document(cls, db: Session, document: Document) -> Dict[str, Any]:
        """
        Creates a genuine PayPal checkout order in the Sandbox for an internal invoice.
        Requires valid server-side credentials. Never simulates order creation.
        """
        balances = get_document_balances(db, document)
        amount_to_pay = balances["outstanding_amount"]
        if amount_to_pay <= Decimal("0.00"):
            raise HTTPException(
                status_code=400,
                detail=f"Invoice {document.document_number} has zero outstanding balance and cannot be paid."
            )

        # If an owner-approved early-payment discount applies, use the net discounted settlement amount
        from ..models import ActionDraft
        approved_discount = (
            db.query(ActionDraft)
            .filter(
                ActionDraft.document_id == document.id,
                ActionDraft.action_type == "early_payment_discount_offer",
                ActionDraft.status == "approved"
            )
            .order_by(ActionDraft.created_at.desc())
            .first()
        )
        if approved_discount and approved_discount.payload_json:
            try:
                p_dict = json.loads(approved_discount.payload_json)
                if "net_amount" in p_dict and p_dict["net_amount"] is not None:
                    disc_net = Decimal(str(p_dict["net_amount"]))
                    if Decimal("0.00") < disc_net < amount_to_pay:
                        amount_to_pay = disc_net
            except Exception as e:
                logger.warning(f"Error checking discount draft for PayPal order: {e}")

        token = await cls.get_access_token()
        if not token:
            raise HTTPException(
                status_code=503,
                detail="PayPal Sandbox credentials (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET) are not configured or invalid on the server. Genuine sandbox payment cannot be initialized."
            )

        # Currency and exchange policy handling per P0-B:
        # PayPal Sandbox supports standard currencies (USD, EUR, GBP, CAD, AUD, etc.).
        # If invoice is INR, convert to USD using documented policy:
        rate = cls.get_exchange_rate()
        if document.currency == "INR":
            paypal_currency = "USD"
            paypal_amount = (amount_to_pay / rate).quantize(Decimal("0.01"))
            if paypal_amount < Decimal("1.00"):
                paypal_amount = Decimal("1.00")
        else:
            paypal_currency = document.currency
            paypal_amount = amount_to_pay

        url = f"{settings.paypal_api_base}/v2/checkout/orders"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }
        payload = {
            "intent": "CAPTURE",
            "purchase_units": [
                {
                    "reference_id": document.id,
                    "custom_id": document.document_number,
                    "description": f"Payment for Invoice {document.document_number}",
                    "amount": {
                        "currency_code": paypal_currency,
                        "value": f"{paypal_amount:.2f}"
                    }
                }
            ],
            "application_context": {
                "brand_name": "Apex Enterprises",
                "landing_page": "BILLING",
                "user_action": "PAY_NOW",
                "return_url": f"http://localhost:3000/?tab=invoices&paypal_success=true&doc_id={document.id}",
                "cancel_url": f"http://localhost:3000/?tab=invoices&paypal_cancel=true&doc_id={document.id}"
            }
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code not in [200, 201]:
                    logger.error(f"PayPal create order returned {res.status_code}: {res.text}")
                    raise HTTPException(
                        status_code=502,
                        detail=f"PayPal Sandbox API rejected order creation: {res.status_code} - {res.text}"
                    )
                data = res.json()
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error calling PayPal create order API: {e}")
            raise HTTPException(
                status_code=502,
                detail=f"Network error communicating with PayPal Sandbox: {str(e)}"
            )

        order_id = data.get("id")
        approval_url = None
        for link in data.get("links", []):
            if link.get("rel") in ["approve", "payer-action"]:
                approval_url = link.get("href")
                break

        if not order_id or not approval_url:
            raise HTTPException(
                status_code=502,
                detail="PayPal Sandbox response did not return a valid order ID or approval URL."
            )

        # Persist or update ProviderInvoice reference
        provider_inv = (
            db.query(ProviderInvoice)
            .filter(ProviderInvoice.document_id == document.id)
            .first()
        )
        if not provider_inv:
            provider_inv = ProviderInvoice(
                document_id=document.id,
                provider="paypal",
                environment=settings.PAYPAL_MODE,
                external_order_id=order_id,
                approval_url=approval_url,
                status="created"
            )
            db.add(provider_inv)
        else:
            provider_inv.external_order_id = order_id
            provider_inv.approval_url = approval_url
            provider_inv.status = "created"
        
        # Update associated decision case status to outcome_pending_verification
        try:
            from ..models import DecisionCase
            dec_case = (
                db.query(DecisionCase)
                .filter(
                    DecisionCase.business_id == document.business_id,
                    DecisionCase.target_document_id == document.id
                )
                .first()
            )
            if dec_case:
                dec_case.status = "outcome_pending_verification"
                dec_case.executed_at = utc_now()
                dec_case.updated_at = utc_now()
        except Exception as e:
            logger.warning(f"Error updating decision case execution status: {e}")

        db.commit()
        db.refresh(provider_inv)

        return {
            "order_id": order_id,
            "approval_url": approval_url,
            "status": "created",
            "environment": settings.PAYPAL_MODE,
            "document_id": document.id,
            "amount": amount_to_pay,
            "currency": document.currency,
            "paypal_amount": paypal_amount,
            "paypal_currency": paypal_currency,
            "exchange_rate": str(rate)
        }

    @classmethod
    async def capture_and_reconcile_order(
        cls, db: Session, document_id: str, order_id: str
    ) -> Dict[str, Any]:
        """
        Server-side capture & idempotent reconciliation with strict verification.
        Per Invariant #5 & P0-A:
        - Never mark an invoice paid merely because browser returns from checkout.
        - Verify order state directly with PayPal Sandbox server-side.
        - Reject fake, fabricated, or unapproved order IDs.
        - Verify captured currency, amount, and invoice reference.
        - Credit ledger idempotently; repeated calls cannot duplicate payments.
        """
        document = db.query(Document).filter(Document.id == document_id).first() if document_id else None
        if not document:
            prov_inv = db.query(ProviderInvoice).filter(ProviderInvoice.external_order_id == order_id).first()
            if prov_inv:
                document = db.query(Document).filter(Document.id == prov_inv.document_id).first()
        if not document:
            return {"reconciled": False, "status": "not_found", "message": "Invoice document not found in ledger."}

        # 1. Idempotency Check: Was this PayPal order already recorded in the ledger?
        existing_tx = (
            db.query(Transaction)
            .filter(Transaction.provider_payment_id == order_id)
            .first()
        )
        if existing_tx:
            balances = get_document_balances(db, document)
            return {
                "reconciled": True,
                "status": "already_reconciled",
                "document_id": document.id,
                "paid_amount": balances["paid_amount"],
                "outstanding_amount": balances["outstanding_amount"],
                "transaction_id": existing_tx.id,
                "message": "Payment has already been reconciled idempotently. No duplicate payment created."
            }

        # 2. Reject fabricated order IDs
        if not order_id or order_id.startswith("SANDBOX-ORD-") or order_id.startswith("FAKE-") or order_id.startswith("MOCK-"):
            return {
                "reconciled": False,
                "status": "invalid_order_id",
                "message": f"Security rejection: Order ID '{order_id}' is a fabricated or mock reference. Real PayPal Sandbox order required."
            }

        # 3. Require valid server-side token
        token = await cls.get_access_token()
        if not token:
            return {
                "reconciled": False,
                "status": "credentials_missing",
                "message": "PayPal credentials not configured on server. Cannot verify payment status with PayPal Sandbox. Ledger unchanged."
            }

        # 4. Query & Capture Order via PayPal Orders v2 API
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }

        captured_currency = None
        captured_amount = None
        order_custom_id = None
        order_ref_id = None
        capture_id = None

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                # First attempt capture
                capture_url = f"{settings.paypal_api_base}/v2/checkout/orders/{order_id}/capture"
                res = await client.post(capture_url, headers=headers)
                
                if res.status_code in [200, 201]:
                    cdata = res.json()
                    status = cdata.get("status")
                    if status != "COMPLETED":
                        return {
                            "reconciled": False,
                            "status": "unconfirmed",
                            "message": f"PayPal capture returned status '{status}'. Only COMPLETED payments can be reconciled."
                        }
                    pu = cdata["purchase_units"][0]
                    cap = pu["payments"]["captures"][0]
                    capture_id = cap.get("id")
                    captured_currency = cap["amount"]["currency_code"]
                    captured_amount = Decimal(cap["amount"]["value"])
                    order_custom_id = pu.get("custom_id")
                    order_ref_id = pu.get("reference_id")

                elif res.status_code == 422:
                    # 422 Unprocessable Entity can occur if already captured or not yet approved
                    get_url = f"{settings.paypal_api_base}/v2/checkout/orders/{order_id}"
                    res_get = await client.get(get_url, headers=headers)
                    if res_get.status_code != 200:
                        return {
                            "reconciled": False,
                            "status": "verification_failed",
                            "message": f"PayPal status check failed: HTTP {res_get.status_code} - {res_get.text}"
                        }
                    odata = res_get.json()
                    ostatus = odata.get("status")
                    
                    if ostatus in ["CREATED", "SAVED"]:
                        return {
                            "reconciled": False,
                            "status": "not_approved",
                            "message": "PayPal Sandbox order has not been approved by the buyer yet. Please log into PayPal Sandbox and complete checkout before reconciling."
                        }
                    elif ostatus in ["VOIDED", "EXPIRED"]:
                        return {
                            "reconciled": False,
                            "status": "order_expired",
                            "message": f"PayPal order status is '{ostatus}'. Payment was not completed."
                        }
                    elif ostatus == "COMPLETED":
                        # Already captured by webhook or prior call, inspect captured unit
                        pu = odata["purchase_units"][0]
                        captures = pu.get("payments", {}).get("captures", [])
                        if not captures:
                            return {
                                "reconciled": False,
                                "status": "no_capture",
                                "message": "PayPal order is COMPLETED but no capture record was found."
                            }
                        cap = captures[0]
                        capture_id = cap.get("id")
                        captured_currency = cap["amount"]["currency_code"]
                        captured_amount = Decimal(cap["amount"]["value"])
                        order_custom_id = pu.get("custom_id")
                        order_ref_id = pu.get("reference_id")
                    elif ostatus == "APPROVED":
                        # Approved but capture hasn't happened. Re-attempt capture
                        res_recap = await client.post(capture_url, headers=headers)
                        if res_recap.status_code not in [200, 201]:
                            return {
                                "reconciled": False,
                                "status": "capture_failed",
                                "message": f"PayPal capture rejected: {res_recap.text}"
                            }
                        cdata = res_recap.json()
                        pu = cdata["purchase_units"][0]
                        cap = pu["payments"]["captures"][0]
                        capture_id = cap.get("id")
                        captured_currency = cap["amount"]["currency_code"]
                        captured_amount = Decimal(cap["amount"]["value"])
                        order_custom_id = pu.get("custom_id")
                        order_ref_id = pu.get("reference_id")
                    else:
                        return {
                            "reconciled": False,
                            "status": "unconfirmed",
                            "message": f"PayPal order status is '{ostatus}'. Cannot reconcile until completed."
                        }
                else:
                    return {
                        "reconciled": False,
                        "status": "provider_error",
                        "message": f"PayPal API returned HTTP {res.status_code}: {res.text}"
                    }
        except Exception as e:
            logger.error(f"Exception during PayPal capture verification: {e}")
            return {
                "reconciled": False,
                "status": "connection_error",
                "message": f"Could not connect to PayPal Sandbox: {str(e)}"
            }

        # 5. Associated Invoice Verification (Custom ID / Reference ID match)
        if order_custom_id and order_custom_id != document.document_number and order_ref_id and order_ref_id != document.id:
            return {
                "reconciled": False,
                "status": "mismatched_invoice",
                "message": f"Payment verification error: Order custom_id '{order_custom_id}' does not match invoice '{document.document_number}'."
            }

        # 6. Currency & Amount Verification per P0-B
        balances = get_document_balances(db, document)
        outstanding = balances["outstanding_amount"]
        rate = cls.get_exchange_rate()

        # Check if an approved early-payment discount applies to expected payable
        from ..models import ActionDraft
        approved_discount = (
            db.query(ActionDraft)
            .filter(
                ActionDraft.document_id == document.id,
                ActionDraft.action_type == "early_payment_discount_offer",
                ActionDraft.status == "approved"
            )
            .order_by(ActionDraft.created_at.desc())
            .first()
        )
        effective_payable = outstanding
        if approved_discount and approved_discount.payload_json:
            try:
                p_dict = json.loads(approved_discount.payload_json)
                if "net_amount" in p_dict and p_dict["net_amount"] is not None:
                    disc_net = Decimal(str(p_dict["net_amount"]))
                    if Decimal("0.00") < disc_net < outstanding:
                        effective_payable = disc_net
            except Exception as e:
                logger.warning(f"Error checking discount draft in capture: {e}")

        if document.currency == "INR":
            expected_usd = (effective_payable / rate).quantize(Decimal("0.01"))
            if captured_currency != "USD":
                return {
                    "reconciled": False,
                    "status": "currency_mismatch",
                    "message": f"Currency mismatch: Captured currency is {captured_currency}, expected USD for INR invoice under exchange policy."
                }
            # Allow minor rounding difference of up to $0.05
            if abs(captured_amount - expected_usd) > Decimal("0.05") and captured_amount < expected_usd:
                return {
                    "reconciled": False,
                    "status": "amount_mismatch",
                    "message": f"Amount mismatch: Captured {captured_currency} {captured_amount}, expected {expected_usd}."
                }
            # Under documented exchange policy, capturing the full expected USD order settles the outstanding balance
            if abs(captured_amount - expected_usd) <= Decimal("0.05") or captured_amount >= expected_usd:
                credited_inr = outstanding
            else:
                credited_inr = min(outstanding, (captured_amount * rate).quantize(Decimal("0.01")))
            ledger_amount = credited_inr
            ledger_currency = "INR"
            audit_metadata = {
                "order_id": order_id,
                "capture_id": capture_id,
                "captured_amount": str(captured_amount),
                "captured_currency": captured_currency,
                "exchange_rate": str(rate),
                "credited_amount": str(credited_inr),
                "credited_currency": "INR",
                "invoice_number": document.document_number
            }
        else:
            if captured_currency != document.currency:
                return {
                    "reconciled": False,
                    "status": "currency_mismatch",
                    "message": f"Currency mismatch: Captured {captured_currency}, expected {document.currency}."
                }
            if captured_amount < outstanding:
                return {
                    "reconciled": False,
                    "status": "amount_mismatch",
                    "message": f"Amount mismatch: Captured {captured_currency} {captured_amount} is less than outstanding {outstanding}."
                }
            ledger_amount = min(outstanding, captured_amount)
            ledger_currency = document.currency
            audit_metadata = {
                "order_id": order_id,
                "capture_id": capture_id,
                "captured_amount": str(captured_amount),
                "captured_currency": captured_currency,
                "credited_amount": str(ledger_amount),
                "credited_currency": ledger_currency,
                "invoice_number": document.document_number
            }

        # 7. ACID Database Mutation
        # Double check idempotency inside transaction
        double_check = (
            db.query(Transaction)
            .filter(Transaction.provider_payment_id == order_id)
            .first()
        )
        if double_check:
            db.rollback()
            return {
                "reconciled": True,
                "status": "already_reconciled",
                "document_id": document.id,
                "paid_amount": balances["paid_amount"],
                "outstanding_amount": balances["outstanding_amount"],
                "transaction_id": double_check.id,
                "message": "Payment has already been reconciled idempotently."
            }

        tx = Transaction(
            business_id=document.business_id,
            transaction_type="inflow",
            amount=ledger_amount,
            currency=ledger_currency,
            payment_method="paypal",
            status="reconciled",
            reference=f"PayPal Sandbox Order {order_id}",
            provider="paypal",
            provider_payment_id=order_id,
            contact_id=document.contact_id,
            description=f"Verified PayPal Sandbox payment for invoice {document.document_number} (Capture ID: {capture_id})"
        )
        db.add(tx)
        db.flush()

        alloc = PaymentAllocation(
            transaction_id=tx.id,
            document_id=document.id,
            allocated_amount=ledger_amount
        )
        db.add(alloc)
        db.flush()

        updated_balances = get_document_balances(db, document)
        if updated_balances["outstanding_amount"] <= Decimal("0.00"):
            document.status = "paid"
        else:
            document.status = "partially_paid"

        provider_inv = (
            db.query(ProviderInvoice)
            .filter(ProviderInvoice.document_id == document.id)
            .first()
        )
        if provider_inv:
            provider_inv.status = "reconciled"

        audit = AuditEvent(
            business_id=document.business_id,
            actor="owner",
            action="reconcile_paypal_payment",
            entity_type="document",
            entity_id=document.id,
            reason="Verified PayPal Sandbox payment receipt server-side and updated ledger idempotently.",
            safe_metadata=json.dumps(audit_metadata)
        )
        db.add(audit)

        # Decision Outcome Ledger: Authoritative verification hook
        try:
            from .decision_service import DecisionService
            DecisionService.sync_decision_outcome(
                db=db,
                business_id=document.business_id,
                document_id=document.id,
                verified_amount=ledger_amount,
                authoritative_source="paypal_sandbox_capture",
                reference_id=f"PayPal Order {order_id}"
            )
        except Exception as e:
            logger.warning(f"Error syncing decision outcome: {e}")

        db.commit()
        db.refresh(document)

        return {
            "reconciled": True,
            "status": "success",
            "document_id": document.id,
            "paid_amount": updated_balances["paid_amount"],
            "outstanding_amount": updated_balances["outstanding_amount"],
            "transaction_id": tx.id,
            "message": f"Successfully verified PayPal Sandbox payment of {captured_currency} {captured_amount:,.2f} ({ledger_currency} {ledger_amount:,.2f}) and reconciled ledger."
        }

    @classmethod
    async def verify_and_process_webhook(
        cls, db: Session, headers: Dict[str, str], body_bytes: bytes
    ) -> Dict[str, Any]:
        """
        Implements real PayPal Webhook signature verification via POST /v1/notifications/verify-webhook-signature.
        Rejects invalid signatures, malformed payloads, and unverified events.
        Processes verified events idempotently.
        """
        try:
            payload = json.loads(body_bytes.decode("utf-8"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON in webhook payload.")

        event_id = payload.get("id")
        event_type = payload.get("event_type")

        if not event_id:
            raise HTTPException(status_code=400, detail="Missing event id in webhook payload.")

        # Idempotency: Check WebhookEvent table
        existing = db.query(WebhookEvent).filter(WebhookEvent.event_id == event_id).first()
        if existing:
            return {
                "status": "duplicate",
                "event_id": event_id,
                "message": "Event has already been processed idempotently."
            }

        # Normalize header keys to lowercase
        h_lower = {k.lower(): v for k, v in headers.items()}
        auth_algo = h_lower.get("paypal-auth-algo")
        cert_url = h_lower.get("paypal-cert-url")
        trans_id = h_lower.get("paypal-transmission-id")
        trans_sig = h_lower.get("paypal-transmission-sig")
        trans_time = h_lower.get("paypal-transmission-time")

        if not all([auth_algo, cert_url, trans_id, trans_sig, trans_time]):
            # Missing cryptographic signature headers
            wh_failed = WebhookEvent(
                provider="paypal",
                event_id=event_id,
                event_type=event_type or "UNKNOWN",
                verification_status="failed",
                processing_status="rejected",
                payload_subset=json.dumps({"reason": "Missing required PayPal signature headers"})
            )
            db.add(wh_failed)
            db.commit()
            raise HTTPException(status_code=400, detail="Missing required PayPal webhook signature headers.")

        if not settings.PAYPAL_WEBHOOK_ID:
            raise HTTPException(
                status_code=503,
                detail="Server cannot verify webhook: PAYPAL_WEBHOOK_ID is not configured in environment."
            )

        token = await cls.get_access_token()
        if not token:
            raise HTTPException(status_code=503, detail="Server cannot verify webhook: PayPal credentials unconfigured.")

        # Verify signature with PayPal API
        verify_url = f"{settings.paypal_api_base}/v1/notifications/verify-webhook-signature"
        verify_headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }
        verify_payload = {
            "auth_algo": auth_algo,
            "cert_url": cert_url,
            "transmission_id": trans_id,
            "transmission_sig": trans_sig,
            "transmission_time": trans_time,
            "webhook_id": settings.PAYPAL_WEBHOOK_ID,
            "webhook_event": payload
        }

        verified = False
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                v_res = await client.post(verify_url, headers=verify_headers, json=verify_payload)
                if v_res.status_code == 200:
                    v_data = v_res.json()
                    if v_data.get("verification_status") == "SUCCESS":
                        verified = True
                else:
                    logger.warning(f"PayPal webhook verify API returned {v_res.status_code}: {v_res.text}")
        except Exception as e:
            logger.error(f"Error calling PayPal webhook signature verification: {e}")

        if not verified:
            wh_failed = WebhookEvent(
                provider="paypal",
                event_id=event_id,
                event_type=event_type or "UNKNOWN",
                verification_status="failed",
                processing_status="rejected",
                payload_subset=json.dumps({"reason": "PayPal signature verification returned FAILURE"})
            )
            db.add(wh_failed)
            db.commit()
            raise HTTPException(status_code=400, detail="Invalid PayPal webhook signature.")

        # If verified, record WebhookEvent
        wh_record = WebhookEvent(
            provider="paypal",
            event_id=event_id,
            event_type=event_type or "UNKNOWN",
            verification_status="verified",
            processing_status="processed",
            payload_subset=json.dumps({"summary": payload.get("summary")})
        )
        db.add(wh_record)
        db.commit()

        # Handle matched reconciliation strictly for supported payment settlement events
        SUPPORTED_RECONCILIATION_EVENTS = [
            "PAYMENT.CAPTURE.COMPLETED",
            "CHECKOUT.ORDER.APPROVED",
        ]

        resource = payload.get("resource", {})
        custom_id = resource.get("custom_id")

        # In PayPal Orders v2 webhooks:
        # For PAYMENT.CAPTURE.COMPLETED: resource.id is Capture ID; Order ID is in supplementary_data.related_ids.order_id
        # For CHECKOUT.ORDER.APPROVED: resource.id is Order ID
        if event_type == "PAYMENT.CAPTURE.COMPLETED":
            order_id = (
                resource.get("supplementary_data", {}).get("related_ids", {}).get("order_id")
                or resource.get("id")
            )
        else:
            order_id = resource.get("id")

        if event_type in SUPPORTED_RECONCILIATION_EVENTS:
            prov_inv = None
            if order_id:
                prov_inv = db.query(ProviderInvoice).filter(ProviderInvoice.external_order_id == order_id).first()
            if not prov_inv and custom_id:
                # Fallback match by document number in custom_id
                doc = db.query(Document).filter(Document.document_number == custom_id).first()
                if doc:
                    prov_inv = (
                        db.query(ProviderInvoice)
                        .filter(ProviderInvoice.document_id == doc.id)
                        .order_by(ProviderInvoice.created_at.desc())
                        .first()
                    )

            if prov_inv:
                target_order_id = prov_inv.external_order_id
                await cls.capture_and_reconcile_order(db, prov_inv.document_id, target_order_id)
            elif order_id:
                wh_record.processing_status = "unmatched_order"
                db.commit()
            else:
                wh_record.processing_status = "missing_order_id"
                db.commit()
        else:
            wh_record.processing_status = f"ignored_{event_type.lower()}"
            db.commit()

        return {"status": "success", "event_id": event_id, "verified": True}
