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
    <div className="whatif-scenarios">
      <div className="page-header">
  <h2>What-if Scenario Analysis</h2>
        <p>Model different business strategies and their impact</p>
      </div>

      <div className="scenarios-container">
        <div className="scenario-inputs">
          <h3>Scenario Parameters</h3>

          <div className="form-group">
            <label>Base Monthly Sales (₹)</label>
            <input
              type="number"
              name="baseSales"
              value={scenarioData.baseSales}
              onChange={handleInputChange}
              min="10000"
              step="1000"
            />
          </div>

          <div className="form-group">
            <label>Price Change (%)</label>
            <input
              type="number"
              name="priceChange"
              value={scenarioData.priceChange}
              onChange={handleInputChange}
              min="-50"
              max="100"
              step="1"
            />
            <small>Positive values = price increase, Negative = price decrease</small>
          </div>

          <div className="form-group">
            <label>Marketing Spend (₹)</label>
            <input
              type="number"
              name="marketingSpend"
              value={scenarioData.marketingSpend}
              onChange={handleInputChange}
              min="0"
              step="5000"
            />
          </div>

          <div className="form-group">
            <label>Seasonal Factor</label>
            <input
              type="number"
              name="seasonalFactor"
              value={scenarioData.seasonalFactor}
              onChange={handleInputChange}
              min="0.1"
              max="3.0"
              step="0.1"
            />
            <small>1.0 = Normal, 1.5 = Festival season, 0.8 = Low season</small>
          </div>

          <div className="form-group">
            <label>Competitor Action</label>
            <select
              name="competitorAction"
              value={scenarioData.competitorAction}
              onChange={handleInputChange}
            >
              <option value="none">No Action</option>
              <option value="aggressive">Aggressive Competition</option>
              <option value="passive">Passive Response</option>
            </select>
          </div>

          <button 
            className="btn btn-primary btn-large"
            onClick={analyzeScenario}
            disabled={loading}
          >
            {loading ? 'Analyzing...' : 'Analyze Scenario'}
          </button>
        </div>

        {results && (
          <div className="scenario-results">
            <h3>Analysis Results</h3>

            <div className="results-summary">
              <div className="result-card">
                <h4>Baseline Sales</h4>
                <div className="result-value">₹{results.baseline?.toLocaleString('en-IN')}</div>
              </div>

              <div className="result-card">
                <h4>Projected Sales</h4>
                <div className="result-value">₹{results.projected?.toLocaleString('en-IN')}</div>
              </div>

              <div className="result-card">
                <h4>Total Impact</h4>
                <div className={`result-value impact-${getImpactColor(results.totalImpact)}`}>
                  {results.totalImpact > 0 ? '+' : ''}{results.totalImpact}%
                </div>
              </div>
            </div>

            {results.breakdown && (
              <div className="impact-breakdown">
                <h4>Impact Breakdown</h4>
                <div className="breakdown-grid">
                  <div className="breakdown-item">
                    <span className="breakdown-label">Price Impact:</span>
                    <span className={`breakdown-value impact-${getImpactColor(results.breakdown.price)}`}>
                      {results.breakdown.price > 0 ? '+' : ''}{results.breakdown.price}%
                    </span>
                  </div>

                  <div className="breakdown-item">
                    <span className="breakdown-label">Marketing Impact:</span>
                    <span className={`breakdown-value impact-${getImpactColor(results.breakdown.marketing)}`}>
                      {results.breakdown.marketing > 0 ? '+' : ''}{results.breakdown.marketing}%
                    </span>
                  </div>

                  <div className="breakdown-item">
                    <span className="breakdown-label">Seasonal Impact:</span>
                    <span className={`breakdown-value impact-${getImpactColor(results.breakdown.seasonal)}`}>
                      {results.breakdown.seasonal > 0 ? '+' : ''}{results.breakdown.seasonal}%
                    </span>
                  </div>

                  <div className="breakdown-item">
                    <span className="breakdown-label">Competitor Impact:</span>
                    <span className={`breakdown-value impact-${getImpactColor(results.breakdown.competitor)}`}>
                      {results.breakdown.competitor > 0 ? '+' : ''}{results.breakdown.competitor}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {results.recommendation && (
              <div className="scenario-recommendation">
                <h4>AI Recommendation</h4>
                <p>{results.recommendation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatIfScenarios;