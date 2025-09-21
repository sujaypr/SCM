import React, { useState, useEffect, useRef } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const RouteWeatherAnalysis = ({ origin, destination, shipmentId, onClose }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveSnapshot, setLiveSnapshot] = useState(null);
  const [liveError, setLiveError] = useState(null);
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);
  const [frozenPoints, setFrozenPoints] = useState(null);
  const lastFetchKeyRef = useRef(null);

  // Only fetch once per unique route/shipment key; avoid StrictMode duplicate
  useEffect(() => {
    if (!origin || !destination) return;
    const key = `${shipmentId || ''}|${origin}|${destination}`;
    if (lastFetchKeyRef.current === key) {
      return; // prevent duplicate fetches on re-render
    }
    lastFetchKeyRef.current = key;
    fetchRouteAnalysis();
  }, [origin, destination, shipmentId]);

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
        // Freeze points on first successful fetch if available
        const initialPoints = (result.analysis?.weather_analysis?.points || result.analysis?.weather_points || []);
        if (initialPoints && initialPoints.length > 0) {
          setFrozenPoints(prev => prev || initialPoints);
        }
      } else {
        // Even if marked as unsuccessful, try to use the analysis if available
        if (result.analysis) {
          setAnalysis(result.analysis);
          const initialPoints = (result.analysis?.weather_analysis?.points || result.analysis?.weather_points || []);
          if (initialPoints && initialPoints.length > 0) {
            setFrozenPoints(prev => prev || initialPoints);
          }
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

  // Live polling for shipment-specific weather snapshot
  useEffect(() => {
    if (!shipmentId) return; // only for shipment modal
    let intervalId;
    let abort = false;
    let started = false;

    const fetchLive = async () => {
      try {
        setIsLiveUpdating(true);
        const resp = await fetch(`/api/logistics/shipments/${shipmentId}/weather-live`);
        const json = await resp.json();
        if (!abort) {
            if (json.success) {
              setLiveSnapshot(json.snapshot);
              // Freeze points if we don't already have them and live provides them
              const livePts = json.snapshot?.weather_points || [];
              if (livePts && livePts.length > 0) {
                setFrozenPoints(prev => prev || livePts);
              }
              setLiveError(null);
            } else {
              setLiveError(json.error || json.message || 'Live update failed');
            }
        }
      } catch (e) {
        if (!abort) setLiveError(e.message);
      } finally {
        if (!abort) setIsLiveUpdating(false);
      }
    };

    // initial fetch slight delay to allow base analysis to load
    const start = () => {
      if (started) return; // prevent duplicate intervals
      started = true;
      fetchLive();
      intervalId = setInterval(fetchLive, 45000); // 45s cadence
    };
    start();
    return () => { abort = true; if (intervalId) clearInterval(intervalId); started = false; };
  }, [shipmentId]);

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
      case 'high': return 'text-destructive bg-destructive/10';
      case 'medium': return 'text-warning bg-warning/10';
      case 'low': return 'text-success bg-success/10';
      default: return 'text-muted-foreground bg-muted';
    }
  };

  const formatTime = (hours) => {
    if (hours < 1) return `${Math.round(hours * 60)} min`;
    if (hours < 24) return `${hours.toFixed(1)} hrs`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours.toFixed(1)}h`;
  };

  const formatINR = (n) => {
    if (n === null || n === undefined) return '—';
    try {
      return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
    } catch (e) {
      return String(n);
    }
  };

  // Reusable renderer for a single weather point card
  const renderWeatherPointCard = (point, index) => {
    const w = point?.weather || {};
    const hasWeather = w && !w.error && (w.temp_c !== undefined && w.temp_c !== null);
    const place = point?.position || `Point ${index + 1}`;
    const context = point?.transport_context || point?.location_type || '';
    const coords = point?.coordinates;

    return (
      <div key={index} className="bg-[--card] border border-[--border] rounded-lg p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h4 className="font-semibold text-[--foreground] truncate" title={place}>{place}</h4>
            {context && (
              <div className="text-xs text-[--muted-foreground] mt-1 truncate" title={context}>{context}</div>
            )}
          </div>
          <i className={`fas fa-${getWeatherIcon(w.weather)} text-[--primary] text-xl ml-3 shrink-0`}></i>
        </div>

        {hasWeather ? (
          <div>
            <div className="flex items-baseline gap-3 mb-2">
              <div className="text-3xl font-bold text-[--foreground]">{w.temp_c}°C</div>
              <div className="text-sm text-[--muted-foreground] capitalize">{w.description || w.weather || '—'}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {w.wind_speed !== undefined && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-[--sidebar] border border-[--border] text-[--foreground]">
                  <i className="fas fa-wind"></i>
                  {w.wind_speed} m/s
                </span>
              )}
              {w.visibility !== undefined && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-[--sidebar] border border-[--border] text-[--foreground]">
                  <i className="fas fa-eye"></i>
                  {w.visibility} km
                </span>
              )}
              {w.source && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-[--sidebar] border border-[--border] text-[--muted-foreground]" title="Data source">
                  <i className="fas fa-database"></i>
                  {w.source}
                </span>
              )}
            </div>
            {coords && (
              <div className="text-xs text-[--muted-foreground] mt-2">{coords.lat}°, {coords.lon}°</div>
            )}
          </div>
        ) : (
          <div className="text-sm">
            <div className="flex items-center gap-2 text-warning mb-1">
              <i className="fas fa-circle-notch fa-spin"></i>
              <span className="font-medium">{w?.error ? 'Data Error' : 'Loading weather...'}</span>
            </div>
            {coords && (
              <div className="text-xs text-[--muted-foreground]">{coords.lat}°, {coords.lon}°</div>
            )}
            {context && (
              <div className="text-xs text-[--muted-foreground] mt-1">{context}</div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!origin || !destination) {
    return null;
  }

  return (
    <div className="fixed inset-y-0 right-0 left-0 lg:left-[280px] bg-black/50 flex items-center justify-center z-[1200]" style={{left: undefined, right: 0, top: 0, bottom: 0}}>
      <div className="bg-[--background] rounded-lg shadow-xl w-full max-w-6xl mx-4 lg:mx-6 max-h-[90vh] overflow-y-auto relative z-[1300]">
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
              <i className="fas fa-exclamation-triangle text-2xl text-destructive mb-4"></i>
              <p className="text-destructive">{error}</p>
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
                      <p className="text-sm text-[--muted-foreground]">Distance</p>
                      <p className="text-xl font-semibold text-[--foreground]">
                        {analysis.route_info?.distance_km ? `${analysis.route_info.distance_km} km` : '—'}
                      </p>
                      {analysis.route_info?.source && !`${analysis.route_info.source}`.toLowerCase().includes('ai') && (
                        <p className="text-xs text-[--muted-foreground] capitalize">{analysis.route_info.source}</p>
                      )}
                    </div>
                    <i className="fas fa-route text-[--primary] text-xl"></i>
                  </div>
                </div>

                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">Predicted Time</p>
                      <p className="text-xl font-semibold text-[--foreground]">
                        {(() => {
                          const hrs = liveSnapshot?.remaining_hours ?? analysis.delivery_estimate?.base_hours;
                          if (hrs === null || hrs === undefined) return '—';
                          const val = Number(hrs);
                          return <span title={`${val.toFixed(2)} hours`}>{formatTime(val)}</span>;
                        })()}
                      </p>
                    </div>
                    <i className="fas fa-robot text-info text-xl"></i>
                  </div>
                </div>

                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">Predicted Cost</p>
                      <p className="text-xl font-semibold text-[--foreground]">₹{analysis.cost_breakdown ? formatINR(analysis.cost_breakdown.total_inr) : '—'}</p>
                    </div>
                    <i className="fas fa-rupee-sign text-success text-xl"></i>
                  </div>
                </div>

                <div className="bg-[--sidebar] p-4 rounded-lg border border-[--border]">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-[--muted-foreground]">Risk Level</p>
                      <span className={`px-2 py-1 rounded text-sm font-medium ${getRiskColor(liveSnapshot?.risk?.risk_level || analysis.weather_analysis?.route_conditions?.risk_level)}`}>
                        {liveSnapshot?.risk?.risk_level || analysis.weather_analysis?.route_conditions?.risk_level || 'Unknown'}
                      </span>
                    </div>
                    <i className="fas fa-exclamation-triangle text-warning text-xl"></i>
                  </div>
                </div>
              </div>

              {/* Weather Points Along Route */}
              {(() => {
                const pointsForDisplay = frozenPoints
                  || ((liveSnapshot?.weather_points && liveSnapshot.weather_points.length > 0) ? liveSnapshot.weather_points : null)
                  || (analysis.weather_analysis?.points || analysis.weather_points || []);
                return pointsForDisplay && pointsForDisplay.length > 0 ? (
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center">
                      <i className="fas fa-map-marked-alt mr-2 text-[--primary]"></i>
                      Weather Along Route {isLiveUpdating && <span className="text-xs ml-2 text-[--muted-foreground]">(updating...)</span>}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {pointsForDisplay.map((point, index) => renderWeatherPointCard(point, index))}
                    </div>
                  </div>
                ) : (
                // Show weather points along route even with limited data
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center text-[--foreground]">
                    <i className="fas fa-cloud-sun mr-2 text-[--primary]"></i>
                    Route Weather Conditions
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {/* Generate weather points even when detailed data is limited */}
                    {(() => {
                      // Prefer backend precise weather points, then fallback
                      const routePoints = frozenPoints
                        || ((liveSnapshot?.weather_points && liveSnapshot.weather_points.length > 0) ? liveSnapshot.weather_points : null)
                        || (analysis.weather_analysis?.points || analysis.weather_points || []);
                      
                      console.log('Route points data:', routePoints); // Debug log
                      
                      if (routePoints.length > 0) {
                        return routePoints.map((point, index) => renderWeatherPointCard(point, index));
                      } else {
                        // Enhanced fallback: show transport-specific route points
                        const fallbackPoints = [
                          { 
                            label: 'Origin', 
                            context: analysis.route?.split(' → ')[0] || 'Start Point',
                            icon: 'map-marker-alt',
                            coords: '...'
                          },
                          { 
                            label: 'Route Checkpoint 1', 
                            context: 'First Quarter Route',
                            icon: 'route',
                            coords: '...'
                          },
                          { 
                            label: 'Mid Route', 
                            context: 'Route Midpoint',
                            icon: 'location-dot',
                            coords: '...'
                          },
                          { 
                            label: 'Route Checkpoint 2', 
                            context: 'Final Quarter Route',
                            icon: 'route',
                            coords: '...'
                          },
                          { 
                            label: 'Destination', 
                            context: analysis.route?.split(' → ')[1] || 'End Point',
                            icon: 'flag-checkered',
                            coords: '...'
                          }
                        ];
                        
                        return fallbackPoints.map((point, index) => (
                          <div key={index} className="bg-[--card] border border-[--border] rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold text-sm text-[--foreground]">
                                {point.context}
                              </h4>
                              <i className={`fas fa-${point.icon} text-[--muted-foreground] text-lg`}></i>
                            </div>
                            <div className="text-sm">
                              <div className="flex justify-between mb-2">
                                <span className="text-[--muted-foreground]">Status:</span>
                                <span className="text-warning font-medium">Generating Weather Data...</span>
                              </div>
                              <div className="text-xs text-[--muted-foreground] mt-2">
                                {point.label} • Coordinates loading...
                              </div>
                            </div>
                          </div>
                        ));
                      }
                    })()}
                  </div>
                  {/* Info message about limited data */}
                  <div className="mt-4 bg-[--muted] border border-[--border] rounded-lg p-3">
                    <p className="text-sm text-[--muted-foreground]">
                      <i className="fas fa-info-circle mr-2"></i>
                      Weather information may be limited for some route segments. Displaying available conditions along the transport route.
                    </p>
                  </div>
                </div>
                );
              })()}

              {/* Cost Breakdown */}
              {analysis.cost_breakdown && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center text-[--foreground]">
                    <i className="fas fa-receipt mr-2 text-[--primary]"></i>
                    Cost Breakdown {analysis.transport_mode ? <span className="text-xs ml-2 text-[--muted-foreground]">({analysis.transport_mode})</span> : null}
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {/* Handling */}
                    <div className="bg-[--card] border border-[--border] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[--muted-foreground]">HANDLING</span>
                        <i className="fas fa-dolly text-[--primary]"></i>
                      </div>
                      <div className="text-xl font-semibold text-[--foreground]">₹{formatINR(analysis.cost_breakdown.handling_inr)}</div>
                      <div className="text-xs text-[--muted-foreground]">Loading & unloading</div>
                    </div>
                    {/* Freight */}
                    <div className="bg-[--card] border border-[--border] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[--muted-foreground]">FREIGHT</span>
                        <i className="fas fa-truck-moving text-[--primary]"></i>
                      </div>
                      <div className="text-xl font-semibold text-[--foreground]">₹{formatINR(analysis.cost_breakdown.freight_inr)}</div>
                      <div className="text-xs text-[--muted-foreground] capitalize">{analysis.transport_mode || 'mode'} freight charges</div>
                    </div>
                    {/* Documentation */}
                    <div className="bg-[--card] border border-[--border] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[--muted-foreground]">DOCUMENTATION</span>
                        <i className="fas fa-file-contract text-[--primary]"></i>
                      </div>
                      <div className="text-xl font-semibold text-[--foreground]">₹{formatINR(analysis.cost_breakdown.documentation_inr)}</div>
                      <div className="text-xs text-[--muted-foreground]">Paperwork & clearance</div>
                    </div>
                    {/* Fuel Surcharge */}
                    <div className="bg-[--card] border border-[--border] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[--muted-foreground]">FUEL SURCHARGE</span>
                        <i className="fas fa-plane-departure text-[--primary]"></i>
                      </div>
                      <div className="text-xl font-semibold text-[--foreground]">₹{formatINR(analysis.cost_breakdown.fuel_surcharge_inr)}</div>
                      <div className="text-xs text-[--muted-foreground] capitalize">{analysis.transport_mode || 'mode'} fuel surcharge</div>
                    </div>
                    {/* Security */}
                    <div className="bg-[--card] border border-[--border] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[--muted-foreground]">SECURITY</span>
                        <i className="fas fa-lock text-[--primary]"></i>
                      </div>
                      <div className="text-xl font-semibold text-[--foreground]">₹{formatINR(analysis.cost_breakdown.security_inr)}</div>
                      <div className="text-xs text-[--muted-foreground]">Security screening</div>
                    </div>
                    {/* Customs */}
                    {analysis.cost_breakdown.customs_inr > 0 && (
                      <div className="bg-[--card] border border-[--border] rounded-lg p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[--muted-foreground]">CUSTOMS</span>
                          <i className="fas fa-passport text-[--primary]"></i>
                        </div>
                        <div className="text-xl font-semibold text-[--foreground]">₹{formatINR(analysis.cost_breakdown.customs_inr)}</div>
                        <div className="text-xs text-[--muted-foreground]">Customs clearance</div>
                      </div>
                    )}

                    {/* Total */}
                    <div className="bg-[--card] border border-[--border] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[--muted-foreground]">TOTAL</span>
                        <i className="fas fa-calculator text-[--primary]"></i>
                      </div>
                      <div className="text-xl font-semibold text-[--foreground]">₹{formatINR(analysis.cost_breakdown.total_inr)}</div>
                      <div className="text-xs text-[--muted-foreground]">Complete cost</div>
                    </div>
                  </div>

                  {/* Calculation Note */}
                  {analysis.cost_breakdown.calculation_note && (
                    <div className="mt-4 bg-[--muted] border border-[--border] rounded-lg p-3">
                      <p className="text-sm text-[--muted-foreground]">
                        <i className="fas fa-info-circle mr-2"></i>
                        {analysis.cost_breakdown.calculation_note}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Risk Assessment */}
              {/* Risk Assessment (AI) removed with precise analysis */}

              {/* Recommendations */}
              {analysis.recommendations && analysis.recommendations.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center text-[--foreground]">
                    <i className="fas fa-lightbulb mr-2 text-[--primary]"></i>
                    Recommendations
                  </h3>
                  <div className="bg-[--card] border border-[--border] rounded-lg p-4">
                    <div className="flex items-center mb-4">
                      <div className="bg-success/10 rounded-full p-2 mr-3">
                        <i className="fas fa-route text-success"></i>
                      </div>
                      <h4 className="font-medium text-[--foreground]">Route Optimization</h4>
                    </div>
                    <div className="space-y-3">
                      {analysis.recommendations.map((rec, index) => (
                        <div key={index} className="flex items-start space-x-3 p-3 bg-[--muted] rounded-lg">
                          <div className="bg-success/20 rounded-full p-1 mt-0.5">
                            <i className="fas fa-check text-success text-xs"></i>
                          </div>
                          <p className="text-sm text-[--foreground] flex-1">{rec}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-[--border]">
                <button
                  onClick={() => {
                    // Export weather-focused analysis
                    const exportData = {
                      route: `${origin} → ${destination}`,
                      shipment_id: shipmentId,
                      analysis_date: new Date().toISOString(),
                      weather_analysis: analysis.weather_analysis,
                      recommendations: analysis.recommendations
                    };
                    const dataStr = JSON.stringify(exportData, null, 2);
                    const dataBlob = new Blob([dataStr], {type: 'application/json'});
                    const url = URL.createObjectURL(dataBlob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `route-weather-${origin}-${destination}${shipmentId ? `-${shipmentId}` : ''}.json`;
                    link.click();
                  }}
                  className="px-4 py-2 border border-[--border] rounded-md hover:bg-[--sidebar] transition-colors"
                >
                  <i className="fas fa-download mr-2"></i>
                  Export Analysis
                </button>
                
                <button
                  onClick={() => {
                    // Unfreeze and refresh
                    setFrozenPoints(null);
                    setLiveSnapshot(null);
                    fetchRouteAnalysis();
                  }}
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