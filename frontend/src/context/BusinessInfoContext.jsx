import React, { createContext, useState, useContext } from 'react';

export const BusinessInfoContext = createContext();

export const BusinessInfoProvider = ({ children }) => {
  const [businessInfo, setBusinessInfo] = useState(() => {
    const saved = localStorage.getItem('businessInfo');
    return saved ? JSON.parse(saved) : null;
  });

  const saveBusinessInfo = (info) => {
    setBusinessInfo(info);
    localStorage.setItem('businessInfo', JSON.stringify(info));
  };

  return (
    <BusinessInfoContext.Provider value={{ businessInfo, saveBusinessInfo }}>
      {children}
    </BusinessInfoContext.Provider>
  );
};

export const useBusinessInfo = () => useContext(BusinessInfoContext);
