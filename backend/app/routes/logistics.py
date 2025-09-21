from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.services.logistics_service import LogisticsService

router = APIRouter()

class ShipmentCreate(BaseModel):
    destination: str = Field(..., description="Destination address")
    origin: Optional[str] = Field(None, description="Origin address")
    items_count: Optional[int] = Field(None, ge=1, description="Number of items")
    weight: Optional[float] = Field(None, ge=0.1, description="Total weight in kg")
    estimated_days: Optional[int] = Field(None, ge=1, le=30, description="Estimated delivery days")
    transport_mode: Optional[str] = Field('road', description="Transport mode: road, rail, air, sea")
    priority: Optional[str] = Field('standard', description="Priority: standard, express, urgent")
    items: Optional[List[Dict[str, Any]]] = Field([], description="List of items in shipment")
    notes: Optional[str] = Field('', description="Additional notes")

class ShipmentResponse(BaseModel):
    success: bool
    shipments: Optional[List[Dict[str, Any]]] = None
    shipment: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    message: Optional[str] = None

class StatusUpdate(BaseModel):
    status: str = Field(..., description="New status")
    location: Optional[str] = Field(None, description="Current location")
    message: Optional[str] = Field(None, description="Status update message")

class LocationPair(BaseModel):
    origin: str
    destination: str

class EstimateRequest(BaseModel):
    origin: str
    destination: str
    originCoords: Optional[List[float]] = None
    destinationCoords: Optional[List[float]] = None
    weather: Optional[List[Dict[str, Any]]] = None

@router.get("/shipments", response_model=ShipmentResponse)
async def get_shipments(
    status: Optional[str] = None,
    transport_mode: Optional[str] = None,
    priority: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200)
):
    """Get shipments with filtering and pagination"""
    try:
        logistics_service = LogisticsService()
        result = logistics_service.get_shipments(status, transport_mode, priority, page, page_size)
        return {
            'success': True,
            'shipments': result['shipments'],
            'meta': result['meta'],
            'message': f"Retrieved {len(result['shipments'])} shipments (page {result['meta']['page']})"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve shipments",
                "message": str(e)
            }
        )

@router.post("/shipments", response_model=ShipmentResponse)
async def create_shipment(shipment: ShipmentCreate):
    """Create a new shipment"""
    try:
        # Extra guard: destination shouldn't be blank after trimming
        if not shipment.destination or not shipment.destination.strip():
            raise HTTPException(
                status_code=422,
                detail={
                    'success': False,
                    'error': 'Validation error',
                    'message': 'Destination must be provided'
                }
            )
        logistics_service = LogisticsService()
        try:
            new_shipment = logistics_service.create_shipment(shipment.dict())
        except ValueError as ve:
            raise HTTPException(
                status_code=422,
                detail={
                    'success': False,
                    'error': 'Validation error',
                    'message': str(ve)
                }
            )
        return ShipmentResponse(success=True, shipment=new_shipment, message="Shipment created successfully")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to create shipment",
                "message": str(e)
            }
        )

@router.get("/shipments/{shipment_id}")
async def get_shipment(shipment_id: str):
    """Get specific shipment details"""
    try:
        logistics_service = LogisticsService()
        shipment = logistics_service.get_shipment_by_id(shipment_id)
        
        if not shipment:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Shipment not found",
                    "message": f"Shipment with ID {shipment_id} not found"
                }
            )

        return {
            "success": True,
            "shipment": shipment,
            "message": "Shipment details retrieved successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve shipment",
                "message": str(e)
            }
        )

@router.put("/shipments/{shipment_id}/status")
async def update_shipment_status(shipment_id: str, update: StatusUpdate):
    """Update shipment status with enhanced tracking"""
    valid_statuses = ["Processing", "In Transit", "Out for Delivery", "Delayed", "Delivered", "Cancelled"]

    if update.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "Invalid status",
                "message": f"Status must be one of: {', '.join(valid_statuses)}"
            }
        )

    try:
        logistics_service = LogisticsService()
        updated_shipment = logistics_service.update_shipment_status(
            shipment_id, update.status, update.location, update.message
        )

        if not updated_shipment:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Shipment not found",
                    "message": f"Shipment with ID {shipment_id} not found"
                }
            )

        return {
            "success": True,
            "shipment": updated_shipment,
            "message": f"Shipment status updated to {update.status}"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to update shipment status",
                "message": str(e)
            }
        )

