#!/usr/bin/env python3
"""
Model training script for AI Supply Chain Management Platform

This script handles:
- Training demand forecasting models
- Inventory optimization model training
- Model validation and evaluation
- Model persistence and versioning

Usage:
    python scripts/train_model.py --model demand --data data/historical_sales.csv
    python scripts/train_model.py --model inventory --data data/inventory_history.csv
    python scripts/train_model.py --evaluate --model-path models/forecasting_model.pt
"""

import sys
import os
import argparse
import pandas as pd
import numpy as np
import logging
import joblib
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Tuple, Dict, Any

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sklearn.model_selection import train_test_split, TimeSeriesSplit
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
import warnings
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/model_training.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class ModelTrainer:
    """Handle model training operations"""

    def __init__(self):
        self.models = {}
        self.scalers = {}
        self.encoders = {}
        self.model_metrics = {}

        # Ensure model directory exists
        os.makedirs('models', exist_ok=True)
        os.makedirs('logs', exist_ok=True)

    def train_demand_forecasting_model(self, data_path: str) -> Dict[str, Any]:
        """Train demand forecasting model"""

        logger.info(f"Training demand forecasting model with data: {data_path}")

        try:
            # Load and prepare data
            df = self._load_and_prepare_demand_data(data_path)
            logger.info(f"Loaded {len(df)} records for training")

            # Feature engineering
            X, y = self._engineer_demand_features(df)

            # Split data for time series
            X_train, X_test, y_train, y_test = self._time_series_split(X, y)

            # Train multiple models and select best
            models_to_try = {
                'random_forest': RandomForestRegressor(
                    n_estimators=100, 
                    max_depth=10, 
                    random_state=42,
                    n_jobs=-1
                ),
                'gradient_boosting': GradientBoostingRegressor(
                    n_estimators=100,
                    learning_rate=0.1,
                    max_depth=6,
                    random_state=42
                ),
                'linear_regression': LinearRegression()
            }

            best_model = None
            best_score = float('inf')

            for model_name, model in models_to_try.items():
                logger.info(f"Training {model_name} model...")

                # Train model
                model.fit(X_train, y_train)

                # Evaluate model
                y_pred = model.predict(X_test)
                mae = mean_absolute_error(y_test, y_pred)

                logger.info(f"{model_name} MAE: {mae:.2f}")

                if mae < best_score:
                    best_score = mae
                    best_model = model
                    best_model_name = model_name

            # Store best model
            self.models['demand_forecasting'] = best_model

            # Calculate comprehensive metrics
            y_pred_final = best_model.predict(X_test)
            metrics = self._calculate_regression_metrics(y_test, y_pred_final)
            metrics['model_type'] = best_model_name
            self.model_metrics['demand_forecasting'] = metrics

            # Save model
            model_path = 'models/forecasting_model.pkl'
            self._save_model(best_model, model_path, metrics)

            logger.info(f"Best model ({best_model_name}) trained successfully with MAE: {best_score:.2f}")
            return metrics

        except Exception as e:
            logger.error(f"Error training demand forecasting model: {str(e)}")
            raise

    def train_inventory_optimization_model(self, data_path: str) -> Dict[str, Any]:
        """Train inventory optimization model"""

        logger.info(f"Training inventory optimization model with data: {data_path}")

        try:
            # Load and prepare data
            df = self._load_and_prepare_inventory_data(data_path)
            logger.info(f"Loaded {len(df)} records for training")

            # Feature engineering for inventory optimization
            X, y = self._engineer_inventory_features(df)

            # Split data
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )

            # Train ensemble model for inventory optimization
            inventory_model = RandomForestRegressor(
                n_estimators=150,
                max_depth=12,
                min_samples_split=5,
                min_samples_leaf=2,
                random_state=42,
                n_jobs=-1
            )

            logger.info("Training inventory optimization model...")
            inventory_model.fit(X_train, y_train)

            # Evaluate model
            y_pred = inventory_model.predict(X_test)
            metrics = self._calculate_regression_metrics(y_test, y_pred)
            metrics['model_type'] = 'random_forest'

            # Store model
            self.models['inventory_optimization'] = inventory_model
            self.model_metrics['inventory_optimization'] = metrics

            # Save model
            model_path = 'models/inventory_model.pkl'
            self._save_model(inventory_model, model_path, metrics)

            logger.info(f"Inventory optimization model trained successfully with MAE: {metrics['mae']:.2f}")
            return metrics

        except Exception as e:
            logger.error(f"Error training inventory optimization model: {str(e)}")
            raise

    def _load_and_prepare_demand_data(self, data_path: str) -> pd.DataFrame:
        """Load and prepare demand forecasting data"""

        df = pd.read_csv(data_path)

        # Convert date columns
        date_columns = ['generated_date', 'forecast_date', 'created_at']
        for col in date_columns:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], errors='coerce')

        # Drop rows with missing target values
        if 'projected_sales' in df.columns:
            df = df.dropna(subset=['projected_sales'])

        # Sort by date if available
        if 'generated_date' in df.columns:
            df = df.sort_values('generated_date')

        return df

    def _load_and_prepare_inventory_data(self, data_path: str) -> pd.DataFrame:
        """Load and prepare inventory data"""

        df = pd.read_csv(data_path)

        # Handle missing values
        numeric_columns = df.select_dtypes(include=[np.number]).columns
        df[numeric_columns] = df[numeric_columns].fillna(df[numeric_columns].median())

        categorical_columns = df.select_dtypes(include=['object']).columns
        df[categorical_columns] = df[categorical_columns].fillna('Unknown')

        return df

    def _engineer_demand_features(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Engineer features for demand forecasting"""

        features = []

        # Encode categorical variables
        categorical_features = ['business_type', 'business_scale', 'location']
        for feature in categorical_features:
            if feature in df.columns:
                if feature not in self.encoders:
                    self.encoders[feature] = LabelEncoder()
                    encoded = self.encoders[feature].fit_transform(df[feature].astype(str))
                else:
                    encoded = self.encoders[feature].transform(df[feature].astype(str))
                features.append(encoded.reshape(-1, 1))

        # Numerical features
        numerical_features = ['current_monthly_sales', 'seasonal_factor', 'festival_impact', 'confidence_score']
        for feature in numerical_features:
            if feature in df.columns:
                values = df[feature].fillna(df[feature].median()).values
                features.append(values.reshape(-1, 1))

        # Time-based features
        if 'generated_date' in df.columns:
            dates = pd.to_datetime(df['generated_date'])
            features.append(dates.dt.month.values.reshape(-1, 1))
            features.append(dates.dt.quarter.values.reshape(-1, 1))
            features.append(dates.dt.dayofyear.values.reshape(-1, 1))

        # Combine features
        X = np.hstack(features) if features else np.array([[0] * len(df)])

        # Target variable
        y = df['projected_sales'].values if 'projected_sales' in df.columns else df['current_monthly_sales'].values * 1.2

        # Scale features
        if 'demand_scaler' not in self.scalers:
            self.scalers['demand_scaler'] = StandardScaler()
            X = self.scalers['demand_scaler'].fit_transform(X)
        else:
            X = self.scalers['demand_scaler'].transform(X)

        return X, y

    def _engineer_inventory_features(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Engineer features for inventory optimization"""

        features = []

        # Encode categorical variables
        categorical_features = ['category', 'business_type']
        for feature in categorical_features:
            if feature in df.columns:
                if feature not in self.encoders:
                    self.encoders[feature] = LabelEncoder()
                    encoded = self.encoders[feature].fit_transform(df[feature].astype(str))
                else:
                    encoded = self.encoders[feature].transform(df[feature].astype(str))
                features.append(encoded.reshape(-1, 1))

        # Numerical features
        numerical_features = ['current_stock', 'min_stock_level', 'max_stock_level', 'unit_cost', 'selling_price']
        for feature in numerical_features:
            if feature in df.columns:
                values = df[feature].fillna(df[feature].median()).values
                features.append(values.reshape(-1, 1))

        # Derived features
        if 'current_stock' in df.columns and 'min_stock_level' in df.columns:
            stock_ratio = df['current_stock'] / (df['min_stock_level'] + 1)
            features.append(stock_ratio.values.reshape(-1, 1))

        if 'selling_price' in df.columns and 'unit_cost' in df.columns:
            margin = (df['selling_price'] - df['unit_cost']) / (df['unit_cost'] + 1)
            features.append(margin.values.reshape(-1, 1))

        # Combine features
        X = np.hstack(features) if features else np.array([[0] * len(df)])

        # Target: optimal stock level (simplified)
        if 'optimal_stock' in df.columns:
            y = df['optimal_stock'].values
        else:
            # Calculate target as midpoint between min and max
            y = (df['min_stock_level'] + df['max_stock_level']) / 2

        # Scale features
        if 'inventory_scaler' not in self.scalers:
            self.scalers['inventory_scaler'] = StandardScaler()
            X = self.scalers['inventory_scaler'].fit_transform(X)
        else:
            X = self.scalers['inventory_scaler'].transform(X)

        return X, y

    def _time_series_split(self, X: np.ndarray, y: np.ndarray, test_size: float = 0.2) -> Tuple:
        """Split data for time series validation"""

        split_index = int(len(X) * (1 - test_size))

        X_train = X[:split_index]
        X_test = X[split_index:]
        y_train = y[:split_index]
        y_test = y[split_index:]

        return X_train, X_test, y_train, y_test

    def _calculate_regression_metrics(self, y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
        """Calculate comprehensive regression metrics"""

        mae = mean_absolute_error(y_true, y_pred)
        mse = mean_squared_error(y_true, y_pred)
        rmse = np.sqrt(mse)
        r2 = r2_score(y_true, y_pred)

        # Mean Absolute Percentage Error
        mape = np.mean(np.abs((y_true - y_pred) / (y_true + 1e-8))) * 100

        # Accuracy (within 10% of actual value)
        accuracy = np.mean(np.abs(y_true - y_pred) / (y_true + 1e-8) <= 0.1) * 100

        return {
            'mae': float(mae),
            'mse': float(mse),
            'rmse': float(rmse),
            'r2_score': float(r2),
            'mape': float(mape),
            'accuracy_10pct': float(accuracy),
            'training_date': datetime.now().isoformat()
        }

    def _save_model(self, model, model_path: str, metrics: Dict[str, Any]):
        """Save trained model and metadata"""

        try:
            # Save model
            joblib.dump({
                'model': model,
                'scalers': self.scalers,
                'encoders': self.encoders,
                'metrics': metrics
            }, model_path)

            # Save metadata
            metadata_path = model_path.replace('.pkl', '_metadata.json')
            with open(metadata_path, 'w') as f:
                json.dump(metrics, f, indent=2)

            logger.info(f"Model saved to {model_path}")
            logger.info(f"Metadata saved to {metadata_path}")

        except Exception as e:
            logger.error(f"Error saving model: {str(e)}")
            raise

    def evaluate_existing_model(self, model_path: str, test_data_path: str) -> Dict[str, Any]:
        """Evaluate an existing trained model"""

        try:
            logger.info(f"Evaluating model: {model_path}")

            # Load model
            model_data = joblib.load(model_path)
            model = model_data['model']
            scalers = model_data.get('scalers', {})
            encoders = model_data.get('encoders', {})

            # Load test data
            df_test = pd.read_csv(test_data_path)

            # Prepare test features (simplified)
            if 'demand' in model_path:
                X_test, y_test = self._engineer_demand_features(df_test)
            else:
                X_test, y_test = self._engineer_inventory_features(df_test)

            # Make predictions
            y_pred = model.predict(X_test)

            # Calculate metrics
            metrics = self._calculate_regression_metrics(y_test, y_pred)

            logger.info(f"Model evaluation completed:")
            logger.info(f"  MAE: {metrics['mae']:.2f}")
            logger.info(f"  RMSE: {metrics['rmse']:.2f}")
            logger.info(f"  R² Score: {metrics['r2_score']:.3f}")
            logger.info(f"  Accuracy (±10%): {metrics['accuracy_10pct']:.1f}%")

            return metrics

        except Exception as e:
            logger.error(f"Error evaluating model: {str(e)}")
            raise

    def create_synthetic_training_data(self, output_path: str, num_samples: int = 10000):
        """Create synthetic training data for development"""

        logger.info(f"Generating {num_samples} synthetic training samples")

        try:
            np.random.seed(42)

            business_types = ['Grocery Store', 'Electronics Store', 'Clothing Store', 'Medical Store', 'Cosmetics Store', 'Food & Beverage']
            business_scales = ['Micro', 'Small', 'Medium']
            locations = ['Karnataka', 'Maharashtra', 'Tamil Nadu', 'Gujarat', 'Delhi', 'West Bengal']

            data = []

            for i in range(num_samples):
                business_type = np.random.choice(business_types)
                business_scale = np.random.choice(business_scales)
                location = np.random.choice(locations)

                # Scale-based sales ranges
                scale_multipliers = {'Micro': 0.5, 'Small': 1.0, 'Medium': 2.0}
                base_sales = np.random.uniform(20000, 100000) * scale_multipliers[business_scale]

                # Seasonal and festival factors
                month = np.random.randint(1, 13)
                seasonal_factor = 1.0 + 0.3 * np.sin(2 * np.pi * month / 12)  # Seasonal pattern

                # Festival impact (higher in Oct-Nov)
                festival_impact = 0.8 if month in [10, 11] else np.random.uniform(0.2, 0.6)

                # Calculate projected sales
                projected_sales = base_sales * seasonal_factor * (1 + festival_impact)

                # Add some noise
                projected_sales *= np.random.normal(1.0, 0.1)

                data.append({
                    'business_name': f'Business_{i}',
                    'business_type': business_type,
                    'business_scale': business_scale,
                    'location': location,
                    'current_monthly_sales': base_sales,
                    'forecast_month': f'{month:02d}/2025',
                    'projected_sales': projected_sales,
                    'seasonal_factor': seasonal_factor,
                    'festival_impact': festival_impact,
                    'confidence_score': np.random.uniform(0.7, 0.95),
                    'generated_date': f'2025-{month:02d}-{np.random.randint(1, 29):02d}'
                })

            # Save to CSV
            df = pd.DataFrame(data)
            df.to_csv(output_path, index=False)

            logger.info(f"Synthetic training data saved to {output_path}")
            logger.info(f"Data shape: {df.shape}")

            return df

        except Exception as e:
            logger.error(f"Error creating synthetic data: {str(e)}")
            raise

def main():
    """Main function to handle command line arguments"""

    parser = argparse.ArgumentParser(description='Model training script for AI Supply Chain Platform')
    parser.add_argument('--model', '-m', choices=['demand', 'inventory', 'both'], 
                       default='both', help='Type of model to train')
    parser.add_argument('--data', '-d', help='Path to training data CSV file')
    parser.add_argument('--evaluate', '-e', action='store_true', help='Evaluate existing model')
    parser.add_argument('--model-path', '-p', help='Path to existing model for evaluation')
    parser.add_argument('--synthetic', '-s', action='store_true', help='Generate synthetic training data')
    parser.add_argument('--samples', type=int, default=10000, help='Number of synthetic samples to generate')

    args = parser.parse_args()

    # Initialize trainer
    trainer = ModelTrainer()

    try:
        if args.synthetic:
            # Generate synthetic data
            output_path = 'data/synthetic_training_data.csv'
            trainer.create_synthetic_training_data(output_path, args.samples)
            print(f"\n✅ Synthetic training data generated: {output_path}")
            sys.exit(0)

        if args.evaluate:
            # Evaluation mode
            if not args.model_path or not args.data:
                print("❌ Error: --model-path and --data are required for evaluation")
                sys.exit(1)

            metrics = trainer.evaluate_existing_model(args.model_path, args.data)
            print(f"\n✅ Model evaluation completed!")
            print(f"   Model: {args.model_path}")
            print(f"   MAE: {metrics['mae']:.2f}")
            print(f"   RMSE: {metrics['rmse']:.2f}")
            print(f"   R² Score: {metrics['r2_score']:.3f}")
            print(f"   Accuracy (±10%): {metrics['accuracy_10pct']:.1f}%")
            sys.exit(0)

        # Training mode
        if not args.data:
            print("❌ Error: --data is required for training")
            sys.exit(1)

        if not os.path.exists(args.data):
            print(f"❌ Error: Data file not found: {args.data}")
            sys.exit(1)

        results = {}

        if args.model in ['demand', 'both']:
            print("\n🤖 Training demand forecasting model...")
            demand_metrics = trainer.train_demand_forecasting_model(args.data)
            results['demand_forecasting'] = demand_metrics

        if args.model in ['inventory', 'both']:
            print("\n📦 Training inventory optimization model...")
            inventory_metrics = trainer.train_inventory_optimization_model(args.data)
            results['inventory_optimization'] = inventory_metrics

        # Display results
        print(f"\n✅ Model training completed successfully!")
        for model_name, metrics in results.items():
            print(f"\n{model_name.replace('_', ' ').title()} Model:")
            print(f"   MAE: {metrics['mae']:.2f}")
            print(f"   RMSE: {metrics['rmse']:.2f}")
            print(f"   R² Score: {metrics['r2_score']:.3f}")
            print(f"   Accuracy (±10%): {metrics['accuracy_10pct']:.1f}%")

    except KeyboardInterrupt:
        print("\n⚠️ Training cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()