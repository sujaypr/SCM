import React, { createContext, useState, useContext } from 'react';

export const BusinessInfoContext = createContext();

export const BusinessInfoProvider = ({ children }) => {
  const [businessInfo, setBusinessInfo] = useState(() => {
    const saved = localStorage.getItem('businessInfo');
    return saved ? JSON.parse(saved) : null;
  });

  const saveBusinessInfo = async (info) => {
    setBusinessInfo(info);
    localStorage.setItem('businessInfo', JSON.stringify(info));

    const payload = {
      businessName: info.businessName || null,
      businessType: info.businessType,
      businessScale: info.businessScale,
      location: info.location,
      state: info.state,
      currentSales: info.currentSales ? Number(info.currentSales) : null,
    };

    const res = await fetch('/api/demand/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      throw new Error(data?.error || 'Failed to save business settings');
    }
    return data;
  };

  return (
    <BusinessInfoContext.Provider value={{ businessInfo, saveBusinessInfo }}>
      {children}
    </BusinessInfoContext.Provider>
  );
};

export const useBusinessInfo = () => useContext(BusinessInfoContext);
