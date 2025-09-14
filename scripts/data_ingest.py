#!/usr/bin/env python3
"""
Data ingestion script for AI Supply Chain Management Platform

This script handles:
- CSV data import and validation
- Database bulk insertion
- Data preprocessing and cleaning
- Error handling and logging

Usage:
    python scripts/data_ingest.py --file data/sample_data.csv --table businesses
    python scripts/data_ingest.py --file data/inventory.csv --table inventory_items
"""

import sys
import os
import argparse
import pandas as pd
import logging
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.app.utils.db import DatabaseManager
from backend.app.models.db_models import Business, InventoryItem, DemandForecast, SeasonalPattern
from backend.app.utils.config import get_config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/data_ingestion.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class DataIngestor:
    """Handle data ingestion operations"""

    def __init__(self):
        self.config = get_config()
        self.db_manager = DatabaseManager()

    def ingest_csv(self, file_path: str, table_name: str, batch_size: int = 1000):
        """Ingest CSV data into specified table"""

        try:
            # Validate file exists
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"File not found: {file_path}")

            # Read CSV file
            logger.info(f"Reading CSV file: {file_path}")
            df = pd.read_csv(file_path)
            logger.info(f"Loaded {len(df)} rows from CSV")

            # Validate and clean data
            df = self._validate_and_clean_data(df, table_name)

            # Insert data in batches
            self._insert_data_batches(df, table_name, batch_size)

            logger.info(f"Successfully ingested {len(df)} rows into {table_name}")
            return True

        except Exception as e:
            logger.error(f"Error ingesting data: {str(e)}")
            return False

    def _validate_and_clean_data(self, df: pd.DataFrame, table_name: str) -> pd.DataFrame:
        """Validate and clean data based on table schema"""

        logger.info(f"Validating data for table: {table_name}")

        if table_name == 'businesses':
            return self._validate_business_data(df)
        elif table_name == 'inventory_items':
            return self._validate_inventory_data(df)
        elif table_name == 'demand_forecasts':
            return self._validate_forecast_data(df)
        elif table_name == 'seasonal_patterns':
            return self._validate_seasonal_data(df)
        else:
            logger.warning(f"No specific validation for table: {table_name}")
            return df

    def _validate_business_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Validate business data"""

        required_columns = ['business_name', 'business_type', 'business_scale', 'location']

        # Check required columns
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise ValueError(f"Missing required columns: {missing_columns}")

        # Validate business types
        valid_types = [
            'Grocery Store', 'Electronics Store', 'Clothing Store',
            'Medical Store', 'Cosmetics Store', 'Food & Beverage'
        ]
        invalid_types = df[~df['business_type'].isin(valid_types)]['business_type'].unique()
        if len(invalid_types) > 0:
            logger.warning(f"Invalid business types found: {invalid_types}")
            df = df[df['business_type'].isin(valid_types)]

        # Validate business scales
        valid_scales = ['Micro', 'Small', 'Medium']
        df = df[df['business_scale'].isin(valid_scales)]

        # Clean and standardize data
        df['business_name'] = df['business_name'].str.strip()
        df['location'] = df['location'].str.strip()

        # Add timestamps
        df['created_at'] = datetime.now()
        df['updated_at'] = datetime.now()
        df['is_active'] = True

        logger.info(f"Validated {len(df)} business records")
        return df

    def _validate_inventory_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Validate inventory data"""

        required_columns = ['name', 'category', 'current_stock', 'min_stock_level', 'max_stock_level']

        # Check required columns
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise ValueError(f"Missing required columns: {missing_columns}")

        # Validate stock levels are non-negative
        df = df[df['current_stock'] >= 0]
        df = df[df['min_stock_level'] >= 0]
        df = df[df['max_stock_level'] > 0]

        # Validate min < max stock levels
        df = df[df['min_stock_level'] < df['max_stock_level']]

        # Clean data
        df['name'] = df['name'].str.strip()
        df['category'] = df['category'].str.strip()

        # Add timestamps
        df['created_at'] = datetime.now()
        df['updated_at'] = datetime.now()
        df['is_active'] = True

        logger.info(f"Validated {len(df)} inventory records")
        return df

    def _validate_forecast_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Validate forecast data"""

        required_columns = ['business_id', 'current_sales', 'forecast_month']

        # Check required columns
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise ValueError(f"Missing required columns: {missing_columns}")

        # Validate sales amounts are positive
        df = df[df['current_sales'] > 0]

        # Validate confidence scores are between 0 and 1
        if 'confidence_score' in df.columns:
            df = df[(df['confidence_score'] >= 0) & (df['confidence_score'] <= 1)]

        # Add timestamps
        df['created_at'] = datetime.now()
        df['updated_at'] = datetime.now()

        logger.info(f"Validated {len(df)} forecast records")
        return df

    def _validate_seasonal_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Validate seasonal pattern data"""

        required_columns = ['business_type', 'location', 'month', 'seasonal_factor']

        # Check required columns
        missing_columns = [col for col in required_columns if col not in df.columns]
        if missing_columns:
            raise ValueError(f"Missing required columns: {missing_columns}")

        # Validate month is between 1-12
        df = df[(df['month'] >= 1) & (df['month'] <= 12)]

        # Validate seasonal factor is positive
        df = df[df['seasonal_factor'] > 0]

        # Add timestamps
        df['created_at'] = datetime.now()
        df['updated_at'] = datetime.now()

        logger.info(f"Validated {len(df)} seasonal pattern records")
        return df

    def _insert_data_batches(self, df: pd.DataFrame, table_name: str, batch_size: int):
        """Insert data in batches to database"""

        total_rows = len(df)
        inserted_rows = 0

        logger.info(f"Inserting {total_rows} rows in batches of {batch_size}")

        with self.db_manager.get_session() as session:
            try:
                for start_idx in range(0, total_rows, batch_size):
                    end_idx = min(start_idx + batch_size, total_rows)
                    batch_df = df.iloc[start_idx:end_idx]

                    # Convert DataFrame to SQLAlchemy models
                    model_objects = self._df_to_models(batch_df, table_name)

                    # Bulk insert
                    session.bulk_save_objects(model_objects)
                    session.commit()

                    inserted_rows += len(batch_df)
                    logger.info(f"Inserted batch {start_idx//batch_size + 1}: {len(batch_df)} rows (Total: {inserted_rows}/{total_rows})")

                logger.info(f"Successfully inserted all {inserted_rows} rows into {table_name}")

            except Exception as e:
                session.rollback()
                logger.error(f"Error inserting batch: {str(e)}")
                raise

    def _df_to_models(self, df: pd.DataFrame, table_name: str) -> list:
        """Convert DataFrame to SQLAlchemy model objects"""

        model_objects = []

        for _, row in df.iterrows():
            if table_name == 'businesses':
                obj = Business(**row.to_dict())
            elif table_name == 'inventory_items':
                obj = InventoryItem(**row.to_dict())
            elif table_name == 'demand_forecasts':
                obj = DemandForecast(**row.to_dict())
            elif table_name == 'seasonal_patterns':
                obj = SeasonalPattern(**row.to_dict())
            else:
                raise ValueError(f"Unsupported table: {table_name}")

            model_objects.append(obj)

        return model_objects

    def export_sample_data(self, table_name: str, output_file: str, limit: int = 1000):
        """Export sample data from database to CSV"""

        try:
            logger.info(f"Exporting sample data from {table_name} to {output_file}")

            with self.db_manager.get_session() as session:
                if table_name == 'businesses':
                    query = session.query(Business).limit(limit)
                elif table_name == 'inventory_items':
                    query = session.query(InventoryItem).limit(limit)
                elif table_name == 'demand_forecasts':
                    query = session.query(DemandForecast).limit(limit)
                elif table_name == 'seasonal_patterns':
                    query = session.query(SeasonalPattern).limit(limit)
                else:
                    raise ValueError(f"Unsupported table: {table_name}")

                # Convert to DataFrame
                df = pd.read_sql(query.statement, session.bind)

                # Save to CSV
                df.to_csv(output_file, index=False)
                logger.info(f"Exported {len(df)} rows to {output_file}")
                return True

        except Exception as e:
            logger.error(f"Error exporting data: {str(e)}")
            return False

    def get_data_statistics(self, table_name: str) -> dict:
        """Get statistics about data in table"""

        try:
            with self.db_manager.get_session() as session:
                if table_name == 'businesses':
                    total_count = session.query(Business).count()
                    active_count = session.query(Business).filter(Business.is_active == True).count()
                elif table_name == 'inventory_items':
                    total_count = session.query(InventoryItem).count()
                    active_count = session.query(InventoryItem).filter(InventoryItem.is_active == True).count()
                elif table_name == 'demand_forecasts':
                    total_count = session.query(DemandForecast).count()
                    active_count = total_count
                elif table_name == 'seasonal_patterns':
                    total_count = session.query(SeasonalPattern).count()
                    active_count = total_count
                else:
                    raise ValueError(f"Unsupported table: {table_name}")

                stats = {
                    'table_name': table_name,
                    'total_records': total_count,
                    'active_records': active_count,
                    'last_updated': datetime.now().isoformat()
                }

                logger.info(f"Statistics for {table_name}: {stats}")
                return stats

        except Exception as e:
            logger.error(f"Error getting statistics: {str(e)}")
            return {}

def main():
    """Main function to handle command line arguments"""

    parser = argparse.ArgumentParser(description='Data ingestion script for AI Supply Chain Platform')
    parser.add_argument('--file', '-f', required=True, help='Path to CSV file to ingest')
    parser.add_argument('--table', '-t', required=True, 
                       choices=['businesses', 'inventory_items', 'demand_forecasts', 'seasonal_patterns'],
                       help='Target table name')
    parser.add_argument('--batch-size', '-b', type=int, default=1000, 
                       help='Batch size for insertion (default: 1000)')
    parser.add_argument('--export', '-e', help='Export sample data to CSV file')
    parser.add_argument('--stats', '-s', action='store_true', help='Show table statistics')

    args = parser.parse_args()

    # Initialize data ingestor
    ingestor = DataIngestor()

    try:
        if args.export:
            # Export mode
            success = ingestor.export_sample_data(args.table, args.export)
            sys.exit(0 if success else 1)

        elif args.stats:
            # Statistics mode
            stats = ingestor.get_data_statistics(args.table)
            print(f"\nTable Statistics for {args.table}:")
            for key, value in stats.items():
                print(f"  {key}: {value}")
            sys.exit(0)

        else:
            # Ingestion mode
            success = ingestor.ingest_csv(args.file, args.table, args.batch_size)

            if success:
                print(f"\n✅ Data ingestion completed successfully!")
                print(f"   File: {args.file}")
                print(f"   Table: {args.table}")
                print(f"   Batch Size: {args.batch_size}")
            else:
                print(f"\n❌ Data ingestion failed!")
                sys.exit(1)

    except KeyboardInterrupt:
        print("\n⚠️ Operation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    # Ensure logs directory exists
    os.makedirs('logs', exist_ok=True)
    main()