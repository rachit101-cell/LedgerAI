from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Document, ProviderInvoice
from ..schemas import (
    PayPalCreateOrderRequest, PayPalCreateOrderResponse,
    PayPalCaptureOrderRequest, PayPalReconcileResponse
)
from ..services.paypal_service import PayPalService
from ..auth import WorkspaceContext, get_workspace_context, require_owner_role

router = APIRouter(prefix="/api/v1", tags=["PayPal Sandbox Integration"])

@router.post("/integrations/paypal/create-order", response_model=PayPalCreateOrderResponse)
async def create_paypal_order(
    req: PayPalCreateOrderRequest,
    request: Request,
    ctx: WorkspaceContext = Depends(require_owner_role),
    db: Session = Depends(get_db)
):
    doc = (
        db.query(Document)
        .filter(Document.id == req.document_id, Document.business_id == ctx.business.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found in active workspace.")

    origin = request.headers.get("origin") or request.headers.get("referer")
    res = await PayPalService.create_order_for_document(db, doc, frontend_url=origin)
    return PayPalCreateOrderResponse(**res)

@router.post("/integrations/paypal/capture-order", response_model=PayPalReconcileResponse)
async def capture_paypal_order(
    req: PayPalCaptureOrderRequest,
    ctx: WorkspaceContext = Depends(require_owner_role),
    db: Session = Depends(get_db)
):
    target_doc_id = req.document_id
    if not target_doc_id:
        prov_inv = db.query(ProviderInvoice).filter(ProviderInvoice.external_order_id == req.order_id).first()
        if prov_inv:
            target_doc_id = prov_inv.document_id

    doc = None
    if target_doc_id:
        doc = (
            db.query(Document)
            .filter(Document.id == target_doc_id, Document.business_id == ctx.business.id)
            .first()
        )
    if not doc:
        # Fallback: find by ProviderInvoice linked to order_id
        prov_inv = db.query(ProviderInvoice).filter(ProviderInvoice.external_order_id == req.order_id).first()
        if prov_inv:
            doc = db.query(Document).filter(Document.id == prov_inv.document_id, Document.business_id == ctx.business.id).first()
            if doc:
                target_doc_id = doc.id

    if not doc:
        raise HTTPException(status_code=404, detail="Invoice document for this PayPal order not found in active workspace.")

    res = await PayPalService.capture_and_reconcile_order(
        db=db,
        document_id=target_doc_id,
        order_id=req.order_id
    )
    if not res.get("reconciled"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return PayPalReconcileResponse(**res)

@router.post("/integrations/paypal/reconcile/{document_id}", response_model=PayPalReconcileResponse)
async def reconcile_document(
    document_id: str,
    ctx: WorkspaceContext = Depends(require_owner_role),
    db: Session = Depends(get_db)
):
    doc = (
        db.query(Document)
        .filter(Document.id == document_id, Document.business_id == ctx.business.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found in active workspace.")

    # Find registered provider invoice
    provider_inv = (
        db.query(ProviderInvoice)
        .filter(ProviderInvoice.document_id == doc.id)
        .order_by(ProviderInvoice.created_at.desc())
        .first()
    )
    if not provider_inv or not provider_inv.external_order_id:
        raise HTTPException(
            status_code=400,
            detail=f"No active PayPal Sandbox order exists for invoice {doc.document_number}. Initiate checkout before reconciling."
        )

    order_id = provider_inv.external_order_id

    res = await PayPalService.capture_and_reconcile_order(
        db=db,
        document_id=doc.id,
        order_id=order_id
    )
    if not res.get("reconciled"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return PayPalReconcileResponse(**res)

@router.post("/webhooks/paypal")
async def paypal_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Idempotent PayPal Webhook endpoint with genuine cryptographic signature verification.
    """
    body = await request.body()
    headers = dict(request.headers)
    res = await PayPalService.verify_and_process_webhook(db, headers, body)
    return res
