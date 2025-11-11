import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// Normalize API base so we don't end up with /api/api when VITE_API_URL already contains /api
const RAW_API_URL = import.meta.env.VITE_API_URL || '';
const API_BASE = (() => {
  if (!RAW_API_URL) return '/api';
  const url = RAW_API_URL.replace(/\/+$/,'');
  return url.endsWith('/api') ? url : `${url}/api`;
})();

const useInventory = (businessId = 1) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [categories, setCategories] = useState([]);

  // Fetch inventory items
  const fetchInventory = useCallback(async (filters = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      const params = new URLSearchParams({
        business_id: businessId,
        ...filters
      });
      
      const response = await axios.get(`${API_BASE}/inventory?${params}`);
      
      if (response.data.success) {
        setItems(response.data.data?.items || []);
        
        // Extract unique categories
        const uniqueCategories = [...new Set(
          response.data.data?.items
            ?.map(item => item.category)
            .filter(Boolean) || []
        )];
        setCategories(uniqueCategories);
      }
    } catch (err) {
      console.error('Error fetching inventory:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch inventory');
      // Set empty data on error so UI can still render
      setItems([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  // Fetch analytics
  const fetchAnalytics = useCallback(async () => {
    try {
      const response = await axios.get(
        `${API_BASE}/inventory/analytics?business_id=${businessId}`
      );
      
      if (response.data.success) {
        setAnalytics(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  }, [businessId]);

  // Add item
  const addItem = async (itemData) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.post(
        `${API_BASE}/inventory?business_id=${businessId}`,
        itemData
      );
      
      if (response.data.success) {
        await fetchInventory();
        return response.data.data;
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to add item';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Load mock data (for demo/testing only)
  const loadMockData = () => {
    const demoItems = [
      {
        id: 1,
        name: 'Premium Basmati Rice 5kg',
        category: 'Grocery',
        sku: 'RICE-5KG-001',
        current_stock: 12,
        min_stock_level: 10,
        max_stock_level: 50,
        unit_cost: 320,
        selling_price: 420,
        status: 'low'
      },
      {
        id: 2,
        name: 'LED Bulb 12W',
        category: 'Electronics',
        sku: 'EL-BULB-12W',
        current_stock: 3,
        min_stock_level: 8,
        max_stock_level: 40,
        unit_cost: 80,
        selling_price: 129,
        status: 'critical'
      },
      {
        id: 3,
        name: 'Cotton T-Shirt (L)',
        category: 'Clothing',
        sku: 'TSHIRT-L-CTN',
        current_stock: 35,
        min_stock_level: 10,
        max_stock_level: 60,
        unit_cost: 180,
        selling_price: 299,
        status: 'normal'
      },
      {
        id: 4,
        name: 'Hand Sanitizer 500ml',
        category: 'Medical',
        sku: 'HS-500-CLR',
        current_stock: 110,
        min_stock_level: 15,
        max_stock_level: 80,
        unit_cost: 45,
        selling_price: 99,
        status: 'overstock'
      }
    ];

    setItems(demoItems);
    setCategories([...new Set(demoItems.map(i => i.category).filter(Boolean))]);
    setAnalytics({
      total_value: demoItems.reduce((s, i) => s + (i.unit_cost || 0) * i.current_stock, 0),
      status_breakdown: {
        critical: demoItems.filter(i => i.status === 'critical').length,
        low: demoItems.filter(i => i.status === 'low').length,
        normal: demoItems.filter(i => i.status === 'normal').length,
        overstock: demoItems.filter(i => i.status === 'overstock').length
      }
    });
  };

  // Update item
  const updateItem = async (itemId, itemData) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.put(
        `${API_BASE}/inventory/${itemId}`,
        itemData
      );
      
      if (response.data.success) {
        await fetchInventory();
        return response.data.data;
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to update item';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Delete item
  const deleteItem = async (itemId) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.delete(`${API_BASE}/inventory/${itemId}`);
      
      if (response.data.success) {
        await fetchInventory();
        return true;
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to delete item';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Adjust stock
  const adjustStock = async (itemId, adjustment, reason = '') => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await axios.patch(
        `${API_BASE}/inventory/${itemId}/stock`,
        { adjustment, reason }
      );
      
      if (response.data.success) {
        // Update local state
        setItems(prevItems =>
          prevItems.map(item =>
            item.id === itemId
              ? { ...item, current_stock: response.data.data.current_stock }
              : item
          )
        );
        return response.data.data;
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to adjust stock';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Export to CSV
  const exportToCSV = async (filters = {}) => {
    try {
      const params = new URLSearchParams({
        business_id: businessId,
        ...filters
      });
      
      const response = await axios.get(
        `${API_BASE}/inventory/csv/export?${params}`,
        { responseType: 'blob' }
      );
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `inventory_${businessId}_${new Date().toISOString()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      return true;
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Failed to export inventory';
      setError(errorMsg);
      throw new Error(errorMsg);
    }
  };

  // Get low stock items
  const getLowStockItems = async () => {
    try {
      const response = await axios.get(
        `${API_BASE}/inventory/alerts/low-stock?business_id=${businessId}`
      );
      
      if (response.data.success) {
        return response.data.data?.items || [];
      }
    } catch (err) {
      console.error('Error fetching low stock items:', err);
      return [];
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchInventory();
    fetchAnalytics();
  }, [fetchInventory, fetchAnalytics]);

  return {
    items,
    loading,
    error,
    analytics,
    categories,
    
    // Actions
    fetchInventory,
    fetchAnalytics,
    addItem,
    updateItem,
    deleteItem,
    adjustStock,
    exportToCSV,
    getLowStockItems,
    loadMockData,
    
    // Computed
    totalItems: items.length,
    totalValue: items.reduce((sum, item) => 
      sum + ((item.unit_cost || 0) * item.current_stock), 0
    ),
    lowStockCount: items.filter(item => 
      item.status === 'low' || item.status === 'critical'
    ).length
  };
};

export default useInventory;
