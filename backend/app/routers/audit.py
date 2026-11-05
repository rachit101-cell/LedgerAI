from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import AuditEvent
from ..schemas import AuditEventRead
from ..auth import WorkspaceContext, get_workspace_context

router = APIRouter(prefix="/api/v1", tags=["Audit & Activity"])

@router.get("/audit-events", response_model=List[AuditEventRead])
def list_audit_events(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    events = (
        db.query(AuditEvent)
        .filter(AuditEvent.business_id == ctx.business.id)
        .order_by(AuditEvent.timestamp.desc())
        .limit(100)
        .all()
    )
    return events
