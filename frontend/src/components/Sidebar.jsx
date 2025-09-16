import React from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const Sidebar = ({ activeComponent, setActiveComponent, isOpen = false, onClose }) => {
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
    <aside
      className={[
        'w-[280px] bg-[--sidebar] text-[--sidebar-foreground] flex flex-col fixed h-screen z-[1000] border-r border-[--sidebar-border] py-6',
        'transition-transform duration-300 ease-out',
        'lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}
      aria-label="Sidebar navigation"
    >
      <div className="px-6 pb-6 mb-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[1.375rem] font-bold text-[--sidebar-primary]">Supply Chain</h2>
          <button
            className="lg:hidden text-[--sidebar-foreground] p-2 rounded hover:bg-[--sidebar-accent]"
            onClick={onClose}
            aria-label="Close menu"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>
      <nav className="flex-1 flex flex-col gap-1 px-3">
        {menuItems.map(item => {
          const active = activeComponent === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveComponent(item.id)}
              className={[
                'flex items-center gap-3 py-3 px-5 rounded-lg font-medium text-sm w-full text-left transition-all duration-300 ease-out',
                active ? 'bg-[--sidebar-accent] text-[--sidebar-primary] border-l-4 border-[--primary]' : 'hover:bg-[--sidebar-accent] hover:text-[--sidebar-accent-foreground] hover:translate-x-1'
              ].join(' ')}
            >
              <span className="flex items-center text-base w-5">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default Sidebar;