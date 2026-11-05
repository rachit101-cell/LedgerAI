from typing import List, Dict, Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import FinancialSummaryRead
from ..services.financial import get_financial_summary, check_anomalies
from ..auth import WorkspaceContext, get_workspace_context

router = APIRouter(prefix="/api/v1/reports", tags=["Financial Reports"])

@router.get("/summary", response_model=FinancialSummaryRead)
def get_summary(
    days_ahead: int = Query(14, description="Forecast horizon for upcoming supplier obligations"),
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    return get_financial_summary(db, ctx.business.id, days_ahead=days_ahead)

@router.get("/anomalies", response_model=List[Dict[str, Any]])
def get_anomalies(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    return check_anomalies(db, ctx.business.id)
