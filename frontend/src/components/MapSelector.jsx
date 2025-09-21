import React, { useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Polyline } from 'react-leaflet';
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

function ClickSelector({ onSelect, enabled = true }) {
  useMapEvents({
    click(e) {
      if (enabled) onSelect([e.latlng.lat, e.latlng.lng]);
    }
  });
  return null;
}


export default function MapSelector() {
  const mapRef = useRef(null);
  const geocodeCacheRef = useRef(new Map()); // q -> { ts, list }
  const originDebounceRef = useRef(null);
  const destDebounceRef = useRef(null);
  const originAbortRef = useRef(null);
  const destAbortRef = useRef(null);
  const [points, setPoints] = useState([]);
  const [originName, setOriginName] = useState('');
  const [destinationName, setDestinationName] = useState('');
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [originSuggestions, setOriginSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  // Transport selection is AI-only now; keep a local preview mode for speed estimation but do not show selector
  const [transportMode, setTransportMode] = useState('road');
  const [priority, setPriority] = useState('standard');

  const [recommendation, setRecommendation] = useState(null);
  const [pendingRecommendation, setPendingRecommendation] = useState(null); // holds previous rec while loading
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  const [analysisRequested, setAnalysisRequested] = useState(false);
  // UI feedback for geocoding on Enter/blur
  const [originSearching, setOriginSearching] = useState(false);
  const [destSearching, setDestSearching] = useState(false);
  const [originError, setOriginError] = useState('');
  const [destError, setDestError] = useState('');

  // Keep the map focused on India
  const INDIA_CENTER = [20.5937, 78.9629];
  const INDIA_BOUNDS = L.latLngBounds([6.0, 68.0], [37.5, 97.5]);

  // Reset route (points and related fields) automatically if user changes points after analysis
  const resetRouteAfterAnalysis = React.useCallback(() => {
    if (!analysisRequested) return;
    // Soft-clear only route-related state; keep priority selection etc.
    setPoints([]);
    setOriginName('');
    setDestinationName('');
    setOriginQuery('');
    setDestQuery('');
    setOriginSuggestions([]);
    setDestSuggestions([]);
    setWeather(null);
    setRecommendation(null);
    setPendingRecommendation(null);
    setError(null);
    setSaveStatus(null);
    setOriginSearching(false);
    setDestSearching(false);
    setOriginError('');
    setDestError('');
    setAnalysisRequested(false);
  }, [analysisRequested]);

  const updateMapView = (newPoints) => {
    try {
      const map = mapRef.current;
      if (!map || !newPoints) return;
      // Fit to selected points so the user can explore globally
      if (newPoints.length >= 2) {
        const bounds = L.latLngBounds(newPoints);
        map.fitBounds(bounds, { padding: [20, 20] });
      } else if (newPoints.length === 1) {
        map.setView(newPoints[0], 8);
      }
    } catch (_) {
      // ignore
    }
  };


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

  const forwardGeocode = async (q, signal) => {
    if (!q || q.trim().length < 3) return [];
    try {
      const key = q.trim().toLowerCase();
      const TTL = 5 * 60 * 1000; // 5 minutes
      const cached = geocodeCacheRef.current.get(key);
      const now = Date.now();
      if (cached && (now - cached.ts) < TTL) {
        return cached.list;
      }
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&limit=5&accept-language=en`;
      const res = await axios.get(url, { headers: { 'User-Agent': 'AISupplyChain/1.0', 'Accept-Language': 'en' }, signal });
      const list = (res.data || []).map(r => ({
        name: r.display_name,
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon)
      })).slice(0, 5);
      geocodeCacheRef.current.set(key, { ts: now, list });
      return list;
    } catch (e) {
      // Swallow aborts quietly
      if (axios.isCancel?.(e) || e?.name === 'CanceledError') return [];
      return [];
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
    // If a previous analysis exists, start a fresh route when user clicks new point
    if (analysisRequested) {
      resetRouteAfterAnalysis();
    }
    setLoading(true);
    setError(null);
    console.debug('[MapSelector] handleSelect click', { latlng, points });
    try {
      // compute the new points array synchronously so we can immediately use it
      const currentPoints = analysisRequested ? [] : points;
      const newPoints = currentPoints.length >= 2 ? [latlng] : [...currentPoints, latlng];
      console.debug('[MapSelector] handleSelect newPoints', { newPoints });
      setPoints(newPoints);

      const [lat, lng] = latlng;
      // show a provisional coordinate label immediately so the user sees selection
      const provisionalName = `${lat.toFixed(4)},${lng.toFixed(4)}`;
      if (newPoints.length === 1) {
        setOriginName(provisionalName);
        setOriginQuery(provisionalName);
        console.debug('[MapSelector] provisional origin set', { provisionalName });
      } else {
        setDestinationName(provisionalName);
        setDestQuery(provisionalName);
        console.debug('[MapSelector] provisional destination set', { provisionalName });
      }

      const name = await reverseGeocode(lat, lng);
      console.debug('[MapSelector] handleSelect geocode', { lat, lng, name });
      // update with the resolved name when it arrives
      if (newPoints.length === 1) {
        setOriginName(name || provisionalName);
        setOriginQuery(name || provisionalName);
        console.debug('[MapSelector] originName updated', { name });
      } else {
        setDestinationName(name || provisionalName);
        setDestQuery(name || provisionalName);
        console.debug('[MapSelector] destinationName updated', { name });
      }

      const weatherData = await fetchWeather(lat, lng);
      console.debug('[MapSelector] handleSelect weatherData', { weatherData });

      if (newPoints.length === 1) {
        // first point selected -> origin
        setOriginName(name);
        setOriginQuery(name);
        setWeather([weatherData]);
      } else if (newPoints.length === 2) {
        // second point selected -> destination
        setDestinationName(name);
        setDestQuery(name);
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

  // Handle typed selection from suggestions
  const handlePickOrigin = async (s) => {
    if (analysisRequested) resetRouteAfterAnalysis();
    const latlng = [s.lat, s.lon];
    const basePoints = analysisRequested ? [] : points;
    const nextPoints = basePoints.length === 0 ? [latlng] : [latlng, basePoints[1]].filter(Boolean);
    setPoints(nextPoints);
    setOriginName(s.name);
    setOriginQuery(s.name);
    setOriginError('');
    const w = await fetchWeather(s.lat, s.lon);
    setWeather(prev => [w, prev?.[1]].filter(v => v !== undefined));
    setOriginSuggestions([]);
    updateMapView(nextPoints);
  };

  const handlePickDestination = async (s) => {
    if (analysisRequested) resetRouteAfterAnalysis();
    const latlng = [s.lat, s.lon];
    const basePoints = analysisRequested ? [] : points;
    const nextPoints = basePoints.length <= 1 ? [basePoints[0], latlng].filter(Boolean) : [basePoints[0], latlng];
    setPoints(nextPoints);
    setDestinationName(s.name);
    setDestQuery(s.name);
    setDestError('');
    const w = await fetchWeather(s.lat, s.lon);
    setWeather(prev => [prev?.[0], w].filter(v => v !== undefined));
    setDestSuggestions([]);
    updateMapView(nextPoints);
  };

  // Geocode typed text on Enter/blur to point on map
  const ensureOriginFromText = async () => {
    const val = (originQuery || '').trim();
    if (val.length < 3) return;
    if (points[0] && originName && val === originName) return;
    setOriginSearching(true);
    setOriginError('');
    try {
      const list = await forwardGeocode(val);
      if (list && list.length > 0) {
        await handlePickOrigin(list[0]);
      } else {
        setOriginError('No results');
      }
    } finally {
      setOriginSearching(false);
    }
  };

  const ensureDestFromText = async () => {
    const val = (destQuery || '').trim();
    if (val.length < 3) return;
    if (points[1] && destinationName && val === destinationName) return;
    setDestSearching(true);
    setDestError('');
    try {
      const list = await forwardGeocode(val);
      if (list && list.length > 0) {
        await handlePickDestination(list[0]);
      } else {
        setDestError('No results');
      }
    } finally {
      setDestSearching(false);
    }
  };

  const callEstimate = async () => {
    if (!originName || !destinationName) return;
    setAnalysisRequested(true);
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
        weather: weather,
        transport_mode: transportMode,
        priority: priority
      });
      const newRec = normalizeRecommendation(data?.recommendation);
      console.debug('[MapSelector] callEstimate result', { data, newRec, fullResponse: data });
      console.log('API Response:', data);
      console.log('Normalized Recommendation:', newRec);
      if (newRec) {
        setRecommendation(newRec);
        // Default UI mode to recommended mode if provided
        try {
          const recMode = (newRec?.recommended_mode || newRec?.stats?.mode || '').toLowerCase();
          if (recMode) setTransportMode(recMode);
        } catch (_) {}
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

  // --- Local preview metrics (distance/time/cost) ---
  const haversineKm = (a, b) => {
    if (!a || !b) return 0;
    const toRad = (x) => (x * Math.PI) / 180;
    const [lat1, lon1] = a;
    const [lat2, lon2] = b;
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const la1 = toRad(lat1);
    const la2 = toRad(lat2);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const h = sinDLat * sinDLat + Math.cos(la1) * Math.cos(la2) * sinDLon * sinDLon;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c;
  };

  const preview = React.useMemo(() => {
    if (points.length < 2) return { km: null, hours: null, cost: null };
    const km = haversineKm(points[0], points[1]);
    // Simple mode-based speed assumptions
    const speedByMode = { road: 60, rail: 70, air: 600, sea: 35 };
    const speed = speedByMode[transportMode] || 60;
    const hours = km / speed;
    // Simple cost model similar to other parts: distance*8 + 200 base
    const cost = Math.max(0, km * 8 + 200);
    return { km: Math.round(km), hours: Math.round(hours * 10) / 10, cost: Math.round(cost) };
  }, [points, transportMode]);

  const clearAll = () => {
    setPoints([]);
    setOriginName('');
    setDestinationName('');
    setOriginQuery('');
    setDestQuery('');
    setOriginSuggestions([]);
    setDestSuggestions([]);
    setWeather(null);
    setRecommendation(null);
    setPendingRecommendation(null);
    setError(null);
    setSaveStatus(null);
  setAnalysisRequested(false);
    setOriginSearching(false);
    setDestSearching(false);
    setOriginError('');
    setDestError('');
  // cancel inflight suggestion requests and timers
  try { if (originDebounceRef.current) clearTimeout(originDebounceRef.current); } catch (_) {}
  try { if (destDebounceRef.current) clearTimeout(destDebounceRef.current); } catch (_) {}
  try { originAbortRef.current && originAbortRef.current.abort(); } catch (_) {}
  try { destAbortRef.current && destAbortRef.current.abort(); } catch (_) {}
  };

  const saveAsShipment = async () => {
    if (!destinationName) return;
    setLoading(true);
    setSaveStatus(null);
    try {
      const payload = {
        origin: originName || undefined,
        destination: destinationName,
        transport_mode: transportMode,
        priority: priority,
        notes: 'Created from Route Planner'
      };
      const { data } = await axios.post('/api/logistics/shipments', payload);
      if (data && data.success) {
        setSaveStatus({ ok: true, message: 'Shipment created successfully.' });
      } else {
        setSaveStatus({ ok: false, message: data?.error || 'Failed to create shipment.' });
      }
    } catch (e) {
      console.error('Save shipment error:', e);
      setSaveStatus({ ok: false, message: 'Failed to create shipment.' });
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
        <p className="text-blue-100 text-sm mt-1">Type in the boxes or click on the map to select origin and destination</p>
      </div>

      <div className="p-6">
        {/* Type-to-search inputs (always available; map clicks also update these) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm text-[--muted-foreground] mb-1 block">Origin</label>
            <div className="relative">
            <input
              value={originQuery}
              onChange={async (e) => {
                const val = e.target.value;
                if (analysisRequested) resetRouteAfterAnalysis();
                setOriginQuery(val);
                setOriginName(val);
                setOriginError('');
                // Debounce suggestions, cancel previous request
                if (originDebounceRef.current) clearTimeout(originDebounceRef.current);
                if (!val || val.length < 3) {
                  setOriginSuggestions([]);
                  if (originAbortRef.current) originAbortRef.current.abort();
                  return;
                }
                originDebounceRef.current = setTimeout(async () => {
                  try {
                    if (originAbortRef.current) originAbortRef.current.abort();
                    const controller = new AbortController();
                    originAbortRef.current = controller;
                    setOriginSearching(true);
                    const list = await forwardGeocode(val, controller.signal);
                    setOriginSuggestions(list);
                  } finally {
                    setOriginSearching(false);
                  }
                }, 300);
              }}
              onKeyDown={async (e) => { if (e.key === 'Enter') { e.preventDefault(); await ensureOriginFromText(); } }}
              onBlur={async () => { await ensureOriginFromText(); }}
              placeholder="e.g., Mumbai, Maharashtra"
              className="w-full px-3 py-2 rounded-md bg-[--background] border border-[--border]"
            />
            {originSearching && (
              <div className="absolute inset-y-0 right-2 flex items-center text-[--muted-foreground] text-xs">
                <i className="fas fa-spinner fa-spin mr-1"></i>
                searching…
              </div>
            )}
            </div>
            {originSuggestions.length > 0 && (
              <div className="mt-1 bg-[--background] border border-[--border] rounded-md shadow-sm max-h-40 overflow-auto">
                {originSuggestions.map((s, i) => (
                  <button key={i} className="w-full text-left px-3 py-2 hover:bg-[--sidebar] text-sm" onClick={() => handlePickOrigin(s)}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            {originError && (
              <div className="text-[10px] text-red-600 mt-1">{originError}</div>
            )}
          </div>
          <div>
            <label className="text-sm text-[--muted-foreground] mb-1 block">Destination</label>
            <div className="relative">
            <input
              value={destQuery}
              onChange={async (e) => {
                const val = e.target.value;
                if (analysisRequested) resetRouteAfterAnalysis();
                setDestQuery(val);
                setDestinationName(val);
                setDestError('');
                // Debounce suggestions, cancel previous request
                if (destDebounceRef.current) clearTimeout(destDebounceRef.current);
                if (!val || val.length < 3) {
                  setDestSuggestions([]);
                  if (destAbortRef.current) destAbortRef.current.abort();
                  return;
                }
                destDebounceRef.current = setTimeout(async () => {
                  try {
                    if (destAbortRef.current) destAbortRef.current.abort();
                    const controller = new AbortController();
                    destAbortRef.current = controller;
                    setDestSearching(true);
                    const list = await forwardGeocode(val, controller.signal);
                    setDestSuggestions(list);
                  } finally {
                    setDestSearching(false);
                  }
                }, 300);
              }}
              onKeyDown={async (e) => { if (e.key === 'Enter') { e.preventDefault(); await ensureDestFromText(); } }}
              onBlur={async () => { await ensureDestFromText(); }}
              placeholder="e.g., Bengaluru, Karnataka"
              className="w-full px-3 py-2 rounded-md bg-[--background] border border-[--border]"
            />
            {destSearching && (
              <div className="absolute inset-y-0 right-2 flex items-center text-[--muted-foreground] text-xs">
                <i className="fas fa-spinner fa-spin mr-1"></i>
                searching…
              </div>
            )}
            </div>
            {destSuggestions.length > 0 && (
              <div className="mt-1 bg-[--background] border border-[--border] rounded-md shadow-sm max-h-40 overflow-auto">
                {destSuggestions.map((s, i) => (
                  <button key={i} className="w-full text-left px-3 py-2 hover:bg-[--sidebar] text-sm" onClick={() => handlePickDestination(s)}>
                    {s.name}
                  </button>
                ))}
              </div>
            )}
            {destError && (
              <div className="text-[10px] text-red-600 mt-1">{destError}</div>
            )}
          </div>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-center">
            <i className="fas fa-exclamation-triangle mr-2"></i>
            <span>{error}</span>
          </div>
        )}
        
        {/* Map Container */}
        <div className="relative rounded-lg overflow-hidden mb-6 shadow-lg border border-[--border]" style={{ height: 400 }}>
          <MapContainer
            center={INDIA_CENTER}
            zoom={5}
            minZoom={2}
            maxZoom={12}
            style={{ height: '100%'}}
            className="z-0"
            whenCreated={(map) => { mapRef.current = map; map.fitBounds(INDIA_BOUNDS); }}
          >
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
            {/* Polyline between origin and destination */}
            {points.length >= 2 && (
              <Polyline positions={points} color="#2563eb" weight={4} opacity={0.8} />
            )}
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
                  <span className="text-[--muted-foreground]">Type above or click on map to select</span>
                </>
              )}
            </div>
            {/* Weather display removed as per request */}
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
                  <span className="text-[--muted-foreground]">Type above or click on map to select</span>
                </>
              )}
            </div>
            {/* Weather display removed as per request */}
          </div>
        </div>

        {/* Clear Points in a card */}
        <div className="bg-[--background] rounded-lg p-4 border border-[--border] mb-6">
          <div className="flex justify-start">
            <button
              className="px-4 py-2 rounded-md border border-[--border] hover:bg-[--sidebar]"
              onClick={clearAll}
              disabled={loading}
            >
              <i className="fas fa-undo mr-2"></i>
              Clear Points
            </button>
          </div>
        </div>

        

        {/* Controls */}
        <div className="mb-6 bg-[--background] border border-[--border] rounded-lg p-3 md:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Left: compact priority selector */}
            <div className="flex items-center gap-2">
              <label className="text-base text-[--muted-foreground] w-28">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-52 px-4 py-2.5 rounded-md bg-[--background] border border-[--border] focus:outline-none focus:ring-2 focus:ring-[--primary]/40"
              >
                <option value="standard">Standard</option>
                <option value="express">Express</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {/* Middle: Mode selector removed (AI chooses the mode) */}

            {/* Right: Get Route button */}
            <div className="flex items-center gap-2 md:ml-4 md:justify-end">
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
          </div>
        </div>

        {/* Pre-result Basic Trip Info removed per user request */}

        {/* Route Analysis Results */}
        {displayRec && (
          <>
            {/* Recommended Mode badge */}
              {((displayRec?.recommended_mode) || (displayRec?.stats?.mode)) && (
                <div className="mb-4">
                  <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-blue-100 text-blue-700 text-sm md:text-base font-semibold shadow-sm">
                    <i className="fas fa-truck-fast mr-2"></i>
                    Recommended Mode: {((displayRec?.recommended_mode || displayRec?.stats?.mode) || '').toUpperCase()}
                  </span>
                </div>
              )}
            {/* Top metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-[--background] rounded-lg p-4 border border-[--border]">
                <div className="text-xs text-[--muted-foreground] flex items-center mb-1">
                  <i className="fas fa-route mr-2"></i>Distance
                </div>
                <div className="text-2xl font-bold text-[--foreground]">{Math.round(displayRec?.distance_info?.distance_km || displayRec?.stats?.distance || 0) || '--'} km</div>
              </div>
              <div className="bg-[--background] rounded-lg p-4 border border-[--border]">
                <div className="text-xs text-[--muted-foreground] flex items-center mb-1">
                  <i className="fas fa-clock mr-2"></i>Predicted Time
                </div>
                <div className="text-2xl font-bold text-[--foreground]">{Math.round(displayRec?.distance_info?.duration_hours || displayRec?.stats?.estimated_hours || 0) || '--'} hrs</div>
              </div>
              <div className="bg-[--background] rounded-lg p-4 border border-[--border]">
                <div className="text-xs text-[--muted-foreground] flex items-center mb-1">
                  <i className="fas fa-rupee-sign mr-2"></i>Predicted Cost
                </div>
                <div className="text-2xl font-bold text-[--foreground]">₹{Number(
                  (displayRec?.stats?.cost_breakdown?.total_inr)
                  ?? (displayRec?.stats?.average_cost)
                  ?? Math.round(((displayRec?.distance_info?.distance_km || 0) * 8) + 200)
                ).toLocaleString()}</div>
              </div>
              <div className="bg-[--background] rounded-lg p-4 border border-[--border]">
                <div className="text-xs text-[--muted-foreground] flex items-center mb-1">
                  <i className="fas fa-exclamation-triangle mr-2"></i>Risk Level
                </div>
                <div className="text-sm">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                    displayRec?.stats?.risk_level === 'high' ? 'bg-red-100 text-red-700' :
                    displayRec?.stats?.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {displayRec?.stats?.risk_level || 'low'}
                  </span>
                </div>
              </div>
            </div>

            {/* Weather Along Route */}
            {displayRec.weather_points && displayRec.weather_points.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center mb-3">
                  <i className="fas fa-cloud-sun text-orange-500 mr-2"></i>
                  <h5 className="font-semibold text-[--foreground]">Weather Along Route <span className="text-xs text-[--muted-foreground]">{loading ? '(updating...)' : ''}</span></h5>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayRec.weather_points.map((point, idx) => (
                    <div key={idx} className="bg-[--background] rounded-lg p-4 border border-[--border]">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-[--foreground]">{point.position || point.name || `Point ${idx + 1}`}</div>
                          {point.label && <div className="text-xs text-[--muted-foreground]">{point.label}</div>}
                        </div>
                        <i className="fas fa-cloud text-orange-400"></i>
                      </div>
                      <div className="mt-3">
                        <div className="text-3xl font-bold text-[--foreground]">{(point.weather?.temp_c ?? point.weather?.temp ?? '--')}°C</div>
                        <div className="text-sm text-[--muted-foreground]">{point.weather?.description || point.weather?.weather || ''}</div>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-xs text-[--muted-foreground]">
                        <span><i className="fas fa-wind mr-1"></i>{(point.weather?.wind_m_s ?? point.weather?.wind ?? '--')} m/s</span>
                        <span className="px-2 py-0.5 rounded bg-[--sidebar] border border-[--border]">open-meteo</span>
                      </div>
                      {(point.lat || point.lon || point.coords) && (
                        <div className="mt-2 text-[10px] text-[--muted-foreground]">
                          {(() => {
                            const lat = point.lat ?? point.coords?.[0];
                            const lon = point.lon ?? point.coords?.[1];
                            return lat != null && lon != null ? `${lat.toFixed?.(4) || lat}, ${lon.toFixed?.(4) || lon}` : '';
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cost Breakdown (AI-recommended mode) */}
            <div className="mb-6">
              <div className="flex items-center mb-3">
                <i className="fas fa-indian-rupee-sign text-orange-500 mr-2"></i>
                <h5 className="font-semibold text-[--foreground]">Cost Breakdown {displayRec?.recommended_mode ? <span className="text-xs text-[--muted-foreground]">({(displayRec?.recommended_mode || displayRec?.stats?.mode || '').toUpperCase()})</span> : null}</h5>
              </div>
              {(() => {
                const breakdown = displayRec?.stats?.cost_breakdown || displayRec?.stats?.components || null;
                if (!breakdown) {
                  return (
                    <div className="bg-[--background] rounded-lg p-4 border border-[--border] text-sm text-[--muted-foreground]">
                      Detailed cost breakdown unavailable from source. Predicted total shown above.
                    </div>
                  );
                }
                const entries = Object.entries(breakdown).filter(([k]) => k !== 'total_inr' && k !== 'calculation_note');
                const totalVal = Number(breakdown?.total_inr || 0);
                return (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {entries.map(([key, value], idx) => (
                        <div key={idx} className="bg-[--background] rounded-lg p-4 border border-[--border]">
                          <div className="text-[10px] text-[--muted-foreground] tracking-wider font-semibold mb-1">{key.toUpperCase()}</div>
                          <div className="text-xl font-bold text-[--foreground]">₹{Number(value || 0).toLocaleString()}</div>
                        </div>
                      ))}
                      {/* Total card */}
                      <div className="bg-[--background] rounded-lg p-4 border border-[--border]">
                        <div className="text-[10px] text-[--muted-foreground] tracking-wider font-semibold mb-1">TOTAL</div>
                        <div className="text-xl font-bold text-[--foreground]">₹{totalVal.toLocaleString()}</div>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
