import os
from pathlib import Path
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = (ROOT_DIR / "ledgerai.db").resolve()

# Load backend/.env if present
backend_env = ROOT_DIR / "backend" / ".env"
if backend_env.exists():
    load_dotenv(backend_env, override=True)
load_dotenv(ROOT_DIR / ".env", override=True)

def resolve_database_url() -> str:
    db_env = (os.getenv("DATABASE_URL") or "").strip()
    if not db_env or db_env in ("sqlite:///./ledgerai.db", "sqlite:///ledgerai.db", "sqlite:///ledger.db"):
        return f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"
    if db_env.startswith("sqlite:///."):
        rel = db_env.replace("sqlite:///", "")
        anchored = (ROOT_DIR / rel).resolve()
        return f"sqlite:///{anchored.as_posix()}"
    return db_env

def resolve_gemini_key() -> str:
    # Re-read backend_env if available to pick up dynamic key edits
    if backend_env.exists():
        load_dotenv(backend_env, override=True)
    return (
        os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or os.getenv("AI_API_KEY")
        or ""
    ).strip()

class Settings(BaseSettings):
    PROJECT_NAME: str = "LedgerAI"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "sandbox")  # sandbox or production
    OWNER_TOKEN: str = os.getenv("OWNER_TOKEN", "ledgerai-owner-token-secret-2026")
    
    # Database (always canonical to project root ledgerai.db)
    DATABASE_URL: str = resolve_database_url()
    
    # PayPal Sandbox Configuration
    PAYPAL_MODE: str = os.getenv("PAYPAL_MODE", "sandbox")
    PAYPAL_CLIENT_ID: str = os.getenv("PAYPAL_CLIENT_ID", "")
    PAYPAL_CLIENT_SECRET: str = os.getenv("PAYPAL_CLIENT_SECRET", "")
    PAYPAL_WEBHOOK_ID: str = os.getenv("PAYPAL_WEBHOOK_ID", "")
    PAYPAL_EXCHANGE_RATE_INR_PER_USD: float = float(os.getenv("PAYPAL_EXCHANGE_RATE_INR_PER_USD", "85.00"))
    
    @property
    def paypal_api_base(self) -> str:
        if self.PAYPAL_MODE == "production":
            return "https://api-m.paypal.com"
        return "https://api-m.sandbox.paypal.com"

    # AI Configuration (supports direct Gemini/OpenAI API or local fallback engine)
    AI_PROVIDER: str = os.getenv("AI_PROVIDER", "gemini")  # gemini, hybrid, openai, local
    AI_API_KEY: str = resolve_gemini_key()
    AI_MODEL: str = os.getenv("AI_MODEL", "gemini-1.5-flash")

    @property
    def effective_ai_key(self) -> str:
        return resolve_gemini_key() or self.AI_API_KEY
    
    # Default Business / Workspace
    DEFAULT_CURRENCY: str = "INR"
    DEFAULT_TIMEZONE: str = "Asia/Kolkata"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
