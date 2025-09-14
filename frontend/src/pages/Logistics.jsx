import React, { useState, useEffect } from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';

const Logistics = () => {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchShipments();
  }, []);

  const fetchShipments = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/logistics/shipments');
      const result = await response.json();

      if (result.success) {
        setShipments(result.shipments);
      }
    } catch (error) {
      console.error('Error fetching shipments:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch(status.toLowerCase()) {
      case 'delivered': return 'green';
      case 'in transit': return 'blue';
      case 'processing': return 'orange';
      case 'cancelled': return 'red';
      default: return 'gray';
    }
  };

  return (
    <div className="logistics" style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px' }}>
      <div className="page-header" style={{ marginBottom: 32, textAlign: 'center' }}>
        <h2 style={{ fontWeight: 600, fontSize: 28, marginBottom: 8 }}>
          <i className="fas fa-truck" style={{ marginRight: 10, color: 'var(--primary)' }}></i>
          Logistics Management
        </h2>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 16 }}>Track and manage your shipments and deliveries</p>
      </div>

      <div className="logistics-summary">
        <div className="summary-card">
          <div className="summary-icon" style={{ fontSize: 24, color: 'var(--primary)', marginBottom: 8 }}><i className="fas fa-box"></i></div>
          <div className="summary-info">
            <h3 style={{ fontWeight: 500, fontSize: 18, marginBottom: 8 }}>Total Shipments</h3>
            <div className="summary-value" style={{ fontSize: 20, fontWeight: 600 }}>{shipments.length}</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon" style={{ fontSize: 24, color: 'var(--chart-2)', marginBottom: 8 }}><i className="fas fa-shipping-fast"></i></div>
          <div className="summary-info">
            <h3 style={{ fontWeight: 500, fontSize: 18, marginBottom: 8 }}>In Transit</h3>
            <div className="summary-value" style={{ fontSize: 20, fontWeight: 600, color: 'var(--chart-2)' }}>
              {shipments.filter(s => s.status === 'In Transit').length}
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon" style={{ fontSize: 24, color: 'var(--chart-3)', marginBottom: 8 }}><i className="fas fa-check-circle"></i></div>
          <div className="summary-info">
            <h3 style={{ fontWeight: 500, fontSize: 18, marginBottom: 8 }}>Delivered</h3>
            <div className="summary-value" style={{ fontSize: 20, fontWeight: 600, color: 'var(--chart-3)' }}>
              {shipments.filter(s => s.status === 'Delivered').length}
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-icon" style={{ fontSize: 24, color: 'var(--primary)', marginBottom: 8 }}><i className="fas fa-clock"></i></div>
          <div className="summary-info">
            <h3 style={{ fontWeight: 500, fontSize: 18, marginBottom: 8 }}>Avg Delivery Time</h3>
            <div className="summary-value" style={{ fontSize: 20, fontWeight: 600 }}>4.2 days</div>
          </div>
        </div>
      </div>

      <div className="logistics-controls">
        <div className="controls-left">
          <select>
            <option value="">All Shipments</option>
            <option value="processing">Processing</option>
            <option value="in-transit">In Transit</option>
            <option value="delivered">Delivered</option>
          </select>

          <input 
            type="text" 
            placeholder="Search shipments..." 
          />
        </div>

        <div className="controls-right">
          <button className="btn btn-outline">Export Data</button>
          <button className="btn btn-primary">New Shipment</button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading shipments...</div>
      ) : (
        <div className="shipments-table">
          <table>
            <thead>
              <tr>
                <th>Shipment ID</th>
                <th>Origin</th>
                <th>Destination</th>
                <th>Status</th>
                <th>Created Date</th>
                <th>ETA</th>
                <th>Items</th>
                <th>Cost</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(shipment => (
                <tr key={shipment.id}>
                  <td>
                    <strong>{shipment.id}</strong>
                  </td>
                  <td>{shipment.origin}</td>
                  <td>{shipment.destination}</td>
                  <td>
                    <span 
                      className={`status-badge ${getStatusColor(shipment.status)}`}
                    >
                      {shipment.status}
                    </span>
                  </td>
                  <td>{shipment.created_date}</td>
                  <td>{shipment.eta}</td>
                  <td>{shipment.items_count}</td>
                  <td>₹{shipment.cost?.toLocaleString('en-IN')}</td>
                  <td>
                    <div className="actions">
                      <button className="btn-small btn-outline">Track</button>
                      <button className="btn-small btn-primary">Details</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shipments.length === 0 && !loading && (
        <div className="empty-state">
          <h3>No shipments found</h3>
          <p>Create your first shipment to start tracking deliveries</p>
          <button className="btn btn-primary">Create Shipment</button>
        </div>
      )}
    </div>
  );
};

export default Logistics;