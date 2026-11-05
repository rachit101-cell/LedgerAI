from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Business, Document, Transaction, PaymentAllocation, AuditEvent, Contact
from ..schemas import PaymentCreate, TransactionRead
from ..services.financial import get_document_balances
from ..auth import WorkspaceContext, get_workspace_context, require_owner_role

router = APIRouter(prefix="/api/v1/payments", tags=["Payments & Ledger"])

@router.get("", response_model=List[TransactionRead])
def list_payments(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    txs = (
        db.query(Transaction)
        .filter(Transaction.business_id == ctx.business.id)
        .order_by(Transaction.transaction_date.desc())
        .all()
    )
    return txs

@router.post("", response_model=TransactionRead)
def record_payment(
    payment_in: PaymentCreate,
    ctx: WorkspaceContext = Depends(require_owner_role),
    db: Session = Depends(get_db)
):
    if payment_in.amount <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero.")

    doc = None
    contact_id = payment_in.contact_id
    if payment_in.document_id:
        doc = (
            db.query(Document)
            .filter(Document.id == payment_in.document_id, Document.business_id == ctx.business.id)
            .first()
        )
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found in active workspace.")
        contact_id = doc.contact_id
        
        # Verify currency matches
        if payment_in.currency != doc.currency:
            raise HTTPException(status_code=400, detail=f"Currency mismatch. Invoice is in {doc.currency}.")

        # Check over-allocation
        balances = get_document_balances(db, doc)
        if payment_in.amount > balances["outstanding_amount"]:
            raise HTTPException(
                status_code=400,
                detail=f"Payment amount ({doc.currency} {payment_in.amount}) exceeds outstanding balance ({doc.currency} {balances['outstanding_amount']})."
            )
    elif contact_id:
        contact = (
            db.query(Contact)
            .filter(Contact.id == contact_id, Contact.business_id == ctx.business.id)
            .first()
        )
        if not contact:
            raise HTTPException(status_code=404, detail="Contact not found in active workspace.")

    tx_type = "inflow"
    if doc and doc.document_type == "bill":
        tx_type = "outflow"

    # Business Validation: Prevent paying out more cash than available in the bank
    if tx_type == "outflow":
        from ..services.financial import get_financial_summary
        summary = get_financial_summary(db, ctx.business.id)
        current_cash = summary.recorded_cash_balance
        if payment_in.amount > current_cash:
            supplier_label = doc.contact.name if (doc and doc.contact) else "supplier"
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Insufficient bank balance: Available cash is {doc.currency if doc else 'INR'} {current_cash:,.2f}, "
                    f"which is not enough to pay {doc.currency if doc else 'INR'} {payment_in.amount:,.2f} to {supplier_label}. "
                    f"Bridge the cash deficit first by collecting customer receivables!"
                )
            )

    tx = Transaction(
        business_id=ctx.business.id,
        transaction_type=tx_type,
        amount=payment_in.amount,
        currency=payment_in.currency,
        transaction_date=payment_in.transaction_date or datetime.now(timezone.utc),
        payment_method=payment_in.payment_method,
        status="verified",
        reference=payment_in.reference or f"MANUAL-{int(datetime.now().timestamp())}",
        provider="manual",
        contact_id=contact_id,
        description=payment_in.description or (f"Payment for {doc.document_number}" if doc else "Manual payment entry")
    )
    db.add(tx)
    db.flush()

    if doc:
        alloc = PaymentAllocation(
            transaction_id=tx.id,
            document_id=doc.id,
            allocated_amount=payment_in.amount
        )
        db.add(alloc)

        # Update doc status
        new_balances = get_document_balances(db, doc)
        if new_balances["outstanding_amount"] <= Decimal("0.00"):
            doc.status = "paid"
        else:
            doc.status = "partially_paid"

    audit = AuditEvent(
        business_id=ctx.business.id,
        actor=ctx.actor,
        action="record_payment",
        entity_type="transaction",
        entity_id=tx.id,
        reason=f"Recorded payment of {tx.currency} {tx.amount} via {tx.payment_method}."
    )
    db.add(audit)
    db.commit()
    db.refresh(tx)
    return tx
