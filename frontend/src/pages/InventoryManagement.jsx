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
    <div className="max-w-[1100px] mx-auto p-8">
      <div className="mb-8 text-center">
        <h2 className="font-semibold text-[28px] mb-2">
          <i className="fas fa-boxes mr-2 text-[--primary]"></i>
          Inventory Management
        </h2>
        <p className="text-[--muted-foreground] text-base">Monitor and optimize your inventory levels</p>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          <select className="px-3 py-2 rounded-md bg-[--sidebar] text-[--foreground] border border-[--border]" value={filters.category} onChange={(e) => setFilters({...filters, category: e.target.value})}>
            <option value="">All Categories</option>
            <option value="Grocery">Grocery</option>
            <option value="Electronics">Electronics</option>
            <option value="Clothing">Clothing</option>
            <option value="Medical">Medical</option>
          </select>

          <select className="px-3 py-2 rounded-md bg-[--sidebar] text-[--foreground] border border-[--border]" value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})}>
            <option value="">All Status</option>
            <option value="critical">Critical</option>
            <option value="low">Low Stock</option>
            <option value="healthy">Healthy</option>
            <option value="overstock">Overstock</option>
          </select>

          <input className="px-3 py-2 rounded-md bg-[--sidebar] text-[--foreground] border border-[--border] placeholder-[--muted-foreground]" type="text" placeholder="Search items..." value={filters.search} onChange={(e) => setFilters({...filters, search: e.target.value})} />
        </div>

        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-md border border-[--border]">Export Inventory</button>
          <button className="px-4 py-2 rounded-md bg-[--primary] text-[--primary-foreground]">Add New Item</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-[--sidebar] text-[--foreground] rounded-[var(--radius)] border border-[--border] shadow p-5 text-center">
          <h3 className="font-medium text-lg mb-2"><i className="fas fa-list mr-1 text-[--primary]"></i>Total Items</h3>
          <div className="text-xl font-semibold">{inventory.length}</div>
        </div>
        <div className="bg-[--sidebar] text-[--foreground] rounded-[var(--radius)] border border-[--border] shadow p-5 text-center">
          <h3 className="font-medium text-lg mb-2"><i className="fas fa-exclamation-triangle mr-1 text-[--destructive]"></i>Critical Stock</h3>
          <div className="text-xl font-semibold text-[--destructive]">{inventory.filter(item => item.status === 'critical').length}</div>
        </div>
        <div className="bg-[--sidebar] text-[--foreground] rounded-[var(--radius)] border border-[--border] shadow p-5 text-center">
          <h3 className="font-medium text-lg mb-2"><i className="fas fa-exclamation-circle mr-1 text-[--chart-2]"></i>Low Stock</h3>
          <div className="text-xl font-semibold text-[--chart-2]">{inventory.filter(item => item.status === 'low').length}</div>
        </div>
        <div className="bg-[--sidebar] text-[--foreground] rounded-[var(--radius)] border border-[--border] shadow p-5 text-center">
          <h3 className="font-medium text-lg mb-2"><i className="fas fa-check-circle mr-1 text-[--chart-3]"></i>Healthy Stock</h3>
          <div className="text-xl font-semibold text-[--chart-3]">{inventory.filter(item => item.status === 'healthy').length}</div>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading inventory...</div>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-[--border] shadow">
          <table className="w-full bg-[--sidebar]">
            <thead>
              <tr>
                <th className="bg-[--muted] text-left p-4 font-semibold text-[--foreground] border-b border-[--border]">Item Name</th>
                <th className="bg-[--muted] text-left p-4 font-semibold text-[--foreground] border-b border-[--border]">Category</th>
                <th className="bg-[--muted] text-left p-4 font-semibold text-[--foreground] border-b border-[--border]">Current Stock</th>
                <th className="bg-[--muted] text-left p-4 font-semibold text-[--foreground] border-b border-[--border]">Min Level</th>
                <th className="bg-[--muted] text-left p-4 font-semibold text-[--foreground] border-b border-[--border]">Max Level</th>
                <th className="bg-[--muted] text-left p-4 font-semibold text-[--foreground] border-b border-[--border]">Status</th>
                <th className="bg-[--muted] text-left p-4 font-semibold text-[--foreground] border-b border-[--border]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map(item => (
                <tr key={item.id}>
                  <td className="p-4 border-b border-[--muted] text-[--foreground]"><div><strong>{item.name}</strong>{item.sku && <span className="ml-2 opacity-70">{item.sku}</span>}</div></td>
                  <td className="p-4 border-b border-[--muted] text-[--foreground]">{item.category}</td>
                  <td className="p-4 border-b border-[--muted] text-[--foreground]">{item.current_stock || item.stock}</td>
                  <td className="p-4 border-b border-[--muted] text-[--foreground]">{item.min_stock_level || item.min_stock}</td>
                  <td className="p-4 border-b border-[--muted] text-[--foreground]">{item.max_stock_level || item.max_stock}</td>
                  <td className="p-4 border-b border-[--muted]">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${getStatusColor(item.status) === 'green' ? 'bg-green-100 text-green-600' : getStatusColor(item.status) === 'blue' ? 'bg-blue-100 text-blue-600' : getStatusColor(item.status) === 'orange' ? 'bg-orange-100 text-orange-500' : getStatusColor(item.status) === 'red' ? 'bg-red-100 text-red-600' : 'bg-gray-200 text-gray-700'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-4 border-b border-[--muted]">
                    <div className="flex gap-2">
                      <button className="px-3 py-1 rounded border text-sm">Edit</button>
                      <button className="px-3 py-1 rounded bg-[--primary] text-[--primary-foreground] text-sm">Reorder</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {inventory.length === 0 && !loading && (
        <div className="text-center p-12 text-[--muted-foreground]">
          <h3 className="mb-2 text-[--foreground]">No inventory items found</h3>
          <p className="mb-4">Add your first inventory item to get started</p>
          <button className="px-6 py-3 rounded-md bg-[--primary] text-[--primary-foreground]">Add Item</button>
        </div>
      )}
    </div>
  );
};

export default InventoryManagement;