@router.post("/routes/optimize")
async def optimize_routes(destinations: List[str]):
    """Optimize delivery routes for multiple destinations"""
    if not destinations or len(destinations) < 2:
        raise HTTPException(
            status_code=400,
            detail={
                "success": False,
                "error": "Invalid destinations",
                "message": "At least 2 destinations are required for route optimization"
            }
        )

    try:
        logistics_service = LogisticsService()
        optimized_routes = logistics_service.optimize_routes(destinations)
        return {
            "success": True,
            "routes": optimized_routes,
            "total_destinations": len(destinations),
            "estimated_savings": "15-25% time reduction",
            "message": "Routes optimized successfully"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to optimize routes",
                "message": str(e)
            }
        )

@router.post('/shipments/estimate')
async def estimate_transport(data: dict):
    """Dynamic trip analysis with Gemini AI for distance, time, and cost estimation"""
    try:
        logistics_service = LogisticsService()
        
        origin = data.get('origin')
        destination = data.get('destination')
        # Optional context that may be useful for costing
        items_count = data.get('items_count') or 0
        weight_kg = data.get('weight') or 0.0
        priority = data.get('priority') or 'standard'
        
        if not origin or not destination:
            raise HTTPException(
                status_code=400,
                detail={
                    'success': False,
                    'error': 'Missing origin or destination',
                    'message': 'Both origin and destination are required'
                }
            )
        
        # Get dynamic trip analysis using Gemini AI (with internal fallback)
        trip_analysis = logistics_service.get_dynamic_trip_analysis(origin, destination)

        # Extract AI stats for downstream alignment
        ai_stats = (trip_analysis or {}).get('stats') or {}
        ai_distance = ((trip_analysis or {}).get('distance_info') or {}).get('distance_km') or ai_stats.get('distance') or 0
        ai_total_cost = ai_stats.get('average_cost') or None

        # Recommend transport mode using existing service logic (weather/news + optional Gemini summary)
        try:
            mode_rec = logistics_service.decide_transport_mode(origin, destination, priority=priority)
            recommended_mode = (mode_rec or {}).get('recommended_mode') or 'road'
            mode_summary = (mode_rec or {}).get('gemini_summary')
        except Exception:
            recommended_mode = 'road'
            mode_summary = None

        # Compute mode-specific cost breakdown aligned to AI total if available
        try:
            # If AI distance missing, fall back to coordinate-based estimate
            if not ai_distance:
                ai_distance = (logistics_service.get_distance_and_duration(origin, destination) or {}).get('distance_km', 0)
            likely_international = (ai_distance or 0) > 2000 and recommended_mode in ['air', 'sea']
            mode_cost_breakdown = logistics_service._compute_cost_breakdown_for_mode(
                distance_km=ai_distance or 0,
                mode=recommended_mode,
                ai_total_inr=ai_total_cost,
                items_count=items_count,
                weight_kg=weight_kg,
                likely_international=likely_international,
                priority=priority
            )
            # Per-mode breakdowns removed to enforce AI-only mode selection in UI
            cost_breakdowns_by_mode = None
        except Exception:
            mode_cost_breakdown = None
            cost_breakdowns_by_mode = None

        # Get current weather at endpoints
        origin_weather = logistics_service.fetch_weather_for_location(origin)
        dest_weather = logistics_service.fetch_weather_for_location(destination)

        # Generate richer weather points along the route using internal helpers
        weather_points = []
        try:
            o_geo = logistics_service._geocode_place(origin)
            d_geo = logistics_service._geocode_place(destination)
            if not o_geo:
                cc = logistics_service._city_coord(origin)
                if cc:
                    o_geo = {'lat': cc[0], 'lon': cc[1], 'source': 'static'}
            if not d_geo:
                cc2 = logistics_service._city_coord(destination)
                if cc2:
                    d_geo = {'lat': cc2[0], 'lon': cc2[1], 'source': 'static'}
            if o_geo and d_geo:
                weather_points = logistics_service._generate_route_weather_points(
                    o_geo, d_geo, origin, destination, (recommended_mode or 'road')
                )
        except Exception:
            weather_points = []

        # Combine analysis with enhanced data
        result_stats = dict(ai_stats)
        if recommended_mode:
            result_stats['mode'] = recommended_mode
        if mode_cost_breakdown:
            result_stats['cost_breakdown'] = mode_cost_breakdown

        result = {
            **trip_analysis,
            'stats': result_stats,
            'recommended_mode': recommended_mode,
            'mode_reasoning': mode_summary,
            'origin_weather': origin_weather,
            'destination_weather': dest_weather,
            'weather_points': weather_points if weather_points else [
                {'position': 'Origin', 'weather': origin_weather},
                {'position': 'Destination', 'weather': dest_weather}
            ],
            # 'cost_breakdowns_by_mode' intentionally omitted for AI-only mode UX
            'warnings': ['Weather conditions analyzed for optimal delivery', f"Recommended mode: {recommended_mode.upper()}"]
        }
        
        return {
            'success': True,
            'recommendation': result
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={
                'success': False, 
                'error': 'Failed to estimate transport', 
                'message': str(e)
            }
        )

