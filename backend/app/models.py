import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey, Index
)
from sqlalchemy.orm import relationship
from .database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Business(Base):
    __tablename__ = "businesses"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(255), nullable=False)
    business_type = Column(String(100), default="Retail & Wholesale")
    country = Column(String(100), default="India")
    default_currency = Column(String(10), default="INR")
    timezone = Column(String(50), default="Asia/Kolkata")
    opening_cash_balance = Column(Numeric(14, 2), default=0.00)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    contacts = relationship("Contact", back_populates="business", cascade="all, delete-orphan")
    products = relationship("Product", back_populates="business", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="business", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="business", cascade="all, delete-orphan")
    action_drafts = relationship("ActionDraft", back_populates="business", cascade="all, delete-orphan")
    audit_events = relationship("AuditEvent", back_populates="business", cascade="all, delete-orphan")
    ai_findings = relationship("AIFinding", back_populates="business", cascade="all, delete-orphan")
    decisions = relationship("DecisionCase", back_populates="business", cascade="all, delete-orphan")
    ai_briefing_reports = relationship("AIBriefingReport", back_populates="business", cascade="all, delete-orphan")


class Contact(Base):
    __tablename__ = "contacts"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    business_id = Column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    contact_type = Column(String(50), nullable=False, default="customer")  # customer, supplier, both
    email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    address = Column(Text, nullable=True)
    credit_limit = Column(Numeric(14, 2), default=0.00)
    default_payment_terms_days = Column(Integer, default=15)
    status = Column(String(50), default="active")
    created_at = Column(DateTime, default=utc_now)
    
    business = relationship("Business", back_populates="contacts")
    documents = relationship("Document", back_populates="contact")
    transactions = relationship("Transaction", back_populates="contact")


