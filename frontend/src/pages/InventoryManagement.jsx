import React, { useState, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const InventoryManagement = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    category: '',
    status: '',
    search: ''
  });

  useEffect(() => {
    const fetchInventory = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams(filters);
        const response = await fetch(`/api/inventory/?${params}`);
        const result = await response.json();

        if (result.success) {
          setInventory(result.inventory);
        }
      } catch (error) {
        console.error('Error fetching inventory:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInventory();
  }, [filters]);

  // fetchInventory moved inside useEffect

  const getStatusColor = (status) => {
    switch(status) {
      case 'critical': return 'red';
      case 'low': return 'orange';
      case 'healthy': return 'green';
      case 'overstock': return 'blue';
      default: return 'gray';
    }
  };

  return (
    <div className="inventory-management" style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px' }}>
      <div className="page-header" style={{ marginBottom: 32, textAlign: 'center' }}>
        <h2 style={{ fontWeight: 600, fontSize: 28, marginBottom: 8 }}>
          <i className="fas fa-boxes" style={{ marginRight: 10, color: '#1976d2' }}></i>
          Inventory Management
        </h2>
        <p style={{ color: '#666', fontSize: 16 }}>Monitor and optimize your inventory levels</p>
      </div>

      <div className="inventory-controls">
        <div className="filters">
          <select 
            value={filters.category} 
            onChange={(e) => setFilters({...filters, category: e.target.value})}
          >
            <option value="">All Categories</option>
            <option value="Grocery">Grocery</option>
            <option value="Electronics">Electronics</option>
            <option value="Clothing">Clothing</option>
            <option value="Medical">Medical</option>
          </select>

          <select 
            value={filters.status} 
            onChange={(e) => setFilters({...filters, status: e.target.value})}
          >
            <option value="">All Status</option>
            <option value="critical">Critical</option>
            <option value="low">Low Stock</option>
            <option value="healthy">Healthy</option>
            <option value="overstock">Overstock</option>
          </select>

          <input
            type="text"
            placeholder="Search items..."
            value={filters.search}
            onChange={(e) => setFilters({...filters, search: e.target.value})}
          />
        </div>

        <div className="actions">
          <button className="btn btn-outline">Export Inventory</button>
          <button className="btn btn-primary">Add New Item</button>
        </div>
      </div>

      <div className="inventory-summary">
        <div className="summary-card" style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #eee', padding: 20, textAlign: 'center' }}>
          <h3 style={{ fontWeight: 500, fontSize: 18, marginBottom: 8 }}><i className="fas fa-list" style={{ marginRight: 6, color: '#1976d2' }}></i>Total Items</h3>
          <div className="summary-value" style={{ fontSize: 20, fontWeight: 600 }}>{inventory.length}</div>
        </div>
        <div className="summary-card critical" style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #eee', padding: 20, textAlign: 'center' }}>
          <h3 style={{ fontWeight: 500, fontSize: 18, marginBottom: 8 }}><i className="fas fa-exclamation-triangle" style={{ marginRight: 6, color: '#d32f2f' }}></i>Critical Stock</h3>
          <div className="summary-value" style={{ fontSize: 20, fontWeight: 600, color: '#d32f2f' }}>
            {inventory.filter(item => item.status === 'critical').length}
          </div>
        </div>
        <div className="summary-card warning" style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #eee', padding: 20, textAlign: 'center' }}>
          <h3 style={{ fontWeight: 500, fontSize: 18, marginBottom: 8 }}><i className="fas fa-exclamation-circle" style={{ marginRight: 6, color: '#fbc02d' }}></i>Low Stock</h3>
          <div className="summary-value" style={{ fontSize: 20, fontWeight: 600, color: '#fbc02d' }}>
            {inventory.filter(item => item.status === 'low').length}
          </div>
        </div>
        <div className="summary-card success" style={{ background: '#fff', borderRadius: 8, boxShadow: '0 2px 8px #eee', padding: 20, textAlign: 'center' }}>
          <h3 style={{ fontWeight: 500, fontSize: 18, marginBottom: 8 }}><i className="fas fa-check-circle" style={{ marginRight: 6, color: '#388e3c' }}></i>Healthy Stock</h3>
          <div className="summary-value" style={{ fontSize: 20, fontWeight: 600, color: '#388e3c' }}>
            {inventory.filter(item => item.status === 'healthy').length}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading inventory...</div>
      ) : (
        <div className="inventory-table">
          <table>
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Current Stock</th>
                <th>Min Level</th>
                <th>Max Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map(item => (
                <tr key={item.id}>
                  <td>
                    <div className="item-info">
                      <strong>{item.name}</strong>
                      {item.sku && <span className="sku">{item.sku}</span>}
                    </div>
                  </td>
                  <td>{item.category}</td>
                  <td>{item.current_stock || item.stock}</td>
                  <td>{item.min_stock_level || item.min_stock}</td>
                  <td>{item.max_stock_level || item.max_stock}</td>
                  <td>
                    <span 
                      className={`status-badge ${getStatusColor(item.status)}`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="btn-small btn-outline">Edit</button>
                      <button className="btn-small btn-primary">Reorder</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inventory.length === 0 && !loading && (
        <div className="empty-state">
          <h3>No inventory items found</h3>
          <p>Add your first inventory item to get started</p>
          <button className="btn btn-primary">Add Item</button>
        </div>
      )}
    </div>
  );
};

export default InventoryManagement;