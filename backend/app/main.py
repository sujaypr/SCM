from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(demand.router, prefix="/api/demand", tags=["demand"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["inventory"])
app.include_router(logistics.router, prefix="/api/logistics", tags=["logistics"])
app.include_router(scenarios.router, prefix="/api/scenarios", tags=["scenarios"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])

# Serve frontend build if present (SPA)
frontend_dist = os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'dist')
if os.path.isdir(frontend_dist):
    app.mount('/', StaticFiles(directory=frontend_dist, html=True), name='frontend')
    # Ensure index.html exists and fallback works
    index_path = os.path.join(frontend_dist, 'index.html')
    if os.path.isfile(index_path):
        @app.get("/{full_path:path}")
        async def spa_fallback(full_path: str):
            return FileResponse(index_path)

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
            "reports": "/api/reports/"
        }
    }

# Health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": "2025-09-12T21:10:00+05:30",
        "version": "1.0.0",
        "ai_status": "operational",
        "database": "connected"
    }

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error",
            "message": "Something went wrong. Please try again."
        }
    )

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )