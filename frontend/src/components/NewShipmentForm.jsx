import React, { useState } from 'react';
import axios from 'axios';
import '@fortawesome/fontawesome-free/css/all.min.css';

const TRANSPORT_MODES = [
  { id: 'road', label: 'Road Transport', icon: 'truck' },
  { id: 'rail', label: 'Rail Transport', icon: 'train' },
  { id: 'air', label: 'Air Transport', icon: 'plane' },
  { id: 'sea', label: 'Sea Transport', icon: 'ship' },
];

export default function NewShipmentForm({ onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    destination: '',
    origin: 'Bangalore Distribution Center',
    items: [{ description: '', quantity: 1, weight: 0 }],
    selectedProvider: '',
    selectedMode: 'road',
    priority: 'standard',
    notes: '',
    estimated_days: 4
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [providers, setProviders] = useState([]);
  const [routeDetails, setRouteDetails] = useState(null);

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { description: '', quantity: 1, weight: 0 }]
    }));
  };

  const removeItem = (index) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updateItem = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const totalWeight = formData.items.reduce((sum, item) => sum + (item.weight || 0), 0);
      const itemsCount = formData.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
      
      const payload = {
        destination: formData.destination,
        origin: formData.origin,
        transport_mode: formData.selectedMode,
        priority: formData.priority,
        items: formData.items,
        notes: formData.notes,
        weight: totalWeight,
        items_count: itemsCount,
        estimated_days: formData.estimated_days
      };

      const response = await axios.post('/api/logistics/shipments', payload);
      onSuccess(response.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail?.message || err.response?.data?.message || 'Failed to create shipment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[--background] rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-[--border]">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-[--foreground]">New Shipment</h2>
            <button 
              onClick={onClose}
              className="text-[--muted-foreground] hover:text-[--foreground]"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Origin</label>
                <input
                  type="text"
                  value={formData.origin}
                  onChange={(e) => setFormData(prev => ({ ...prev, origin: e.target.value }))}
                  className="w-full px-3 py-2 bg-[--sidebar] border border-[--border] rounded-md focus:ring-2 focus:ring-[--primary] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Destination *</label>
                <input
                  type="text"
                  value={formData.destination}
                  onChange={(e) => setFormData(prev => ({ ...prev, destination: e.target.value }))}
                  placeholder="Enter destination address"
                  className="w-full px-3 py-2 bg-[--sidebar] border border-[--border] rounded-md focus:ring-2 focus:ring-[--primary] focus:border-transparent"
                  required
                />
              </div>
            </div>

            {/* Transport Mode and Priority */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-2">Transport Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  {TRANSPORT_MODES.map(mode => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, selectedMode: mode.id }))}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${
                        formData.selectedMode === mode.id
                          ? 'border-[--primary] bg-[--primary]/10 shadow-md'
                          : 'border-[--border] hover:border-[--primary]/50 hover:shadow-sm'
                      }`}
                    >
                      <i className={`fas fa-${mode.icon} text-xl mb-1 ${
                        formData.selectedMode === mode.id ? 'text-[--primary]' : 'text-[--muted-foreground]'
                      }`}></i>
                      <span className="text-xs font-medium">{mode.label.replace(' Transport', '')}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Priority Level</label>
                <div className="space-y-2">
                  {[
                    { id: 'standard', label: 'Standard', desc: 'Regular delivery', color: 'gray' },
                    { id: 'express', label: 'Express', desc: '1-2 days faster', color: 'yellow' },
                    { id: 'urgent', label: 'Urgent', desc: 'Priority handling', color: 'red' }
                  ].map(priority => (
                    <label key={priority.id} className="flex items-center p-2 rounded border hover:bg-[--muted]/50 cursor-pointer">
                      <input
                        type="radio"
                        name="priority"
                        value={priority.id}
                        checked={formData.priority === priority.id}
                        onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-medium text-sm">{priority.label}</div>
                        <div className="text-xs text-[--muted-foreground]">{priority.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Estimated Delivery */}
            <div>
              <label className="block text-sm font-medium mb-2">Estimated Delivery Days</label>
              <input
                type="number"
                value={formData.estimated_days}
                onChange={(e) => setFormData(prev => ({ ...prev, estimated_days: parseInt(e.target.value) || 4 }))}
                min="1"
                max="30"
                className="w-32 px-3 py-2 bg-[--sidebar] border border-[--border] rounded-md focus:ring-2 focus:ring-[--primary] focus:border-transparent"
              />
              <span className="ml-2 text-sm text-[--muted-foreground]">days</span>
            </div>

            {/* Items List */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">Items</label>
                <button
                  type="button"
                  onClick={addItem}
                  className="text-[--primary] hover:text-[--primary]/80"
                >
                  <i className="fas fa-plus mr-1"></i>
                  Add Item
                </button>
              </div>

              <div className="space-y-4">
                {formData.items.map((item, index) => (
                  <div key={index} className="flex gap-4 items-start">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        placeholder="Item description"
                        className="w-full px-3 py-2 bg-[--sidebar] border border-[--border] rounded-md"
                        required
                      />
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value))}
                        min="1"
                        className="w-full px-3 py-2 bg-[--sidebar] border border-[--border] rounded-md"
                        required
                      />
                    </div>
                    <div className="w-24">
                      <input
                        type="number"
                        value={item.weight}
                        onChange={(e) => updateItem(index, 'weight', parseFloat(e.target.value))}
                        min="0"
                        step="0.1"
                        className="w-full px-3 py-2 bg-[--sidebar] border border-[--border] rounded-md"
                        required
                      />
                    </div>
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="text-red-500 hover:text-red-600 px-2"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Additional Notes */}
            <div>
              <label className="block text-sm font-medium mb-2">Additional Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 bg-[--sidebar] border border-[--border] rounded-md"
                placeholder="Any special handling instructions or notes..."
              />
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[--muted-foreground] hover:text-[--foreground]"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-[--primary] text-[--primary-foreground] rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
              disabled={loading || !formData.selectedMode || !formData.destination || formData.items.some(item => !item.description)}
            >
              {loading ? (
                <><i className="fas fa-spinner fa-spin mr-2"></i>Creating Shipment...</>
              ) : (
                <><i className="fas fa-plus mr-2"></i>Create Shipment</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}