import React, { useState, useEffect, useCallback } from 'react';
import { BusinessInfoProvider, useBusinessInfo } from './context/BusinessInfoContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import Content from './components/Content.jsx';
import Navbar from './components/Navbar.jsx';
// Using Tailwind utilities from index.css

function AppContent() {
  const [activeComponent, setActiveComponent] = useState('dashboard');
  const { businessInfo } = useBusinessInfo();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!businessInfo) {
      setActiveComponent('settings');
    }
  }, [businessInfo]);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  return (
  <div className="flex min-h-screen w-full bg-[--background] text-[--foreground] overflow-x-hidden">
      {/* Sidebar (desktop static, mobile off-canvas) */}
      <Sidebar
        activeComponent={activeComponent}
        setActiveComponent={(id) => {
          setActiveComponent(id);
          closeSidebar();
        }}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
      />

      {/* Backdrop for mobile when sidebar open */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-[900] lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Main column */}
      <div className="flex-1 lg:ml-[280px] ml-0 flex flex-col min-w-0">
        <Navbar activeComponent={activeComponent} onToggleSidebar={toggleSidebar} />
        <Content activeComponent={activeComponent} />
      </div>
    </div>
  );
}

function App() {
  return (
    <BusinessInfoProvider>
      <AppContent />
    </BusinessInfoProvider>
  );
}

export default App;