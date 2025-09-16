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
    <div className="max-w-[1100px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
      <div className="mb-8 text-center">
        <h2 className="font-semibold text-[28px] mb-2">
          <i className="fas fa-truck mr-2 text-[--primary]"></i>
          Logistics Management
        </h2>
        <p className="text-[--muted-foreground] text-base">Track and manage your shipments and deliveries</p>
      </div>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <div className="text-center p-5 rounded-[var(--radius)] border border-[--border] bg-[--sidebar]">
          <div className="text-2xl text-[--primary] mb-2"><i className="fas fa-box"></i></div>
          <h3 className="text-[--foreground] font-medium mb-2">Total Shipments</h3>
          <div className="text-xl font-semibold text-[--foreground]">{shipments.length}</div>
        </div>

        <div className="text-center p-5 rounded-[var(--radius)] border border-[--border] bg-[--sidebar]">
          <div className="text-2xl text-[--chart-2] mb-2"><i className="fas fa-shipping-fast"></i></div>
          <h3 className="text-[--foreground] font-medium mb-2">In Transit</h3>
          <div className="text-xl font-semibold text-[--chart-2]">{shipments.filter(s => s.status === 'In Transit').length}</div>
        </div>

        <div className="text-center p-5 rounded-[var(--radius)] border border-[--border] bg-[--sidebar]">
          <div className="text-2xl text-[--chart-3] mb-2"><i className="fas fa-check-circle"></i></div>
          <h3 className="text-[--foreground] font-medium mb-2">Delivered</h3>
          <div className="text-xl font-semibold text-[--chart-3]">{shipments.filter(s => s.status === 'Delivered').length}</div>
        </div>

        <div className="text-center p-5 rounded-[var(--radius)] border border-[--border] bg-[--sidebar]">
          <div className="text-2xl text-[--primary] mb-2"><i className="fas fa-clock"></i></div>
          <h3 className="text-[--foreground] font-medium mb-2">Avg Delivery Time</h3>
          <div className="text-xl font-semibold text-[--foreground]">4.2 days</div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          <select className="px-3 py-2 rounded-md bg-[--sidebar] text-[--foreground] border border-[--border]">
            <option value="">All Shipments</option>
            <option value="processing">Processing</option>
            <option value="in-transit">In Transit</option>
            <option value="delivered">Delivered</option>
          </select>
          <input className="px-3 py-2 rounded-md bg-[--sidebar] text-[--foreground] border border-[--border] placeholder-[--muted-foreground]" type="text" placeholder="Search shipments..." />
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 rounded-md border border-[--border]">Export Data</button>
          <button className="px-4 py-2 rounded-md bg-[--primary] text-[--primary-foreground]">New Shipment</button>
        </div>
      </div>

      {loading ? (
        <div className="text-center p-8 text-[--muted-foreground]">Loading shipments...</div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[--border] shadow">
          <table className="min-w-full bg-[--sidebar]">
            <thead>
              <tr>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Shipment ID</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Origin</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Destination</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Status</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Created Date</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">ETA</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Items</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Cost</th>
                <th className="bg-[--muted] p-4 text-left font-semibold text-[--foreground] border-b border-[--border]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(shipment => (
                <tr key={shipment.id}>
                  <td className="p-4 border-b border-[--muted] text-[--foreground]"><strong>{shipment.id}</strong></td>
                  <td className="p-4 border-b border-[--muted] text-[--foreground]">{shipment.origin}</td>
                  <td className="p-4 border-b border-[--muted] text-[--foreground]">{shipment.destination}</td>
                  <td className="p-4 border-b border-[--muted]">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${getStatusColor(shipment.status) === 'green' ? 'bg-green-100 text-green-600' : getStatusColor(shipment.status) === 'blue' ? 'bg-blue-100 text-blue-600' : getStatusColor(shipment.status) === 'orange' ? 'bg-orange-100 text-orange-500' : 'bg-red-100 text-red-600'}`}>
                      {shipment.status}
                    </span>
                  </td>
                  <td className="p-4 border-b border-[--muted] text-[--foreground]">{shipment.created_date}</td>
                  <td className="p-4 border-b border-[--muted] text-[--foreground]">{shipment.eta}</td>
                  <td className="p-4 border-b border-[--muted] text-[--foreground]">{shipment.items_count}</td>
                  <td className="p-4 border-b border-[--muted] text-[--foreground]">₹{shipment.cost?.toLocaleString('en-IN')}</td>
                  <td className="p-4 border-b border-[--muted]">
                    <div className="flex gap-2">
                      <button className="px-3 py-1 rounded border text-sm">Track</button>
                      <button className="px-3 py-1 rounded bg-[--primary] text-[--primary-foreground] text-sm">Details</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {shipments.length === 0 && !loading && (
        <div className="text-center p-12 text-[--muted-foreground]">
          <h3 className="mb-2 text-[--foreground]">No shipments found</h3>
          <p className="mb-4">Create your first shipment to start tracking deliveries</p>
          <button className="px-6 py-3 rounded-md bg-[--primary] text-[--primary-foreground]">Create Shipment</button>
        </div>
      )}
    </div>
  );
};

export default Logistics;