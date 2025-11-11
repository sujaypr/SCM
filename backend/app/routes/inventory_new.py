from fastapi import APIRouter, HTTPException, Query, Depends, UploadFile, File, Form
from fastapi.responses import Response
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from app.utils.db import get_db
from app.services.inventory_service_db import InventoryService
from app.services.csv_service import CSVService
from app.services.ai_enrichment_service import AIEnrichmentService
import json

router = APIRouter()


class InventoryItem(BaseModel):
    name: str = Field(..., description="Item name")
    category: Optional[str] = Field(None, description="Item category")
    sku: Optional[str] = Field(None, description="Stock Keeping Unit")
    current_stock: int = Field(..., ge=0, description="Current stock level")
    min_stock_level: Optional[int] = Field(None, ge=0, description="Minimum stock level")
    max_stock_level: Optional[int] = Field(None, ge=1, description="Maximum stock level")
    unit_cost: Optional[float] = Field(None, ge=0, description="Unit cost in INR")
    selling_price: Optional[float] = Field(None, ge=0, description="Selling price in INR")
    supplier: Optional[str] = Field(None, description="Supplier name")
    description: Optional[str] = Field(None, description="Item description")


class StockAdjustment(BaseModel):
    adjustment: int = Field(..., description="Stock adjustment (positive or negative)")
    reason: Optional[str] = Field(None, description="Reason for adjustment")


class CSVImportRequest(BaseModel):
    column_mapping: Dict[str, str] = Field(..., description="Column mapping from CSV to system fields")
    skip_errors: bool = Field(False, description="Skip rows with errors")
    update_existing: bool = Field(False, description="Update existing items by SKU")
    enable_ai_enrichment: bool = Field(True, description="Enable AI enrichment")


class InventoryResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    message: Optional[str] = None


@router.get("/", response_model=InventoryResponse)
async def get_inventory(
    category: Optional[str] = Query(None, description="Filter by category"),
    status: Optional[str] = Query(None, description="Filter by stock status"),
    search: Optional[str] = Query(None, description="Search term"),
    business_id: int = Query(1, description="Business ID"),
    db: Session = Depends(get_db)
):
    """Get inventory items with optional filtering"""
    
    try:
        inventory_service = InventoryService(db)
        
        filters = {
            "category": category, 
            "status": status, 
            "search": search
        }
        
        inventory_items = inventory_service.get_inventory(filters, business_id)
        
        return InventoryResponse(
            success=True,
            data={"items": inventory_items, "count": len(inventory_items)},
            message=f"Retrieved {len(inventory_items)} inventory items"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve inventory",
                "message": str(e)
            }
        )


@router.get("/{item_id}", response_model=InventoryResponse)
async def get_inventory_item(
    item_id: int,
    db: Session = Depends(get_db)
):
    """Get single inventory item by ID"""
    
    try:
        inventory_service = InventoryService(db)
        item = inventory_service.get_item_by_id(item_id)
        
        if not item:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Item not found",
                    "message": f"Inventory item with ID {item_id} not found"
                }
            )
        
        return InventoryResponse(
            success=True,
            data=item,
            message="Inventory item retrieved successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve inventory item",
                "message": str(e)
            }
        )


@router.post("/", response_model=InventoryResponse)
async def add_inventory_item(
    item: InventoryItem,
    business_id: int = Query(1, description="Business ID"),
    db: Session = Depends(get_db)
):
    """Add new inventory item"""
    
    try:
        inventory_service = InventoryService(db)
        new_item = inventory_service.add_item(item.dict(exclude_none=True), business_id)
        
        return InventoryResponse(
            success=True,
            data=new_item,
            message="Inventory item added successfully"
        )
        
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "Validation error",
                "message": str(e)
            }
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to add inventory item",
                "message": str(e)
            }
        )


