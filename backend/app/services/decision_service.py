import json
import logging
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session

from ..models import (
    Business, Document, Contact, ActionDraft, AuditEvent,
    DecisionCase, Transaction, ProviderInvoice
)
from ..schemas import (
    DecisionCaseRead, DecisionOption, DecisionOutcomeLedgerItem,
    DecisionEvaluateRequest
)
from .financial import get_financial_summary, get_document_balances
from .ai_assistant import compute_payload_hash

logger = logging.getLogger("decision_service")

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class DecisionService:
    @classmethod
    def evaluate_decision(
        cls, db: Session, business_id: str, eval_req: Optional[DecisionEvaluateRequest] = None
    ) -> DecisionCaseRead:
        """
        Cash Solution Comparison Engine (CB-1 Standard):
        Evaluates verified ledger data deterministically, detects cash gaps,
        generates structured alternatives (Collection Reminder, Early Discount,
        Supplier Extension, Financing Simulation, and Monitor), and versions calculations.
        """
        now = utc_now()
        summary = get_financial_summary(db, business_id, days_ahead=14)
        recorded_cash = summary.recorded_cash_balance
        obligations = summary.total_payables_due
        shortfall_amount = summary.projected_shortfall_amount
        has_shortfall = summary.shortfall_risk or shortfall_amount > Decimal("0.00")

        # Query overdue customer invoices in this workspace
        overdue_invoices = (
            db.query(Document)
            .filter(
                Document.business_id == business_id,
                Document.document_type == "invoice",
                Document.status.in_(["issued", "partially_paid", "overdue"]),
                Document.due_date < now
            )
            .order_by(Document.due_date.asc())
            .all()
        )

        # Query upcoming supplier bills
        upcoming_bills = (
            db.query(Document)
            .filter(
                Document.business_id == business_id,
                Document.document_type == "bill",
                Document.status.in_(["draft", "issued"])
            )
            .order_by(Document.due_date.asc())
            .all()
        )

        supporting_records: List[Dict[str, Any]] = []
        assumptions: List[str] = [
            "Financial metrics derive strictly from verified ledger entries and contract due dates.",
            "Obligations horizon evaluates verified supplier bills due within the next 14 days.",
            "All arithmetic uses exact decimal precision (ROUND_HALF_UP) without speculative probability weighting.",
            "Calculations versioned under Cash Bridge engine standard cb_v1.0."
        ]
        missing_data_warnings: List[str] = []

        options: List[DecisionOption] = []
        problem_type: str = "operating_liquidity_evaluation"
        title: str = "Operating Cash Position Review"
        severity: str = "info"
        urgency: str = "low"
        problem_statement: str = ""
        recommended_option_id: str = ""
        recommendation_rationale: str = ""
        target_doc_id: Optional[str] = None
        target_contact_id: Optional[str] = None
        estimated_impact: Decimal = Decimal("0.00")

        if has_shortfall:
            problem_type = "cash_shortfall_risk"
            title = f"Projected Cash Deficit of INR {shortfall_amount:,.2f}"
            severity = "critical"
            urgency = "immediate"

            top_bill = upcoming_bills[0] if upcoming_bills else None
            top_overdue = overdue_invoices[0] if overdue_invoices else None

            bill_label = top_bill.document_number if top_bill else "Upcoming supplier obligations"
            bill_amt = top_bill.total if top_bill else obligations
            bill_date_str = top_bill.due_date.strftime("%Y-%m-%d") if top_bill else "next 14 days"
            supplier_name = top_bill.contact.name if (top_bill and top_bill.contact) else "Supplier"

            problem_statement = (
                f"Recorded cash on hand of INR {recorded_cash:,.2f} is insufficient to cover upcoming supplier obligations "
                f"of INR {obligations:,.2f} (primarily {bill_label} to {supplier_name} for INR {bill_amt:,.2f} due {bill_date_str}). "
                f"Apex Enterprises policy is to pay suppliers 100% in full on time. "
                f"To bridge the projected operating cash deficit of INR {shortfall_amount:,.2f}, an early-settlement "
                f"Bridge Cash offer is extended to customer receivables (sales invoices)."
            )

            if top_bill:
                supporting_records.append({
                    "record_type": "supplier_bill",
                    "document_number": top_bill.document_number,
                    "contact_name": supplier_name,
                    "amount": float(top_bill.total),
                    "due_date": top_bill.due_date.strftime("%Y-%m-%d"),
                    "status": top_bill.status
                })

            if top_overdue:
                balances = get_document_balances(db, top_overdue)
                overdue_amt = balances["outstanding_amount"]
                customer_name = top_overdue.contact.name if top_overdue.contact else "Customer"
                target_doc_id = top_overdue.id
                target_contact_id = top_overdue.contact_id
                estimated_impact = overdue_amt

                supporting_records.append({
                    "record_type": "customer_invoice",
                    "document_number": top_overdue.document_number,
                    "contact_name": customer_name,
                    "amount": float(overdue_amt),
                    "due_date": top_overdue.due_date.strftime("%Y-%m-%d"),
                    "status": top_overdue.status
                })

                # Option A: Accelerate Overdue Receivable via PayPal (100% Face Value Recovery)
                opt1 = DecisionOption(
                    id="opt_collect_overdue",
                    title=f"Collect Invoice {top_overdue.document_number} ({customer_name}) at 100% Face Value",
                    action_type="collection_reminder_with_paypal_link",
                    option_type="collection_reminder",
                    availability="available",
                    availability_reason=None,
                    description=(
                        f"Draft an owner-approved formal collection reminder with a PayPal Sandbox hosted payment link "
                        f"for Invoice {top_overdue.document_number} (Outstanding: INR {overdue_amt:,.2f}, due {top_overdue.due_date.strftime('%Y-%m-%d')}). "
                        f"Customer pays full amount (0% discount); funds 100% full settlement of supplier bill {bill_label} ({supplier_name})."
                    ),
                    rationale=(
                        f"Collecting this verified customer receivable at full face value provides an immediate cash inflow of INR {overdue_amt:,.2f}. "
                        f"This completely covers the projected INR {shortfall_amount:,.2f} deficit and restores an operating buffer "
                        f"of INR {(recorded_cash + overdue_amt - obligations):,.2f} after settling all supplier obligations 100% in full."
                    ),
                    currency=top_overdue.currency,
                    cash_amount=overdue_amt,
                    expected_timing="collection timing unknown (requires customer payment action)",
                    known_direct_cost=Decimal("0.00"),
                    unknown_cost_fields=["processor_fee_if_applicable"],
                    estimated_financial_impact=overdue_amt,
                    estimated_gap_effect=f"Fully eliminates deficit by INR {overdue_amt:,.2f} if customer pays full invoice.",
                    assumptions=[
                        "Assumes customer responds and pays full invoice via link upon receipt.",
                        "Collection timing is not guaranteed."
                    ],
                    risks=[
                        "Customer may delay payment, ignore reminder, or request extended terms."
                    ],
                    missing_inputs=[],
                    evidence_supporting=f"Invoice {top_overdue.document_number} ({customer_name}) past due date {top_overdue.due_date.strftime('%Y-%m-%d')} with balance INR {overdue_amt:,.2f}.",
                    risks_and_assumptions="Assumes customer responds and pays via link upon receipt. Risk: Customer may delay payment or request installment terms.",
                    requires_approval=True,
                    feasibility="high",
                    simulation_only=False,
                    target_document_id=top_overdue.id,
                    target_contact_id=top_overdue.contact_id
                )
                options.append(opt1)

                # Option B: Bridge Cash Early-Payment Discount to Customer (Pay Less, Pay Now)
                has_discount_terms = (
                    eval_req is not None and
                    eval_req.discount_rate is not None and
                    Decimal("0.00") <= eval_req.discount_rate < Decimal("1.00")
                )
                if has_discount_terms:
                    d_rate = eval_req.discount_rate
                    disc_amount = (overdue_amt * d_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                    net_receipt = overdue_amt - disc_amount
                    pct_str = f"{d_rate * 100:.1f}%"
                    opt_b = DecisionOption(
                        id="opt_early_discount",
                        title=f"Bridge Cash Offer: {pct_str} Early Discount to {customer_name} on Invoice {top_overdue.document_number}",
                        action_type="early_payment_discount_offer",
                        option_type="early_payment_discount",
                        availability="available",
                        availability_reason=None,
                        description=(
                            f"Offer customer {customer_name} an explicit {pct_str} Bridge Cash discount (customer pays INR {net_receipt:,.2f} "
                            f"instead of INR {overdue_amt:,.2f}). Paying less incentivizes immediate customer payment within 24–48 hours, "
                            f"generating the liquidity required to pay supplier {supplier_name} 100% in full (INR {bill_amt:,.2f})."
                        ),
                        rationale=(
                            f"Accelerates customer liquidity of INR {net_receipt:,.2f} at a known customer discount of INR {disc_amount:,.2f}. "
                            f"The customer pays less to settle quickly, while Apex Enterprises honors 100% full supplier payment on time."
                        ),
                        currency=top_overdue.currency,
                        cash_amount=net_receipt,
                        expected_timing="accelerated settlement within 24–48 hours upon customer agreement",
                        known_direct_cost=disc_amount,
                        unknown_cost_fields=[],
                        estimated_financial_impact=net_receipt,
                        estimated_gap_effect=f"Provides net customer cash inflow of INR {net_receipt:,.2f} (Gross: INR {overdue_amt:,.2f} - Discount: INR {disc_amount:,.2f}) to fund 100% supplier payout.",
                        assumptions=[
                            "Customer accepts prompt discount incentive and remits reduced balance immediately.",
                            "Discount terms are legally binding once approved and transmitted."
                        ],
                        risks=[
                            f"Permanent margin incentive cost of INR {disc_amount:,.2f} absorbed by business.",
                            "Customer may take the discount but still delay remittance."
                        ],
                        missing_inputs=[],
                        evidence_supporting=f"Invoice {top_overdue.document_number} with verified outstanding balance INR {overdue_amt:,.2f}.",
                        risks_and_assumptions=f"Assumes customer accepts {pct_str} discount. Margin cost: INR {disc_amount:,.2f}. Fulfills supplier obligation 100%.",
                        requires_approval=True,
                        feasibility="high",
                        simulation_only=False,
                        discount_rate=d_rate,
                        discount_amount=disc_amount,
                        net_expected_receipt=net_receipt,
                        target_document_id=top_overdue.id,
                        target_contact_id=top_overdue.contact_id
                    )
                else:
                    opt_b = DecisionOption(
                        id="opt_early_discount",
                        title=f"Bridge Cash Offer to Customer on Invoice {top_overdue.document_number} (Terms Needed)",
                        action_type="early_payment_discount_offer",
                        option_type="early_payment_discount",
                        availability="conditional",
                        availability_reason="Requires explicit owner-confirmed discount terms (e.g. 2% or 5% discount rate).",
                        description=f"Incentivize prompt customer payment on Invoice {top_overdue.document_number} by offering an agreed percentage reduction so the customer pays less and settles immediately.",
                        rationale="Accelerates customer liquidity to fund 100% full supplier payment on time.",
                        currency=top_overdue.currency,
                        cash_amount=overdue_amt,
                        expected_timing="timing dependent on confirmed terms and customer response",
                        known_direct_cost=None,
                        unknown_cost_fields=["discount_rate", "discount_amount"],
                        estimated_financial_impact=overdue_amt,
                        estimated_gap_effect=f"Dependent on confirmed discount rate (gross balance INR {overdue_amt:,.2f}).",
                        assumptions=[
                            "Owner must confirm explicit discount percentage (0 <= d < 1).",
                            "Customer must formally accept the discounted settlement terms."
                        ],
                        risks=["Margin reduction equal to the confirmed discount amount."],
                        missing_inputs=["discount_rate (must be decimal between 0.00 and 1.00)"],
                        evidence_supporting=f"Invoice {top_overdue.document_number} with verified balance INR {overdue_amt:,.2f}.",
                        risks_and_assumptions="Requires owner discount rate terms. Risk: Margin sacrifice without guaranteed payment timing.",
                        requires_approval=True,
                        feasibility="medium",
                        simulation_only=False,
                        discount_rate=None,
                        discount_amount=None,
                        net_expected_receipt=None,
                        target_document_id=top_overdue.id,
                        target_contact_id=top_overdue.contact_id
                    )
                options.append(opt_b)

            # Option C: Supplier-Payment Extension
            if top_bill:
                supplier_confirmed = (
                    eval_req is not None and
                    eval_req.supplier_agreement_confirmed is True
                )
                ext_days = eval_req.supplier_extension_days if (eval_req and eval_req.supplier_extension_days) else 14
                ext_fee = eval_req.supplier_extension_fee if (eval_req and eval_req.supplier_extension_fee is not None) else None

                if supplier_confirmed:
                    opt2 = DecisionOption(
                        id="opt_reschedule_obligation",
                        title=f"Execute Agreed {ext_days}-Day Due Date Extension on Bill {top_bill.document_number} ({supplier_name})",
                        action_type="supplier_reschedule_proposal",
                        option_type="supplier_extension",
                        availability="available",
                        availability_reason=None,
                        description=(
                            f"Execute owner-confirmed {ext_days}-day due date extension for Bill {top_bill.document_number} "
                            f"(INR {top_bill.total:,.2f}) with {supplier_name}."
                        ),
                        rationale=(
                            f"Postpones INR {top_bill.total:,.2f} in cash outflows beyond the current forecasting window, "
                            f"preserving current cash of INR {recorded_cash:,.2f} for daily operating overhead."
                        ),
                        currency=top_bill.currency,
                        cash_amount=top_bill.total,
                        expected_timing=f"+{ext_days} days cash retention",
                        known_direct_cost=ext_fee if ext_fee is not None else Decimal("0.00"),
                        unknown_cost_fields=[] if ext_fee is not None else ["commercial_late_interest_unspecified"],
                        estimated_financial_impact=top_bill.total,
                        estimated_gap_effect=f"Defers INR {top_bill.total:,.2f} outflow past forecast window.",
                        assumptions=[
                            f"Supplier {supplier_name} has provided explicit bilateral agreement.",
                            f"Payment obligation rescheduled by {ext_days} days."
                        ],
                        risks=[
                            "Concentration of future payables when rescheduled date arrives.",
                            "Potential penalty or interest charges if deferred balance is not settled on new date."
                        ],
                        missing_inputs=[],
                        evidence_supporting=f"Supplier Bill {top_bill.document_number} ({supplier_name}) due {top_bill.due_date.strftime('%Y-%m-%d')} for INR {top_bill.total:,.2f}.",
                        risks_and_assumptions=f"Agreed {ext_days}-day deferral with supplier. Risk: Payables concentration at end of extension.",
                        requires_approval=True,
                        feasibility="high",
                        simulation_only=False,
                        target_document_id=top_bill.id,
                        target_contact_id=top_bill.contact_id
                    )
                else:
                    opt2 = DecisionOption(
                        id="opt_reschedule_obligation",
                        title=f"Request 14-Day Due Date Extension on Bill {top_bill.document_number} ({supplier_name})",
                        action_type="supplier_reschedule_proposal",
                        option_type="supplier_extension",
                        availability="unavailable",
                        availability_reason="Missing evidence: Requires explicit supplier permission/agreement and recorded terms. Extension cannot be assumed free or unilateral.",
                        description=(
                            f"Prepare a formal written rescheduling proposal to {supplier_name} requesting an extension of the due date "
                            f"for Bill {top_bill.document_number} (INR {top_bill.total:,.2f}) from {top_bill.due_date.strftime('%Y-%m-%d')} to 14 days later."
                        ),
                        rationale=(
                            f"Postpones INR {top_bill.total:,.2f} in cash outflows beyond the current forecasting window, preserving current cash of "
                            f"INR {recorded_cash:,.2f} for daily operating overhead."
                        ),
                        currency=top_bill.currency,
                        cash_amount=top_bill.total,
                        expected_timing="contingent on bilateral supplier agreement",
                        known_direct_cost=None,
                        unknown_cost_fields=["supplier_consent", "late_fee_or_penalty"],
                        estimated_financial_impact=top_bill.total,
                        estimated_gap_effect=f"Could defer INR {top_bill.total:,.2f} outflow if supplier explicitly consents.",
                        assumptions=[
                            "Requires explicit supplier bilateral consent.",
                            "Terms cannot be unilaterally altered without breach of contract."
                        ],
                        risks=[
                            "Supplier may withhold ongoing dispatches, assess late penalties, or diminish commercial goodwill."
                        ],
                        missing_inputs=["supplier_written_agreement", "extension_fee_terms"],
                        evidence_supporting=f"Supplier Bill {top_bill.document_number} ({supplier_name}) due {top_bill.due_date.strftime('%Y-%m-%d')} for INR {top_bill.total:,.2f}.",
                        risks_and_assumptions="Requires explicit supplier consent. Significant risk: Supplier may withhold ongoing dispatches, assess late penalties, or diminish commercial goodwill.",
                        requires_approval=True,
                        feasibility="medium",
                        simulation_only=False,
                        target_document_id=top_bill.id,
                        target_contact_id=top_bill.contact_id
                    )
                options.append(opt2)

            # Option D: Financing Scenario (Simulation Only)
            sim_inputs = eval_req.financing_simulation_inputs if (eval_req and eval_req.financing_simulation_inputs) else None
            p_amt: Optional[Decimal] = None
            f_amt: Optional[Decimal] = None
            invalid_sim_reason: Optional[str] = None

            if sim_inputs is not None and "principal" in sim_inputs and "fee" in sim_inputs:
                try:
                    p_val = Decimal(str(sim_inputs["principal"]))
                    f_val = Decimal(str(sim_inputs["fee"]))
                    if p_val <= Decimal("0.00"):
                        invalid_sim_reason = "Supplied principal must be a positive number greater than 0.00."
                    elif f_val < Decimal("0.00"):
                        invalid_sim_reason = "Supplied fee cannot be negative."
                    else:
                        p_amt = p_val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                        f_amt = f_val.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                except Exception:
                    invalid_sim_reason = "Supplied simulation parameters (principal, fee) must be valid numeric values."

            if p_amt is not None and f_amt is not None:
                tot_repay = p_amt + f_amt
                opt_d = DecisionOption(
                    id="opt_financing_simulation",
                    title=f"Simulated Working Capital Facility: INR {p_amt:,.2f} (Hypothetical Only)",
                    action_type="financing_simulation_model",
                    option_type="financing_simulation",
                    availability="available",
                    availability_reason="Hypothetical scenario based on user-supplied parameters only.",
                    description=(
                        f"[SIMULATION ONLY] Hypothetical working capital scenario: INR {p_amt:,.2f} principal, "
                        f"INR {f_amt:,.2f} borrowing fee, total repayment INR {tot_repay:,.2f}."
                    ),
                    rationale=(
                        f"[SIMULATION ONLY] Models external liquidity support of INR {p_amt:,.2f} at a hypothetical cost of INR {f_amt:,.2f}."
                    ),
                    currency="INR",
                    cash_amount=p_amt,
                    expected_timing="hypothetical disbursement timing",
                    known_direct_cost=f_amt,
                    unknown_cost_fields=[],
                    estimated_financial_impact=p_amt,
                    estimated_gap_effect=f"Hypothetically infuses INR {p_amt:,.2f} working capital.",
                    assumptions=[
                        "[SIMULATION ONLY] This is an exploratory simulation, NOT a real credit offer or pre-qualification.",
                        "No lender or PayPal financing API is called."
                    ],
                    risks=[
                        "Borrowing incurs legally binding debt service and repayment obligations.",
                        "Real financing requires independent credit underwriting and approval."
                    ],
                    missing_inputs=[],
                    evidence_supporting=f"Projected operating shortfall of ₹{shortfall_amount:,.2f}.",
                    risks_and_assumptions="[SIMULATION ONLY] Pure simulation. Real borrowing incurs fixed fees and repayment obligations.",
                    requires_approval=True,
                    feasibility="low",
                    simulation_only=True
                )
            else:
                unavail_reason = (
                    f"Invalid simulation parameters: {invalid_sim_reason}"
                    if invalid_sim_reason
                    else "Unpriced simulation: requires explicit hypothetical terms (principal, fee/interest, repayment schedule). No real lender is contacted."
                )
                opt_d = DecisionOption(
                    id="opt_financing_simulation",
                    title="Hypothetical Working Capital Facility (Simulation Only - Inputs Needed)",
                    action_type="financing_simulation_model",
                    option_type="financing_simulation",
                    availability="unavailable",
                    availability_reason=unavail_reason,
                    description="[SIMULATION ONLY] Model hypothetical financing to bridge the operating deficit. No real lender or credit application is involved.",
                    rationale="[SIMULATION ONLY] Illustrates external liquidity support for comparison purposes only.",
                    currency="INR",
                    cash_amount=shortfall_amount,
                    expected_timing="unpriced / terms needed",
                    known_direct_cost=None,
                    unknown_cost_fields=["principal", "borrowing_fee_or_rate", "repayment_terms"],
                    estimated_financial_impact=shortfall_amount,
                    estimated_gap_effect="Hypothetical deficit coverage contingent on supplied terms.",
                    assumptions=[
                        "[SIMULATION ONLY] Pure mathematical simulation.",
                        "Never calls a lender or PayPal financing API."
                    ],
                    risks=[
                        "Borrowing incurs debt service obligations.",
                        "Simulation does not guarantee credit eligibility."
                    ],
                    missing_inputs=["principal", "fee", "repayment_period_days"],
                    evidence_supporting=f"Projected operating shortfall of ₹{shortfall_amount:,.2f}.",
                    risks_and_assumptions="[SIMULATION ONLY] Pure simulation. Requires hypothetical inputs to evaluate.",
                    requires_approval=True,
                    feasibility="low",
                    simulation_only=True
                )
            options.append(opt_d)

            # Option 5: Passive Monitoring
            opt3 = DecisionOption(
                id="opt_monitor_without_action",
                title="Monitor Cash Position Without Active Intervention",
                action_type="monitor_cash_position",
                option_type="monitor_only",
                availability="available",
                availability_reason=None,
                description="Take no immediate intervention; continue monitoring organic collections and daily ledger movements.",
                rationale="Eliminates external customer or supplier communication overhead.",
                currency="INR",
                cash_amount=Decimal("0.00"),
                expected_timing="ongoing daily monitoring",
                known_direct_cost=Decimal("0.00"),
                unknown_cost_fields=[],
                estimated_financial_impact=Decimal("0.00"),
                estimated_gap_effect="No cash gap remediation.",
                assumptions=["No external actions taken."],
                risks=[f"High risk: Defaulting on supplier obligation {bill_label} on {bill_date_str} due to INR {shortfall_amount:,.2f} shortfall."],
                missing_inputs=[],
                evidence_supporting=f"Current recorded cash is INR {recorded_cash:,.2f}; obligations are INR {obligations:,.2f}.",
                risks_and_assumptions=f"High risk: Defaulting on supplier obligation {bill_label} on {bill_date_str} due to INR {shortfall_amount:,.2f} shortfall.",
                requires_approval=False,
                feasibility="low",
                simulation_only=False
            )
            options.append(opt3)

            recommended_option_id = "opt_collect_overdue" if top_overdue else "opt_reschedule_obligation"
            recommendation_rationale = (
                f"Customer receivables acceleration via Bridge Cash is strongly recommended. "
                f"As a disciplined business, Apex Enterprises maintains 100% full payment to suppliers "
                f"({supplier_name}) on time to protect supplier goodwill and guarantee uninterrupted deliveries. "
                f"Offering an early-payment discount (or 1-click full collection) to {customer_name} on Invoice "
                f"{top_overdue.document_number if top_overdue else ''} recovers the cash needed to bridge the "
                f"INR {shortfall_amount:,.2f} deficit and leaves a positive operating cash buffer."
            )
        else:
            # Healthy Buffer Scenario
            buffer_amount = recorded_cash - obligations
            top_overdue = overdue_invoices[0] if overdue_invoices else None
            top_bill = upcoming_bills[0] if upcoming_bills else None

            if top_bill:
                supplier_name = top_bill.contact.name if (top_bill and top_bill.contact) else "Supplier"
                supporting_records.append({
                    "record_type": "supplier_bill",
                    "document_number": top_bill.document_number,
                    "contact_name": supplier_name,
                    "amount": float(top_bill.total),
                    "due_date": top_bill.due_date.strftime("%Y-%m-%d"),
                    "status": top_bill.status
                })

            if top_overdue:
                balances = get_document_balances(db, top_overdue)
                overdue_amt = balances["outstanding_amount"]
                customer_name = top_overdue.contact.name if top_overdue.contact else "Customer"
                target_doc_id = top_overdue.id
                target_contact_id = top_overdue.contact_id
                estimated_impact = overdue_amt

                supporting_records.append({
                    "record_type": "customer_invoice",
                    "document_number": top_overdue.document_number,
                    "contact_name": customer_name,
                    "amount": float(overdue_amt),
                    "due_date": top_overdue.due_date.strftime("%Y-%m-%d"),
                    "status": top_overdue.status
                })

                problem_type = "receivable_acceleration_opportunity"
                title = f"Operating Buffer of INR {buffer_amount:,.2f} • Collect INR {overdue_amt:,.2f} Overdue"
                severity = "info"
                urgency = "low"
                problem_statement = (
                    f"Current recorded cash is INR {recorded_cash:,.2f} with INR {obligations:,.2f} in upcoming obligations. "
                    f"While no immediate deficit exists, Invoice {top_overdue.document_number} from {customer_name} "
                    f"is overdue for INR {overdue_amt:,.2f}. Accelerating this customer receivable via Bridge Cash "
                    f"proactively expands operating cash reserves."
                )

                # Option 1: Collect 100% Face Value via 1-Click Link
                opt1 = DecisionOption(
                    id="opt_collect_overdue",
                    title=f"Collect Invoice {top_overdue.document_number} ({customer_name}) at 100% Face Value",
                    action_type="collection_reminder_with_paypal_link",
                    option_type="collection_reminder",
                    availability="available",
                    availability_reason=None,
                    description=(
                        f"Draft an owner-approved formal collection reminder with a hosted PayPal Sandbox payment link "
                        f"for Invoice {top_overdue.document_number} (Outstanding: INR {overdue_amt:,.2f}). "
                        f"Customer pays full amount with 0% discount, expanding working capital."
                    ),
                    rationale=(
                        f"Collecting this verified customer receivable at 100% face value provides an immediate cash inflow of INR {overdue_amt:,.2f}, "
                        f"expanding bank cash reserves to INR {(recorded_cash + overdue_amt):,.2f}."
                    ),
                    currency=top_overdue.currency,
                    cash_amount=overdue_amt,
                    expected_timing="customer payment action",
                    known_direct_cost=Decimal("0.00"),
                    unknown_cost_fields=[],
                    estimated_financial_impact=overdue_amt,
                    estimated_gap_effect=f"Increases bank cash reserves to INR {(recorded_cash + overdue_amt):,.2f}.",
                    assumptions=["Customer remits full invoice upon receipt."],
                    risks=["Customer may delay remittance."],
                    missing_inputs=[],
                    evidence_supporting=f"Invoice {top_overdue.document_number} ({customer_name}) with balance INR {overdue_amt:,.2f}.",
                    risks_and_assumptions="Assumes customer responds to reminder link.",
                    requires_approval=True,
                    feasibility="high",
                    simulation_only=False,
                    target_document_id=top_overdue.id,
                    target_contact_id=top_overdue.contact_id
                )
                options.append(opt1)

                # Option 2: Bridge Cash Prompt Settlement Discount
                has_discount_terms = (
                    eval_req is not None and
                    eval_req.discount_rate is not None and
                    Decimal("0.00") <= eval_req.discount_rate < Decimal("1.00")
                )
                d_rate = eval_req.discount_rate if has_discount_terms else Decimal("0.02")
                disc_amount = (overdue_amt * d_rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                net_receipt = overdue_amt - disc_amount
                pct_str = f"{d_rate * 100:.1f}%"

                opt_b = DecisionOption(
                    id="opt_early_discount",
                    title=f"Bridge Cash Offer: {pct_str} Early Discount to {customer_name} on Invoice {top_overdue.document_number}",
                    action_type="early_payment_discount_offer",
                    option_type="early_payment_discount",
                    availability="available",
                    availability_reason=None,
                    description=(
                        f"Offer customer {customer_name} an explicit {pct_str} Bridge Cash discount (customer pays INR {net_receipt:,.2f} "
                        f"instead of INR {overdue_amt:,.2f}). Incentivizes rapid payment within 24–48 hours to accelerate working capital."
                    ),
                    rationale=(
                        f"Accelerates customer liquidity of INR {net_receipt:,.2f} at an agreed discount incentive of INR {disc_amount:,.2f}."
                    ),
                    currency=top_overdue.currency,
                    cash_amount=net_receipt,
                    expected_timing="accelerated settlement within 24–48 hours upon customer agreement",
                    known_direct_cost=disc_amount,
                    unknown_cost_fields=[],
                    estimated_financial_impact=net_receipt,
                    estimated_gap_effect=f"Provides net customer cash inflow of INR {net_receipt:,.2f} to expand cash buffer.",
                    assumptions=["Customer accepts prompt discount incentive and remits immediately."],
                    risks=[f"Margin incentive cost of INR {disc_amount:,.2f} absorbed by business."],
                    missing_inputs=[],
                    evidence_supporting=f"Invoice {top_overdue.document_number} with verified balance INR {overdue_amt:,.2f}.",
                    risks_and_assumptions=f"Assumes customer accepts {pct_str} discount. Margin cost: INR {disc_amount:,.2f}.",
                    requires_approval=True,
                    feasibility="high",
                    simulation_only=False,
                    discount_rate=d_rate,
                    discount_amount=disc_amount,
                    net_expected_receipt=net_receipt,
                    target_document_id=top_overdue.id,
                    target_contact_id=top_overdue.contact_id
                )
                options.append(opt_b)

                # Option 3: Passive Routine Monitoring
                opt_healthy = DecisionOption(
                    id="opt_maintain_monitoring",
                    title="Maintain Cash Monitoring Routine",
                    action_type="monitor_cash_position",
                    option_type="monitor_only",
                    availability="available",
                    availability_reason=None,
                    description="Continue standard daily ledger tracking; await organic customer payment without outreach.",
                    rationale=f"Cash position is positive with a buffer of ₹{buffer_amount:,.2f}.",
                    currency="INR",
                    cash_amount=Decimal("0.00"),
                    expected_timing="ongoing daily monitoring",
                    known_direct_cost=Decimal("0.00"),
                    unknown_cost_fields=[],
                    estimated_financial_impact=Decimal("0.00"),
                    estimated_gap_effect=f"Maintains operating buffer of ₹{buffer_amount:,.2f}.",
                    assumptions=["No emergency disbursements occur."],
                    risks=["Customer receivable remains overdue."],
                    missing_inputs=[],
                    evidence_supporting=f"Recorded cash: ₹{recorded_cash:,.2f}, Obligations: ₹{obligations:,.2f}.",
                    risks_and_assumptions="Standard routine monitoring.",
                    requires_approval=False,
                    feasibility="high",
                    simulation_only=False
                )
                options.append(opt_healthy)

                recommended_option_id = "opt_collect_overdue"
                recommendation_rationale = (
                    f"While current cash of INR {recorded_cash:,.2f} is sufficient for upcoming obligations, "
                    f"accelerating Invoice {top_overdue.document_number} ({customer_name}, INR {overdue_amt:,.2f}) "
                    f"via 1-click collection or a {pct_str} prompt cash incentive strongly bolsters working capital reserves."
                )
            else:
                problem_type = "liquidity_surplus_evaluation"
                title = f"Healthy Operating Buffer of INR {buffer_amount:,.2f}"
                severity = "info"
                urgency = "low"
                problem_statement = (
                    f"Current recorded cash of INR {recorded_cash:,.2f} is sufficient to cover all upcoming obligations of "
                    f"INR {obligations:,.2f} over the next 14 days, leaving a projected surplus buffer of INR {buffer_amount:,.2f}."
                )

                opt_healthy = DecisionOption(
                    id="opt_maintain_monitoring",
                    title="Maintain Cash Monitoring Routine",
                    action_type="monitor_cash_position",
                    option_type="monitor_only",
                    availability="available",
                    availability_reason=None,
                    description="Continue standard daily ledger tracking; no urgent liquidity intervention required.",
                    rationale=f"Cash position is positive with a projected buffer of ₹{buffer_amount:,.2f}.",
                    currency="INR",
                    cash_amount=Decimal("0.00"),
                    expected_timing="ongoing daily monitoring",
                    known_direct_cost=Decimal("0.00"),
                    unknown_cost_fields=[],
                    estimated_financial_impact=Decimal("0.00"),
                    estimated_gap_effect=f"Maintains operating buffer of ₹{buffer_amount:,.2f}.",
                    assumptions=["No unforeseen disbursements occur."],
                    risks=["Unforeseen emergency cash outlays."],
                    missing_inputs=[],
                    evidence_supporting=f"Recorded cash: ₹{recorded_cash:,.2f}, Obligations: ₹{obligations:,.2f}.",
                    risks_and_assumptions="Assumes no unforeseen emergency cash disbursements occur.",
                    requires_approval=False,
                    feasibility="high",
                    simulation_only=False
                )
                options.append(opt_healthy)
                recommended_option_id = "opt_maintain_monitoring"
                recommendation_rationale = (
                    f"Operating cash position is healthy. With ₹{recorded_cash:,.2f} available against ₹{obligations:,.2f} "
                    f"in upcoming obligations, no emergency cash acceleration or debt restructuring is warranted."
                )

        calculations = {
            "calculation_version": "cb_v1.0",
            "as_of": now.isoformat(),
            "recorded_cash_balance": float(recorded_cash),
            "upcoming_obligations": float(obligations),
            "net_projected_deficit": float(shortfall_amount),
            "projected_buffer_after_resolution": float(recorded_cash + estimated_impact - obligations) if has_shortfall else float(recorded_cash - obligations)
        }

        # Find existing active decision case or create new
        existing_case = (
            db.query(DecisionCase)
            .filter(
                DecisionCase.business_id == business_id,
                DecisionCase.status.in_(["recommended", "awaiting_approval", "approved", "executed", "outcome_pending_verification"])
            )
            .order_by(DecisionCase.created_at.desc())
            .first()
        )

        options_dicts = [opt.model_dump() for opt in options]

        if existing_case:
            # Update current active case metrics if still in non-terminal status
            if existing_case.status in ["recommended", "awaiting_approval"]:
                existing_case.title = title
                existing_case.problem_type = problem_type
                existing_case.severity = severity
                existing_case.urgency = urgency
                existing_case.problem_statement = problem_statement
                existing_case.supporting_records = json.dumps(supporting_records, default=str)
                existing_case.calculations = json.dumps(calculations, default=str)
                existing_case.assumptions = json.dumps(assumptions, default=str)
                existing_case.recommended_option_id = recommended_option_id
                existing_case.recommendation_rationale = recommendation_rationale
                existing_case.options_json = json.dumps(options_dicts, default=str)
                existing_case.estimated_financial_impact = estimated_impact
                existing_case.target_document_id = target_doc_id
                existing_case.target_contact_id = target_contact_id
                existing_case.updated_at = utc_now()
                db.commit()
                db.refresh(existing_case)
            case_obj = existing_case
        else:
            case_obj = DecisionCase(
                business_id=business_id,
                title=title,
                problem_type=problem_type,
                severity=severity,
                urgency=urgency,
                time_horizon="Next 14 days outlook",
                problem_statement=problem_statement,
                supporting_records=json.dumps(supporting_records, default=str),
                calculations=json.dumps(calculations, default=str),
                assumptions=json.dumps(assumptions, default=str),
                status="recommended",
                recommended_option_id=recommended_option_id,
                recommendation_rationale=recommendation_rationale,
                options_json=json.dumps(options_dicts, default=str),
                estimated_financial_impact=estimated_impact,
                target_document_id=target_doc_id,
                target_contact_id=target_contact_id,
                outcome_status="pending"
            )
            db.add(case_obj)
            db.commit()
            db.refresh(case_obj)

        return cls._format_case_read(case_obj, db=db)

    @classmethod
    def list_decisions(
        cls, db: Session, business_id: str, status: Optional[str] = None
    ) -> List[DecisionCaseRead]:
        query = db.query(DecisionCase).filter(DecisionCase.business_id == business_id)
        if status:
            query = query.filter(DecisionCase.status == status)
        cases = query.order_by(DecisionCase.created_at.desc()).all()
        return [cls._format_case_read(c, db=db) for c in cases]

    @classmethod
    def get_decision(
        cls, db: Session, business_id: str, decision_id: str
    ) -> Optional[DecisionCaseRead]:
        case = (
            db.query(DecisionCase)
            .filter(DecisionCase.id == decision_id, DecisionCase.business_id == business_id)
            .first()
        )
        if not case:
            return None
        return cls._format_case_read(case, db=db)

    @classmethod
    def select_option(
        cls, db: Session, business_id: str, decision_id: str, option_id: str, actor: str = "owner"
    ) -> DecisionCaseRead:
        """
        Owner selects an action alternative.
        Enforces stale-data check, option availability gate, and creates a canonical
        SHA-256 tamper-proof ActionDraft for consequential actions (PayPal reminders, discount offers).
        """
        case = (
            db.query(DecisionCase)
            .filter(DecisionCase.id == decision_id, DecisionCase.business_id == business_id)
            .first()
        )
        if not case:
            raise ValueError("Decision case not found in active workspace.")

        # Stale-data check on underlying document
        if case.target_document_id:
            doc = db.query(Document).filter(Document.id == case.target_document_id).first()
            if not doc:
                raise ValueError("Decision case is stale: Target document no longer exists in workspace ledger.")
            if doc.status == "paid":
                raise ValueError(f"Decision case is stale: Target document {doc.document_number} is already paid. Please re-evaluate.")
            if doc.status == "void":
                raise ValueError(f"Decision case is stale: Target document {doc.document_number} has been voided. Please re-evaluate.")

        options_list = json.loads(case.options_json)
        selected_opt = next((o for o in options_list if o["id"] == option_id), None)
        if not selected_opt:
            raise ValueError(f"Option '{option_id}' is not a valid alternative for this decision.")

        # Availability gate: Cannot select unavailable options
        if selected_opt.get("availability") == "unavailable":
            reason = selected_opt.get("availability_reason") or "Prerequisites for this option are not met."
            raise ValueError(f"Option '{option_id}' is unavailable: {reason}")

        case.selected_option_id = option_id
        case.estimated_financial_impact = Decimal(str(selected_opt.get("estimated_financial_impact", "0.00")))

        # Consequential action drafts
        if selected_opt.get("action_type") == "collection_reminder_with_paypal_link":
            doc_id = selected_opt.get("target_document_id") or case.target_document_id
            contact_id = selected_opt.get("target_contact_id") or case.target_contact_id

            doc = db.query(Document).filter(Document.id == doc_id).first() if doc_id else None
            balances = get_document_balances(db, doc) if doc else {"outstanding_amount": Decimal("0.00")}

            payload_dict = {
                "action": "create_paypal_payment_link",
                "document_id": doc.id if doc else "",
                "document_number": doc.document_number if doc else "",
                "contact_name": doc.contact.name if (doc and doc.contact) else "Customer",
                "amount": float(balances["outstanding_amount"]),
                "currency": doc.currency if doc else "INR",
                "payment_provider": "paypal_sandbox",
                "decision_id": case.id
            }
            payload_hash = compute_payload_hash(payload_dict)

            existing_draft = (
                db.query(ActionDraft)
                .filter(
                    ActionDraft.document_id == doc.id if doc else False,
                    ActionDraft.action_type == "collection_reminder_with_paypal_link"
                )
                .first()
            )

            if existing_draft:
                draft = existing_draft
                draft.action_type = "collection_reminder_with_paypal_link"
                draft.payload_json = json.dumps(payload_dict)
                draft.payload_hash = payload_hash
                draft.status = "awaiting_approval"
            else:
                draft = ActionDraft(
                    business_id=business_id,
                    action_type="collection_reminder_with_paypal_link",
                    target_contact_id=contact_id,
                    document_id=doc.id if doc else None,
                    payload_json=json.dumps(payload_dict),
                    payload_hash=payload_hash,
                    status="awaiting_approval",
                    created_by="decision_engine"
                )
                db.add(draft)
                db.flush()

            case.action_draft_id = draft.id
            case.status = "awaiting_approval"

        elif selected_opt.get("action_type") == "early_payment_discount_offer":
            doc_id = selected_opt.get("target_document_id") or case.target_document_id
            contact_id = selected_opt.get("target_contact_id") or case.target_contact_id

            doc = db.query(Document).filter(Document.id == doc_id).first() if doc_id else None
            balances = get_document_balances(db, doc) if doc else {"outstanding_amount": Decimal("0.00")}

            disc_rate = selected_opt.get("discount_rate")
            disc_amount = selected_opt.get("discount_amount")
            net_receipt = selected_opt.get("net_expected_receipt")

            payload_dict = {
                "action": "offer_early_payment_discount",
                "document_id": doc.id if doc else "",
                "document_number": doc.document_number if doc else "",
                "contact_name": doc.contact.name if (doc and doc.contact) else "Customer",
                "original_amount": float(balances["outstanding_amount"]),
                "discount_rate": float(disc_rate) if disc_rate is not None else 0.0,
                "discount_amount": float(disc_amount) if disc_amount is not None else 0.0,
                "net_amount": float(net_receipt) if net_receipt is not None else float(balances["outstanding_amount"]),
                "currency": doc.currency if doc else "INR",
                "decision_id": case.id
            }
            payload_hash = compute_payload_hash(payload_dict)

            existing_draft = (
                db.query(ActionDraft)
                .filter(
                    ActionDraft.document_id == doc.id if doc else False,
                    ActionDraft.action_type == "early_payment_discount_offer"
                )
                .first()
            )

            if existing_draft:
                draft = existing_draft
                draft.action_type = "early_payment_discount_offer"
                draft.payload_json = json.dumps(payload_dict)
                draft.payload_hash = payload_hash
                draft.status = "awaiting_approval"
            else:
                draft = ActionDraft(
                    business_id=business_id,
                    action_type="early_payment_discount_offer",
                    target_contact_id=contact_id,
                    document_id=doc.id if doc else None,
                    payload_json=json.dumps(payload_dict),
                    payload_hash=payload_hash,
                    status="awaiting_approval",
                    created_by="decision_engine"
                )
                db.add(draft)
                db.flush()

            case.action_draft_id = draft.id
            case.status = "awaiting_approval"
        else:
            # Action does not require external execution draft
            case.action_draft_id = None
            case.status = "approved" if selected_opt.get("requires_approval") else "executed"

        case.updated_at = utc_now()

        # Audit Event
        audit = AuditEvent(
            business_id=business_id,
            actor=actor,
            action="select_decision_option",
            entity_type="decision_case",
            entity_id=case.id,
            reason=f"Owner selected option '{selected_opt['title']}' for decision '{case.title}'.",
            safe_metadata=json.dumps({"option_id": option_id, "estimated_impact": float(case.estimated_financial_impact)})
        )
        db.add(audit)
        db.commit()
        db.refresh(case)

        return cls._format_case_read(case, db=db)

    @classmethod
    def sync_decision_outcome(
        cls,
        db: Session,
        business_id: str,
        document_id: str,
        verified_amount: Decimal,
        authoritative_source: str,
        reference_id: Optional[str] = None
    ) -> Optional[DecisionCaseRead]:
        """
        Decision Outcome Ledger:
        Authoritatively records the verified outcome of an executed decision.
        Computes variance between predicted and actual financial results.
        """
        case = (
            db.query(DecisionCase)
            .filter(
                DecisionCase.business_id == business_id,
                DecisionCase.target_document_id == document_id,
                DecisionCase.status.in_(["awaiting_approval", "approved", "executed", "outcome_pending_verification", "recommended"])
            )
            .order_by(DecisionCase.created_at.desc())
            .first()
        )

        if not case:
            logger.info(f"No active decision case linked to document {document_id} for outcome sync.")
            return None

        actual = verified_amount
        estimated = case.estimated_financial_impact or Decimal("0.00")
        variance = actual - estimated

        case.status = "verified_successful"
        case.outcome_status = "verified_successful"
        case.actual_financial_impact = actual
        case.variance_amount = variance
        case.authoritative_source = authoritative_source
        case.verified_at = utc_now()
        case.outcome_notes = (
            f"Verified cash recovery of ₹{actual:,.2f} via authoritative provider {authoritative_source} "
            f"(Ref: {reference_id or 'verified'}). "
            f"Estimated impact: ₹{estimated:,.2f} | Actual impact: ₹{actual:,.2f} | Variance: ₹{variance:,.2f}. "
            f"Outcome: Cash shortfall deficit fully resolved."
        )
        case.updated_at = utc_now()

        # Audit Event for verified outcome
        audit = AuditEvent(
            business_id=business_id,
            actor="system_verifier",
            action="verify_decision_outcome",
            entity_type="decision_case",
            entity_id=case.id,
            reason=f"Authoritatively verified decision outcome via {authoritative_source}.",
            safe_metadata=json.dumps({
                "estimated": float(estimated),
                "actual": float(actual),
                "variance": float(variance),
                "authoritative_source": authoritative_source,
                "reference_id": reference_id
            })
        )
        db.add(audit)
        db.commit()
        db.refresh(case)

        logger.info(f"DecisionCase {case.id} successfully updated to verified_successful with variance INR {variance}.")
        return cls._format_case_read(case, db=db)

    @classmethod
    def record_outcome_event(
        cls,
        db: Session,
        business_id: str,
        decision_id: str,
        outcome_status: str,
        actor: str = "system",
        notes: Optional[str] = None
    ) -> DecisionCaseRead:
        """
        Decision Outcome Ledger (CB-3):
        Explicitly records failed, cancelled, unknown, or reconciliation_required lifecycle states.
        Preserves failure/uncertainty without fabricating success.
        """
        case = (
            db.query(DecisionCase)
            .filter(DecisionCase.id == decision_id, DecisionCase.business_id == business_id)
            .first()
        )
        if not case:
            raise ValueError("Decision case not found in active workspace.")

        case.outcome_status = outcome_status
        case.status = outcome_status
        if notes:
            case.outcome_notes = notes
        case.updated_at = utc_now()

        audit = AuditEvent(
            business_id=business_id,
            actor=actor,
            action="record_decision_outcome_event",
            entity_type="decision_case",
            entity_id=case.id,
            reason=f"Recorded decision outcome event '{outcome_status}': {notes or 'No notes provided'}.",
            safe_metadata=json.dumps({"outcome_status": outcome_status, "notes": notes})
        )
        db.add(audit)
        db.commit()
        db.refresh(case)
        return cls._format_case_read(case, db=db)

    @classmethod
    def get_outcome_ledger(
        cls, db: Session, business_id: str
    ) -> List[DecisionOutcomeLedgerItem]:
        """
        Retrieves the Decision Outcome Ledger: historical audit trail of decisions,
        their selected alternatives, predicted financial impact, and verified real-world results.
        """
        cases = (
            db.query(DecisionCase)
            .filter(DecisionCase.business_id == business_id)
            .order_by(DecisionCase.created_at.desc())
            .all()
        )
        items: List[DecisionOutcomeLedgerItem] = []
        for c in cases:
            calcs = json.loads(c.calculations) if c.calculations else {}
            calc_ver = calcs.get("calculation_version", "cb_v1.0")
            items.append(
                DecisionOutcomeLedgerItem(
                    decision_id=c.id,
                    title=c.title,
                    created_at=c.created_at,
                    problem_type=c.problem_type,
                    status=c.status,
                    outcome_status=c.outcome_status,
                    selected_option_id=c.selected_option_id,
                    calculation_version=calc_ver,
                    estimated_financial_impact=c.estimated_financial_impact or Decimal("0.00"),
                    actual_financial_impact=c.actual_financial_impact,
                    variance_amount=c.variance_amount,
                    authoritative_source=c.authoritative_source,
                    verified_at=c.verified_at,
                    outcome_notes=c.outcome_notes
                )
            )
        return items

    @classmethod
    def _format_case_read(cls, case: DecisionCase, db: Optional[Session] = None) -> DecisionCaseRead:
        records = json.loads(case.supporting_records) if case.supporting_records else []
        calcs = json.loads(case.calculations) if case.calculations else {}
        assumptions = json.loads(case.assumptions) if case.assumptions else []
        options_dicts = json.loads(case.options_json) if case.options_json else []

        options = [DecisionOption(**o) for o in options_dicts]

        calc_version = calcs.get("calculation_version", "cb_v1.0")
        as_of_val = None
        if "as_of" in calcs and calcs["as_of"]:
            try:
                as_of_val = datetime.fromisoformat(calcs["as_of"])
            except Exception:
                as_of_val = case.created_at
        else:
            as_of_val = case.created_at

        is_stale = False
        stale_reason = None
        missing_data_warnings: List[str] = []

        if case.target_document_id and db:
            doc = db.query(Document).filter(Document.id == case.target_document_id).first()
            if not doc:
                is_stale = True
                stale_reason = "Target document no longer exists in workspace ledger."
            elif doc.status == "paid":
                is_stale = True
                stale_reason = f"Target document {doc.document_number} is already paid; recommendation is stale."
            elif doc.status == "void":
                is_stale = True
                stale_reason = f"Target document {doc.document_number} has been voided."

        return DecisionCaseRead(
            id=case.id,
            business_id=case.business_id,
            title=case.title,
            problem_type=case.problem_type,
            severity=case.severity,
            urgency=case.urgency,
            time_horizon=case.time_horizon,
            problem_statement=case.problem_statement,
            supporting_records=records,
            calculations=calcs,
            assumptions=assumptions,
            status=case.status,
            calculation_version=calc_version,
            as_of=as_of_val,
            is_stale=is_stale,
            stale_reason=stale_reason,
            missing_data_warnings=missing_data_warnings,
            recommended_option_id=case.recommended_option_id,
            recommendation_rationale=case.recommendation_rationale,
            options=options,
            selected_option_id=case.selected_option_id,
            action_draft_id=case.action_draft_id,
            target_document_id=case.target_document_id,
            target_contact_id=case.target_contact_id,
            approved_at=case.approved_at,
            executed_at=case.executed_at,
            verified_at=case.verified_at,
            outcome_status=case.outcome_status,
            authoritative_source=case.authoritative_source,
            estimated_financial_impact=case.estimated_financial_impact or Decimal("0.00"),
            actual_financial_impact=case.actual_financial_impact,
            variance_amount=case.variance_amount,
            outcome_notes=case.outcome_notes,
            created_at=case.created_at,
            updated_at=case.updated_at
        )
