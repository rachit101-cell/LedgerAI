from fastapi import APIRouter
from ..config import settings

router = APIRouter(prefix="/api/v1", tags=["Health"])

@router.get("/health")
def get_health():
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "paypal_mode": settings.PAYPAL_MODE,
        "ai_provider": settings.AI_PROVIDER
    }
