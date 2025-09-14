import React, { useState, useEffect } from 'react';
import { BusinessInfoProvider, useBusinessInfo } from './context/BusinessInfoContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import Content from './components/Content.jsx';
import Navbar from './components/Navbar.jsx';
// Using Tailwind utilities from index.css

function AppContent() {
  const [activeComponent, setActiveComponent] = useState('dashboard');
  const { businessInfo } = useBusinessInfo();

  useEffect(() => {
    if (!businessInfo) {
      setActiveComponent('settings');
    }
  }, [businessInfo]);

  return (
  <div className="flex min-h-screen bg-[--background] text-[--foreground]">
      <Sidebar 
        activeComponent={activeComponent} 
        setActiveComponent={setActiveComponent} 
      />
       
  <div className="flex-1 ml-[280px] flex flex-col">
       <Navbar activeComponent={activeComponent} />
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