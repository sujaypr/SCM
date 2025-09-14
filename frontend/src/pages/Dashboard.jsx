import React, { useState, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalSales: 0,
    forecastAccuracy: 0,
    inventoryTurnover: 0,
    activeForecasts: 0
  });

  useEffect(() => {
    // Simulate loading dashboard stats
    setStats({
      totalSales: 2500000,
      forecastAccuracy: 87.5,
      inventoryTurnover: 6.2,
      activeForecasts: 12
    });
  }, []);

  return (
    <div className="dashboard">
      <div className="page-header">
        <h2 className="page-title">
          <i className="fas fa-tachometer-alt icon"></i>
          Dashboard Overview
        </h2>
        <p className="page-subtitle">Real-time insights for your retail business</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ fontSize: '2rem', color: 'var(--chart-3)' }}>
            <i className="fas fa-rupee-sign"></i>
          </div>
          <div className="stat-info text-blue ">
            <h3 className=" ">₹{(stats.totalSales / 100000).toFixed(1)}L</h3>
            <p>Total Sales (Monthly)</p>
            <span className="stat-change positive">+12.5%</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ fontSize: '2rem', color: 'var(--primary)' }}>
            <i className="fas fa-bullseye"></i>
          </div>
          <div className="stat-info">
            <h3>{stats.forecastAccuracy}%</h3>
            <p>Forecast Accuracy</p>
            <span className="stat-change positive">+8.2%</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ fontSize: '2rem', color: 'var(--chart-2)' }}>
            <i className="fas fa-box"></i>
          </div>
          <div className="stat-info">
            <h3>{stats.inventoryTurnover}</h3>
            <p>Inventory Turnover</p>
            <span className="stat-change positive">+15.3%</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ fontSize: '2rem', color: 'var(--chart-4)' }}>
            <i className="fas fa-robot"></i>
          </div>
          <div className="stat-info">
            <h3>{stats.activeForecasts}</h3>
            <p>Active AI Forecasts</p>
            <span className="stat-change neutral">New</span>
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="content-section">
          <div className="card-header">
            <h3 className="card-title">
              <i className="fas fa-calendar-alt"></i>
              Festival Season Impact
            </h3>
          </div>
          <div className="card-content">
            <div className="alert alert-info">
              <i className="fas fa-bolt" style={{ marginRight: '0.5rem' }}></i>
              <strong>Diwali Approaching!</strong> Expected 60% demand increase in 4 weeks.
              <a href="#forecast">Generate forecast</a>
            </div>
            <div className="alert alert-warning">
              <i className="fas fa-exclamation-triangle" style={{ marginRight: '0.5rem' }}></i>
              <strong>Low Stock Alert:</strong> 3 categories below minimum levels.
              <a href="#inventory">Check inventory</a>
            </div>
          </div>
        </div>

        <div className="content-section">
          <div className="card-header">
            <h3 className="card-title">
              <i className="fas fa-history"></i>
              Recent Forecasts
            </h3>
          </div>
          <div className="card-content">
            <div className="recent-forecasts">
              <div className="forecast-item card">
                <div className="forecast-info">
                  <h4>Electronics Store - Karnataka</h4>
                  <p>Generated 2 days ago • Confidence: 89%</p>
                </div>
                <div className="forecast-result">
                  <span className="forecast-growth positive">+45%</span>
                  <span className="forecast-period">Oct 2025</span>
                </div>
              </div>

              <div className="forecast-item card">
                <div className="forecast-info">
                  <h4>Grocery Store - Maharashtra</h4>
                  <p>Generated 1 week ago • Confidence: 92%</p>
                </div>
                <div className="forecast-result">
                  <span className="forecast-growth positive">+67%</span>
                  <span className="forecast-period">Nov 2025</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;