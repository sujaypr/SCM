import React, { useState } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const RouteOptimizer = ({ onClose }) => {
  const [destinations, setDestinations] = useState(['']);
  const [optimization, setOptimization] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addDestination = () => {
    setDestinations([...destinations, '']);
  };

  const removeDestination = (index) => {
    if (destinations.length > 1) {
      setDestinations(destinations.filter((_, i) => i !== index));
    }
  };

  const updateDestination = (index, value) => {
    const updated = [...destinations];
    updated[index] = value;
    setDestinations(updated);
  };

  const optimizeRoute = async () => {
    const validDestinations = destinations.filter(dest => dest.trim());
    
    if (validDestinations.length < 2) {
      setError('Please enter at least 2 destinations');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/logistics/routes/optimize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validDestinations),
      });

      const result = await response.json();

      if (result.success) {
        setOptimization(result.routes);
      } else {
        setError(result.message || 'Failed to optimize route');
      }
    } catch (err) {
      setError('Error optimizing route: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (hours) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)} min`;
    }
    return `${hours.toFixed(1)} hrs`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[--background] rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[--border] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[--foreground] flex items-center">
              <i className="fas fa-route mr-2 text-[--primary]"></i>
              Route Optimizer
            </h2>
            <p className="text-sm text-[--muted-foreground] mt-1">
              Optimize delivery routes for multiple destinations
            </p>
          </div>
          <button 
            onClick={onClose}
            className="text-[--muted-foreground] hover:text-[--foreground] transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Input Section */}
          <div className="mb-6">
            <h3 className="text-lg font-medium mb-4 flex items-center">
              <i className="fas fa-map-marked-alt mr-2 text-[--primary]"></i>
              Destinations
            </h3>
            
            <div className="space-y-3">
              {destinations.map((destination, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-[--primary] text-[--primary-foreground] rounded-full text-sm font-medium">
                    {index + 1}
                  </div>
                  <input
                    type="text"
                    value={destination}
                    onChange={(e) => updateDestination(index, e.target.value)}
                    placeholder={`Destination ${index + 1}`}
                    className="flex-1 px-3 py-2 bg-[--sidebar] border border-[--border] rounded-md focus:ring-2 focus:ring-[--primary] focus:border-transparent"
                  />
                  {destinations.length > 1 && (
                    <button
                      onClick={() => removeDestination(index)}
                      className="text-red-500 hover:text-red-600 p-2"
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={addDestination}
                className="px-4 py-2 border border-[--border] rounded-md hover:bg-[--sidebar] transition-colors"
              >
                <i className="fas fa-plus mr-2"></i>
                Add Destination
              </button>
              
              <button
                onClick={optimizeRoute}
                disabled={loading || destinations.filter(d => d.trim()).length < 2}
                className="px-6 py-2 bg-[--primary] text-[--primary-foreground] rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    Optimizing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-magic mr-2"></i>
                    Optimize Route
                  </>
                )}
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded-md">
                <i className="fas fa-exclamation-triangle mr-2"></i>
                {error}
              </div>
            )}
          </div>

          {/* Results Section */}
          {optimization && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">Total Distance</p>
                      <p className="text-xl font-semibold text-[--foreground]">
                        {optimization.total_distance_km} km
                      </p>
                    </div>
                    <i className="fas fa-road text-[--primary] text-xl"></i>
                  </div>
                </div>

                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">Est. Time</p>
                      <p className="text-xl font-semibold text-[--foreground]">
                        {formatTime(optimization.estimated_time_hours)}
                      </p>
                    </div>
                    <i className="fas fa-clock text-[--primary] text-xl"></i>
                  </div>
                </div>

                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">Est. Cost</p>
                      <p className="text-xl font-semibold text-[--foreground]">
                        ₹{optimization.estimated_cost?.toLocaleString('en-IN')}
                      </p>
                    </div>
                    <i className="fas fa-rupee-sign text-[--primary] text-xl"></i>
                  </div>
                </div>

                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">Destinations</p>
                      <p className="text-xl font-semibold text-[--foreground]">
                        {optimization.total_destinations}
                      </p>
                    </div>
                    <i className="fas fa-map-marker-alt text-[--primary] text-xl"></i>
                  </div>
                </div>
              </div>

              {/* Savings Information */}
              {optimization.savings && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-800 mb-3 flex items-center">
                    <i className="fas fa-leaf mr-2"></i>
                    Optimization Savings
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="text-green-700">
                      <span className="font-medium">Distance Saved:</span> {optimization.savings.distance_saved_km?.toFixed(1)} km
                    </div>
                    <div className="text-green-700">
                      <span className="font-medium">Time Saved:</span> {formatTime(optimization.savings.time_saved_hours)}
                    </div>
                    <div className="text-green-700">
                      <span className="font-medium">Cost Saved:</span> ₹{optimization.savings.cost_saved?.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              )}

              {/* Optimized Route */}
              <div>
                <h4 className="text-lg font-medium mb-4 flex items-center">
                  <i className="fas fa-list-ol mr-2 text-[--primary]"></i>
                  Optimized Route
                </h4>
                
                <div className="space-y-3">
                  <div className="flex items-center p-3 bg-[--sidebar] rounded-lg border border-[--border]">
                    <div className="flex items-center justify-center w-8 h-8 bg-green-500 text-white rounded-full text-sm font-medium mr-3">
                      <i className="fas fa-play"></i>
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">Starting Point</div>
                      <div className="text-sm text-[--muted-foreground]">Origin</div>
                    </div>
                  </div>

                  {optimization.route_details?.map((stop, index) => (
                    <div key={index} className="flex items-center">
                      <div className="w-8 flex justify-center">
                        <div className="w-0.5 h-6 bg-[--border]"></div>
                      </div>
                      <div className="flex-1 ml-3">
                        <div className="flex items-center p-3 bg-[--sidebar] rounded-lg border border-[--border]">
                          <div className="flex items-center justify-center w-8 h-8 bg-[--primary] text-[--primary-foreground] rounded-full text-sm font-medium mr-3">
                            {stop.sequence}
                          </div>
                          <div className="flex-1">
                            <div className="font-medium">{stop.destination}</div>
                            <div className="text-sm text-[--muted-foreground]">
                              ETA: {stop.estimated_arrival} • Distance: {stop.distance_from_previous} km
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium">Stop {stop.sequence}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-[--border]">
                <button
                  onClick={() => {
                    // Create shipments for optimized route
                    console.log('Creating shipments for optimized route:', optimization);
                  }}
                  className="px-6 py-2 bg-[--primary] text-[--primary-foreground] rounded-md hover:opacity-90 transition-opacity"
                >
                  <i className="fas fa-shipping-fast mr-2"></i>
                  Create Shipments
                </button>
                
                <button
                  onClick={() => {
                    // Export route details
                    const dataStr = JSON.stringify(optimization, null, 2);
                    const dataBlob = new Blob([dataStr], {type: 'application/json'});
                    const url = URL.createObjectURL(dataBlob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'optimized-route.json';
                    link.click();
                  }}
                  className="px-4 py-2 border border-[--border] rounded-md hover:bg-[--sidebar] transition-colors"
                >
                  <i className="fas fa-download mr-2"></i>
                  Export Route
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RouteOptimizer;