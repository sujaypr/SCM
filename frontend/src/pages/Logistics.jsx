import React, { useState, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import MapSelector from '../components/MapSelector';
import NewShipmentForm from '../components/NewShipmentForm';

import ShipmentTracking from '../components/ShipmentTracking';

import RouteOptimizer from '../components/RouteOptimizer';
import RouteWeatherAnalysis from '../components/RouteWeatherAnalysis';
import PreciseRouteAnalysis from '../components/PreciseRouteAnalysis';
import PreciseRouteAnalysisSection from '../components/PreciseRouteAnalysisSection';
import { exportToCSV, exportToExcel } from '../utils/exportUtils';

const Logistics = () => {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewShipmentForm, setShowNewShipmentForm] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    transport_mode: '',
    priority: '',
    search: ''
  });
  const [showRouteOptimizer, setShowRouteOptimizer] = useState(false);
  const [showWeatherAnalysis, setShowWeatherAnalysis] = useState(false);
  const [showPreciseAnalysis, setShowPreciseAnalysis] = useState(false);
  const [weatherRoute, setWeatherRoute] = useState({ origin: '', destination: '' });

  // Click outside handler for export menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      const menu = document.getElementById('exportMenu');
      const button = event.target.closest('button');
      if (menu && !menu.contains(event.target) && !button?.innerText.includes('Export Data')) {
        setShowExportMenu(false);
        menu.classList.add('hidden');
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchShipments();
    fetchAnalytics();
  }, []);

  useEffect(() => {
    fetchShipments();
  }, [filters]);

  const fetchShipments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.transport_mode) params.append('transport_mode', filters.transport_mode);
      if (filters.priority) params.append('priority', filters.priority);
      
      const response = await fetch(`/api/logistics/shipments?${params}`);
      const result = await response.json();

      if (result.success) {
        let filteredShipments = result.shipments;
        
        // Apply search filter on frontend
        if (filters.search) {
          const searchTerm = filters.search.toLowerCase();
          filteredShipments = filteredShipments.filter(shipment => 
            shipment.id.toLowerCase().includes(searchTerm) ||
            shipment.origin.toLowerCase().includes(searchTerm) ||
            shipment.destination.toLowerCase().includes(searchTerm)
          );
        }
        
        setShipments(filteredShipments);
      }
    } catch (error) {
      console.error('Error fetching shipments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await fetch('/api/logistics/analytics');
      const result = await response.json();
      if (result.success) {
        setAnalytics(result.analytics);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const getStatusColor = (status) => {
    switch(status.toLowerCase()) {
      case 'delivered': return 'green';
      case 'in transit': return 'blue';
      case 'processing': return 'orange';
      case 'cancelled': return 'red';
      default: return 'gray';
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
      <div className="mb-8 text-center">
        <h2 className="font-semibold text-[28px] mb-2">
          <i className="fas fa-truck mr-2 text-[--primary]"></i>
          Logistics Management
        </h2>
        <p className="text-[--muted-foreground] text-base">Track and manage your shipments and deliveries</p>
      </div>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="text-center p-5 rounded-[var(--radius)] border border-[--border] bg-[--sidebar] hover:shadow-md transition-shadow">
          <div className="text-2xl text-[--primary] mb-2"><i className="fas fa-box"></i></div>
          <h3 className="text-[--foreground] font-medium mb-2">Total Shipments</h3>
          <div className="text-xl font-semibold text-[--foreground]">{analytics?.total_shipments || shipments.length}</div>
          <div className="text-xs text-[--muted-foreground] mt-1">Active shipments</div>
        </div>

        <div className="text-center p-5 rounded-[var(--radius)] border border-[--border] bg-[--sidebar] hover:shadow-md transition-shadow">
          <div className="text-2xl text-[--chart-2] mb-2"><i className="fas fa-shipping-fast"></i></div>
          <h3 className="text-[--foreground] font-medium mb-2">In Transit</h3>
          <div className="text-xl font-semibold text-[--chart-2]">{analytics?.status_breakdown?.['In Transit'] || shipments.filter(s => s.status === 'In Transit').length}</div>
          <div className="text-xs text-[--muted-foreground] mt-1">Currently shipping</div>
        </div>

        <div className="text-center p-5 rounded-[var(--radius)] border border-[--border] bg-[--sidebar] hover:shadow-md transition-shadow">
          <div className="text-2xl text-[--chart-3] mb-2"><i className="fas fa-check-circle"></i></div>
          <h3 className="text-[--foreground] font-medium mb-2">On-Time Rate</h3>
          <div className="text-xl font-semibold text-[--chart-3]">{analytics?.on_time_delivery_rate || 95}%</div>
          <div className="text-xs text-[--muted-foreground] mt-1">Delivery performance</div>
        </div>

        <div className="text-center p-5 rounded-[var(--radius)] border border-[--border] bg-[--sidebar] hover:shadow-md transition-shadow">
          <div className="text-2xl text-[--primary] mb-2"><i className="fas fa-clock"></i></div>
          <h3 className="text-[--foreground] font-medium mb-2">Avg Delivery Time</h3>
          <div className="text-xl font-semibold text-[--foreground]">{analytics?.average_delivery_time_days || 4.2} days</div>
          <div className="text-xs text-[--muted-foreground] mt-1">Average duration</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          <select 
            value={filters.status}
            onChange={(e) => setFilters(prev => ({...prev, status: e.target.value}))}
            className="px-3 py-2 rounded-md bg-[--sidebar] text-[--foreground] border border-[--border] focus:ring-2 focus:ring-[--primary] focus:border-transparent"
          >
            <option value="">All Status</option>
            <option value="Processing">Processing</option>
            <option value="In Transit">In Transit</option>
            <option value="Out for Delivery">Out for Delivery</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
          </select>
          
          <select 
            value={filters.transport_mode}
            onChange={(e) => setFilters(prev => ({...prev, transport_mode: e.target.value}))}
            className="px-3 py-2 rounded-md bg-[--sidebar] text-[--foreground] border border-[--border] focus:ring-2 focus:ring-[--primary] focus:border-transparent"
          >
            <option value="">All Modes</option>
            <option value="road">Road</option>
            <option value="rail">Rail</option>
            <option value="air">Air</option>
            <option value="sea">Sea</option>
          </select>
          
          <select 
            value={filters.priority}
            onChange={(e) => setFilters(prev => ({...prev, priority: e.target.value}))}
            className="px-3 py-2 rounded-md bg-[--sidebar] text-[--foreground] border border-[--border] focus:ring-2 focus:ring-[--primary] focus:border-transparent"
          >
            <option value="">All Priority</option>
            <option value="standard">Standard</option>
            <option value="express">Express</option>
            <option value="urgent">Urgent</option>
          </select>
          
          <input 
            value={filters.search}
            onChange={(e) => setFilters(prev => ({...prev, search: e.target.value}))}
            className="px-3 py-2 rounded-md bg-[--sidebar] text-[--foreground] border border-[--border] placeholder-[--muted-foreground] focus:ring-2 focus:ring-[--primary] focus:border-transparent" 
            type="text" 
            placeholder="Search shipments..." 
          />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <button 
              onClick={() => document.getElementById('exportMenu').classList.toggle('hidden')}
              className="px-4 py-2 rounded-md border border-[--border] hover:bg-[--sidebar]"
            >
              <i className="fas fa-download mr-2"></i>
              Export Data
            </button>
            <div 
              id="exportMenu" 
              className="hidden absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-[--background] border border-[--border] z-10"
            >
              <div className="py-1">
                <button
                  onClick={() => {
                    const exportData = shipments.map(s => ({
                      ID: s.id,
                      Origin: s.origin,
                      Destination: s.destination,
                      Status: s.status,
                      'Created Date': s.created_date,
                      ETA: s.eta,
                      'Items Count': s.items_count,
                      Cost: s.cost
                    }));
                    exportToCSV(exportData, 'shipments.csv');
                  }}
                  className="block w-full px-4 py-2 text-sm text-left hover:bg-[--sidebar]"
                >
                  <i className="fas fa-file-csv mr-2"></i>
                  Export as CSV
                </button>
                <button
                  onClick={() => {
                    const exportData = shipments.map(s => ({
                      ID: s.id,
                      Origin: s.origin,
                      Destination: s.destination,
                      Status: s.status,
                      'Created Date': s.created_date,
                      ETA: s.eta,
                      'Items Count': s.items_count,
                      Cost: s.cost
                    }));
                    exportToExcel(exportData, 'shipments.xlsx');
                  }}
                  className="block w-full px-4 py-2 text-sm text-left hover:bg-[--sidebar]"
                >
                  <i className="fas fa-file-excel mr-2"></i>
                  Export as Excel
                </button>
              </div>
            </div>
          </div>
          <button 
            onClick={() => setShowNewShipmentForm(true)} 
            className="px-4 py-2 rounded-md bg-[--primary] text-[--primary-foreground] hover:opacity-90 transition-opacity">
            <i className="fas fa-plus mr-2"></i>New Shipment
          </button>
          
          <button 
            onClick={() => setShowRouteOptimizer(true)} 
            className="px-4 py-2 rounded-md border border-[--border] hover:bg-[--sidebar] transition-colors">
            <i className="fas fa-route mr-2"></i>Optimize Routes
          </button>
          
          <button 
            onClick={() => {
              setWeatherRoute({ origin: 'Bangalore', destination: 'Mumbai' });
              setShowWeatherAnalysis(true);
            }} 
            className="px-4 py-2 rounded-md border border-[--border] hover:bg-[--sidebar] transition-colors">
            <i className="fas fa-cloud-sun mr-2"></i>Weather Analysis
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center p-8 text-[--muted-foreground]">Loading shipments...</div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[--border] shadow">
          <table className="min-w-full bg-[--sidebar]">
            <thead>
              <tr>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Shipment ID</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Route</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Status</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Mode</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Priority</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Progress</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">ETA</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Cost</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(shipment => {
                const progress = shipment.tracking_info?.progress_percentage || 0;
                return (
                  <tr key={shipment.id} className="hover:bg-[--muted]/50 transition-colors">
                    <td className="p-4 border-b border-[--muted] text-[--foreground]">
                      <div className="font-semibold">{shipment.id}</div>
                      <div className="text-xs text-[--muted-foreground]">{shipment.created_date}</div>
                    </td>
                    <td className="p-4 border-b border-[--muted] text-[--foreground]">
                      <div className="text-sm">
                        <div className="font-medium">{shipment.origin}</div>
                        <div className="text-[--muted-foreground] text-xs">↓</div>
                        <div className="font-medium">{shipment.destination}</div>
                      </div>
                    </td>
                    <td className="p-4 border-b border-[--muted]">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                        getStatusColor(shipment.status) === 'green' ? 'bg-green-100 text-green-600' : 
                        getStatusColor(shipment.status) === 'blue' ? 'bg-blue-100 text-blue-600' : 
                        getStatusColor(shipment.status) === 'orange' ? 'bg-orange-100 text-orange-500' : 
                        'bg-red-100 text-red-600'
                      }`}>
                        {shipment.status}
                      </span>
                    </td>
                    <td className="p-4 border-b border-[--muted] text-[--foreground]">
                      <div className="flex items-center gap-1">
                        <i className={`fas fa-${
                          shipment.transport_mode === 'road' ? 'truck' :
                          shipment.transport_mode === 'rail' ? 'train' :
                          shipment.transport_mode === 'air' ? 'plane' :
                          shipment.transport_mode === 'sea' ? 'ship' : 'truck'
                        } text-[--muted-foreground]`}></i>
                        <span className="capitalize text-sm">{shipment.transport_mode || 'road'}</span>
                      </div>
                    </td>
                    <td className="p-4 border-b border-[--muted] text-[--foreground]">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        shipment.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                        shipment.priority === 'express' ? 'bg-yellow-100 text-yellow-600' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {shipment.priority || 'standard'}
                      </span>
                    </td>
                    <td className="p-4 border-b border-[--muted]">
                      <div className="w-full">
                        <div className="flex justify-between text-xs mb-1">
                          <span>{progress}%</span>
                        </div>
                        <div className="w-full bg-[--muted] rounded-full h-2">
                          <div 
                            className="bg-[--primary] h-2 rounded-full transition-all duration-300" 
                            style={{width: `${progress}%`}}
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 border-b border-[--muted] text-[--foreground]">
                      <div className="text-sm">{shipment.eta}</div>
                      {shipment.actual_delivery && (
                        <div className="text-xs text-green-600">Delivered: {shipment.actual_delivery}</div>
                      )}
                    </td>
                    <td className="p-4 border-b border-[--muted] text-[--foreground]">
                      <div className="font-semibold">₹{shipment.cost?.toLocaleString('en-IN')}</div>
                      <div className="text-xs text-[--muted-foreground]">{shipment.items_count} items</div>
                    </td>
                    <td className="p-4 border-b border-[--muted]">
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setSelectedShipment({
                            ...shipment,
                            tracking_id: shipment.id,
                            provider: 'FastFreight Ltd.',
                            route: [[20.5937, 78.9629], [12.9716, 77.5946]],
                            current_location: [15.5937, 78.2629],
                            current_location_name: shipment.tracking_info?.location || 'In Transit',
                            status_updates: shipment.tracking_info?.status_history || []
                          })} 
                          className="px-3 py-1 rounded border text-sm hover:bg-[--sidebar] transition-colors"
                        >
                          <i className="fas fa-map-marker-alt mr-1"></i>Track
                        </button>
                        <button 
                          onClick={() => {
                            setWeatherRoute({ origin: shipment.origin, destination: shipment.destination, shipmentId: shipment.id });
                            setShowWeatherAnalysis(true);
                          }}
                          className="px-3 py-1 rounded bg-blue-500 text-white text-sm hover:opacity-90 transition-opacity"
                          title="Analyze route weather"
                        >
                          <i className="fas fa-cloud-sun mr-1"></i>Weather
                        </button>
                        
                        <button className="px-3 py-1 rounded bg-[--primary] text-[--primary-foreground] text-sm hover:opacity-90 transition-opacity">
                          <i className="fas fa-info-circle mr-1"></i>Details
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <i className="fas fa-map mr-2 text-[--primary]"></i>
          Route Planner
        </h3>
        <MapSelector />
      </div>

      {/* Weather & News Section */}
      {/* Precise Route Analysis Section */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <i className="fas fa-calculator mr-2 text-[--primary]"></i>
          Precise Route Analysis
        </h3>
        <div className="bg-[--sidebar] p-6 rounded-lg border border-[--border]">
          <PreciseRouteAnalysisSection />
        </div>
      </div>





      {shipments.length === 0 && !loading && (
        <div className="text-center p-12 text-[--muted-foreground]">
          <div className="mb-4">
            <i className="fas fa-shipping-fast text-4xl text-[--muted-foreground] mb-4"></i>
          </div>
          <h3 className="mb-2 text-[--foreground] text-xl">No shipments found</h3>
          <p className="mb-4">Create your first shipment to start tracking deliveries</p>
          <button 
            onClick={() => setShowNewShipmentForm(true)}
            className="px-6 py-3 rounded-md bg-[--primary] text-[--primary-foreground] hover:opacity-90 transition-opacity"
          >
            <i className="fas fa-plus mr-2"></i>Create Shipment
          </button>
        </div>
      )}

      {showNewShipmentForm && (
        <NewShipmentForm 
          onClose={() => setShowNewShipmentForm(false)}
          onSuccess={(newShipment) => {
            fetchShipments();
            fetchAnalytics();
            setShowNewShipmentForm(false);
          }}
        />
      )}

      {selectedShipment && (
        <ShipmentTracking 
          shipment={selectedShipment}
          onClose={() => setSelectedShipment(null)}
        />
      )}

      {showRouteOptimizer && (
        <RouteOptimizer 
          onClose={() => setShowRouteOptimizer(false)}
        />
      )}

      {showWeatherAnalysis && (
        <RouteWeatherAnalysis 
          origin={weatherRoute.origin}
          destination={weatherRoute.destination}
          shipmentId={weatherRoute.shipmentId}
          onClose={() => setShowWeatherAnalysis(false)}
        />
      )}

      {showPreciseAnalysis && (
        <PreciseRouteAnalysis 
          onClose={() => setShowPreciseAnalysis(false)}
        />
      )}
    </div>
  );
};

export default Logistics;