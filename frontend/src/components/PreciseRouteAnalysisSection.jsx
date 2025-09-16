import React, { useState } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const PreciseRouteAnalysisSection = () => {
  const [formData, setFormData] = useState({
    origin: '',
    destination: '',
    transport_mode: '',
    weight: ''
  });
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleAnalyze = async () => {
    if (!formData.origin || !formData.destination || !formData.transport_mode || !formData.weight) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/logistics/routes/precise-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          weight: parseFloat(formData.weight) || 10
        })
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
    <div className="space-y-6">
      <div>
        <h4 className="font-medium mb-3 flex items-center">
          <i className="fas fa-route mr-2 text-green-500"></i>
          AI-Powered Distance & Cost Calculator
        </h4>
        <p className="text-sm text-[--muted-foreground] mb-4">
          Get precise map-based distances and AI-powered cost predictions using real Indian logistics data.
        </p>
      </div>

      {/* Input Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Origin</label>
          <input
            type="text"
            value={formData.origin}
            onChange={(e) => setFormData(prev => ({...prev, origin: e.target.value}))}
            className="w-full px-3 py-2 border border-[--border] rounded-md bg-[--background] text-[--foreground] text-sm"
            placeholder="e.g., Bangalore"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Destination</label>
          <input
            type="text"
            value={formData.destination}
            onChange={(e) => setFormData(prev => ({...prev, destination: e.target.value}))}
            className="w-full px-3 py-2 border border-[--border] rounded-md bg-[--background] text-[--foreground] text-sm"
            placeholder="e.g., Mumbai"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Transport Mode</label>
          <select
            value={formData.transport_mode}
            onChange={(e) => setFormData(prev => ({...prev, transport_mode: e.target.value}))}
            className="w-full px-3 py-2 border border-[--border] rounded-md bg-[--background] text-[--foreground] text-sm"
          >
            <option value="">Select transport mode</option>
            <option value="road">Road</option>
            <option value="rail">Rail</option>
            <option value="air">Air</option>
            <option value="sea">Sea</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Weight (kg)</label>
          <input
            type="number"
            value={formData.weight}
            onChange={(e) => setFormData(prev => ({...prev, weight: e.target.value}))}
            className="w-full px-3 py-2 border border-[--border] rounded-md bg-[--background] text-[--foreground] text-sm"
            placeholder="e.g., 25"
            min="0.1"
            step="0.1"
          />
        </div>
      </div>

      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="px-6 py-2 bg-green-500 text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {loading ? (
          <>
            <i className="fas fa-spinner fa-spin mr-2"></i>
            Analyzing Route...
          </>
        ) : (
          <>
            <i className="fas fa-calculator mr-2"></i>
            Get Precise Analysis
          </>
        )}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {analysis && (
        <div className="space-y-4">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[--background] p-4 rounded-lg border border-[--border]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[--muted-foreground]">Map Distance</p>
                  <p className="text-lg font-semibold text-[--foreground]">{analysis.distance_km} km</p>
                  <p className="text-xs text-green-600 capitalize">{analysis.route_geometry ? 'Precise' : 'Direct'}</p>
                </div>
                <i className="fas fa-route text-green-500 text-lg"></i>
              </div>
            </div>

            <div className="bg-[--background] p-4 rounded-lg border border-[--border]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[--muted-foreground]">AI Time</p>
                  <p className="text-lg font-semibold text-[--foreground]">
                    {formatTime(analysis.ai_predictions?.estimated_time_hours || analysis.duration_hours)}
                  </p>
                  <p className="text-xs text-blue-600">Smart Prediction</p>
                </div>
                <i className="fas fa-robot text-blue-500 text-lg"></i>
              </div>
            </div>

            <div className="bg-[--background] p-4 rounded-lg border border-[--border]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[--muted-foreground]">AI Cost</p>
                  <p className="text-lg font-semibold text-[--foreground]">
                    ₹{analysis.ai_predictions?.estimated_cost_inr?.toLocaleString() || 'N/A'}
                  </p>
                  <p className="text-xs text-green-600">All Inclusive</p>
                </div>
                <i className="fas fa-rupee-sign text-green-500 text-lg"></i>
              </div>
            </div>

            <div className="bg-[--background] p-4 rounded-lg border border-[--border]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-[--muted-foreground]">Efficiency</p>
                  <p className="text-lg font-semibold text-[--foreground]">
                    {analysis.ai_predictions?.fuel_cost_inr ? 
                      `${(analysis.distance_km / (analysis.ai_predictions.fuel_cost_inr / 100)).toFixed(1)} km/L` : 
                      'N/A'
                    }
                  </p>
                  <p className="text-xs text-orange-600">Fuel Economy</p>
                </div>
                <i className="fas fa-gas-pump text-orange-500 text-lg"></i>
              </div>
            </div>
          </div>

          {/* Cost Breakdown */}
          {analysis.ai_predictions && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h5 className="font-medium text-green-800 mb-3 flex items-center">
                <i className="fas fa-chart-pie mr-2"></i>
                Cost Breakdown
              </h5>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="text-center">
                  <div className="text-green-600 font-medium">₹{analysis.ai_predictions.fuel_cost_inr?.toLocaleString()}</div>
                  <div className="text-xs text-green-700">Fuel</div>
                </div>
                <div className="text-center">
                  <div className="text-green-600 font-medium">₹{analysis.ai_predictions.driver_cost_inr?.toLocaleString()}</div>
                  <div className="text-xs text-green-700">Driver</div>
                </div>
                <div className="text-center">
                  <div className="text-green-600 font-medium">₹{analysis.ai_predictions.toll_cost_inr?.toLocaleString()}</div>
                  <div className="text-xs text-green-700">Tolls</div>
                </div>
                <div className="text-center">
                  <div className="text-green-600 font-bold text-lg">₹{analysis.ai_predictions.estimated_cost_inr?.toLocaleString()}</div>
                  <div className="text-xs text-green-700">Total</div>
                </div>
              </div>
            </div>
          )}

          {/* Risk Factors */}
          {analysis.ai_predictions?.risk_factors && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h5 className="font-medium text-yellow-800 mb-2 flex items-center">
                <i className="fas fa-exclamation-triangle mr-2"></i>
                Risk Assessment
              </h5>
              <div className="flex flex-wrap gap-2">
                {analysis.ai_predictions.risk_factors.map((risk, index) => (
                  <span key={index} className="px-2 py-1 bg-yellow-200 text-yellow-800 rounded text-xs capitalize">
                    {risk.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PreciseRouteAnalysisSection;