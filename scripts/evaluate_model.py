#!/usr/bin/env python3
"""
Model evaluation script for AI Supply Chain Management Platform

This script handles:
- Model performance evaluation
- Accuracy metrics calculation
- Model comparison and benchmarking
- Performance monitoring and alerts

Usage:
    python scripts/evaluate_model.py --model models/forecasting_model.pkl --test-data data/test_data.csv
    python scripts/evaluate_model.py --compare --model1 models/old_model.pkl --model2 models/new_model.pkl
    python scripts/evaluate_model.py --benchmark --data data/historical_data.csv
"""

import sys
import os
import argparse
import pandas as pd
import numpy as np
import logging
import joblib
import json
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Tuple

# Add parent directory to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
import warnings
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('logs/model_evaluation.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class ModelEvaluator:
    """Handle model evaluation operations"""

    def __init__(self):
        self.evaluation_results = {}

        # Ensure directories exist
        os.makedirs('logs', exist_ok=True)
        os.makedirs('reports', exist_ok=True)

        # Set up plotting
        plt.style.use('default')
        sns.set_palette('husl')

    def evaluate_model(self, model_path: str, test_data_path: str, model_type: str = 'auto') -> Dict[str, Any]:
        """Evaluate a single model against test data"""

        logger.info(f"Evaluating model: {model_path}")
        logger.info(f"Test data: {test_data_path}")

        try:
            # Load model and test data
            model_data = self._load_model(model_path)
            test_df = self._load_test_data(test_data_path)

            # Determine model type if auto
            if model_type == 'auto':
                model_type = self._detect_model_type(model_path)

            # Prepare features and targets
            X_test, y_test = self._prepare_test_data(test_df, model_type, model_data)

            # Make predictions
            y_pred = model_data['model'].predict(X_test)

            # Calculate metrics
            metrics = self._calculate_comprehensive_metrics(y_test, y_pred, model_type)

            # Add model information
            metrics.update({
                'model_path': model_path,
                'model_type': model_type,
                'test_samples': len(y_test),
                'evaluation_date': datetime.now().isoformat()
            })

            # Generate evaluation plots
            self._generate_evaluation_plots(y_test, y_pred, model_path, model_type)

            # Store results
            self.evaluation_results[model_path] = metrics

            logger.info(f"Model evaluation completed successfully")
            return metrics

        except Exception as e:
            logger.error(f"Error evaluating model: {str(e)}")
            raise

    def compare_models(self, model_paths: List[str], test_data_path: str) -> Dict[str, Any]:
        """Compare multiple models against the same test data"""

        logger.info(f"Comparing {len(model_paths)} models")

        comparison_results = {}
        all_predictions = {}

        # Load test data once
        test_df = self._load_test_data(test_data_path)

        for model_path in model_paths:
            try:
                logger.info(f"Evaluating {model_path}...")

                # Evaluate each model
                metrics = self.evaluate_model(model_path, test_data_path)
                comparison_results[model_path] = metrics

                # Store predictions for comparison plots
                model_data = self._load_model(model_path)
                model_type = self._detect_model_type(model_path)
                X_test, y_test = self._prepare_test_data(test_df, model_type, model_data)
                y_pred = model_data['model'].predict(X_test)

                all_predictions[model_path] = {
                    'y_test': y_test,
                    'y_pred': y_pred,
                    'model_name': Path(model_path).stem
                }

            except Exception as e:
                logger.error(f"Error evaluating {model_path}: {str(e)}")
                continue

        # Generate comparison report
        comparison_report = self._generate_comparison_report(comparison_results)

        # Generate comparison plots
        self._generate_comparison_plots(all_predictions)

        return {
            'individual_results': comparison_results,
            'comparison_report': comparison_report,
            'best_model': self._find_best_model(comparison_results)
        }

    def benchmark_model(self, model_path: str, historical_data_path: str, time_periods: int = 6) -> Dict[str, Any]:
        """Benchmark model against historical performance over multiple time periods"""

        logger.info(f"Benchmarking model over {time_periods} time periods")

        try:
            # Load historical data
            historical_df = pd.read_csv(historical_data_path)

            # Convert date column if exists
            date_columns = ['date', 'forecast_date', 'created_date', 'generated_date']
            date_col = None
            for col in date_columns:
                if col in historical_df.columns:
                    historical_df[col] = pd.to_datetime(historical_df[col])
                    date_col = col
                    break

            if not date_col:
                logger.warning("No date column found, using sequential periods")
                historical_df['period'] = np.arange(len(historical_df)) // (len(historical_df) // time_periods)
            else:
                # Create time periods based on dates
                historical_df = historical_df.sort_values(date_col)
                historical_df['period'] = pd.cut(
                    historical_df[date_col], 
                    bins=time_periods, 
                    labels=False
                )

            # Evaluate model on each time period
            period_results = {}

            for period in range(time_periods):
                period_data = historical_df[historical_df['period'] == period]

                if len(period_data) < 10:  # Skip periods with too few samples
                    continue

                logger.info(f"Evaluating period {period + 1}/{time_periods} ({len(period_data)} samples)")

                # Save period data temporarily
                temp_file = f'temp_period_{period}.csv'
                period_data.to_csv(temp_file, index=False)

                try:
                    # Evaluate model on this period
                    period_metrics = self.evaluate_model(model_path, temp_file)
                    period_results[f'period_{period + 1}'] = period_metrics

                    # Clean up temp file
                    os.remove(temp_file)

                except Exception as e:
                    logger.warning(f"Error evaluating period {period + 1}: {str(e)}")
                    if os.path.exists(temp_file):
                        os.remove(temp_file)
                    continue

            # Calculate benchmark statistics
            benchmark_stats = self._calculate_benchmark_statistics(period_results)

            # Generate benchmark report
            benchmark_report = {
                'model_path': model_path,
                'time_periods': time_periods,
                'period_results': period_results,
                'benchmark_statistics': benchmark_stats,
                'benchmark_date': datetime.now().isoformat()
            }

            # Generate benchmark plots
            self._generate_benchmark_plots(period_results, model_path)

            return benchmark_report

        except Exception as e:
            logger.error(f"Error benchmarking model: {str(e)}")
            raise

    def monitor_model_performance(self, model_path: str, recent_data_path: str, 
                                 performance_threshold: float = 0.85) -> Dict[str, Any]:
        """Monitor model performance and generate alerts if performance degrades"""

        logger.info(f"Monitoring model performance with threshold: {performance_threshold}")

        try:
            # Evaluate current performance
            current_metrics = self.evaluate_model(model_path, recent_data_path)

            # Load historical performance if available
            performance_history_path = model_path.replace('.pkl', '_performance_history.json')

            if os.path.exists(performance_history_path):
                with open(performance_history_path, 'r') as f:
                    performance_history = json.load(f)
            else:
                performance_history = {'evaluations': []}

            # Add current evaluation to history
            performance_history['evaluations'].append({
                'date': datetime.now().isoformat(),
                'metrics': current_metrics
            })

            # Save updated history
            with open(performance_history_path, 'w') as f:
                json.dump(performance_history, f, indent=2)

            # Analyze performance trends
            performance_analysis = self._analyze_performance_trends(performance_history)

            # Generate alerts if needed
            alerts = self._generate_performance_alerts(
                current_metrics, 
                performance_analysis, 
                performance_threshold
            )

            monitoring_report = {
                'current_performance': current_metrics,
                'performance_analysis': performance_analysis,
                'alerts': alerts,
                'monitoring_date': datetime.now().isoformat()
            }

            return monitoring_report

        except Exception as e:
            logger.error(f"Error monitoring model performance: {str(e)}")
            raise

    def _load_model(self, model_path: str) -> Dict[str, Any]:
        """Load trained model and associated data"""

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")

        try:
            model_data = joblib.load(model_path)
            return model_data
        except Exception as e:
            raise ValueError(f"Error loading model: {str(e)}")

    def _load_test_data(self, test_data_path: str) -> pd.DataFrame:
        """Load test data"""

        if not os.path.exists(test_data_path):
            raise FileNotFoundError(f"Test data file not found: {test_data_path}")

        df = pd.read_csv(test_data_path)

        # Handle missing values
        numeric_columns = df.select_dtypes(include=[np.number]).columns
        df[numeric_columns] = df[numeric_columns].fillna(df[numeric_columns].median())

        categorical_columns = df.select_dtypes(include=['object']).columns
        df[categorical_columns] = df[categorical_columns].fillna('Unknown')

        return df

    def _detect_model_type(self, model_path: str) -> str:
        """Detect model type from path"""

        path_lower = model_path.lower()

        if 'demand' in path_lower or 'forecast' in path_lower:
            return 'demand_forecasting'
        elif 'inventory' in path_lower:
            return 'inventory_optimization'
        else:
            return 'regression'  # Default

    def _prepare_test_data(self, df: pd.DataFrame, model_type: str, model_data: Dict[str, Any]) -> Tuple[np.ndarray, np.ndarray]:
        """Prepare test data for prediction"""

        # This is a simplified version - in production, you'd use the same
        # feature engineering pipeline as in training

        try:
            # Try to use the same scalers and encoders from training
            scalers = model_data.get('scalers', {})
            encoders = model_data.get('encoders', {})

            # Prepare features based on model type
            if model_type == 'demand_forecasting':
                X, y = self._prepare_demand_features(df, scalers, encoders)
            elif model_type == 'inventory_optimization':
                X, y = self._prepare_inventory_features(df, scalers, encoders)
            else:
                # Generic regression preparation
                numeric_columns = df.select_dtypes(include=[np.number]).columns
                if len(numeric_columns) < 2:
                    raise ValueError("Not enough numeric columns for regression")

                X = df[numeric_columns[:-1]].values
                y = df[numeric_columns[-1]].values

            return X, y

        except Exception as e:
            logger.error(f"Error preparing test data: {str(e)}")
            # Fallback to simple numeric approach
            numeric_columns = df.select_dtypes(include=[np.number]).columns
            if len(numeric_columns) >= 2:
                X = df[numeric_columns[:-1]].values
                y = df[numeric_columns[-1]].values
                return X, y
            else:
                raise ValueError("Cannot prepare test data - insufficient numeric columns")

    def _prepare_demand_features(self, df: pd.DataFrame, scalers: Dict, encoders: Dict) -> Tuple[np.ndarray, np.ndarray]:
        """Prepare demand forecasting features"""

        features = []

        # Use actual columns available in the data
        numeric_features = ['current_monthly_sales', 'seasonal_factor', 'festival_impact', 'confidence_score']
        available_numeric = [col for col in numeric_features if col in df.columns]

        for feature in available_numeric:
            values = df[feature].values
            features.append(values.reshape(-1, 1))

        # If we have categorical features, encode them
        categorical_features = ['business_type', 'business_scale', 'location']
        for feature in categorical_features:
            if feature in df.columns and feature in encoders:
                try:
                    encoded = encoders[feature].transform(df[feature].astype(str))
                    features.append(encoded.reshape(-1, 1))
                except Exception:
                    logger.warning(f"Could not encode feature {feature}, skipping")

        if not features:
            # Fallback: use all numeric columns except target
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if 'projected_sales' in numeric_cols:
                numeric_cols.remove('projected_sales')
            if len(numeric_cols) == 0:
                raise ValueError("No features available for prediction")
            X = df[numeric_cols].values
        else:
            X = np.hstack(features)

        # Target variable
        if 'projected_sales' in df.columns:
            y = df['projected_sales'].values
        elif 'actual_sales' in df.columns:
            y = df['actual_sales'].values
        else:
            # Use the last numeric column as target
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            y = df[numeric_cols[-1]].values

        # Apply scaling if available
        scaler_name = 'demand_scaler'
        if scaler_name in scalers:
            try:
                X = scalers[scaler_name].transform(X)
            except Exception:
                logger.warning(f"Could not apply scaler {scaler_name}")

        return X, y

    def _prepare_inventory_features(self, df: pd.DataFrame, scalers: Dict, encoders: Dict) -> Tuple[np.ndarray, np.ndarray]:
        """Prepare inventory optimization features"""

        features = []

        # Use actual columns available in the data
        numeric_features = ['current_stock', 'min_stock_level', 'max_stock_level', 'unit_cost', 'selling_price']
        available_numeric = [col for col in numeric_features if col in df.columns]

        for feature in available_numeric:
            values = df[feature].values
            features.append(values.reshape(-1, 1))

        if not features:
            # Fallback: use all numeric columns except target
            numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
            if 'optimal_stock' in numeric_cols:
                numeric_cols.remove('optimal_stock')
            if len(numeric_cols) == 0:
                raise ValueError("No features available for prediction")
            X = df[numeric_cols].values
        else:
            X = np.hstack(features)

        # Target variable
        if 'optimal_stock' in df.columns:
            y = df['optimal_stock'].values
        elif 'current_stock' in df.columns:
            # Use current stock as proxy target
            y = df['current_stock'].values
        else:
            # Use the last numeric column as target
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            y = df[numeric_cols[-1]].values

        # Apply scaling if available
        scaler_name = 'inventory_scaler'
        if scaler_name in scalers:
            try:
                X = scalers[scaler_name].transform(X)
            except Exception:
                logger.warning(f"Could not apply scaler {scaler_name}")

        return X, y

    def _calculate_comprehensive_metrics(self, y_true: np.ndarray, y_pred: np.ndarray, 
                                        model_type: str) -> Dict[str, float]:
        """Calculate comprehensive evaluation metrics"""

        metrics = {}

        # Regression metrics
        metrics['mae'] = float(mean_absolute_error(y_true, y_pred))
        metrics['mse'] = float(mean_squared_error(y_true, y_pred))
        metrics['rmse'] = float(np.sqrt(metrics['mse']))
        metrics['r2_score'] = float(r2_score(y_true, y_pred))

        # Mean Absolute Percentage Error
        mape = np.mean(np.abs((y_true - y_pred) / (y_true + 1e-8))) * 100
        metrics['mape'] = float(mape)

        # Accuracy within different thresholds
        for threshold in [0.05, 0.10, 0.15, 0.20]:
            accuracy = np.mean(np.abs(y_true - y_pred) / (y_true + 1e-8) <= threshold) * 100
            metrics[f'accuracy_{int(threshold*100)}pct'] = float(accuracy)

        # Directional accuracy (for forecasting)
        if len(y_true) > 1:
            y_true_diff = np.diff(y_true)
            y_pred_diff = np.diff(y_pred)
            directional_accuracy = np.mean(np.sign(y_true_diff) == np.sign(y_pred_diff)) * 100
            metrics['directional_accuracy'] = float(directional_accuracy)

        # Bias metrics
        metrics['mean_bias'] = float(np.mean(y_pred - y_true))
        metrics['median_bias'] = float(np.median(y_pred - y_true))

        # Model-specific metrics
        if model_type == 'demand_forecasting':
            # Forecasting-specific metrics
            metrics['forecast_skill'] = self._calculate_forecast_skill(y_true, y_pred)
            metrics['seasonal_accuracy'] = self._calculate_seasonal_accuracy(y_true, y_pred)

        elif model_type == 'inventory_optimization':
            # Inventory-specific metrics
            metrics['stockout_risk'] = self._calculate_stockout_risk(y_true, y_pred)
            metrics['overstock_risk'] = self._calculate_overstock_risk(y_true, y_pred)

        return metrics

    def _calculate_forecast_skill(self, y_true: np.ndarray, y_pred: np.ndarray) -> float:
        """Calculate forecast skill score"""

        try:
            # Simple forecast skill vs naive forecast (previous value)
            if len(y_true) < 2:
                return 0.0

            naive_forecast = np.roll(y_true, 1)[1:]
            y_true_subset = y_true[1:]
            y_pred_subset = y_pred[1:]

            mse_model = mean_squared_error(y_true_subset, y_pred_subset)
            mse_naive = mean_squared_error(y_true_subset, naive_forecast)

            skill_score = 1 - (mse_model / (mse_naive + 1e-8))
            return float(max(0, skill_score))  # Ensure non-negative

        except Exception:
            return 0.0

    def _calculate_seasonal_accuracy(self, y_true: np.ndarray, y_pred: np.ndarray) -> float:
        """Calculate seasonal accuracy"""

        try:
            # Simple seasonal pattern accuracy
            if len(y_true) < 12:
                return float(r2_score(y_true, y_pred))

            # Compare seasonal patterns (simplified)
            seasonal_true = np.mean(y_true.reshape(-1, min(12, len(y_true)//2)), axis=1)
            seasonal_pred = np.mean(y_pred.reshape(-1, min(12, len(y_pred)//2)), axis=1)

            return float(r2_score(seasonal_true, seasonal_pred))

        except Exception:
            return float(r2_score(y_true, y_pred))

    def _calculate_stockout_risk(self, y_true: np.ndarray, y_pred: np.ndarray) -> float:
        """Calculate stockout risk for inventory models"""

        # Simplified: percentage of predictions below actual values
        stockout_instances = np.mean(y_pred < y_true) * 100
        return float(stockout_instances)

    def _calculate_overstock_risk(self, y_true: np.ndarray, y_pred: np.ndarray) -> float:
        """Calculate overstock risk for inventory models"""

        # Simplified: percentage of predictions significantly above actual values
        overstock_threshold = 1.2  # 20% above actual
        overstock_instances = np.mean(y_pred > y_true * overstock_threshold) * 100
        return float(overstock_instances)

    def _generate_evaluation_plots(self, y_true: np.ndarray, y_pred: np.ndarray, 
                                  model_path: str, model_type: str):
        """Generate evaluation plots"""

        try:
            model_name = Path(model_path).stem

            fig, axes = plt.subplots(2, 2, figsize=(12, 10))
            fig.suptitle(f'Model Evaluation: {model_name}', fontsize=16)

            # Actual vs Predicted scatter plot
            axes[0, 0].scatter(y_true, y_pred, alpha=0.6)
            axes[0, 0].plot([y_true.min(), y_true.max()], [y_true.min(), y_true.max()], 'r--', lw=2)
            axes[0, 0].set_xlabel('Actual Values')
            axes[0, 0].set_ylabel('Predicted Values')
            axes[0, 0].set_title('Actual vs Predicted')

            # Residuals plot
            residuals = y_pred - y_true
            axes[0, 1].scatter(y_pred, residuals, alpha=0.6)
            axes[0, 1].axhline(y=0, color='r', linestyle='--')
            axes[0, 1].set_xlabel('Predicted Values')
            axes[0, 1].set_ylabel('Residuals')
            axes[0, 1].set_title('Residuals Plot')

            # Residuals histogram
            axes[1, 0].hist(residuals, bins=30, alpha=0.7)
            axes[1, 0].set_xlabel('Residuals')
            axes[1, 0].set_ylabel('Frequency')
            axes[1, 0].set_title('Residuals Distribution')

            # Time series plot (if applicable)
            if len(y_true) > 10:
                indices = np.arange(len(y_true))
                axes[1, 1].plot(indices, y_true, label='Actual', alpha=0.8)
                axes[1, 1].plot(indices, y_pred, label='Predicted', alpha=0.8)
                axes[1, 1].set_xlabel('Sample Index')
                axes[1, 1].set_ylabel('Values')
                axes[1, 1].set_title('Time Series Comparison')
                axes[1, 1].legend()
            else:
                axes[1, 1].axis('off')

            plt.tight_layout()

            # Save plot
            plot_path = f'reports/{model_name}_evaluation_plots.png'
            plt.savefig(plot_path, dpi=150, bbox_inches='tight')
            plt.close()

            logger.info(f"Evaluation plots saved to {plot_path}")

        except Exception as e:
            logger.warning(f"Could not generate evaluation plots: {str(e)}")

    def _generate_comparison_report(self, comparison_results: Dict[str, Dict]) -> Dict[str, Any]:
        """Generate model comparison report"""

        if not comparison_results:
            return {}

        metrics_summary = {}

        # Get all metric names
        all_metrics = set()
        for results in comparison_results.values():
            all_metrics.update(results.keys())

        # Calculate statistics for each metric
        for metric in all_metrics:
            if metric in ['model_path', 'model_type', 'evaluation_date', 'test_samples']:
                continue

            values = []
            for results in comparison_results.values():
                if metric in results and isinstance(results[metric], (int, float)):
                    values.append(results[metric])

            if values:
                metrics_summary[metric] = {
                    'mean': float(np.mean(values)),
                    'std': float(np.std(values)),
                    'min': float(np.min(values)),
                    'max': float(np.max(values))
                }

        return metrics_summary

    def _generate_comparison_plots(self, all_predictions: Dict[str, Dict]):
        """Generate comparison plots for multiple models"""

        try:
            if not all_predictions:
                return

            fig, axes = plt.subplots(2, 2, figsize=(15, 12))
            fig.suptitle('Model Comparison', fontsize=16)

            colors = plt.cm.tab10(np.linspace(0, 1, len(all_predictions)))

            # Comparison scatter plot
            for i, (model_path, data) in enumerate(all_predictions.items()):
                axes[0, 0].scatter(data['y_test'], data['y_pred'], 
                                 alpha=0.6, color=colors[i], 
                                 label=data['model_name'])

            axes[0, 0].plot([0, 1], [0, 1], 'r--', transform=axes[0, 0].transAxes)
            axes[0, 0].set_xlabel('Actual Values')
            axes[0, 0].set_ylabel('Predicted Values')
            axes[0, 0].set_title('Actual vs Predicted Comparison')
            axes[0, 0].legend()

            # MAE comparison
            mae_values = []
            model_names = []
            for model_path, data in all_predictions.items():
                mae = mean_absolute_error(data['y_test'], data['y_pred'])
                mae_values.append(mae)
                model_names.append(data['model_name'])

            axes[0, 1].bar(model_names, mae_values, color=colors[:len(model_names)])
            axes[0, 1].set_ylabel('Mean Absolute Error')
            axes[0, 1].set_title('MAE Comparison')
            axes[0, 1].tick_params(axis='x', rotation=45)

            # R² comparison
            r2_values = []
            for model_path, data in all_predictions.items():
                r2 = r2_score(data['y_test'], data['y_pred'])
                r2_values.append(r2)

            axes[1, 0].bar(model_names, r2_values, color=colors[:len(model_names)])
            axes[1, 0].set_ylabel('R² Score')
            axes[1, 0].set_title('R² Score Comparison')
            axes[1, 0].tick_params(axis='x', rotation=45)

            # Residuals comparison (boxplot)
            residuals_data = []
            for model_path, data in all_predictions.items():
                residuals = data['y_pred'] - data['y_test']
                residuals_data.append(residuals)

            axes[1, 1].boxplot(residuals_data, labels=model_names)
            axes[1, 1].set_ylabel('Residuals')
            axes[1, 1].set_title('Residuals Distribution Comparison')
            axes[1, 1].tick_params(axis='x', rotation=45)

            plt.tight_layout()

            # Save plot
            plot_path = 'reports/model_comparison_plots.png'
            plt.savefig(plot_path, dpi=150, bbox_inches='tight')
            plt.close()

            logger.info(f"Comparison plots saved to {plot_path}")

        except Exception as e:
            logger.warning(f"Could not generate comparison plots: {str(e)}")

    def _generate_benchmark_plots(self, period_results: Dict[str, Dict], model_path: str):
        """Generate benchmark performance plots"""

        try:
            model_name = Path(model_path).stem

            if not period_results:
                return

            # Extract metrics over time periods
            periods = list(period_results.keys())
            mae_values = [period_results[p]['mae'] for p in periods]
            r2_values = [period_results[p]['r2_score'] for p in periods]
            accuracy_values = [period_results[p].get('accuracy_10pct', 0) for p in periods]

            fig, axes = plt.subplots(2, 2, figsize=(12, 10))
            fig.suptitle(f'Model Benchmark: {model_name}', fontsize=16)

            # MAE over time
            axes[0, 0].plot(periods, mae_values, marker='o')
            axes[0, 0].set_ylabel('Mean Absolute Error')
            axes[0, 0].set_title('MAE Over Time Periods')
            axes[0, 0].tick_params(axis='x', rotation=45)

            # R² over time
            axes[0, 1].plot(periods, r2_values, marker='o', color='orange')
            axes[0, 1].set_ylabel('R² Score')
            axes[0, 1].set_title('R² Score Over Time Periods')
            axes[0, 1].tick_params(axis='x', rotation=45)

            # Accuracy over time
            axes[1, 0].plot(periods, accuracy_values, marker='o', color='green')
            axes[1, 0].set_ylabel('Accuracy (±10%)')
            axes[1, 0].set_title('Accuracy Over Time Periods')
            axes[1, 0].tick_params(axis='x', rotation=45)

            # Performance summary
            metrics_summary = {
                'MAE': mae_values,
                'R²': r2_values,
                'Accuracy': accuracy_values
            }

            axes[1, 1].boxplot([mae_values, r2_values, accuracy_values], 
                              labels=['MAE', 'R²', 'Acc (±10%)'])
            axes[1, 1].set_ylabel('Metric Values')
            axes[1, 1].set_title('Performance Distribution')

            plt.tight_layout()

            # Save plot
            plot_path = f'reports/{model_name}_benchmark_plots.png'
            plt.savefig(plot_path, dpi=150, bbox_inches='tight')
            plt.close()

            logger.info(f"Benchmark plots saved to {plot_path}")

        except Exception as e:
            logger.warning(f"Could not generate benchmark plots: {str(e)}")

    def _calculate_benchmark_statistics(self, period_results: Dict[str, Dict]) -> Dict[str, Any]:
        """Calculate benchmark statistics across time periods"""

        if not period_results:
            return {}

        metrics_to_analyze = ['mae', 'rmse', 'r2_score', 'mape', 'accuracy_10pct']
        statistics = {}

        for metric in metrics_to_analyze:
            values = []
            for period_result in period_results.values():
                if metric in period_result:
                    values.append(period_result[metric])

            if values:
                statistics[metric] = {
                    'mean': float(np.mean(values)),
                    'std': float(np.std(values)),
                    'min': float(np.min(values)),
                    'max': float(np.max(values)),
                    'median': float(np.median(values)),
                    'stability': float(1 - np.std(values) / (np.mean(values) + 1e-8))  # Higher is more stable
                }

        return statistics

    def _find_best_model(self, comparison_results: Dict[str, Dict]) -> Dict[str, str]:
        """Find the best performing model across different metrics"""

        if not comparison_results:
            return {}

        best_models = {}

        # Metrics where lower is better
        lower_is_better = ['mae', 'mse', 'rmse', 'mape']

        # Metrics where higher is better
        higher_is_better = ['r2_score', 'accuracy_10pct', 'accuracy_15pct', 'accuracy_20pct']

        for metric in lower_is_better:
            best_value = float('inf')
            best_model = None

            for model_path, results in comparison_results.items():
                if metric in results and results[metric] < best_value:
                    best_value = results[metric]
                    best_model = Path(model_path).stem

            if best_model:
                best_models[f'best_{metric}'] = best_model

        for metric in higher_is_better:
            best_value = float('-inf')
            best_model = None

            for model_path, results in comparison_results.items():
                if metric in results and results[metric] > best_value:
                    best_value = results[metric]
                    best_model = Path(model_path).stem

            if best_model:
                best_models[f'best_{metric}'] = best_model

        return best_models

    def _analyze_performance_trends(self, performance_history: Dict[str, List]) -> Dict[str, Any]:
        """Analyze performance trends over time"""

        evaluations = performance_history.get('evaluations', [])

        if len(evaluations) < 2:
            return {'trend': 'insufficient_data'}

        # Extract recent performance metrics
        recent_evaluations = evaluations[-5:]  # Last 5 evaluations

        trends = {}

        for metric in ['mae', 'rmse', 'r2_score', 'mape']:
            values = []
            for evaluation in recent_evaluations:
                if metric in evaluation['metrics']:
                    values.append(evaluation['metrics'][metric])

            if len(values) >= 2:
                # Simple trend analysis
                trend_direction = 'stable'
                if len(values) >= 3:
                    recent_avg = np.mean(values[-2:])
                    older_avg = np.mean(values[:-2])

                    if metric in ['mae', 'rmse', 'mape']:  # Lower is better
                        if recent_avg < older_avg * 0.95:
                            trend_direction = 'improving'
                        elif recent_avg > older_avg * 1.05:
                            trend_direction = 'degrading'
                    else:  # Higher is better
                        if recent_avg > older_avg * 1.05:
                            trend_direction = 'improving'
                        elif recent_avg < older_avg * 0.95:
                            trend_direction = 'degrading'

                trends[metric] = {
                    'trend_direction': trend_direction,
                    'recent_average': float(np.mean(values[-2:])) if len(values) >= 2 else values[-1],
                    'overall_average': float(np.mean(values)),
                    'volatility': float(np.std(values)) if len(values) > 1 else 0.0
                }

        return trends

    def _generate_performance_alerts(self, current_metrics: Dict[str, Any], 
                                   performance_analysis: Dict[str, Any], 
                                   threshold: float) -> List[Dict[str, str]]:
        """Generate performance alerts based on analysis"""

        alerts = []

        # Check if current performance is below threshold
        if 'accuracy_10pct' in current_metrics:
            if current_metrics['accuracy_10pct'] / 100 < threshold:
                alerts.append({
                    'level': 'WARNING',
                    'type': 'performance_degradation',
                    'message': f"Model accuracy ({current_metrics['accuracy_10pct']:.1f}%) is below threshold ({threshold*100:.1f}%)",
                    'metric': 'accuracy_10pct',
                    'current_value': current_metrics['accuracy_10pct']
                })

        # Check for degrading trends
        for metric, trend_info in performance_analysis.items():
            if isinstance(trend_info, dict) and trend_info.get('trend_direction') == 'degrading':
                alerts.append({
                    'level': 'WARNING',
                    'type': 'performance_trend',
                    'message': f"Degrading trend detected in {metric}",
                    'metric': metric,
                    'trend_direction': 'degrading'
                })

        # Check for high volatility
        for metric, trend_info in performance_analysis.items():
            if isinstance(trend_info, dict) and trend_info.get('volatility', 0) > 0.2:
                alerts.append({
                    'level': 'INFO',
                    'type': 'high_volatility',
                    'message': f"High volatility detected in {metric} performance",
                    'metric': metric,
                    'volatility': trend_info['volatility']
                })

        return alerts

def main():
    """Main function to handle command line arguments"""

    parser = argparse.ArgumentParser(description='Model evaluation script for AI Supply Chain Platform')
    parser.add_argument('--model', '-m', help='Path to trained model file (.pkl)')
    parser.add_argument('--test-data', '-d', help='Path to test data CSV file')
    parser.add_argument('--compare', '-c', action='store_true', help='Compare multiple models')
    parser.add_argument('--model1', help='First model for comparison')
    parser.add_argument('--model2', help='Second model for comparison')
    parser.add_argument('--models', nargs='+', help='List of models to compare')
    parser.add_argument('--benchmark', '-b', action='store_true', help='Benchmark model over time periods')
    parser.add_argument('--historical-data', help='Historical data for benchmarking')
    parser.add_argument('--periods', type=int, default=6, help='Number of time periods for benchmarking')
    parser.add_argument('--monitor', action='store_true', help='Monitor model performance')
    parser.add_argument('--threshold', type=float, default=0.85, help='Performance threshold for monitoring')
    parser.add_argument('--output', '-o', help='Output file for results (JSON)')

    args = parser.parse_args()

    # Initialize evaluator
    evaluator = ModelEvaluator()

    try:
        results = {}

        if args.compare:
            # Model comparison mode
            model_paths = []

            if args.models:
                model_paths = args.models
            elif args.model1 and args.model2:
                model_paths = [args.model1, args.model2]
            else:
                print("❌ Error: For comparison, provide either --models or --model1 and --model2")
                sys.exit(1)

            if not args.test_data:
                print("❌ Error: --test-data is required for comparison")
                sys.exit(1)

            print(f"\n🔄 Comparing {len(model_paths)} models...")
            results = evaluator.compare_models(model_paths, args.test_data)

            print(f"\n✅ Model comparison completed!")

            # Display best models
            best_models = results.get('best_model', {})
            if best_models:
                print(f"\n🏆 Best performing models:")
                for metric, model in best_models.items():
                    print(f"   {metric}: {model}")

        elif args.benchmark:
            # Benchmarking mode
            if not args.model or not args.historical_data:
                print("❌ Error: --model and --historical-data are required for benchmarking")
                sys.exit(1)

            print(f"\n📊 Benchmarking model over {args.periods} time periods...")
            results = evaluator.benchmark_model(args.model, args.historical_data, args.periods)

            print(f"\n✅ Model benchmarking completed!")

            # Display benchmark statistics
            stats = results.get('benchmark_statistics', {})
            if stats:
                print(f"\n📈 Benchmark Statistics:")
                for metric, stat_info in stats.items():
                    if isinstance(stat_info, dict):
                        print(f"   {metric}:")
                        print(f"     Mean: {stat_info.get('mean', 0):.3f}")
                        print(f"     Std: {stat_info.get('std', 0):.3f}")
                        print(f"     Stability: {stat_info.get('stability', 0):.3f}")

        elif args.monitor:
            # Monitoring mode
            if not args.model or not args.test_data:
                print("❌ Error: --model and --test-data are required for monitoring")
                sys.exit(1)

            print(f"\n👁️ Monitoring model performance...")
            results = evaluator.monitor_model_performance(args.model, args.test_data, args.threshold)

            print(f"\n✅ Model monitoring completed!")

            # Display alerts
            alerts = results.get('alerts', [])
            if alerts:
                print(f"\n⚠️ Performance Alerts:")
                for alert in alerts:
                    print(f"   [{alert['level']}] {alert['message']}")
            else:
                print(f"\n✅ No performance issues detected")

        else:
            # Single model evaluation
            if not args.model or not args.test_data:
                print("❌ Error: --model and --test-data are required")
                sys.exit(1)

            print(f"\n🔍 Evaluating single model...")
            results = evaluator.evaluate_model(args.model, args.test_data)

            print(f"\n✅ Model evaluation completed!")
            print(f"   Model: {Path(args.model).stem}")
            print(f"   MAE: {results['mae']:.2f}")
            print(f"   RMSE: {results['rmse']:.2f}")
            print(f"   R² Score: {results['r2_score']:.3f}")
            print(f"   MAPE: {results['mape']:.1f}%")
            print(f"   Accuracy (±10%): {results.get('accuracy_10pct', 0):.1f}%")

        # Save results to file if requested
        if args.output:
            with open(args.output, 'w') as f:
                json.dump(results, f, indent=2, default=str)
            print(f"\n💾 Results saved to {args.output}")

    except KeyboardInterrupt:
        print("\n⚠️ Evaluation cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()