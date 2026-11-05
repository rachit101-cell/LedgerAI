from datetime import datetime, timezone
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Business, Document, DocumentItem, AuditEvent, Contact
from ..schemas import DocumentCreate, DocumentRead, DocumentItemRead
from ..services.financial import calculate_invoice_totals, get_document_balances
from ..auth import WorkspaceContext, get_workspace_context, require_owner_role

router = APIRouter(prefix="/api/v1/documents", tags=["Invoices & Bills"])

def build_document_read(db: Session, doc: Document) -> DocumentRead:
    balances = get_document_balances(db, doc)
    items = [
        DocumentItemRead(
            id=i.id,
            product_id=i.product_id,
            description=i.description,
            quantity=Decimal(str(i.quantity)),
            unit_price=Decimal(str(i.unit_price)),
            discount=Decimal(str(i.discount)),
            tax=Decimal(str(i.tax)),
            line_total=Decimal(str(i.line_total))
        )
        for i in doc.items
    ]
    return DocumentRead(
        id=doc.id,
        business_id=doc.business_id,
        document_type=doc.document_type,
        document_number=doc.document_number,
        contact_id=doc.contact_id,
        contact_name=doc.contact.name if doc.contact else None,
        issue_date=doc.issue_date,
        due_date=doc.due_date,
        currency=doc.currency,
        subtotal=Decimal(str(doc.subtotal)),
        discount=Decimal(str(doc.discount)),
        tax=Decimal(str(doc.tax)),
        total=Decimal(str(doc.total)),
        paid_amount=balances["paid_amount"],
        outstanding_amount=balances["outstanding_amount"],
        status=doc.status,
        notes=doc.notes,
        items=items,
        allocations=doc.allocations,
        created_at=doc.created_at,
        updated_at=doc.updated_at
    )

@router.get("", response_model=List[DocumentRead])
def list_documents(
    document_type: Optional[str] = Query(None, description="invoice, bill, or quotation"),
    status: Optional[str] = Query(None),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    query = db.query(Document).filter(Document.business_id == ctx.business.id)
    if document_type:
        query = query.filter(Document.document_type == document_type)
    if status:
        query = query.filter(Document.status == status)

    docs = query.order_by(Document.issue_date.desc()).all()
    return [build_document_read(db, d) for d in docs]

@router.get("/{document_id}", response_model=DocumentRead)
def get_document(
    document_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    doc = (
        db.query(Document)
        .filter(Document.id == document_id, Document.business_id == ctx.business.id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found in active workspace.")
    return build_document_read(db, doc)

@router.post("", response_model=DocumentRead)
def create_document(
    doc_in: DocumentCreate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    # Verify contact belongs to same workspace
    contact = (
        db.query(Contact)
        .filter(Contact.id == doc_in.contact_id, Contact.business_id == ctx.business.id)
        .first()
    )
    if not contact:
        raise HTTPException(status_code=400, detail="Contact not found in active workspace.")

    # Deterministic calculations
    items_raw = [item.model_dump() for item in doc_in.items]
    totals = calculate_invoice_totals(items_raw)

    now = datetime.now(timezone.utc)
    issue_date = doc_in.issue_date or now
    due_date = doc_in.due_date or (issue_date + (doc_in.due_date - issue_date if doc_in.due_date else datetime.resolution))

    doc = Document(
        business_id=ctx.business.id,
        document_type=doc_in.document_type,
        document_number=doc_in.document_number,
        contact_id=doc_in.contact_id,
        issue_date=issue_date,
        due_date=due_date,
        currency=doc_in.currency,
        subtotal=totals["subtotal"],
        discount=totals["discount"],
        tax=totals["tax"],
        total=totals["total"],
        status="issued",
        notes=doc_in.notes
    )
    db.add(doc)
    db.flush()

    for item_data in doc_in.items:
        qty = Decimal(str(item_data.quantity))
        unit_p = Decimal(str(item_data.unit_price))
        disc = Decimal(str(item_data.discount))
        tx = Decimal(str(item_data.tax))
        line_tot = (qty * unit_p) - disc + tx
        
        item = DocumentItem(
            document_id=doc.id,
            product_id=item_data.product_id,
            description=item_data.description,
            quantity=qty,
            unit_price=unit_p,
            discount=disc,
            tax=tx,
            line_total=line_tot
        )
        db.add(item)

    audit = AuditEvent(
        business_id=ctx.business.id,
        actor=ctx.actor,
        action="create_document",
        entity_type="document",
        entity_id=doc.id,
        reason=f"Created {doc.document_type} {doc.document_number} with total {doc.currency} {doc.total}."
    )
    db.add(audit)
    db.commit()
    db.refresh(doc)

    return build_document_read(db, doc)

@router.post("/{document_id}/void", response_model=DocumentRead)
def void_document(
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

    balances = get_document_balances(db, doc)
    if balances["paid_amount"] > Decimal("0.00"):
        raise HTTPException(
            status_code=400,
            detail="Cannot void a document with recorded payments. Please issue a credit note or refund."
        )

    doc.status = "voided"
    audit = AuditEvent(
        business_id=ctx.business.id,
        actor=ctx.actor,
        action="void_document",
        entity_type="document",
        entity_id=doc.id,
        reason=f"Owner voided document {doc.document_number}."
    )
    db.add(audit)
    db.commit()
    db.refresh(doc)
    return build_document_read(db, doc)
