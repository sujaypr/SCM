import React from 'react';
import Dashboard from '../pages/Dashboard';
import DemandForecasting from '../pages/DemandForecasting';
import InventoryManagement from '../pages/InventoryManagement';
import Logistics from '../pages/Logistics';
import WhatIfScenarios from '../pages/WhatIfScenarios';
import Reports from '../pages/Reports';
import Settings from '../pages/Settings';

const Content = ({ activeComponent }) => {
  const [currentKey, setCurrentKey] = React.useState(activeComponent);
  const [prevKey, setPrevKey] = React.useState(null);

  React.useEffect(() => {
    if (activeComponent !== currentKey) {
      setPrevKey(currentKey);
      setCurrentKey(activeComponent);
      const t = setTimeout(() => setPrevKey(null), 320);
      return () => clearTimeout(t);
    }
  }, [activeComponent, currentKey]);

  const renderBy = (key) => {
    switch(key) {
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
      <div className="relative">
        {prevKey && (
          <div key={`prev-${prevKey}`} className="page-leave">
            {renderBy(prevKey)}
          </div>
        )}
        <div key={`cur-${currentKey}`} className="page-enter">
          {renderBy(currentKey)}
        </div>
      </div>
    </div>
  );
};

export default Content;