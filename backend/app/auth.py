from dataclasses import dataclass
from typing import Optional
from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from .database import get_db
from .config import settings
from .models import Business
from .services.seed_data import seed_demo_data

@dataclass
class WorkspaceContext:
    business: Business
    actor: str = "viewer"
    role: str = "viewer"

def get_workspace_context(
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_owner_token: Optional[str] = Header(None, alias="X-Owner-Token"),
    x_actor_role: Optional[str] = Header(None, alias="X-Actor-Role"),  # Untrusted browser header
    db: Session = Depends(get_db)
) -> WorkspaceContext:
    """
    Enforces multi-tenant workspace context and cryptographic actor authorization per P0-E and Invariant #9.
    Security rule: Browser-supplied role headers (e.g. X-Actor-Role) are untrusted and CANNOT grant owner privileges.
    Owner privileges require a server-verified secret token in Authorization: Bearer or X-Owner-Token.
    """
    if x_workspace_id:
        biz = db.query(Business).filter(Business.id == x_workspace_id).first()
        if not biz:
            raise HTTPException(status_code=404, detail=f"Workspace '{x_workspace_id}' not found.")
    else:
        # Fallback to active demo business
        biz = db.query(Business).first()
        if not biz:
            biz = seed_demo_data(db)

    # Server-verified owner authentication
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    elif x_owner_token:
        token = x_owner_token.strip()

    if token and token == settings.OWNER_TOKEN:
        actor = "owner"
        role = "owner"
    else:
        # Untrusted request: cannot escalate to owner merely via X-Actor-Role header
        actor = "viewer"
        role = "viewer"

    return WorkspaceContext(business=biz, actor=actor, role=role)

def require_owner_role(
    ctx: WorkspaceContext = Depends(get_workspace_context)
) -> WorkspaceContext:
    """
    Guarantees that consequential actions (approvals, voids, manual ledger writes, resets)
    are strictly authorized by an owner role verified via server token.
    """
    if ctx.role != "owner":
        raise HTTPException(
            status_code=403,
            detail="Forbidden: Explicit owner authorization token required. Browser-supplied role headers are not trusted."
        )
    return ctx
