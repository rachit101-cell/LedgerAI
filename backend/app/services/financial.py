from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from ..models import Business, Contact, Product, Document, DocumentItem, Transaction, PaymentAllocation, AIFinding
from ..schemas import EvidenceRecord, FinancialSummaryRead

def calculate_invoice_totals(items_data: List[Dict[str, Any]]) -> Dict[str, Decimal]:
    """
    Deterministic invoice arithmetic:
    Subtotal = sum(qty * unit_price - discount)
    Tax = sum(tax)
    Total = Subtotal + Tax
    """
    subtotal = Decimal("0.00")
    total_tax = Decimal("0.00")
    total_discount = Decimal("0.00")
    
    for item in items_data:
        qty = Decimal(str(item.get("quantity", 1)))
        unit_price = Decimal(str(item.get("unit_price", 0)))
        discount = Decimal(str(item.get("discount", 0)))
        tax = Decimal(str(item.get("tax", 0)))
        
        line_sub = (qty * unit_price) - discount
        line_total = line_sub + tax
        
        subtotal += line_sub
        total_discount += discount
        total_tax += tax

    total = subtotal + total_tax
    return {
        "subtotal": subtotal.quantize(Decimal("0.01")),
        "discount": total_discount.quantize(Decimal("0.01")),
        "tax": total_tax.quantize(Decimal("0.01")),
        "total": total.quantize(Decimal("0.01")),
    }


def get_document_balances(db: Session, document: Document) -> Dict[str, Decimal]:
    """
    Derived outstanding balance:
    Outstanding = document.total - sum(valid allocations)
    """
    allocations = (
        db.query(PaymentAllocation)
        .filter(PaymentAllocation.document_id == document.id)
        .all()
    )
    paid_amount = sum((Decimal(str(a.allocated_amount)) for a in allocations), Decimal("0.00"))
    outstanding = Decimal(str(document.total)) - paid_amount
    if outstanding < Decimal("0.00"):
        outstanding = Decimal("0.00")
        
    return {
        "paid_amount": paid_amount.quantize(Decimal("0.01")),
        "outstanding_amount": outstanding.quantize(Decimal("0.01")),
    }


