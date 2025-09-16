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
    <div className="max-w-[1200px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
      <div className="mb-8 text-left">
        <h2 className="flex items-center gap-2 text-2xl font-semibold text-[--foreground] mb-1">
          <i className="fas fa-tachometer-alt text-[--primary]"></i>
          Dashboard Overview
        </h2>
        <p className="text-[--muted-foreground] text-base">Real-time insights for your retail business</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
  <div className="bg-[--sidebar] p-7 rounded-[var(--radius)] border border-[--border] shadow-[var(--shadow-sm)] flex items-center hover:shadow-[var(--shadow-md)] transition">
          <div className="text-[2rem] text-[--chart-3] mr-4">
            <i className="fas fa-rupee-sign"></i>
          </div>
          <div>
            <h3 className="text-2xl text-[--foreground] mb-1">₹{(stats.totalSales / 100000).toFixed(1)}L</h3>
            <p className="text-[--muted-foreground] text-sm mb-1">Total Sales (Monthly)</p>
            <span className="text-green-600 bg-green-100 px-2 py-0.5 rounded-full text-xs font-semibold">+12.5%</span>
          </div>
        </div>

  <div className="bg-[--sidebar] p-7 rounded-[var(--radius)] border border-[--border] shadow-[var(--shadow-sm)] flex items-center hover:shadow-[var(--shadow-md)] transition">
          <div className="text-[2rem] text-[--primary] mr-4">
            <i className="fas fa-bullseye"></i>
          </div>
          <div>
            <h3 className="text-2xl text-[--foreground] mb-1">{stats.forecastAccuracy}%</h3>
            <p className="text-[--muted-foreground] text-sm mb-1">Forecast Accuracy</p>
            <span className="text-green-600 bg-green-100 px-2 py-0.5 rounded-full text-xs font-semibold">+8.2%</span>
          </div>
        </div>

  <div className="bg-[--sidebar] p-7 rounded-[var(--radius)] border border-[--border] shadow-[var(--shadow-sm)] flex items-center hover:shadow-[var(--shadow-md)] transition">
          <div className="text-[2rem] text-[--chart-2] mr-4">
            <i className="fas fa-box"></i>
          </div>
          <div>
            <h3 className="text-2xl text-[--foreground] mb-1">{stats.inventoryTurnover}</h3>
            <p className="text-[--muted-foreground] text-sm mb-1">Inventory Turnover</p>
            <span className="text-green-600 bg-green-100 px-2 py-0.5 rounded-full text-xs font-semibold">+15.3%</span>
          </div>
        </div>

  <div className="bg-[--sidebar] p-7 rounded-[var(--radius)] border border-[--border] shadow-[var(--shadow-sm)] flex items-center hover:shadow-[var(--shadow-md)] transition">
          <div className="text-[2rem] text-[--chart-4] mr-4">
            <i className="fas fa-robot"></i>
          </div>
          <div>
            <h3 className="text-2xl text-[--foreground] mb-1">{stats.activeForecasts}</h3>
            <p className="text-[--muted-foreground] text-sm mb-1">Active AI Forecasts</p>
            <span className="text-[--accent-foreground] bg-[--accent] px-2 py-0.5 rounded-full text-xs font-semibold">New</span>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-[--sidebar] p-8 rounded-[var(--radius)] border border-[--border] shadow transition">
          <div className="pb-5 mb-5 border-b border-[--border]">
            <h3 className="text-[--foreground] font-bold text-xl tracking-[-.025em] flex items-center gap-3 m-0">
              <i className="fas fa-calendar-alt"></i>
              Festival Season Impact
            </h3>
          </div>
          <div>
            <div className="p-4 rounded-lg mb-4 bg-[--accent] border-l-4 border-[--primary] text-[--foreground]">
              <i className="fas fa-bolt mr-2"></i>
              <strong className="block mb-2">Diwali Approaching!</strong>
              Expected 60% demand increase in 4 weeks. <a className="text-[--primary] font-medium" href="#forecast">Generate forecast</a>
            </div>
            <div className="p-4 rounded-lg mb-4 bg-[--muted] border-l-4 border-[--destructive] text-[--foreground]">
              <i className="fas fa-exclamation-triangle mr-2"></i>
              <strong className="block mb-2">Low Stock Alert:</strong>
              3 categories below minimum levels. <a className="text-[--primary] font-medium" href="#inventory">Check inventory</a>
            </div>
          </div>
        </div>

        <div className="bg-[--sidebar] p-8 rounded-[var(--radius)] border border-[--border] shadow transition">
          <div className="pb-5 mb-5 border-b border-[--border]">
            <h3 className="text-[--foreground] font-bold text-xl tracking-[-.025em] flex items-center gap-3 m-0">
              <i className="fas fa-history"></i>
              Recent Forecasts
            </h3>
          </div>
          <div>
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between p-4 rounded-[var(--radius)] border border-[--border] bg-[--sidebar] shadow">
                <div>
                  <h4 className="font-semibold text-base text-[--foreground] m-0 mb-1">Electronics Store - Karnataka</h4>
                  <p className="text-[--muted-foreground] m-0 text-sm">Generated 2 days ago • Confidence: 89%</p>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-base text-[--chart-3] mr-2">+45%</span>
                  <span className="text-[--primary] font-medium">Oct 2025</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 rounded-[var(--radius)] border border-[--border] bg-[--sidebar] shadow">
                <div>
                  <h4 className="font-semibold text-base text-[--foreground] m-0 mb-1">Grocery Store - Maharashtra</h4>
                  <p className="text-[--muted-foreground] m-0 text-sm">Generated 1 week ago • Confidence: 92%</p>
                </div>
                <div className="text-right">
                  <span className="font-semibold text-base text-[--chart-3] mr-2">+67%</span>
                  <span className="text-[--primary] font-medium">Nov 2025</span>
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