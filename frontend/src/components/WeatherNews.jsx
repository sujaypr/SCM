import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '@fortawesome/fontawesome-free/css/all.min.css';

export default function WeatherNews({ origin, destination, onError }) {
  const [loading, setLoading] = useState(false);
  const [weather, setWeather] = useState(null);
  const [news, setNews] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (origin && destination) {
      fetchData();
    }
  }, [origin, destination]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch both weather and news data in parallel
      const [weatherRes, newsRes] = await Promise.all([
        axios.get(`/api/logistics/weather/route?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`),
        axios.get(`/api/logistics/news/route?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`)
      ]);

      setWeather(weatherRes.data);
      setNews(newsRes.data);
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to fetch data';
      setError(errorMsg);
      if (onError) onError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const getWeatherIcon = (condition) => {
    const iconMap = {
      'Clear': 'sun',
      'Clouds': 'cloud',
      'Rain': 'cloud-rain',
      'Snow': 'snowflake',
      'Thunderstorm': 'bolt',
      'Drizzle': 'cloud-rain',
      'Mist': 'smog',
      'Smoke': 'smog',
      'Haze': 'smog',
      'Dust': 'smog',
      'Fog': 'smog',
      'Sand': 'wind',
      'Ash': 'smog',
      'Squall': 'wind',
      'Tornado': 'tornado'
    };

    return iconMap[condition] || 'cloud';
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Weather Section */}
      <div className="bg-[--sidebar] rounded-lg border border-[--border] p-6">
        <h3 className="text-lg font-semibold mb-4">
          <i className="fas fa-cloud-sun text-[--primary] mr-2"></i>
          Weather Conditions
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <i className="fas fa-spinner fa-spin text-2xl text-[--primary]"></i>
          </div>
        ) : error ? (
          <div className="text-red-500 p-4">
            <i className="fas fa-exclamation-circle mr-2"></i>
            {error}
          </div>
        ) : weather ? (
          <div className="space-y-6">
            {/* Origin Weather */}
            <div className="bg-[--background] rounded-lg p-4">
              <div className="text-sm text-[--muted-foreground] mb-2">Origin: {origin}</div>
              <div className="flex items-center">
                <i className={`fas fa-${getWeatherIcon(weather.origin.condition)} text-3xl text-[--primary] mr-4`}></i>
                <div>
                  <div className="text-2xl font-semibold">{weather.origin.temp}°C</div>
                  <div className="text-[--muted-foreground]">{weather.origin.description}</div>
                </div>
              </div>
            </div>

            {/* Destination Weather */}
            <div className="bg-[--background] rounded-lg p-4">
              <div className="text-sm text-[--muted-foreground] mb-2">Destination: {destination}</div>
              <div className="flex items-center">
                <i className={`fas fa-${getWeatherIcon(weather.destination.condition)} text-3xl text-[--primary] mr-4`}></i>
                <div>
                  <div className="text-2xl font-semibold">{weather.destination.temp}°C</div>
                  <div className="text-[--muted-foreground]">{weather.destination.description}</div>
                </div>
              </div>
            </div>

            {weather.alerts && weather.alerts.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 mt-4">
                <div className="font-semibold mb-2">
                  <i className="fas fa-exclamation-triangle mr-2"></i>
                  Weather Alerts
                </div>
                <ul className="list-disc list-inside space-y-1">
                  {weather.alerts.map((alert, index) => (
                    <li key={index}>{alert}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* News Section */}
      <div className="bg-[--sidebar] rounded-lg border border-[--border] p-6">
        <h3 className="text-lg font-semibold mb-4">
          <i className="fas fa-newspaper text-[--primary] mr-2"></i>
          Route Updates
        </h3>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <i className="fas fa-spinner fa-spin text-2xl text-[--primary]"></i>
          </div>
        ) : error ? (
          <div className="text-red-500 p-4">
            <i className="fas fa-exclamation-circle mr-2"></i>
            {error}
          </div>
        ) : news && news.articles ? (
          <div className="space-y-4">
            {news.articles.map((article, index) => (
              <div key={index} className="bg-[--background] rounded-lg p-4">
                <h4 className="font-medium mb-2">{article.title}</h4>
                <p className="text-sm text-[--muted-foreground] mb-3">{article.description}</p>
                <div className="flex justify-between items-center text-xs text-[--muted-foreground]">
                  <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                  <a 
                    href={article.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[--primary] hover:underline"
                  >
                    Read More
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-[--muted-foreground] py-8">
            No relevant news found for this route
          </div>
        )}
      </div>
    </div>
  );
}