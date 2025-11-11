import csv
import io
import json
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from app.services.inventory_service_db import InventoryService
from sqlalchemy.orm import Session


class CSVService:
    """Service for handling CSV import and export of inventory data"""
    
    REQUIRED_FIELDS = ["name", "current_stock"]
    OPTIONAL_FIELDS = [
        "category", "sku", "description", "min_stock_level", "max_stock_level",
        "unit_cost", "selling_price", "supplier", "supplier_contact", "reorder_point"
    ]
    
    def __init__(self, db_session: Session):
        self.db = db_session
        self.inventory_service = InventoryService(db_session)
        
    def generate_template(self, business_type: str = None) -> str:
        """Generate CSV template with sample data"""
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write headers
        headers = [
            "name", "category", "sku", "current_stock", "min_stock_level",
            "max_stock_level", "unit_cost", "selling_price", "supplier", "description"
        ]
        writer.writerow(headers)
        
        # Add sample rows based on business type
        samples = self._get_sample_data(business_type)
        for sample in samples:
            writer.writerow([
                sample.get(field, "") for field in headers
            ])
        
        return output.getvalue()
    
    def parse_csv(self, file_content: str) -> Tuple[List[Dict], List[str], Dict[str, str]]:
        """
        Parse CSV content and return:
        - List of parsed rows
        - List of detected columns
        - Suggested column mapping
        """
        
        reader = csv.DictReader(io.StringIO(file_content))
        rows = list(reader)
        
        if not rows:
            raise ValueError("CSV file is empty")
        
        detected_columns = list(rows[0].keys())
        
        # Suggest column mappings
        mapping = self._suggest_column_mapping(detected_columns)
        
        return rows, detected_columns, mapping
    
    def validate_data(
        self, 
        rows: List[Dict], 
        column_mapping: Dict[str, str],
        skip_errors: bool = False
    ) -> Dict[str, Any]:
        """Validate CSV data before import"""
        
        valid_rows = []
        errors = []
        warnings = []
        
        for idx, row in enumerate(rows, 1):
            # Map columns
            mapped_row = self._map_columns(row, column_mapping)
            
            # Validate required fields
            row_errors = []
            row_warnings = []
            
            # Check required fields
            for field in self.REQUIRED_FIELDS:
                if not mapped_row.get(field):
                    row_errors.append(f"Missing required field: {field}")
            
            # Validate data types
            try:
                if mapped_row.get("current_stock"):
                    mapped_row["current_stock"] = int(float(mapped_row["current_stock"]))
                if mapped_row.get("min_stock_level"):
                    mapped_row["min_stock_level"] = int(float(mapped_row["min_stock_level"]))
                if mapped_row.get("max_stock_level"):
                    mapped_row["max_stock_level"] = int(float(mapped_row["max_stock_level"]))
                if mapped_row.get("unit_cost"):
                    mapped_row["unit_cost"] = float(mapped_row["unit_cost"])
                if mapped_row.get("selling_price"):
                    mapped_row["selling_price"] = float(mapped_row["selling_price"])
            except (ValueError, TypeError) as e:
                row_errors.append(f"Invalid number format: {str(e)}")
            
            # Business rule validations
            if mapped_row.get("min_stock_level") and mapped_row.get("max_stock_level"):
                if mapped_row["min_stock_level"] >= mapped_row["max_stock_level"]:
                    row_errors.append("min_stock_level must be less than max_stock_level")
            
            # Check for negative values
            for field in ["current_stock", "min_stock_level", "max_stock_level", "unit_cost", "selling_price"]:
                if mapped_row.get(field) and float(mapped_row.get(field, 0)) < 0:
                    row_errors.append(f"{field} cannot be negative")
            
            # Add warnings for missing optional fields
            if not mapped_row.get("sku"):
                row_warnings.append("SKU will be auto-generated")
            if not mapped_row.get("category"):
                row_warnings.append("Category will be set to 'Uncategorized'")
            
            # Collect results
            if row_errors and not skip_errors:
                errors.append({
                    "row": idx,
                    "data": row,
                    "errors": row_errors
                })
            elif not row_errors:
                valid_rows.append(mapped_row)
                if row_warnings:
                    warnings.append({
                        "row": idx,
                        "warnings": row_warnings
                    })
        
        return {
            "valid_rows": valid_rows,
            "total_rows": len(rows),
            "error_rows": errors,
            "warning_rows": warnings,
            "success": len(errors) == 0 or skip_errors
        }
    
    def import_data(
        self, 
        validated_data: List[Dict],
        business_id: int = 1,
        update_existing: bool = False
    ) -> Dict[str, Any]:
        """Import validated data into database"""
        
        imported_count = 0
        updated_count = 0
        skipped_count = 0
        errors = []
        
        for row in validated_data:
            try:
                # Check if item exists (by SKU)
                if update_existing and row.get("sku"):
                    existing = self.inventory_service.get_inventory(
                        {"search": row["sku"]}, business_id
                    )
                    if existing:
                        # Update existing item
                        item_id = existing[0]["id"]
                        self.inventory_service.update_item(item_id, row)
                        updated_count += 1
                        continue
                
                # Add new item
                self.inventory_service.add_item(row, business_id)
                imported_count += 1
                
            except Exception as e:
                errors.append({
                    "row": row,
                    "error": str(e)
                })
                skipped_count += 1
        
        return {
            "success": len(errors) == 0,
            "imported": imported_count,
            "updated": updated_count,
            "skipped": skipped_count,
            "errors": errors,
            "timestamp": datetime.now().isoformat()
        }
    
    def export_data(self, business_id: int = 1, filters: Dict = None) -> str:
        """Export inventory data to CSV format"""
        
        # Get inventory data
        items = self.inventory_service.get_inventory(filters or {}, business_id)
        
        if not items:
            return ""
        
        output = io.StringIO()
        
        # Define export fields
        fields = [
            "name", "category", "sku", "current_stock", "min_stock_level",
            "max_stock_level", "unit_cost", "selling_price", "supplier",
            "description", "status"
        ]
        
        writer = csv.DictWriter(output, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        
        for item in items:
            writer.writerow(item)
        
        return output.getvalue()
    
    def _suggest_column_mapping(self, columns: List[str]) -> Dict[str, str]:
        """Suggest column mappings based on column names"""
        
        mapping = {}
        
        # Common variations of column names
        name_variations = {
            "name": ["name", "product", "item", "product_name", "item_name"],
            "category": ["category", "type", "product_category", "item_category"],
            "sku": ["sku", "code", "product_code", "item_code", "barcode"],
            "current_stock": ["stock", "quantity", "qty", "current_stock", "available"],
            "min_stock_level": ["min", "minimum", "min_stock", "min_level", "reorder_level"],
            "max_stock_level": ["max", "maximum", "max_stock", "max_level"],
            "unit_cost": ["cost", "unit_cost", "purchase_price", "buying_price"],
            "selling_price": ["price", "selling_price", "sale_price", "retail_price"],
            "supplier": ["supplier", "vendor", "distributor"],
            "description": ["description", "desc", "details", "notes"]
        }
        
        for col in columns:
            col_lower = col.lower().strip()
            
            for field, variations in name_variations.items():
                if col_lower in variations:
                    mapping[col] = field
                    break
            
            # If no match found, keep original column name
            if col not in mapping:
                mapping[col] = col
        
        return mapping
    
    def _map_columns(self, row: Dict, mapping: Dict[str, str]) -> Dict:
        """Map CSV columns to system fields"""
        
        mapped = {}
        for csv_col, system_col in mapping.items():
            if csv_col in row and row[csv_col]:
                mapped[system_col] = row[csv_col].strip()
        
        # Set defaults for missing fields
        if not mapped.get("min_stock_level"):
            mapped["min_stock_level"] = 10
        if not mapped.get("max_stock_level"):
            mapped["max_stock_level"] = 100
        if not mapped.get("category"):
            mapped["category"] = "Uncategorized"
        
        return mapped
    
    def _get_sample_data(self, business_type: str) -> List[Dict]:
        """Get sample data based on business type"""
        
        samples = {
            "Electronics Store": [
                {
                    "name": "Wireless Headphones",
                    "category": "Audio",
                    "sku": "AUDIO-001",
                    "current_stock": "25",
                    "min_stock_level": "10",
                    "max_stock_level": "50",
                    "unit_cost": "1500",
                    "selling_price": "2999",
                    "supplier": "TechDistributor",
                    "description": "Bluetooth 5.0 wireless headphones"
                },
                {
                    "name": "USB Cable Type-C",
                    "category": "Accessories",
                    "sku": "ACC-001",
                    "current_stock": "100",
                    "min_stock_level": "50",
                    "max_stock_level": "200",
                    "unit_cost": "50",
                    "selling_price": "149",
                    "supplier": "CableSupplier",
                    "description": "1 meter Type-C cable"
                }
            ],
            "Grocery Store": [
                {
                    "name": "Basmati Rice 1kg",
                    "category": "Rice",
                    "sku": "RICE-001",
                    "current_stock": "50",
                    "min_stock_level": "20",
                    "max_stock_level": "100",
                    "unit_cost": "80",
                    "selling_price": "120",
                    "supplier": "LocalRiceSupplier",
                    "description": "Premium Basmati Rice"
                },
                {
                    "name": "Toor Dal 1kg",
                    "category": "Pulses",
                    "sku": "PULSE-001",
                    "current_stock": "30",
                    "min_stock_level": "15",
                    "max_stock_level": "60",
                    "unit_cost": "120",
                    "selling_price": "160",
                    "supplier": "PulseDistributor",
                    "description": "Yellow lentils"
                }
            ],
            "Clothing Store": [
                {
                    "name": "Cotton T-Shirt (M)",
                    "category": "T-Shirts",
                    "sku": "TSH-001-M",
                    "current_stock": "40",
                    "min_stock_level": "20",
                    "max_stock_level": "80",
                    "unit_cost": "200",
                    "selling_price": "499",
                    "supplier": "TextileSupplier",
                    "description": "100% Cotton T-Shirt Medium Size"
                },
                {
                    "name": "Denim Jeans (32)",
                    "category": "Jeans",
                    "sku": "JEAN-001-32",
                    "current_stock": "25",
                    "min_stock_level": "10",
                    "max_stock_level": "40",
                    "unit_cost": "800",
                    "selling_price": "1999",
                    "supplier": "DenimFactory",
                    "description": "Blue denim jeans size 32"
                }
            ]
        }
        
        # Return default samples if business type not specified
        return samples.get(business_type, samples["Electronics Store"])
