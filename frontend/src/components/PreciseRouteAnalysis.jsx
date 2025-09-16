import React, { useState } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const PreciseRouteAnalysis = ({ onClose }) => {
  const [formData, setFormData] = useState({
    origin: '',
    destination: '',
    transport_mode: 'road',
    weight: 10
  });
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAnalyze = async () => {
    if (!formData.origin || !formData.destination) {
      setError('Please enter both origin and destination');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/logistics/routes/precise-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();
      
      if (result.success) {
        setAnalysis(result.analysis);
      } else {
        setError(result.error || 'Analysis failed');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (hours) => {
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 24) return `${hours.toFixed(1)} hrs`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours.toFixed(1)}h`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" style={{left: 0, right: 0, top: 0, bottom: 0}}>
      <div className="bg-[--background] rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto relative z-[10000]">
        <div className="px-6 py-4 border-b border-[--border] flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[--foreground] flex items-center">
            <i className="fas fa-route mr-2 text-[--primary]"></i>
            Precise Route Analysis
          </h2>
          <button onClick={onClose} className="text-[--muted-foreground] hover:text-[--foreground]">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-6">
          {/* Input Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2">Origin</label>
              <input
                type="text"
                value={formData.origin}
                onChange={(e) => setFormData(prev => ({...prev, origin: e.target.value}))}
                className="w-full px-3 py-2 border border-[--border] rounded-md bg-[--sidebar] text-[--foreground]"
                placeholder="Enter origin city"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Destination</label>
              <input
                type="text"
                value={formData.destination}
                onChange={(e) => setFormData(prev => ({...prev, destination: e.target.value}))}
                className="w-full px-3 py-2 border border-[--border] rounded-md bg-[--sidebar] text-[--foreground]"
                placeholder="Enter destination city"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Transport Mode</label>
              <select
                value={formData.transport_mode}
                onChange={(e) => setFormData(prev => ({...prev, transport_mode: e.target.value}))}
                className="w-full px-3 py-2 border border-[--border] rounded-md bg-[--sidebar] text-[--foreground]"
              >
                <option value="road">Road</option>
                <option value="rail">Rail</option>
                <option value="air">Air</option>
                <option value="sea">Sea</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Weight (kg)</label>
              <input
                type="number"
                value={formData.weight}
                onChange={(e) => setFormData(prev => ({...prev, weight: parseFloat(e.target.value) || 10}))}
                className="w-full px-3 py-2 border border-[--border] rounded-md bg-[--sidebar] text-[--foreground]"
                min="0.1"
                step="0.1"
              />
            </div>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="px-6 py-2 bg-[--primary] text-[--primary-foreground] rounded-md hover:opacity-90 disabled:opacity-50 mb-6"
          >
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Analyzing...
              </>
            ) : (
              <>
                <i className="fas fa-search mr-2"></i>
                Analyze Route
              </>
            )}
          </button>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {analysis && (
            <div className="space-y-6">
              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">Distance</p>
                      <p className="text-xl font-semibold text-[--foreground]">{analysis.distance_km} km</p>
                      <p className="text-xs text-[--muted-foreground] capitalize">{analysis.route_geometry ? 'Map-based' : 'Direct'}</p>
                    </div>
                    <i className="fas fa-route text-[--primary] text-xl"></i>
                  </div>
                </div>

                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">AI Time</p>
                      <p className="text-xl font-semibold text-[--foreground]">
                        {formatTime(analysis.ai_predictions?.estimated_time_hours || analysis.duration_hours)}
                      </p>
                    </div>
                    <i className="fas fa-robot text-blue-500 text-xl"></i>
                  </div>
                </div>

                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">AI Cost</p>
                      <p className="text-xl font-semibold text-[--foreground]">
                        ₹{analysis.ai_predictions?.estimated_cost_inr?.toLocaleString() || 'N/A'}
                      </p>
                    </div>
                    <i className="fas fa-rupee-sign text-green-500 text-xl"></i>
                  </div>
                </div>

                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">Mode</p>
                      <p className="text-xl font-semibold text-[--foreground] capitalize">{analysis.transport_mode}</p>
                      <p className="text-xs text-[--muted-foreground]">{analysis.weight_kg} kg</p>
                    </div>
                    <i className={`fas fa-${analysis.transport_mode === 'road' ? 'truck' : analysis.transport_mode === 'rail' ? 'train' : analysis.transport_mode === 'air' ? 'plane' : 'ship'} text-orange-500 text-xl`}></i>
                  </div>
                </div>
              </div>

              {/* Cost Breakdown */}
              {analysis.ai_predictions && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-800 mb-3 flex items-center">
                    <i className="fas fa-calculator mr-2"></i>
                    AI Cost Breakdown
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-green-600">Fuel:</span>
                      <div className="font-medium">₹{analysis.ai_predictions.fuel_cost_inr?.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-green-600">Driver:</span>
                      <div className="font-medium">₹{analysis.ai_predictions.driver_cost_inr?.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-green-600">Tolls:</span>
                      <div className="font-medium">₹{analysis.ai_predictions.toll_cost_inr?.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-green-600">Total:</span>
                      <div className="font-medium text-lg">₹{analysis.ai_predictions.estimated_cost_inr?.toLocaleString()}</div>
                    </div>
                  </div>
                  {analysis.ai_predictions.cost_breakdown_explanation && (
                    <p className="text-green-700 text-sm mt-3">{analysis.ai_predictions.cost_breakdown_explanation}</p>
                  )}
                </div>
              )}

              {/* Risk Factors */}
              {analysis.ai_predictions?.risk_factors && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-semibold text-yellow-800 mb-3 flex items-center">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    Risk Assessment
                  </h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {analysis.ai_predictions.risk_factors.map((risk, index) => (
                      <span key={index} className="px-2 py-1 bg-yellow-200 text-yellow-800 rounded text-sm capitalize">
                        {risk.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                  {analysis.ai_predictions.time_factors && (
                    <p className="text-yellow-700 text-sm">
                      <strong>Time Factors:</strong> {analysis.ai_predictions.time_factors}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PreciseRouteAnalysis;