@router.put("/{item_id}", response_model=InventoryResponse)
async def update_inventory_item(
    item_id: int,
    item: InventoryItem,
    db: Session = Depends(get_db)
):
    """Update existing inventory item"""
    
    try:
        inventory_service = InventoryService(db)
        updated_item = inventory_service.update_item(item_id, item.dict(exclude_none=True))
        
        if not updated_item:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Item not found",
                    "message": f"Inventory item with ID {item_id} not found"
                }
            )
        
        return InventoryResponse(
            success=True,
            data=updated_item,
            message="Inventory item updated successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to update inventory item",
                "message": str(e)
            }
        )


@router.delete("/{item_id}", response_model=InventoryResponse)
async def delete_inventory_item(
    item_id: int,
    db: Session = Depends(get_db)
):
    """Delete inventory item"""
    
    try:
        inventory_service = InventoryService(db)
        deleted = inventory_service.delete_item(item_id)
        
        if not deleted:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Item not found",
                    "message": f"Inventory item with ID {item_id} not found"
                }
            )
        
        return InventoryResponse(
            success=True,
            message="Inventory item deleted successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to delete inventory item",
                "message": str(e)
            }
        )


@router.patch("/{item_id}/stock", response_model=InventoryResponse)
async def adjust_stock(
    item_id: int,
    adjustment: StockAdjustment,
    db: Session = Depends(get_db)
):
    """Adjust stock level for an item"""
    
    try:
        inventory_service = InventoryService(db)
        updated_item = inventory_service.adjust_stock(
            item_id, 
            adjustment.adjustment, 
            adjustment.reason
        )
        
        if not updated_item:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Item not found",
                    "message": f"Inventory item with ID {item_id} not found"
                }
            )
        
        return InventoryResponse(
            success=True,
            data=updated_item,
            message=f"Stock adjusted by {adjustment.adjustment}"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to adjust stock",
                "message": str(e)
            }
        )


@router.get("/analytics", response_model=InventoryResponse)
async def get_inventory_analytics(
    business_id: int = Query(1, description="Business ID"),
    db: Session = Depends(get_db)
):
    """Get inventory analytics and insights"""
    
    try:
        inventory_service = InventoryService(db)
        analytics = inventory_service.get_analytics(business_id)
        
        return InventoryResponse(
            success=True,
            data=analytics,
            message="Inventory analytics retrieved successfully"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve inventory analytics",
                "message": str(e)
            }
        )


@router.get("/alerts/low-stock", response_model=InventoryResponse)
async def get_low_stock_items(
    business_id: int = Query(1, description="Business ID"),
    db: Session = Depends(get_db)
):
    """Get items with low stock levels"""
    
    try:
        inventory_service = InventoryService(db)
        low_stock_items = inventory_service.get_low_stock_items(business_id)
        
        return InventoryResponse(
            success=True,
            data={
                "items": low_stock_items,
                "count": len(low_stock_items)
            },
            message=f"Found {len(low_stock_items)} items with low stock"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve low stock items",
                "message": str(e)
            }
        )


# CSV Import/Export Endpoints

@router.get("/csv/template")
async def download_csv_template(
    business_type: Optional[str] = Query(None, description="Business type for sample data"),
    db: Session = Depends(get_db)
):
    """Download CSV template with sample data"""
    
    try:
        csv_service = CSVService(db)
        template_content = csv_service.generate_template(business_type)
        
        return Response(
            content=template_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=inventory_template.csv"
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to generate CSV template",
                "message": str(e)
            }
        )


