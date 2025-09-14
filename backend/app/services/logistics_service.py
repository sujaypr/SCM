from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import uuid

class LogisticsService:
    """Service for logistics and shipment management"""

    def __init__(self):
        # In a real application, this would connect to database
        self._mock_shipments = self._get_mock_shipments()

    def get_shipments(self, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get all shipments with optional status filter"""

        shipments = self._mock_shipments.copy()

        if status_filter:
            shipments = [
                shipment for shipment in shipments 
                if shipment['status'].lower() == status_filter.lower()
            ]

        return shipments

    def create_shipment(self, shipment_data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new shipment"""

        # Generate shipment ID
        shipment_id = f"SHP-{uuid.uuid4().hex[:8].upper()}"

        # Calculate estimated delivery
        estimated_days = shipment_data.get('estimated_days', 4)
        estimated_delivery = (datetime.now() + timedelta(days=estimated_days)).date()

        # Calculate estimated cost
        weight = shipment_data.get('weight', 10.0)
        items_count = shipment_data.get('items_count', 1)
        distance_cost = self._calculate_distance_cost(
            shipment_data.get('origin', 'Bangalore'), 
            shipment_data['destination']
        )
        shipping_cost = self._calculate_shipping_cost(weight, items_count, distance_cost)

        new_shipment = {
            'id': shipment_id,
            'origin': shipment_data.get('origin', 'Bangalore Distribution Center'),
            'destination': shipment_data['destination'],
            'status': 'Processing',
            'items_count': items_count,
            'total_weight': weight,
            'cost': shipping_cost,
            'created_date': datetime.now().strftime('%Y-%m-%d'),
            'shipped_date': None,
            'eta': estimated_delivery.strftime('%Y-%m-%d'),
            'actual_delivery': None,
            'tracking_info': {
                'last_update': datetime.now().isoformat(),
                'location': shipment_data.get('origin', 'Bangalore'),
                'next_checkpoint': self._get_next_checkpoint(
                    shipment_data.get('origin', 'Bangalore'), 
                    shipment_data['destination']
                )
            }
        }

        self._mock_shipments.append(new_shipment)
        return new_shipment

    def get_shipment_by_id(self, shipment_id: str) -> Optional[Dict[str, Any]]:
        """Get specific shipment by ID"""

        for shipment in self._mock_shipments:
            if shipment['id'] == shipment_id:
                return shipment

        return None

    def update_shipment_status(self, shipment_id: str, new_status: str) -> Optional[Dict[str, Any]]:
        """Update shipment status"""

        for shipment in self._mock_shipments:
            if shipment['id'] == shipment_id:
                old_status = shipment['status']
                shipment['status'] = new_status

                # Update dates based on status
                now = datetime.now()

                if new_status == 'In Transit' and old_status == 'Processing':
                    shipment['shipped_date'] = now.strftime('%Y-%m-%d')
                elif new_status == 'Delivered':
                    shipment['actual_delivery'] = now.strftime('%Y-%m-%d')

                # Update tracking info
                shipment['tracking_info']['last_update'] = now.isoformat()
                shipment['tracking_info']['status_history'] = shipment.get('tracking_info', {}).get('status_history', [])
                shipment['tracking_info']['status_history'].append({
                    'status': new_status,
                    'timestamp': now.isoformat(),
                    'location': shipment['tracking_info'].get('location', 'Unknown')
                })

                return shipment

        return None

    def optimize_routes(self, destinations: List[str]) -> Dict[str, Any]:
        """Optimize delivery routes for multiple destinations"""

        # Simple route optimization algorithm
        # In a real application, this would use sophisticated routing algorithms

        optimized_order = self._simple_route_optimization(destinations)

        total_distance = self._calculate_total_distance(optimized_order)
        estimated_time = self._calculate_total_time(optimized_order)
        estimated_cost = self._calculate_route_cost(optimized_order)

        return {
            'optimized_route': optimized_order,
            'total_destinations': len(destinations),
            'total_distance_km': total_distance,
            'estimated_time_hours': estimated_time,
            'estimated_cost': estimated_cost,
            'savings': {
                'distance_saved_km': total_distance * 0.15,  # 15% optimization
                'time_saved_hours': estimated_time * 0.20,   # 20% time saving
                'cost_saved': estimated_cost * 0.15          # 15% cost saving
            },
            'route_details': [
                {
                    'sequence': i + 1,
                    'destination': dest,
                    'estimated_arrival': self._calculate_arrival_time(i, optimized_order),
                    'distance_from_previous': self._get_distance_between(
                        optimized_order[i-1] if i > 0 else 'Origin',
                        dest
                    )
                }
                for i, dest in enumerate(optimized_order)
            ]
        }

    def get_analytics(self) -> Dict[str, Any]:
        """Get logistics performance analytics"""

        total_shipments = len(self._mock_shipments)

        # Status breakdown
        status_counts = {}
        for shipment in self._mock_shipments:
            status = shipment['status']
            status_counts[status] = status_counts.get(status, 0) + 1

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

        return {
            'total_shipments': total_shipments,
            'status_breakdown': status_counts,
            'on_time_delivery_rate': round(on_time_rate, 1),
            'average_delivery_time_days': round(avg_delivery_time, 1),
            'total_shipping_cost': total_cost,
            'average_cost_per_shipment': round(avg_cost_per_shipment, 2),
            'performance_trends': {
                'last_30_days': {
                    'shipments': total_shipments,
                    'on_time_rate': round(on_time_rate, 1),
                    'avg_cost': round(avg_cost_per_shipment, 2)
                }
            }
        }

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

    def _calculate_shipping_cost(self, weight: float, items_count: int, distance_cost: float) -> float:
        """Calculate total shipping cost"""

        base_cost = 100  # Base handling charge
        weight_cost = weight * 15  # ₹15 per kg
        item_cost = items_count * 25  # ₹25 per item

        total_cost = base_cost + weight_cost + item_cost + distance_cost

        return round(total_cost, 2)

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

        total_distance = self._calculate_total_distance(route)
        return round(total_distance * 8 + len(route) * 200, 2)  # ₹8/km + ₹200/stop

    def _get_distance_between(self, origin: str, destination: str) -> float:
        """Get distance between two cities"""

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
        }

        key = (origin, destination)
        reverse_key = (destination, origin)

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
        """Get mock shipment data"""

        return [
            {
                'id': 'SHP-A1B2C3D4',
                'origin': 'Bangalore Distribution Center',
                'destination': 'Mumbai',
                'status': 'Delivered',
                'items_count': 25,
                'total_weight': 45.5,
                'cost': 4250.0,
                'created_date': '2025-09-08',
                'shipped_date': '2025-09-09',
                'eta': '2025-09-12',
                'actual_delivery': '2025-09-11',
                'tracking_info': {
                    'last_update': '2025-09-11T18:30:00',
                    'location': 'Mumbai',
                    'status': 'Delivered'
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
                'created_date': '2025-09-11',
                'shipped_date': '2025-09-11',
                'eta': '2025-09-13',
                'actual_delivery': None,
                'tracking_info': {
                    'last_update': '2025-09-12T14:20:00',
                    'location': 'En Route to Chennai',
                    'next_checkpoint': 'Chennai Hub'
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
                'created_date': '2025-09-12',
                'shipped_date': None,
                'eta': '2025-09-16',
                'actual_delivery': None,
                'tracking_info': {
                    'last_update': '2025-09-12T10:00:00',
                    'location': 'Bangalore Warehouse',
                    'status': 'Packaging in progress'
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
                'created_date': '2025-09-09',
                'shipped_date': '2025-09-09',
                'eta': '2025-09-11',
                'actual_delivery': '2025-09-10',
                'tracking_info': {
                    'last_update': '2025-09-10T16:45:00',
                    'location': 'Hyderabad',
                    'status': 'Delivered'
                }
            }
        ]