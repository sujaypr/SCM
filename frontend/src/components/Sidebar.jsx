import React from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const Sidebar = ({ activeComponent, setActiveComponent }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <i className="fas fa-tachometer-alt"></i> },
    { id: 'demand-forecasting', label: 'Demand Forecasting', icon: <i className="fas fa-chart-line"></i> },
    { id: 'inventory', label: 'Inventory Management', icon: <i className="fas fa-boxes"></i> },
    { id: 'logistics', label: 'Logistics', icon: <i className="fas fa-truck"></i> },
    { id: 'scenarios', label: 'What-if Scenarios', icon: <i className="fas fa-lightbulb"></i> },
    { id: 'reports', label: 'Reports', icon: <i className="fas fa-file-alt"></i> },
    { id: 'settings', label: 'Settings', icon: <i className="fas fa-cog"></i> }
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Supply Chain</h2>
      </div>
      <nav className="sidebar-nav">
        {menuItems.map(item => (
          <button
            key={item.id}
            className={`nav-item ${activeComponent === item.id ? 'active' : ''}`}
            onClick={() => setActiveComponent(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;