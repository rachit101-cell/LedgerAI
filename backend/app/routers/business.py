from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Business, Contact, Product
from ..schemas import BusinessRead, ContactCreate, ContactRead, ProductCreate, ProductRead
from ..auth import WorkspaceContext, get_workspace_context, require_owner_role

router = APIRouter(prefix="/api/v1", tags=["Business & Contacts"])

@router.get("/businesses/active", response_model=BusinessRead)
def get_active_business(ctx: WorkspaceContext = Depends(get_workspace_context)):
    return ctx.business

@router.get("/contacts", response_model=List[ContactRead])
def list_contacts(
    contact_type: Optional[str] = Query(None, description="customer, supplier, or both"),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    query = db.query(Contact).filter(Contact.business_id == ctx.business.id)
    if contact_type:
        query = query.filter(Contact.contact_type.in_([contact_type, "both"]))
    return query.all()

@router.post("/contacts", response_model=ContactRead)
def create_contact(
    contact_in: ContactCreate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    contact = Contact(
        business_id=ctx.business.id,
        name=contact_in.name,
        contact_type=contact_in.contact_type,
        email=contact_in.email,
        phone=contact_in.phone,
        address=contact_in.address,
        credit_limit=contact_in.credit_limit,
        default_payment_terms_days=contact_in.default_payment_terms_days,
        status="active"
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact

@router.get("/products", response_model=List[ProductRead])
def list_products(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    return db.query(Product).filter(Product.business_id == ctx.business.id).all()

@router.post("/products", response_model=ProductRead)
def create_product(
    product_in: ProductCreate,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    product = Product(
        business_id=ctx.business.id,
        sku=product_in.sku,
        name=product_in.name,
        unit=product_in.unit,
        sales_price=product_in.sales_price,
        purchase_cost=product_in.purchase_cost,
        current_stock=product_in.current_stock,
        reorder_threshold=product_in.reorder_threshold,
        active=product_in.active
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product
