#!/usr/bin/env python3
"""Test weather generation functionality"""
import sys
import os
sys.path.append(os.path.dirname(__file__))

# Test the weather generation
def test_weather_generation():
    try:
        from app.services.logistics_service import LogisticsService
        
        # Create service instance
        service = LogisticsService()
        
        # Test shipment data
        test_shipment = {
            'id': 'TEST123',
            'origin': 'Mumbai',
            'destination': 'London',
            'transport_mode': 'air',
            'weight': 1000,
            'tracking_info': {}
        }
        
        print("Testing weather analysis for Mumbai -> London (Air)...")
        
        # Call the weather analysis
        result = service.get_live_weather_analysis(test_shipment, debug=True)
        
        print("Weather Analysis Result:")
        print(f"  Distance: {result.get('distance_km', 'N/A')} km")
        print(f"  Weather Points: {len(result.get('weather_points', []))} points")
        
        # Print weather points
        weather_points = result.get('weather_points', [])
        for i, point in enumerate(weather_points):
            print(f"  Point {i+1}: {point.get('position', 'Unknown')}")
            weather = point.get('weather', {})
            if weather and 'error' not in weather:
                print(f"    Temperature: {weather.get('temp_c', 'N/A')}°C")
                print(f"    Condition: {weather.get('weather', 'N/A')}")
                print(f"    Source: {weather.get('source', 'N/A')}")
            else:
                print(f"    Weather: Error - {weather.get('error', 'Unknown error')}")
            print()
        
        return True
        
    except Exception as e:
        print(f"Error testing weather generation: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    print("Starting weather generation test...")
    success = test_weather_generation()
    print(f"Test {'PASSED' if success else 'FAILED'}")