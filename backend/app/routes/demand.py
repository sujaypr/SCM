
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from app.services.demand_service import DemandService

router = APIRouter()

class ForecastRequest(BaseModel):
    businessName: Optional[str] = Field(None, max_length=255)
    businessType: str = Field(..., description="Business type (Grocery Store, Electronics Store, etc.)")
    businessScale: str = Field(..., description="Business scale (Micro, Small, Medium)")
    location: str = Field(..., description="Indian state location")
    currentSales: float = Field(..., gt=1000, description="Current monthly sales in INR")
    forecastPeriod: Optional[int] = Field(6, ge=1, le=36, description="Forecast period in months from today")

class ForecastResponse(BaseModel):
    success: bool
    forecast: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    message: Optional[str] = None

@router.post("/forecast")
async def generate_forecast(request: ForecastRequest):
    """
    Generate demand forecast for product, festival, and seasonal demands (tabbed UI).
    """
    try:
        demand_service = DemandService()
        tabbed_data = await demand_service.generate_tabbed_forecast(request.dict())
        return {"success": True, "forecast": tabbed_data}
    except Exception as e:
        import traceback
        print(f"Forecast generation error: {str(e)}")
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Forecast generation failed",
                "message": "Unable to generate forecast. Please try again later."
            }
        )

@router.get("/seasonal-patterns")
async def get_seasonal_patterns(type: str, location: str):
    """
    Get seasonal demand patterns for business type and location
    """

    try:
        demand_service = DemandService()
        patterns = demand_service.get_seasonal_patterns(type, location)

        return {
            "success": True,
            "patterns": patterns,
            "business_type": type,
            "location": location
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve seasonal patterns",
                "message": str(e)
            }
        )

@router.get("/festival-calendar")
async def get_festival_calendar(year: int = 2025):
    """
    Get Indian festival calendar with retail impact analysis
    """

    try:
        demand_service = DemandService()
        calendar = demand_service.get_festival_calendar(year)

        return {
            "success": True,
            "calendar": calendar,
            "year": year,
            "market": "Indian Retail"
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve festival calendar",
                "message": str(e)
            }
        )

@router.get("/business-types")
async def get_business_types():
    """
    Get supported business types and scales
    """

    business_types = [
        "Grocery Store",
        "Electronics Store", 
        "Clothing Store",
        "Medical Store",
        "Cosmetics Store",
        "Food & Beverage"
    ]

    business_scales = ["Micro", "Small", "Medium"]

    indian_states = [
        "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
        "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
        "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Madhya Pradesh",
        "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
        "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
        "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
        "Delhi", "Puducherry", "Chandigarh"
    ]

    return {
        "success": True,
        "business_types": business_types,
        "business_scales": business_scales,
        "locations": indian_states,
        "classification": "MSME (Micro, Small, Medium Enterprise)"
    }

@router.get("/forecast-history")
async def get_forecast_history(business_type: Optional[str] = None, limit: int = 10):
    """
    Get historical forecast data
    """

    try:
        demand_service = DemandService()
        history = demand_service.get_forecast_history(business_type, limit)

        return {
            "success": True,
            "history": history,
            "count": len(history)
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve forecast history",
                "message": str(e)
            }
        )