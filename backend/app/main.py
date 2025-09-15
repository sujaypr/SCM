from dotenv import load_dotenv

load_dotenv()
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
import uvicorn
import os
from contextlib import asynccontextmanager

from app.routes import demand, inventory, logistics, scenarios, reports
from app.utils.config import get_config
from app.utils.db import init_database

# Configuration
config = get_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 Starting AI Supply Chain Management Platform")
    print("🤖 Powered by Gemini 2.5 Pro AI")

    # Initialize database
    init_database()
    print("✅ Database initialized")

    # Expose AI availability flag for tests and runtime behavior
    try:
        from app.utils.config import get_config as _get_cfg

        _cfg = _get_cfg()
        app.state.gemini_available = bool(_cfg.gemini_api_key)
    except Exception:
        app.state.gemini_available = False

    yield

    # Shutdown
    print("🛑 Shutting down gracefully")


# Create FastAPI app
app = FastAPI(
    title="AI Supply Chain Management Platform",
    description="AI-powered supply chain management for Indian retail businesses",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Default AI availability flag; updated in lifespan
try:
    app.state.gemini_available = False
except Exception:
    pass

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files (favicon)
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/favicon.ico")
async def favicon():
    path = os.path.join(static_dir, "favicon.svg")
    if os.path.exists(path):
        return FileResponse(path, media_type="image/svg+xml")
    return {"detail": "favicon not found"}


# Include routers
app.include_router(demand.router, prefix="/api/demand", tags=["demand"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["inventory"])
app.include_router(logistics.router, prefix="/api/logistics", tags=["logistics"])
app.include_router(scenarios.router, prefix="/api/scenarios", tags=["scenarios"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])


# Root endpoint
@app.get("/")
async def root():
    return {
        "name": "AI Supply Chain Management Platform",
        "version": "1.0.0",
        "description": "AI-powered supply chain management for Indian retail businesses",
        "ai_model": "Gemini 2.5 Pro",
        "market_focus": "Indian Retail MSME",
        "endpoints": {
            "demand_forecasting": "/api/demand/forecast",
            "inventory_management": "/api/inventory/",
            "logistics_tracking": "/api/logistics/shipments",
            "scenario_analysis": "/api/scenarios/analyze",
            "reports": "/api/reports/",
        },
    }


# Health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": "2025-09-12T21:10:00+05:30",
        "version": "1.0.0",
        "ai_status": "operational",
        "database": "connected",
    }


# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "message": "Something went wrong. Please try again.",
        },
    )


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
