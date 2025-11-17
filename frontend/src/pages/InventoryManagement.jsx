import React, { useState, useContext, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { BusinessInfoContext } from '../context/BusinessInfoContext';
import useInventory from '../hooks/useInventory';
import CSVUploadModal from '../components/inventory/CSVUploadModal';
import InventoryForm from '../components/inventory/InventoryForm';

const InventoryManagement = () => {
  const { businessInfo } = useContext(BusinessInfoContext);
  const businessId = businessInfo?.id || 1;
  
  const {
    items,
    loading,
    error,
    categories,
    fetchInventory,
    addItem,
    updateItem,
    deleteItem,
    adjustStock,
    exportToCSV,
    totalItems,
    totalValue,
    lowStockCount,
    loadMockData
  } = useInventory(businessId);

  const [filters, setFilters] = useState({
    category: '',
    status: '',
    search: ''
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [formModalOpen, setFormModalOpen] = useState(false);

  const showNotification = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
  };

  const handleFormSubmit = async (formData) => {
    try {
      if (editingItem) {
        await updateItem(editingItem.id, formData);
        showNotification('Item updated successfully');
      } else {
        await addItem(formData);
        showNotification('Item added successfully');
      }
      setFormModalOpen(false);
      setEditingItem(null);
    } catch (error) {
      showNotification(error.message || 'Action failed', 'error');
    }
  };

  const handleDelete = async (itemId) => {
    const ok = window.confirm('Delete this item?');
    if (!ok) return;
    try {
      await deleteItem(itemId);
      showNotification('Item deleted');
    } catch (error) {
      showNotification(error.message || 'Delete failed', 'error');
    }
  };

  const handleFilterChange = (field, value) => {
    const newFilters = { ...filters, [field]: value };
    setFilters(newFilters);
    fetchInventory(newFilters);
  };

  const handleExport = async () => {
    try {
      await exportToCSV(filters);
      showNotification('Exported successfully');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleStockAdjust = async (itemId, adjustment) => {
    try {
      await adjustStock(itemId, adjustment);
      showNotification('Stock adjusted successfully');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'critical': return 'bg-red-100 text-red-600';
      case 'low': return 'bg-orange-100 text-orange-500';
      case 'normal': return 'bg-green-100 text-green-600';
      case 'healthy': return 'bg-green-100 text-green-600';
      case 'overstock': return 'bg-blue-100 text-blue-600';
      default: return 'bg-gray-200 text-gray-700';
    }
  };

  const formatCurrency = (value) => {
    if (!value) return '₹0';
    return `₹${value.toLocaleString('en-IN')}`;
  };

  return (
    <div className="max-w-[1200px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">

      {/* Notification */}
      {notification.show && (
        <div className={`mb-4 p-4 rounded-[var(--radius)] border ${
          notification.type === 'error' 
            ? 'bg-red-50 border-red-200 text-red-800' 
            : 'bg-green-50 border-green-200 text-green-800'
        }`}>
          <i className={`fas ${notification.type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'} mr-2`}></i>
          {notification.message}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-4 rounded-[var(--radius)] border bg-red-50 border-red-200 text-red-800">
          <i className="fas fa-exclamation-triangle mr-2"></i>
          {error}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="bg-[--sidebar] p-4 rounded-[var(--radius)] border border-[--border] shadow-[var(--shadow-sm)] flex items-center">
          <div className="text-[1.5rem] text-[--primary] mr-3">
            <i className="fas fa-list"></i>
          </div>
          <div>
            <h3 className="text-xl text-[--foreground] leading-6">{totalItems}</h3>
            <p className="text-[--muted-foreground] text-xs">Total Items</p>
          </div>
        </div>

        <div className="bg-[--sidebar] p-4 rounded-[var(--radius)] border border-[--border] shadow-[var(--shadow-sm)] flex items-center">
          <div className="text-[1.5rem] text-red-500 mr-3">
            <i className="fas fa-exclamation-triangle"></i>
          </div>
          <div>
            <h3 className="text-xl text-[--foreground] leading-6">{items.filter(item => item.status === 'critical').length}</h3>
            <p className="text-[--muted-foreground] text-xs">Critical Stock</p>
          </div>
        </div>

        <div className="bg-[--sidebar] p-4 rounded-[var(--radius)] border border-[--border] shadow-[var(--shadow-sm)] flex items-center">
          <div className="text-[1.5rem] text-orange-500 mr-3">
            <i className="fas fa-exclamation-circle"></i>
          </div>
          <div>
            <h3 className="text-xl text-[--foreground] leading-6">{items.filter(item => item.status === 'low').length}</h3>
            <p className="text-[--muted-foreground] text-xs">Low Stock</p>
          </div>
        </div>

        <div className="bg-[--sidebar] p-4 rounded-[var(--radius)] border border-[--border] shadow-[var(--shadow-sm)] flex items-center">
          <div className="text-[1.5rem] text-green-500 mr-3">
            <i className="fas fa-check-circle"></i>
          </div>
          <div>
            <h3 className="text-xl text-[--foreground] leading-6">{items.filter(item => item.status === 'healthy' || item.status === 'normal').length}</h3>
            <p className="text-[--muted-foreground] text-xs">Healthy Stock</p>
          </div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
        <div className="flex gap-2 flex-wrap items-center">
          <select 
            className="px-3 py-1.5 text-sm rounded-md bg-[--sidebar] text-[--foreground] border border-[--border]" 
            value={filters.category} 
            onChange={(e) => handleFilterChange('category', e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select 
            className="px-3 py-1.5 text-sm rounded-md bg-[--sidebar] text-[--foreground] border border-[--border]" 
            value={filters.status} 
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">All Status</option>
            <option value="critical">Critical</option>
            <option value="low">Low Stock</option>
            <option value="normal">Healthy</option>
            <option value="overstock">Overstock</option>
          </select>

          <input 
            className="px-3 py-1.5 text-sm rounded-md bg-[--sidebar] text-[--foreground] border border-[--border] placeholder-[--muted-foreground] w-56" 
            type="text" 
            placeholder="Search items..." 
            value={filters.search} 
            onChange={(e) => handleFilterChange('search', e.target.value)} 
          />
        </div>

        <div className="flex gap-2 items-center">
          <button 
            className="px-3 py-1.5 text-sm rounded-md border border-[--border] hover:bg-[--accent] transition"
            onClick={() => fetchInventory(filters)}
          >
            <i className="fas fa-sync-alt mr-1"></i> Refresh
          </button>
          <button 
            className="px-3 py-1.5 text-sm rounded-md border border-[--border] hover:bg-[--accent] transition"
            onClick={handleExport}
          >
            <i className="fas fa-download mr-1"></i> Export
          </button>
          <button 
            className="px-3 py-1.5 text-sm rounded-md border border-[--border] hover:bg-[--accent] transition"
            onClick={loadMockData}
            title="Load demo data"
          >
            <i className="fas fa-database mr-1"></i> Demo
          </button>
          <button 
            className="px-3 py-1.5 text-sm rounded-md bg-[--primary] text-[--primary-foreground] hover:opacity-90 transition"
            onClick={() => setCsvModalOpen(true)}
          >
            <i className="fas fa-upload mr-1"></i> Import CSV
          </button>
          <button 
            className="px-3 py-1.5 text-sm rounded-md bg-[--primary] text-[--primary-foreground] hover:opacity-90 transition"
            onClick={() => { setEditingItem(null); setFormModalOpen(true); }}
          >
            <i className="fas fa-plus mr-1"></i> Add Item
          </button>
        </div>
      </div>

      {/* Inventory Table */}
      {loading && !items.length ? (
        <div className="text-center p-12 text-[--muted-foreground]">
          <i className="fas fa-spinner fa-spin text-4xl mb-4"></i>
          <p>Loading inventory...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center p-10 text-[--muted-foreground] bg-[--sidebar] rounded-[var(--radius)] border border-[--border]">
          <i className="fas fa-boxes text-6xl mb-4 opacity-30"></i>
          <h3 className="mb-2 text-[--foreground]">No inventory items found</h3>
          <p className="mb-4 text-sm">Add your first inventory item or import from CSV to get started</p>
          <div className="flex gap-2 justify-center">
            <button 
              className="px-5 py-2 rounded-md text-sm bg-[--primary] text-[--primary-foreground]"
              onClick={() => { setEditingItem(null); setFormModalOpen(true); }}
            >
              <i className="fas fa-plus mr-2"></i> Add First Item
            </button>
            <button 
              className="px-5 py-2 rounded-md text-sm border border-[--border]"
              onClick={() => setCsvModalOpen(true)}
            >
              <i className="fas fa-upload mr-2"></i> Import CSV
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[--border] shadow">
          <table className="min-w-full bg-[--sidebar] text-sm">
            <thead>
              <tr>
                <th className="bg-[--muted] text-left p-3 font-semibold text-[--foreground] border-b border-[--border]">Item Name</th>
                <th className="bg-[--muted] text-left p-3 font-semibold text-[--foreground] border-b border-[--border]">Category</th>
                <th className="bg-[--muted] text-left p-3 font-semibold text-[--foreground] border-b border-[--border]">SKU</th>
                <th className="bg-[--muted] text-center p-3 font-semibold text-[--foreground] border-b border-[--border]">Stock</th>
                <th className="bg-[--muted] text-center p-3 font-semibold text-[--foreground] border-b border-[--border]">Min/Max</th>
                <th className="bg-[--muted] text-right p-3 font-semibold text-[--foreground] border-b border-[--border]">Cost</th>
                <th className="bg-[--muted] text-right p-3 font-semibold text-[--foreground] border-b border-[--border]">Price</th>
                <th className="bg-[--muted] text-center p-3 font-semibold text-[--foreground] border-b border-[--border]">Status</th>
                <th className="bg-[--muted] text-center p-3 font-semibold text-[--foreground] border-b border-[--border]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="hover:bg-[--muted]/50 transition">
                  <td className="p-3 border-b border-[--muted] text-[--foreground]">
                    <strong>{item.name}</strong>
                    {item.description && (
                      <div className="text-xs text-[--muted-foreground] mt-1">{item.description}</div>
                    )}
                  </td>
                  <td className="p-3 border-b border-[--muted] text-[--foreground]">{item.category || '-'}</td>
                  <td className="p-3 border-b border-[--muted] text-[--foreground] font-mono text-xs">{item.sku || '-'}</td>
                  <td className="p-3 border-b border-[--muted] text-[--foreground]">
                    <div className="flex items-center justify-center gap-1">
                      <button 
                        className="px-2 py-1 rounded hover:bg-[--muted]"
                        onClick={() => handleStockAdjust(item.id, -1)}
                        disabled={item.current_stock <= 0}
                      >
                        <i className="fas fa-minus text-xs"></i>
                      </button>
                      <span className="px-2 font-semibold">{item.current_stock}</span>
                      <button 
                        className="px-2 py-1 rounded hover:bg-[--muted]"
                        onClick={() => handleStockAdjust(item.id, 1)}
                      >
                        <i className="fas fa-plus text-xs"></i>
                      </button>
                    </div>
                  </td>
                  <td className="p-3 border-b border-[--muted] text-[--foreground] text-center text-xs">
                    {item.min_stock_level}/{item.max_stock_level}
                  </td>
                  <td className="p-3 border-b border-[--muted] text-[--foreground] text-right">
                    {formatCurrency(item.unit_cost)}
                  </td>
                  <td className="p-3 border-b border-[--muted] text-[--foreground] text-right">
                    {formatCurrency(item.selling_price)}
                    {item.markup_percentage && (
                      <div className="text-xs text-green-600">+{item.markup_percentage.toFixed(1)}%</div>
                    )}
                  </td>
                  <td className="p-3 border-b border-[--muted] text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-3 border-b border-[--muted]">
                    <div className="flex gap-2 justify-center">
                      <button 
                        className="px-2.5 py-1 rounded border border-[--border] hover:bg-[--accent] text-xs transition"
                        onClick={() => { setEditingItem(item); setFormModalOpen(true); }}
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button 
                        className="px-2.5 py-1 rounded bg-red-500 text-white hover:bg-red-600 text-xs transition"
                        onClick={() => handleDelete(item.id)}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <CSVUploadModal
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onSuccess={(result) => {
          setCsvModalOpen(false);
          fetchInventory();
          showNotification(`Imported ${result.imported || 0} items`);
        }}
        businessInfo={businessInfo}
      />

      <InventoryForm
        open={formModalOpen}
        onClose={() => { setFormModalOpen(false); setEditingItem(null); }}
        onSubmit={handleFormSubmit}
        item={editingItem}
        categories={categories}
      />
    </div>
  );
};

export default InventoryManagement;
