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
    <div className="executive-summary">
      <div className="summary-header">
        <h3>Executive Summary - {data.period}</h3>
      </div>

      <div className="summary-metrics">
        <div className="metric-card">
          <h4>Total Sales</h4>
          <div className="metric-value">₹{data.total_sales?.toLocaleString('en-IN')}</div>
          <div className="metric-change positive">+{data.growth_rate}%</div>
        </div>

        <div className="metric-card">
          <h4>Forecast Accuracy</h4>
          <div className="metric-value">{data.forecast_accuracy}%</div>
          <div className="metric-change positive">+8% QoQ</div>
        </div>

        <div className="metric-card">
          <h4>Inventory Turnover</h4>
          <div className="metric-value">{data.inventory_turnover}</div>
          <div className="metric-change positive">+15% improvement</div>
        </div>
      </div>

      <div className="insights-section">
  <h4>Key Insights</h4>
        <ul>
          {data.key_insights && data.key_insights.map((insight, index) => (
            <li key={index}>{insight}</li>
          ))}
        </ul>
      </div>

      <div className="recommendations-section">
  <h4>Recommendations</h4>
        <ul>
          {data.recommendations && data.recommendations.map((rec, index) => (
            <li key={index}>{rec}</li>
          ))}
        </ul>
      </div>

      <div className="alerts-section">
  <h4>Alerts & Actions Required</h4>
        <ul>
          {data.alerts && data.alerts.map((alert, index) => (
            <li key={index} className="alert-item">{alert}</li>
          ))}
        </ul>
      </div>
    </div>
  );

  const renderSalesReport = (data) => (
    <div className="sales-report">
  <h3>Sales Performance Report</h3>

      <div className="sales-summary">
        <div className="summary-stat">
          <span>Total Sales:</span>
          <strong>₹{data.total_sales?.toLocaleString('en-IN')}</strong>
        </div>
        <div className="summary-stat">
          <span>Average Growth:</span>
          <strong>{data.avg_growth}%</strong>
        </div>
      </div>

      {data.data && (
        <div className="sales-data-table">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Sales (₹)</th>
                <th>Growth (%)</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((item, index) => (
                <tr key={index}>
                  <td>{item.month}</td>
                  <td>₹{item.sales?.toLocaleString('en-IN')}</td>
                  <td className={item.growth > 0 ? 'positive' : 'negative'}>
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
    <div className="reports">
      <div className="page-header">
        <h2 className="page-title">
          <i className="fas fa-file-alt icon"></i>
          Reports
        </h2>
        <p className="page-subtitle">Generate and view detailed supply chain reports</p>
      </div>
      <div className="reports-controls">
        <div className="report-selector">
          <label>Select Report Type:</label>
          <select 
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
          >
            {reportTypes.map(type => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {loading ? (
        <div className="loading">
          <i className="fas fa-spinner fa-spin loader-icon"></i>
          <div className="loader-text">Generating report...</div>
        </div>
      ) : !reportData ? (
        <div className="report-templates">
          <div className="report-card">
            <h3 className="report-title"><i className="fas fa-chart-line icon"></i>Demand Forecast Report</h3>
            <p className="report-desc">Summary of demand predictions and trends</p>
            <button className="btn btn-primary"><i className="fas fa-download icon"></i>Download</button>
          </div>
          <div className="report-card">
            <h3 className="report-title"><i className="fas fa-boxes icon"></i>Inventory Status Report</h3>
            <p className="report-desc">Current inventory levels and alerts</p>
            <button className="btn btn-primary"><i className="fas fa-download icon"></i>Download</button>
          </div>
          <div className="report-card">
            <h3 className="report-title"><i className="fas fa-truck icon"></i>Logistics Performance Report</h3>
            <p className="report-desc">Shipment and delivery analytics</p>
            <button className="btn btn-primary"><i className="fas fa-download icon"></i>Download</button>
          </div>
        </div>
      ) : (
        <div className="report-data">
          {reportType === 'executive-summary' && renderExecutiveSummary(reportData)}
          {reportType === 'sales' && renderSalesReport(reportData)}
          {reportType === 'inventory' && (
            <div className="inventory-report">
              <h3><i className="fas fa-boxes" style={{ marginRight: 8, color: 'var(--primary)' }}></i>Inventory Analysis Report</h3>
              <div className="inventory-stats">
                <div className="stat-item">
                  <span>Total Items:</span>
                  <strong>{reportData.total_items}</strong>
                </div>
                <div className="stat-item">
                  <span>Total Value:</span>
                  <strong>₹{reportData.total_value?.toLocaleString('en-IN')}</strong>
                </div>
                <div className="stat-item">
                  <span>Low Stock Items:</span>
                  <strong className="warning">{reportData.stock_status?.low_stock}</strong>
                </div>
                <div className="stat-item">
                  <span>Critical Items:</span>
                  <strong className="critical">{reportData.stock_status?.critical}</strong>
                </div>
              </div>
            </div>
          )}
          {reportType === 'forecast-accuracy' && (
            <div className="accuracy-report">
              <h3><i className="fas fa-bullseye" style={{ marginRight: 8, color: 'var(--primary)' }}></i>Forecast Accuracy Report</h3>
              <div className="accuracy-summary">
                <div className="accuracy-metric">
                  <h4>Overall Accuracy</h4>
                  <div className="accuracy-value">{reportData.overall_accuracy}%</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Reports;