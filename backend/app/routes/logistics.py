from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.services.logistics_service import LogisticsService

router = APIRouter()

class ShipmentCreate(BaseModel):
    destination: str = Field(..., description="Destination address")
    origin: Optional[str] = Field(None, description="Origin address")
    items_count: Optional[int] = Field(None, ge=1, description="Number of items")
    weight: Optional[float] = Field(None, ge=0.1, description="Total weight in kg")
    estimated_days: Optional[int] = Field(None, ge=1, le=30, description="Estimated delivery days")

class ShipmentResponse(BaseModel):
    success: bool
    shipments: Optional[List[Dict[str, Any]]] = None
    shipment: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    message: Optional[str] = None

@router.get("/shipments", response_model=ShipmentResponse)
async def get_shipments(status: Optional[str] = None):
    """
    Get all shipments with optional status filter
    """

    try:
        logistics_service = LogisticsService()

        shipments = logistics_service.get_shipments(status)

        return ShipmentResponse(
            success=True,
            shipments=shipments,
            message=f"Retrieved {len(shipments)} shipments"
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve shipments",
                "message": str(e)
            }
        )

@router.post("/shipments", response_model=ShipmentResponse)
async def create_shipment(shipment: ShipmentCreate):
    """
    Create a new shipment
    """

    try:
        logistics_service = LogisticsService()

        new_shipment = logistics_service.create_shipment(shipment.dict())

        return ShipmentResponse(
            success=True,
            shipment=new_shipment,
            message="Shipment created successfully"
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to create shipment",
                "message": str(e)
            }
        )

@router.get("/shipments/{shipment_id}")
async def get_shipment(shipment_id: str):
    """
    Get specific shipment details
    """

    try:
        logistics_service = LogisticsService()

        shipment = logistics_service.get_shipment_by_id(shipment_id)

        if not shipment:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Shipment not found",
                    "message": f"Shipment with ID {shipment_id} not found"
                }
            )

        return {
            "success": True,
            "shipment": shipment,
            "message": "Shipment details retrieved successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve shipment",
                "message": str(e)
            }
        )

@router.put("/shipments/{shipment_id}/status")
async def update_shipment_status(shipment_id: str, status: str):
    """
    Update shipment status
    """

    valid_statuses = ["Processing", "In Transit", "Delivered", "Cancelled"]

    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "Invalid status",
                "message": f"Status must be one of: {', '.join(valid_statuses)}"
            }
        )

    try:
        logistics_service = LogisticsService()

        updated_shipment = logistics_service.update_shipment_status(shipment_id, status)

        if not updated_shipment:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Shipment not found",
                    "message": f"Shipment with ID {shipment_id} not found"
                }
            )

        return {
            "success": True,
            "shipment": updated_shipment,
            "message": f"Shipment status updated to {status}"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to update shipment status",
                "message": str(e)
            }
        )

@router.post("/routes/optimize")
async def optimize_routes(destinations: List[str]):
    """
    Optimize delivery routes for multiple destinations
    """

    if not destinations or len(destinations) < 2:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "Invalid destinations",
                "message": "At least 2 destinations are required for route optimization"
            }
        )

    try:
        logistics_service = LogisticsService()

        optimized_routes = logistics_service.optimize_routes(destinations)

        return {
            "success": True,
            "routes": optimized_routes,
            "total_destinations": len(destinations),
            "estimated_savings": "15-25% time reduction",
            "message": "Routes optimized successfully"
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to optimize routes",
                "message": str(e)
            }
        )

@router.get("/analytics")
async def get_logistics_analytics():
    """
    Get logistics performance analytics
    """

    try:
        logistics_service = LogisticsService()

        analytics = logistics_service.get_analytics()

        return {
            "success": True,
            "analytics": analytics,
            "message": "Logistics analytics retrieved successfully"
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve logistics analytics",
                "message": str(e)
            }
        )