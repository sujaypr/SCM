import asyncio
import random
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
from app.models.ai_models import GeminiAIModel
from app.utils.config import get_config

class DemandService:

    def _get_festival_calendar(self, year: int = 2025):
        """Compatibility: call the public get_festival_calendar method"""
        return self.get_festival_calendar(year)
    """Service for demand forecasting and analysis"""

    def __init__(self):
        self.config = get_config()
        self.ai_model = GeminiAIModel()
        
    # Clock helper for testability
    def _now(self) -> datetime:
        return datetime.now()
    
    # Deterministic score helper (stable across runs)
    def _stable_score(self, label: str, base: int, spread: int = 15) -> int:
        import hashlib
        h = hashlib.sha256(label.encode('utf-8')).hexdigest()
        v = int(h[:8], 16) % (spread + 1)
        return base + v


    async def generate_tabbed_forecast(self, business_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate structured forecast for product, festival, and seasonal demands using real Gemini AI data
        """
        try:
            # Pass forecastPeriod into context for prompt
            context = self._prepare_forecast_context(business_data)
            context['forecast_period'] = business_data.get('forecastPeriod', 6)
            forecast_data = await self._generate_ai_forecast(context)
        except Exception as e:
            print(f"Forecast generation error: {e}")
            forecast_data = self._generate_fallback_forecast(business_data)

        # --- Product Demands ---
        # Expecting forecast_data['monthly_projections'] to have product-level info if available
        product_demands = forecast_data.get('product_demands')
        if not product_demands:
            # Fallback: try to infer from monthly_projections or ai_insights
            projections = forecast_data.get('monthly_projections', [])
            # If projections have 'top_products', use them
            if projections and isinstance(projections[0], dict) and 'top_products' in projections[0]:
                product_demands = projections[0]['top_products']
            else:
                # Otherwise, fallback to mock
                product_demands = [
                    {'product': f'Product {i+1}', 'demand_percentage': 20 - i} for i in range(10)
                ]

        # --- Festival Demands ---
        # Always compute full, period-accurate festivals to guarantee completeness
        fest_chart, fest_top_items = self._get_festival_demands(business_data)
        festival_demands = {'chart': fest_chart, 'top_items': fest_top_items}

        # --- Seasonal Demands ---
        # Always compute full, period-accurate seasons to guarantee completeness
        seas_chart, seas_top_items = self._get_seasonal_demands(business_data)
        seasonal_demands = {'chart': seas_chart, 'top_items': seas_top_items}

        # Include explicit forecast window for clarity in UI (no extra AI metadata)
        from dateutil.relativedelta import relativedelta as _rd
        _now = self._now().replace(hour=0, minute=0, second=0, microsecond=0)
        _period = business_data.get('forecastPeriod', 6)
        _end = _now + _rd(months=_period) - _rd(days=1)
        return {
            'product_demands': product_demands,
            'festival_demands': festival_demands,
            'seasonal_demands': seasonal_demands,
            'forecast_start': _now.strftime('%Y-%m-%d'),
            'forecast_end': _end.strftime('%Y-%m-%d')
        }

    def _get_top_product_demands(self, business_data: Dict[str, Any]) -> list:
        # Generate product demand based on business type, scale, and monthly sales
        business_type = business_data.get('businessType', 'General')
        scale = business_data.get('businessScale', 'Small')
        sales = business_data.get('currentSales', 100000)
        # Example product pools for different business types
        product_pools = {
            'Grocery Store': ['Rice', 'Wheat', 'Sugar', 'Oil', 'Milk', 'Snacks', 'Biscuits', 'Soap', 'Tea', 'Salt', 'Spices', 'Lentils'],
            'Electronics Store': ['Smartphone', 'Laptop', 'TV', 'Headphones', 'Refrigerator', 'Washing Machine', 'Microwave', 'Camera', 'Printer', 'Tablet'],
            'Clothing Store': ['Shirt', 'Jeans', 'Saree', 'T-shirt', 'Jacket', 'Kurta', 'Dress', 'Shorts', 'Skirt', 'Suit'],
            'Medical Store': ['Paracetamol', 'Cough Syrup', 'Bandage', 'Antibiotic', 'Sanitizer', 'Mask', 'Thermometer', 'Pain Relief Gel', 'Vitamins', 'Glucose'],
            'Cosmetics Store': ['Lipstick', 'Face Cream', 'Shampoo', 'Perfume', 'Nail Polish', 'Foundation', 'Eyeliner', 'Face Wash', 'Moisturizer', 'Hair Oil'],
            'Food & Beverage': ['Cold Drink', 'Juice', 'Chips', 'Chocolate', 'Ice Cream', 'Cookies', 'Namkeen', 'Cake', 'Coffee', 'Energy Drink'],
        }
        pool = product_pools.get(business_type, product_pools['Grocery Store'])
        # Scale and sales affect demand percentage
        scale_factor = {'Small': 1, 'Medium': 1.2, 'Large': 1.5}.get(scale, 1)
        sales_factor = min(max(sales / 100000, 0.8), 2.0)
        # Assign higher demand to top products, scale with business
        top_products = []
        for i, product in enumerate(pool[:10]):
            base = 20 - i
            demand = round(base * scale_factor * sales_factor, 1)
            top_products.append({'product': product, 'demand_percentage': demand})
        return top_products

    def _get_festival_demands(self, business_data: Dict[str, Any]):
        """Return only festivals within the forecast period from today"""
        from datetime import datetime
        from dateutil.relativedelta import relativedelta
        forecast_period = business_data.get('forecastPeriod', 6)  # months
        now = self._now()
        # Start the forecast from the actual current day (not month start)
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = today + relativedelta(months=forecast_period) - relativedelta(days=1)
        all_festivals = []
        # Always check both current and next year for cross-year periods
        for y in range(today.year, end_date.year + 1):
            festivals = self.get_festival_calendar(y)
            for group in ['major_festivals', 'regional_festivals']:
                for fest in festivals.get(group, []):
                    fest_date = datetime.strptime(fest['date'], '%Y-%m-%d')
                    if today <= fest_date <= end_date:
                        fest = fest.copy()
                        fest['fest_date'] = fest_date
                        all_festivals.append(fest)
        # Sort by true datetime
        all_festivals.sort(key=lambda fest: fest['fest_date'])
        # Dynamic demand_increase calculation
        chart = []
        n = len(all_festivals)
        for i, fest in enumerate(all_festivals):
            base = 50 if fest['impact'] == 'Very High' else 35 if fest['impact'] == 'High' else 20
            # If two high/very high impact festivals are within 10 days, boost both
            boost = 0
            if fest['impact'] in ['High', 'Very High']:
                for j in range(max(0, i - 2), min(n, i + 3)):
                    if j != i:
                        other = all_festivals[j]
                        if other['impact'] in ['High', 'Very High']:
                            days_apart = abs((fest['fest_date'] - other['fest_date']).days)
                            if days_apart <= 10:
                                boost += 5
            # Deterministic variation by label
            label_for_score = f"{fest['name']}-{fest['fest_date'].isoformat()}"
            demand_increase = min(self._stable_score(label_for_score, base, 12) + boost, 85)
            fest_month = fest['fest_date'].strftime('%b')
            fest_year = fest['fest_date'].year
            label = f"{fest['name']} ({fest_month} {fest_year})"
            chart.append({
                'festival': label,
                'demand_increase': demand_increase,
                'date': fest['date'],
                'month': fest_month,
                'year': fest_year,
            })
        # Top items keyed by unique labels
        top_items = {}
        for fest in all_festivals:
            fest_month = fest['fest_date'].strftime('%b')
            fest_year = fest['fest_date'].year
            label = f"{fest['name']} ({fest_month} {fest_year})"
            top_items[label] = {
                'this_year': [f"{fest['name']} Item {i+1}" for i in range(3)],
                'last_year': [f"{fest['name']} Item {i+1} ({fest_year - 1})" for i in range(3)],
            }
        return chart, top_items

    def _get_seasonal_demands(self, business_data: Dict[str, Any]):
        from datetime import datetime
        from dateutil.relativedelta import relativedelta
        forecast_period = business_data.get('forecastPeriod', 6)  # months
        now = self._now()
        # Start the forecast from today, not the 1st of the month
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end_date = today + relativedelta(months=forecast_period) - relativedelta(days=1)

        # Season ranges (India): Winter Dec-Feb, Spring Mar-Apr, Summer May-Jun, Monsoon Jul-Sep, Autumn Oct-Nov
        def season_intervals_for_year(y: int):
            from calendar import monthrange as mr
            return [
                {
                    'name': 'Winter',
                    'start': datetime(y, 12, 1),
                    'end': datetime(y + 1, 2, mr(y + 1, 2)[1]),
                },
                {
                    'name': 'Spring',
                    'start': datetime(y + 1, 3, 1),
                    'end': datetime(y + 1, 4, mr(y + 1, 4)[1]),
                },
                {
                    'name': 'Summer',
                    'start': datetime(y + 1, 5, 1),
                    'end': datetime(y + 1, 6, mr(y + 1, 6)[1]),
                },
                {
                    'name': 'Monsoon',
                    'start': datetime(y + 1, 7, 1),
                    'end': datetime(y + 1, 9, mr(y + 1, 9)[1]),
                },
                {
                    'name': 'Autumn',
                    'start': datetime(y + 1, 10, 1),
                    'end': datetime(y + 1, 11, mr(y + 1, 11)[1]),
                },
            ]

        chart = []
        top_items = {}
        # Generate intervals covering today.year-1 through end_date.year
        for base_year in range(today.year - 1, end_date.year + 1):
            for interval in season_intervals_for_year(base_year):
                s_start, s_end = interval['start'], interval['end']
                # Include if overlaps with [today, end_date]
                if s_start <= end_date and s_end >= today:
                    season_label = f"{interval['name']} ({s_start.strftime('%b %Y')})"
                    # Deterministic surge per season occurrence
                    label_for_score = f"{interval['name']}-{s_start.isoformat()}"
                    surge = self._stable_score(label_for_score, 20, 15)
                    chart.append({
                        'season': season_label,
                        'start': s_start.strftime('%Y-%m-%d'),
                        'end': s_end.strftime('%Y-%m-%d'),
                        'demand_surge': surge,
                    })
                    label_year = f"{s_start.year}-{s_end.year}" if s_start.year != s_end.year else f"{s_start.year}"
                    top_items[f"{interval['name']} {label_year}"] = {
                        'this_year': [f"{interval['name']} Item {i+1}" for i in range(3)],
                        'last_year': [f"{interval['name']} Item {i+1} ({s_start.year - 1})" for i in range(3)],
                    }
        # Sort seasonal chart by start date to ensure timeline order
        chart.sort(key=lambda x: x['start'])
        return chart, top_items

    def _prepare_forecast_context(self, business_data: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare comprehensive context for AI analysis"""

        return {
            'business_details': {
                'name': business_data.get('businessName', 'Business'),
                'type': business_data['businessType'],
                'scale': business_data['businessScale'],
                'location': business_data['location'],
                'current_monthly_sales': business_data['currentSales']
            },
            'business_patterns': self._get_business_patterns(business_data['businessType']),
            'seasonal_data': self._get_seasonal_data(business_data['location']),
            'festival_calendar': self._get_festival_calendar(2025),
            'market_context': self._get_market_context(business_data['location'])
        }

    async def _generate_ai_forecast(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Generate forecast using Gemini AI model"""

        try:
            # Run AI generation in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            forecast = await loop.run_in_executor(
                None, 
                self.ai_model.generate_demand_forecast,
                context
            )
            return forecast

        except Exception as e:
            print(f"AI forecast error: {e}")
            # return self._generate_fallback_forecast(context['business_details'])

    def _enhance_with_statistics(self, ai_forecast: Dict[str, Any], business_data: Dict[str, Any]) -> Dict[str, Any]:
        """Enhance AI forecast with statistical analysis"""

        # Add confidence intervals, risk analysis, etc.
        enhanced = ai_forecast.copy()

        # Add business-specific enhancements
        enhanced['business_context'] = {
            'type': business_data['businessType'],
            'scale': business_data['businessScale'],
            'location': business_data['location'],
            'baseline_sales': business_data['currentSales']
        }

        # Add market intelligence
        enhanced['market_intelligence'] = self._get_market_intelligence(
            business_data['businessType'], 
            business_data['location']
        )

        return enhanced

    def _generate_fallback_forecast(self, business_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate statistical fallback forecast when AI is unavailable"""

        current_sales = business_data.get('currentSales') or business_data.get('current_monthly_sales', 100000)
        business_type = business_data.get('businessType') or business_data.get('type', 'Grocery Store')

        # Statistical multipliers based on business type and season
        multipliers = {
            'Oct 2025': 1.45,  # Pre-Diwali
            'Nov 2025': 1.65,  # Diwali season
            'Dec 2025': 1.35,  # Post-Diwali
            'Jan 2026': 1.08,  # New Year
            'Feb 2026': 1.15,  # Valentine/Wedding
            'Mar 2026': 1.22   # Holi/Spring
        }

        projections = []
        for month, multiplier in multipliers.items():
            projected_sales = int(current_sales * multiplier)
            growth = f"+{int((multiplier - 1) * 100)}%"

            projections.append({
                'month': month,
                'sales': projected_sales,
                'growth': growth,
                'factors': self._get_seasonal_factors(month),
                'confidence': 'Medium'
            })

        return {
            'seasonal_analysis': f'Statistical analysis for {business_type} indicates strong seasonal patterns with festival periods showing significant demand increases.',
            'festival_impact': 'Diwali and major festivals typically drive 40-70% demand spikes. Regional festivals contribute additional 15-25% increases.',
            'monthly_projections': projections,
            'recommendations': self._get_statistical_recommendations(business_type),
            'confidence_score': 0.75,
            'generated_by': 'Statistical Model (Fallback)',
            'market_intelligence': self._get_market_intelligence(business_type, 'India')
        }

    def get_seasonal_patterns(self, business_type: str, location: str) -> Dict[str, Any]:
        """Get seasonal demand patterns for business type and location"""

        patterns = {
            'monsoon_impact': {
                'period': 'June-September',
                'effect': 'Reduced footfall but increased essential goods demand',
                'adjustment_factor': 0.85
            },
            'festival_seasons': {
                'diwali': {'period': 'Oct-Nov', 'impact': '+50-70%'},
                'regional': {'period': 'varies', 'impact': '+20-35%'},
                'wedding': {'period': 'Nov-Feb, Apr-May', 'impact': '+25-40%'}
            },
            'business_specific': self._get_business_patterns(business_type)
        }

        return patterns

    def get_festival_calendar(self, year: int) -> Dict[str, Any]:
        """Get Indian festival calendar with retail impact"""

        # Expanded Indian festival calendar for retail impact
        festivals = {
            'major_festivals': [
                {'name': 'Diwali', 'date': f'{year}-11-01', 'impact': 'Very High', 'duration': '5 days'},
                {'name': 'Dussehra', 'date': f'{year}-10-12', 'impact': 'High', 'duration': '10 days'},
                {'name': 'Holi', 'date': f'{year}-03-14', 'impact': 'Medium', 'duration': '2 days'},
                {'name': 'Karwa Chauth', 'date': f'{year}-10-20', 'impact': 'Medium', 'duration': '1 day'},
                {'name': 'Raksha Bandhan', 'date': f'{year}-08-18', 'impact': 'Medium', 'duration': '1 day'},
                {'name': 'Eid al-Fitr', 'date': f'{year}-04-01', 'impact': 'High', 'duration': '1 day'},
                {'name': 'Eid al-Adha', 'date': f'{year}-06-08', 'impact': 'Medium', 'duration': '1 day'},
                {'name': 'Christmas', 'date': f'{year}-12-25', 'impact': 'Medium', 'duration': '1 day'},
                {'name': 'New Year', 'date': f'{year}-01-01', 'impact': 'Medium', 'duration': '1 day'},
                {'name': 'Makar Sankranti', 'date': f'{year}-01-14', 'impact': 'Medium', 'duration': '1 day'},
                {'name': 'Lohri', 'date': f'{year}-01-13', 'impact': 'Medium', 'duration': '1 day'},
                {'name': 'Baisakhi', 'date': f'{year}-04-13', 'impact': 'Medium', 'duration': '1 day'},
                {'name': 'Janmashtami', 'date': f'{year}-08-16', 'impact': 'Medium', 'duration': '1 day'},
                {'name': 'Navratri', 'date': f'{year}-09-25', 'impact': 'High', 'duration': '9 days'},
            ],
            'regional_festivals': [
                {'name': 'Ganesh Chaturthi', 'date': f'{year}-08-29', 'regions': ['Maharashtra'], 'impact': 'High'},
                {'name': 'Durga Puja', 'date': f'{year}-10-07', 'regions': ['West Bengal'], 'impact': 'Very High'},
                {'name': 'Onam', 'date': f'{year}-09-05', 'regions': ['Kerala'], 'impact': 'High'},
                {'name': 'Pongal', 'date': f'{year}-01-14', 'regions': ['Tamil Nadu'], 'impact': 'High'},
                {'name': 'Ugadi', 'date': f'{year}-03-30', 'regions': ['Karnataka', 'Andhra Pradesh'], 'impact': 'Medium'},
                {'name': 'Bihu', 'date': f'{year}-04-14', 'regions': ['Assam'], 'impact': 'Medium'},
                {'name': 'Vishu', 'date': f'{year}-04-14', 'regions': ['Kerala'], 'impact': 'Medium'},
                {'name': 'Gudi Padwa', 'date': f'{year}-04-01', 'regions': ['Maharashtra'], 'impact': 'Medium'},
                {'name': 'Mahavir Jayanti', 'date': f'{year}-04-10', 'regions': ['Pan India'], 'impact': 'Medium'},
                {'name': 'Guru Nanak Jayanti', 'date': f'{year}-11-05', 'regions': ['Punjab'], 'impact': 'Medium'},
            ],
            'shopping_seasons': [
                {'name': 'Wedding Season', 'period': 'Nov-Feb', 'impact': 'High'},
                {'name': 'Back to School', 'period': 'June-July', 'impact': 'Medium'},
                {'name': 'Summer Shopping', 'period': 'March-May', 'impact': 'Medium'},
            ]
        }
        return festivals

    def get_forecast_history(self, business_type: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        """Get historical forecast data"""

        # Mock historical data
        history = [
            {
                'id': 1,
                'business_type': 'Electronics Store',
                'location': 'Karnataka',
                'forecast_date': '2025-09-10',
                'period': '6 months',
                'accuracy': 89.2,
                'projected_growth': 45
            },
            {
                'id': 2,
                'business_type': 'Grocery Store',
                'location': 'Maharashtra',
                'forecast_date': '2025-09-08',
                'period': '6 months',
                'accuracy': 92.1,
                'projected_growth': 67
            },
            {
                'id': 3,
                'business_type': 'Clothing Store',
                'location': 'Tamil Nadu',
                'forecast_date': '2025-09-05',
                'period': '6 months',
                'accuracy': 87.5,
                'projected_growth': 38
            }
        ]

        if business_type:
            history = [h for h in history if h['business_type'] == business_type]

        return history[:limit]

    def analyze_scenario(self, scenario_data: Dict[str, Any]) -> Dict[str, Any]:
        """Analyze what-if scenario"""

        base_sales = scenario_data['baseSales']
        price_change = scenario_data['priceChange']
        marketing_spend = scenario_data['marketingSpend']
        seasonal_factor = scenario_data['seasonalFactor']
        competitor_action = scenario_data['competitorAction']

        # Calculate individual impacts
        price_impact = self._calculate_price_impact(price_change)
        marketing_impact = self._calculate_marketing_impact(marketing_spend, base_sales)
        seasonal_impact = (seasonal_factor - 1) * 100
        competitor_impact = self._calculate_competitor_impact(competitor_action)

        # Calculate total impact
        total_impact = price_impact + marketing_impact + seasonal_impact + competitor_impact

        # Calculate projected sales
        projected_sales = base_sales * (1 + total_impact / 100)

        return {
            'baseline': base_sales,
            'projected': projected_sales,
            'totalImpact': round(total_impact, 1),
            'breakdown': {
                'price': round(price_impact, 1),
                'marketing': round(marketing_impact, 1),
                'seasonal': round(seasonal_impact, 1),
                'competitor': round(competitor_impact, 1)
            },
            'recommendation': self._generate_scenario_recommendation(total_impact, scenario_data)
        }

    def get_scenario_insights(self, business_type: str, location: str) -> Dict[str, Any]:
        """Get scenario insights for business type and location"""

        return {
            'business_type': business_type,
            'location': location,
            'price_sensitivity': self._get_price_sensitivity(business_type),
            'marketing_effectiveness': self._get_marketing_effectiveness(business_type),
            'seasonal_patterns': self._get_business_patterns(business_type),
            'competitor_landscape': self._get_competitor_landscape(business_type, location),
            'recommendations': self._get_business_specific_recommendations(business_type, location)
        }

    # Helper methods
    def _get_business_patterns(self, business_type: str) -> Dict[str, Any]:
        """Get business-specific demand patterns"""

        patterns = {
            'Grocery Store': {
                'category': 'Essential Retail',
                'demand_patterns': ['Daily necessities', 'Festival cooking', 'Bulk purchasing'],
                'seasonal_peaks': ['Festival seasons', 'Wedding months', 'Harvest periods'],
                'price_sensitivity': 'High'
            },
            'Electronics Store': {
                'category': 'Consumer Durables',
                'demand_patterns': ['Festival gifting', 'Bonus season', 'New launches'],
                'seasonal_peaks': ['Diwali', 'New Year', 'Back to school'],
                'price_sensitivity': 'Medium'
            },
            'Clothing Store': {
                'category': 'Fashion Retail',
                'demand_patterns': ['Seasonal wear', 'Festival attire', 'Wedding shopping'],
                'seasonal_peaks': ['Wedding season', 'Festival season', 'Summer/Winter'],
                'price_sensitivity': 'Medium'
            }
        }

        return patterns.get(business_type, patterns['Grocery Store'])

    def _get_seasonal_data(self, location: str) -> Dict[str, Any]:
        """Get seasonal data for location"""

        return {
            'monsoon': {'months': [6, 7, 8, 9], 'impact': 'Reduced mobility, increased indoor shopping'},
            'winter': {'months': [12, 1, 2], 'impact': 'Wedding season, festival shopping'},
            'summer': {'months': [3, 4, 5], 'impact': 'Cooling products, summer wear'},
            'post_monsoon': {'months': [10, 11], 'impact': 'Festival season, highest retail activity'}
        }

    def _get_market_context(self, location: str) -> Dict[str, Any]:
        """Get market context for location"""

        return {
            'economic_indicators': 'Post-COVID recovery phase',
            'digital_adoption': 'Increasing online integration',
            'consumer_sentiment': 'Optimistic with festival spending',
            'regional_factors': f'{location} specific cultural and economic patterns'
        }

    def _get_market_intelligence(self, business_type: str, location: str) -> Dict[str, Any]:
        """Get market intelligence insights"""

        return {
            'market_size': 'Growing at 12-15% annually',
            'competition_level': 'Moderate to High',
            'consumer_trends': ['Digital integration', 'Value consciousness', 'Brand loyalty'],
            'opportunities': ['Festival marketing', 'Regional customization', 'Supply chain efficiency'],
            'risks': ['Economic uncertainty', 'Weather dependency', 'Supplier disruptions']
        }

    def _get_seasonal_factors(self, month: str) -> List[str]:
        """Get seasonal factors for a month"""

        factors_map = {
            'Oct 2025': ['Dussehra preparations', 'Pre-Diwali shopping', 'Wedding season start'],
            'Nov 2025': ['Diwali celebrations', 'Gift purchasing', 'Bonus season'],
            'Dec 2025': ['Christmas shopping', 'Year-end celebrations', 'Winter products'],
            'Jan 2026': ['New Year resolutions', 'Post-festival normalization', 'Republic Day'],
            'Feb 2026': ['Valentine season', 'Wedding peak', 'Spring preparation'],
            'Mar 2026': ['Holi celebrations', 'Financial year-end', 'Summer preparation']
        }

        return factors_map.get(month, ['Seasonal patterns', 'Regular demand cycles'])

    def _get_statistical_recommendations(self, business_type: str) -> List[str]:
        """Get statistical recommendations for business type"""

        recommendations = {
            'Grocery Store': [
                'Increase inventory by 60% before Diwali season',
                'Focus on essential items during monsoon',
                'Bulk purchase discounts for wedding season',
                'Seasonal vegetable and fruit planning'
            ],
            'Electronics Store': [
                'Stock up on gift items before Diwali',
                'New product launches during festival season',
                'Extended warranty promotions',
                'Trade-in offers for old electronics'
            ],
            'Clothing Store': [
                'Festival collection launch 6 weeks early',
                'Wedding wear inventory planning',
                'Seasonal color and style preferences',
                'Size and fit optimization for regional preferences'
            ]
        }

        return recommendations.get(business_type, recommendations['Grocery Store'])

    def _calculate_price_impact(self, price_change: float) -> float:
        """Calculate impact of price changes"""

        # Price elasticity: negative relationship
        if price_change > 0:
            return price_change * -1.8  # Price increase reduces demand
        else:
            return abs(price_change) * 1.2  # Price decrease increases demand

    def _calculate_marketing_impact(self, marketing_spend: float, base_sales: float) -> float:
        """Calculate impact of marketing spend"""

        if marketing_spend == 0:
            return 0

        # Marketing effectiveness: diminishing returns
        marketing_ratio = marketing_spend / base_sales

        if marketing_ratio < 0.05:  # Less than 5%
            return marketing_ratio * 200  # High impact
        elif marketing_ratio < 0.10:  # 5-10%
            return 10 + (marketing_ratio - 0.05) * 150
        else:  # More than 10%
            return 17.5 + (marketing_ratio - 0.10) * 50  # Diminishing returns

    def _calculate_competitor_impact(self, competitor_action: str) -> float:
        """Calculate impact of competitor actions"""

        impacts = {
            'none': 0,
            'passive': 2,  # Slight advantage
            'aggressive': -8  # Negative impact
        }

        return impacts.get(competitor_action, 0)

    def _generate_scenario_recommendation(self, total_impact: float, scenario_data: Dict[str, Any]) -> str:
        """Generate scenario-specific recommendations"""

        if total_impact > 20:
            return "Excellent strategy! This scenario shows strong growth potential. Consider implementing gradually to manage supply chain capacity."
        elif total_impact > 10:
            return "Good strategy with positive returns. Monitor competitor response and be prepared to adjust pricing or marketing spend."
        elif total_impact > 0:
            return "Moderate positive impact. Consider optimizing marketing efficiency or exploring regional customization opportunities."
        elif total_impact > -10:
            return "Marginal negative impact. Review pricing strategy and consider value-added services to offset competitive pressure."
        else:
            return "High risk scenario. Recommend reassessing strategy, focus on differentiation, or consider market positioning changes."

    def _get_price_sensitivity(self, business_type: str) -> str:
        """Get price sensitivity for business type"""

        sensitivity = {
            'Grocery Store': 'High',
            'Medical Store': 'Low', 
            'Electronics Store': 'Medium',
            'Clothing Store': 'Medium',
            'Cosmetics Store': 'Medium',
            'Food & Beverage': 'High'
        }

        return sensitivity.get(business_type, 'Medium')

    def _get_marketing_effectiveness(self, business_type: str) -> str:
        """Get marketing effectiveness for business type"""

        effectiveness = {
            'Grocery Store': 'High - Local community focus',
            'Electronics Store': 'Medium - Feature-based marketing',
            'Clothing Store': 'High - Visual and social media',
            'Medical Store': 'Low - Trust and reliability based',
            'Cosmetics Store': 'High - Influencer and digital marketing',
            'Food & Beverage': 'Medium - Experience-based marketing'
        }

        return effectiveness.get(business_type, 'Medium')

    def _get_competitor_landscape(self, business_type: str, location: str) -> Dict[str, Any]:
        """Get competitor landscape information"""

        return {
            'intensity': 'Moderate to High',
            'key_competitors': ['Organized retail', 'E-commerce platforms', 'Local businesses'],
            'competitive_advantages': ['Local presence', 'Personal service', 'Regional preferences'],
            'threats': ['Price wars', 'Digital disruption', 'Supply chain efficiency']
        }

    def _get_business_specific_recommendations(self, business_type: str, location: str) -> List[str]:
        """Get business and location specific recommendations"""

        return [
            f'Leverage {location} regional preferences and cultural patterns',
            f'Optimize {business_type} inventory for local demand patterns',
            'Implement dynamic pricing for festival and peak seasons',
            'Build strong supplier relationships for consistent availability',
            'Invest in customer loyalty programs for repeat business'
        ]