class Product(Base):
    __tablename__ = "products"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    business_id = Column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    sku = Column(String(100), nullable=False)
    name = Column(String(255), nullable=False)
    unit = Column(String(50), default="pcs")
    sales_price = Column(Numeric(14, 2), default=0.00)
    purchase_cost = Column(Numeric(14, 2), default=0.00)
    current_stock = Column(Numeric(14, 2), default=0.00)
    reorder_threshold = Column(Numeric(14, 2), default=10.00)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)
    
    business = relationship("Business", back_populates="products")
    stock_movements = relationship("StockMovement", back_populates="product", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    business_id = Column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    document_type = Column(String(50), nullable=False, default="invoice")  # invoice, bill, quotation, purchase_order
    document_number = Column(String(100), nullable=False, index=True)
    contact_id = Column(String(36), ForeignKey("contacts.id"), nullable=False, index=True)
    issue_date = Column(DateTime, nullable=False, default=utc_now)
    due_date = Column(DateTime, nullable=False, default=utc_now)
    currency = Column(String(10), default="INR")
    subtotal = Column(Numeric(14, 2), default=0.00)
    discount = Column(Numeric(14, 2), default=0.00)
    tax = Column(Numeric(14, 2), default=0.00)
    total = Column(Numeric(14, 2), default=0.00)
    status = Column(String(50), default="draft")  # draft, issued, partially_paid, paid, voided
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    business = relationship("Business", back_populates="documents")
    contact = relationship("Contact", back_populates="documents")
    items = relationship("DocumentItem", back_populates="document", cascade="all, delete-orphan")
    allocations = relationship("PaymentAllocation", back_populates="document", cascade="all, delete-orphan")
    provider_references = relationship("ProviderInvoice", back_populates="document", cascade="all, delete-orphan")


class DocumentItem(Base):
    __tablename__ = "document_items"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id"), nullable=True)
    description = Column(String(255), nullable=False)
    quantity = Column(Numeric(14, 2), default=1.00)
    unit_price = Column(Numeric(14, 2), default=0.00)
    discount = Column(Numeric(14, 2), default=0.00)
    tax = Column(Numeric(14, 2), default=0.00)
    line_total = Column(Numeric(14, 2), default=0.00)
    
    document = relationship("Document", back_populates="items")
    product = relationship("Product")


class Transaction(Base):
    __tablename__ = "transactions"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    business_id = Column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    transaction_type = Column(String(50), nullable=False)  # inflow, outflow, transfer, adjustment
    amount = Column(Numeric(14, 2), nullable=False)
    currency = Column(String(10), default="INR")
    transaction_date = Column(DateTime, nullable=False, default=utc_now)
    payment_method = Column(String(50), default="cash")  # paypal, bank_transfer, cash, upi
    status = Column(String(50), default="verified")  # pending, verified, reconciled, failed
    reference = Column(String(255), nullable=True)
    provider = Column(String(50), nullable=True)  # paypal, manual
    provider_payment_id = Column(String(255), nullable=True, index=True)
    contact_id = Column(String(36), ForeignKey("contacts.id"), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    
    business = relationship("Business", back_populates="transactions")
    contact = relationship("Contact", back_populates="transactions")
    allocations = relationship("PaymentAllocation", back_populates="transaction", cascade="all, delete-orphan")


class PaymentAllocation(Base):
    __tablename__ = "payment_allocations"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    transaction_id = Column(String(36), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    allocated_amount = Column(Numeric(14, 2), nullable=False)
    created_at = Column(DateTime, default=utc_now)
    
    transaction = relationship("Transaction", back_populates="allocations")
    document = relationship("Document", back_populates="allocations")


class ActionDraft(Base):
    __tablename__ = "action_drafts"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    business_id = Column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    action_type = Column(String(100), nullable=False)  # collection_reminder, paypal_invoice, purchase_order
    target_contact_id = Column(String(36), ForeignKey("contacts.id"), nullable=True)
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=True)
    payload_json = Column(Text, nullable=False)
    payload_hash = Column(String(64), nullable=False)  # SHA-256 to ensure exact reviewed payload
    status = Column(String(50), default="awaiting_approval")  # draft, awaiting_approval, approved, executed, rejected, expired
    created_by = Column(String(100), default="ai_assistant")
    approved_by = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    execution_result = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    
    business = relationship("Business", back_populates="action_drafts")


class AuditEvent(Base):
    __tablename__ = "audit_events"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    business_id = Column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    actor = Column(String(100), nullable=False, default="owner")
    action = Column(String(100), nullable=False)  # approve_action, record_payment, reconcile_paypal, issue_invoice
    entity_type = Column(String(50), nullable=False)  # document, payment, action_draft, contact
    entity_id = Column(String(255), nullable=False)
    reason = Column(Text, nullable=True)
    safe_metadata = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=utc_now)
    
    business = relationship("Business", back_populates="audit_events")


class ProviderInvoice(Base):
    __tablename__ = "provider_invoices"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    document_id = Column(String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(50), default="paypal")
    environment = Column(String(50), default="sandbox")
    external_order_id = Column(String(255), nullable=True, index=True)
    external_invoice_id = Column(String(255), nullable=True, index=True)
    approval_url = Column(Text, nullable=True)
    status = Column(String(50), default="created")  # created, approved, completed, reconciled, failed
    last_verified_at = Column(DateTime, default=utc_now)
    created_at = Column(DateTime, default=utc_now)
    
    document = relationship("Document", back_populates="provider_references")


class WebhookEvent(Base):
    __tablename__ = "webhook_events"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    provider = Column(String(50), default="paypal")
    event_id = Column(String(255), nullable=False, unique=True, index=True)
    event_type = Column(String(100), nullable=False)
    verification_status = Column(String(50), default="verified")  # verified, failed, skipped_sandbox
    processing_status = Column(String(50), default="pending")  # pending, processed, duplicate, review_needed
    payload_subset = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)


class StockMovement(Base):
    __tablename__ = "stock_movements"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    business_id = Column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    movement_type = Column(String(50), nullable=False)  # opening, purchase_receipt, sale, return, adjustment
    quantity_delta = Column(Numeric(14, 2), nullable=False)
    unit_cost = Column(Numeric(14, 2), default=0.00)
    source_document_id = Column(String(36), nullable=True)
    actor = Column(String(100), default="owner")
    created_at = Column(DateTime, default=utc_now)
    
    product = relationship("Product", back_populates="stock_movements")


