import React, { useState, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const ProviderComparison = ({ origin, destination, onClose, onSelectProvider }) => {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recommendation, setRecommendation] = useState('');

  useEffect(() => {
    if (origin && destination) {
      fetchProviders();
    }
  }, [origin, destination]);

  const fetchProviders = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/logistics/shipments/providers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ origin, destination }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        setProviders(result.providers.providers || []);
        setRecommendation(result.providers.gemini_summary || '');
      } else {
        setError('Failed to fetch provider comparison');
      }
    } catch (err) {
      setError('Error fetching providers: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const getModeIcon = (mode) => {
    switch (mode?.toLowerCase()) {
      case 'road': return 'truck';
      case 'rail': return 'train';
      case 'air': return 'plane';
      case 'sea': return 'ship';
      default: return 'truck';
    }
  };

  const getRatingStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    
    for (let i = 0; i < fullStars; i++) {
      stars.push(<i key={i} className="fas fa-star text-yellow-400"></i>);
    }
    
    if (hasHalfStar) {
      stars.push(<i key="half" className="fas fa-star-half-alt text-yellow-400"></i>);
    }
    
    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(<i key={`empty-${i}`} className="far fa-star text-gray-300"></i>);
    }
    
    return stars;
  };

  if (!origin || !destination) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[--background] rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[--border] flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-[--foreground] flex items-center">
              <i className="fas fa-balance-scale mr-2 text-[--primary]"></i>
              Provider Comparison
            </h2>
            <p className="text-sm text-[--muted-foreground] mt-1">
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
              <p className="text-[--muted-foreground]">Comparing providers...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <i className="fas fa-exclamation-triangle text-2xl text-red-500 mb-4"></i>
              <p className="text-red-600">{error}</p>
              <button 
                onClick={fetchProviders}
                className="mt-4 px-4 py-2 bg-[--primary] text-[--primary-foreground] rounded-md hover:opacity-90"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* AI Recommendation */}
              {recommendation && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h3 className="font-semibold text-blue-800 mb-2 flex items-center">
                    <i className="fas fa-robot mr-2"></i>
                    AI Recommendation
                  </h3>
                  <p className="text-blue-700 text-sm">{recommendation}</p>
                </div>
              )}

              {/* Providers Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {providers.map((provider, index) => (
                  <div 
                    key={index}
                    className="border border-[--border] rounded-lg p-4 hover:shadow-md transition-shadow bg-[--sidebar]"
                  >
                    {/* Provider Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <i className={`fas fa-${getModeIcon(provider.mode)} text-[--primary]`}></i>
                        <h3 className="font-semibold text-[--foreground]">{provider.provider}</h3>
                      </div>
                      {index === 0 && (
                        <span className="px-2 py-1 bg-green-100 text-green-600 text-xs font-medium rounded">
                          Recommended
                        </span>
                      )}
                    </div>

                    {/* Transport Mode */}
                    <div className="mb-3">
                      <span className="text-sm text-[--muted-foreground]">Mode: </span>
                      <span className="text-sm font-medium capitalize">{provider.mode}</span>
                    </div>

                    {/* Key Metrics */}
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between">
                        <span className="text-sm text-[--muted-foreground]">Cost:</span>
                        <span className="text-sm font-semibold text-[--foreground]">
                          ₹{provider.estimated_cost?.toLocaleString('en-IN')}
                        </span>
                      </div>
                      
                      <div className="flex justify-between">
                        <span className="text-sm text-[--muted-foreground]">Time:</span>
                        <span className="text-sm font-medium">
                          {provider.estimated_time_hours}h
                        </span>
                      </div>

                      <div className="flex justify-between items-center">
                        <span className="text-sm text-[--muted-foreground]">Rating:</span>
                        <div className="flex items-center gap-1">
                          {getRatingStars(provider.rating || 4.2)}
                          <span className="text-xs text-[--muted-foreground] ml-1">
                            ({provider.rating || 4.2})
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-between">
                        <span className="text-sm text-[--muted-foreground]">Reliability:</span>
                        <span className="text-sm font-medium">
                          {provider.reliability || 95}%
                        </span>
                      </div>
                    </div>

                    {/* Features */}
                    {provider.features && (
                      <div className="mb-4">
                        <div className="text-xs text-[--muted-foreground] mb-2">Features:</div>
                        <div className="flex flex-wrap gap-1">
                          {provider.features.slice(0, 3).map((feature, idx) => (
                            <span 
                              key={idx}
                              className="px-2 py-1 bg-[--muted] text-xs rounded"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {provider.notes && (
                      <div className="mb-4">
                        <div className="text-xs text-[--muted-foreground] mb-1">Notes:</div>
                        <p className="text-xs text-[--foreground]">{provider.notes}</p>
                      </div>
                    )}

                    {/* Select Button */}
                    <button
                      onClick={() => onSelectProvider && onSelectProvider(provider)}
                      className="w-full px-4 py-2 bg-[--primary] text-[--primary-foreground] rounded-md hover:opacity-90 transition-opacity text-sm font-medium"
                    >
                      Select Provider
                    </button>
                  </div>
                ))}
              </div>

              {providers.length === 0 && (
                <div className="text-center py-8">
                  <i className="fas fa-search text-2xl text-[--muted-foreground] mb-4"></i>
                  <p className="text-[--muted-foreground]">No providers found for this route</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProviderComparison;