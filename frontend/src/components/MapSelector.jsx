import React, { useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import axios from 'axios';
import 'leaflet/dist/leaflet.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

import RouteRecommendation from './RouteRecommendation';
import { getTileProvider } from '../utils/tileProviders';

// Use ESM imports for Leaflet marker images so Vite can resolve them correctly
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Fix default icon path issue in some build setups
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl,
  iconUrl,
  shadowUrl,
});

function ClickSelector({ onSelect }) {
  useMapEvents({
    click(e) {
      onSelect([e.latlng.lat, e.latlng.lng]);
    }
  });
  return null;
}


export default function MapSelector() {
  const [points, setPoints] = useState([]);
  const [originName, setOriginName] = useState('');
  const [destinationName, setDestinationName] = useState('');

  const [recommendation, setRecommendation] = useState(null);
  const [pendingRecommendation, setPendingRecommendation] = useState(null); // holds previous rec while loading
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);


  const addPoint = (latlng) => {
    if (points.length >= 2) setPoints([latlng]);
    else setPoints([...points, latlng]);
  };

  const reverseGeocode = async (lat, lng) => {
    // Use Nominatim reverse geocoding to get a display name (no key required)
    try {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`;
  const res = await axios.get(url, { headers: { 'User-Agent': 'AISupplyChain/1.0', 'Accept-Language': 'en' } });
      // Prefer broader city + state label (user requested city/state) instead of exact street/place
      const addr = res.data.address || {};
      const city = addr.city || addr.town || addr.village || addr.hamlet || addr.county || addr.city_district || null;
      const state = addr.state || addr.region || addr.county || null;
      if (city && state) {
        return `${city}, ${state}`;
      }
      if (city) return city;
      if (state) return state;
      // Fall back: try to parse display_name to extract a city,state-like pair
      const display = res.data.display_name || '';
      const parts = display.split(',').map(s => s.trim()).filter(Boolean);
      // remove parts that look like coordinates or numbers
      const textParts = parts.filter(p => !/^-?\d+(?:\.\d+)?$/.test(p) && !/^\d{1,3}\s*km$/.test(p));
      if (textParts.length >= 2) {
        // prefer last two textual parts as city/state
        const cityCandidate = textParts[textParts.length - 2];
        const stateCandidate = textParts[textParts.length - 1];
        if (cityCandidate && stateCandidate) return `${cityCandidate}, ${stateCandidate}`;
      } else if (textParts.length === 1) {
        return textParts[0];
      }
      // As a last resort, return display (may still be coordinates) or the lat/lng fallback
      return display || `${lat.toFixed(4)},${lng.toFixed(4)}`;
    } catch (e) {
      return `${lat.toFixed(4)},${lng.toFixed(4)}`;
    }
  };

  const fetchWeather = async (lat, lng) => {
    try {
      const res = await axios.get(`/api/logistics/weather?lat=${lat}&lng=${lng}`);
      // backend returns { success: true, weather: { ... } }
      const payload = res.data && res.data.weather ? res.data.weather : res.data;
      if (!payload) return null;

      // normalize field names for frontend components
      const normalized = {
        temp: payload.temp_c ?? payload.temp ?? null,
        description: payload.description ?? payload.weather ?? '',
        condition: payload.weather ?? payload.description ?? '',
        wind: payload.wind_m_s ?? payload.wind ?? null,
        raw: payload
      };
      return normalized;
    } catch (e) {
      console.error('Error fetching weather:', e);
      return null;
    }
  };

  // Normalize/merge recommendation object from backend into a stable frontend shape
  const normalizeRecommendation = (raw) => {
    if (!raw) return null;
    
    console.log('Raw recommendation data:', raw);
    
    // Use actual data from backend response
    const distance_info = raw.distance_info || null;
    const stats = raw.stats || null;
    const gemini_summary = raw.gemini_summary || 'Route analysis completed';
    const origin_weather = raw.origin_weather || (weather && weather[0]) || null;
    const destination_weather = raw.destination_weather || (weather && weather[1]) || null;
    const weather_points = raw.weather_points || [];
    const warnings = raw.warnings || ['Route analysis completed'];
    
    return {
      ...raw,
      distance_info,
      weather_points,
      gemini_summary,
      origin_weather,
      destination_weather,
      stats,
      warnings
    };
  };

  const handleSelect = async (latlng) => {
    setLoading(true);
    setError(null);
    console.debug('[MapSelector] handleSelect click', { latlng, points });
    try {
      // compute the new points array synchronously so we can immediately use it
      const newPoints = points.length >= 2 ? [latlng] : [...points, latlng];
      console.debug('[MapSelector] handleSelect newPoints', { newPoints });
      setPoints(newPoints);

      const [lat, lng] = latlng;
      // show a provisional coordinate label immediately so the user sees selection
      const provisionalName = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (newPoints.length === 1) {
        setOriginName(provisionalName);
        console.debug('[MapSelector] provisional origin set', { provisionalName });
      } else {
        setDestinationName(provisionalName);
        console.debug('[MapSelector] provisional destination set', { provisionalName });
      }

      const name = await reverseGeocode(lat, lng);
      console.debug('[MapSelector] handleSelect geocode', { lat, lng, name });
      // update with the resolved name when it arrives
      if (newPoints.length === 1) {
        setOriginName(name || provisionalName);
        console.debug('[MapSelector] originName updated', { name });
      } else {
        setDestinationName(name || provisionalName);
        console.debug('[MapSelector] destinationName updated', { name });
      }

      const weatherData = await fetchWeather(lat, lng);
      console.debug('[MapSelector] handleSelect weatherData', { weatherData });

      if (newPoints.length === 1) {
        // first point selected -> origin
        setOriginName(name);
        setWeather([weatherData]);
      } else if (newPoints.length === 2) {
        // second point selected -> destination
        setDestinationName(name);
        setWeather(prev => [...(prev || []), weatherData]);

        // Don't automatically fetch recommendation - wait for user to click button
        // setRecommendation(null);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to fetch location data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const callEstimate = async () => {
    if (!originName || !destinationName) return;
    setPendingRecommendation(recommendation); // preserve current rec while loading
    setLoading(true);
    setError(null);
    try {
      console.debug('[MapSelector] callEstimate start', { originName, destinationName, points, recommendation, pendingRecommendation });
      const { data } = await axios.post('/api/logistics/shipments/estimate', {
        origin: originName,
        destination: destinationName,
        originCoords: points[0],
        destinationCoords: points[1],
        weather: weather
      });
      const newRec = normalizeRecommendation(data?.recommendation);
      console.debug('[MapSelector] callEstimate result', { data, newRec, fullResponse: data });
      console.log('API Response:', data);
      console.log('Normalized Recommendation:', newRec);
      if (newRec) {
        setRecommendation(newRec);
        setPendingRecommendation(null); // clear after new rec loaded
      } else {
        // Backend returned no recommendation — keep previous one
        setRecommendation((prev) => prev || pendingRecommendation);
        setPendingRecommendation(null);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to fetch route recommendation. Please try again.');
      // restore previous recommendation
      setRecommendation((prev) => prev || pendingRecommendation);
      setPendingRecommendation(null);
    } finally {
      setLoading(false);
    }
  };



  // Keep a stable recommendation to display (prefer latest, otherwise show previous)
  const displayRec = recommendation || pendingRecommendation;

  return (
    <div className="bg-[--sidebar] rounded-lg border border-[--border] overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[--primary] to-blue-600 p-4">
        <h4 className="text-white font-semibold flex items-center">
          <i className="fas fa-map-marked-alt mr-2"></i>
          Interactive Route Planner
        </h4>
        <p className="text-blue-100 text-sm mt-1">Click on the map to select origin and destination points</p>
      </div>

      <div className="p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-center">
            <i className="fas fa-exclamation-triangle mr-2"></i>
            <span>{error}</span>
          </div>
        )}
        
        {/* Map Container */}
        <div className="relative rounded-lg overflow-hidden mb-6 shadow-lg border border-[--border]" style={{ height: 400 }}>
          <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: '100%' }} className="z-0">
            {
              (() => {
                const tile = getTileProvider();
                return <TileLayer url={tile.url} attribution={tile.attribution} />;
              })()
            }
            <ClickSelector onSelect={handleSelect} />
            {points.map((p, i) => (
              <Marker key={i} position={p}>
                <Popup>
                  <div className="font-semibold text-center">
                    {i === 0 ? (
                      <div className="text-green-600">
                        <i className="fas fa-play-circle mr-1"></i>
                        Origin
                      </div>
                    ) : (
                      <div className="text-red-600">
                        <i className="fas fa-flag-checkered mr-1"></i>
                        Destination
                      </div>
                    )}
                    <div className="text-sm text-gray-600 mt-1">
                      {i === 0 ? originName : destinationName}
                    </div>
                  </div>
                  {weather && weather[i] && (
                    <div className="mt-3 pt-2 border-t border-gray-200">
                      <div className="flex items-center justify-between text-sm">
                        <span><i className="fas fa-thermometer-half mr-1 text-orange-500"></i>{weather[i].temp}°C</span>
                        <span><i className="fas fa-cloud mr-1 text-blue-500"></i>{weather[i].description}</span>
                      </div>
                    </div>
                  )}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center z-[1000]">
              <div className="bg-white rounded-lg p-4 shadow-lg flex items-center">
                <i className="fas fa-spinner fa-spin mr-2 text-[--primary]"></i>
                <span className="text-sm font-medium">Loading route data...</span>
              </div>
            </div>
          )}
        </div>

        {/* Route Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-[--background] rounded-lg p-4 border border-[--border]">
            <div className="flex items-center justify-between mb-3">
              <h5 className="font-medium text-[--foreground]">Origin Point</h5>
              <i className="fas fa-map-marker-alt text-green-500"></i>
            </div>
            <div className="flex items-center text-sm">
              {originName ? (
                <>
                  <i className="fas fa-check-circle mr-2 text-green-500"></i>
                  <span className="text-[--foreground]">{originName}</span>
                </>
              ) : (
                <>
                  <i className="fas fa-mouse-pointer mr-2 text-gray-400"></i>
                  <span className="text-[--muted-foreground]">Click on map to select</span>
                </>
              )}
            </div>
            {weather && weather[0] && (
              <div className="mt-2 pt-2 border-t border-[--border] text-xs text-[--muted-foreground]">
                <i className="fas fa-cloud mr-1"></i>
                {weather[0].temp}°C, {weather[0].description}
              </div>
            )}
          </div>

          <div className="bg-[--background] rounded-lg p-4 border border-[--border]">
            <div className="flex items-center justify-between mb-3">
              <h5 className="font-medium text-[--foreground]">Destination Point</h5>
              <i className="fas fa-flag-checkered text-red-500"></i>
            </div>
            <div className="flex items-center text-sm">
              {destinationName ? (
                <>
                  <i className="fas fa-check-circle mr-2 text-green-500"></i>
                  <span className="text-[--foreground]">{destinationName}</span>
                </>
              ) : (
                <>
                  <i className="fas fa-mouse-pointer mr-2 text-gray-400"></i>
                  <span className="text-[--muted-foreground]">Click on map to select</span>
                </>
              )}
            </div>
            {weather && weather[1] && (
              <div className="mt-2 pt-2 border-t border-[--border] text-xs text-[--muted-foreground]">
                <i className="fas fa-cloud mr-1"></i>
                {weather[1].temp}°C, {weather[1].description}
              </div>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="flex justify-center mb-6">
          <button 
            className={`flex items-center px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
              loading || !originName || !destinationName
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-[--primary] to-blue-600 text-white hover:shadow-lg hover:scale-105'
            }`}
            onClick={callEstimate}
            disabled={loading || !originName || !destinationName}
          >
            {loading ? (
              <>
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Analyzing Route...
              </>
            ) : (
              <>
                <i className="fas fa-route mr-2"></i>
                Get Route Recommendation
              </>
            )}
          </button>
        </div>

        {/* Basic Trip Info - Shows when both points selected */}
        {originName && destinationName && !displayRec && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-lg p-5 border border-gray-200">
              <h5 className="font-semibold text-gray-700 mb-4 flex items-center">
                <i className="fas fa-info-circle mr-2"></i>
                Basic Route Info
              </h5>
              <p className="text-sm text-gray-600">
                Click "Get Route Recommendation" to see detailed analysis with distance, time estimates, and AI insights.
              </p>
            </div>
            
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-5 border border-green-200">
              <h5 className="font-semibold text-green-800 mb-4 flex items-center">
                <i className="fas fa-route mr-2"></i>
                Trip Details
              </h5>
              
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white rounded-lg p-4 border border-green-100 text-center">
                  <div className="text-2xl font-bold text-gray-400">--</div>
                  <div className="text-xs text-gray-500 font-medium">KM</div>
                  <div className="text-xs text-gray-400">Distance</div>
                </div>
                
                <div className="bg-white rounded-lg p-4 border border-green-100 text-center">
                  <div className="text-2xl font-bold text-gray-400">--</div>
                  <div className="text-xs text-gray-500 font-medium">HRS</div>
                  <div className="text-xs text-gray-400">Est. Time</div>
                </div>
                
                <div className="bg-white rounded-lg p-4 border border-green-100 text-center">
                  <div className="text-2xl font-bold text-gray-400">--</div>
                  <div className="text-xs text-gray-500 font-medium">INR</div>
                  <div className="text-xs text-gray-400">Est. Cost</div>
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-3 border border-green-100">
                <h6 className="font-medium text-green-700 mb-2 flex items-center">
                  <i className="fas fa-info-circle mr-1 text-sm"></i>
                  Route Summary
                </h6>
                <div className="text-sm text-gray-700 space-y-1">
                  <div className="flex justify-between">
                    <span>Origin:</span>
                    <span className="font-medium">{originName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Destination:</span>
                    <span className="font-medium">{destinationName}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Route Analysis Results */}
        {displayRec && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Side - AI Analysis */}
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-5 border border-purple-200">
              <h5 className="font-semibold text-purple-800 mb-4 flex items-center">
                <i className="fas fa-robot mr-2"></i>
                AI Route Analysis
              </h5>
              
              {/* AI Summary */}
              {displayRec.gemini_summary && (
                <div className="mb-4">
                  <h6 className="font-medium text-purple-700 mb-2 flex items-center">
                    <i className="fas fa-brain mr-1 text-sm"></i>
                    Smart Insights
                  </h6>
                  <div className="bg-white rounded-lg p-3 text-sm text-gray-700 border border-purple-100">
                    {displayRec.gemini_summary}
                  </div>
                </div>
              )}
              
              {/* Weather Analysis */}
              {displayRec.weather_points && displayRec.weather_points.length > 0 && (
                <div className="mb-4">
                  <h6 className="font-medium text-purple-700 mb-2 flex items-center">
                    <i className="fas fa-cloud mr-1 text-sm"></i>
                    Weather Conditions
                  </h6>
                  <div className="space-y-2">
                    {displayRec.weather_points.slice(0, 3).map((point, idx) => (
                      <div key={idx} className="bg-white rounded p-2 text-xs border border-purple-100">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{point.position || `Point ${idx + 1}`}</span>
                          <span className="text-purple-600">
                            {point.weather?.temp_c || point.weather?.temp}°C
                          </span>
                        </div>
                        <div className="text-gray-600 mt-1">
                          {point.weather?.description || point.weather?.weather || 'Clear'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Risk Assessment */}
              {displayRec.stats?.risk_level && (
                <div className="mb-4">
                  <h6 className="font-medium text-purple-700 mb-2 flex items-center">
                    <i className="fas fa-exclamation-triangle mr-1 text-sm"></i>
                    Risk Level
                  </h6>
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    displayRec.stats.risk_level === 'high' ? 'bg-red-100 text-red-700' :
                    displayRec.stats.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    <i className={`fas fa-circle mr-1 text-xs ${
                      displayRec.stats.risk_level === 'high' ? 'text-red-500' :
                      displayRec.stats.risk_level === 'medium' ? 'text-yellow-500' :
                      'text-green-500'
                    }`}></i>
                    {displayRec.stats.risk_level.toUpperCase()}
                  </div>
                </div>
              )}
              
              {/* Warnings */}
              {displayRec.warnings && displayRec.warnings.length > 0 && (
                <div>
                  <h6 className="font-medium text-purple-700 mb-2 flex items-center">
                    <i className="fas fa-info-circle mr-1 text-sm"></i>
                    Recommendations
                  </h6>
                  <div className="space-y-1">
                    {displayRec.warnings.map((warning, idx) => (
                      <div key={idx} className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                        <i className="fas fa-lightbulb mr-1"></i>
                        {warning}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Right Side - Trip Details */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-5 border border-green-200">
              <h5 className="font-semibold text-green-800 mb-4 flex items-center">
                <i className="fas fa-route mr-2"></i>
                Trip Details
              </h5>
              
              {/* Key Metrics */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-white rounded-lg p-4 border border-green-100 text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {displayRec.stats?.distance || Math.round(displayRec.distance_info?.distance_km || 0) || '--'}
                  </div>
                  <div className="text-xs text-green-700 font-medium">KM</div>
                  <div className="text-xs text-gray-500">Distance</div>
                </div>
                
                <div className="bg-white rounded-lg p-4 border border-green-100 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {displayRec.stats?.estimated_hours || Math.round(displayRec.distance_info?.duration_hours || 0) || '--'}
                  </div>
                  <div className="text-xs text-blue-700 font-medium">HRS</div>
                  <div className="text-xs text-gray-500">Est. Time</div>
                </div>
                
                <div className="bg-white rounded-lg p-4 border border-green-100 text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    ₹{(displayRec.stats?.average_cost || Math.round(((displayRec.distance_info?.distance_km || 0) * 8) + 200) || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-orange-700 font-medium">INR</div>
                  <div className="text-xs text-gray-500">Est. Cost</div>
                </div>
              </div>
              
              {/* Route Information */}
              <div className="bg-white rounded-lg p-3 border border-green-100">
                <h6 className="font-medium text-green-700 mb-2 flex items-center">
                  <i className="fas fa-info-circle mr-1 text-sm"></i>
                  Route Summary
                </h6>
                <div className="text-sm text-gray-700 space-y-1">
                  <div className="flex justify-between">
                    <span>Origin:</span>
                    <span className="font-medium">{originName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Destination:</span>
                    <span className="font-medium">{destinationName}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
