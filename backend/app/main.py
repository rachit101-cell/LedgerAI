from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import engine, Base, SessionLocal
from .services.seed_data import seed_demo_data
from .models import Business
from .routers import health, business, invoices, payments, reports, ai, paypal, audit, demo, decisions

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables
    Base.metadata.create_all(bind=engine)
    # Ensure seed baseline exists
    db = SessionLocal()
    try:
        biz = db.query(Business).first()
        if not biz:
            seed_demo_data(db)
    finally:
        db.close()
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="LedgerAI Backend: AI-powered financial workspace with verified PayPal Sandbox reconciliation.",
    lifespan=lifespan
)

# CORS setup for web frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permits localhost:3000 and development environments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(health.router)
app.include_router(business.router)
app.include_router(invoices.router)
app.include_router(payments.router)
app.include_router(reports.router)
app.include_router(ai.router)
app.include_router(paypal.router)
app.include_router(audit.router)
app.include_router(demo.router)
app.include_router(decisions.router)

@app.get("/")
def root():
    return {
        "message": "Welcome to LedgerAI API",
        "docs": "/docs",
        "health": "/api/v1/health"
    }
