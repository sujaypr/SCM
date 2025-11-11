from typing import Dict, List, Any, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, Integer, cast
from app.models.db_models import InventoryItem, Business
from app.utils.db import get_db


class InventoryService:
    """Service for inventory management with database integration"""

    def __init__(self, db_session: Session = None):
        self.db = db_session

    def get_inventory(
        self, filters: Dict[str, Optional[str]], business_id: int = 1
    ) -> List[Dict[str, Any]]:
        """Get inventory items with optional filtering"""
        
        query = self.db.query(InventoryItem).filter(
            InventoryItem.business_id == business_id,
            InventoryItem.is_active == True
        )

        # Apply filters
        if filters.get("category"):
            query = query.filter(InventoryItem.category == filters["category"])

        if filters.get("status"):
            # Calculate status dynamically
            if filters["status"] == "critical":
                query = query.filter(
                    InventoryItem.current_stock <= cast(InventoryItem.min_stock_level * 0.5, Integer)
                )
            elif filters["status"] == "low":
                query = query.filter(
                    InventoryItem.current_stock <= InventoryItem.min_stock_level,
                    InventoryItem.current_stock > cast(InventoryItem.min_stock_level * 0.5, Integer)
                )
            elif filters["status"] == "overstock":
                query = query.filter(
                    InventoryItem.current_stock >= InventoryItem.max_stock_level
                )
            elif filters["status"] == "normal":
                query = query.filter(
                    InventoryItem.current_stock > InventoryItem.min_stock_level,
                    InventoryItem.current_stock < InventoryItem.max_stock_level
                )

        if filters.get("search"):
            search_term = f"%{filters['search']}%"
            query = query.filter(
                (InventoryItem.name.ilike(search_term))
                | (InventoryItem.sku.ilike(search_term))
                | (InventoryItem.description.ilike(search_term))
            )

        items = query.all()
        
        # Convert to dictionary format
        return [self._item_to_dict(item) for item in items]

    def get_item_by_id(self, item_id: int) -> Optional[Dict[str, Any]]:
        """Get single inventory item by ID"""
        item = self.db.query(InventoryItem).filter(
            InventoryItem.id == item_id,
            InventoryItem.is_active == True
        ).first()
        
        return self._item_to_dict(item) if item else None

    def add_item(self, item_data: Dict[str, Any], business_id: int = 1) -> Dict[str, Any]:
        """Add new inventory item"""
        
        # Validate stock levels
        if item_data.get("min_stock_level", 0) >= item_data.get("max_stock_level", 1):
            raise ValueError("Minimum stock level must be less than maximum stock level")

        # Create new item
        new_item = InventoryItem(
            business_id=business_id,
            name=item_data["name"],
            category=item_data.get("category", "Uncategorized"),
            sku=item_data.get("sku") or self._generate_sku(item_data.get("category", "GEN")),
            description=item_data.get("description"),
            current_stock=item_data.get("current_stock", 0),
            min_stock_level=item_data.get("min_stock_level", 10),
            max_stock_level=item_data.get("max_stock_level", 100),
            reorder_point=item_data.get("reorder_point"),
            unit_cost=item_data.get("unit_cost"),
            selling_price=item_data.get("selling_price"),
            supplier=item_data.get("supplier"),
            supplier_contact=item_data.get("supplier_contact"),
        )

        # Calculate markup if both costs are provided
        if new_item.unit_cost and new_item.selling_price:
            new_item.markup_percentage = (
                (new_item.selling_price - new_item.unit_cost) / new_item.unit_cost * 100
            )

        self.db.add(new_item)
        self.db.commit()
        self.db.refresh(new_item)
        
        return self._item_to_dict(new_item)

    def update_item(self, item_id: int, item_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update existing inventory item"""
        
        item = self.db.query(InventoryItem).filter(
            InventoryItem.id == item_id,
            InventoryItem.is_active == True
        ).first()

        if not item:
            return None

        # Update fields
        for key, value in item_data.items():
            if key not in ["id", "business_id", "created_at"]:  # Don't update these fields
                setattr(item, key, value)

        # Recalculate markup if prices changed
        if item.unit_cost and item.selling_price:
            item.markup_percentage = (
                (item.selling_price - item.unit_cost) / item.unit_cost * 100
            )

        item.updated_at = datetime.now()
        
        self.db.commit()
        self.db.refresh(item)
        
        return self._item_to_dict(item)

    def delete_item(self, item_id: int) -> bool:
        """Soft delete inventory item"""
        
        item = self.db.query(InventoryItem).filter(
            InventoryItem.id == item_id,
            InventoryItem.is_active == True
        ).first()

        if not item:
            return False

        item.is_active = False
        item.updated_at = datetime.now()
        
        self.db.commit()
        return True

    def adjust_stock(self, item_id: int, adjustment: int, reason: str = None) -> Optional[Dict[str, Any]]:
        """Adjust stock level for an item"""
        
        item = self.db.query(InventoryItem).filter(
            InventoryItem.id == item_id,
            InventoryItem.is_active == True
        ).first()

        if not item:
            return None

        # Update stock
        item.current_stock += adjustment
        
        # Ensure stock doesn't go negative
        if item.current_stock < 0:
            item.current_stock = 0
        
        item.updated_at = datetime.now()
        
        # Track last sale date if stock decreased
        if adjustment < 0:
            item.last_sale_date = datetime.now()
        # Track last restock date if stock increased
        elif adjustment > 0:
            item.last_restock_date = datetime.now()
        
        self.db.commit()
        self.db.refresh(item)
        
        return self._item_to_dict(item)

    def get_low_stock_items(self, business_id: int = 1) -> List[Dict[str, Any]]:
        """Get items with low or critical stock levels"""
        
        items = self.db.query(InventoryItem).filter(
            InventoryItem.business_id == business_id,
            InventoryItem.is_active == True,
            InventoryItem.current_stock <= InventoryItem.min_stock_level
        ).all()
        
        return [self._item_to_dict(item) for item in items]

    def get_analytics(self, business_id: int = 1) -> Dict[str, Any]:
        """Get inventory analytics and insights"""
        
        items = self.db.query(InventoryItem).filter(
            InventoryItem.business_id == business_id,
            InventoryItem.is_active == True
        ).all()

        if not items:
            return {
                "total_items": 0,
                "total_value": 0,
                "status_breakdown": {},
                "category_breakdown": {},
                "turnover_rate": 0,
                "carrying_cost": 0,
                "reorder_alerts": 0,
                "top_categories": []
            }

        # Calculate metrics
        total_items = len(items)
        total_value = sum((item.unit_cost or 0) * item.current_stock for item in items)

        # Status breakdown
        status_counts = {
            "critical": 0,
            "low": 0,
            "normal": 0,
            "overstock": 0
        }
        
        for item in items:
            status = item.stock_status
            status_counts[status] = status_counts.get(status, 0) + 1

        # Category breakdown
        category_breakdown = {}
        for item in items:
            category = item.category or "Uncategorized"
            if category not in category_breakdown:
                category_breakdown[category] = {"items": 0, "value": 0}
            
            category_breakdown[category]["items"] += 1
            category_breakdown[category]["value"] += (item.unit_cost or 0) * item.current_stock

        # Get top categories by value
        top_categories = sorted(
            category_breakdown.items(),
            key=lambda x: x[1]["value"],
            reverse=True
        )[:5]

        return {
            "total_items": total_items,
            "total_value": total_value,
            "status_breakdown": status_counts,
            "category_breakdown": category_breakdown,
            "turnover_rate": 4.2,  # This would be calculated from sales data
            "carrying_cost": total_value * 0.15,  # 15% carrying cost estimate
            "reorder_alerts": len([i for i in items if i.current_stock <= i.min_stock_level]),
            "top_categories": top_categories,
        }

    def get_categories(self, business_id: int = 1) -> List[str]:
        """Get unique categories for a business"""
        
        categories = self.db.query(InventoryItem.category).filter(
            InventoryItem.business_id == business_id,
            InventoryItem.is_active == True
        ).distinct().all()
        
        return [cat[0] for cat in categories if cat[0]]

    def _item_to_dict(self, item: InventoryItem) -> Dict[str, Any]:
        """Convert InventoryItem model to dictionary"""
        
        if not item:
            return None
            
        return {
            "id": item.id,
            "business_id": item.business_id,
            "name": item.name,
            "category": item.category,
            "sku": item.sku,
            "description": item.description,
            "current_stock": item.current_stock,
            "min_stock_level": item.min_stock_level,
            "max_stock_level": item.max_stock_level,
            "reorder_point": item.reorder_point,
            "unit_cost": item.unit_cost,
            "selling_price": item.selling_price,
            "markup_percentage": item.markup_percentage,
            "supplier": item.supplier,
            "supplier_contact": item.supplier_contact,
            "status": item.stock_status,
            "last_restock_date": item.last_restock_date.isoformat() if item.last_restock_date else None,
            "last_sale_date": item.last_sale_date.isoformat() if item.last_sale_date else None,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
        }

    def _generate_sku(self, category: str) -> str:
        """Generate a unique SKU"""
        
        # Get count of items in this category
        count = self.db.query(func.count(InventoryItem.id)).filter(
            InventoryItem.category == category
        ).scalar() or 0
        
        # Generate SKU
        category_code = category[:3].upper() if category else "GEN"
        return f"SKU-{category_code}-{count + 1:04d}"
