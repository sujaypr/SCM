import React, { useState, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const Navbar = ({ activeComponent }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Page titles mapping
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
    // Check localStorage for saved theme preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const shouldBeDark = savedTheme === 'dark' || (!savedTheme && prefersDark);
    setIsDarkMode(shouldBeDark);
    
    if (shouldBeDark) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <div className="navbar">
      <div className="navbar-left">
        <h1>{currentPage.title}</h1>
        {/* <span className="navbar-subtitle">{currentPage.subtitle}</span> */}
      </div>
        <div className="navbar-actions">
          <button 
            className="btn btn-icon" 
            onClick={toggleDarkMode}
            title={`Switch to ${isDarkMode ? 'light' : 'dark'} mode`}
          >
            <i className={`fas ${isDarkMode ? 'fa-sun' : 'fa-moon'}`}></i>
          </button>
        </div>
    </div>
  );
};

export default Navbar;