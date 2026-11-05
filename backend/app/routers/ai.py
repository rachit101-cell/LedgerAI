import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Business, ActionDraft, AuditEvent, AIBriefingReport
from ..schemas import (
    AIChatRequest, AIChatResponse, ActionDraftRead, ActionApproveRequest,
    AIDailyBriefingResponse, FinancialHealthScoreResponse,
    FinancialRisksResponse, AIRecommendationsResponse,
    WhatIfSimulationRequest, WhatIfSimulationResponse,
    AIReportRead, AIReportSaveRequest
)
from ..services.ai_assistant import AIAssistantService
from ..services.ai_copilot import AICopilotService
from ..auth import WorkspaceContext, get_workspace_context, require_owner_role

router = APIRouter(prefix="/api/v1", tags=["AI Business Assistant & Approvals"])

# -----------------------------------------------------------------------------
# 1. AI Daily Business Briefing
# -----------------------------------------------------------------------------
@router.get("/ai/briefing", response_model=AIDailyBriefingResponse)
async def get_daily_briefing(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    return await AICopilotService.get_daily_briefing(db, ctx.business.id)


# -----------------------------------------------------------------------------
# 2. Financial Health Score
# -----------------------------------------------------------------------------
@router.get("/ai/health-score", response_model=FinancialHealthScoreResponse)
def get_financial_health_score(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    return AICopilotService.get_health_score(db, ctx.business.id)


# -----------------------------------------------------------------------------
# 3. AI Financial Risk Detection
# -----------------------------------------------------------------------------
@router.get("/ai/risks", response_model=FinancialRisksResponse)
def get_financial_risks(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    return AICopilotService.get_financial_risks(db, ctx.business.id)


# -----------------------------------------------------------------------------
# 4. AI Recommendations
# -----------------------------------------------------------------------------
@router.get("/ai/recommendations", response_model=AIRecommendationsResponse)
def get_ai_recommendations(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    return AICopilotService.get_recommendations(db, ctx.business.id)


# -----------------------------------------------------------------------------
# 5. Intelligent Grounded AI Chat
# -----------------------------------------------------------------------------
@router.post("/ai/chat", response_model=AIChatResponse)
async def chat_with_ai(
    chat_in: AIChatRequest,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    return await AIAssistantService.execute_chat(db, ctx.business.id, chat_in.message)


# -----------------------------------------------------------------------------
# 6. What-If Scenario Simulator
# -----------------------------------------------------------------------------
@router.post("/ai/simulate", response_model=WhatIfSimulationResponse)
def simulate_scenario(
    req: WhatIfSimulationRequest,
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    return AICopilotService.simulate_scenario(db, ctx.business.id, req)


# -----------------------------------------------------------------------------
# 7. Previous AI Reports & History
# -----------------------------------------------------------------------------
@router.get("/ai/reports", response_model=List[AIReportRead])
def list_ai_reports(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    reports = AICopilotService.list_reports(db, ctx.business.id)
    out = []
    for r in reports:
        out.append(AIReportRead(
            id=r.id,
            business_id=r.business_id,
            report_type=r.report_type,
            title=r.title,
            health_score=r.health_score,
            rating=r.rating,
            summary_markdown=r.summary_markdown,
            metrics=json.loads(r.metrics_json or "{}"),
            priorities=json.loads(r.priorities_json or "[]"),
            risks=json.loads(r.risks_json or "[]"),
            recommendations=json.loads(r.recommendations_json or "[]"),
            created_at=r.created_at
        ))
    return out


@router.post("/ai/reports/save", response_model=AIReportRead)
def save_ai_report(
    req: AIReportSaveRequest,
    ctx: WorkspaceContext = Depends(require_owner_role),
    db: Session = Depends(get_db)
):
    rep = AICopilotService.save_report(db, ctx.business.id, req.report_type, req.title)
    return AIReportRead(
        id=rep.id,
        business_id=rep.business_id,
        report_type=rep.report_type,
        title=rep.title,
        health_score=rep.health_score,
        rating=rep.rating,
        summary_markdown=rep.summary_markdown,
        metrics=json.loads(rep.metrics_json or "{}"),
        priorities=json.loads(rep.priorities_json or "[]"),
        risks=json.loads(rep.risks_json or "[]"),
        recommendations=json.loads(rep.recommendations_json or "[]"),
        created_at=rep.created_at
    )


# -----------------------------------------------------------------------------
# Action Drafts & Owner Approvals (Preserved Invariants)
# -----------------------------------------------------------------------------
@router.get("/action-drafts", response_model=List[ActionDraftRead])
def list_action_drafts(
    ctx: WorkspaceContext = Depends(get_workspace_context),
    db: Session = Depends(get_db)
):
    drafts = (
        db.query(ActionDraft)
        .filter(ActionDraft.business_id == ctx.business.id)
        .order_by(ActionDraft.created_at.desc())
        .all()
    )
    return drafts


@router.post("/action-drafts/{draft_id}/approve")
def approve_action(
    draft_id: str,
    req: ActionApproveRequest,
    ctx: WorkspaceContext = Depends(require_owner_role),
    db: Session = Depends(get_db)
):
    res = AIAssistantService.approve_action_draft(
        db=db,
        business_id=ctx.business.id,
        draft_id=draft_id,
        actor=ctx.actor,
        expected_hash=req.expected_payload_hash
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message"))
    return res


@router.post("/action-drafts/{draft_id}/reject")
def reject_action(
    draft_id: str,
    ctx: WorkspaceContext = Depends(require_owner_role),
    db: Session = Depends(get_db)
):
    draft = (
        db.query(ActionDraft)
        .filter(ActionDraft.id == draft_id, ActionDraft.business_id == ctx.business.id)
        .first()
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Action draft not found in active workspace.")

    draft.status = "rejected"
    audit = AuditEvent(
        business_id=draft.business_id,
        actor=ctx.actor,
        action="reject_action_draft",
        entity_type="action_draft",
        entity_id=draft.id,
        reason=f"Owner '{ctx.actor}' rejected proposed action draft."
    )
    db.add(audit)
    db.commit()
    return {"success": True, "status": "rejected", "message": "Action draft rejected."}