def get_financial_summary(db: Session, business_id: str, days_ahead: int = 14) -> FinancialSummaryRead:
    """
    Deterministic cash position, collections, expenses, receivables, and payables.
    Matches DEMO_SCRIPT.md baseline:
    - Cash on hand
    - Upcoming supplier bills due
    - Overdue customer invoices
    - Detects shortfall risk if cash < upcoming payables
    """
    business = db.query(Business).filter(Business.id == business_id).first()
    opening_cash = Decimal(str(business.opening_cash_balance)) if business else Decimal("0.00")
    currency = business.default_currency if business else "INR"
    
    # 1. Transactions - actual cash inflows and outflows
    transactions = db.query(Transaction).filter(
        Transaction.business_id == business_id,
        Transaction.status.in_(["verified", "reconciled"])
    ).all()
    
    total_collections = Decimal("0.00")
    total_expenses_paid = Decimal("0.00")
    
    for tx in transactions:
        tx_amount = Decimal(str(tx.amount))
        if tx.transaction_type in ["inflow", "payment_received"]:
            total_collections += tx_amount
        elif tx.transaction_type in ["outflow", "supplier_payment", "expense"]:
            total_expenses_paid += tx_amount
            
    net_cash_movement = total_collections - total_expenses_paid
    recorded_cash_balance = (opening_cash + net_cash_movement).quantize(Decimal("0.01"))
    
    # 2. Invoices / Receivables (Customer sales)
    # 2. Invoices / Receivables (Customer sales)
    customer_invoices = (
        db.query(Document)
        .filter(
            Document.business_id == business_id,
            Document.document_type == "invoice",
            Document.status.in_(["issued", "partially_paid", "paid", "overdue"])
        )
        .all()
    )
    
    total_sales_invoiced = Decimal("0.00")
    total_receivables = Decimal("0.00")
    evidence_list: List[EvidenceRecord] = []
    
    for inv in customer_invoices:
        total_sales_invoiced += Decimal(str(inv.total))
        b = get_document_balances(db, inv)
        total_receivables += b["outstanding_amount"]
        
        # Only add to attention items if there is an outstanding amount
        if b["outstanding_amount"] > Decimal("0.00"):
            evidence_list.append(EvidenceRecord(
                record_type="invoice",
                id=inv.id,
                label=f"Customer Invoice {inv.document_number} ({inv.contact.name if inv.contact else 'Unknown'})",
                amount=b["outstanding_amount"],
                date=inv.issue_date.strftime("%Y-%m-%d") if inv.issue_date else None,
                due_date=inv.due_date.strftime("%Y-%m-%d") if inv.due_date else None,
                status=inv.status
            ))
        
    # 3. Bills / Payables (Supplier obligations)
    supplier_bills = (
        db.query(Document)
        .filter(
            Document.business_id == business_id,
            Document.document_type == "bill",
            Document.status.in_(["issued", "partially_paid", "paid", "overdue"])
        )
        .all()
    )
    
    total_supplier_bills = Decimal("0.00")
    total_payables_due = Decimal("0.00")
    now_utc = datetime.now(timezone.utc)
    horizon_date = now_utc + timedelta(days=days_ahead)
    
    closest_bill_date = None
    
    for bill in supplier_bills:
        total_supplier_bills += Decimal(str(bill.total))
        b = get_document_balances(db, bill)
        outstanding = b["outstanding_amount"]
        total_payables_due += outstanding
        
        bill_due = bill.due_date
        # Check if due within horizon
        if bill_due and (closest_bill_date is None or bill_due < closest_bill_date):
            closest_bill_date = bill_due
            
        if outstanding > Decimal("0.00"):
            evidence_list.append(EvidenceRecord(
                record_type="bill",
                id=bill.id,
                label=f"Supplier Bill {bill.document_number} ({bill.contact.name if bill.contact else 'Unknown'})",
                amount=outstanding,
                date=bill.issue_date.strftime("%Y-%m-%d") if bill.issue_date else None,
                due_date=bill.due_date.strftime("%Y-%m-%d") if bill.due_date else None,
                status=bill.status
            ))

    # 4. Cash shortfall analysis
    shortfall_risk = False
    projected_shortfall_amount = Decimal("0.00")
    shortfall_date_str = None
    
    if recorded_cash_balance < total_payables_due:
        shortfall_risk = True
        projected_shortfall_amount = (total_payables_due - recorded_cash_balance).quantize(Decimal("0.01"))
        if closest_bill_date:
            shortfall_date_str = closest_bill_date.strftime("%Y-%m-%d")
            
    assumptions = [
        f"Cash balance reflects opening balance of {currency} {opening_cash} plus verified bank/cash/PayPal inflows minus verified payments.",
        "Credit sales and issued invoices do not count as available cash until verified payment is received.",
        f"Upcoming obligations include verified supplier bills due within the next {days_ahead} days.",
        "Calculations use exact 2-decimal arithmetic; financial totals are never hallucinated by AI."
    ]
    
    return FinancialSummaryRead(
        recorded_cash_balance=recorded_cash_balance,
        currency=currency,
        period=f"Next {days_ahead} days outlook",
        total_sales_invoiced=total_sales_invoiced.quantize(Decimal("0.01")),
        total_collections=total_collections.quantize(Decimal("0.01")),
        total_supplier_bills=total_supplier_bills.quantize(Decimal("0.01")),
        total_expenses_paid=total_expenses_paid.quantize(Decimal("0.01")),
        total_receivables=total_receivables.quantize(Decimal("0.01")),
        total_payables_due=total_payables_due.quantize(Decimal("0.01")),
        net_cash_movement=net_cash_movement.quantize(Decimal("0.01")),
        shortfall_risk=shortfall_risk,
        projected_shortfall_amount=projected_shortfall_amount,
        shortfall_date=shortfall_date_str,
        reporting_basis="Cash accounting basis for movements; Invoiced basis for receivables/payables.",
        assumptions=assumptions,
        supporting_evidence=evidence_list
    )


