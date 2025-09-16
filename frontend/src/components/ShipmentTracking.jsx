import React, { useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import '@fortawesome/fontawesome-free/css/all.min.css';
import 'leaflet/dist/leaflet.css';

const STATUS_COLORS = {
  'processing': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200' },
  'in transit': { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
  'delivered': { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
  'delayed': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
  'cancelled': { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' },
};

const getStatusColors = (status) => {
  return STATUS_COLORS[status.toLowerCase()] || STATUS_COLORS['processing'];
};

export default function ShipmentTracking({ 
  shipment,
  onClose,
  className = ''
}) {
  const [activeTab, setActiveTab] = useState('map');

  if (!shipment) return null;

  const origin = shipment.route?.[0];
  const destination = shipment.route?.[shipment.route.length - 1];
  const currentLocation = shipment.current_location || origin;

  const renderStatus = (status) => {
    const colors = getStatusColors(status);
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
        {status}
      </span>
    );
  };

  const renderTimeline = () => {
    const statusHistory = shipment.status_updates || shipment.tracking_info?.status_history || [];
    
    return (
      <div className="flow-root">
        <ul role="list" className="-mb-8">
          {statusHistory.map((update, idx) => {
            const isCompleted = idx < statusHistory.length - 1 || update.status === 'Delivered';
            const isCurrent = idx === statusHistory.length - 1 && update.status !== 'Delivered';
            
            return (
              <li key={update.id || idx}>
                <div className="relative pb-8">
                  {idx !== statusHistory.length - 1 ? (
                    <span className={`absolute left-4 top-4 -ml-px h-full w-0.5 ${
                      isCompleted ? 'bg-[--primary]' : 'bg-[--border]'
                    }`} aria-hidden="true" />
                  ) : null}
                  <div className="relative flex space-x-3">
                    <div>
                      <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-[--background] ${
                        isCurrent ? 'bg-[--primary] animate-pulse' :
                        isCompleted ? 'bg-[--primary]' : 'bg-[--muted]'
                      }`}>
                        <i className={`fas fa-${
                          update.status === 'Processing' ? 'cog' :
                          update.status === 'In Transit' ? 'truck' :
                          update.status === 'Out for Delivery' ? 'shipping-fast' :
                          update.status === 'Delivered' ? 'check' :
                          update.icon || 'circle'
                        } text-xs ${
                          isCurrent || isCompleted ? 'text-[--primary-foreground]' : 'text-[--muted-foreground]'
                        }`}></i>
                      </span>
                    </div>
                    <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                      <div>
                        <p className={`text-sm font-medium ${
                          isCurrent ? 'text-[--primary]' : 'text-[--foreground]'
                        }`}>
                          {update.message || `Status: ${update.status}`}
                        </p>
                        {update.location && (
                          <p className="text-sm text-[--muted-foreground] mt-0.5">
                            <i className="fas fa-map-marker-alt mr-1"></i>
                            {update.location}
                          </p>
                        )}
                        {isCurrent && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[--primary]/10 text-[--primary] mt-1">
                            Current Status
                          </span>
                        )}
                      </div>
                      <div className="whitespace-nowrap text-right text-sm text-[--muted-foreground]">
                        {new Date(update.timestamp).toLocaleDateString()}
                        <div className="text-xs">
                          {new Date(update.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        
        {/* Progress Summary */}
        <div className="mt-6 p-4 bg-[--muted]/30 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm font-semibold">{shipment.tracking_info?.progress_percentage || 0}%</span>
          </div>
          <div className="w-full bg-[--muted] rounded-full h-2">
            <div 
              className="bg-[--primary] h-2 rounded-full transition-all duration-500" 
              style={{width: `${shipment.tracking_info?.progress_percentage || 0}%`}}
            ></div>
          </div>
        </div>
      </div>
    );
  };

  const renderDetails = () => {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Shipment Info */}
        <div className="bg-[--sidebar] rounded-lg p-4 border border-[--border]">
          <h4 className="text-sm font-medium mb-4">Shipment Information</h4>
          <dl className="grid grid-cols-1 gap-2">
            <div className="flex justify-between py-1">
              <dt className="text-sm text-[--muted-foreground]">Tracking ID</dt>
              <dd className="text-sm font-medium">{shipment.tracking_id}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-sm text-[--muted-foreground]">Status</dt>
              <dd>{renderStatus(shipment.status)}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-sm text-[--muted-foreground]">Created</dt>
              <dd className="text-sm">{new Date(shipment.created_date).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between py-1">
              <dt className="text-sm text-[--muted-foreground]">ETA</dt>
              <dd className="text-sm">{new Date(shipment.eta).toLocaleDateString()}</dd>
            </div>
          </dl>
        </div>

        {/* Route Info */}
        <div className="bg-[--sidebar] rounded-lg p-4 border border-[--border]">
          <h4 className="text-sm font-medium mb-4">Route Information</h4>
          <dl className="grid grid-cols-1 gap-2">
            <div className="py-1">
              <dt className="text-sm text-[--muted-foreground] mb-1">Origin</dt>
              <dd className="text-sm font-medium">{shipment.origin}</dd>
            </div>
            <div className="py-1">
              <dt className="text-sm text-[--muted-foreground] mb-1">Destination</dt>
              <dd className="text-sm font-medium">{shipment.destination}</dd>
            </div>
            <div className="py-1">
              <dt className="text-sm text-[--muted-foreground] mb-1">Transport Mode</dt>
              <dd className="flex items-center gap-2">
                <i className={`fas fa-${
                  shipment.transport_mode === 'road' ? 'truck' :
                  shipment.transport_mode === 'rail' ? 'train' :
                  shipment.transport_mode === 'air' ? 'plane' :
                  shipment.transport_mode === 'sea' ? 'ship' : 'truck'
                } text-[--primary]`}></i>
                <span className="text-sm font-medium capitalize">{shipment.transport_mode || 'Road'}</span>
              </dd>
            </div>
            <div className="py-1">
              <dt className="text-sm text-[--muted-foreground] mb-1">Priority</dt>
              <dd>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  shipment.priority === 'urgent' ? 'bg-red-100 text-red-600' :
                  shipment.priority === 'express' ? 'bg-yellow-100 text-yellow-600' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {shipment.priority || 'Standard'}
                </span>
              </dd>
            </div>
            <div className="py-1">
              <dt className="text-sm text-[--muted-foreground] mb-1">Provider</dt>
              <dd className="text-sm font-medium">{shipment.provider}</dd>
            </div>
          </dl>
        </div>

        {/* Items */}
        <div className="sm:col-span-2 bg-[--sidebar] rounded-lg p-4 border border-[--border]">
          <h4 className="text-sm font-medium mb-4 flex items-center">
            <i className="fas fa-boxes mr-2 text-[--primary]"></i>
            Shipment Items ({shipment.items?.length || 0})
          </h4>
          {shipment.items && shipment.items.length > 0 ? (
            <div className="space-y-3">
              {shipment.items.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-[--background] rounded border">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{item.description}</div>
                    <div className="text-xs text-[--muted-foreground] mt-1">
                      Qty: {item.quantity} • Weight: {item.weight} kg
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{item.quantity}x</div>
                    <div className="text-xs text-[--muted-foreground]">{item.weight} kg</div>
                  </div>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-[--border]">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">Total Items:</span>
                  <span>{shipment.items.reduce((sum, item) => sum + item.quantity, 0)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="font-medium">Total Weight:</span>
                  <span>{shipment.items.reduce((sum, item) => sum + item.weight, 0)} kg</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-[--muted-foreground]">
              <i className="fas fa-box-open text-2xl mb-2"></i>
              <p className="text-sm">No item details available</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`fixed inset-0 bg-black/50 flex items-center justify-center z-50 ${className}`}>
      <div className="bg-[--background] rounded-lg shadow-xl w-full max-w-6xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[--border] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[--foreground] flex items-center">
              <i className="fas fa-shipping-fast mr-2 text-[--primary]"></i>
              Tracking {shipment.tracking_id}
            </h2>
            <p className="text-sm text-[--muted-foreground] mt-1 flex items-center">
              <i className="fas fa-route mr-2"></i>
              {shipment.origin} → {shipment.destination}
            </p>
            <div className="flex items-center gap-4 mt-2">
              {renderStatus(shipment.status)}
              <span className="text-xs text-[--muted-foreground]">
                Progress: {shipment.tracking_info?.progress_percentage || 0}%
              </span>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-[--muted-foreground] hover:text-[--foreground]"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 py-2 border-b border-[--border]">
          <nav className="flex gap-4">
            <button
              className={`px-1 py-2 text-sm font-medium border-b-2 ${
                activeTab === 'map'
                  ? 'border-[--primary] text-[--primary]'
                  : 'border-transparent text-[--muted-foreground] hover:text-[--foreground] hover:border-[--border]'
              }`}
              onClick={() => setActiveTab('map')}
            >
              <i className="fas fa-map-marked-alt mr-2"></i>
              Live Tracking
            </button>
            <button
              className={`px-1 py-2 text-sm font-medium border-b-2 ${
                activeTab === 'timeline'
                  ? 'border-[--primary] text-[--primary]'
                  : 'border-transparent text-[--muted-foreground] hover:text-[--foreground] hover:border-[--border]'
              }`}
              onClick={() => setActiveTab('timeline')}
            >
              <i className="fas fa-history mr-2"></i>
              Status Timeline
            </button>
            <button
              className={`px-1 py-2 text-sm font-medium border-b-2 ${
                activeTab === 'details'
                  ? 'border-[--primary] text-[--primary]'
                  : 'border-transparent text-[--muted-foreground] hover:text-[--foreground] hover:border-[--border]'
              }`}
              onClick={() => setActiveTab('details')}
            >
              <i className="fas fa-info-circle mr-2"></i>
              Shipment Details
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'map' && origin && destination && (
            <div className="h-[600px] rounded-lg overflow-hidden border border-[--border]">
              <MapContainer
                center={currentLocation}
                zoom={5}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                
                {/* Origin Marker */}
                <Marker position={origin}>
                  <Popup>
                    <div className="font-medium">Origin</div>
                    <div className="text-sm text-[--muted-foreground]">{shipment.origin}</div>
                  </Popup>
                </Marker>

                {/* Destination Marker */}
                <Marker position={destination}>
                  <Popup>
                    <div className="font-medium">Destination</div>
                    <div className="text-sm text-[--muted-foreground]">{shipment.destination}</div>
                  </Popup>
                </Marker>

                {/* Current Location Marker */}
                {currentLocation && (
                  <Marker position={currentLocation}>
                    <Popup>
                      <div className="font-medium">Current Location</div>
                      <div className="text-sm text-[--muted-foreground]">{shipment.current_location_name}</div>
                    </Popup>
                  </Marker>
                )}

                {/* Route Line */}
                {shipment.route && (
                  <Polyline 
                    positions={shipment.route}
                    color="#3b82f6"
                    weight={3}
                  />
                )}
              </MapContainer>
            </div>
          )}

          {activeTab === 'timeline' && renderTimeline()}

          {activeTab === 'details' && renderDetails()}
        </div>
      </div>
    </div>
  );
}