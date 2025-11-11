"""Script to check business settings in database"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.db_models import Business, DemandForecast

# Create engine
DATABASE_URL = "sqlite:///ai_supplychain.db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

def check_business_settings():
    """Check what business settings exist in the database"""
    db = SessionLocal()
    try:
        # Get all businesses
        businesses = db.query(Business).all()
        
        print("\n" + "="*60)
        print("BUSINESS SETTINGS IN DATABASE")
        print("="*60)
        
        if not businesses:
            print("\n❌ NO BUSINESS SETTINGS FOUND IN DATABASE")
            print("\nAction Required:")
            print("1. Go to Settings page in the application")
            print("2. Fill in your business details")
            print("3. Click 'Save Settings'")
            print("\n")
            return False
        
        for business in businesses:
            print(f"\n{'='*60}")
            print(f"Business ID: {business.id}")
            print(f"Name: {business.name}")
            print(f"Type: {business.type}")
            print(f"Scale: {business.scale}")
            print(f"Location: {business.location}, {business.state}")
            print(f"Is Active: {'✅ YES' if business.is_active else '❌ NO'}")
            print(f"Created: {business.created_at}")
            print(f"Updated: {business.updated_at}")
            
            # Check forecasts
            forecasts = db.query(DemandForecast).filter(
                DemandForecast.business_id == business.id
            ).order_by(DemandForecast.created_at.desc()).all()
            
            print(f"\nForecasts: {len(forecasts)}")
            if forecasts:
                latest = forecasts[0]
                print(f"  Latest Forecast:")
                print(f"    - Current Sales: ₹{latest.current_sales:,.2f}")
                print(f"    - Period: {latest.forecast_period_months} months")
                if latest.confidence_score:
                    print(f"    - Confidence: {latest.confidence_score:.2f}")
                else:
                    print(f"    - Confidence: N/A")
        
        print(f"\n{'='*60}")
        print(f"✅ Found {len(businesses)} business(es)")
        
        # Check which one is active
        active_businesses = [b for b in businesses if b.is_active]
        if not active_businesses:
            print("\n⚠️ WARNING: No active business found!")
            print("The AI chat will not be personalized without an active business.")
            print("\nFix: Go to Settings and save your business details")
        else:
            print(f"\n✅ Active business: {active_businesses[0].type} | {active_businesses[0].scale} | {active_businesses[0].state}")
        
        print("="*60 + "\n")
        return True
        
    finally:
        db.close()

if __name__ == "__main__":
    check_business_settings()