@router.post('/shipments/providers')
async def compare_providers(pair: LocationPair):
    """Compare logistics providers for a given origin/destination with ranking metadata"""
    try:
        logistics_service = LogisticsService()
        comparisons = logistics_service.compare_logistics_providers(pair.origin, pair.destination)
        return {
            'success': True,
            'providers': comparisons,
            'ranking_basis': {
                'weights': {'time': 0.5, 'cost': 0.4, 'baseline': 0.1},
                'criteria': 'Higher score = faster + cheaper'
            }
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={
                'success': False, 
                'error': 'Failed to compare providers', 
                'message': str(e)
            }
        )

@router.get('/shipments/{shipment_id}/events')
async def shipment_events(shipment_id: str):
    """Return status history (events) for a shipment"""
    try:
        logistics_service = LogisticsService()
        shipment = logistics_service.get_shipment_by_id(shipment_id)
        if not shipment:
            raise HTTPException(status_code=404, detail={ 'success': False, 'error': 'Shipment not found', 'message': f'No shipment {shipment_id}' })
        history = shipment.get('tracking_info', {}).get('status_history', [])
        return { 'success': True, 'events': history, 'count': len(history) }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={ 'success': False, 'error': 'Failed to fetch events', 'message': str(e) })

@router.get('/modes/recommend')
async def recommend_mode(origin: str, destination: str):
    """Recommend transport mode using internal scoring"""
    try:
        logistics_service = LogisticsService()
        rec = logistics_service.decide_transport_mode(origin, destination)
        return { 'success': True, 'recommendation': rec }
    except Exception as e:
        raise HTTPException(status_code=500, detail={ 'success': False, 'error': 'Failed to recommend mode', 'message': str(e) })

@router.get('/weather')
async def get_weather(city: str = None, lat: float = None, lng: float = None):
    """Get current weather for a city or coordinates"""
    try:
        logistics_service = LogisticsService()
        if lat is not None and lng is not None:
            data = logistics_service.fetch_weather_by_coords(lat, lng)
        elif city:
            data = logistics_service.fetch_weather_for_location(city)
        else:
            raise HTTPException(
                status_code=400, 
                detail={
                    'success': False, 
                    'error': 'Missing parameters', 
                    'message': "Provide either 'city' or both 'lat' and 'lng'"
                }
            )
        return {'success': True, 'weather': data}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail={
                'success': False, 
                'error': 'Failed to fetch weather', 
                'message': str(e)
            }
        )

@router.post('/routes/weather-analysis')
async def get_route_weather_analysis(pair: LocationPair):
    """Get comprehensive route analysis with weather and AI insights"""
    try:
        logistics_service = LogisticsService()
        analysis = logistics_service.get_route_analysis_with_weather(pair.origin, pair.destination)
        
        if 'error' in analysis:
            raise HTTPException(
                status_code=400,
                detail={
                    'success': False,
                    'error': analysis['error'],
                    'message': 'Failed to analyze route'
                }
            )
        
        return {
            'success': True,
            'analysis': analysis,
            'message': 'Route analysis completed successfully'
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                'success': False,
                'error': 'Failed to analyze route weather',
                'message': str(e)
            }
        )

@router.get('/weather/route')
async def get_weather_along_route(origin: str, destination: str, samples: int = 5):
    """Get weather samples along a route with AI analysis"""
    try:
        logistics_service = LogisticsService()
        
        # Get coordinates
        origin_geo = logistics_service._geocode_place(origin)
        dest_geo = logistics_service._geocode_place(destination)
        
        if not origin_geo or not dest_geo:
            raise HTTPException(
                status_code=400,
                detail={
                    'success': False,
                    'error': 'Geocoding failed',
                    'message': 'Could not find coordinates for origin or destination'
                }
            )
        
        weather_data = logistics_service.get_weather_along_route(
            origin_geo['lat'], origin_geo['lon'],
            dest_geo['lat'], dest_geo['lon'],
            samples=samples
        )
        
        return {
            'success': True,
            'route_weather': weather_data,
            'message': 'Route weather analysis completed'
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                'success': False,
                'error': 'Failed to fetch route weather',
                'message': str(e)
            }
        )

