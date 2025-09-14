import React, { useState, useEffect } from 'react';
import { BusinessInfoProvider, useBusinessInfo } from './context/BusinessInfoContext.jsx';
import Sidebar from './components/Sidebar.jsx';
import Content from './components/Content.jsx';
import Navbar from './components/Navbar.jsx';
import './styles.css';

function AppContent() {
  const [activeComponent, setActiveComponent] = useState('dashboard');
  const { businessInfo } = useBusinessInfo();

  useEffect(() => {
    if (!businessInfo) {
      setActiveComponent('settings');
    }
  }, [businessInfo]);

  return (
    <div className="app">
      <Sidebar 
        activeComponent={activeComponent} 
        setActiveComponent={setActiveComponent} 
      />
      <div className="main-content">
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