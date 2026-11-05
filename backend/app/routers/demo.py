from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..config import settings
from ..schemas import BusinessRead
from ..services.seed_data import seed_demo_data
from ..auth import WorkspaceContext, require_owner_role

router = APIRouter(prefix="/api/v1/demo", tags=["Demo Environment"])

@router.post("/reset", response_model=BusinessRead)
def reset_demo_database(
    ctx: WorkspaceContext = Depends(require_owner_role),
    db: Session = Depends(get_db)
):
    """
    1-Click reset to the exact deterministic baseline described in DEMO_SCRIPT.md.
    Enforces P0-E security:
    - Blocked in production (only permitted in sandbox).
    - Requires explicit owner role authorization.
    """
    if settings.ENVIRONMENT != "sandbox":
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Demo reset is only permitted in Sandbox environments to protect business data."
        )

    business = seed_demo_data(db)
    return business
