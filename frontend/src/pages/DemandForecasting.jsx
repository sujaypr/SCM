
import React, { useState } from 'react';
import { useBusinessInfo } from '../context/BusinessInfoContext.jsx';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { Tabs, Tab } from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LabelList } from 'recharts';

const DemandForecasting = () => {
  const { businessInfo } = useBusinessInfo();

  const [forecastPeriod, setForecastPeriod] = useState(6);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState(0);

  // --- CSV helpers ---
  const csvEscape = (val) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  const toCSV = (rows) => {
    if (!rows || rows.length === 0) return '';
    const headerKeys = Array.from(
      rows.reduce((acc, r) => {
        Object.keys(r).forEach((k) => acc.add(k));
        return acc;
      }, new Set())
    );
    const header = headerKeys.map(csvEscape).join(',');
    const body = rows
      .map((r) => headerKeys.map((k) => csvEscape(r[k])).join(','))
      .join('\n');
    return header + '\n' + body;
  };

  const downloadText = (filename, content) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadFestivalChartCSV = () => {
    const rows = (forecast?.festival_demands?.chart || []).map((d) => ({
      festival: d.festival,
      date: d.date,
      month: d.month,
      year: d.year,
      demand_increase: d.demand_increase,
    }));
    downloadText('festival_chart.csv', toCSV(rows));
  };

  const downloadFestivalTopItemsCSV = () => {
    const rows = [];
    const items = forecast?.festival_demands?.top_items || {};
    Object.entries(items).forEach(([label, lists]) => {
      (lists.this_year || []).forEach((item) => rows.push({ festival: label, bucket: 'this_year', item }));
      (lists.last_year || []).forEach((item) => rows.push({ festival: label, bucket: 'last_year', item }));
    });
    downloadText('festival_top_items.csv', toCSV(rows));
  };

  const downloadSeasonalChartCSV = () => {
    const rows = (forecast?.seasonal_demands?.chart || []).map((d) => ({
      season: d.season,
      start: d.start,
      end: d.end,
      demand_surge: d.demand_surge,
    }));
    downloadText('seasonal_chart.csv', toCSV(rows));
  };

  const downloadSeasonalTopItemsCSV = () => {
    const rows = [];
    const items = forecast?.seasonal_demands?.top_items || {};
    Object.entries(items).forEach(([label, lists]) => {
      (lists.this_year || []).forEach((item) => rows.push({ season: label, bucket: 'this_year', item }));
      (lists.last_year || []).forEach((item) => rows.push({ season: label, bucket: 'last_year', item }));
    });
    downloadText('seasonal_top_items.csv', toCSV(rows));
  };

  const handleForecast = async () => {
    setLoading(true);
    try {
      const response = await fetch('http://localhost:8000/api/demand/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...businessInfo, forecastPeriod })
      });
      const result = await response.json();
      if (result.success) {
        setForecast(result.forecast);
      } else {
        alert('Forecast generation failed: ' + result.error);
      }
    } catch (error) {
      console.error('Error generating forecast:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!businessInfo) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 32, textAlign: 'center' }}>
        <h3>Please enter your business info in Settings first.</h3>
      </div>
    );
  }


  return (
    <div className="max-w-[900px] mx-auto p-8">
      <div className="mb-8 text-center">
        <h2 className="font-semibold text-[28px] mb-2">Demand Forecasting</h2>
      </div>

      <div className="mb-6">
  <label className="font-medium mr-3">Forecast Period:</label>
  <select className="px-2 py-1 rounded-md bg-[--sidebar] text-[--foreground] border border-[--border]" value={forecastPeriod} onChange={e => setForecastPeriod(Number(e.target.value))}>
          <option value={3}>3 Months</option>
          <option value={6}>6 Months</option>
          <option value={12}>12 Months</option>
        </select>
        <button className="ml-4 px-4 py-2 rounded-md font-semibold bg-[--primary] text-[--primary-foreground] hover:-translate-y-0.5 transition inline-flex items-center gap-2" onClick={handleForecast} disabled={loading}>
          {loading ? <><i className="fas fa-spinner fa-spin"></i> Analyzing...</> : <>Generate Forecast</>}
        </button>
      </div>

      {forecast && (
  <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border] shadow">
          {/* Forecast window summary */}
          <div style={{ marginBottom: 16, color: 'var(--muted-foreground)' }}>
            <div><strong>Window:</strong> {forecast.forecast_start} → {forecast.forecast_end}</div>
            <div style={{ fontSize: 13 }}>
              Festivals: {forecast.festival_demands?.chart?.length || 0} · Seasons: {forecast.seasonal_demands?.chart?.length || 0}
            </div>
          </div>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} centered style={{ marginBottom: 24 }}>
            <Tab label="Product Demands" />
            <Tab label="Festival Demands" />
            <Tab label="Seasonal Demands" />
          </Tabs>

          {/* Product Demands Tab */}
          {tab === 0 && (
            <div>
              <h3>Top 10 Most In-Demand Products</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {forecast.product_demands && forecast.product_demands.map((item, idx) => (
                  <li key={item.product} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span>{idx + 1}. {item.product}</span>
                    <span style={{ fontWeight: 600 }}>{item.demand_percentage}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Festival Demands Tab */}
          {tab === 1 && (
            <div>
              <h3>Festival Demand Increase (%)</h3>
              <div className="flex gap-2 mb-2">
                <button className="px-3 py-2 rounded-md border text-sm" onClick={downloadFestivalChartCSV}>Download Festival Chart CSV</button>
                <button className="px-3 py-2 rounded-md border text-sm" onClick={downloadFestivalTopItemsCSV}>Download Festival Top Items CSV</button>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={forecast.festival_demands.chart} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis 
                    dataKey="festival" 
                    tick={{ angle: -30, textAnchor: 'end', fill: 'var(--foreground)', fontSize: 12 }} 
                    interval={0} 
                    height={70}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis 
                    tick={{ fill: 'var(--foreground)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={{ stroke: 'var(--border)' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--sidebar)', 
                      border: '1px solid var(--border)', 
                      borderRadius: 'var(--radius)',
                      color: 'var(--foreground)'
                    }}
                  />
                  <Legend wrapperStyle={{ color: 'var(--foreground)' }} />
                  <Bar dataKey="demand_increase" fill="var(--primary)">
                    <LabelList dataKey="demand_increase" position="top" fill="var(--foreground)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-6">
                <h4>Top 3 Items for Each Festival</h4>
                {forecast.festival_demands.top_items && Object.entries(forecast.festival_demands.top_items).map(([festival, items]) => (
                  <details key={festival} className="mb-2">
                    <summary className="cursor-pointer font-semibold">{festival}</summary>
                    <div className="flex gap-8 mt-2">
                      <div>
                        <span className="font-medium">This Year:</span>
                        <ul className="pl-4 m-0">
                          {items.this_year.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                      <div>
                        <span className="font-medium">Last Year:</span>
                        <ul className="pl-4 m-0">
                          {items.last_year.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          {/* Seasonal Demands Tab */}
          {tab === 2 && (
            <div>
              <h3>Seasonal Demand Surge (%)</h3>
              <div className="flex gap-2 mb-2">
                <button className="px-3 py-2 rounded-md border text-sm" onClick={downloadSeasonalChartCSV}>Download Seasonal Chart CSV</button>
                <button className="px-3 py-2 rounded-md border text-sm" onClick={downloadSeasonalTopItemsCSV}>Download Seasonal Top Items CSV</button>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={forecast.seasonal_demands.chart} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis 
                    dataKey="season" 
                    tick={{ angle: -30, textAnchor: 'end', fill: 'var(--foreground)', fontSize: 12 }} 
                    interval={0} 
                    height={70}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={{ stroke: 'var(--border)' }}
                  />
                  <YAxis 
                    tick={{ fill: 'var(--foreground)', fontSize: 12 }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={{ stroke: 'var(--border)' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'var(--sidebar)', 
                      border: '1px solid var(--border)', 
                      borderRadius: 'var(--radius)',
                      color: 'var(--foreground)'
                    }}
                  />
                  <Legend wrapperStyle={{ color: 'var(--foreground)' }} />
                  <Bar dataKey="demand_surge" fill="var(--chart-3)">
                    <LabelList dataKey="demand_surge" position="top" fill="var(--foreground)" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-6">
                <h4>Top 3 Items for Each Season</h4>
                {forecast.seasonal_demands.top_items && Object.entries(forecast.seasonal_demands.top_items).map(([season, items]) => (
                  <details key={season} className="mb-2">
                    <summary className="cursor-pointer font-semibold">{season}</summary>
                    <div className="flex gap-8 mt-2">
                      <div>
                        <span className="font-medium">This Year:</span>
                        <ul className="pl-4 m-0">
                          {items.this_year.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                      <div>
                        <span className="font-medium">Last Year:</span>
                        <ul className="pl-4 m-0">
                          {items.last_year.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DemandForecasting;