import React, { useState, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const Navbar = ({ activeComponent }) => {
  const [dfPeriod, setDfPeriod] = useState(6);
  const [dfLoading, setDfLoading] = useState(false);

  const pageTitles = {
    'dashboard': { title: 'Dashboard Overview', subtitle: 'Business intelligence and key metrics' },
    'demand-forecasting': { title: 'Demand Forecasting', subtitle: 'AI-powered demand predictions and trends' },
    'inventory': { title: 'Inventory Management', subtitle: 'Stock levels and inventory optimization' },
    'logistics': { title: 'Logistics Operations', subtitle: 'Supply chain and delivery management' },
    'scenarios': { title: 'What-if Scenarios', subtitle: 'Strategic planning and impact analysis' },
    'reports': { title: 'Business Reports', subtitle: 'Analytics and performance insights' },
    'settings': { title: 'Business Settings', subtitle: 'Configure your business information' }
  };

  const currentPage = pageTitles[activeComponent] || pageTitles['dashboard'];

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
  const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    
    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    }

    const onLoading = () => setDfLoading(true);
    const onIdle = () => setDfLoading(false);
    window.addEventListener('demandForecast:loading', onLoading);
    window.addEventListener('demandForecast:idle', onIdle);
    return () => {
      window.removeEventListener('demandForecast:loading', onLoading);
      window.removeEventListener('demandForecast:idle', onIdle);
    };
  }, []);

  // Theme toggling UI removed; keeping persisted theme from effect

  return (
    <div className="bg-[--sidebar] px-8 py-5 border-b border-[--sidebar-border] flex justify-between items-center shadow-[0_2px_12px_rgba(0,0,0,0.15)] backdrop-blur">
      <div className="navbar-left">
        <h1 className="text-[--foreground] font-bold text-[1.625rem] tracking-[-.025em] mb-1">{currentPage.title}</h1>
      </div>
      <div className="flex items-center gap-4">
        {activeComponent === 'demand-forecasting' && (
          <div className="flex items-center">
            <label className="font-medium mr-3">Forecast Period:</label>
            <select
              className="px-2 py-1 rounded-md bg-[--sidebar] text-[--foreground] border border-[--border]"
              value={dfPeriod}
              onChange={(e) => setDfPeriod(Number(e.target.value))}
            >
              <option value={0.25}>1 Weeks</option>
              <option value={0.5}>2 Weeks</option>
              <option value={1}>1 Month</option>
              <option value={3}>3 Months</option>
              <option value={6}>6 Months</option>
              <option value={12}>12 Months</option>
            </select>
            <button
              className="ml-4 px-4 py-2 rounded-md font-semibold bg-[--primary] text-[--primary-foreground] hover:-translate-y-0.5 transition inline-flex items-center gap-2 disabled:opacity-70"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('demandForecast:trigger', { detail: { forecastPeriod: dfPeriod } }));
              }}
              disabled={dfLoading}
            >
              {dfLoading ? (<><i className="fas fa-spinner fa-spin"></i> Analyzing...</>) : (<>Generate Forecast</>)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Navbar;