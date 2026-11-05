from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import (
    DecisionCaseRead, DecisionSelectOptionRequest,
    DecisionOutcomeLedgerItem, DecisionEvaluateRequest
)
from ..services.decision_service import DecisionService
from ..auth import WorkspaceContext, get_workspace_context, require_owner_role

router = APIRouter(prefix="/api/v1/decisions", tags=["Decision Engine & Outcome Ledger"])

@router.get("", response_model=List[DecisionCaseRead])
def list_decisions(
    status: Optional[str] = Query(None, description="Filter decisions by status"),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    """
    List all decision cases for the active business workspace.
    Enforces server-side tenant isolation.
    """
    return DecisionService.list_decisions(db, ctx.business.id, status=status)

@router.post("/evaluate", response_model=DecisionCaseRead)
def evaluate_decision_case(
    req: Optional[DecisionEvaluateRequest] = None,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    """
    Triggers the Cash Solution Comparison Engine to evaluate verified ledger records,
    detect financial risks or opportunities, and generate structured decision alternatives.
    """
    return DecisionService.evaluate_decision(db, ctx.business.id, eval_req=req)

@router.get("/ledger/outcomes", response_model=List[DecisionOutcomeLedgerItem])
def get_decision_outcome_ledger(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    """
    Decision Outcome Ledger:
    Retrieves the persistent audit ledger of decisions and their authoritatively verified outcomes,
    including predicted impact, actual impact, and calculated variances.
    """
    return DecisionService.get_outcome_ledger(db, ctx.business.id)

@router.get("/{decision_id}", response_model=DecisionCaseRead)
def get_decision(
    decision_id: str,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    """
    Get detailed information for a specific decision case.
    """
    case = DecisionService.get_decision(db, ctx.business.id, decision_id)
    if not case:
        raise HTTPException(status_code=404, detail="Decision case not found in active workspace.")
    return case

@router.post("/{decision_id}/select-option", response_model=DecisionCaseRead)
def select_decision_option(
    decision_id: str,
    req: DecisionSelectOptionRequest,
    ctx: WorkspaceContext = Depends(require_owner_role),
    db: Session = Depends(get_db)
):
    """
    Owner selects an action alternative for the decision case.
    Requires verified owner role (browser-supplied role headers untrusted).
    If the alternative prepares an external workflow (e.g. PayPal collection),
    a tamper-proof ActionDraft is generated and linked.
    """
    try:
        return DecisionService.select_option(
            db=db,
            business_id=ctx.business.id,
            decision_id=decision_id,
            option_id=req.option_id,
            actor="owner"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{decision_id}/record-outcome", response_model=DecisionCaseRead)
def record_decision_outcome(
    decision_id: str,
    outcome_status: str = Query(..., description="verified_successful, failed, cancelled, unknown, reconciliation_required"),
    notes: Optional[str] = Query(None, description="Explanation or audit notes for this outcome event"),
    ctx: WorkspaceContext = Depends(require_owner_role),
    db: Session = Depends(get_db)
):
    """
    Record an outcome event on a decision case (CB-3 Decision Outcome Ledger).
    Preserves real-world failure, cancellation, or reconciliation status.
    """
    try:
        return DecisionService.record_outcome_event(
            db=db,
            business_id=ctx.business.id,
            decision_id=decision_id,
            outcome_status=outcome_status,
            actor=ctx.actor,
            notes=notes
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

