import React from 'react';
import Dashboard from '../pages/Dashboard';
import DemandForecasting from '../pages/DemandForecasting';
import InventoryManagement from '../pages/InventoryManagement';
import Logistics from '../pages/Logistics';
import WhatIfScenarios from '../pages/WhatIfScenarios';
import Reports from '../pages/Reports';
import Settings from '../pages/Settings';

const Content = ({ activeComponent }) => {
  const renderContent = () => {
    switch(activeComponent) {
      case 'dashboard':
        return <Dashboard />;
      case 'demand-forecasting':
        return <DemandForecasting />;
      case 'inventory':
        return <InventoryManagement />;
      case 'logistics':
        return <Logistics />;
      case 'scenarios':
        return <WhatIfScenarios />;
      case 'reports':
        return <Reports />;
      case 'settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto">
      {renderContent()}
    </div>
  );
};

export default Content;