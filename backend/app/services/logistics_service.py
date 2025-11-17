from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import math
import uuid
import requests
import os
try:
    import google.generativeai as genai
except Exception:
    genai = None

import threading
import time

"""Logistics service provides shipment, routing, provider comparison, and environment-aware
external data acquisition. This refactor adds:

1. SQLite persistence using existing SQLAlchemy models (Shipment).
2. Removal of hardcoded secret defaults (env must supply keys; otherwise graceful fallbacks).
3. Pagination helpers for shipments listing.
4. Lightweight in-memory TTL cache (geocode + weather).
5. Normalized cost breakdown structure across AI and provider outputs.
6. Provider ranking with explicit weight metadata.
7. Mode recommendation route support (decide_transport_mode output shape unchanged internally).
"""

# API keys (loaded from environment; no hardcoded sensitive defaults)
NEWS_API_KEY = os.getenv('NEWS_API_KEY')
OPENWEATHER_API_KEY = os.getenv('OPENWEATHER_API_KEY')  # If absent, will fallback to open-meteo
ORS_API_KEY = os.getenv('ORS_API_KEY')
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
GEMINI_MODEL = os.getenv('GEMINI_MODEL', 'gemini-1.5-flash')

# configure genai if available
if genai is not None and GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        print(f"Gemini configured with model: {GEMINI_MODEL}")
    except Exception as e:
        print(f"Gemini configuration failed: {e}")
        genai = None
else:
    if genai is not None:
        print("WARNING: GEMINI_API_KEY not set - AI route analysis will use fallback heuristics.")

from app.models.db_models import Shipment as ShipmentModel
from sqlalchemy.orm import Session
from app.utils.db import get_engine
from sqlalchemy import select, func


