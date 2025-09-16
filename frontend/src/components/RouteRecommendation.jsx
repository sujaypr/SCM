import React from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

export default function RouteRecommendation({ recommendation, className = '', loading = false }) {
  if (!recommendation) return null;

  const getWeatherIcon = (summary) => {
    const lowerSummary = summary?.toLowerCase() || '';
    if (lowerSummary.includes('rain') || lowerSummary.includes('storm')) return 'cloud-rain';
    if (lowerSummary.includes('snow')) return 'snowflake';
    if (lowerSummary.includes('cloud')) return 'cloud';
    if (lowerSummary.includes('sun') || lowerSummary.includes('clear')) return 'sun';
    if (lowerSummary.includes('wind')) return 'wind';
    return 'cloud-sun';
  };

  const getWeatherColor = (summary) => {
    const lowerSummary = summary?.toLowerCase() || '';
    if (lowerSummary.includes('severe') || lowerSummary.includes('danger')) return 'text-red-500';
    if (lowerSummary.includes('warning') || lowerSummary.includes('caution')) return 'text-yellow-500';
    if (lowerSummary.includes('good') || lowerSummary.includes('clear')) return 'text-green-500';
    return 'text-[--primary]';
  };

  const getModeIcon = (mode) => {
    const lowerMode = mode?.toLowerCase() || '';
    if (lowerMode.includes('air')) return 'plane';
    if (lowerMode.includes('sea')) return 'ship';
    if (lowerMode.includes('rail')) return 'train';
    return 'truck';
  };

  // User-friendly weather error detection
  const weatherErrorMsg = (weather) => {
    if (!weather) return null;
    if (typeof weather === 'string' && weather.toLowerCase().includes('error')) return weather;
    if (weather.error) return weather.error;
    if (weather.description && weather.description.toLowerCase().includes('error')) return weather.description;
    if (weather.condition && weather.condition.toLowerCase().includes('error')) return weather.condition;
    if (weather.description && weather.description.toLowerCase().includes('rate_limited')) return 'Weather data temporarily unavailable (rate limited).';
    if (weather.error && weather.error.toLowerCase().includes('rate_limited')) return 'Weather data temporarily unavailable (rate limited).';
    return null;
  };

  const originWeatherError = weatherErrorMsg(recommendation.origin_weather);
  const destWeatherError = weatherErrorMsg(recommendation.destination_weather);

  return (
    <div className={`bg-[--background] rounded-lg border border-[--border] overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-[--border] bg-[--sidebar]">
        <h3 className="flex items-center text-lg font-semibold">
          <i className="fas fa-route text-[--primary] mr-2"></i>
          Route Analysis & Recommendations
        </h3>
      </div>

      <div className="p-6 space-y-6">
        {loading && (
          <div className="flex items-center space-x-2 text-sm text-[--muted-foreground]">
            <svg className="animate-spin h-4 w-4 text-[--primary]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
            <div>Refreshing recommendation...</div>
          </div>
        )}
        {/* Primary Recommendation */}
        <div className="bg-[--primary]/5 rounded-lg p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-[--primary]/10 text-[--primary]">
              <i className={`fas fa-${getModeIcon(recommendation.recommended_mode)} text-xl`}></i>
            </div>
            <div className="ml-4">
              <h4 className="font-semibold text-lg mb-1">Recommended Transport Mode</h4>
              <p className="text-[--muted-foreground]">
                {recommendation.recommended_mode}
              </p>
              {recommendation.reason && (
                <p className="mt-2 text-sm text-[--foreground]">
                  {recommendation.reason}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Weather Analysis */}
        {(recommendation.weather_summary || originWeatherError || destWeatherError) && (
          <div className="bg-[--sidebar] rounded-lg p-4">
            <div className="flex items-start">
              <div className={`flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-[--background] ${getWeatherColor(recommendation.weather_summary)}`}>
                <i className={`fas fa-${getWeatherIcon(recommendation.weather_summary)} text-xl`}></i>
              </div>
              <div className="ml-4">
                <h4 className="font-semibold text-lg mb-1">Weather Conditions</h4>
                {recommendation.weather_summary && (
                  <p className="text-[--muted-foreground]">
                    {recommendation.weather_summary}
                  </p>
                )}
                {originWeatherError && (
                  <p className="text-red-500 text-sm mt-1">Origin weather unavailable: {originWeatherError}</p>
                )}
                {destWeatherError && (
                  <p className="text-red-500 text-sm mt-1">Destination weather unavailable: {destWeatherError}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* AI Analysis */}
        {recommendation.gemini_summary && (
          <div className="bg-[--sidebar] rounded-lg p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-[--background] text-[--primary]">
                <i className="fas fa-robot text-xl"></i>
              </div>
              <div className="ml-4">
                <h4 className="font-semibold text-lg mb-1">AI Analysis</h4>
                <p className="text-[--muted-foreground] whitespace-pre-wrap">
                  {recommendation.gemini_summary}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Route Stats */}
        {recommendation.stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {/* Distance */}
            <div className="bg-[--sidebar] rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[--muted-foreground]">Distance</p>
                  <p className="text-lg font-semibold">{recommendation.stats.distance} km</p>
                </div>
                <i className="fas fa-road text-xl text-[--primary]"></i>
              </div>
            </div>

            {/* Estimated Time */}
            <div className="bg-[--sidebar] rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[--muted-foreground]">Est. Time</p>
                  <p className="text-lg font-semibold">{recommendation.stats.estimated_hours} hours</p>
                </div>
                <i className="fas fa-clock text-xl text-[--primary]"></i>
              </div>
            </div>

            {/* Average Cost */}
            <div className="bg-[--sidebar] rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[--muted-foreground]">Avg. Cost</p>
                  <p className="text-lg font-semibold">₹{recommendation.stats.average_cost?.toLocaleString('en-IN')}</p>
                </div>
                <i className="fas fa-tags text-xl text-[--primary]"></i>
              </div>
            </div>

            {/* Risk Level */}
            <div className="bg-[--sidebar] rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[--muted-foreground]">Risk Level</p>
                  <p className="text-lg font-semibold capitalize">{recommendation.stats.risk_level || 'Low'}</p>
                </div>
                <i className="fas fa-shield-alt text-xl text-[--primary]"></i>
              </div>
            </div>
          </div>
        )}

        {/* Additional Notes or Warnings */}
        {recommendation.warnings?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4">
            <h4 className="font-semibold mb-2 flex items-center">
              <i className="fas fa-exclamation-triangle mr-2"></i>
              Important Notes
            </h4>
            <ul className="list-disc list-inside space-y-1">
              {recommendation.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}