@router.get("/analytics")
async def get_logistics_analytics():
    """Get enhanced logistics performance analytics"""
    try:
        logistics_service = LogisticsService()
        analytics = logistics_service.get_analytics()
        return {
            "success": True,
            "analytics": analytics,
            "message": "Enhanced logistics analytics retrieved successfully"
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve logistics analytics",
                "message": str(e)
            }
        )

@router.get("/shipments/{shipment_id}/tracking")
async def get_shipment_tracking(shipment_id: str):
    """Get detailed tracking information for a shipment"""
    try:
        logistics_service = LogisticsService()
        shipment = logistics_service.get_shipment_by_id(shipment_id)
        
        if not shipment:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Shipment not found",
                    "message": f"Shipment with ID {shipment_id} not found"
                }
            )
        
        return {
            "success": True,
            "tracking": shipment.get('tracking_info', {}),
            "shipment": shipment,
            "message": "Tracking information retrieved successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "Failed to retrieve tracking information",
                "message": str(e)
            }
        )

# Removed: /routes/precise-analysis endpoint (deprecated)

@router.get("/shipments/{shipment_id}/weather-analysis")
async def get_shipment_weather_analysis(shipment_id: str):
    """Get weather analysis for a specific shipment route"""
    try:
        logistics_service = LogisticsService()
        shipment = logistics_service.get_shipment_by_id(shipment_id)
        
        if not shipment:
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "Shipment not found",
                    "message": f"Shipment with ID {shipment_id} not found"
                }
            )
        
        # Short-term cache to avoid recomputation loops when modal is open
        try:
            cache_key = f"shipment_analysis:{shipment_id}"
            cached = logistics_service._get_cache(cache_key)
            if cached:
                return {
                    'success': True,
                    'shipment_id': shipment_id,
                    'analysis': cached,
                    'points': (cached.get('weather_analysis', {}) or {}).get('points', []),
                    'message': f'Complete analysis (cached) for shipment {shipment_id}'
                }
        except Exception:
            pass

        # Get weather + cost analysis (mode-specific) (precise analysis removed)
        weather_analysis = logistics_service.get_route_analysis_with_weather(
            shipment['origin'], 
            shipment['destination'],
            transport_mode=shipment.get('transport_mode'),
            items_count=shipment.get('items_count'),
            weight_kg=shipment.get('total_weight')
        )
        
        if 'error' in weather_analysis:
            raise HTTPException(
                status_code=400,
                detail={
                    'success': False,
                    'error': weather_analysis['error'],
                    'message': 'Failed to analyze shipment route'
                }
            )
        
        # Persist cost info for consistency between list and detail, without changing agreed price
        try:
            cb = weather_analysis.get('cost_breakdown') if isinstance(weather_analysis, dict) else None
            # Strip insurance if present in legacy payloads
            if isinstance(cb, dict) and 'insurance_inr' in cb:
                cb = {k: v for k, v in cb.items() if k != 'insurance_inr'}
            total_inr = (cb or {}).get('total_inr')
            if total_inr is not None:
                logistics_service.update_shipment_cost_info(
                    shipment_id,
                    int(total_inr),
                    cb,
                    ai_stats=weather_analysis.get('ai_stats') if isinstance(weather_analysis, dict) else None,
                    ai_summary=weather_analysis.get('ai_summary') if isinstance(weather_analysis, dict) else None,
                    overwrite_total=False,
                    route_info=(weather_analysis.get('route_info') if isinstance(weather_analysis, dict) else None)
                )
        except Exception:
            # Non-fatal; continue returning analysis
            pass

        combined_analysis = weather_analysis.copy()
        # Align displayed total with stored shipment price (immutable after creation)
        try:
            cb2 = combined_analysis.get('cost_breakdown') or {}
            if 'insurance_inr' in cb2:
                cb2.pop('insurance_inr', None)
            stored_total = shipment.get('cost')
            if stored_total is not None:
                # Ensure components add up exactly to stored_total
                cb2 = logistics_service.adjust_breakdown_to_total(cb2, int(stored_total))
                # Also annotate locked pricing
                note = cb2.get('calculation_note') or 'Calculation Method'
                cb2['calculation_note'] = f"{note}; Price locked at booking"
                combined_analysis['cost_breakdown'] = cb2
        except Exception:
            pass
        # Store in cache for a short TTL to prevent repeated recomputation
        try:
            logistics_service._set_cache(cache_key, combined_analysis, ttl=90)
        except Exception:
            pass

        return {
            'success': True,
            'shipment_id': shipment_id,
            'analysis': combined_analysis,
            'points': (combined_analysis.get('weather_analysis', {}) or {}).get('points', []),
            'message': f'Complete analysis completed for shipment {shipment_id}'
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                'success': False,
                'error': 'Failed to analyze shipment weather',
                'message': str(e)
            }
        )