@router.post("/csv/upload", response_model=InventoryResponse)
async def upload_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload CSV file for preview and column mapping"""
    
    try:
        # Read file content
        content = await file.read()
        csv_content = content.decode("utf-8")
        
        # Parse CSV
        csv_service = CSVService(db)
        rows, columns, suggested_mapping = csv_service.parse_csv(csv_content)
        
        return InventoryResponse(
            success=True,
            data={
                "row_count": len(rows),
                "columns": columns,
                "suggested_mapping": suggested_mapping,
                "preview_data": rows[:10]  # First 10 rows for preview
            },
            message="CSV uploaded and parsed successfully"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "Failed to parse CSV",
                "message": str(e)
            }
        )


@router.post("/csv/validate", response_model=InventoryResponse)
async def validate_csv(
    file: UploadFile = File(...),
    mapping: str = Form(...),  # JSON string of column mapping
    skip_errors: bool = Form(False),
    db: Session = Depends(get_db)
):
    """Validate CSV data with column mapping"""
    
    try:
        # Read file content
        content = await file.read()
        csv_content = content.decode("utf-8")
        
        # Parse column mapping
        column_mapping = json.loads(mapping)
        
        # Parse and validate
        csv_service = CSVService(db)
        rows, _, _ = csv_service.parse_csv(csv_content)
        validation_result = csv_service.validate_data(rows, column_mapping, skip_errors)
        
        return InventoryResponse(
            success=validation_result["success"],
            data=validation_result,
            message="CSV validation complete"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "Failed to validate CSV",
                "message": str(e)
            }
        )


@router.post("/csv/import", response_model=InventoryResponse)
async def import_csv(
    file: UploadFile = File(...),
    mapping: str = Form(...),  # JSON string of column mapping
    skip_errors: bool = Form(False),
    update_existing: bool = Form(False),
    enable_ai_enrichment: bool = Form(True),
    business_id: int = Form(1),
    db: Session = Depends(get_db)
):
    """Import CSV data into inventory"""
    
    try:
        # Read file content
        content = await file.read()
        csv_content = content.decode("utf-8")
        
        # Parse column mapping
        column_mapping = json.loads(mapping)
        
        # Parse and validate
        csv_service = CSVService(db)
        rows, _, _ = csv_service.parse_csv(csv_content)
        validation_result = csv_service.validate_data(rows, column_mapping, skip_errors)
        
        if not validation_result["success"] and not skip_errors:
            return InventoryResponse(
                success=False,
                data=validation_result,
                message="CSV validation failed"
            )
        
        # Apply AI enrichment if enabled
        valid_rows = validation_result["valid_rows"]
        if enable_ai_enrichment:
            ai_service = AIEnrichmentService()
            # Get business info from DB (simplified for now)
            business_info = {
                "type": "Electronics Store",
                "scale": "Small",
                "location": "Urban"
            }
            valid_rows = ai_service.enrich_inventory_data(valid_rows, business_info)
        
        # Import data
        import_result = csv_service.import_data(
            valid_rows,
            business_id,
            update_existing
        )
        
        return InventoryResponse(
            success=import_result["success"],
            data=import_result,
            message=f"Imported {import_result['imported']} items successfully"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to import CSV",
                "message": str(e)
            }
        )


@router.get("/csv/export")
async def export_csv(
    category: Optional[str] = Query(None, description="Filter by category"),
    status: Optional[str] = Query(None, description="Filter by status"),
    business_id: int = Query(1, description="Business ID"),
    db: Session = Depends(get_db)
):
    """Export inventory data as CSV"""
    
    try:
        csv_service = CSVService(db)
        
        filters = {
            "category": category,
            "status": status
        }
        
        csv_content = csv_service.export_data(business_id, filters)
        
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=inventory_export_{business_id}.csv"
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to export inventory",
                "message": str(e)
            }
        )


@router.post("/ai/enrich", response_model=InventoryResponse)
async def enrich_with_ai(
    items: List[Dict],
    business_type: str = Query("Electronics Store"),
    business_scale: str = Query("Small"),
    business_location: str = Query("Urban")
):
    """Enrich inventory data with AI"""
    
    try:
        ai_service = AIEnrichmentService()
        
        business_info = {
            "type": business_type,
            "scale": business_scale,
            "location": business_location
        }
        
        enriched_items = ai_service.enrich_inventory_data(items, business_info)
        
        return InventoryResponse(
            success=True,
            data=enriched_items,
            message=f"Enriched {len(enriched_items)} items with AI"
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to enrich data with AI",
                "message": str(e)
            }
        )