class AIFinding(Base):
    __tablename__ = "ai_findings"
    
    id = Column(String(36), primary_key=True, default=generate_uuid)
    business_id = Column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    finding_type = Column(String(100), nullable=False)  # cash_shortfall_risk, overdue_receivable, low_stock, unusual_expense
    severity = Column(String(50), default="warning")  # info, warning, high
    confidence = Column(Numeric(5, 2), default=0.95)
    title = Column(String(255), nullable=False)
    explanation = Column(Text, nullable=False)
    evidence_ids = Column(Text, nullable=True)  # JSON list of record IDs
    status = Column(String(50), default="new")  # new, reviewing, dismissed, resolved
    created_at = Column(DateTime, default=utc_now)
    
    business = relationship("Business", back_populates="ai_findings")


class DecisionCase(Base):
    __tablename__ = "decision_cases"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    business_id = Column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    problem_type = Column(String(100), nullable=False)  # cash_shortfall_risk, overdue_receivable, obligation_due
    severity = Column(String(50), default="warning")  # info, warning, critical
    urgency = Column(String(50), default="high")  # low, medium, high, immediate
    time_horizon = Column(String(100), default="Next 14 days outlook")
    problem_statement = Column(Text, nullable=False)
    supporting_records = Column(Text, nullable=False)  # JSON list of evidence records
    calculations = Column(Text, nullable=False)  # JSON dictionary of mathematical calculations
    assumptions = Column(Text, nullable=False)  # JSON list of assumptions & uncertainties
    status = Column(String(50), default="recommended")  # recommended, awaiting_approval, approved, executed, outcome_pending_verification, verified_successful, verified_unsuccessful, cancelled
    recommended_option_id = Column(String(100), nullable=False)
    recommendation_rationale = Column(Text, nullable=False)
    options_json = Column(Text, nullable=False)  # JSON list of structured alternative actions
    selected_option_id = Column(String(100), nullable=True)
    action_draft_id = Column(String(36), ForeignKey("action_drafts.id", ondelete="SET NULL"), nullable=True)
    target_document_id = Column(String(36), ForeignKey("documents.id", ondelete="SET NULL"), nullable=True)
    target_contact_id = Column(String(36), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    executed_at = Column(DateTime, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    outcome_status = Column(String(50), default="pending")  # pending, verified_successful, verified_unsuccessful, cancelled
    authoritative_source = Column(String(100), nullable=True)  # paypal_sandbox_capture, verified_transaction, manual_reconciliation
    estimated_financial_impact = Column(Numeric(14, 2), default=0.00)
    actual_financial_impact = Column(Numeric(14, 2), nullable=True)
    variance_amount = Column(Numeric(14, 2), nullable=True)
    outcome_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)

    business = relationship("Business", back_populates="decisions")
    action_draft = relationship("ActionDraft")
    target_document = relationship("Document")
    target_contact = relationship("Contact")


class AIBriefingReport(Base):
    __tablename__ = "ai_briefing_reports"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    business_id = Column(String(36), ForeignKey("businesses.id", ondelete="CASCADE"), nullable=False, index=True)
    report_type = Column(String(50), default="daily_briefing")  # daily_briefing, health_audit, what_if_simulation
    title = Column(String(255), nullable=False)
    health_score = Column(Integer, default=70)
    rating = Column(String(50), default="Stable")
    summary_markdown = Column(Text, nullable=False)
    metrics_json = Column(Text, nullable=False)  # JSON dictionary of key metrics
    priorities_json = Column(Text, nullable=False)  # JSON list of top priorities
    risks_json = Column(Text, nullable=True)  # JSON list of risks detected
    recommendations_json = Column(Text, nullable=True)  # JSON list of practical actions
    created_at = Column(DateTime, default=utc_now)

    business = relationship("Business", back_populates="ai_briefing_reports")

