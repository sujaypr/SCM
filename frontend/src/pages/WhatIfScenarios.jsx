import React, { useState } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const WhatIfScenarios = () => {
  const [scenarioData, setScenarioData] = useState({
    baseSales: 100000,
    priceChange: 0,
    marketingSpend: 0,
    seasonalFactor: 1.0,
    competitorAction: 'none'
  });

  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setScenarioData(prev => ({
      ...prev,
      [name]: name === 'competitorAction' ? value : parseFloat(value) || 0
    }));
  };

  const analyzeScenario = async () => {
    setLoading(true);

    try {
      const response = await fetch('/api/scenarios/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(scenarioData)
      });

      const result = await response.json();

      if (result.success) {
        setResults(result.results);
      } else {
        alert('Scenario analysis failed: ' + result.error);
      }
    } catch (error) {
      console.error('Error analyzing scenario:', error);
      alert('Error analyzing scenario. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getImpactColor = (impact) => {
    if (impact > 10) return 'green';
    if (impact > 0) return 'blue';
    if (impact > -10) return 'orange';
    return 'red';
  };

  return (
    <div className="max-w-[1100px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
      <div className="mb-8 text-left">
        <h2 className="text-2xl font-semibold text-[--foreground] mb-1">What-if Scenario Analysis</h2>
        <p className="text-[--muted-foreground]">Model different business strategies and their impact</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border] shadow">
          <h3 className="text-[--foreground] mb-4 font-semibold">Scenario Parameters</h3>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <label className="font-medium mb-2 text-[--foreground]">Base Monthly Sales (₹)</label>
              <input className="p-4 rounded-md bg-[--sidebar] text-[--card-foreground] border-2 border-[--border]" type="number" name="baseSales" value={scenarioData.baseSales} onChange={handleInputChange} min="10000" step="1000" />
            </div>

            <div className="flex flex-col">
              <label className="font-medium mb-2 text-[--foreground]">Price Change (%)</label>
              <input className="p-4 rounded-md bg-[--sidebar] text-[--card-foreground] border-2 border-[--border]" type="number" name="priceChange" value={scenarioData.priceChange} onChange={handleInputChange} min="-50" max="100" step="1" />
              <small className="mt-1 text-sm text-[--muted-foreground]">Positive values = price increase, Negative = price decrease</small>
            </div>

            <div className="flex flex-col">
              <label className="font-medium mb-2 text-[--foreground]">Marketing Spend (₹)</label>
              <input className="p-4 rounded-md bg-[--sidebar] text-[--card-foreground] border-2 border-[--border]" type="number" name="marketingSpend" value={scenarioData.marketingSpend} onChange={handleInputChange} min="0" step="5000" />
            </div>

            <div className="flex flex-col">
              <label className="font-medium mb-2 text-[--foreground]">Seasonal Factor</label>
              <input className="p-4 rounded-md bg-[--sidebar] text-[--card-foreground] border-2 border-[--border]" type="number" name="seasonalFactor" value={scenarioData.seasonalFactor} onChange={handleInputChange} min="0.1" max="3.0" step="0.1" />
              <small className="mt-1 text-sm text-[--muted-foreground]">1.0 = Normal, 1.5 = Festival season, 0.8 = Low season</small>
            </div>

            <div className="flex flex-col">
              <label className="font-medium mb-2 text-[--foreground]">Competitor Action</label>
              <select className="p-4 rounded-md bg-[--sidebar] text-[--card-foreground] border-2 border-[--border]" name="competitorAction" value={scenarioData.competitorAction} onChange={handleInputChange}>
                <option value="none">No Action</option>
                <option value="aggressive">Aggressive Competition</option>
                <option value="passive">Passive Response</option>
              </select>
            </div>

            <button className="px-6 py-3 rounded-md font-semibold bg-[--primary] text-[--primary-foreground] hover:-translate-y-0.5 transition" onClick={analyzeScenario} disabled={loading}>
              {loading ? 'Analyzing...' : 'Analyze Scenario'}
            </button>
          </div>
        </div>

        {results && (
          <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border] shadow">
            <h3 className="text-[--foreground] mb-4 font-semibold">Analysis Results</h3>
            <div className="grid md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-[var(--radius)] border border-[--border]">
                <h4 className="text-[--muted-foreground] mb-1">Baseline Sales</h4>
                <div className="text-xl font-bold text-[--foreground]">₹{results.baseline?.toLocaleString('en-IN')}</div>
              </div>
              <div className="p-4 rounded-[var(--radius)] border border-[--border]">
                <h4 className="text-[--muted-foreground] mb-1">Projected Sales</h4>
                <div className="text-xl font-bold text-[--foreground]">₹{results.projected?.toLocaleString('en-IN')}</div>
              </div>
              <div className="p-4 rounded-[var(--radius)] border border-[--border]">
                <h4 className="text-[--muted-foreground] mb-1">Total Impact</h4>
                <div className={`text-xl font-bold ${getImpactColor(results.totalImpact) === 'green' ? 'text-green-500' : getImpactColor(results.totalImpact) === 'blue' ? 'text-blue-500' : getImpactColor(results.totalImpact) === 'orange' ? 'text-orange-400' : 'text-red-500'}`}>
                  {results.totalImpact > 0 ? '+' : ''}{results.totalImpact}%
                </div>
              </div>
            </div>

            {results.breakdown && (
              <div>
                <h4 className="text-[--foreground] mb-3">Impact Breakdown</h4>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between p-3 rounded-md border border-[--border]">
                    <span className="text-[--muted-foreground]">Price Impact:</span>
                    <span className={`${getImpactColor(results.breakdown.price) === 'green' ? 'text-green-500' : getImpactColor(results.breakdown.price) === 'blue' ? 'text-blue-500' : getImpactColor(results.breakdown.price) === 'orange' ? 'text-orange-400' : 'text-red-500'} font-semibold`}>
                      {results.breakdown.price > 0 ? '+' : ''}{results.breakdown.price}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border border-[--border]">
                    <span className="text-[--muted-foreground]">Marketing Impact:</span>
                    <span className={`${getImpactColor(results.breakdown.marketing) === 'green' ? 'text-green-500' : getImpactColor(results.breakdown.marketing) === 'blue' ? 'text-blue-500' : getImpactColor(results.breakdown.marketing) === 'orange' ? 'text-orange-400' : 'text-red-500'} font-semibold`}>
                      {results.breakdown.marketing > 0 ? '+' : ''}{results.breakdown.marketing}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border border-[--border]">
                    <span className="text-[--muted-foreground]">Seasonal Impact:</span>
                    <span className={`${getImpactColor(results.breakdown.seasonal) === 'green' ? 'text-green-500' : getImpactColor(results.breakdown.seasonal) === 'blue' ? 'text-blue-500' : getImpactColor(results.breakdown.seasonal) === 'orange' ? 'text-orange-400' : 'text-red-500'} font-semibold`}>
                      {results.breakdown.seasonal > 0 ? '+' : ''}{results.breakdown.seasonal}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-md border border-[--border]">
                    <span className="text-[--muted-foreground]">Competitor Impact:</span>
                    <span className={`${getImpactColor(results.breakdown.competitor) === 'green' ? 'text-green-500' : getImpactColor(results.breakdown.competitor) === 'blue' ? 'text-blue-500' : getImpactColor(results.breakdown.competitor) === 'orange' ? 'text-orange-400' : 'text-red-500'} font-semibold`}>
                      {results.breakdown.competitor > 0 ? '+' : ''}{results.breakdown.competitor}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {results.recommendation && (
              <div className="mt-6">
                <h4 className="text-[--foreground] mb-2">AI Recommendation</h4>
                <p className="text-[--muted-foreground]">{results.recommendation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatIfScenarios;