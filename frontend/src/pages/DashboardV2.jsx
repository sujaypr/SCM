import React from 'react';
import '@fortawesome/fontawesome-free/css/all.min.css';
import useDashboard from '../hooks/useDashboard';

const Card = ({ icon, label, value, accent = 'text-[--primary]' }) => (
  <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border] shadow-[var(--shadow-sm)] flex items-center hover:shadow-[var(--shadow-md)] transition">
    <div className={`text-[2rem] ${accent} mr-4`}>{icon}</div>
    <div>
      <h3 className="text-2xl text-[--foreground] mb-1">{value}</h3>
      <p className="text-[--muted-foreground] text-sm">{label}</p>
    </div>
  </div>
);

const fmtINR = (n) => {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
  }
};

const DashboardV2 = () => {
  const { data, loading, error, connected, refresh } = useDashboard(1, 8);

  const inv = data?.inventory?.analytics || {};
  const lowStock = data?.inventory?.low_stock || [];
  const shipStats = data?.logistics?.stats || {};
  const recentShipments = data?.logistics?.recent || [];
  const nextFest = data?.forecast?.next_festival || null;
  const curSeason = data?.forecast?.current_season || null;
  const windowStart = data?.forecast?.window?.start || null;
  const windowEnd = data?.forecast?.window?.end || null;

  const lowCount = Array.isArray(lowStock) ? lowStock.length : 0;
  const categoryEntries = Object.entries(inv.category_breakdown || {}).sort((a,b)=>b[1].value - a[1].value).slice(0,5);

  return (
    <div className="max-w-[1200px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="text-left">
          <h2 className="flex items-center gap-2 text-2xl font-semibold text-[--foreground] mb-1">
            <i className="fas fa-gauge text-[--primary]"></i>
            Real-time Dashboard
          </h2>
          <p className="text-[--muted-foreground] text-base">Unified view across Inventory, Logistics, and Demand</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="px-3 py-2 rounded-md bg-[--primary] text-white text-sm hover:opacity-90">Refresh</button>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${connected ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            {connected ? 'Live' : 'Polling'}
          </span>
        </div>
      </div>

      {loading && (
        <div className="bg-[--sidebar] border border-[--border] rounded-[var(--radius)] p-8 text-center text-[--muted-foreground]">Loading real-time data…</div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-[var(--radius)] p-4 text-red-700 mb-4">{error}</div>
      )}

      {!loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card icon={<i className="fas fa-box"></i>} label="Total Items" value={inv.total_items ?? 0} accent="text-[--chart-1]" />
            <Card icon={<i className="fas fa-bell"></i>} label="Reorder Alerts" value={inv.reorder_alerts ?? lowCount} accent="text-[--chart-4]" />
            <Card icon={<i className="fas fa-truck"></i>} label="In Transit" value={shipStats.in_transit ?? 0} accent="text-[--primary]" />
            <Card icon={<i className="fas fa-check-circle"></i>} label="On-time Delivery" value={`${shipStats.on_time_rate ?? 0}%`} accent="text-emerald-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[--foreground]">Inventory by Category</h3>
                <span className="text-xs text-[--muted-foreground]">Top 5</span>
              </div>
              <div className="space-y-3">
                {categoryEntries.length === 0 && (
                  <div className="text-[--muted-foreground] text-sm">No data</div>
                )}
                {categoryEntries.map(([cat, v]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <div className="text-[--foreground] text-sm font-medium">{cat}</div>
                    <div className="text-[--muted-foreground] text-sm">{fmtINR(v.value)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border] lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[--foreground]">Low Stock</h3>
                <span className="text-xs text-[--muted-foreground]">{lowCount} items</span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-[--muted-foreground]">
                    <tr>
                      <th className="text-left font-medium py-2 pr-4">Item</th>
                      <th className="text-left font-medium py-2 pr-4">SKU</th>
                      <th className="text-left font-medium py-2 pr-4">Stock</th>
                      <th className="text-left font-medium py-2 pr-4">Min</th>
                      <th className="text-left font-medium py-2 pr-4">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lowStock.slice(0,8).map((it) => (
                      <tr key={it.id} className="border-t border-[--border]">
                        <td className="py-2 pr-4 text-[--foreground]">{it.name}</td>
                        <td className="py-2 pr-4 text-[--muted-foreground]">{it.sku}</td>
                        <td className="py-2 pr-4">{it.current_stock}</td>
                        <td className="py-2 pr-4">{it.min_stock_level}</td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${it.status === 'critical' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>{it.status}</span>
                        </td>
                      </tr>
                    ))}
                    {lowCount === 0 && (
                      <tr>
                        <td colSpan={5} className="py-4 text-[--muted-foreground]">All good. No low stock alerts.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border]">
              <h3 className="text-lg font-semibold text-[--foreground] mb-1">Upcoming</h3>
              <p className="text-[--muted-foreground] text-sm mb-2">Festivals and current season impact</p>
              <p className="text-[--muted-foreground] text-xs mb-4">
                Window: {windowStart ? new Date(windowStart).toLocaleDateString() : '—'} – {windowEnd ? new Date(windowEnd).toLocaleDateString() : '—'}
              </p>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[--muted-foreground] min-w-[100px]">Next Festival</span>
                  <span className="text-sm text-[--foreground] font-medium">
                    {nextFest ? `${nextFest.label} (${nextFest.daysAway}d)` : 'None'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[--muted-foreground] min-w-[100px]">Season</span>
                  <span className="text-sm text-[--foreground] font-medium">{curSeason ? curSeason.name : 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="bg-[--sidebar] p-6 rounded-[var(--radius)] border border-[--border] lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-[--foreground]">Recent Shipments</h3>
                  <p className="text-[--muted-foreground] text-sm">Total: {shipStats.total_shipments ?? 0} • Avg delivery: {shipStats.avg_delivery_time_days ?? 0}d</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-[--muted-foreground]">
                    <tr>
                      <th className="text-left font-medium py-2 pr-4">ID</th>
                      <th className="text-left font-medium py-2 pr-4">Route</th>
                      <th className="text-left font-medium py-2 pr-4">Status</th>
                      <th className="text-left font-medium py-2 pr-4">ETA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentShipments.map((s) => (
                      <tr key={s.id} className="border-t border-[--border]">
                        <td className="py-2 pr-4 text-[--foreground]">{s.id}</td>
                        <td className="py-2 pr-4 text-[--muted-foreground]">{s.origin} → {s.destination}</td>
                        <td className="py-2 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            s.status === 'Delivered' ? 'bg-green-100 text-green-600' :
                            s.status === 'In Transit' ? 'bg-blue-100 text-blue-600' :
                            s.status === 'Processing' ? 'bg-gray-100 text-gray-600' :
                            s.status === 'Delayed' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                          }`}>{s.status}</span>
                        </td>
                        <td className="py-2 pr-4">{s.eta || '-'}</td>
                      </tr>
                    ))}
                    {recentShipments.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-4 text-[--muted-foreground]">No shipments found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardV2;
