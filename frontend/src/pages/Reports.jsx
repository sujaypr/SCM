import React, { useState, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const Reports = () => {
  const [reportType, setReportType] = useState('executive-summary');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);

  const reportTypes = [
    { value: 'executive-summary', label: 'Executive Summary' },
    { value: 'sales', label: 'Sales Performance' },
    { value: 'inventory', label: 'Inventory Analysis' },
    { value: 'forecast-accuracy', label: 'Forecast Accuracy' }
  ];

  useEffect(() => {
    if (reportType) {
      generateReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType]);

  const generateReport = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reports/${reportType}`);
      const result = await response.json();
      if (result.success) {
        setReportData(result.report || result.summary);
      } else {
        setReportData(null);
      }
    } catch {
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  const renderExecutiveSummary = (data) => (
    <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border] shadow">
      <div className="mb-4">
        <h3 className="text-xl font-semibold text-[--foreground]">Executive Summary - {data.period}</h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="p-4 rounded-md border border-[--border]">
          <h4 className="text-[--muted-foreground]">Total Sales</h4>
          <div className="text-2xl font-bold text-[--foreground] mt-1">₹{data.total_sales?.toLocaleString('en-IN')}</div>
          <div className="text-green-600 bg-green-100 inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-2">+{data.growth_rate}%</div>
        </div>

        <div className="p-4 rounded-md border border-[--border]">
          <h4 className="text-[--muted-foreground]">Forecast Accuracy</h4>
          <div className="text-2xl font-bold text-[--foreground] mt-1">{data.forecast_accuracy}%</div>
          <div className="text-green-600 bg-green-100 inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-2">+8% QoQ</div>
        </div>

        <div className="p-4 rounded-md border border-[--border]">
          <h4 className="text-[--muted-foreground]">Inventory Turnover</h4>
          <div className="text-2xl font-bold text-[--foreground] mt-1">{data.inventory_turnover}</div>
          <div className="text-green-600 bg-green-100 inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-2">+15% improvement</div>
        </div>
      </div>

      <div className="mb-6">
        <h4 className="text-[--foreground] font-semibold mb-2">Key Insights</h4>
        <ul className="list-disc pl-5 text-[--foreground]">
          {data.key_insights && data.key_insights.map((insight, index) => (
            <li key={index}>{insight}</li>
          ))}
        </ul>
      </div>

      <div className="mb-6">
        <h4 className="text-[--foreground] font-semibold mb-2">Recommendations</h4>
        <ul className="list-disc pl-5 text-[--foreground]">
          {data.recommendations && data.recommendations.map((rec, index) => (
            <li key={index}>{rec}</li>
          ))}
        </ul>
      </div>

      <div>
        <h4 className="text-[--foreground] font-semibold mb-2">Alerts & Actions Required</h4>
        <ul className="list-disc pl-5 text-[--foreground]">
          {data.alerts && data.alerts.map((alert, index) => (
            <li key={index} className="text-[--foreground]">{alert}</li>
          ))}
        </ul>
      </div>
    </div>
  );

  const renderSalesReport = (data) => (
    <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border] shadow">
      <h3 className="text-xl font-semibold text-[--foreground] mb-4">Sales Performance Report</h3>

      <div className="flex gap-6 mb-4">
        <div className="text-[--foreground]"><span className="opacity-80">Total Sales:</span> <strong>₹{data.total_sales?.toLocaleString('en-IN')}</strong></div>
        <div className="text-[--foreground]"><span className="opacity-80">Average Growth:</span> <strong>{data.avg_growth}%</strong></div>
      </div>

      {data.data && (
        <div className="overflow-hidden rounded-[var(--radius)] border border-[--border] shadow">
          <table className="w-full bg-[--sidebar]">
            <thead>
              <tr>
                <th className="bg-[--muted] p-3 text-left border-b border-[--border]">Month</th>
                <th className="bg-[--muted] p-3 text-left border-b border-[--border]">Sales (₹)</th>
                <th className="bg-[--muted] p-3 text-left border-b border-[--border]">Growth (%)</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((item, index) => (
                <tr key={index}>
                  <td className="p-3 border-b border-[--muted]">{item.month}</td>
                  <td className="p-3 border-b border-[--muted]">₹{item.sales?.toLocaleString('en-IN')}</td>
                  <td className={`p-3 border-b border-[--muted] ${item.growth > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {item.growth > 0 ? '+' : ''}{item.growth}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-[1000px] mx-auto p-8">
      <div className="mb-8 text-left">
        <h2 className="flex items-center gap-2 text-[28px] font-semibold mb-1">
          <i className="fas fa-file-alt text-[--primary]"></i>
          Reports
        </h2>
        <p className="text-[--muted-foreground]">Generate and view detailed supply chain reports</p>
      </div>
      <div className="mb-6">
        <label className="mr-3">Select Report Type:</label>
        <select className="px-3 py-2 rounded-md bg-[--sidebar] text-[--foreground] border border-[--border]" value={reportType} onChange={(e) => setReportType(e.target.value)}>
          {reportTypes.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <div className="text-center mt-10">
          <i className="fas fa-spinner fa-spin text-[32px] text-[--primary]"></i>
          <div className="mt-3">Generating report...</div>
        </div>
      ) : !reportData ? (
        <div className="flex gap-6 flex-wrap justify-center mt-8">
          <div className="bg-[--sidebar] rounded-[var(--radius)] border border-[--border] shadow p-6 min-w-[280px]">
            <h3 className="flex items-center gap-2 font-medium text-lg mb-2"><i className="fas fa-chart-line text-[--primary]"></i>Demand Forecast Report</h3>
            <p className="text-[--muted-foreground] mb-3">Summary of demand predictions and trends</p>
            <button className="px-5 py-3 rounded-md bg-[--primary] text-[--primary-foreground] font-semibold flex items-center gap-2"><i className="fas fa-download"></i>Download</button>
          </div>
          <div className="bg-[--sidebar] rounded-[var(--radius)] border border-[--border] shadow p-6 min-w-[280px]">
            <h3 className="flex items-center gap-2 font-medium text-lg mb-2"><i className="fas fa-boxes text-[--primary]"></i>Inventory Status Report</h3>
            <p className="text-[--muted-foreground] mb-3">Current inventory levels and alerts</p>
            <button className="px-5 py-3 rounded-md bg-[--primary] text-[--primary-foreground] font-semibold flex items-center gap-2"><i className="fas fa-download"></i>Download</button>
          </div>
          <div className="bg-[--sidebar] rounded-[var(--radius)] border border-[--border] shadow p-6 min-w-[280px]">
            <h3 className="flex items-center gap-2 font-medium text-lg mb-2"><i className="fas fa-truck text-[--primary]"></i>Logistics Performance Report</h3>
            <p className="text-[--muted-foreground] mb-3">Shipment and delivery analytics</p>
            <button className="px-5 py-3 rounded-md bg-[--primary] text-[--primary-foreground] font-semibold flex items-center gap-2"><i className="fas fa-download"></i>Download</button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {reportType === 'executive-summary' && renderExecutiveSummary(reportData)}
          {reportType === 'sales' && renderSalesReport(reportData)}
          {reportType === 'inventory' && (
            <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border] shadow">
              <h3 className="text-xl font-semibold text-[--foreground] mb-4"><i className="fas fa-boxes mr-2 text-[--primary]"></i>Inventory Analysis Report</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="p-4 rounded-md border border-[--border] flex items-center justify-between">
                  <span className="text-[--muted-foreground]">Total Items:</span>
                  <strong className="text-[--foreground]">{reportData.total_items}</strong>
                </div>
                <div className="p-4 rounded-md border border-[--border] flex items-center justify-between">
                  <span className="text-[--muted-foreground]">Total Value:</span>
                  <strong className="text-[--foreground]">₹{reportData.total_value?.toLocaleString('en-IN')}</strong>
                </div>
                <div className="p-4 rounded-md border border-[--border] flex items-center justify-between">
                  <span className="text-[--muted-foreground]">Low Stock Items:</span>
                  <strong className="text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full text-sm">{reportData.stock_status?.low_stock}</strong>
                </div>
                <div className="p-4 rounded-md border border-[--border] flex items-center justify-between">
                  <span className="text-[--muted-foreground]">Critical Items:</span>
                  <strong className="text-red-600 bg-red-100 px-2 py-0.5 rounded-full text-sm">{reportData.stock_status?.critical}</strong>
                </div>
              </div>
            </div>
          )}
          {reportType === 'forecast-accuracy' && (
            <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border] shadow">
              <h3 className="text-xl font-semibold text-[--foreground] mb-4"><i className="fas fa-bullseye mr-2 text-[--primary]"></i>Forecast Accuracy Report</h3>
              <div className="p-4 rounded-md border border-[--border] inline-block">
                <h4 className="text-[--muted-foreground]">Overall Accuracy</h4>
                <div className="text-3xl font-bold text-[--foreground]">{reportData.overall_accuracy}%</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Reports;