@router.get('/stats')
@router.get('/shipments/stats')
async def shipment_stats():
    """Return aggregated shipment statistics for dashboard cards."""
    try:
        logistics_service = LogisticsService()
        stats = logistics_service.get_shipment_stats()
        return { 'success': True, 'stats': stats }
    except Exception as e:
        raise HTTPException(status_code=500, detail={ 'success': False, 'error': 'Failed to compute stats', 'message': str(e) })

@router.delete('/shipments/clear')
async def clear_shipments(confirm: bool = Query(False, description="Must be true to confirm deletion")):
    """Delete ALL shipments. Development/reset use only."""
    if not confirm:
        raise HTTPException(status_code=400, detail={'success': False, 'error': 'Confirmation required', 'message': 'Pass ?confirm=true to proceed'})
    try:
        logistics_service = LogisticsService()
        count = logistics_service.clear_shipments()
        return { 'success': True, 'deleted': count, 'message': f'Removed {count} shipments' }
    except Exception as e:
        raise HTTPException(status_code=500, detail={'success': False, 'error': 'Failed to clear shipments', 'message': str(e) })

@router.post('/shipments/reconcile-costs')
async def reconcile_costs(confirm: bool = Query(False, description="Must be true to run reconciliation")):
    """Backfill/align cost breakdown and totals for all shipments.

    If shipment price is missing, sets it from computed analysis total. Otherwise, keeps stored price and
    aligns cost_breakdown.total_inr to it with a 'Price locked at booking' note.
    """
    if not confirm:
        raise HTTPException(status_code=400, detail={'success': False, 'error': 'Confirmation required', 'message': 'Pass ?confirm=true to proceed'})
    try:
        logistics_service = LogisticsService()
        count = logistics_service.reconcile_shipment_costs()
        return { 'success': True, 'updated': count, 'message': f'Reconciled {count} shipments' }
    except Exception as e:
        raise HTTPException(status_code=500, detail={'success': False, 'error': 'Failed to reconcile costs', 'message': str(e) })

@router.get('/shipments/{shipment_id}/weather-live')
async def shipment_weather_live(shipment_id: str, debug: bool = False):
    """Lightweight live weather snapshot for dynamic modal polling.

    Returns rapid-updating subset (distance, ai predictions, 3 weather points, risk, remaining ETA window).
    """
    try:
        logistics_service = LogisticsService()
        shipment = logistics_service.get_shipment_by_id(shipment_id)
        if not shipment:
            raise HTTPException(status_code=404, detail={'success': False, 'error': 'Shipment not found', 'message': f'No shipment {shipment_id}'})
        live = logistics_service.get_live_weather_analysis(shipment, debug=debug)
        if 'error' in live:
            return {'success': False, 'error': live.get('error'), 'detail': live.get('detail'), 'message': 'Live weather fetch failed', 'snapshot': live}
        return {'success': True, 'snapshot': live}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={'success': False, 'error': 'Failed to fetch live weather', 'message': str(e) })

@router.get('/shipments/{shipment_id}/route-points')
async def shipment_route_points(shipment_id: str):
    """Return origin/destination coordinates (and optional midpoint) without calling weather APIs.

    This is a lightweight endpoint to support the tracking map without consuming weather API quota.
    """
    try:
        logistics_service = LogisticsService()
        shipment = logistics_service.get_shipment_by_id(shipment_id)
        if not shipment:
            raise HTTPException(status_code=404, detail={'success': False, 'error': 'Shipment not found', 'message': f'No shipment {shipment_id}'})
        origin = shipment.get('origin')
        destination = shipment.get('destination')
        if not origin or not destination:
            raise HTTPException(status_code=400, detail={'success': False, 'error': 'Missing route', 'message': 'Shipment has no origin/destination'})

        # Use internal geocoder directly to avoid weather calls
        o_geo = logistics_service._geocode_place(origin)
        d_geo = logistics_service._geocode_place(destination)
        if not o_geo or not d_geo:
            return {'success': False, 'error': 'geocode_failed', 'message': 'Failed to geocode route'}

        points = [
            [o_geo['lat'], o_geo['lon']],
            [d_geo['lat'], d_geo['lon']]
        ]
        return {'success': True, 'points': points}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail={'success': False, 'error': 'Failed to compute route points', 'message': str(e)})