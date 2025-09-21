#!/usr/bin/env python3

from app.services.logistics_service import LogisticsService

def test_weather_points():
    ls = LogisticsService()
    result = ls.get_live_weather_analysis({
        'origin': 'Mumbai', 
        'destination': 'Delhi', 
        'transport_mode': 'road'
    })
    
    points = result.get('weather_points', [])
    print(f"Enhanced Weather Points: {len(points)}")
    print("Point names:")
    
    for i, point in enumerate(points):
        position = point.get('position', 'N/A')
        weather = point.get('weather', {})
        condition = weather.get('weather', 'unknown')
        temp = weather.get('temp_c', '?')
        print(f"  {i+1}: {position} - {condition} {temp}°C")
    
    print("\n" + "="*50)
    
    # Test air transport
    result2 = ls.get_live_weather_analysis({
        'origin': 'Mumbai', 
        'destination': 'Delhi', 
        'transport_mode': 'air'
    })
    
    points2 = result2.get('weather_points', [])
    print(f"Air Transport Points: {len(points2)}")
    
    for i, point in enumerate(points2):
        position = point.get('position', 'N/A')
        print(f"  {i+1}: {position}")

if __name__ == "__main__":
    test_weather_points()