class LogisticsService:
    """Service for logistics and shipment management with hybrid persistence.

    If database engine is available, shipments are persisted in the `shipments` table.
    Otherwise, falls back to in-memory mock list (useful for tests or first-run without migration).
    """

    CACHE_GEO_TTL = 60 * 60 * 12  # 12h
    CACHE_WEATHER_TTL = 60 * 30    # 30m

    def __init__(self):
        self._engine = None
        try:
            self._engine = get_engine()
        except Exception:
            self._engine = None

        # In-memory fallback store only used when DB unavailable
        self._mock_shipments = self._get_mock_shipments()

        # TTL cache: key -> (expires_epoch, value)
        self._cache: Dict[str, Any] = {}
        self._cache_lock = threading.Lock()
        self._last_called: Dict[str, float] = {}
        # Static approximate coordinates for common cities (fallback when geocoder fails)
        self._city_coords = {
            'Bangalore': (12.9716, 77.5946),
            'Mumbai': (19.0760, 72.8777),
            'Delhi': (28.6139, 77.2090),
            'Chennai': (13.0827, 80.2707),
            'Hyderabad': (17.3850, 78.4867),
            'Pune': (18.5204, 73.8567),
            'Kolkata': (22.5726, 88.3639),
            'London': (51.5074, -0.1278),
            'Panaji': (15.4909, 73.8278),
        }

    # -------------- Internal helpers for city coordinate fallback --------------
    def _city_coord(self, name: str) -> Optional[tuple]:
        if not name:
            return None
        n = name.replace('Distribution Center', '').replace('Warehouse', '').strip().title()
        # If multi-word keep both if second word is capitalised (e.g., New Delhi) else first
        if n not in self._city_coords and ' ' in n:
            parts = [p for p in n.split() if p]
            if len(parts) >= 2:
                candidate = f"{parts[0]} {parts[1]}"
                if candidate in self._city_coords:
                    n = candidate
                else:
                    n = parts[0]
        return self._city_coords.get(n)

    # -------------------- Persistence Helpers --------------------
    def _has_db(self) -> bool:
        return self._engine is not None

    def _session(self) -> Optional[Session]:
        if not self._has_db():
            return None
        from sqlalchemy.orm import sessionmaker
        SessionLocal = sessionmaker(bind=self._engine)
        return SessionLocal()

    def _to_dict(self, shipment: ShipmentModel) -> Dict[str, Any]:
        return {
            'id': shipment.id,
            'origin': shipment.origin,
            'destination': shipment.destination,
            'status': shipment.status,
            'items_count': shipment.items_count,
            'total_weight': shipment.total_weight,
            'transport_mode': shipment.transport_mode or (shipment.tracking_info.get('transport_mode') if shipment.tracking_info else None),
            'priority': shipment.priority or (shipment.tracking_info.get('priority') if shipment.tracking_info else None),
            'created_date': shipment.created_date.strftime('%Y-%m-%d') if shipment.created_date else None,
            'shipped_date': shipment.shipped_date.strftime('%Y-%m-%d') if shipment.shipped_date else None,
            'eta': shipment.estimated_delivery.strftime('%Y-%m-%d') if shipment.estimated_delivery else None,
            'actual_delivery': shipment.actual_delivery.strftime('%Y-%m-%d') if shipment.actual_delivery else None,
            'tracking_info': shipment.tracking_info or {},
            # Expose item details for DB-backed shipments; items are stored under tracking_info to avoid schema migrations
            'items': (shipment.tracking_info or {}).get('items', []),
            'cost': shipment.shipping_cost,
        }

    # -------------------- Shipment Operations --------------------

    def get_shipments(self, status_filter: Optional[str] = None, transport_mode: Optional[str] = None,
                      priority: Optional[str] = None, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        """Get shipments with filtering + pagination.

        Returns dict with shipments list and meta.
        """
        if page < 1:
            page = 1
        if page_size < 1 or page_size > 200:
            page_size = 20

        if self._has_db():
            sess = self._session()
            try:
                stmt = select(ShipmentModel)
                if status_filter:
                    stmt = stmt.where(ShipmentModel.status == status_filter)
                if transport_mode:
                    stmt = stmt.where(ShipmentModel.transport_mode == transport_mode)
                if priority:
                    stmt = stmt.where(ShipmentModel.priority == priority)
                total = sess.execute(select(func.count()).select_from(stmt.subquery())).scalar() or 0
                stmt = stmt.order_by(ShipmentModel.created_date.desc()).offset((page - 1) * page_size).limit(page_size)
                rows = sess.execute(stmt).scalars().all()
                shipments = []
                changed = False
                for r in rows:
                    d = self._to_dict(r)
                    if self._auto_progress_status(d, r, sess):
                        changed = True
                    shipments.append(self._to_dict(r))
                if changed:
                    try:
                        sess.commit()
                    except Exception:
                        sess.rollback()
            finally:
                sess.close()
        else:
            shipments = self._mock_shipments.copy()
            if status_filter:
                shipments = [s for s in shipments if s['status'].lower() == status_filter.lower()]
            if transport_mode:
                shipments = [s for s in shipments if s.get('transport_mode', '').lower() == transport_mode.lower()]
            if priority:
                shipments = [s for s in shipments if s.get('priority', '').lower() == priority.lower()]
            total = len(shipments)
            start = (page - 1) * page_size
            subset = shipments[start:start + page_size]
            # auto progress in-memory subset
            for s in subset:
                self._auto_progress_status(s, None, None)
            shipments = subset

        pages = (total // page_size) + (1 if total % page_size else 0)
        return {
            'shipments': shipments,
            'meta': {
                'page': page,
                'page_size': page_size,
                'total': total,
                'pages': pages
            }
        }

    def create_shipment(self, shipment_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new shipment with persistence + cost/time estimation."""

        # Validate required fields
        if not shipment_data.get('destination'):
            raise ValueError("Destination is required")
        
        # Generate shipment ID
        shipment_id = f"SHP-{uuid.uuid4().hex[:8].upper()}"

        # Calculate estimated delivery with transport mode consideration
        transport_mode = shipment_data.get('transport_mode', 'road')
        estimated_days = self._calculate_delivery_time(transport_mode, shipment_data.get('estimated_days', 4))
        estimated_delivery = (datetime.now() + timedelta(days=estimated_days)).date()

        # Calculate costs with mode-specific pricing
        weight = shipment_data.get('weight', 10.0)
        items_count = shipment_data.get('items_count', 1)
        origin = shipment_data.get('origin', 'Bangalore Distribution Center')
        destination = shipment_data['destination']
        
        # Use non-precise estimation only (precise analysis deprecated)
        distance_cost = self._calculate_distance_cost(origin, destination)
        shipping_cost = self._calculate_shipping_cost(weight, items_count, distance_cost, transport_mode)
        estimated_hours = estimated_days * 24
        # Derive days from hours (round up)
        estimated_days = max(1, int(math.ceil(estimated_hours / 24))) if estimated_hours else estimated_days
        ai_predicted_eta = (datetime.now() + timedelta(hours=estimated_hours)).strftime('%Y-%m-%d') if estimated_hours else estimated_delivery.strftime('%Y-%m-%d')
        
        # Priority handling
        priority = shipment_data.get('priority', 'standard')
        if priority == 'express':
            shipping_cost *= 1.5
            estimated_days = max(1, estimated_days - 1)
        elif priority == 'urgent':
            shipping_cost *= 2.0
            estimated_days = max(1, estimated_days - 2)

        new_shipment = {
            'id': shipment_id,
            'origin': origin,
            'destination': destination,
            'status': 'Processing',
            'items_count': items_count,
            'total_weight': weight,
            'cost': shipping_cost,
            'transport_mode': transport_mode,
            'priority': priority,
            'created_date': datetime.now().strftime('%Y-%m-%d'),
            'shipped_date': None,
            'eta': ai_predicted_eta,  # prefer AI predicted ETA
            'ai_predicted_eta': ai_predicted_eta,
            'actual_delivery': None,
            'items': shipment_data.get('items', []),
            'notes': shipment_data.get('notes', ''),
            'tracking_info': {
                'last_update': datetime.now().isoformat(),
                'location': origin,
                'next_checkpoint': self._get_next_checkpoint(origin, destination),
                'progress_percentage': 0,
                'ai_predicted_hours': estimated_hours,
                # Persist items inside tracking_info so DB path retains them without schema change
                'items': shipment_data.get('items', []),
                'status_history': [{
                    'status': 'Processing',
                    'timestamp': datetime.now().isoformat(),
                    'location': origin,
                    'message': 'Shipment created and processing'
                }]
            }
        }

        if self._has_db():
            sess = self._session()
            try:
                # Ensure at least one business exists (lazy seed minimal record)
                from app.models.db_models import Business  # local import to avoid cycles
                biz = sess.execute(select(Business).limit(1)).scalars().first()
                if not biz:
                    biz = Business(
                        name="Default Business",
                        type="Generic Store",
                        scale="Small",
                        location="Karnataka",
                    )
                    sess.add(biz)
                    sess.flush()  # assign id

                model = ShipmentModel(
                    id=shipment_id,
                    business_id=biz.id,
                    origin=origin,
                    destination=destination,
                    status='Processing',
                    items_count=items_count,
                    total_weight=weight,
                    transport_mode=transport_mode,
                    priority=priority,
                    estimated_delivery=datetime.strptime(new_shipment['eta'], '%Y-%m-%d'),
                    shipping_cost=shipping_cost,
                    tracking_info=new_shipment['tracking_info'],
                    created_date=datetime.now(),
                )
                sess.add(model)
                sess.commit()
            except Exception as e:
                try:
                    sess.rollback()
                except Exception:
                    pass
                # Attach error for debugging (tests can inspect if needed)
                new_shipment['persistence_error'] = str(e)
                self._mock_shipments.append(new_shipment)
                return new_shipment
            finally:
                try:
                    sess.close()
                except Exception:
                    pass
            return new_shipment
        else:
            self._mock_shipments.append(new_shipment)
            return new_shipment

    def get_shipment_by_id(self, shipment_id: str) -> Optional[Dict[str, Any]]:
        if self._has_db():
            sess = self._session()
            try:
                obj = sess.get(ShipmentModel, shipment_id)
                if not obj:
                    return None
                shipment = self._to_dict(obj)
                updated = self._auto_progress_status(shipment, obj, sess)
                if updated:
                    sess.commit()
                    shipment = self._to_dict(obj)
            finally:
                sess.close()
        else:
            shipment = next((s for s in self._mock_shipments if s['id'] == shipment_id), None)
            if shipment:
                self._auto_progress_status(shipment, None, None)
        return shipment

    # ----------------------------------
    # Automatic status progression
    # ----------------------------------
    def _auto_progress_status(self, shipment: Dict[str, Any], db_obj: Optional[ShipmentModel], sess: Optional[Session]) -> bool:
        """Automatically update shipment status based on AI predicted timeline.

        Logic (simple heuristic using elapsed / predicted_hours):
          < 10% elapsed -> Processing
          10% - 85% -> In Transit
          85% - 95% -> Out for Delivery
          >= 95% and past ETA date -> Delivered
        """
        try:
            tracking = shipment.get('tracking_info', {})
            predicted_hours = tracking.get('ai_predicted_hours')
            if not predicted_hours or predicted_hours <= 0:
                return False
            created_str = shipment.get('created_date')
            if not created_str:
                return False
            created_dt = datetime.strptime(created_str, '%Y-%m-%d')
            elapsed_hours = (datetime.now() - created_dt).total_seconds() / 3600.0
            ratio = elapsed_hours / predicted_hours
            current_status = shipment.get('status')

            # Do not auto-change terminal statuses
            if current_status in ('Cancelled', 'Delivered'):
                return False

            new_status = None
            if ratio < 0.10:
                new_status = 'Processing'
            elif ratio < 0.85:
                new_status = 'In Transit'
            elif ratio < 0.95:
                new_status = 'Out for Delivery'
            else:
                # Only mark Delivered if we've passed ETA date
                eta_str = shipment.get('eta') or shipment.get('ai_predicted_eta')
                eta_dt = datetime.strptime(eta_str, '%Y-%m-%d') if eta_str else None
                if eta_dt and datetime.now().date() >= eta_dt.date():
                    new_status = 'Delivered'
                else:
                    new_status = 'Out for Delivery'

            # Lateness detection: if past ETA and not delivered
            eta_str_for_delay = shipment.get('eta') or shipment.get('ai_predicted_eta')
            if new_status != 'Delivered' and eta_str_for_delay:
                try:
                    eta_dt2 = datetime.strptime(eta_str_for_delay, '%Y-%m-%d')
                    if datetime.now() > eta_dt2 and current_status not in ('Delivered', 'Cancelled'):
                        new_status = 'Delayed'
                except Exception:
                    pass

            progress_map = {'Processing': 5, 'In Transit': 50, 'Out for Delivery': 90, 'Delayed': 95, 'Delivered': 100}
            # Always update progress percentage based on ratio if not delivered/cancelled
            if current_status not in ('Delivered', 'Cancelled'):
                # derive dynamic progress: scale ratio (0-1) to 0-99, then adjust near terminal states
                dynamic_progress = int(min(99, max(1, ratio * 100)))
                # If status is Delayed keep at least 95
                if current_status == 'Delayed':
                    dynamic_progress = max(dynamic_progress, 95)
                tracking['progress_percentage'] = progress_map.get(current_status, dynamic_progress if current_status not in progress_map else max(tracking.get('progress_percentage', 0), dynamic_progress))

            if new_status and new_status != current_status:
                # Update tracking
                tracking.setdefault('status_history', []).append({
                    'status': new_status,
                    'timestamp': datetime.now().isoformat(),
                    'location': tracking.get('location', 'Unknown'),
                    'message': f'Auto-progressed to {new_status}'
                })
                shipment['status'] = new_status
                tracking['last_update'] = datetime.now().isoformat()
                # Rough progress mapping
                # Recalculate progress after status change
                # Ensure delivered snaps to 100
                tracking['progress_percentage'] = 100 if new_status == 'Delivered' else progress_map.get(new_status, tracking.get('progress_percentage', 0))
                shipment['tracking_info'] = tracking
                if db_obj is not None and sess is not None:
                    db_obj.status = new_status
                    db_obj.tracking_info = tracking
                    if new_status == 'In Transit' and not db_obj.shipped_date:
                        db_obj.shipped_date = datetime.now()
                    if new_status == 'Delivered' and not db_obj.actual_delivery:
                        db_obj.actual_delivery = datetime.now()
                return True
        except Exception:
            return False
        return False

    def update_shipment_status(self, shipment_id: str, new_status: str, location: str = None, message: str = None) -> Optional[Dict[str, Any]]:
        now = datetime.now()
        if self._has_db():
            sess = self._session()
            try:
                obj = sess.get(ShipmentModel, shipment_id)
                if not obj:
                    return None
                old_status = obj.status
                obj.status = new_status
                if new_status == 'In Transit' and old_status == 'Processing':
                    obj.shipped_date = now
                elif new_status == 'Delivered':
                    obj.actual_delivery = now
                tracking = obj.tracking_info or {}
                progress_map = {'Processing': 10,'In Transit':50,'Out for Delivery':90,'Delivered':100,'Cancelled':0}
                tracking['last_update'] = now.isoformat()
                tracking['progress_percentage'] = 100 if new_status == 'Delivered' else progress_map.get(new_status, 50)
                if location:
                    tracking['location'] = location
                tracking.setdefault('status_history', []).append({
                    'status': new_status,
                    'timestamp': now.isoformat(),
                    'location': location or tracking.get('location', 'Unknown'),
                    'message': message or f'Status updated to {new_status}'
                })
                obj.tracking_info = tracking
                sess.commit()
                return self._to_dict(obj)
            except Exception:
                sess.rollback()
                return None
            finally:
                sess.close()
        else:
            for shipment in self._mock_shipments:
                if shipment['id'] == shipment_id:
                    old_status = shipment['status']
                    shipment['status'] = new_status
                    if new_status == 'In Transit' and old_status == 'Processing':
                        shipment['shipped_date'] = now.strftime('%Y-%m-%d')
                    elif new_status == 'Delivered':
                        shipment['actual_delivery'] = now.strftime('%Y-%m-%d')
                    progress_map = {'Processing':10,'In Transit':50,'Out for Delivery':90,'Delivered':100,'Cancelled':0}
                    tracking = shipment.get('tracking_info', {})
                    tracking['last_update'] = now.isoformat()
                    tracking['progress_percentage'] = 100 if new_status == 'Delivered' else progress_map.get(new_status, 50)
                    if location:
                        tracking['location'] = location
                    tracking.setdefault('status_history', []).append({
                        'status': new_status,'timestamp': now.isoformat(),
                        'location': location or tracking.get('location', 'Unknown'),
                        'message': message or f'Status updated to {new_status}'
                    })
                    shipment['tracking_info'] = tracking
                    return shipment
        return None

    def optimize_routes(self, destinations: List[str]) -> Dict[str, Any]:
        """Optimize delivery routes for multiple destinations"""

        # Simple route optimization algorithm
        # In a real application, this would use sophisticated routing algorithms

        optimized_order = self._simple_route_optimization(destinations)

        total_distance = self._calculate_total_distance(optimized_order)
        estimated_time = self._calculate_total_time(optimized_order)
        
        return {
            'optimized_order': optimized_order,
            'total_distance_km': total_distance,
            'estimated_time_hours': estimated_time,
            'fuel_savings': f'{total_distance * 0.15:.1f}L',
            'cost_savings': f'₹{total_distance * 12:.0f}'
        }

    def get_dynamic_trip_analysis(self, origin: str, destination: str) -> Dict[str, Any]:
        """Get dynamic trip analysis using Gemini AI for distance, time, and cost estimation"""
        try:
            if not genai:
                return self._fallback_trip_analysis(origin, destination)
            
            model = genai.GenerativeModel(GEMINI_MODEL)
            
            prompt = f"""
You are a logistics expert. Analyze the route from {origin} to {destination} and provide precise estimates.

Consider:
- Real-world distance between these locations
- Current traffic patterns and road conditions
- Fuel costs (₹100/L diesel, 12km/L efficiency)
- Driver wages (₹500/day)
- Toll charges on highways
- Vehicle maintenance costs
- Weather impact on delivery time
- Regional logistics challenges

Provide response in this exact JSON format:
{{
  "distance_km": <actual_distance_number>,
  "estimated_hours": <realistic_travel_time>,
  "estimated_cost_inr": <total_cost_including_all_factors>,
  "fuel_cost": <fuel_cost_only>,
  "other_costs": <tolls_driver_maintenance>,
  "risk_level": "low|medium|high",
  "summary": "Brief explanation of the route and cost factors"
}}

Be realistic and accurate for Indian logistics.
"""
            
            response = model.generate_content(prompt)
            
            # Extract JSON from response
            import json
            import re
            
            text = response.text
            json_match = re.search(r'\{.*\}', text, re.DOTALL)
            
            if json_match:
                try:
                    result = json.loads(json_match.group())
                    return {
                        'distance_info': {
                            'distance_km': result.get('distance_km', 500),
                            'duration_hours': result.get('estimated_hours', 8)
                        },
                        'stats': {
                            'distance': int(result.get('distance_km', 500)),
                            'estimated_hours': int(result.get('estimated_hours', 8)),
                            'average_cost': int(result.get('estimated_cost_inr', 4000)),
                            'risk_level': result.get('risk_level', 'low')
                        },
                        'gemini_summary': result.get('summary', f'Route analysis for {origin} to {destination}'),
                        'cost_breakdown': {
                            'fuel_cost': result.get('fuel_cost', 2000),
                            'other_costs': result.get('other_costs', 2000)
                        }
                    }
                except json.JSONDecodeError:
                    pass
            
            return self._fallback_trip_analysis(origin, destination)
            
        except Exception as e:
            print(f"Gemini trip analysis error: {e}")
            return self._fallback_trip_analysis(origin, destination)
    
    def _fallback_trip_analysis(self, origin: str, destination: str) -> Dict[str, Any]:
        """Fallback trip analysis when Gemini is unavailable"""
        # Simple distance estimation based on coordinates
        origin_coords = self._geocode_place(origin)
        dest_coords = self._geocode_place(destination)
        
        if origin_coords and dest_coords:
            distance_km = self._haversine_distance(
                origin_coords['lat'], origin_coords['lon'],
                dest_coords['lat'], dest_coords['lon']
            )
        else:
            distance_km = 500  # Default
        
        # Calculate estimates
        hours = max(0.5, distance_km / 60.0)  # 60 km/h average, min 0.5h
        fuel_cost = (distance_km / 12) * 100  # 12km/L, ₹100/L
        other_costs = distance_km * 3 + 1000  # Tolls, driver, maintenance
        total_cost = fuel_cost + other_costs
        
        return {
            'distance_info': {
                'distance_km': round(distance_km, 1),
                'duration_hours': round(hours, 2)
            },
            'stats': {
                'distance': int(distance_km),
                'estimated_hours': round(hours, 2),
                'average_cost': int(total_cost),
                'risk_level': 'low'
            },
            'gemini_summary': f'Route from {origin} to {destination}: {distance_km:.0f}km, estimated {hours:.1f}h travel time.',
            'cost_breakdown': {
                'fuel_cost': int(fuel_cost),
                'other_costs': int(other_costs)
            }
        }

    # precise-analysis removed: distance/time/cost AI predictions deprecated

    # -------------------- Provider Comparison & Ranking --------------------
    def compare_logistics_providers(self, origin: str, destination: str) -> List[Dict[str, Any]]:  # override later search
        from app.services.providers import get_default_providers
        distance_data = self.get_distance_and_duration(origin, destination)
        dist = distance_data.get('distance_km', 500)
        providers = get_default_providers()
        results = []
        for adapter in providers:
            q = adapter.quote(origin, destination, dist)
            # Normalize cost breakdown (rough split)
            total = q.get('estimated_cost', 0)
            fuel = round(total * 0.45, 2)
            base = round(total * 0.35, 2)
            other = round(total - fuel - base, 2)
            q['cost_breakdown'] = { 'base': base, 'fuel': fuel, 'other': other, 'total': total }
            results.append(q)
        # Simple ranking score: lower time + lower total cost better
        if results:
            max_time = max(r['estimated_time_hours'] for r in results)
            max_cost = max(r['cost_breakdown']['total'] for r in results)
            for r in results:
                time_score = 1 - (r['estimated_time_hours'] / max_time) if max_time else 0
                cost_score = 1 - (r['cost_breakdown']['total'] / max_cost) if max_cost else 0
                r['score'] = round(time_score * 0.5 + cost_score * 0.4 + 0.1, 3)
            results.sort(key=lambda x: x['score'], reverse=True)
        return results

    # -------------------- Caching Helpers --------------------
    def _cache_get(self, key: str) -> Optional[Any]:
        now = time.time()
        with self._cache_lock:
            entry = self._cache.get(key)
            if not entry:
                return None
            exp, val = entry
            if exp < now:
                self._cache.pop(key, None)
                return None
            return val

    def _cache_set(self, key: str, value: Any, ttl: int):
        with self._cache_lock:
            self._cache[key] = (time.time() + ttl, value)

    # Example usage for geocode & weather (hook into existing methods if desired later)

    
    # precise-analysis removed: external routing service integration deprecated
    
    # precise-analysis removed: ORS API usage deprecated
    
    # precise-analysis removed: AI transport predictions deprecated
    
    # precise-analysis removed: cost calculators deprecated
    
    # precise-analysis removed: mode-specific cost calculation (road) deprecated
    
    # precise-analysis removed: mode-specific cost calculation (rail) deprecated
    
    # precise-analysis removed: mode-specific cost calculation (air) deprecated
    
    # precise-analysis removed: mode-specific cost calculation (sea) deprecated
    
    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two points using Haversine formula"""
        import math
        
        R = 6371  # Earth's radius in kilometers
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lon = math.radians(lon2 - lon1)
        
        a = (math.sin(delta_lat / 2) ** 2 + 
             math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    def _geocode_place(self, place_name: str) -> Optional[Dict[str, float]]:
        """Get coordinates for a place name using Nominatim (free)"""
        try:
            cache_key = f"geocode_{place_name.lower()}"
            
            with self._cache_lock:
                if cache_key in self._cache:
                    return self._cache[cache_key]
            
            url = "https://nominatim.openstreetmap.org/search"
            params = {
                'q': place_name,
                'format': 'json',
                'limit': 1,
                'countrycodes': 'in'  # Restrict to India
            }
            
            headers = {'User-Agent': 'SCM-Logistics/1.0'}
            response = requests.get(url, params=params, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                if data:
                    result = {
                        'lat': float(data[0]['lat']),
                        'lon': float(data[0]['lon'])
                    }
                    
                    with self._cache_lock:
                        self._cache[cache_key] = result
                    
                    return result
            
        except Exception as e:
            print(f"Geocoding error for {place_name}: {e}")
        return None

    # New integrations and helper methods
    def fetch_latest_news(self, query: str, page_size: int = 5) -> List[Dict[str, Any]]:
        """Fetch latest news related to a query using NewsAPI-compatible endpoint"""
        try:
            url = 'https://newsapi.org/v2/everything'
            params = {
                'q': query,
                'pageSize': page_size,
                'apiKey': NEWS_API_KEY,
                'sortBy': 'publishedAt',
                'language': 'en'
            }
            # Cache key and short TTL
            cache_key = f"news:{query}:{page_size}"
            cached = self._get_cache(cache_key)
            if cached:
                return cached

            # Basic rate-limit: 1 call per 1 second per endpoint
            if not self._allow_call('news', 1.0):
                return []

            resp = requests.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()
            articles = data.get('articles', [])
            simplified = [
                {
                    'title': a.get('title'),
                    'source': a.get('source', {}).get('name'),
                    'publishedAt': a.get('publishedAt'),
                    'description': a.get('description'),
                    'url': a.get('url')
                }
                for a in articles
            ]
            self._set_cache(cache_key, simplified, ttl=60)
            return simplified
        except Exception:
            return []

    def fetch_weather_for_location(self, city: str) -> Dict[str, Any]:
        """Fetch current weather for a given city using Open-Meteo API (free)"""
        try:
            cache_key = f"weather:{city}"
            cached = self._get_cache(cache_key)
            if cached:
                return cached

            if not self._allow_call('weather', 1.0):
                return self._get_mock_weather(city)

            # Always use Open-Meteo (free, no API key required)
            return self._fetch_weather_open_meteo(city)
            
        except Exception as e:
            print(f"Weather fetch error for {city}: {e}")
            return self._get_mock_weather(city)
    
    def _get_mock_weather(self, city: str) -> Dict[str, Any]:
        """Generate mock weather data for demo purposes"""
        import random
        
        conditions = ['Clear', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Sunny']
        descriptions = ['clear sky', 'few clouds', 'scattered clouds', 'light rain', 'sunny']
        
        temp = random.randint(15, 35)
        condition_idx = random.randint(0, len(conditions) - 1)
        
        return {
            'city': city,
            'temp_c': temp,
            'feels_like': temp + random.randint(-3, 3),
            'humidity': random.randint(40, 80),
            'pressure': random.randint(1000, 1020),
            'weather': conditions[condition_idx],
            'description': descriptions[condition_idx],
            'wind_speed': random.randint(2, 15),
            'wind_deg': random.randint(0, 360),
            'visibility': random.randint(8, 15),
            'clouds': random.randint(0, 100),
            'source': 'mock'
        }
    
    def _fetch_weather_open_meteo(self, city: str) -> Dict[str, Any]:
        """Fallback weather using Open-Meteo API"""
        try:
            # Geocode city first
            geo_url = 'https://nominatim.openstreetmap.org/search'
            geo_params = {'q': city, 'format': 'json', 'limit': 1}
            geo_resp = requests.get(geo_url, params=geo_params, headers={'User-Agent': 'scm-app/1.0'}, timeout=3)
            geo_data = geo_resp.json()
            
            if not geo_data:
                return {'city': city, 'error': 'geocode_failed', 'source': 'open-meteo'}
            
            lat, lon = float(geo_data[0]['lat']), float(geo_data[0]['lon'])
            
            # Get weather from Open-Meteo
            weather_url = 'https://api.open-meteo.com/v1/forecast'
            weather_params = {
                'latitude': lat,
                'longitude': lon,
                'current_weather': 'true',
                'hourly': 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m',
                'timezone': 'auto'
            }
            
            weather_resp = requests.get(weather_url, params=weather_params, timeout=4)
            weather_data = weather_resp.json()
            
            current = weather_data.get('current_weather', {})
            return {
                'city': city,
                'temp_c': current.get('temperature'),
                'weather': self._weather_code_to_description(current.get('weathercode', 0)),
                'description': self._weather_code_to_description(current.get('weathercode', 0)),
                'wind_speed': current.get('windspeed'),
                'wind_deg': current.get('winddirection'),
                'source': 'open-meteo'
            }
            
        except Exception as e:
            return {'city': city, 'error': 'weather_fetch_failed', 'detail': str(e), 'source': 'error'}
    
    def _weather_code_to_description(self, code: int) -> str:
        """Convert WMO weather code to description"""
        codes = {
            0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
            45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Moderate drizzle',
            55: 'Dense drizzle', 61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
            71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 80: 'Light rain showers',
            81: 'Moderate rain showers', 82: 'Heavy rain showers', 95: 'Thunderstorm'
        }
        return codes.get(code, f'Weather code {code}')

    def fetch_weather_by_coords(self, lat: float, lon: float) -> Dict[str, Any]:
        """Fetch current weather for given coordinates using Open-Meteo API (free)"""
        try:
            cache_key = f"weather:{lat}:{lon}"
            cached = self._get_cache(cache_key)
            if cached:
                return cached

            # Always try to get weather data, fallback to mock if API fails
            try:
                if self._allow_call('weather_coords', 1.0):
                    result = self._fetch_weather_coords_open_meteo(lat, lon)
                    if result and 'error' not in result:
                        self._set_cache(cache_key, result, 1800)  # Cache for 30 minutes
                        return result
            except Exception as e:
                print(f"Open-Meteo API failed for {lat},{lon}: {e}")
            
            # Fallback to mock weather
            mock_result = self._get_mock_weather_coords(lat, lon)
            self._set_cache(cache_key, mock_result, 600)  # Cache mock for 10 minutes to reduce repeated calls
            return mock_result
            
        except Exception as e:
            print(f"Weather fetch error for coords {lat},{lon}: {e}")
            return self._get_mock_weather_coords(lat, lon)
    
    def _get_mock_weather_coords(self, lat: float, lon: float) -> Dict[str, Any]:
        """Generate mock weather data for coordinates"""
        import random
        import math
        
        conditions = ['clear', 'partly_cloudy', 'cloudy', 'rain', 'sunny']
        descriptions = ['clear sky', 'few clouds', 'scattered clouds', 'light rain', 'sunny']
        
        # Base temperature on latitude (simple approximation)
        base_temp = 25 - abs(lat) * 0.5  # Warmer near equator
        temp = max(5, min(40, base_temp + random.randint(-10, 10)))
        
        condition_idx = random.randint(0, len(conditions) - 1)
        
        # Ensure all required fields are present
        return {
            'lat': round(lat, 4),
            'lon': round(lon, 4),
            'location': f'Location {lat:.2f},{lon:.2f}',
            'temp_c': round(temp, 1),
            'feels_like': round(temp + random.uniform(-3, 3), 1),
            'humidity': random.randint(40, 80),
            'pressure': random.randint(1000, 1020),
            'weather': conditions[condition_idx],
            'description': descriptions[condition_idx],
            'wind_speed': round(random.uniform(2, 15), 1),
            'wind_deg': random.randint(0, 360),
            'visibility': random.randint(8, 15),
            'clouds': random.randint(0, 100),
            'source': 'mock',
            'timestamp': int(time.time())
        }
    
    def _fetch_weather_coords_open_meteo(self, lat: float, lon: float) -> Dict[str, Any]:
        """Fallback weather by coordinates using Open-Meteo"""
        try:
            url = 'https://api.open-meteo.com/v1/forecast'
            params = {
                'latitude': lat,
                'longitude': lon,
                'current_weather': 'true',
                'hourly': 'temperature_2m,relative_humidity_2m,wind_speed_10m',
                'timezone': 'auto'
            }
            
            resp = requests.get(url, params=params, timeout=4)
            data = resp.json()
            
            current = data.get('current_weather', {})
            return {
                'lat': lat,
                'lon': lon,
                'temp_c': current.get('temperature'),
                'weather': self._weather_code_to_description(current.get('weathercode', 0)),
                'description': self._weather_code_to_description(current.get('weathercode', 0)),
                'wind_speed': current.get('windspeed'),
                'wind_deg': current.get('winddirection'),
                'source': 'open-meteo'
            }
            
        except Exception as e:
            return {'lat': lat, 'lon': lon, 'error': 'weather_fetch_failed', 'detail': str(e), 'source': 'error'}

    def decide_transport_mode(self, origin: str, destination: str, priority: Optional[str] = None) -> Dict[str, Any]:
        """Decide optimal transport mode based on simple rules using weather and news.

        Priority hint influences mode bias:
        - urgent -> strongly favor air; de-prioritize sea
        - express -> favor air/rail slightly
        - standard -> mild bias toward road
        """
        # Gather simple weather and news signals for origin and destination
        origin_weather = self.fetch_weather_for_location(origin)
        dest_weather = self.fetch_weather_for_location(destination)

        # Basic scoring for modes
        mode_scores = {
            'road': 0,
            'rail': 0,
            'air': 0,
            'sea': 0
        }

        # Favor air for long distances
        # Try to get a better distance estimate using ORS if available
        dist_info = self.get_distance_and_duration(origin, destination)
        distance = dist_info.get('distance_km', self._get_distance_between(origin, destination))
        if distance >= 1000:
            mode_scores['air'] += 3
            mode_scores['rail'] += 1
        else:
            mode_scores['road'] += 2
            mode_scores['rail'] += 1

        # Weather penalties (severe weather reduces mode score)
        def weather_penalty(w):
            if not w or 'error' in w:
                return 0
            condition = (w.get('weather') or '').lower()
            if any(x in condition for x in ['storm', 'rain', 'snow', 'thunder']):
                return 2
            if 'cloud' in condition or 'mist' in condition:
                return 1
            return 0

        penalty = weather_penalty(origin_weather) + weather_penalty(dest_weather)
        # air affected more by storms
        mode_scores['air'] -= penalty
        mode_scores['road'] -= max(0, penalty - 1)

        # Check news for major incidents
        news_origin = self.fetch_latest_news(origin, page_size=3)
        news_dest = self.fetch_latest_news(destination, page_size=3)

        def news_penalty(articles):
            score = 0
            for a in articles:
                t = (a.get('title') or '').lower()
                if any(k in t for k in ['strike', 'protest', 'flood', 'blocked', 'accident', 'closure', 'cyclone']):
                    score += 2
                elif any(k in t for k in ['delay', 'traffic', 'storm', 'warning']):
                    score += 1
            return score

        npen = news_penalty(news_origin) + news_penalty(news_dest)
        # penalize road and rail more for strikes and protests
        mode_scores['road'] -= npen
        mode_scores['rail'] -= npen

        # Priority-based biases
        try:
            pr = (priority or '').strip().lower() if isinstance(priority, str) else ''
            if pr == 'urgent':
                mode_scores['air'] += 3
                mode_scores['rail'] += 1
                mode_scores['sea'] -= 1
            elif pr == 'express':
                mode_scores['air'] += 2
                mode_scores['rail'] += 1
            elif pr == 'standard':
                mode_scores['road'] += 1
        except Exception:
            pass

        # Choose best mode
        best_mode = max(mode_scores.items(), key=lambda x: x[1])[0]
        base_result = {
            'origin_weather': origin_weather,
            'destination_weather': dest_weather,
            'origin_news_count': len(news_origin),
            'destination_news_count': len(news_dest),
            'mode_scores': mode_scores,
            'recommended_mode': best_mode,
            'notes': 'Recommendations based on weather and recent news headlines (simplified)'
        }

        # Attempt to attach a Gemini-generated short explanation; fall back to a deterministic summary if generation fails
        try:
            prompt = (
                f"You are an expert logistics assistant. Recommend the best transport mode from {origin} to {destination}. "
                f"Mode scores: {mode_scores}. Recommended: {best_mode}. "
                f"Origin weather: {origin_weather}. Destination weather: {dest_weather}. "
                f"Provide a concise (1-2 sentence) explanation and any cautions."
            )
            gemini_text = None
            try:
                gemini_text = self._generate_gemini_text(prompt)
            except Exception as gi:
                # ensure any exception in the SDK path doesn't crash the flow
                gemini_text = None

            # If Gemini returned a usable text, use it; otherwise synthesize a short fallback summary
            if gemini_text and isinstance(gemini_text, str) and not any(k in gemini_text.lower() for k in ['failed', 'unavailable', 'error']):
                base_result['gemini_summary'] = gemini_text
            else:
                # Build a concise fallback summarizing why the mode was chosen
                origin_cond = (origin_weather.get('weather') or origin_weather.get('error') or 'unknown') if isinstance(origin_weather, dict) else 'unknown'
                dest_cond = (dest_weather.get('weather') or dest_weather.get('error') or 'unknown') if isinstance(dest_weather, dict) else 'unknown'
                score = mode_scores.get(best_mode, 0)
                fallback = f"Recommend {best_mode.upper()} (score {score}). Origin weather: {origin_cond}. Destination weather: {dest_cond}."
                base_result['gemini_summary'] = fallback
        except Exception:
            # final safety net
            origin_cond = (origin_weather.get('weather') or origin_weather.get('error') or 'unknown') if isinstance(origin_weather, dict) else 'unknown'
            dest_cond = (dest_weather.get('weather') or dest_weather.get('error') or 'unknown') if isinstance(dest_weather, dict) else 'unknown'
            score = mode_scores.get(best_mode, 0)
            base_result['gemini_summary'] = f"Recommend {best_mode.upper()} (score {score}). Origin weather: {origin_cond}. Destination weather: {dest_cond}."

        return base_result

    def compare_logistics_providers(self, origin: str, destination: str) -> List[Dict[str, Any]]:
        """Compare mock logistics providers with approximate time and cost between two locations"""
        # This is a mocked comparator; in production integrate provider APIs
        dist_info = self.get_distance_and_duration(origin, destination)
        distance = dist_info.get('distance_km', self._get_distance_between(origin, destination))


        # Use provider adapters to generate quotes (allows swapping real provider integrations later)
        from app.services.providers import get_default_providers

        adapters = get_default_providers()
        results = []
        for adapter in adapters:
            q = adapter.quote(origin, destination, distance)
            # Enrich with live signals
            provider_news = self.fetch_latest_news(q.get('provider'), page_size=2)
            provider_weather_origin = self.fetch_weather_for_location(origin)
            provider_weather_dest = self.fetch_weather_for_location(destination)
            q['notes'] = f"weather_origin={provider_weather_origin.get('weather')}, weather_dest={provider_weather_dest.get('weather')}, recent_news={len(provider_news)}, distance_used_km={distance}"
            results.append(q)

        # Sort by estimated_time then cost
        results.sort(key=lambda x: (x['estimated_time_hours'], x['estimated_cost']))
        # Try to attach a Gemini summary about providers
        try:
            provider_prompt = (
                f"You are a logistics analyst. For shipment from {origin} to {destination}, compare providers: "
                f"{[{'provider': r.get('provider'), 'mode': r.get('mode'), 'time_h': r.get('estimated_time_hours'), 'cost': r.get('estimated_cost')} for r in results]}. "
                "Provide a short recommendation (1-2 sentences) naming the top provider and why."
            )
            gemini_text = None
            try:
                gemini_text = self._generate_gemini_text(provider_prompt)
            except Exception:
                gemini_text = None

            if gemini_text and isinstance(gemini_text, str) and not any(k in gemini_text.lower() for k in ['failed', 'unavailable', 'error']):
                return {'providers': results, 'gemini_summary': gemini_text}
            else:
                # Fallback deterministic recommendation: pick the provider with lowest cost (tie break by time)
                top = sorted(results, key=lambda x: (x.get('estimated_cost', 1e9), x.get('estimated_time_hours', 1e9)))[0]
                fallback = f"Recommend {top.get('provider')} ({top.get('mode')}) based on lowest estimated cost and acceptable transit time."
                return {'providers': results, 'gemini_summary': fallback}
        except Exception:
            # Last-resort fallback
            top = sorted(results, key=lambda x: (x.get('estimated_cost', 1e9), x.get('estimated_time_hours', 1e9)))[0]
            fallback = f"Recommend {top.get('provider')} ({top.get('mode')}) based on lowest estimated cost and acceptable transit time."
            return {'providers': results, 'gemini_summary': fallback}

    def _geocode_place(self, place: str) -> Optional[Dict[str, float]]:
        """Try to geocode a place name using Nominatim.

        Note: Use per-place rate limiting so we can geocode origin and destination
        back-to-back without tripping a global throttle.
        """
        try:
            # Fast-path: try static city coord map first to avoid network calls
            if place:
                key = place.replace('Distribution Center','').replace('Warehouse','').replace('Hub','').strip().title()
                if key in self._city_coords:
                    lat, lon = self._city_coords[key]
                    return {'lat': lat, 'lon': lon, 'source': 'static'}
            cache_key = f"geocode:{place}"
            cached = self._get_cache(cache_key)
            if cached:
                return cached

            # Per-place throttle key so different places are not blocked within the same second
            if not self._allow_call(f'geocode:{place}', 0.2):
                return None

            url = 'https://nominatim.openstreetmap.org/search'
            params = {'q': place, 'format': 'jsonv2', 'limit': 1}
            headers = {'User-Agent': 'AISupplyChain/1.0'}
            r = requests.get(url, params=params, headers=headers, timeout=3)
            r.raise_for_status()
            data = r.json()
            if data:
                geo = {'lat': float(data[0]['lat']), 'lon': float(data[0]['lon'])}
                self._set_cache(cache_key, geo, ttl=3600)
                return geo
        except Exception:
            return None
        return None

    def get_route_analysis_with_weather(self, origin: str, destination: str,
                                        transport_mode: Optional[str] = None,
                                        items_count: Optional[int] = None,
                                        weight_kg: Optional[float] = None) -> Dict[str, Any]:
        """Get comprehensive route analysis with weather and AI insights.

        Distance and duration are sourced from Gemini AI via get_dynamic_trip_analysis
        (with an internal fallback when Gemini is unavailable). Weather sampling still
        relies on geocoded coordinates.
        """
        try:
            print(f"Starting route analysis: {origin} -> {destination}")

            # Prefer Gemini AI for distance and time (with internal fallback)
            ai_trip = self.get_dynamic_trip_analysis(origin, destination)
            ai_di = ai_trip.get('distance_info', {}) if isinstance(ai_trip, dict) else {}
            ai_dist = ai_di.get('distance_km')
            ai_hours = ai_di.get('duration_hours')

            route_info = {
                'distance_km': round(ai_dist, 1) if isinstance(ai_dist, (int, float)) else None,
                'duration_hours': round(ai_hours, 2) if isinstance(ai_hours, (int, float)) else None,
                'source': 'ai'
            }

            # Safety fallback to previous calc if AI lacks values
            if route_info['distance_km'] is None or route_info['duration_hours'] is None:
                fallback_route = self.get_distance_and_duration(origin, destination)
                if route_info['distance_km'] is None:
                    route_info['distance_km'] = fallback_route.get('distance_km', 0)
                if route_info['duration_hours'] is None:
                    route_info['duration_hours'] = fallback_route.get('duration_hours', 24)
                # annotate combined source
                route_info['source'] = f"{route_info['source']}_fallback"

            print(f"Route info (AI-first): {route_info}")

            # Determine transport mode for costing
            mode = (transport_mode or 'road').lower()

            # Compute mode-specific cost breakdown using AI total if available
            ai_total_cost = None
            if isinstance(ai_trip, dict):
                stats = ai_trip.get('stats') or {}
                ai_total_cost = stats.get('average_cost') or None
            cost_breakdown = self._compute_cost_breakdown_for_mode(
                distance_km=route_info.get('distance_km') or 0,
                mode=mode,
                ai_total_inr=ai_total_cost,
                items_count=items_count or 0,
                weight_kg=weight_kg or 0,
                likely_international=(route_info.get('distance_km') or 0) > 2000 and mode in ['air','sea']
            )

            # If air mode, refine duration using air-specific estimator
            try:
                if mode == 'air':
                    dist = route_info.get('distance_km') or 0
                    likely_international = (dist > 2000)
                    air_hours = self._estimate_air_hours(dist, likely_international)
                    # If AI gave a value, clamp to a reasonable window around air estimate
                    ai_h = route_info.get('duration_hours')
                    if isinstance(ai_h, (int, float)) and ai_h > 0:
                        # Clamp AI within [0.7x, 1.6x] of model to avoid extreme outliers
                        lo, hi = 0.7 * air_hours, 1.6 * air_hours
                        route_info['duration_hours'] = float(min(max(ai_h, lo), hi))
                    else:
                        route_info['duration_hours'] = air_hours
            except Exception:
                pass

            # Get coordinates for weather analysis
            origin_geo = self._geocode_place(origin)
            dest_geo = self._geocode_place(destination)
            # Fallback to static city coordinates if geocoding failed
            if not origin_geo:
                cc = self._city_coord(origin)
                if cc:
                    origin_geo = {'lat': cc[0], 'lon': cc[1], 'source': 'static'}
            if not dest_geo:
                cc2 = self._city_coord(destination)
                if cc2:
                    dest_geo = {'lat': cc2[0], 'lon': cc2[1], 'source': 'static'}
            
            if not origin_geo or not dest_geo:
                print(f"Geocoding failed: origin={origin_geo}, dest={dest_geo}")
                # Return basic analysis without weather
                return {
                    'route_info': route_info,
                    'weather_analysis': {
                        'points': [],
                        'weather_summary': [],
                        'ai_analysis': 'Weather data unavailable. Using standard delivery estimates.',
                        'route_conditions': {'risk_level': 'low', 'delay_factor': 1.0}
                    },
                    'delivery_estimate': {
                        'base_hours': route_info.get('duration_hours', 24),
                        'weather_adjusted_hours': route_info.get('duration_hours', 24),
                        'delay_factor': 1.0,
                        'estimated_delivery': self._calculate_delivery_window(route_info.get('duration_hours', 24))
                    },
                    'ai_insights': 'Route analysis completed with standard parameters.',
                    'recommendations': ['Standard delivery conditions expected', 'Monitor traffic conditions'],
                    'transport_mode': mode,
                    'cost_breakdown': cost_breakdown,
                    'ai_summary': ai_trip.get('gemini_summary') if isinstance(ai_trip, dict) else None,
                    'ai_stats': ai_trip.get('stats') if isinstance(ai_trip, dict) else None
                }
            
            print(f"Geocoding successful: {origin_geo}, {dest_geo}")
            
            # Generate richer, mode-specific weather points with place names
            points = self._generate_route_weather_points(
                origin_geo, dest_geo, origin, destination, mode
            )
            # Build summary for assessment
            summary = []
            for p in points:
                w = p.get('weather', {})
                if w and 'error' not in w:
                    summary.append({
                        'position': p.get('position'),
                        'temp': w.get('temp_c', 20),
                        'weather': w.get('weather', 'Clear'),
                        'description': w.get('description', 'Clear sky'),
                        'wind_speed': w.get('wind_speed', 5),
                        'visibility': w.get('visibility', 10)
                    })
            route_conditions = self._assess_route_conditions(summary)
            weather_analysis = {
                'points': points,
                'weather_summary': summary,
                'ai_analysis': 'Weather conditions summarized (analysis mode).',
                'route_conditions': route_conditions
            }
            
            print(f"Weather analysis: {route_conditions}")
            
            # Calculate adjusted delivery time with weather impact (base from AI)
            base_hours = route_info.get('duration_hours', 24)
            try:
                # Guard against tiny zero-ish values and ensure float
                if isinstance(base_hours, (int, float)):
                    base_hours = max(0.5, float(base_hours))
                else:
                    base_hours = 24
            except Exception:
                base_hours = 24
            weather_delay_factor = weather_analysis.get('route_conditions', {}).get('delay_factor', 1.0)
            adjusted_hours = base_hours * weather_delay_factor
            
            # Generate comprehensive analysis
            prompt = f"Analyze logistics route {origin} to {destination}: {route_info.get('distance_km', 0)}km, {base_hours}h base time. Weather: {weather_analysis.get('route_conditions', {}).get('risk_level', 'unknown')} risk. Provide delivery recommendations."
            
            ai_insights = self._generate_gemini_text(prompt, 400)
            
            result = {
                'route_info': route_info,
                'weather_analysis': weather_analysis,
                'delivery_estimate': {
                    'base_hours': base_hours,
                    'weather_adjusted_hours': round(adjusted_hours, 1),
                    'delay_factor': weather_delay_factor,
                    'estimated_delivery': self._calculate_delivery_window(adjusted_hours)
                },
                'ai_insights': ai_insights,
                'recommendations': self._generate_route_recommendations(weather_analysis, route_info),
                'transport_mode': mode,
                'cost_breakdown': cost_breakdown,
                'ai_summary': ai_trip.get('gemini_summary') if isinstance(ai_trip, dict) else None,
                'ai_stats': ai_trip.get('stats') if isinstance(ai_trip, dict) else None
            }
            
            print("Route analysis completed successfully")
            # Persist AI route_info into tracking where possible for reuse in live snapshots
            try:
                # Best-effort: if analysis is for a known shipment, caller route will persist. For route-only, skip.
                pass
            except Exception:
                pass
            return result
            
        except Exception as e:
            print(f"Route analysis error: {e}")
            return {
                'error': f'Route analysis failed: {str(e)}',
                'route_info': {'distance_km': 0, 'duration_hours': 24, 'source': 'error'},
                'weather_analysis': {
                    'points': [],
                    'weather_summary': [],
                    'ai_analysis': 'Analysis unavailable due to technical issues.',
                    'route_conditions': {'risk_level': 'unknown', 'delay_factor': 1.0}
                },
                'delivery_estimate': {
                    'base_hours': 24,
                    'weather_adjusted_hours': 24,
                    'delay_factor': 1.0,
                    'estimated_delivery': self._calculate_delivery_window(24)
                },
                'ai_insights': 'Technical issues prevented detailed analysis. Using standard estimates.',
                'recommendations': ['Use standard delivery procedures', 'Monitor conditions manually']
            }
    
    def _calculate_delivery_window(self, hours: float) -> Dict[str, str]:
        """Calculate delivery time window"""
        from datetime import datetime, timedelta
        
        now = datetime.now()
        estimated_delivery = now + timedelta(hours=hours)
        
        return {
            'earliest': (now + timedelta(hours=hours * 0.9)).strftime('%Y-%m-%d %H:%M'),
            'latest': (now + timedelta(hours=hours * 1.1)).strftime('%Y-%m-%d %H:%M'),
            'estimated': estimated_delivery.strftime('%Y-%m-%d %H:%M')
        }

    def _estimate_air_hours(self, distance_km: float, likely_international: bool = False) -> float:
        """Estimate air transport hours with buffers.

        Model:
        - Cruise speed ~800 km/h
        - Fixed buffers (check-in, security, boarding, taxi, baggage):
          2.5h domestic, 3.5h international
        - For very long distances (> 6000 km), add 2h layover buffer
        - Clamp minimum total to 1.8h
        """
        try:
            d = max(0.0, float(distance_km or 0))
        except Exception:
            d = 0.0
        cruise_speed = 800.0
        flight_time = d / cruise_speed if d > 0 else 0.0
        buffers = 3.5 if likely_international else 2.5
        if d > 6000:
            buffers += 2.0
        total = buffers + flight_time
        return round(max(1.8, total), 2)
    
    def _generate_route_recommendations(self, weather_analysis: Dict, route_info: Dict) -> List[str]:
        """Generate route recommendations based on conditions"""
        recommendations = []
        
        conditions = weather_analysis.get('route_conditions', {})
        risk_level = conditions.get('risk_level', 'low')
        
        if risk_level == 'high':
            recommendations.extend([
                'Consider delaying shipment until weather improves',
                'Use covered transport vehicles',
                'Add extra packaging protection',
                'Monitor weather updates closely'
            ])
        elif risk_level == 'medium':
            recommendations.extend([
                'Proceed with caution',
                'Ensure vehicle maintenance is up to date',
                'Consider alternative routes if available'
            ])
        else:
            recommendations.append('Favorable conditions for delivery')
        
        # Distance-based recommendations
        distance = route_info.get('distance_km', 0)
        if distance > 1000:
            recommendations.append('Consider air transport for faster delivery')
        elif distance > 500:
            recommendations.append('Rail transport may be more cost-effective')
        
        return recommendations
    
    def get_distance_and_duration(self, origin: str, destination: str) -> Dict[str, Any]:
        """Return distance and duration between two places"""
        try:
            cache_key = f"route:{origin}:{destination}"
            cached = self._get_cache(cache_key)
            if cached:
                return cached

            origin_geo = self._geocode_place(origin)
            dest_geo = self._geocode_place(destination)
            if not origin_geo:
                cc = self._city_coord(origin)
                if cc:
                    origin_geo = {'lat': cc[0], 'lon': cc[1], 'source': 'static'}
            if not dest_geo:
                cc2 = self._city_coord(destination)
                if cc2:
                    dest_geo = {'lat': cc2[0], 'lon': cc2[1], 'source': 'static'}
            
            if origin_geo and dest_geo:
                # Use haversine distance calculation
                distance_km = self.get_distance_and_duration_by_coords(
                    origin_geo['lat'], origin_geo['lon'],
                    dest_geo['lat'], dest_geo['lon']
                )['distance_km']
                
                # Estimate duration based on distance and transport mode
                duration_hours = distance_km / 60.0  # Assume 60 km/h average
                
                result = {
                    'distance_km': round(distance_km, 1),
                    'duration_hours': round(duration_hours, 2),
                    'source': 'calculated'
                }
                
                self._set_cache(cache_key, result, ttl=3600)
                return result
            
            # Fallback to internal mapping
            km = self._get_distance_between(origin, destination)
            hrs = round(km / 60.0, 1)
            return {'distance_km': km, 'duration_hours': hrs, 'source': 'internal'}
            
        except Exception:
            return {'distance_km': 0, 'duration_hours': 0, 'source': 'error'}

    def get_distance_and_duration_by_coords(self, lat1: float, lon1: float, lat2: float, lon2: float) -> Dict[str, Any]:
        """Compute approximate distance (km) and duration (hours) between two coordinate points using haversine."""
        try:
            # haversine formula
            from math import radians, sin, cos, asin, sqrt

            R = 6371.0  # Earth radius in km
            dlat = radians(lat2 - lat1)
            dlon = radians(lon2 - lon1)
            a = sin(dlat/2)**2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)**2
            c = 2 * asin(sqrt(a))
            km = R * c

            # simple travel estimate using average speed 60 km/h
            hrs = round(km / 60.0, 2) if km > 0 else 0

            res = {'distance_km': round(km, 2), 'duration_hours': hrs, 'source': 'coords'}
            return res
        except Exception:
            return {'distance_km': 0, 'duration_hours': 0, 'source': 'coords_error'}

    def get_weather_along_route(self, lat1: float, lon1: float, lat2: float, lon2: float, samples: int = 3) -> Dict[str, Any]:
        """Sample weather at N points along route with analysis"""
        try:
            if samples < 2:
                samples = 2
            
            points = []
            weather_data = []
            
            for i in range(samples):
                t = i / (samples - 1)
                lat = lat1 + (lat2 - lat1) * t
                lon = lon1 + (lon2 - lon1) * t
                w = self.fetch_weather_by_coords(lat, lon)
                points.append({'lat': lat, 'lon': lon, 'weather': w, 'position': f'Point {i+1}'})
                
                if w and 'error' not in w:
                    weather_data.append({
                        'position': f'Point {i+1}',
                        'temp': w.get('temp_c', 20),
                        'weather': w.get('weather', 'Clear'),
                        'description': w.get('description', 'Clear sky'),
                        'wind_speed': w.get('wind_speed', 5),
                        'visibility': w.get('visibility', 10)
                    })
            
            # Generate analysis (fast path): skip Gemini text to reduce latency
            if weather_data:
                return {
                    'points': points,
                    'weather_summary': weather_data,
                    'ai_analysis': 'Weather conditions summarized (fast mode).',
                    'route_conditions': self._assess_route_conditions(weather_data)
                }
            
            # Fallback when no weather data
            return {
                'points': points, 
                'weather_summary': [], 
                'ai_analysis': 'Weather data temporarily unavailable. Using standard delivery estimates.',
                'route_conditions': {'risk_level': 'low', 'delay_factor': 1.0, 'risk_score': 0}
            }
            
        except Exception as e:
            print(f"Weather route error: {e}")
            return {
                'points': [], 
                'error': str(e),
                'weather_summary': [],
                'ai_analysis': 'Weather analysis unavailable. Proceeding with standard delivery estimates.',
                'route_conditions': {'risk_level': 'unknown', 'delay_factor': 1.0, 'risk_score': 0}
            }
    
    def _assess_route_conditions(self, weather_data: List[Dict]) -> Dict[str, Any]:
        """Assess overall route conditions"""
        if not weather_data:
            return {'risk_level': 'unknown', 'delay_factor': 1.0}
        
        risk_factors = 0
        delay_factor = 1.0
        
        for point in weather_data:
            weather = point.get('weather', '').lower()
            wind_speed = point.get('wind_speed', 0) or 0
            visibility = point.get('visibility', 10) or 10
            
            # Assess risk factors
            if any(condition in weather for condition in ['rain', 'storm', 'snow']):
                risk_factors += 2
                delay_factor += 0.15
            elif any(condition in weather for condition in ['cloud', 'fog']):
                risk_factors += 1
                delay_factor += 0.05
            
            if wind_speed > 10:  # High wind
                risk_factors += 1
                delay_factor += 0.1
            
            if visibility < 5:  # Poor visibility
                risk_factors += 2
                delay_factor += 0.2
        
        # Determine risk level
        if risk_factors >= 6:
            risk_level = 'high'
        elif risk_factors >= 3:
            risk_level = 'medium'
        else:
            risk_level = 'low'
        
        return {
            'risk_level': risk_level,
            'delay_factor': min(delay_factor, 2.0),  # Cap at 100% delay
            'risk_score': risk_factors
        }

    def _generate_gemini_text(self, prompt: str, max_output_tokens: int = 256) -> str:
        """Generate text using Gemini AI with fallback"""
        if genai is None:
            return self._generate_fallback_analysis(prompt)

        try:
            model = genai.GenerativeModel(GEMINI_MODEL)
            response = model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    max_output_tokens=max_output_tokens,
                    temperature=0.7
                )
            )
            return response.text if response.text else self._generate_fallback_analysis(prompt)
        except Exception as e:
            print(f"Gemini API error: {e}")
            return self._generate_fallback_analysis(prompt)
    
    def _generate_fallback_analysis(self, prompt: str) -> str:
        """Generate fallback analysis when Gemini is unavailable"""
        if 'route weather' in prompt.lower():
            return "Route analysis: Weather conditions appear favorable for delivery. Monitor for any sudden weather changes. Estimated delivery time may vary by 10-15% based on current conditions. Recommend standard precautions for road transport."
        elif 'transport mode' in prompt.lower():
            return "Transport recommendation: Road transport is suitable for this route. Consider weather conditions and traffic patterns. Rail transport may be more cost-effective for longer distances."
        elif 'provider' in prompt.lower():
            return "Provider analysis: Multiple logistics providers available for this route. Compare based on cost, reliability, and delivery time. Consider weather impact on different transport modes."
        else:
            return "Analysis completed using statistical models. Weather and route conditions have been assessed for optimal delivery planning."

    def _compute_cost_breakdown_for_mode(self, distance_km: float, mode: str, ai_total_inr: Optional[float],
                                         items_count: int = 0, weight_kg: float = 0,
                                         likely_international: bool = False,
                                         priority: Optional[str] = None) -> Dict[str, Any]:
        """Compute mode-specific cost breakdown similar to UI cards.

    Returns keys: handling, freight, documentation, fuel_surcharge,
    security, customs, total, and a calculation_note. Insurance removed.
    Priority (express/urgent) increases total proportionally after component calc.
        """
        # Baseline heuristics per mode (INR per km or per kg-km where relevant)
        mode = (mode or 'road').lower()
        # Rough baselines
        if mode == 'air':
            freight_base = distance_km * 3.45  # per km proxy
            fuel_mult = 0.18
            handling = 7500
            security = 2500
            documentation = 1500
            customs = 5000 if likely_international else 300  # domestic clearance min
        elif mode == 'sea':
            freight_base = distance_km * 1.8
            fuel_mult = 0.12
            handling = 6000
            security = 1500
            documentation = 2000
            customs = 6000 if likely_international else 300
        elif mode == 'rail':
            freight_base = distance_km * 2.2
            fuel_mult = 0.10
            handling = 3500
            security = 1000
            documentation = 1000
            customs = 300
        else:  # road
            freight_base = distance_km * 2.9
            fuel_mult = 0.14
            handling = 3000
            security = 800
            documentation = 800
            customs = 300
        # Insurance removed across all modes
        insurance = 0

        # Adjust freight for weight somewhat (very coarse): add 0.5 INR per km per 100kg
        weight_adj = (max(weight_kg, 0) / 100.0) * 0.5 * distance_km
        freight = round(freight_base + weight_adj)
        fuel_surcharge = round(freight * fuel_mult)

        # Use AI total if provided to adjust proportional components, else sum our parts
        subtotal = handling + freight + documentation + fuel_surcharge + security + customs
        total = round(ai_total_inr) if ai_total_inr and ai_total_inr > 0 else subtotal

        # If AI total differs a lot, scale freight to match while keeping ancillaries
        if ai_total_inr and abs(total - subtotal) > 0.1 * subtotal:
            diff = ai_total_inr - (subtotal - freight)
            freight = max(0, round(diff))
            subtotal = handling + freight + documentation + fuel_surcharge + security + customs
            total = round(subtotal)

        # Priority multiplier applied to total post-alignment
        try:
            pr = (priority or '').strip().lower()
        except Exception:
            pr = ''
        mult = 1.0
        if pr == 'express':
            mult = 1.5
        elif pr == 'urgent':
            mult = 2.0

        # Keep a target total if we applied AI alignment or priority multiplier
        target_total = None
        if mult != 1.0:
            target_total = int(round(total * mult))
        elif ai_total_inr:
            target_total = int(round(total))
        if target_total is not None:
            # Keep ancillaries same, scale freight to reach new total
            others = handling + documentation + fuel_surcharge + security + customs
            new_freight = max(0, target_total - others)
            freight = new_freight
            total = target_total

        # Enforce non-zero minimums for every component
        MIN_COMPONENT = 50
        handling = max(int(handling), MIN_COMPONENT)
        documentation = max(int(documentation), MIN_COMPONENT)
        fuel_surcharge = max(int(fuel_surcharge), MIN_COMPONENT)
        security = max(int(security), MIN_COMPONENT)
        customs = max(int(customs), MIN_COMPONENT)
        min_freight = 250
        freight = max(int(freight), min_freight)

        # Refit freight to target_total if available and feasible
        others_sum = handling + documentation + fuel_surcharge + security + customs
        if target_total is not None:
            desired_freight = target_total - others_sum
            if desired_freight >= min_freight:
                freight = desired_freight
                total = target_total
            else:
                # Cannot fit target while honoring min; set total to sum
                total = others_sum + freight
        else:
            total = others_sum + freight

        note = "Calculation Method: Mode-adjusted with AI total alignment" if ai_total_inr else "Calculation Method: Heuristic mode-based estimate"

        return {
            'handling_inr': int(handling),
            'freight_inr': int(freight),
            'documentation_inr': int(documentation),
            'fuel_surcharge_inr': int(fuel_surcharge),
            'security_inr': int(security),
            'customs_inr': int(customs),
            'total_inr': int(total),
            'calculation_note': note
        }

    def adjust_breakdown_to_total(self, breakdown: Dict[str, Any], target_total: int) -> Dict[str, Any]:
        """Return a copy of breakdown with components adjusted to match target_total.

        Strategy: adjust freight_inr to make sum(other) + freight_inr = target_total. Never negative.
        Adds a note indicating reconciliation to locked price.
        """
        if not isinstance(breakdown, dict):
            return breakdown
        b = dict(breakdown)
        # Insurance removed from calculation; ignore if present
        handling = int(b.get('handling_inr', 0))
        documentation = int(b.get('documentation_inr', 0))
        fuel_surcharge = int(b.get('fuel_surcharge_inr', 0))
        security = int(b.get('security_inr', 0))
        customs = int(b.get('customs_inr', 0))
        others = handling + documentation + fuel_surcharge + security + customs
        new_freight = max(0, int(target_total) - others)
        b['freight_inr'] = new_freight
        b['total_inr'] = int(target_total)
        note = b.get('calculation_note') or 'Calculation Method'
        b['calculation_note'] = f"{note}; Reconciled to locked total"
        return b

    # Simple cache helpers
    def _get_cache(self, key: str):
        with self._cache_lock:
            item = self._cache.get(key)
            if not item:
                return None
            value, expires = item
            if time.time() > expires:
                del self._cache[key]
                return None
            return value

    def _set_cache(self, key: str, value, ttl: int = 60):
        with self._cache_lock:
            self._cache[key] = (value, time.time() + ttl)

    def _allow_call(self, endpoint: str, min_interval: float) -> bool:
        """Allow a call to an external endpoint if min_interval seconds have passed since last call."""
        now = time.time()
        last = self._last_called.get(endpoint, 0)
        if now - last < min_interval:
            return False
        self._last_called[endpoint] = now
        return True

    def get_analytics(self) -> Dict[str, Any]:
        """Get enhanced logistics performance analytics"""

        total_shipments = len(self._mock_shipments)

        # Status breakdown
        status_counts = {}
        for shipment in self._mock_shipments:
            status = shipment['status']
            status_counts[status] = status_counts.get(status, 0) + 1

        # Transport mode breakdown
        mode_counts = {}
        mode_costs = {}
        for shipment in self._mock_shipments:
            mode = shipment.get('transport_mode', 'road')
            mode_counts[mode] = mode_counts.get(mode, 0) + 1
            mode_costs[mode] = mode_costs.get(mode, 0) + shipment.get('cost', 0)

        # Priority breakdown
        priority_counts = {}
        for shipment in self._mock_shipments:
            priority = shipment.get('priority', 'standard')
            priority_counts[priority] = priority_counts.get(priority, 0) + 1

        # Calculate on-time delivery rate
        delivered_shipments = [s for s in self._mock_shipments if s['status'] == 'Delivered']
        on_time_count = 0

        for shipment in delivered_shipments:
            if shipment.get('actual_delivery') and shipment.get('eta'):
                actual = datetime.strptime(shipment['actual_delivery'], '%Y-%m-%d').date()
                expected = datetime.strptime(shipment['eta'], '%Y-%m-%d').date()
                if actual <= expected:
                    on_time_count += 1

        on_time_rate = (on_time_count / len(delivered_shipments) * 100) if delivered_shipments else 0

        # Calculate average delivery time
        total_delivery_days = 0
        for shipment in delivered_shipments:
            if shipment.get('shipped_date') and shipment.get('actual_delivery'):
                shipped = datetime.strptime(shipment['shipped_date'], '%Y-%m-%d').date()
                delivered = datetime.strptime(shipment['actual_delivery'], '%Y-%m-%d').date()
                total_delivery_days += (delivered - shipped).days

        avg_delivery_time = (total_delivery_days / len(delivered_shipments)) if delivered_shipments else 4.2

        # Cost analytics
        total_cost = sum(shipment.get('cost', 0) for shipment in self._mock_shipments)
        avg_cost_per_shipment = total_cost / total_shipments if total_shipments > 0 else 0
        
        # Calculate cost efficiency by mode
        cost_efficiency = {}
        for mode, cost in mode_costs.items():
            count = mode_counts.get(mode, 1)
            cost_efficiency[mode] = round(cost / count, 2)

        return {
            'total_shipments': total_shipments,
            'status_breakdown': status_counts,
            'transport_mode_breakdown': mode_counts,
            'priority_breakdown': priority_counts,
            'on_time_delivery_rate': round(on_time_rate, 1),
            'average_delivery_time_days': round(avg_delivery_time, 1),
            'total_shipping_cost': total_cost,
            'average_cost_per_shipment': round(avg_cost_per_shipment, 2),
            'cost_efficiency_by_mode': cost_efficiency,
            'performance_trends': {
                'last_30_days': {
                    'shipments': total_shipments,
                    'on_time_rate': round(on_time_rate, 1),
                    'avg_cost': round(avg_cost_per_shipment, 2)
                }
            },
            'recommendations': self._generate_recommendations()
        }

    # -------------------- Cost Persistence for Consistency --------------------
    def update_shipment_cost_info(self, shipment_id: str, total_inr: int,
                                  breakdown: Dict[str, Any],
                                  ai_stats: Optional[Dict[str, Any]] = None,
                                  ai_summary: Optional[str] = None,
                                  overwrite_total: bool = False,
                                  route_info: Optional[Dict[str, Any]] = None) -> bool:
        """Persist cost info so list and detail views remain consistent.

        Updates shipping_cost and stores cost_breakdown (plus ai_stats/ai_summary) in tracking_info.
        Returns True on success or False if shipment not found/failed.
        """
        try:
            if self._has_db():
                sess = self._session()
                try:
                    row = sess.query(ShipmentModel).filter(ShipmentModel.id == shipment_id).first()
                    if not row:
                        return False
                    # Respect immutability of price after creation unless explicitly requested
                    if overwrite_total or not row.shipping_cost or row.shipping_cost == 0:
                        row.shipping_cost = total_inr
                    info = row.tracking_info or {}
                    # shallow copy and update
                    updated = dict(info)
                    # Remove insurance from breakdown if present
                    if isinstance(breakdown, dict) and 'insurance_inr' in breakdown:
                        breakdown = {k: v for k, v in breakdown.items() if k != 'insurance_inr'}
                    updated['cost_breakdown'] = breakdown
                    if route_info is not None:
                        updated['ai_route_info'] = route_info
                        try:
                            dur = route_info.get('duration_hours') if isinstance(route_info, dict) else None
                            if dur:
                                updated['ai_predicted_hours'] = dur
                        except Exception:
                            pass
                    if ai_stats is not None:
                        updated['ai_stats'] = ai_stats
                    if ai_summary is not None:
                        updated['ai_summary'] = ai_summary
                    row.tracking_info = updated
                    sess.commit()
                    return True
                except Exception:
                    sess.rollback()
                    return False
                finally:
                    sess.close()
            else:
                for s in self._mock_shipments:
                    if s.get('id') == shipment_id:
                        # Do not overwrite agreed price unless explicitly allowed
                        if overwrite_total or not s.get('cost') or s.get('cost') == 0:
                            s['cost'] = total_inr
                        ti = s.get('tracking_info') or {}
                        updated = dict(ti)
                        if isinstance(breakdown, dict) and 'insurance_inr' in breakdown:
                            breakdown = {k: v for k, v in breakdown.items() if k != 'insurance_inr'}
                        updated['cost_breakdown'] = breakdown
                        if route_info is not None:
                            updated['ai_route_info'] = route_info
                            try:
                                dur = route_info.get('duration_hours') if isinstance(route_info, dict) else None
                                if dur:
                                    updated['ai_predicted_hours'] = dur
                            except Exception:
                                pass
                        if ai_stats is not None:
                            updated['ai_stats'] = ai_stats
                        if ai_summary is not None:
                            updated['ai_summary'] = ai_summary
                        s['tracking_info'] = updated
                        return True
                return False
        except Exception:
            return False

    def reconcile_shipment_costs(self) -> int:
        """Backfill cost_breakdown for all shipments and align totals to stored price.

        If a shipment has no stored price (0/None), compute and set it from analysis.
        Otherwise, compute a fresh breakdown and set its total to the stored price, marking note as locked.
        Returns the number of shipments updated.
        """
        updated = 0
        if self._has_db():
            sess = self._session()
            try:
                rows = sess.execute(select(ShipmentModel)).scalars().all()
                for r in rows:
                    try:
                        origin = r.origin
                        destination = r.destination
                        mode = r.transport_mode or 'road'
                        items_count = r.items_count or 0
                        weight_kg = r.total_weight or 0.0
                        analysis = self.get_route_analysis_with_weather(origin, destination, mode, items_count, weight_kg)
                        cb = (analysis or {}).get('cost_breakdown') or {}
                        if 'insurance_inr' in cb:
                            cb.pop('insurance_inr', None)
                        stored = r.shipping_cost
                        if stored and stored > 0:
                            cb = self.adjust_breakdown_to_total(cb, int(stored))
                            note = cb.get('calculation_note') or 'Calculation Method'
                            cb['calculation_note'] = f"{note}; Price locked at booking"
                            if self.update_shipment_cost_info(r.id, int(stored), cb, analysis.get('ai_stats'), analysis.get('ai_summary'), overwrite_total=False):
                                updated += 1
                        else:
                            # Set initial price from analysis total
                            computed_total = int(cb.get('total_inr') or 0)
                            if computed_total > 0 and self.update_shipment_cost_info(r.id, computed_total, cb, analysis.get('ai_stats'), analysis.get('ai_summary'), overwrite_total=True):
                                updated += 1
                    except Exception:
                        continue
            finally:
                sess.close()
        else:
            for s in self._mock_shipments:
                try:
                    origin = s.get('origin')
                    destination = s.get('destination')
                    mode = s.get('transport_mode') or 'road'
                    items_count = s.get('items_count') or 0
                    weight_kg = s.get('total_weight') or 0.0
                    analysis = self.get_route_analysis_with_weather(origin, destination, mode, items_count, weight_kg)
                    cb = (analysis or {}).get('cost_breakdown') or {}
                    if 'insurance_inr' in cb:
                        cb.pop('insurance_inr', None)
                    stored = s.get('cost')
                    if stored and stored > 0:
                        cb = self.adjust_breakdown_to_total(cb, int(stored))
                        note = cb.get('calculation_note') or 'Calculation Method'
                        cb['calculation_note'] = f"{note}; Price locked at booking"
                        if self.update_shipment_cost_info(s['id'], int(stored), cb, analysis.get('ai_stats'), analysis.get('ai_summary'), overwrite_total=False):
                            updated += 1
                    else:
                        computed_total = int(cb.get('total_inr') or 0)
                        if computed_total > 0 and self.update_shipment_cost_info(s['id'], computed_total, cb, analysis.get('ai_stats'), analysis.get('ai_summary'), overwrite_total=True):
                            updated += 1
                except Exception:
                    continue
        return updated
    
    def _generate_recommendations(self) -> List[str]:
        """Generate logistics recommendations based on current data"""
        recommendations = []
        
        # Analyze delivery performance
        delivered = [s for s in self._mock_shipments if s['status'] == 'Delivered']
        if delivered:
            on_time = sum(1 for s in delivered if s.get('actual_delivery') and s.get('eta') and 
                         datetime.strptime(s['actual_delivery'], '%Y-%m-%d').date() <= 
                         datetime.strptime(s['eta'], '%Y-%m-%d').date())
            rate = (on_time / len(delivered)) * 100
            
            if rate < 80:
                recommendations.append("Consider optimizing delivery routes to improve on-time performance")
            if rate > 95:
                recommendations.append("Excellent delivery performance - maintain current standards")
        
        # Analyze transport modes
        modes = {}
        for s in self._mock_shipments:
            mode = s.get('transport_mode', 'road')
            modes[mode] = modes.get(mode, 0) + 1
        
        if modes.get('road', 0) > len(self._mock_shipments) * 0.8:
            recommendations.append("Consider diversifying transport modes for better cost efficiency")
        
        return recommendations[:3]  # Return top 3 recommendations

    def _calculate_distance_cost(self, origin: str, destination: str) -> float:
        """Calculate distance-based cost"""

        # Simplified distance calculation
        distance_map = {
            ('Bangalore', 'Mumbai'): 980,
            ('Bangalore', 'Delhi'): 2150,
            ('Bangalore', 'Chennai'): 350,
            ('Bangalore', 'Hyderabad'): 570,
            ('Bangalore', 'Pune'): 840,
            ('Bangalore', 'Kolkata'): 1880,
        }

        key = (origin, destination)
        reverse_key = (destination, origin)

        distance = distance_map.get(key) or distance_map.get(reverse_key, 500)

        # ₹5 per km base rate
        return distance * 5.0

    def _calculate_shipping_cost(self, weight: float, items_count: int, distance_cost: float, transport_mode: str = 'road') -> float:
        """Calculate total shipping cost with transport mode consideration"""

        base_cost = 100  # Base handling charge
        weight_cost = weight * 15  # ₹15 per kg
        item_cost = items_count * 25  # ₹25 per item
        
        # Transport mode multipliers
        mode_multipliers = {
            'road': 1.0,
            'rail': 0.8,
            'air': 2.5,
            'sea': 0.6
        }
        
        mode_multiplier = mode_multipliers.get(transport_mode, 1.0)
        total_cost = (base_cost + weight_cost + item_cost + distance_cost) * mode_multiplier

        return round(total_cost, 2)
    
    def _calculate_delivery_time(self, transport_mode: str, base_days: int) -> int:
        """Calculate delivery time based on transport mode"""
        
        mode_factors = {
            'road': 1.0,
            'rail': 1.2,
            'air': 0.3,
            'sea': 2.0
        }
        
        factor = mode_factors.get(transport_mode, 1.0)
        return max(1, int(base_days * factor))

    def _get_next_checkpoint(self, origin: str, destination: str) -> str:
        """Get next checkpoint for shipment"""

        route_map = {
            ('Bangalore', 'Mumbai'): 'Pune Hub',
            ('Bangalore', 'Delhi'): 'Hyderabad Hub',
            ('Bangalore', 'Chennai'): 'Direct Route',
            ('Bangalore', 'Hyderabad'): 'Direct Route',
            ('Bangalore', 'Pune'): 'Mumbai Hub',
            ('Bangalore', 'Kolkata'): 'Hyderabad Hub',
        }

        key = (origin, destination)
        return route_map.get(key, 'Regional Hub')

    def _simple_route_optimization(self, destinations: List[str]) -> List[str]:
        """Simple route optimization algorithm"""

        # For demo purposes, just sort alphabetically with some logic
        # In reality, this would use sophisticated algorithms like TSP solvers

        priority_cities = ['Mumbai', 'Delhi', 'Chennai', 'Hyderabad']

        prioritized = []
        others = []

        for dest in destinations:
            if any(city in dest for city in priority_cities):
                prioritized.append(dest)
            else:
                others.append(dest)

        # Sort prioritized cities by distance (simplified)
        prioritized.sort()
        others.sort()

        return prioritized + others

    def _calculate_total_distance(self, route: List[str]) -> float:
        """Calculate total distance for route"""

        total = 0
        previous = 'Bangalore'  # Starting point

        for destination in route:
            total += self._get_distance_between(previous, destination)
            previous = destination

        return round(total, 1)

    def _calculate_total_time(self, route: List[str]) -> float:
        """Calculate total time for route"""

        total_distance = self._calculate_total_distance(route)
        # Average speed of 60 km/h including stops
        return round(total_distance / 60, 1)

    def _calculate_route_cost(self, route: List[str]) -> float:
        """Calculate total cost for route"""


    # ----------------------------------
    # Stats aggregation
    # ----------------------------------
    def get_shipment_stats(self) -> Dict[str, Any]:
        """Compute logistics dashboard metrics.

        Metrics:
          total_shipments: count of all shipments
          in_transit: shipments with status 'In Transit'
          on_time_rate: percentage (0-100) of delivered shipments delivered on/before ETA
          avg_delivery_time_days: average (float) days from shipped_date (or created) to actual_delivery
        """
        total = 0
        in_transit = 0
        delivered = 0
        on_time = 0
        durations = []

        def parse_dt(val):
            if not val:
                return None
            if isinstance(val, datetime):
                return val
            for fmt in ('%Y-%m-%d', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S'):
                try:
                    return datetime.strptime(val.split('.')[0], fmt)
                except Exception:
                    continue
            return None

        if self._has_db():
            sess = self._session()
            try:
                rows = sess.execute(select(ShipmentModel)).scalars().all()
                for r in rows:
                    total += 1
                    status = (r.status or '').lower()
                    if status == 'in transit':
                        in_transit += 1
                    if status == 'delivered':
                        delivered += 1
                        eta = r.estimated_delivery
                        actual = r.actual_delivery
                        if actual and eta and actual.date() <= eta.date():
                            on_time += 1
                        # duration
                        start = r.shipped_date or r.created_date or r.created_at
                        end = actual
                        if start and end:
                            durations.append((end - start).total_seconds() / 86400.0)
            finally:
                sess.close()
        else:
            for s in self._mock_shipments:
                total += 1
                status = (s.get('status') or '').lower()
                if status == 'in transit':
                    in_transit += 1
                if status == 'delivered':
                    delivered += 1
                    eta = parse_dt(s.get('eta'))
                    actual = parse_dt(s.get('actual_delivery'))
                    if actual and eta and actual.date() <= eta.date():
                        on_time += 1
                    start = parse_dt(s.get('shipped_date')) or parse_dt(s.get('created_date'))
                    end = actual
                    if start and end:
                        durations.append((end - start).total_seconds() / 86400.0)

        on_time_rate = (on_time / delivered * 100.0) if delivered else 0.0
        avg_delivery_time = (sum(durations) / len(durations)) if durations else 0.0

        return {
            'total_shipments': total,
            'in_transit': in_transit,
            'on_time_rate': round(on_time_rate, 1),
            'avg_delivery_time_days': round(avg_delivery_time, 2)
        }

    # ----------------------------------
    # Live / lightweight weather refresh for shipment modal
    # ----------------------------------
    def get_live_weather_analysis(self, shipment: Dict[str, Any], debug: bool = False) -> Dict[str, Any]:
        """Return a lightweight, fast-updating snapshot used for periodic modal polling.

        This avoids recomputing the full expensive analysis each interval. Strategy:
          1. Use cached precise distance / AI predictions if already computed earlier (stored in tracking_info).
          2. Refresh ONLY current origin & destination point weather (plus one mid-point sample) to update
             risk assessment and delay factor.
          3. Derive updated ETA adjustment if shipment status indicates progress beyond original prediction.

        Returns structure with keys: distance_km, ai_predictions, weather_points, risk, delivery_window, timestamp.
        """
        try:
            origin = shipment.get('origin')
            destination = shipment.get('destination')
            # Normalize common suffixes for consistency across services
            def _norm(n):
                if not n: return n
                return n.replace('Distribution Center','').replace('Warehouse','').strip()
            origin_norm = _norm(origin)
            destination_norm = _norm(destination)
            transport_mode = shipment.get('transport_mode', 'road')
            if not origin or not destination:
                return {'error': 'missing_route'}

            # Use cached AI route info if available; otherwise lightweight estimate
            tracking = shipment.get('tracking_info', {}) or {}
            cached_ai_route = tracking.get('ai_route_info') or {}
            if isinstance(cached_ai_route, dict) and cached_ai_route.get('distance_km') and cached_ai_route.get('duration_hours'):
                distance_km = cached_ai_route.get('distance_km')
                ai_predictions = {
                    'estimated_time_hours': cached_ai_route.get('duration_hours')
                }
            else:
                base_route = self.get_distance_and_duration(origin_norm, destination_norm)
                distance_km = base_route.get('distance_km')
                ai_predictions = None

            # Geocode origin/destination (cached inside helpers)
            o_geo = self._geocode_place(origin_norm)
            d_geo = self._geocode_place(destination_norm)
            if not o_geo:
                cc = self._city_coord(origin_norm)
                if cc:
                    o_geo = {'lat': cc[0], 'lon': cc[1], 'source': 'static'}
            if not d_geo:
                cc2 = self._city_coord(destination_norm)
                if cc2:
                    d_geo = {'lat': cc2[0], 'lon': cc2[1], 'source': 'static'}
            weather_points = []
            risk_level = 'unknown'
            delay_factor = 1.0
            if o_geo and d_geo:
                # Generate weather points along the route based on transport mode
                weather_points = self._generate_route_weather_points(
                    o_geo, d_geo, origin_norm, destination_norm, transport_mode
                )
                
                # Assess overall route conditions
                summary = []
                for p in weather_points:
                    w = p.get('weather', {})
                    if w and 'error' not in w:
                        summary.append({
                            'position': p['position'],
                            'weather': w.get('weather'),
                            'temp': w.get('temp_c'),
                            'wind_speed': w.get('wind_speed'),
                            'visibility': w.get('visibility')
                        })
                assess = self._assess_route_conditions(summary)
                risk_level = assess.get('risk_level', 'low')
                delay_factor = assess.get('delay_factor', 1.0)

            # Compute dynamic remaining ETA based on progress percentage
            progress_pct = tracking.get('progress_percentage') or 0
            # Prefer cached AI route duration; then fall back to tracking legacy; then AI predictions
            predicted_hours = (cached_ai_route.get('duration_hours') if isinstance(cached_ai_route, dict) else None) 
            if not predicted_hours:
                predicted_hours = (ai_predictions or {}).get('estimated_time_hours')
            if not predicted_hours:
                predicted_hours = tracking.get('ai_predicted_hours')

            # If still missing, use base route duration (coords or internal)
            if not predicted_hours:
                predicted_hours = self.get_distance_and_duration(origin_norm, destination_norm).get('duration_hours')

            # Air-specific refinement: if mode is air and distance is known, clamp to model window or compute
            try:
                if (shipment.get('transport_mode') or '').lower() == 'air' and distance_km:
                    air_hours = self._estimate_air_hours(distance_km, likely_international=distance_km > 2000)
                    if predicted_hours:
                        lo, hi = 0.7 * air_hours, 1.6 * air_hours
                        predicted_hours = float(min(max(predicted_hours, lo), hi))
                    else:
                        predicted_hours = air_hours
            except Exception:
                pass

            # If progress is very low and tracking's hours look unrealistically high vs route, clamp to route-based duration
            try:
                route_based = None
                if o_geo and d_geo:
                    route_based = self.get_distance_and_duration_by_coords(o_geo['lat'], o_geo['lon'], d_geo['lat'], d_geo['lon']).get('duration_hours')
                else:
                    route_based = self.get_distance_and_duration(origin_norm, destination_norm).get('duration_hours')
                if route_based and predicted_hours and progress_pct < 5 and predicted_hours > (route_based * 2.5):
                    predicted_hours = route_based
            except Exception:
                pass
            remaining_hours = None
            if predicted_hours:
                remaining_ratio = max(0.0, 1.0 - (progress_pct / 100.0))
                remaining_hours = predicted_hours * remaining_ratio * delay_factor
            delivery_window = self._calculate_delivery_window(remaining_hours) if remaining_hours else None

            result = {
                'shipment_id': shipment.get('id'),
                'distance_km': distance_km,
                'ai_predictions': ai_predictions,
                'weather_points': weather_points,
                'risk': {
                    'risk_level': risk_level,
                    'delay_factor': delay_factor
                },
                'remaining_hours': remaining_hours,
                'delivery_window': delivery_window,
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }
            if debug:
                result['debug'] = {
                    'origin_norm': origin_norm,
                    'destination_norm': destination_norm,
                    'o_geo': o_geo,
                    'd_geo': d_geo,
                    'distance_method': base_route.get('source'),
                    'progress_pct': progress_pct,
                    'predicted_hours_base': predicted_hours,
                    'delay_factor': delay_factor
                }
            return result
        except Exception as e:
            return {'error': 'live_weather_failed', 'detail': str(e)}

    # ----------------------------------
    # Administrative helpers
    # ----------------------------------
    def clear_shipments(self) -> int:
        """Delete all shipments (DB or in-memory). Returns number removed.

        NOTE: This is a destructive helper intended for development/reset scenarios.
        """
        removed = 0
        if self._has_db():
            sess = self._session()
            try:
                removed = sess.query(ShipmentModel).delete()
                sess.commit()
            except Exception:
                sess.rollback()
                raise
            finally:
                sess.close()
        else:
            removed = len(self._mock_shipments)
            self._mock_shipments.clear()
        return removed
        total_distance = self._calculate_total_distance(route)
        return round(total_distance * 8 + len(route) * 200, 2)  # ₹8/km + ₹200/stop

    def _get_distance_between(self, origin: str, destination: str) -> float:
        """Get distance between two cities with basic normalization.

        Normalization strips common suffixes like 'Distribution Center', lowercases then title-cases
        for lookup so that shipments with origins such as 'Bangalore Distribution Center' map to
        the Bangalore key and avoid using the same fallback distance for all routes.
        """

        def norm(name: str) -> str:
            if not name:
                return name
            cleaned = name.replace('Distribution Center', '').replace('Warehouse', '')
            cleaned = cleaned.replace('Hub', '').strip()
            # keep only first word for large composite names
            if ' ' in cleaned:
                parts = [p for p in cleaned.split() if p]
                if len(parts) > 0:
                    cleaned = parts[0]
            # synonyms
            if cleaned.lower() == 'bengaluru':
                cleaned = 'Bangalore'
            return cleaned.title()

        o = norm(origin)
        d = norm(destination)

        distance_map = {
            ('Bangalore', 'Mumbai'): 980,
            ('Bangalore', 'Delhi'): 2150,
            ('Bangalore', 'Chennai'): 350,
            ('Bangalore', 'Hyderabad'): 570,
            ('Bangalore', 'Pune'): 840,
            ('Bangalore', 'Kolkata'): 1880,
            ('Mumbai', 'Delhi'): 1400,
            ('Mumbai', 'Chennai'): 1340,
            ('Delhi', 'Chennai'): 2180,
            ('Delhi', 'Hyderabad'): 1580,
            # Added extended routes for differentiation
            ('Panaji', 'Bangalore'): 560,
            ('Panaji', 'Mumbai'): 590,
            ('Mumbai', 'London'): 7160,
            ('Bangalore', 'London'): 8050,
            ('Delhi', 'London'): 6700,
        }

        key = (o, d)
        reverse_key = (d, o)

        return distance_map.get(key) or distance_map.get(reverse_key, 500)

    def _calculate_arrival_time(self, index: int, route: List[str]) -> str:
        """Calculate estimated arrival time for destination"""

        # Start at 9:00 AM, add time for each previous destination
        start_time = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)

        total_hours = 0
        previous = 'Bangalore'

        for i in range(index + 1):
            destination = route[i]
            distance = self._get_distance_between(previous, destination)
            hours = distance / 60  # 60 km/h average
            total_hours += hours + 0.5  # Add 30 minutes for each stop
            previous = destination

        arrival_time = start_time + timedelta(hours=total_hours)
        return arrival_time.strftime('%H:%M on %Y-%m-%d')

    def _get_mock_shipments(self) -> List[Dict[str, Any]]:
        """Generate mock shipments for demo purposes"""
        # This can be expanded with more realistic mock data
        return [
            {
                'id': 'SHP-mock-1',
                'origin': 'Mumbai',
                'destination': 'Delhi',
                'status': 'Delivered',
                'items_count': 10,
                'total_weight': 50.0,
                'transport_mode': 'road',
                'priority': 'standard',
                'created_date': '2023-10-01',
                'shipped_date': '2023-10-01',
                'eta': '2023-10-05',
                'actual_delivery': '2023-10-05',
                'tracking_info': {
                    'progress_percentage': 100
                },
                'cost': 5000
            },
            {
                'id': 'SHP-mock-2',
                'origin': 'Bangalore',
                'destination': 'Chennai',
                'status': 'Delivered',
                'items_count': 5,
                'total_weight': 20.0,
                'transport_mode': 'rail',
                'priority': 'express',
                'created_date': '2023-10-02',
                'shipped_date': '2023-10-02',
                'eta': '2023-10-04',
                'actual_delivery': '2023-10-03',
                'tracking_info': {
                    'progress_percentage': 100
                },
                'cost': 3000
            },
            {
                'id': 'SHP-A1B2C3D4',
                'origin': 'Bangalore Distribution Center',
                'destination': 'Mumbai',
                'status': 'Delivered',
                'items_count': 25,
                'total_weight': 45.5,
                'cost': 4250.0,
                'transport_mode': 'road',
                'priority': 'standard',
                'created_date': '2025-09-08',
                'shipped_date': '2025-09-09',
                'eta': '2025-09-12',
                'actual_delivery': '2025-09-11',
                'items': [
                    {'description': 'Electronics Package', 'quantity': 15, 'weight': 30.0},
                    {'description': 'Textile Items', 'quantity': 10, 'weight': 15.5}
                ],
                'notes': 'Handle with care - fragile items',
                'tracking_info': {
                    'last_update': '2025-09-11T18:30:00',
                    'location': 'Mumbai',
                    'progress_percentage': 100,
                    'status_history': [
                        {'status': 'Processing', 'timestamp': '2025-09-08T10:00:00', 'location': 'Bangalore', 'message': 'Order received'},
                        {'status': 'In Transit', 'timestamp': '2025-09-09T08:00:00', 'location': 'Bangalore Hub', 'message': 'Shipment dispatched'},
                        {'status': 'In Transit', 'timestamp': '2025-09-10T14:30:00', 'location': 'Pune Hub', 'message': 'In transit via Pune'},
                        {'status': 'Delivered', 'timestamp': '2025-09-11T18:30:00', 'location': 'Mumbai', 'message': 'Successfully delivered'}
                    ]
                }
            },
            {
                'id': 'SHP-E5F6G7H8',
                'origin': 'Bangalore Distribution Center',
                'destination': 'Chennai',
                'status': 'In Transit',
                'items_count': 12,
                'total_weight': 20.0,
                'cost': 1950.0,
                'transport_mode': 'road',
                'priority': 'express',
                'created_date': '2025-09-11',
                'shipped_date': '2025-09-11',
                'eta': '2025-09-13',
                'actual_delivery': None,
                'items': [
                    {'description': 'Medical Supplies', 'quantity': 8, 'weight': 12.0},
                    {'description': 'Documents', 'quantity': 4, 'weight': 8.0}
                ],
                'notes': 'Express delivery - time sensitive',
                'tracking_info': {
                    'last_update': '2025-09-12T14:20:00',
                    'location': 'En Route to Chennai',
                    'next_checkpoint': 'Chennai Hub',
                    'progress_percentage': 65,
                    'status_history': [
                        {'status': 'Processing', 'timestamp': '2025-09-11T09:00:00', 'location': 'Bangalore', 'message': 'Express order received'},
                        {'status': 'In Transit', 'timestamp': '2025-09-11T11:00:00', 'location': 'Bangalore Hub', 'message': 'Dispatched for express delivery'},
                        {'status': 'In Transit', 'timestamp': '2025-09-12T14:20:00', 'location': 'Highway Checkpoint', 'message': 'En route to Chennai'}
                    ]
                }
            },
            {
                'id': 'SHP-I9J0K1L2',
                'origin': 'Bangalore Distribution Center',
                'destination': 'Delhi',
                'status': 'Processing',
                'items_count': 35,
                'total_weight': 80.0,
                'cost': 6500.0,
                'transport_mode': 'rail',
                'priority': 'standard',
                'created_date': '2025-09-12',
                'shipped_date': None,
                'eta': '2025-09-16',
                'actual_delivery': None,
                'items': [
                    {'description': 'Bulk Grocery Items', 'quantity': 20, 'weight': 50.0},
                    {'description': 'Household Products', 'quantity': 15, 'weight': 30.0}
                ],
                'notes': 'Bulk shipment - rail transport for cost efficiency',
                'tracking_info': {
                    'last_update': '2025-09-12T10:00:00',
                    'location': 'Bangalore Warehouse',
                    'next_checkpoint': 'Railway Station',
                    'progress_percentage': 15,
                    'status_history': [
                        {'status': 'Processing', 'timestamp': '2025-09-12T10:00:00', 'location': 'Bangalore Warehouse', 'message': 'Order received - packaging in progress'}
                    ]
                }
            },
            {
                'id': 'SHP-M3N4O5P6',
                'origin': 'Bangalore Distribution Center',
                'destination': 'Hyderabad',
                'status': 'Delivered',
                'items_count': 18,
                'total_weight': 30.5,
                'cost': 2850.0,
                'transport_mode': 'road',
                'priority': 'urgent',
                'created_date': '2025-09-09',
                'shipped_date': '2025-09-09',
                'eta': '2025-09-11',
                'actual_delivery': '2025-09-10',
                'items': [
                    {'description': 'Pharmaceutical Products', 'quantity': 10, 'weight': 15.0},
                    {'description': 'Medical Equipment', 'quantity': 8, 'weight': 15.5}
                ],
                'notes': 'Urgent medical supplies - priority delivery',
                'tracking_info': {
                    'last_update': '2025-09-10T16:45:00',
                    'location': 'Hyderabad',
                    'progress_percentage': 100,
                    'status_history': [
                        {'status': 'Processing', 'timestamp': '2025-09-09T08:00:00', 'location': 'Bangalore', 'message': 'Urgent order received'},
                        {'status': 'In Transit', 'timestamp': '2025-09-09T10:00:00', 'location': 'Bangalore Hub', 'message': 'Priority dispatch'},
                        {'status': 'Delivered', 'timestamp': '2025-09-10T16:45:00', 'location': 'Hyderabad', 'message': 'Delivered ahead of schedule'}
                    ]
                }
            },
            {
                'id': 'SHP-Q7R8S9T0',
                'origin': 'Bangalore Distribution Center',
                'destination': 'Kolkata',
                'status': 'In Transit',
                'items_count': 22,
                'total_weight': 55.0,
                'cost': 8750.0,
                'transport_mode': 'air',
                'priority': 'express',
                'created_date': '2025-09-13',
                'shipped_date': '2025-09-13',
                'eta': '2025-09-14',
                'actual_delivery': None,
                'items': [
                    {'description': 'Electronic Components', 'quantity': 12, 'weight': 25.0},
                    {'description': 'Precision Instruments', 'quantity': 10, 'weight': 30.0}
                ],
                'notes': 'Air freight - high value items',
                'tracking_info': {
                    'last_update': '2025-09-13T16:00:00',
                    'location': 'In Flight',
                    'next_checkpoint': 'Kolkata Airport',
                    'progress_percentage': 75,
                    'status_history': [
                        {'status': 'Processing', 'timestamp': '2025-09-13T08:00:00', 'location': 'Bangalore', 'message': 'Express air shipment processed'},
                        {'status': 'In Transit', 'timestamp': '2025-09-13T12:00:00', 'location': 'Bangalore Airport', 'message': 'Loaded for air transport'},
                        {'status': 'In Transit', 'timestamp': '2025-09-13T16:00:00', 'location': 'In Flight', 'message': 'En route to Kolkata'}
                    ]
                }
            },
            {
                'id': 'SHP-U1V2W3X4',
                'origin': 'Bangalore Distribution Center',
                'destination': 'Pune',
                'status': 'Delivered',
                'items_count': 14,
                'total_weight': 28.0,
                'cost': 3100.0,
                'transport_mode': 'road',
                'priority': 'standard',
                'created_date': '2025-09-07',
                'shipped_date': '2025-09-08',
                'eta': '2025-09-10',
                'actual_delivery': '2025-09-11',  # late
                'items': [
                    {'description': 'Auto Parts', 'quantity': 9, 'weight': 18.0},
                    {'description': 'Packaging Material', 'quantity': 5, 'weight': 10.0}
                ],
                'notes': 'Standard service',
                'tracking_info': {
                    'last_update': '2025-09-11T15:10:00',
                    'location': 'Pune',
                    'progress_percentage': 100,
                    'status_history': [
                        {'status': 'Processing', 'timestamp': '2025-09-07T11:00:00', 'location': 'Bangalore', 'message': 'Order created'},
                        {'status': 'In Transit', 'timestamp': '2025-09-08T09:30:00', 'location': 'Bangalore Hub', 'message': 'Dispatched'},
                        {'status': 'Delivered', 'timestamp': '2025-09-11T15:10:00', 'location': 'Pune', 'message': 'Delivered'}
                    ]
                }
            },
            {
                'id': 'SHP-Y5Z6A7B8',
                'origin': 'Bangalore Distribution Center',
                'destination': 'Ahmedabad',
                'status': 'Delivered',
                'items_count': 20,
                'total_weight': 40.0,
                'cost': 5200.0,
                'transport_mode': 'road',
                'priority': 'standard',
                'created_date': '2025-09-08',
                'shipped_date': '2025-09-09',
                'eta': '2025-09-12',
                'actual_delivery': '2025-09-12',  # on time
                'items': [
                    {'description': 'Consumer Electronics', 'quantity': 12, 'weight': 26.0},
                    {'description': 'Accessories', 'quantity': 8, 'weight': 14.0}
                ],
                'notes': 'Regular delivery',
                'tracking_info': {
                    'last_update': '2025-09-12T18:00:00',
                    'location': 'Ahmedabad',
                    'progress_percentage': 100,
                    'status_history': [
                        {'status': 'Processing', 'timestamp': '2025-09-08T10:30:00', 'location': 'Bangalore', 'message': 'Scheduled'},
                        {'status': 'In Transit', 'timestamp': '2025-09-09T13:00:00', 'location': 'Bangalore Hub', 'message': 'Dispatched'},
                        {'status': 'Delivered', 'timestamp': '2025-09-12T18:00:00', 'location': 'Ahmedabad', 'message': 'Delivered'}
                    ]
                }
            },
            {
                'id': 'SHP-C9D0E1F2',
                'origin': 'Bangalore Distribution Center',
                'destination': 'Jaipur',
                'status': 'Delivered',
                'items_count': 16,
                'total_weight': 34.0,
                'cost': 6000.0,
                'transport_mode': 'rail',
                'priority': 'standard',
                'created_date': '2025-09-06',
                'shipped_date': '2025-09-06',
                'eta': '2025-09-09',
                'actual_delivery': '2025-09-09',  # on time
                'items': [
                    {'description': 'Textiles', 'quantity': 10, 'weight': 20.0},
                    {'description': 'Footwear', 'quantity': 6, 'weight': 14.0}
                ],
                'notes': 'Rail consignment',
                'tracking_info': {
                    'last_update': '2025-09-09T17:40:00',
                    'location': 'Jaipur',
                    'progress_percentage': 100,
                    'status_history': [
                        {'status': 'Processing', 'timestamp': '2025-09-06T07:30:00', 'location': 'Bangalore', 'message': 'Created'},
                        {'status': 'In Transit', 'timestamp': '2025-09-06T20:00:00', 'location': 'Bangalore Junction', 'message': 'Onboarded'},
                        {'status': 'Delivered', 'timestamp': '2025-09-09T17:40:00', 'location': 'Jaipur', 'message': 'Delivered'}
                    ]
                }
            },
            {
                'id': 'SHP-R1S2T3U4',
                'origin': 'Bangalore Distribution Center',
                'destination': 'Surat',
                'status': 'Delivered',
                'items_count': 19,
                'total_weight': 36.0,
                'cost': 4100.0,
                'transport_mode': 'road',
                'priority': 'standard',
                'created_date': '2025-09-09',
                'shipped_date': '2025-09-10',
                'eta': '2025-09-12',
                'actual_delivery': '2025-09-12',  # on time
                'items': [
                    {'description': 'Fabric Rolls', 'quantity': 9, 'weight': 20.0},
                    {'description': 'Dyes & Chemicals', 'quantity': 10, 'weight': 16.0}
                ],
                'notes': 'Surat textile market delivery',
                'tracking_info': {
                    'last_update': '2025-09-12T16:20:00',
                    'location': 'Surat',
                    'progress_percentage': 100,
                    'status_history': [
                        {'status': 'Processing', 'timestamp': '2025-09-09T12:00:00', 'location': 'Bangalore', 'message': 'Order created'},
                        {'status': 'In Transit', 'timestamp': '2025-09-10T09:00:00', 'location': 'Bangalore Hub', 'message': 'Dispatched'},
                        {'status': 'Delivered', 'timestamp': '2025-09-12T16:20:00', 'location': 'Surat', 'message': 'Delivered'}
                    ]
                }
            },
            {
                'id': 'SHP-V5W6X7Y8',
                'origin': 'Bangalore Distribution Center',
                'destination': 'Visakhapatnam',
                'status': 'Delivered',
                'items_count': 17,
                'total_weight': 38.0,
                'cost': 5900.0,
                'transport_mode': 'rail',
                'priority': 'standard',
                'created_date': '2025-09-06',
                'shipped_date': '2025-09-07',
                'eta': '2025-09-10',
                'actual_delivery': '2025-09-09',  # early/on time
                'items': [
                    {'description': 'Steel Components', 'quantity': 7, 'weight': 22.0},
                    {'description': 'Packing Cases', 'quantity': 10, 'weight': 16.0}
                ],
                'notes': 'Port-adjacent industry delivery',
                'tracking_info': {
                    'last_update': '2025-09-09T19:05:00',
                    'location': 'Visakhapatnam',
                    'progress_percentage': 100,
                    'status_history': [
                        {'status': 'Processing', 'timestamp': '2025-09-06T14:30:00', 'location': 'Bangalore', 'message': 'Scheduled'},
                        {'status': 'In Transit', 'timestamp': '2025-09-07T08:00:00', 'location': 'Bangalore Junction', 'message': 'Loaded on rail'},
                        {'status': 'Delivered', 'timestamp': '2025-09-09T19:05:00', 'location': 'Visakhapatnam', 'message': 'Delivered'}
                    ]
                }
            },
            {
                'id': 'SHP-Z9A0B1C2',
                'origin': 'Bangalore Distribution Center',
                'destination': 'Nagpur',
                'status': 'Delivered',
                'items_count': 21,
                'total_weight': 44.5,
                'cost': 4800.0,
                'transport_mode': 'road',
                'priority': 'standard',
                'created_date': '2025-09-12',
                'shipped_date': '2025-09-12',
                'eta': '2025-09-14',
                'actual_delivery': '2025-09-14',  # on time
                'items': [
                    {'description': 'FMCG Cartons', 'quantity': 15, 'weight': 30.0},
                    {'description': 'Promotional Materials', 'quantity': 6, 'weight': 14.5}
                ],
                'notes': 'End-of-week dispatch',
                'tracking_info': {
                    'last_update': '2025-09-14T18:10:00',
                    'location': 'Nagpur',
                    'progress_percentage': 100,
                    'status_history': [
                        {'status': 'Processing', 'timestamp': '2025-09-12T09:20:00', 'location': 'Bangalore', 'message': 'Order processed'},
                        {'status': 'In Transit', 'timestamp': '2025-09-12T12:40:00', 'location': 'Bangalore Hub', 'message': 'Dispatched'},
                        {'status': 'Delivered', 'timestamp': '2025-09-14T18:10:00', 'location': 'Nagpur', 'message': 'Delivered on schedule'}
                    ]
                }
            }
        ]
    
    def _generate_route_weather_points(self, o_geo: Dict, d_geo: Dict, origin_norm: str, destination_norm: str, transport_mode: str) -> List[Dict]:
        """Generate weather points along the route based on transport mode"""
        weather_points = []
        
        try:
            # Define number of points based on transport mode (increased for better coverage)
            if transport_mode == 'air':
                # For air transport: more points for long-distance flights
                num_points = 7
                point_labels = ['Origin Airport', 'Departure Zone', 'Climb Route', 'Cruise Altitude', 'Descent Route', 'Approach Zone', 'Destination Airport']
            elif transport_mode == 'sea':
                # For sea transport: more points for ocean crossings
                num_points = 6
                point_labels = ['Origin Port', 'Departure Waters', 'Coastal Route', 'Open Waters', 'Approach Waters', 'Destination Port']
            elif transport_mode == 'rail':
                # For rail transport: include more intermediate stations
                num_points = 6
                point_labels = ['Origin Station', 'Regional Hub', 'Major Junction', 'Mid Route Station', 'Approach Terminal', 'Destination Station']
            else:
                # For road transport: more highway checkpoints
                num_points = 6
                point_labels = ['Origin', 'City Exit', 'Highway Route', 'Mid Route', 'Destination Approach', 'Destination']
            
            # Calculate intermediate points
            lat_diff = d_geo['lat'] - o_geo['lat']
            lon_diff = d_geo['lon'] - o_geo['lon']
            
            print(f"Generating {num_points} weather points for {transport_mode} route: {origin_norm} -> {destination_norm}")
            
            for i in range(num_points):
                # Calculate position along the route (0 to 1)
                ratio = i / (num_points - 1) if num_points > 1 else 0
                
                # Calculate coordinates
                lat = o_geo['lat'] + (lat_diff * ratio)
                lon = o_geo['lon'] + (lon_diff * ratio)
                
                # Determine location label
                if i == 0:
                    position = f"{origin_norm}"
                    location_type = "origin"
                elif i == num_points - 1:
                    position = f"{destination_norm}"
                    location_type = "destination"
                else:
                    position = point_labels[i] if i < len(point_labels) else f'Route Point {i+1}'
                    location_type = "intermediate"
                
                # Try to get place name for intermediate points, fallback to coordinates
                place_name = self._get_place_name_or_coordinates(lat, lon, position, transport_mode)
                
                # Always fetch weather data (will fallback to mock if needed)
                weather_data = self.fetch_weather_by_coords(lat, lon)
                
                # Ensure weather data is valid
                if not weather_data or 'error' in weather_data:
                    print(f"Weather fetch failed for point {i+1}, using mock data")
                    weather_data = self._get_mock_weather_coords(lat, lon)
                
                weather_point = {
                    'position': place_name,
                    'coordinates': {'lat': round(lat, 4), 'lon': round(lon, 4)},
                    'location_type': location_type,
                    'transport_context': point_labels[i] if i < len(point_labels) else f'Point {i+1}',
                    'weather': weather_data
                }
                
                weather_points.append(weather_point)
                
                # Debug print
                temp = weather_data.get('temp_c', 'N/A')
                condition = weather_data.get('weather', 'unknown')
                print(f"  Point {i+1}/{num_points}: {place_name} - {condition} {temp}°C")
            
            print(f"Successfully generated {len(weather_points)} weather points")
            
        except Exception as e:
            print(f"Error generating weather points: {e}")
            import traceback
            traceback.print_exc()
            
            # Fallback: create guaranteed basic points with mock weather
            print("Creating fallback weather points...")
            weather_points = []
            fallback_points = [
                {'name': origin_norm, 'lat': o_geo.get('lat', 0), 'lon': o_geo.get('lon', 0), 'type': 'origin'},
                {'name': f'Mid Route', 'lat': (o_geo.get('lat', 0) + d_geo.get('lat', 0))/2, 'lon': (o_geo.get('lon', 0) + d_geo.get('lon', 0))/2, 'type': 'intermediate'},
                {'name': destination_norm, 'lat': d_geo.get('lat', 0), 'lon': d_geo.get('lon', 0), 'type': 'destination'}
            ]
            
            for i, point in enumerate(fallback_points):
                weather_points.append({
                    'position': point['name'],
                    'coordinates': {'lat': round(point['lat'], 4), 'lon': round(point['lon'], 4)},
                    'location_type': point['type'],
                    'transport_context': point['name'],
                    'weather': self._get_mock_weather_coords(point['lat'], point['lon'])
                })
        
        # Ensure we always return at least some weather points
        if not weather_points:
            print("No weather points generated, creating minimal fallback")
            weather_points = [{
                'position': f"{origin_norm} to {destination_norm}",
                'coordinates': {'lat': 0, 'lon': 0},
                'location_type': 'route',
                'transport_context': 'Route',
                'weather': self._get_mock_weather_coords(0, 0)
            }]
        
        return weather_points
    
    def _get_place_name_or_coordinates(self, lat: float, lon: float, fallback_label: str, transport_mode: str) -> str:
        """Get real place name for coordinates using reverse geocoding"""
        try:
            # First try to get real place name via reverse geocoding
            real_place = self._reverse_geocode(lat, lon)
            if real_place:
                return real_place
                
            # Fallback to coordinate-based labels with context
            if transport_mode == 'sea':
                if abs(lat) < 60:  # Not polar regions
                    lat_dir = 'N' if lat >= 0 else 'S'
                    lon_dir = 'E' if lon >= 0 else 'W'
                    return f"Ocean Point ({abs(lat):.1f}°{lat_dir}, {abs(lon):.1f}°{lon_dir})"
                else:
                    return f"Polar Waters ({lat:.1f}°, {lon:.1f}°)"
            elif transport_mode == 'air':
                lat_dir = 'N' if lat >= 0 else 'S'
                lon_dir = 'E' if lon >= 0 else 'W'
                return f"Airspace ({abs(lat):.1f}°{lat_dir}, {abs(lon):.1f}°{lon_dir})"
            else:
                # For road/rail, show nearby landmark or coordinates
                lat_dir = 'N' if lat >= 0 else 'S'
                lon_dir = 'E' if lon >= 0 else 'W'
                return f"Route Point ({abs(lat):.1f}°{lat_dir}, {abs(lon):.1f}°{lon_dir})"
        except Exception as e:
            print(f"Error getting place name for {lat},{lon}: {e}")
            return f"{fallback_label}"

    def _reverse_geocode(self, lat: float, lon: float) -> Optional[str]:
        """Get place name from coordinates using reverse geocoding"""
        try:
            cache_key = f"reverse_geocode_{lat:.3f}_{lon:.3f}"
            
            with self._cache_lock:
                if cache_key in self._cache:
                    return self._cache[cache_key]
            
            # Use Nominatim for reverse geocoding
            url = "https://nominatim.openstreetmap.org/reverse"
            params = {
                'lat': lat,
                'lon': lon,
                'format': 'json',
                'zoom': 10,  # City level
                'addressdetails': 1
            }
            
            headers = {'User-Agent': 'SCM-Logistics/1.0'}
            response = requests.get(url, params=params, headers=headers, timeout=8)
            
            if response.status_code == 200:
                data = response.json()
                if data and 'display_name' in data:
                    # Extract meaningful location parts
                    address = data.get('address', {})
                    
                    # Priority order for location naming
                    place_name = None
                    if address.get('city'):
                        place_name = address['city']
                    elif address.get('town'):
                        place_name = address['town']
                    elif address.get('village'):
                        place_name = address['village']
                    elif address.get('county'):
                        place_name = address['county']
                    elif address.get('state'):
                        place_name = address['state']
                    
                    # Add state for context if we have city
                    if place_name and address.get('state') and place_name != address['state']:
                        if len(place_name) + len(address['state']) < 25:  # Keep names reasonable
                            place_name = f"{place_name}, {address['state']}"
                    
                    if place_name:
                        with self._cache_lock:
                            self._cache[cache_key] = place_name
                        return place_name
            
            # Rate limiting - wait a bit between calls
            import time
            time.sleep(0.2)
            
        except Exception as e:
            print(f"Reverse geocoding error for {lat},{lon}: {e}")
        
        return None