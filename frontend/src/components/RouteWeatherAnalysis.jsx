import React, { useState, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const RouteWeatherAnalysis = ({ origin, destination, shipmentId, onClose }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (origin && destination) {
      fetchRouteAnalysis();
    }
  }, [origin, destination]);

  const fetchRouteAnalysis = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const endpoint = shipmentId 
        ? `/api/logistics/shipments/${shipmentId}/weather-analysis`
        : '/api/logistics/routes/weather-analysis';
      
      console.log(`Fetching route analysis: ${origin} -> ${destination}${shipmentId ? ` (Shipment: ${shipmentId})` : ''}`);
      
      const response = shipmentId 
        ? await fetch(endpoint)
        : await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ origin, destination }),
          });
      
      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log('Analysis result:', result);
      
      if (result.success) {
        setAnalysis(result.analysis);
      } else {
        // Even if marked as unsuccessful, try to use the analysis if available
        if (result.analysis) {
          setAnalysis(result.analysis);
        } else {
          setError(result.error || result.message || 'Failed to fetch route analysis');
        }
      }
    } catch (err) {
      console.error('Route analysis error:', err);
      setError('Network error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getWeatherIcon = (weather) => {
    const weatherLower = weather?.toLowerCase() || '';
    if (weatherLower.includes('rain') || weatherLower.includes('drizzle')) return 'cloud-rain';
    if (weatherLower.includes('snow')) return 'snowflake';
    if (weatherLower.includes('storm') || weatherLower.includes('thunder')) return 'bolt';
    if (weatherLower.includes('cloud')) return 'cloud';
    if (weatherLower.includes('clear') || weatherLower.includes('sunny')) return 'sun';
    if (weatherLower.includes('fog') || weatherLower.includes('mist')) return 'smog';
    return 'cloud-sun';
  };

  const getRiskColor = (riskLevel) => {
    switch (riskLevel?.toLowerCase()) {
      case 'high': return 'text-red-600 bg-red-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatTime = (hours) => {
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 24) return `${hours.toFixed(1)} hrs`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours.toFixed(1)}h`;
  };

  if (!origin || !destination) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]" style={{left: 0, right: 0, top: 0, bottom: 0}}>
      <div className="bg-[--background] rounded-lg shadow-xl w-full max-w-6xl mx-4 max-h-[90vh] overflow-y-auto relative z-[10000]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[--border] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[--foreground] flex items-center">
              <i className="fas fa-cloud-sun mr-2 text-[--primary]"></i>
              {shipmentId ? 'Shipment Weather Analysis' : 'Route Weather Analysis'}
            </h2>
            <p className="text-sm text-[--muted-foreground] mt-1">
              {shipmentId && <span className="font-medium text-[--primary]">{shipmentId}: </span>}
              {origin} → {destination}
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
          {loading ? (
            <div className="text-center py-8">
              <i className="fas fa-spinner fa-spin text-2xl text-[--primary] mb-4"></i>
              <p className="text-[--muted-foreground]">Analyzing route weather conditions...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <i className="fas fa-exclamation-triangle text-2xl text-red-500 mb-4"></i>
              <p className="text-red-600">{error}</p>
              <button 
                onClick={fetchRouteAnalysis}
                className="mt-4 px-4 py-2 bg-[--primary] text-[--primary-foreground] rounded-md hover:opacity-90"
              >
                Retry Analysis
              </button>
            </div>
          ) : analysis ? (
            <div className="space-y-6">
              {/* Delivery Estimate Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">Precise Distance</p>
                      <p className="text-xl font-semibold text-[--foreground]">
                        {analysis.precise_distance?.distance_km || analysis.route_info?.distance_km} km
                      </p>
                      {analysis.precise_distance?.method && (
                        <p className="text-xs text-[--muted-foreground] capitalize">
                          {analysis.precise_distance.method.replace('_', ' ')}
                        </p>
                      )}
                    </div>
                    <i className="fas fa-route text-[--primary] text-xl"></i>
                  </div>
                </div>

                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">AI Predicted Time</p>
                      <p className="text-xl font-semibold text-[--foreground]">
                        {analysis.precise_distance?.ai_predictions?.estimated_time_hours ? 
                          formatTime(analysis.precise_distance.ai_predictions.estimated_time_hours) :
                          formatTime(analysis.delivery_estimate?.base_hours)
                        }
                      </p>
                    </div>
                    <i className="fas fa-robot text-blue-500 text-xl"></i>
                  </div>
                </div>

                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">AI Predicted Cost</p>
                      <p className="text-xl font-semibold text-[--foreground]">
                        {analysis.precise_distance?.ai_predictions?.estimated_cost_inr ? 
                          `₹${analysis.precise_distance.ai_predictions.estimated_cost_inr.toLocaleString()}` :
                          'Calculating...'
                        }
                      </p>
                    </div>
                    <i className="fas fa-rupee-sign text-green-500 text-xl"></i>
                  </div>
                </div>

                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">Risk Level</p>
                      <span className={`px-2 py-1 rounded text-sm font-medium ${getRiskColor(analysis.weather_analysis?.route_conditions?.risk_level)}`}>
                        {analysis.weather_analysis?.route_conditions?.risk_level || 'Unknown'}
                      </span>
                    </div>
                    <i className="fas fa-exclamation-triangle text-yellow-500 text-xl"></i>
                  </div>
                </div>
              </div>

              {/* Weather Points Along Route */}
              {analysis.weather_analysis?.points && analysis.weather_analysis.points.length > 0 ? (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <i className="fas fa-map-marked-alt mr-2 text-[--primary]"></i>
                    Weather Along Route
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {analysis.weather_analysis.points.map((point, index) => (
                      <div key={index} className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">{point.position}</h4>
                          <i className={`fas fa-${getWeatherIcon(point.weather?.weather)} text-[--primary] text-lg`}></i>
                        </div>
                        
                        {point.weather && !point.weather.error ? (
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-[--muted-foreground]">Temperature:</span>
                              <span className="font-medium">{point.weather.temp_c}°C</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-[--muted-foreground]">Condition:</span>
                              <span className="font-medium capitalize">{point.weather.description}</span>
                            </div>
                            {point.weather.wind_speed && (
                              <div className="flex justify-between">
                                <span className="text-[--muted-foreground]">Wind:</span>
                                <span className="font-medium">{point.weather.wind_speed} m/s</span>
                              </div>
                            )}
                            {point.weather.visibility && (
                              <div className="flex justify-between">
                                <span className="text-[--muted-foreground]">Visibility:</span>
                                <span className="font-medium">{point.weather.visibility} km</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-sm text-red-500">Weather data unavailable</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold mb-2 flex items-center text-yellow-800">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    Weather Data Limited
                  </h3>
                  <p className="text-yellow-700 text-sm">
                    Detailed weather points are not available for this route. Using general weather conditions for analysis.
                  </p>
                </div>
              )}

              {/* AI Cost Breakdown */}
              {analysis.precise_distance?.ai_predictions && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-800 mb-3 flex items-center">
                    <i className="fas fa-calculator mr-2"></i>
                    AI Cost Breakdown
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-green-600">Fuel Cost:</span>
                      <div className="font-medium">₹{analysis.precise_distance.ai_predictions.fuel_cost_inr?.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-green-600">Driver Cost:</span>
                      <div className="font-medium">₹{analysis.precise_distance.ai_predictions.driver_cost_inr?.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-green-600">Toll Cost:</span>
                      <div className="font-medium">₹{analysis.precise_distance.ai_predictions.toll_cost_inr?.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-green-600">Total:</span>
                      <div className="font-medium text-lg">₹{analysis.precise_distance.ai_predictions.estimated_cost_inr?.toLocaleString()}</div>
                    </div>
                  </div>
                  {analysis.precise_distance.ai_predictions.cost_breakdown_explanation && (
                    <p className="text-green-700 text-sm mt-3">
                      {analysis.precise_distance.ai_predictions.cost_breakdown_explanation}
                    </p>
                  )}
                </div>
              )}

              {/* AI Insights */}
              {analysis.ai_insights && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-800 mb-3 flex items-center">
                    <i className="fas fa-robot mr-2"></i>
                    AI Analysis & Insights
                  </h3>
                  <div className="text-blue-700 text-sm whitespace-pre-line">
                    {analysis.ai_insights}
                  </div>
                </div>
              )}

              {/* AI Risk Factors */}
              {analysis.precise_distance?.ai_predictions?.risk_factors && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-semibold text-yellow-800 mb-3 flex items-center">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    AI Risk Assessment
                  </h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {analysis.precise_distance.ai_predictions.risk_factors.map((risk, index) => (
                      <span key={index} className="px-2 py-1 bg-yellow-200 text-yellow-800 rounded text-sm capitalize">
                        {risk.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                  {analysis.precise_distance.ai_predictions.time_factors && (
                    <p className="text-yellow-700 text-sm">
                      <strong>Time Factors:</strong> {analysis.precise_distance.ai_predictions.time_factors}
                    </p>
                  )}
                </div>
              )}

              {/* Recommendations */}
              {analysis.recommendations && analysis.recommendations.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h3 className="font-semibold text-green-800 mb-3 flex items-center">
                    <i className="fas fa-lightbulb mr-2"></i>
                    Recommendations
                  </h3>
                  <ul className="space-y-2">
                    {analysis.recommendations.map((rec, index) => (
                      <li key={index} className="text-green-700 text-sm flex items-start">
                        <i className="fas fa-check-circle mr-2 mt-0.5 text-green-600"></i>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Delivery Time Window */}
              {analysis.delivery_estimate?.estimated_delivery && (
                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <h3 className="font-semibold mb-3 flex items-center">
                    <i className="fas fa-calendar-alt mr-2 text-[--primary]"></i>
                    Estimated Delivery Window
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-[--muted-foreground]">Earliest:</span>
                      <div className="font-medium">{analysis.delivery_estimate.earliest}</div>
                    </div>
                    <div>
                      <span className="text-[--muted-foreground]">Estimated:</span>
                      <div className="font-medium text-[--primary]">{analysis.delivery_estimate.estimated}</div>
                    </div>
                    <div>
                      <span className="text-[--muted-foreground]">Latest:</span>
                      <div className="font-medium">{analysis.delivery_estimate.latest}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-[--border]">
                <button
                  onClick={() => {
                    // Export analysis with precise data
                    const exportData = {
                      route: `${origin} → ${destination}`,
                      shipment_id: shipmentId,
                      analysis_date: new Date().toISOString(),
                      precise_distance: analysis.precise_distance,
                      weather_analysis: analysis.weather_analysis,
                      ai_insights: analysis.ai_insights,
                      recommendations: analysis.recommendations
                    };
                    const dataStr = JSON.stringify(exportData, null, 2);
                    const dataBlob = new Blob([dataStr], {type: 'application/json'});
                    const url = URL.createObjectURL(dataBlob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `precise-analysis-${origin}-${destination}${shipmentId ? `-${shipmentId}` : ''}.json`;
                    link.click();
                  }}
                  className="px-4 py-2 border border-[--border] rounded-md hover:bg-[--sidebar] transition-colors"
                >
                  <i className="fas fa-download mr-2"></i>
                  Export Analysis
                </button>
                
                <button
                  onClick={fetchRouteAnalysis}
                  className="px-4 py-2 border border-[--border] rounded-md hover:bg-[--sidebar] transition-colors"
                >
                  <i className="fas fa-sync-alt mr-2"></i>
                  Refresh Analysis
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <i className="fas fa-question-circle text-2xl text-[--muted-foreground] mb-4"></i>
              <p className="text-[--muted-foreground]">No analysis data available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RouteWeatherAnalysis;