import React, { useEffect, useState } from 'react';
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

const locations = ['Urban', 'Suburban', 'Rural'];

const Settings = () => {
  const { businessInfo, saveBusinessInfo } = useBusinessInfo();
  const [form, setForm] = useState(businessInfo || {
    businessType: '',
    businessScale: '',
    state: '',
    location: '',
    currentSales: '',
  });
  const [saved, setSaved] = useState(false);
  const [states, setStates] = useState([]);
  const [loadingStates, setLoadingStates] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadStates = async () => {
      try {
        setLoadingStates(true);
        const r = await fetch('/api/demand/business-types');
        const d = await r.json().catch(() => ({}));
        const list = Array.isArray(d?.locations) ? d.locations : [];
        if (!cancelled) setStates(list);
      } catch {
        if (!cancelled) setStates([]);
      } finally {
        if (!cancelled) setLoadingStates(false);
      }
    };
    loadStates();
    return () => { cancelled = true; };
  }, []);

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
    <div className="w-full px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
      <div className="flex flex-row gap-6 md:gap-8 items-start justify-center w-full flex-wrap">
  <form onSubmit={handleSubmit} className="bg-[--sidebar] text-[--card-foreground] rounded-[var(--radius)] border border-[--border] shadow p-5 md:p-6 flex flex-col gap-5 w-full sm:max-w-[520px]">
          <h2 className="mb-2 font-bold text-[--card-foreground]">
            <i className="fas fa-briefcase mr-2 text-[--primary]"></i>
            Business Information
          </h2>
          <label className="flex flex-col gap-2">
            <span className="min-w-[120px] inline-block">Business Type</span>
            <select className="p-4 rounded-md bg-[--sidebar] text-[--card-foreground] border-2 border-[--border]" name="businessType" value={form.businessType} onChange={handleChange} required>
              <option value="" disabled>Select type</option>
              {businessTypes.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="min-w-[120px] inline-block">Business Scale</span>
            <select className="p-4 rounded-md bg-[--sidebar] text-[--card-foreground] border-2 border-[--border]" name="businessScale" value={form.businessScale} onChange={handleChange} required>
              <option value="" disabled>Select scale</option>
              {businessScales.map(scale => <option key={scale} value={scale}>{scale}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="min-w-[120px] inline-block">State</span>
            <select className="p-4 rounded-md bg-[--sidebar] text-[--card-foreground] border-2 border-[--border]" name="state" value={form.state} onChange={handleChange} required>
              <option value="" disabled>{loadingStates ? 'Loading…' : 'Select state'}</option>
              {states.map(st => <option key={st} value={st}>{st}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="min-w-[120px] inline-block">Region</span>
            <select className="p-4 rounded-md bg-[--sidebar] text-[--card-foreground] border-2 border-[--border]" name="location" value={form.location} onChange={handleChange} required>
              <option value="" disabled>Select Region</option>
              {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="min-w-[120px] inline-block">Monthly Sales</span>
            <input className="p-4 rounded-md bg-[--sidebar] text-[--card-foreground] border-2 border-[--border] placeholder-[#aeb7c6]" name="currentSales" value={form.currentSales} onChange={handleChange} required type="number" min="0" placeholder="Enter monthly sales" />
          </label>
          <button type="submit" className="px-7 py-3 rounded-md font-semibold text-sm transition bg-[--primary] text-[--primary-foreground] shadow-[0_2px_8px_rgba(224,93,56,0.3)] hover:bg-[--primary] hover:-translate-y-0.5">Save</button>
          {saved && <div className="text-[--chart-3] font-medium mt-2"><i className="fas fa-check-circle mr-1.5"></i>Business info saved!</div>}
        </form>

        {businessInfo && (
          <div className="bg-[--sidebar] text-[--card-foreground] rounded-[var(--radius)] border border-[--border] shadow p-5 md:p-6 flex flex-col gap-4 items-start w-full sm:max-w-[520px]">
            <h3 className="text-[--primary] font-semibold mb-2 flex items-center gap-2">
              <i className="fas fa-info-circle text-[--primary]"></i>
              Current Saved Info
            </h3>
            <div className="flex flex-col gap-2 text-base">
              <div><b>Type:</b> {businessInfo.businessType}</div>
              <div><b>Scale:</b> {businessInfo.businessScale}</div>
              <div><b>State:</b> {businessInfo.state}</div>
              <div><b>Location:</b> {businessInfo.location}</div>
              <div><b>Monthly Sales:</b> {businessInfo.currentSales}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