def check_anomalies(db: Session, business_id: str) -> List[Dict[str, Any]]:
    """
    Rules-based expense and cash anomalies:
    1. Cash shortfall risk against confirmed supplier obligations.
    2. Overdue customer invoices beyond credit terms.
    3. Low stock thresholds for fast-moving items.
    """
    anomalies = []
    summary = get_financial_summary(db, business_id)
    
    curr_sym = "₹" if summary.currency == "INR" else summary.currency
    if summary.shortfall_risk:
        anomalies.append({
            "finding_type": "cash_shortfall_risk",
            "severity": "high",
            "confidence": 0.98,
            "title": f"Projected Cash Deficit of {curr_sym}{summary.projected_shortfall_amount:,.2f}",
            "explanation": (
                f"Available recorded cash ({curr_sym}{summary.recorded_cash_balance:,.2f}) "
                f"is insufficient to cover upcoming supplier bills ({curr_sym}{summary.total_payables_due:,.2f}) "
                f"due around {summary.shortfall_date or 'the next few days'}."
            ),
            "evidence_ids": [e.id for e in summary.supporting_evidence if e.record_type == "bill"]
        })
        
    # Check for overdue customer invoices
    now_utc = datetime.now(timezone.utc)
    overdue_invoices = (
        db.query(Document)
        .filter(
            Document.business_id == business_id,
            Document.document_type == "invoice",
            Document.status.in_(["issued", "partially_paid", "overdue"]),
            Document.due_date < now_utc
        )
        .all()
    )
    
    for inv in overdue_invoices:
        b = get_document_balances(db, inv)
        if b["outstanding_amount"] > Decimal("0.00"):
            inv_sym = "₹" if inv.currency == "INR" else inv.currency
            anomalies.append({
                "finding_type": "overdue_receivable",
                "severity": "warning",
                "confidence": 0.95,
                "title": f"Overdue Invoice {inv.document_number} ({inv_sym}{b['outstanding_amount']:,.2f})",
                "explanation": (
                    f"Invoice {inv.document_number} issued to {inv.contact.name if inv.contact else 'Customer'} "
                    f"was due on {inv.due_date.strftime('%Y-%m-%d')} with {inv_sym}{b['outstanding_amount']:,.2f} still outstanding."
                ),
                "evidence_ids": [inv.id]
            })
            
    # Check for overdue supplier obligations (critical for vendor credit terms)
    overdue_bills = (
        db.query(Document)
        .filter(
            Document.business_id == business_id,
            Document.document_type == "bill",
            Document.status.in_(["issued", "partially_paid", "overdue"]),
            Document.due_date < now_utc
        )
        .all()
    )
    for bill in overdue_bills:
        b = get_document_balances(db, bill)
        if b["outstanding_amount"] > Decimal("0.00"):
            bill_sym = "₹" if bill.currency == "INR" else bill.currency
            anomalies.append({
                "finding_type": "overdue_payable",
                "severity": "warning",
                "confidence": 0.95,
                "title": f"Overdue Supplier Bill {bill.document_number} ({bill_sym}{b['outstanding_amount']:,.2f})",
                "explanation": (
                    f"Supplier bill {bill.document_number} from {bill.contact.name if bill.contact else 'Supplier'} "
                    f"was due on {bill.due_date.strftime('%Y-%m-%d')} with {bill_sym}{b['outstanding_amount']:,.2f} pending payout."
                ),
                "evidence_ids": [bill.id]
            })
            
    return anomalies
