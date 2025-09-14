import React, { useState } from 'react';
import { useBusinessInfo } from '../context/BusinessInfoContext.jsx';
import '@fortawesome/fontawesome-free/css/all.min.css';

const businessTypes = [
  'Grocery Store',
  'Electronics Store',
  'Clothing Store',
  'Medical Store',
  'Cosmetics Store',
  'Food & Beverage',
];
const businessScales = [
  'Small',
  'Medium',
  'Large',
];

const locations = [
  'Urban',
  'Suburban',
  'Rural',
];

const Settings = () => {
  const { businessInfo, saveBusinessInfo } = useBusinessInfo();
  const [form, setForm] = useState(businessInfo || {
    businessType: '',
    businessScale: '',
    location: '',
    currentSales: '',
  });
  const [saved, setSaved] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setSaved(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveBusinessInfo(form);
    setSaved(true);
  };

  return (
    <div className="content">
      <div style={{ width: '100%', padding: '32px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'row', gap: '32px', alignItems: 'flex-start', justifyContent: 'center', width: '100%' }}>
          {/* Business Info Form */}
          <form onSubmit={handleSubmit} className="card" style={{ flex: 1, minWidth: '340px', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          <h2 style={{ marginBottom: '10px', color: 'var(--card-foreground)', fontWeight: 700 }}>
            <i className="fas fa-briefcase" style={{ marginRight: '10px', color: 'var(--primary)' }}></i>
            Business Information
          </h2>
          <label className="form-group">
            <span style={{ minWidth: 120, display: 'inline-block' }}>Business Type</span>
            <select name="businessType" value={form.businessType} onChange={handleChange} required>
              <option value="" disabled>Select type</option>
              {businessTypes.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="form-group">
            <span style={{ minWidth: 120, display: 'inline-block' }}>Business Scale</span>
            <select name="businessScale" value={form.businessScale} onChange={handleChange} required>
              <option value="" disabled>Select scale</option>
              {businessScales.map(scale => <option key={scale} value={scale}>{scale}</option>)}
            </select>
          </label>
          <label className="form-group">
            <span style={{ minWidth: 120, display: 'inline-block' }}>Location</span>
            <select name="location" value={form.location} onChange={handleChange} required>
              <option value="" disabled>Select location</option>
              {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </label>
          <label className="form-group">
            <span style={{ minWidth: 120, display: 'inline-block' }}>Current Sales</span>
            <input name="currentSales" value={form.currentSales} onChange={handleChange} required type="number" min="0" placeholder="Enter current sales" />
          </label>
          <button type="submit" className="btn btn-primary" style={{ marginTop: 10, fontWeight: 600, fontSize: 16 }}>Save</button>
          {saved && <div style={{ color: 'var(--chart-3)', fontWeight: 500, marginTop: 8 }}><i className="fas fa-check-circle" style={{ marginRight: 6 }}></i>Business info saved!</div>}
        </form>
        {/* Saved Info Card */}
        {businessInfo && (
          <div className="card" style={{ flex: 1, minWidth: '320px', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start' }}>
            <h3 style={{ color: 'var(--primary)', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fas fa-info-circle" style={{ color: 'var(--primary)' }}></i>
              Current Saved Info
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 16, color: 'var(--card-foreground)' }}>
              <div><b>Type:</b> {businessInfo.businessType}</div>
              <div><b>Scale:</b> {businessInfo.businessScale}</div>
              <div><b>Location:</b> {businessInfo.location}</div>
              <div><b>Current Sales:</b> {businessInfo.currentSales}</div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default Settings;
