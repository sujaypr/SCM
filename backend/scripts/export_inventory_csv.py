import os
import csv
import argparse
from datetime import datetime
from sqlalchemy.orm import sessionmaker

# Local imports from the backend app
from app.utils.db import get_engine
from app.models.db_models import InventoryItem


def export_inventory_csv(business_id: int, output_path: str | None = None) -> str:
    """Export active inventory items for a business to CSV and return path."""
    engine = get_engine()
    SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    # Default output file
    if not output_path:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = os.path.join(os.path.dirname(__file__), "..", "exports")
        output_path = os.path.abspath(os.path.join(output_dir, f"inventory_export_{business_id}_{ts}.csv"))

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    fields = [
        "name",
        "category",
        "sku",
        "current_stock",
        "min_stock_level",
        "max_stock_level",
        "unit_cost",
        "selling_price",
        "supplier",
        "description",
        "status",
    ]

    with SessionLocal() as db:
        items = (
            db.query(InventoryItem)
            .filter(InventoryItem.business_id == business_id, InventoryItem.is_active == True)
            .all()
        )

        with open(output_path, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fields)
            writer.writeheader()
            for it in items:
                writer.writerow({
                    "name": it.name,
                    "category": it.category,
                    "sku": it.sku,
                    "current_stock": it.current_stock,
                    "min_stock_level": it.min_stock_level,
                    "max_stock_level": it.max_stock_level,
                    "unit_cost": it.unit_cost,
                    "selling_price": it.selling_price,
                    "supplier": it.supplier,
                    "description": it.description,
                    "status": it.stock_status,
                })

    return output_path


def main():
    parser = argparse.ArgumentParser(description="Export inventory to CSV")
    parser.add_argument("--business-id", type=int, default=1, help="Business ID (default: 1)")
    parser.add_argument("--out", type=str, default=None, help="Output CSV path")
    args = parser.parse_args()

    path = export_inventory_csv(args.business_id, args.out)
    print(f"Exported inventory CSV to: {path}")


if __name__ == "__main__":
    main()
