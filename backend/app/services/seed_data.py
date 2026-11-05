import json
import hashlib
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy.orm import Session
from ..models import (
    Business, Contact, Product, Document, DocumentItem,
    Transaction, PaymentAllocation, AuditEvent, AIFinding,
    StockMovement, ActionDraft, ProviderInvoice, WebhookEvent, DecisionCase
)

def seed_demo_data(db: Session) -> Business:
    """
    Seeds comprehensive multi-day database records for Apex Retail & Wholesale.
    Includes historical payments, revenue collections, overdue receivables,
    merchant payouts, and upcoming obligations:
    - Cash on hand: ₹45,000.00 (verified by historical transactions)
    - Historical revenue collections: ₹60,000.00 (Gupta Store ₹28k, Verma Groceries ₹10k advance + ₹22k)
    - Historical merchant payouts: ₹35,000.00 (Kisan Freight ₹20k, Apex Warehousing & Power ₹15k)
    - Overdue customer invoices: Sharma Traders (₹35,000.00) + Mehta Supermart (₹18,500.00)
    - Overdue merchant payable: Kisan Agro Logistics (₹12,500.00)
    - Upcoming major supplier bill: Sunrise Distributors (₹65,000.00 due in 3 days)
    - Shortfall risk: ₹20,000.00 baseline
    """
    now = datetime.now(timezone.utc)

    # 1. Clean existing records for a fresh, deterministic run
    db.query(DecisionCase).delete()
    db.query(ActionDraft).delete()
    db.query(PaymentAllocation).delete()
    db.query(Transaction).delete()
    db.query(DocumentItem).delete()
    db.query(ProviderInvoice).delete()
    db.query(WebhookEvent).delete()
    db.query(Document).delete()
    db.query(StockMovement).delete()
    db.query(Product).delete()
    db.query(Contact).delete()
    db.query(AuditEvent).delete()
    db.query(AIFinding).delete()
    db.query(Business).delete()
    db.commit()

    # 2. Business
    business = Business(
        name="Apex Enterprises",
        business_type="Retail & Wholesale",
        country="India",
        default_currency="INR",
        timezone="Asia/Kolkata",
        opening_cash_balance=Decimal("20000.00")
    )
    db.add(business)
    db.flush()

    # 3. Contacts (Customers & Merchant Suppliers)
    c_sharma = Contact(
        business_id=business.id,
        name="Sharma Traders",
        contact_type="customer",
        email="sharma.traders.demo@example.com",
        phone="+91 98765 43210",
        address="Shop 14, Grain Market, Sector 26, Chandigarh",
        credit_limit=Decimal("50000.00"),
        default_payment_terms_days=15
    )
    c_verma = Contact(
        business_id=business.id,
        name="Verma Groceries",
        contact_type="customer",
        email="verma.groceries.demo@example.com",
        phone="+91 98111 22334",
        address="Plot 5, Main Bazaar, Karnal",
        credit_limit=Decimal("40000.00"),
        default_payment_terms_days=15
    )
    c_gupta = Contact(
        business_id=business.id,
        name="Gupta Departmental Store",
        contact_type="customer",
        email="accounts@guptastore.demo",
        phone="+91 98222 33445",
        address="Market Complex 9, Urban Estate, Kurukshetra",
        credit_limit=Decimal("60000.00"),
        default_payment_terms_days=15
    )
    c_mehta = Contact(
        business_id=business.id,
        name="Mehta Supermart",
        contact_type="customer",
        email="billing@mehtamart.demo",
        phone="+91 98333 44556",
        address="SCO 22, Model Town, Panipat",
        credit_limit=Decimal("35000.00"),
        default_payment_terms_days=15
    )
    c_sunrise = Contact(
        business_id=business.id,
        name="Sunrise Distributors",
        contact_type="supplier",
        email="orders@sunrisedistributors.demo",
        phone="+91 99888 77665",
        address="Industrial Area Phase 1, Ambala",
        credit_limit=Decimal("100000.00"),
        default_payment_terms_days=21
    )
    c_kisan = Contact(
        business_id=business.id,
        name="Kisan Agro Logistics",
        contact_type="supplier",
        email="dispatch@kisanlogistics.demo",
        phone="+91 97666 55443",
        address="GT Road Freight Terminal, Sonipat",
        credit_limit=Decimal("50000.00"),
        default_payment_terms_days=14
    )
    c_property = Contact(
        business_id=business.id,
        name="Apex Warehousing & Power",
        contact_type="supplier",
        email="facilities@apexwarehousing.demo",
        phone="+91 97555 44332",
        address="Warehouse Bay 4, Ring Road, Karnal",
        credit_limit=Decimal("30000.00"),
        default_payment_terms_days=10
    )
    db.add_all([c_sharma, c_verma, c_gupta, c_mehta, c_sunrise, c_kisan, c_property])
    db.flush()

    # 4. Products (Financial catalogue items)
    p_rice = Product(
        business_id=business.id,
        sku="RICE-BAS-10",
        name="Premium Basmati Rice 10kg",
        unit="bags",
        sales_price=Decimal("1200.00"),
        purchase_cost=Decimal("1000.00"),
        current_stock=Decimal("8.00"),
        reorder_threshold=Decimal("10.00")
    )
    p_oil = Product(
        business_id=business.id,
        sku="OIL-SUN-5",
        name="Sunflower Cooking Oil 5L",
        unit="cans",
        sales_price=Decimal("650.00"),
        purchase_cost=Decimal("500.00"),
        current_stock=Decimal("25.00"),
        reorder_threshold=Decimal("15.00")
    )
    p_flour = Product(
        business_id=business.id,
        sku="FLOUR-WHT-10",
        name="Organic Wheat Flour 10kg",
        unit="bags",
        sales_price=Decimal("1000.00"),
        purchase_cost=Decimal("800.00"),
        current_stock=Decimal("40.00"),
        reorder_threshold=Decimal("10.00")
    )
    db.add_all([p_rice, p_oil, p_flour])
    db.flush()

    # -------------------------------------------------------------
    # 5. CUSTOMER INVOICES & REVENUE (Multi-Day Historical & Active)
    # -------------------------------------------------------------

    # A) Paid In Full Historical: INV-2026-0035 (Gupta Store) -> ₹28,000 (Issued 25d ago, Paid 12d ago)
    inv_gupta_paid = Document(
        business_id=business.id,
        document_type="invoice",
        document_number="INV-2026-0035",
        contact_id=c_gupta.id,
        issue_date=now - timedelta(days=25),
        due_date=now - timedelta(days=10),
        currency="INR",
        subtotal=Decimal("28000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        total=Decimal("28000.00"),
        status="paid",
        notes="Full wholesale order settled via NEFT bank transfer."
    )
    db.add(inv_gupta_paid)
    db.flush()
    db.add(DocumentItem(
        document_id=inv_gupta_paid.id,
        product_id=p_rice.id,
        description="Premium Basmati Rice 10kg (Retail Pack)",
        quantity=Decimal("23.33"),
        unit_price=Decimal("1200.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        line_total=Decimal("28000.00")
    ))

    # B) Overdue Invoice: INV-2026-0037 (Mehta Supermart) -> ₹18,500 (Issued 18d ago, Due 3d ago)
    inv_mehta_overdue = Document(
        business_id=business.id,
        document_type="invoice",
        document_number="INV-2026-0037",
        contact_id=c_mehta.id,
        issue_date=now - timedelta(days=18),
        due_date=now - timedelta(days=3),
        currency="INR",
        subtotal=Decimal("18500.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        total=Decimal("18500.00"),
        status="overdue",
        notes="Pending overdue collection. Net 15 credit terms."
    )
    db.add(inv_mehta_overdue)
    db.flush()
    db.add(DocumentItem(
        document_id=inv_mehta_overdue.id,
        product_id=p_flour.id,
        description="Organic Wheat Flour 10kg bags",
        quantity=Decimal("18.50"),
        unit_price=Decimal("1000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        line_total=Decimal("18500.00")
    ))

    # C) Partially Paid Invoice: INV-2026-0039 (Verma Groceries) -> ₹15,000 (Issued 12d ago, Due in 3d)
    inv_verma = Document(
        business_id=business.id,
        document_type="invoice",
        document_number="INV-2026-0039",
        contact_id=c_verma.id,
        issue_date=now - timedelta(days=12),
        due_date=now + timedelta(days=3),
        currency="INR",
        subtotal=Decimal("15000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        total=Decimal("15000.00"),
        status="partially_paid",
        notes="Advance partial payment received via UPI (₹10,000). Remaining balance ₹5,000."
    )
    db.add(inv_verma)
    db.flush()
    db.add(DocumentItem(
        document_id=inv_verma.id,
        product_id=p_oil.id,
        description="Sunflower Cooking Oil 5L Cans (Wholesale Pack)",
        quantity=Decimal("23.08"),
        unit_price=Decimal("650.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        line_total=Decimal("15000.00")
    ))

    # D) Paid In Full: INV-2026-0040 (Verma Groceries) -> ₹22,000 (Issued 14d ago, Paid 2d ago)
    inv_verma_paid = Document(
        business_id=business.id,
        document_type="invoice",
        document_number="INV-2026-0040",
        contact_id=c_verma.id,
        issue_date=now - timedelta(days=14),
        due_date=now - timedelta(days=2),
        currency="INR",
        subtotal=Decimal("22000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        total=Decimal("22000.00"),
        status="paid",
        notes="Invoice settled in full via instant UPI."
    )
    db.add(inv_verma_paid)
    db.flush()
    db.add(DocumentItem(
        document_id=inv_verma_paid.id,
        product_id=p_rice.id,
        description="Premium Basmati Rice 10kg",
        quantity=Decimal("18.33"),
        unit_price=Decimal("1200.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        line_total=Decimal("22000.00")
    ))

    # E) Pending Upcoming: INV-2026-0041 (Gupta Departmental Store) -> ₹16,000 (Issued 6d ago, Due in 9d)
    inv_gupta_pending = Document(
        business_id=business.id,
        document_type="invoice",
        document_number="INV-2026-0041",
        contact_id=c_gupta.id,
        issue_date=now - timedelta(days=6),
        due_date=now + timedelta(days=9),
        currency="INR",
        subtotal=Decimal("16000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        total=Decimal("16000.00"),
        status="issued",
        notes="Standard net 15 terms. Goods delivered on schedule."
    )
    db.add(inv_gupta_pending)
    db.flush()
    db.add(DocumentItem(
        document_id=inv_gupta_pending.id,
        product_id=p_flour.id,
        description="Organic Wheat Flour 10kg",
        quantity=Decimal("16.00"),
        unit_price=Decimal("1000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        line_total=Decimal("16000.00")
    ))

    # F) Priority Overdue Customer Invoice: INV-2026-0042 (Sharma Traders) -> ₹35,000 (Due 5d ago)
    inv_sharma = Document(
        business_id=business.id,
        document_type="invoice",
        document_number="INV-2026-0042",
        contact_id=c_sharma.id,
        issue_date=now - timedelta(days=20),
        due_date=now - timedelta(days=5),
        currency="INR",
        subtotal=Decimal("35000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        total=Decimal("35000.00"),
        status="overdue",
        notes="Overdue receivable. Target for early payment discount / PayPal settlement."
    )
    db.add(inv_sharma)
    db.flush()
    db.add(DocumentItem(
        document_id=inv_sharma.id,
        product_id=p_flour.id,
        description="Organic Wheat Flour 10kg (Commercial Grade)",
        quantity=Decimal("35.00"),
        unit_price=Decimal("1000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        line_total=Decimal("35000.00")
    ))

    # -------------------------------------------------------------
    # 6. SUPPLIER BILLS & MERCHANT PAYMENTS (Outflows)
    # -------------------------------------------------------------

    # A) Paid Historical: BILL-2026-0098 (Kisan Agro Logistics) -> ₹20,000 (Paid 16d ago)
    bill_kisan_paid = Document(
        business_id=business.id,
        document_type="bill",
        document_number="BILL-2026-0098",
        contact_id=c_kisan.id,
        issue_date=now - timedelta(days=30),
        due_date=now - timedelta(days=15),
        currency="INR",
        subtotal=Decimal("20000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        total=Decimal("20000.00"),
        status="paid",
        notes="Freight & regional transport dispatch fee. Paid in full via NEFT."
    )
    db.add(bill_kisan_paid)
    db.flush()
    db.add(DocumentItem(
        document_id=bill_kisan_paid.id,
        description="Inter-state Grain Transport & Freight Logistics",
        quantity=Decimal("1.00"),
        unit_price=Decimal("20000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        line_total=Decimal("20000.00")
    ))

    # B) Paid Historical: BILL-2026-0102 (Apex Warehousing & Power) -> ₹15,000 (Paid 7d ago)
    bill_property_paid = Document(
        business_id=business.id,
        document_type="bill",
        document_number="BILL-2026-0102",
        contact_id=c_property.id,
        issue_date=now - timedelta(days=22),
        due_date=now - timedelta(days=8),
        currency="INR",
        subtotal=Decimal("15000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        total=Decimal("15000.00"),
        status="paid",
        notes="Warehouse rent, cold room storage & commercial utility charges."
    )
    db.add(bill_property_paid)
    db.flush()
    db.add(DocumentItem(
        document_id=bill_property_paid.id,
        description="Warehouse Bay Lease & Commercial Electricity Utilities",
        quantity=Decimal("1.00"),
        unit_price=Decimal("15000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        line_total=Decimal("15000.00")
    ))

    # C) Overdue Merchant Bill: BILL-2026-0105 (Kisan Agro Logistics) -> ₹12,500 (Due 2d ago)
    bill_kisan_overdue = Document(
        business_id=business.id,
        document_type="bill",
        document_number="BILL-2026-0105",
        contact_id=c_kisan.id,
        issue_date=now - timedelta(days=15),
        due_date=now - timedelta(days=2),
        currency="INR",
        subtotal=Decimal("12500.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        total=Decimal("12500.00"),
        status="overdue",
        notes="Overdue transport freight charges for grain delivery consignments."
    )
    db.add(bill_kisan_overdue)
    db.flush()
    db.add(DocumentItem(
        document_id=bill_kisan_overdue.id,
        description="Secondary Logistics & Freight Transport #FR-902",
        quantity=Decimal("1.00"),
        unit_price=Decimal("12500.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        line_total=Decimal("12500.00")
    ))

    # D) Primary Upcoming Supplier Bill: BILL-2026-0108 (Sunrise Distributors) -> ₹65,000 (Due in 3d)
    bill_sunrise = Document(
        business_id=business.id,
        document_type="bill",
        document_number="BILL-2026-0108",
        contact_id=c_sunrise.id,
        issue_date=now - timedelta(days=10),
        due_date=now + timedelta(days=3),
        currency="INR",
        subtotal=Decimal("65000.00"),
        discount=Decimal("0.00"),
        tax=Decimal("0.00"),
        total=Decimal("65000.00"),
        status="issued",
        notes="Grain supplies shipment invoice #SN-887."
    )
    db.add(bill_sunrise)
    db.flush()
    db.add_all([
        DocumentItem(
            document_id=bill_sunrise.id,
            product_id=p_rice.id,
            description="Premium Basmati Rice 10kg bags",
            quantity=Decimal("50.00"),
            unit_price=Decimal("1000.00"),
            discount=Decimal("0.00"),
            tax=Decimal("0.00"),
            line_total=Decimal("50000.00")
        ),
        DocumentItem(
            document_id=bill_sunrise.id,
            product_id=p_oil.id,
            description="Sunflower Cooking Oil 5L Cans",
            quantity=Decimal("30.00"),
            unit_price=Decimal("500.00"),
            discount=Decimal("0.00"),
            tax=Decimal("0.00"),
            line_total=Decimal("15000.00")
        )
    ])

    # -------------------------------------------------------------
    # 7. HISTORICAL TRANSACTIONS & ALLOCATIONS (Multi-Day Timeline)
    # -------------------------------------------------------------

    # Tx 1 (16d ago): Outflow -₹20,000 for Kisan Logistics
    tx_out_kisan = Transaction(
        business_id=business.id,
        transaction_type="outflow",
        amount=Decimal("20000.00"),
        currency="INR",
        transaction_date=now - timedelta(days=16),
        payment_method="bank_transfer",
        status="verified",
        reference="NEFT-KL-88390",
        contact_id=c_kisan.id,
        description="Settlement of freight logistics BILL-2026-0098"
    )
    db.add(tx_out_kisan)
    db.flush()
    db.add(PaymentAllocation(
        transaction_id=tx_out_kisan.id,
        document_id=bill_kisan_paid.id,
        allocated_amount=Decimal("20000.00")
    ))

    # Tx 2 (12d ago): Inflow +₹28,000 from Gupta Departmental Store
    tx_in_gupta = Transaction(
        business_id=business.id,
        transaction_type="inflow",
        amount=Decimal("28000.00"),
        currency="INR",
        transaction_date=now - timedelta(days=12),
        payment_method="bank_transfer",
        status="verified",
        reference="RTGS-GUPTA-4491",
        contact_id=c_gupta.id,
        description="Full payment received for INV-2026-0035"
    )
    db.add(tx_in_gupta)
    db.flush()
    db.add(PaymentAllocation(
        transaction_id=tx_in_gupta.id,
        document_id=inv_gupta_paid.id,
        allocated_amount=Decimal("28000.00")
    ))

    # Tx 3 (10d ago): Inflow +₹10,000 advance from Verma Groceries
    tx_verma = Transaction(
        business_id=business.id,
        transaction_type="inflow",
        amount=Decimal("10000.00"),
        currency="INR",
        transaction_date=now - timedelta(days=10),
        payment_method="upi",
        status="verified",
        reference="UPI-REF-998822",
        contact_id=c_verma.id,
        description="Partial advance payment for INV-2026-0039"
    )
    db.add(tx_verma)
    db.flush()
    db.add(PaymentAllocation(
        transaction_id=tx_verma.id,
        document_id=inv_verma.id,
        allocated_amount=Decimal("10000.00")
    ))

    # Tx 4 (7d ago): Outflow -₹15,000 for Warehousing & Utilities
    tx_out_property = Transaction(
        business_id=business.id,
        transaction_type="outflow",
        amount=Decimal("15000.00"),
        currency="INR",
        transaction_date=now - timedelta(days=7),
        payment_method="bank_transfer",
        status="verified",
        reference="NEFT-APEX-FACIL-21",
        contact_id=c_property.id,
        description="Payment for warehouse rent & electricity BILL-2026-0102"
    )
    db.add(tx_out_property)
    db.flush()
    db.add(PaymentAllocation(
        transaction_id=tx_out_property.id,
        document_id=bill_property_paid.id,
        allocated_amount=Decimal("15000.00")
    ))

    # Tx 5 (2d ago): Inflow +₹22,000 from Verma Groceries order
    tx_in_verma = Transaction(
        business_id=business.id,
        transaction_type="inflow",
        amount=Decimal("22000.00"),
        currency="INR",
        transaction_date=now - timedelta(days=2),
        payment_method="upi",
        status="verified",
        reference="UPI-VERMA-77401",
        contact_id=c_verma.id,
        description="Full payment received for INV-2026-0040"
    )
    db.add(tx_in_verma)
    db.flush()
    db.add(PaymentAllocation(
        transaction_id=tx_in_verma.id,
        document_id=inv_verma_paid.id,
        allocated_amount=Decimal("22000.00")
    ))

    # -------------------------------------------------------------
    # 8. Pre-seeded Action Draft awaiting owner authorization
    # -------------------------------------------------------------
    draft_payload = {
        "action_type": "collection_reminder_with_paypal_link",
        "contact_id": c_sharma.id,
        "contact_name": "Sharma Traders",
        "document_id": inv_sharma.id,
        "document_number": "INV-2026-0042",
        "amount": 35000.0,
        "currency": "INR",
        "message": "Dear Sharma Traders, this is an executive reminder that invoice INV-2026-0042 for ₹35,000.00 is overdue. Please complete payment securely using PayPal Sandbox checkout: [Pay Online via PayPal].",
        "payment_link_type": "paypal_sandbox",
        "expected_financial_effect": "Increases recorded cash by ₹35,000.00, settles invoice INV-2026-0042, and clears the projected supplier shortfall."
    }
    payload_str = json.dumps(draft_payload, sort_keys=True)
    p_hash = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

    action_draft_seed = ActionDraft(
        business_id=business.id,
        action_type="collection_reminder_with_paypal_link",
        target_contact_id=c_sharma.id,
        document_id=inv_sharma.id,
        payload_json=json.dumps(draft_payload),
        payload_hash=p_hash,
        status="awaiting_approval",
        created_by="ai_assistant",
        expires_at=now + timedelta(days=2)
    )
    db.add(action_draft_seed)

    # 9. Audit event
    audit_init = AuditEvent(
        business_id=business.id,
        actor="system",
        action="seed_multi_day_financial_ledger",
        entity_type="business",
        entity_id=business.id,
        reason="Initialized rich multi-day financial ledger with historical revenue, merchant payouts, and active receivables.",
        safe_metadata=json.dumps({"scenario": "Historical payments and working capital analysis"})
    )
    db.add(audit_init)
    db.commit()

    # 10. Seed baseline Decision Case via Decision Engine
    from .decision_service import DecisionService
    decision = DecisionService.evaluate_decision(db, business.id)
    dec_record = db.query(DecisionCase).filter(DecisionCase.id == decision.id).first()
    if dec_record:
        dec_record.action_draft_id = action_draft_seed.id
        dec_record.selected_option_id = "opt_collect_overdue"
        dec_record.status = "awaiting_approval"
        db.commit()

    db.refresh(business)
    return business
